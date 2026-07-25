// Codex Cloud 위임 — 로컬 Codex CLI(`codex cloud …`)로 원격 태스크를 다룬다.
//  · dispatch : 프롬프트를 클라우드 샌드박스에 넘긴다(프롬프트는 stdin, argv 조립 금지)
//  · list     : 원격 태스크 목록(JSON)
//  · status   : 한 태스크 상태(텍스트)
//  · apply    : 완료된 태스크의 diff 를 로컬 워크스페이스로 당긴다
//  · stop     : 진행 중인 dispatch 프로세스 종료
//
// PR 은 Codex Cloud 가 직접 연다 — 우리는 gh/PR 경로를 만들지 않는다.
// 클라우드 환경(저장소 연결)이 미리 설정돼 있어야 하며, 없으면 stderr 로 감지해 사유를 돌려준다.
//
// 이 모듈은 자체 완결이다(main.cjs 내부에 손대지 않는다). main.cjs 는 require+init 한 줄만.

const { app } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const HOME = process.env.USERPROFILE || process.env.HOME || "";
const APPDATA = process.env.APPDATA || "";

// cliRun 의 codex 후보와 같은 목록 — .cmd 는 shell:true 로만 풀린다.
const CODEX_CANDIDATES = [
  "codex",
  `"${path.join(APPDATA, "npm", "codex.cmd")}"`,
  `"${path.join(HOME, ".local", "bin", "codex.exe")}"`,
];
let _codexCmd = null;      // 감지된 실행 명령(캐시). null=아직 못 찾음
let _codexProbed = false;

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;   // 태스크/환경 id — argv 에 넣기 전 반드시 통과

const cloudProcs = new Map();  // taskKey → 진행 중인 dispatch child (stop 용)

function tasksFile() {
  return path.join(app.getPath("userData"), "codexCloudTasks.json");
}
function readTasks() {
  try { const j = JSON.parse(fs.readFileSync(tasksFile(), "utf8")); return Array.isArray(j.tasks) ? j.tasks : []; }
  catch { return []; }
}
function writeTasks(tasks) {
  try { fs.writeFileSync(tasksFile(), JSON.stringify({ tasks }, null, 2)); } catch { /* 영속 실패는 치명적이지 않다 */ }
}
function upsertTask(rec) {
  const tasks = readTasks();
  const i = tasks.findIndex(t => t.id === rec.id);
  if (i >= 0) tasks[i] = { ...tasks[i], ...rec }; else tasks.unshift(rec);
  writeTasks(tasks.slice(0, 100));
}

/** codex 실행 명령 하나를 찾는다. 못 찾으면 null. */
function probeCodex() {
  if (_codexProbed) return _codexCmd;
  _codexProbed = true;
  for (const cmd of CODEX_CANDIDATES) {
    try {
      const r = require("child_process").spawnSync(cmd, ["--version"], { shell: true, timeout: 8000 });
      if (r.status === 0) { _codexCmd = cmd; break; }
    } catch { /* 다음 후보 */ }
  }
  return _codexCmd;
}

/** codex 를 한 번 돌린다. 신뢰 못 할 값은 argv 에 넣지 않는다 — 프롬프트는 input(stdin)으로,
 *  env/id 는 호출측에서 ID_RE 로 검증한 값만 넘긴다. */
function runCodex(args, opts = {}) {
  return new Promise(resolve => {
    const cmd = probeCodex();
    if (!cmd) { resolve({ ok: false, notInstalled: true, stdout: "", stderr: "codex CLI not found", code: -1 }); return; }
    let child;
    try {
      child = spawn(cmd, args, { cwd: opts.cwd || undefined, shell: true, env: process.env });
    } catch (e) {
      resolve({ ok: false, stdout: "", stderr: String(e && e.message || e), code: -1 }); return;
    }
    if (opts.trackKey) cloudProcs.set(opts.trackKey, child);
    let out = "", err = "", done = false;
    const finish = (res) => { if (done) return; done = true; if (opts.trackKey) cloudProcs.delete(opts.trackKey); resolve(res); };
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ ok: false, timedOut: true, stdout: out, stderr: err || "timed out", code: -1 }); }, opts.timeoutMs || 60000);
    child.stdin.on("error", () => { /* EPIPE 방지 */ });
    if (typeof opts.input === "string") { try { child.stdin.write(opts.input); } catch {} }
    try { child.stdin.end(); } catch {}
    child.stdout.on("data", d => { out += d.toString(); if (opts.onData) opts.onData(d.toString()); });
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("error", e => { clearTimeout(timer); finish({ ok: false, stdout: out, stderr: String(e && e.message || e), code: -1 }); });
    child.on("close", code => { clearTimeout(timer); finish({ ok: code === 0, stdout: out, stderr: err, code }); });
  });
}

/** stderr 를 보고 사유를 가른다 — 사용자에게 암호 같은 원문 대신 안내를 줄 수 있게. */
function classify(stderr) {
  const s = (stderr || "").toLowerCase();
  if (/no cloud environment|environment.*available|no environments|not.*configured/.test(s)) return "env-not-configured";
  if (/not logged in|log ?in|sign ?in|unauthor|auth|credential|token/.test(s)) return "auth-missing";
  return null;
}

/** dispatch 출력에서 태스크 id 를 뽑는다. task id 또는 태스크 URL 안의 마지막 조각. */
function extractTaskId(text) {
  const url = /https?:\/\/\S*?\/(?:tasks?|codex)\/([A-Za-z0-9._-]{6,128})/i.exec(text);
  if (url) return url[1];
  const tid = /\b(task[_-][A-Za-z0-9._-]{4,128})\b/i.exec(text);
  if (tid) return tid[1];
  const bare = /\bid[:=]\s*["']?([A-Za-z0-9._-]{8,128})/i.exec(text);
  if (bare) return bare[1];
  return null;
}

function init(ipcMain) {
  ipcMain.handle("schutz:codexCloud", async (e, action, payload) => {
    payload = payload || {};
    try {
      if (!probeCodex()) return { ok: false, reason: "not-installed" };

      if (action === "dispatch") {
        const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
        if (!prompt) return { ok: false, error: "빈 프롬프트" };
        const env = typeof payload.env === "string" ? payload.env.trim() : "";
        // exec 는 --env 가 필수다. 없으면 codex 가 clap 에러를 내므로, 미리 잘라 안내로 돌린다.
        if (!env) return { ok: false, reason: "env-not-configured" };
        if (!ID_RE.test(env)) return { ok: false, error: "잘못된 환경 id" };
        // env 는 검증된 값만 argv 로, 프롬프트는 stdin 으로.
        const args = ["cloud", "exec", "--env", env];
        const key = "dispatch:" + Date.now();
        const r = await runCodex(args, { input: prompt, cwd: payload.cwd, timeoutMs: 180000, trackKey: key });
        if (!r.ok) {
          if (r.notInstalled) return { ok: false, reason: "not-installed" };
          const reason = classify(r.stderr) || classify(r.stdout);
          return { ok: false, reason, error: (r.stderr || r.stdout || "dispatch 실패").slice(-600), timedOut: r.timedOut };
        }
        const id = extractTaskId(r.stdout) || extractTaskId(r.stderr);
        const rec = { id: id || key, prompt: prompt.slice(0, 300), env: env || null, status: "running", createdAt: Date.now(), raw: (r.stdout || "").slice(-600) };
        upsertTask(rec);
        return { ok: true, id: rec.id, task: rec, raw: rec.raw };
      }

      if (action === "list") {
        const r = await runCodex(["cloud", "list", "--json"], { timeoutMs: 30000 });
        let remote = [];
        if (r.ok) { try { const j = JSON.parse(r.stdout); if (Array.isArray(j.tasks)) remote = j.tasks; } catch { /* 형식 미상 */ } }
        return { ok: r.ok, remote, local: readTasks(), reason: r.ok ? null : classify(r.stderr) };
      }

      if (action === "status") {
        const id = String(payload.id || "");
        if (!ID_RE.test(id)) return { ok: false, error: "잘못된 태스크 id" };
        const r = await runCodex(["cloud", "status", id], { timeoutMs: 30000 });
        const text = (r.stdout || "") + (r.stderr || "");
        // 텍스트에서 종단 상태를 대충 읽는다(status 는 JSON 을 안 준다).
        let state = "running";
        if (/\b(completed|success|succeeded|done|ready|applied)\b/i.test(text)) state = "done";
        else if (/\b(failed|error|cancell?ed|aborted)\b/i.test(text)) state = "failed";
        if (r.ok) upsertTask({ id, status: state });
        return { ok: r.ok, state, text: text.slice(-2000), reason: r.ok ? null : classify(r.stderr) };
      }

      if (action === "apply") {
        const id = String(payload.id || "");
        if (!ID_RE.test(id)) return { ok: false, error: "잘못된 태스크 id" };
        const r = await runCodex(["cloud", "apply", id], { cwd: payload.cwd, timeoutMs: 120000 });
        if (r.ok) upsertTask({ id, status: "applied" });
        return { ok: r.ok, output: ((r.stdout || "") + (r.stderr || "")).slice(-2000), reason: r.ok ? null : classify(r.stderr) };
      }

      if (action === "stop") {
        // 진행 중인 dispatch 프로세스를 끊는다(원격 태스크 자체는 클라우드에서 계속될 수 있다).
        let killed = 0;
        for (const [k, child] of cloudProcs) { try { child.kill(); killed++; } catch {} cloudProcs.delete(k); }
        if (payload.id && ID_RE.test(String(payload.id))) upsertTask({ id: String(payload.id), status: "stopped" });
        return { ok: true, killed };
      }

      if (action === "forget") {   // 로컬 목록에서만 지운다(원격 불변)
        const id = String(payload.id || "");
        writeTasks(readTasks().filter(t => t.id !== id));
        return { ok: true };
      }

      return { ok: false, error: "알 수 없는 action: " + action };
    } catch (e2) {
      return { ok: false, error: String(e2 && e2.message || e2) };
    }
  });
}

module.exports = { init };
