// MCP(Model Context Protocol) 호스트 — Schutz가 직접 MCP stdio 서버를 spawn하고
// JSON-RPC(줄바꿈 구분)로 대화한다. LSP 브리지(lsp.cjs)의 프로세스 생명주기를 따르되,
// 프레이밍은 Content-Length가 아니라 newline-delimited JSON (MCP stdio 규약).
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
const os = require("os");

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();

/** 실행 중 서버: name → { child, tools, seq, pending:Map, buf, ready } */
const servers = new Map();

// ── 설정 스토어 (userData/mcp.json) — claude/codex 호환 스키마 ──
function cfgPath() { return path.join(app.getPath("userData"), "mcp.json"); }
function readCfg() {
  let raw;
  try { raw = fs.readFileSync(cfgPath(), "utf8"); }
  catch { return { mcpServers: {} }; } // 파일 없음 → 새 설정(쓰기 안전)
  try { const c = JSON.parse(raw); return c && c.mcpServers ? c : { mcpServers: {} }; }
  catch {
    // 파일은 있으나 파싱 불가 — 빈 설정으로 덮어써 사용자 서버 전체가 유실되지 않도록 예외 전파(쓰기 중단).
    // 손상본은 .bak 으로 1회 보존.
    try { const bak = cfgPath() + ".bak"; if (!fs.existsSync(bak)) fs.copyFileSync(cfgPath(), bak); } catch { /* */ }
    const err = new Error("mcp.json 손상(파싱 실패) — 자동 덮어쓰기 중단"); err.corrupt = true; throw err;
  }
}
// 원자적 쓰기 — 임시파일 후 rename(크래시/전원차단 시 반쪽 파일 방지). 실패는 상위로 전파(호출측이 ok:false 반환).
function writeCfg(c) {
  const p = cfgPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, p);
}

// ── 줄바꿈 JSON-RPC 파서 ──
const { StringDecoder } = require("string_decoder");
function makeLineParser(onMessage) {
  let buf = "";
  const dec = new StringDecoder("utf8"); // 청크 경계에 걸친 멀티바이트(한/일 등) 보존
  return (chunk) => {
    buf += typeof chunk === "string" ? chunk : dec.write(chunk);
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { onMessage(JSON.parse(line)); } catch { /* 로그/비JSON 줄 무시 */ }
    }
  };
}

function sendRpc(s, method, params, isNotification) {
  const msg = isNotification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++s.seq, method, params };
  try { s.child.stdin.write(JSON.stringify(msg) + "\n"); } catch { /* 종료됨 */ }
  return msg.id;
}
function request(s, method, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = sendRpc(s, method, params, false);
    const timer = setTimeout(() => { if (s.pending.has(id)) { s.pending.delete(id); reject(new Error(method + " 타임아웃")); } }, timeoutMs);
    s.pending.set(id, { resolve, reject, timer });
  });
}

function killServer(name) {
  const s = servers.get(name);
  if (!s) return;
  servers.delete(name); // 먼저 맵에서 제거 → exit 핸들러의 정체성 검사가 재진입해도 no-op
  for (const [, p] of s.pending) { try { clearTimeout(p.timer); p.reject(new Error("서버 종료")); } catch { /* */ } }
  try {
    if (process.platform === "win32" && s.child.pid) {
      // shell:true 로 spawn 된 cmd.exe 래퍼의 자식(실제 서버)까지 트리 종료.
      // child.kill()은 래퍼만 죽여 npx/node 서버가 고아로 남아 포트·핸들 누수 → taskkill /T 로 트리 종료.
      execFile("taskkill", ["/pid", String(s.child.pid), "/T", "/F"], () => { try { s.child.kill(); } catch { /* */ } });
    } else {
      s.child.kill();
    }
  } catch { /* */ }
}

/** 서버 시작 + 핸드셰이크(initialize → initialized → tools/list). 반환: {ok, tools} | {ok:false, reason} */
async function startServer(name) {
  if (servers.has(name)) { const s = servers.get(name); return { ok: true, tools: s.tools }; }
  let cfg;
  try { cfg = readCfg().mcpServers[name]; } catch { return { ok: false, reason: "설정 파일(mcp.json) 손상" }; }
  if (!cfg || !cfg.command) return { ok: false, reason: "설정 없음" };
  let child;
  try {
    child = spawn(cfg.command, Array.isArray(cfg.args) ? cfg.args : [], {
      cwd: cfg.cwd || undefined,
      env: { ...process.env, ...(cfg.env || {}) },
      shell: process.platform === "win32", // npx.cmd 등 PATH 해석
      windowsHide: true,
    });
  } catch (err) { return { ok: false, reason: String(err && err.message || err) }; }

  const s = { child, tools: [], seq: 0, pending: new Map(), name };
  const parser = makeLineParser((msg) => {
    if (msg.id != null && s.pending.has(msg.id)) {
      const p = s.pending.get(msg.id); s.pending.delete(msg.id); clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || "RPC 오류"));
      else p.resolve(msg.result);
    }
    // 서버→클라 요청(sampling 등)은 현재 미지원 → 무시
  });
  child.stdout.on("data", parser);
  child.stderr.on("data", () => { /* MCP 서버 로그 — 소음 억제 */ });
  // 스트림 error 리스너 필수 — 서버가 죽은 뒤 stdin.write 시 async EPIPE 로 main 프로세스가 죽는 것 방지
  child.stdin.on("error", () => { /* EPIPE 등 무시 (write는 sendRpc의 try/catch로 이미 보호) */ });
  child.stdout.on("error", () => { /* */ });
  child.stderr.on("error", () => { /* */ });
  // 정체성 검사: 이 child(s)가 여전히 맵의 등록 서버일 때만 정리 → 정지 직후 재시작 시
  // 늦게 도착한 이전 프로세스의 exit/error 가 새 서버(s2)를 죽이는 레이스 방지
  child.on("exit", () => { if (servers.get(name) === s) killServer(name); });
  child.on("error", () => { if (servers.get(name) === s) killServer(name); });
  servers.set(name, s);

  try {
    await request(s, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Schutz", version: "0.0.3" },
    }, 20000);
    sendRpc(s, "notifications/initialized", {}, true);
    const listed = await request(s, "tools/list", {}, 15000).catch(() => ({ tools: [] }));
    s.tools = Array.isArray(listed && listed.tools) ? listed.tools : [];
    return { ok: true, tools: s.tools };
  } catch (err) {
    killServer(name);
    return { ok: false, reason: String(err && err.message || err) };
  }
}

// ── config.toml 최소 파서 ([mcp_servers.NAME] 섹션만) ──
function parseCodexMcp(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  let cur = null, curEnv = false;
  const strip = (v) => v.trim().replace(/^["']|["']$/g, "");
  for (let raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    let m = /^\[mcp_servers\.([A-Za-z0-9_-]+)\](?:\.(env))?\]?$/.exec(line) || /^\[mcp_servers\.([A-Za-z0-9_-]+)\.(env)\]$/.exec(line) || /^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/.exec(line);
    if (m) { const nm = m[1]; curEnv = m[2] === "env"; if (!out[nm]) out[nm] = { command: "", args: [], env: {} }; cur = out[nm]; continue; }
    if (!cur) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const key = kv[1], val = kv[2].trim();
    if (curEnv) { cur.env[key] = strip(val); continue; }
    if (key === "command") cur.command = strip(val);
    else if (key === "args") { try { cur.args = JSON.parse(val.replace(/'/g, '"')); } catch { cur.args = []; } }
  }
  return out;
}

function toList(obj, source) {
  return Object.entries(obj || {}).map(([name, c]) => ({
    name, source,
    command: c.command || (c.type === "http" ? "(http)" : ""),
    args: Array.isArray(c.args) ? c.args : [],
    env: c.env || {},
    url: c.url || null,
  }));
}

function init(ipcMain) {
  ipcMain.handle("schutz:mcpList", () => {
    let cfg;
    try { cfg = readCfg().mcpServers; } catch { return []; } // 손상 시 빈 목록(쓰기 없음 → 안전)
    return Object.entries(cfg).map(([name, c]) => {
      const s = servers.get(name);
      return { name, command: c.command, args: c.args || [], running: !!s, tools: s ? s.tools.length : 0 };
    });
  });
  ipcMain.handle("schutz:mcpStart", (_e, name) => startServer(name));
  ipcMain.handle("schutz:mcpStop", (_e, name) => { killServer(name); return { ok: true }; });
  ipcMain.handle("schutz:mcpTools", (_e, name) => { const s = servers.get(name); return s ? s.tools : []; });
  ipcMain.handle("schutz:mcpAllTools", () => {
    const out = [];
    for (const [name, s] of servers) for (const t of s.tools) out.push({ server: name, ...t });
    return out;
  });
  ipcMain.handle("schutz:mcpCall", async (_e, name, tool, args) => {
    const s = servers.get(name);
    if (!s) return { ok: false, error: "서버가 실행 중이 아닙니다" };
    try {
      const r = await request(s, "tools/call", { name: tool, arguments: args || {} }, 120000);
      return { ok: true, result: r };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
  ipcMain.handle("schutz:mcpAdd", (_e, name, cfg) => {
    // 첫 글자 영숫자 강제 → '.'·'..' 등 경로 탈출/특수 이름 차단
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return { ok: false, error: "잘못된 이름" };
    if (!cfg || typeof cfg.command !== "string" || !cfg.command) return { ok: false, error: "command 필요" };
    let c;
    try { c = readCfg(); } catch { return { ok: false, error: "설정 파일(mcp.json) 손상 — 덮어쓰기 중단. mcp.json.bak 참조" }; }
    // 동명 서버 조용한 덮어쓰기 방지(import/생성 slug 충돌 시 남의 config 유실). overwrite 명시해야 교체.
    if (c.mcpServers[name] && !cfg.overwrite) return { ok: false, exists: true, error: "이미 같은 이름의 서버가 있습니다" };
    if (c.mcpServers[name]) killServer(name); // 교체 시 실행 중 옛 인스턴스 종료 → 새 config/코드로 respawn(재생성 반영)
    c.mcpServers[name] = { command: cfg.command, args: Array.isArray(cfg.args) ? cfg.args : [], env: cfg.env || {}, cwd: cfg.cwd || undefined, transport: "stdio" };
    try { writeCfg(c); } catch (e) { return { ok: false, error: "설정 저장 실패: " + (e && e.message || e) }; }
    return { ok: true };
  });
  ipcMain.handle("schutz:mcpRemove", (_e, name) => {
    killServer(name);
    let c;
    try { c = readCfg(); } catch { return { ok: false, error: "설정 파일(mcp.json) 손상 — 덮어쓰기 중단. mcp.json.bak 참조" }; }
    delete c.mcpServers[name];
    try { writeCfg(c); } catch (e) { return { ok: false, error: "설정 저장 실패: " + (e && e.message || e) }; }
    return { ok: true };
  });
  ipcMain.handle("schutz:mcpDiscover", (_e, root) => {
    const found = [];
    // Claude Code (~/.claude.json): 전역 mcpServers + 프로젝트별
    try {
      const j = JSON.parse(fs.readFileSync(path.join(HOME, ".claude.json"), "utf8"));
      found.push(...toList(j.mcpServers, "claude:user"));
      if (root && j.projects) { const pk = Object.keys(j.projects).find(k => path.resolve(k) === path.resolve(root)); if (pk) found.push(...toList(j.projects[pk].mcpServers, "claude:project")); }
    } catch { /* */ }
    // 프로젝트 .mcp.json
    if (root) { try { const j = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8")); found.push(...toList(j.mcpServers, "mcp.json")); } catch { /* */ } }
    // Codex (~/.codex/config.toml)
    try { const t = fs.readFileSync(path.join(HOME, ".codex", "config.toml"), "utf8"); found.push(...toList(parseCodexMcp(t), "codex")); } catch { /* */ }
    // 이미 등록된 것 표시
    let have; try { have = new Set(Object.keys(readCfg().mcpServers)); } catch { have = new Set(); }
    return found.map(f => ({ ...f, added: have.has(f.name) }));
  });

  // ── 생성 지원 IPC ──
  // CLI 도구 --help 캡처 (명령명 검증 — 셸 메타·경로 금지)
  ipcMain.handle("schutz:cliHelp", (_e, cmd) => new Promise((resolve) => {
    if (typeof cmd !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(cmd)) return resolve({ ok: false, error: "잘못된 명령 이름" });
    let out = "";
    let p;
    try { p = spawn(cmd, ["--help"], { shell: process.platform === "win32", windowsHide: true }); }
    catch (err) { return resolve({ ok: false, error: String(err && err.message || err) }); }
    p.stdout.on("data", d => { out += d.toString(); });
    p.stderr.on("data", d => { out += d.toString(); }); // 많은 CLI가 help를 stderr로
    p.on("error", (err) => resolve({ ok: false, error: String(err && err.message || err) }));
    p.on("exit", () => resolve({ ok: true, text: out.slice(0, 24000) }));
    setTimeout(() => { try { p.kill(); } catch { /* */ } resolve({ ok: !!out, text: out.slice(0, 24000) }); }, 8000);
  }));
  // OpenAPI 스펙 가져오기 (https 전용, 스펙 전용 fetch — httpGet 호스트제한과 별개)
  ipcMain.handle("schutz:mcpFetchSpec", async (_e, url) => {
    let u; try { u = new URL(url); } catch { return { ok: false, error: "잘못된 URL" }; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "http(s)만 지원" };
    try {
      const r = await fetch(u.toString(), { headers: { accept: "application/json, application/yaml, text/yaml, */*" } });
      const text = await r.text();
      return { ok: r.ok, text: text.slice(0, 200000), status: r.status };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });
  // 생성된 MCP 서버 코드 기록 → userData/mcp-servers/<name>/server.cjs. 반환: 절대 경로
  ipcMain.handle("schutz:mcpWriteServer", (_e, name, code) => {
    // 첫 글자 영숫자 강제 → '.'·'..' 로 per-server 디렉터리 밖에 쓰는 경로 탈출 차단
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return { ok: false, error: "잘못된 이름" };
    if (typeof code !== "string" || !code.trim()) return { ok: false, error: "코드 없음" };
    try {
      const dir = path.join(app.getPath("userData"), "mcp-servers", name);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "server.cjs");
      fs.writeFileSync(file, code, "utf8");
      return { ok: true, path: file };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  // 앱 종료 시 모든 MCP 서버 정리
  app.on("before-quit", () => { for (const name of [...servers.keys()]) killServer(name); });
}

module.exports = { init };
