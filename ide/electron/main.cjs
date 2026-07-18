const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
try { require("./lsp.cjs").init(ipcMain); } catch (e) { console.error("LSP init failed:", e && e.message); }
try { require("./dap.cjs").init(ipcMain); } catch (e) { console.error("DAP init failed:", e && e.message); }
try { require("./extensions.cjs").init(ipcMain); } catch (e) { console.error("EXT init failed:", e && e.message); }
try { require("./mcp.cjs").init(ipcMain); } catch (e) { console.error("MCP init failed:", e && e.message); }

const DEV_URL = process.env.SCHUTZ_DEV_URL || "http://localhost:4322";
const isDev = !app.isPackaged;

/** 트리 스캔에서 제외할 디렉터리 */
const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "out", "release",
  ".next", ".astro", "__pycache__", ".venv", "venv", "target", ".idea", ".vscode-test",
]);
const MAX_ENTRIES = 4000;
const MAX_DEPTH = 8;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — 에디터로 열 상한

let winCounter = 0;
function createWindow(layout) {
  const winId = winCounter++;
  const win = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1400,
    minHeight: 800,
    backgroundColor: "#0C0E0D",
    title: "Schutz",
    icon: path.join(__dirname, "..", "public", "assets", "logo-t.png"),
    autoHideMenuBar: true, // 자체 메뉴바를 렌더러에 그리므로 OS 메뉴는 숨김
    // 커스텀 타이틀바 — 렌더러 헤더가 타이틀바를 겸한다 (VS Code 방식)
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#101312", symbolColor: "#9AA59C", height: 54 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // IDE: 창이 배경으로 가도 타이머·애니메이션·에이전트 턴을 멈추지 않는다
      // (기본값 true면 백그라운드에서 setTimeout/rAF/React 스케줄러가 스로틀돼 애니메이션·비동기 상태 반영이 지연됨)
      backgroundThrottling: false,
    },
  });

  const search = "win=" + winId + (layout ? "&layout=" + layout : "");
  const q = "?" + search;
  const loadDist = () =>
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { search });
  if (isDev) {
    // dev 서버가 죽어 있으면 빈 창 대신 빌드본으로 폴백
    win.webContents.once("did-fail-load", (_e, code) => {
      if (code === -102 /* CONNECTION_REFUSED */ || code === -105 || code === -106) void loadDist();
    });
    win.loadURL(DEV_URL + q).catch(() => void loadDist());
  } else {
    void loadDist();
  }

  // 외부 링크는 기본 브라우저로 — http/https/mailto 만 허용 (file: 등 위험 스킴 차단)
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const scheme = new URL(url).protocol;
      if (scheme === "http:" || scheme === "https:" || scheme === "mailto:") shell.openExternal(url);
    } catch { /* 잘못된 URL 무시 */ }
    return { action: "deny" };
  });
  // 내부 프레임이 외부 URL로 네비게이트하는 것도 차단
  win.webContents.on("will-navigate", (e, url) => {
    const here = isDev ? DEV_URL : "file://";
    if (!url.startsWith(here) && !url.startsWith("file://")) e.preventDefault();
  });
  return win;
}

// ── 파일 시스템 IPC ────────────────────────────────────────────────────────

/** 이번 세션에서 readTree 로 실제 연 워크스페이스 루트만 파일 IPC 대상으로 허용 (방어적 심화) */
const openedRoots = new Set();
function assertRoot(root) {
  if (typeof root !== "string" || !openedRoots.has(path.resolve(root))) {
    throw new Error("열려 있지 않은 워크스페이스 경로입니다");
  }
}

/** root 밖으로 나가는 경로(../ 등)를 차단한다. */
/** 존재하는 최근 조상까지 realpath 로 해석하고, 아직 없는 꼬리 경로는 그대로 이어붙인다. */
function realpathSafe(p) {
  const rfs = require("fs");
  let cur = p, suffix = "";
  for (;;) {
    try { return suffix ? path.join(rfs.realpathSync(cur), suffix) : rfs.realpathSync(cur); }
    catch {
      const parent = path.dirname(cur);
      if (parent === cur) return p; // 루트까지 해석 실패
      suffix = suffix ? path.join(path.basename(cur), suffix) : path.basename(cur);
      cur = parent;
    }
  }
}
function safeJoin(root, rel) {
  assertRoot(root);
  const abs = path.resolve(root, rel);
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new Error("워크스페이스 밖 경로는 접근할 수 없습니다: " + rel);
  }
  // 심볼릭 링크 이탈 방지 — 실제 경로(realpath)도 루트 안이어야 함
  const realRoot = realpathSafe(normRoot);
  const realAbs = realpathSafe(abs);
  if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) {
    throw new Error("심볼릭 링크가 워크스페이스 밖을 가리킵니다: " + rel);
  }
  return abs;
}

ipcMain.handle("schutz:openFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win, {
    title: "프로젝트 폴더 열기",
    properties: ["openDirectory"],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

ipcMain.handle("schutz:readTree", async (_e, root) => {
  if (typeof root !== "string" || !root) throw new Error("잘못된 경로");
  openedRoots.add(path.resolve(root)); // 이 루트에 대한 후속 파일 IPC 허용
  const entries = [];
  let depthCapped = false;
  async function walk(dirAbs, relBase, depth) {
    if (entries.length >= MAX_ENTRIES) return;
    if (depth > MAX_DEPTH) { depthCapped = true; return; } // 깊이 초과로 건너뛴 파일 존재 → truncated 로 표시
    let items;
    try {
      items = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const it of items) {
      if (entries.length >= MAX_ENTRIES) return;
      if (it.name.startsWith(".") && it.isDirectory() && it.name !== ".github") continue;
      if (it.isDirectory() && IGNORE_DIRS.has(it.name)) continue;
      const rel = relBase ? relBase + "/" + it.name : it.name;
      if (it.isDirectory()) {
        entries.push({ rel, name: it.name, dir: true, depth });
        await walk(path.join(dirAbs, it.name), rel, depth + 1);
      } else {
        entries.push({ rel, name: it.name, dir: false, depth });
      }
    }
  }
  await walk(root, "", 0);
  // 실제 git 브랜치 (.git/HEAD) — 없으면 null
  let branch = null;
  try {
    const head = await fs.readFile(path.join(root, ".git", "HEAD"), "utf8");
    const m = /ref: refs\/heads\/(.+)/.exec(head.trim());
    branch = m ? m[1] : head.trim().slice(0, 8);
  } catch { /* git 아님 */ }
  return { root, name: path.basename(root), entries, branch, truncated: entries.length >= MAX_ENTRIES || depthCapped };
});

ipcMain.handle("schutz:readFile", async (_e, root, rel) => {
  const abs = safeJoin(root, rel);
  const st = await fs.stat(abs);
  if (st.size > MAX_FILE_BYTES) {
    throw new Error("파일이 너무 큽니다 (" + Math.round(st.size / 1024) + " KB)");
  }
  return await fs.readFile(abs, "utf8");
});

ipcMain.handle("schutz:writeFile", async (_e, root, rel, content) => {
  const abs = safeJoin(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return true;
});

/** 이진 파일 추정 확장자 — 텍스트 검색에서 제외 */
const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg", "pdf", "zip", "gz", "tar", "rar", "7z",
  "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "mov", "avi", "webm", "wav", "exe", "dll",
  "so", "dylib", "class", "jar", "wasm", "bin", "lock",
]);

/** 프로젝트 전체 텍스트 검색 (대소문자 무시 부분 일치). readTree 워커 규칙 재사용 */
/** 아주 작은 glob → RegExp (**, *, ? 지원). 콤마 구분 다중 패턴. 매칭 없으면 null */
function globToMatcher(patterns) {
  const list = String(patterns || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length) return null;
  const res = list.map(p => {
    const rx = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, " ").replace(/\*/g, "[^/]*").replace(/ /g, ".*").replace(/\?/g, ".");
    return new RegExp("(^|/)" + rx + "$|^" + rx + "$");
  });
  return (rel) => res.some(r => r.test(rel));
}

/** 검색 매처 구성 (정규식/대소문자/단어) → (line) => {col} | null */
// 보수적 ReDoS 휴리스틱: 지수 백트래킹을 유발하는 중첩 수량자만 차단.
// 예) (a+)+ · (.*)* · (a|b+)* · (\w+)+{2,} — 그룹이 수량자를 품고 그룹 자체도 수량자로 반복되는 형태.
// 정상 정규식은 영향받지 않고, JS는 정규식 타임아웃이 없어 메인 프로세스 프리즈를 근본 차단할 수 없으므로 입력 단계에서 거른다.
function looksCatastrophic(src) {
  return /\([^)]*[+*][^)]*\)\s*[+*]/.test(src) || /\([^)]*[+*][^)]*\)\s*\{\d*,?\d*\}/.test(src);
}

function buildMatcher(query, opts) {
  const cs = !!opts?.caseSensitive, ww = !!opts?.wholeWord, rx = !!opts?.regex;
  if (rx) {
    if (looksCatastrophic(query)) return null; // 위험 패턴 거부(프리즈 방지)
    let re;
    try { re = new RegExp(ww ? "\\b(?:" + query + ")\\b" : query, cs ? "g" : "gi"); } catch { return null; }
    return (line) => { re.lastIndex = 0; const m = re.exec(line); return m ? { col: m.index + 1 } : null; };
  }
  const needle = cs ? query : query.toLowerCase();
  const isWord = (ch) => /[A-Za-z0-9_]/.test(ch);
  return (line) => {
    const hay = cs ? line : line.toLowerCase();
    let from = 0;
    while (true) {
      const i = hay.indexOf(needle, from);
      if (i < 0) return null;
      if (!ww) return { col: i + 1 };
      const before = i === 0 || !isWord(hay[i - 1]);
      const after = i + needle.length >= hay.length || !isWord(hay[i + needle.length]);
      if (before && after) return { col: i + 1 };
      from = i + 1;
    }
  };
}

ipcMain.handle("schutz:searchFiles", async (_e, root, query, opts) => {
  assertRoot(root);
  const q = String(query ?? "");
  const max = Math.min(Number(opts?.max) || 500, 2000);
  const hits = [];
  let truncated = false;
  if (q.length < 2) return { hits, truncated };
  const match = buildMatcher(q, opts);
  if (!match) return { hits, truncated, error: "정규식 오류" };
  const inc = globToMatcher(opts?.include);
  const exc = globToMatcher(opts?.exclude);

  // 1) 후보 파일 수집 (디렉터리 순회 — 저비용)
  const files = [];
  async function walk(dirAbs, relBase, depth) {
    if (depth > MAX_DEPTH) return;
    let items;
    try { items = await fs.readdir(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.isSymbolicLink()) continue; // 심볼릭 링크는 따라가지 않음(워크스페이스 밖 접근/쓰기 방지)
      if (it.name.startsWith(".") && it.isDirectory() && it.name !== ".github") continue;
      if (it.isDirectory() && IGNORE_DIRS.has(it.name)) continue;
      const rel = relBase ? relBase + "/" + it.name : it.name;
      if (it.isDirectory()) { await walk(path.join(dirAbs, it.name), rel, depth + 1); continue; }
      if (inc && !inc(rel)) continue;
      if (exc && exc(rel)) continue;
      const ext = (it.name.split(".").pop() || "").toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      files.push({ abs: path.join(dirAbs, it.name), rel });
    }
  }
  try { await walk(root, "", 0); } catch { /* ignore */ }

  // 2) 파일 매칭을 제한된 동시성으로 병렬 처리 (직렬 디스크 읽기 병목 제거)
  const processOne = async ({ abs, rel }) => {
    if (truncated) return;
    let st; try { st = await fs.stat(abs); } catch { return; }
    if (st.size > MAX_FILE_BYTES) return;
    let text; try { text = await fs.readFile(abs, "utf8"); } catch { return; }
    if (text.indexOf(String.fromCharCode(0)) >= 0) return; // NUL 포함 → 이진 파일
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (truncated) return;
      const m = match(lines[i]);
      if (!m) continue;
      const preview = lines[i].length > 200 ? lines[i].slice(0, 200) : lines[i];
      hits.push({ rel, line: i + 1, col: m.col, preview: preview.trim() });
      if (hits.length >= max) { truncated = true; return; }
    }
  };
  let idx = 0;
  const worker = async () => { while (idx < files.length && !truncated) { await processOne(files[idx++]); } };
  await Promise.all(Array.from({ length: Math.min(12, files.length) }, () => worker()));
  return { hits, truncated };
});

// ── Git 통합 ────────────────────────────────────────────────────────────────
const { execFile } = require("child_process");

/** git 하위 명령 실행 → { ok, stdout, stderr, code } */
/** git 브랜치 이름 검증 — 옵션 주입(선행 '-')·잘못된 ref 문자 차단 */
function validBranch(b) {
  if (typeof b !== "string" || !b || b.length > 255) return false;
  if (b.startsWith("-")) return false;                 // 옵션으로 해석되는 것 차단
  if (/[\s~^:?*\[\\]/.test(b)) return false;           // git ref 금지 문자
  if (b.includes("..") || b.endsWith("/") || b.endsWith(".lock")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(b)) return false;         // 제어 문자
  return true;
}

function git(root, args, input) {
  return new Promise((resolve) => {
    // core.quotepath=false → 비ASCII(한글·CJK·악센트) 경로를 8진 이스케이프+따옴표 없이 그대로 출력.
    // (기본값 true 면 status 경로가 "\355\225\234…" 로 망가져 파싱·스테이지·discard 가 실패)
    const child = execFile("git", ["-c", "core.quotepath=false", ...args], { cwd: root, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? (err ? String(err.message) : ""), code: err?.code ?? 0 });
      });
    if (input != null) { try { child.stdin.end(input); } catch { /* ignore */ } }
  });
}

/** git status --porcelain 파싱 → 스테이지/워킹/미추적 분류 */
function parseStatus(out) {
  const staged = [], unstaged = [], untracked = [];
  const lines = out.split("\n").filter(Boolean);
  for (const ln of lines) {
    const x = ln[0], y = ln[1];
    let p = ln.slice(3);
    // 리네임 "old -> new"
    const arrow = p.indexOf(" -> ");
    if (arrow >= 0) p = p.slice(arrow + 4);
    p = p.replace(/^"|"$/g, "");
    if (x === "?" && y === "?") { untracked.push({ path: p, code: "?" }); continue; }
    if (x !== " " && x !== "?") staged.push({ path: p, code: x });
    if (y !== " " && y !== "?") unstaged.push({ path: p, code: y });
  }
  return { staged, unstaged, untracked };
}

ipcMain.handle("schutz:git", async (_e, root, action, payload) => {
  if (!root) return { ok: false, error: "no root" };
  try { assertRoot(root); } catch { return { ok: false, error: "열려 있지 않은 워크스페이스" }; }
  try {
    // git 저장소 여부
    const inside = await git(root, ["rev-parse", "--is-inside-work-tree"]);
    if (!inside.ok) return { ok: false, notRepo: true, error: "git 저장소가 아닙니다" };

    if (action === "status") {
      const st = await git(root, ["status", "--porcelain"]);
      const br = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const branch = br.ok ? br.stdout.trim() : null;
      let ahead = 0, behind = 0, upstream = false;
      const lr = await git(root, ["rev-list", "--count", "--left-right", "@{u}...HEAD"]);
      if (lr.ok) { const m = /(\d+)\s+(\d+)/.exec(lr.stdout.trim()); if (m) { behind = +m[1]; ahead = +m[2]; upstream = true; } }
      return { ok: true, branch, ahead, behind, upstream, ...parseStatus(st.stdout) };
    }
    if (action === "headFile") {
      const r = await git(root, ["show", "HEAD:" + payload.path]);
      return { ok: true, content: r.ok ? r.stdout : "" }; // 새 파일이면 빈 문자열
    }
    if (action === "stagedFile") {
      // 인덱스(스테이지된) 버전 — 스테이지 diff의 '수정본' 쪽
      const r = await git(root, ["show", ":" + payload.path]);
      return { ok: true, content: r.ok ? r.stdout : "" };
    }
    if (action === "diffLines") {
      // --unified=0 으로 변경 라인 범위만 추출 (워킹트리 기준)
      const staged = payload.staged ? ["--cached"] : [];
      const r = await git(root, ["diff", "--unified=0", ...staged, "--", payload.path]);
      const added = [], removed = [];
      for (const ln of r.stdout.split("\n")) {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(ln);
        if (!m) continue;
        const oldCount = m[2] === undefined ? 1 : +m[2];
        const newStart = +m[3], newCount = m[4] === undefined ? 1 : +m[4];
        if (newCount > 0) added.push([newStart, newStart + newCount - 1, oldCount > 0]);
        else if (oldCount > 0) removed.push(newStart); // 삭제만 → 다음 라인 위 표시
      }
      return { ok: true, added, removed };
    }
    if (action === "stage") { const r = await git(root, ["add", "--", payload.path]); return { ok: r.ok, error: r.stderr }; }
    if (action === "stageAll") { const r = await git(root, ["add", "-A"]); return { ok: r.ok, error: r.stderr }; }
    if (action === "unstage") { const r = await git(root, ["reset", "-q", "HEAD", "--", payload.path]); return { ok: r.ok, error: r.stderr }; }
    if (action === "discard") {
      // 미추적이면 삭제, 추적 파일이면 checkout 복원
      if (payload.untracked) { try { await fs.rm(safeJoin(root, payload.path), { force: true, recursive: true }); } catch { /* */ } return { ok: true }; }
      const r = await git(root, ["checkout", "--", payload.path]);
      return { ok: r.ok, error: r.stderr };
    }
    if (action === "commit") {
      const msg = String(payload.message ?? "").trim();
      if (!msg) return { ok: false, error: "커밋 메시지가 비어 있습니다" };
      const r = await git(root, ["commit", "-m", msg]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout), output: r.stdout };
    }
    if (action === "push") {
      const args = payload?.setUpstream ? ["push", "-u", "origin", "HEAD"] : ["push"];
      const r = await git(root, args);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout), output: r.stdout + r.stderr };
    }
    if (action === "branches") {
      const r = await git(root, ["branch", "--format=%(refname:short)"]);
      const cur = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const list = r.ok ? r.stdout.split("\n").map(s => s.trim()).filter(Boolean) : [];
      return { ok: true, branches: list, current: cur.ok ? cur.stdout.trim() : null };
    }
    if (action === "checkout") {
      const b = String(payload.branch);
      if (!validBranch(b)) return { ok: false, error: "잘못된 브랜치 이름" };
      const r = await git(root, ["checkout", b]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout) };
    }
    if (action === "createBranch") {
      const b = String(payload.branch);
      if (!validBranch(b)) return { ok: false, error: "잘못된 브랜치 이름" };
      const r = await git(root, ["checkout", "-b", b]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout) };
    }
    if (action === "log") {
      const n = Math.min(Number(payload?.n) || 40, 200);
      const r = await git(root, ["log", "-n", String(n), "--pretty=format:%h\x1f%an\x1f%ar\x1f%s"]);
      const commits = r.ok ? r.stdout.split("\n").filter(Boolean).map(ln => {
        const [hash, author, date, subject] = ln.split("\x1f");
        return { hash, author, date, subject };
      }) : [];
      return { ok: true, commits };
    }
    if (action === "blame") {
      const r = await git(root, ["blame", "--line-porcelain", "--", String(payload.path)]);
      if (!r.ok) return { ok: false, error: r.stderr };
      const lines = [];
      let cur = null;
      for (const ln of r.stdout.split("\n")) {
        if (/^[0-9a-f]{40}\s/.test(ln)) { cur = { hash: ln.slice(0, 8) }; }
        else if (ln.startsWith("author ")) { if (cur) cur.author = ln.slice(7); }
        else if (ln.startsWith("summary ")) { if (cur) cur.summary = ln.slice(8); }
        else if (ln.startsWith("\t")) { if (cur) { lines.push(cur); cur = null; } }
      }
      return { ok: true, lines };
    }
    if (action === "stash") {
      const r = await git(root, payload?.includeUntracked ? ["stash", "push", "-u"] : ["stash", "push"]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout), output: r.stdout };
    }
    if (action === "stashPop") {
      const r = await git(root, ["stash", "pop"]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout), output: r.stdout };
    }
    if (action === "stashList") {
      const r = await git(root, ["stash", "list", "--pretty=format:%gd\x1f%s"]);
      const stashes = r.ok ? r.stdout.split("\n").filter(Boolean).map(ln => { const [ref, subject] = ln.split("\x1f"); return { ref, subject }; }) : [];
      return { ok: true, stashes };
    }
    if (action === "pull") {
      const r = await git(root, ["pull", "--ff-only"]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout), output: r.stdout + r.stderr };
    }
    if (action === "fetch") {
      const r = await git(root, ["fetch", "--all", "--prune"]);
      return { ok: r.ok, error: r.ok ? "" : (r.stderr || r.stdout), output: r.stdout + r.stderr };
    }
    return { ok: false, error: "알 수 없는 액션: " + action };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// 타이틀바 오버레이 색을 테마에 맞춰 갱신
ipcMain.on("schutz:setOverlay", (e, color, symbolColor) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  try { win?.setTitleBarOverlay({ color, symbolColor, height: 54 }); } catch { /* 미지원 무시 */ }
});

// 파일/폴더 이름 변경 · 삭제
ipcMain.handle("schutz:renameEntry", async (_e, root, relFrom, relTo) => {
  const from = safeJoin(root, relFrom);
  const to = safeJoin(root, relTo);
  if (path.resolve(from) !== path.resolve(to)) {
    // 대상이 이미 존재하면 덮어쓰기 금지 — POSIX rename 은 기존 파일을 조용히 파괴(데이터 손실).
    // 단 대소문자만 바뀐 동일 파일(케이스 무시 FS)은 realpath 비교로 허용.
    let exists = false;
    try { await fs.access(to); exists = true; } catch { /* 없음 */ }
    if (exists) {
      let same = false;
      try { same = (await fs.realpath(from)) === (await fs.realpath(to)); } catch { /* */ }
      if (!same) throw new Error("이미 같은 이름의 항목이 있습니다");
    }
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return true;
});

ipcMain.handle("schutz:deleteEntry", async (_e, root, rel) => {
  const abs = safeJoin(root, rel);
  await fs.rm(abs, { recursive: true, force: true });
  return true;
});

// 이미지 등 바이너리를 base64로 (미리보기용)
ipcMain.handle("schutz:readBinary", async (_e, root, rel) => {
  const abs = safeJoin(root, rel);
  const st = await fs.stat(abs);
  if (st.size > 8 * 1024 * 1024) throw new Error("파일이 너무 큽니다 (" + Math.round(st.size / 1024) + " KB)");
  const buf = await fs.readFile(abs);
  return buf.toString("base64");
});

// 새 폴더
ipcMain.handle("schutz:mkdir", async (_e, root, rel) => {
  const abs = safeJoin(root, rel);
  await fs.mkdir(abs, { recursive: true });
  return true;
});

// 탐색기(파일 매니저)에서 보기
ipcMain.handle("schutz:reveal", async (_e, root, rel) => {
  try { shell.showItemInFolder(safeJoin(root, rel)); return true; } catch { return false; }
});

// 파일 전체에서 찾아 바꾸기 → 치환된 개수·파일 수 (정규식/대소문자/단어/글롭 지원)
ipcMain.handle("schutz:replaceInFiles", async (_e, root, query, replacement, opts) => {
  assertRoot(root);
  if (!query || query.length < 1) return { changed: 0, files: 0 };
  const cs = !!opts?.caseSensitive, ww = !!opts?.wholeWord, rx = !!opts?.regex;
  if (rx && looksCatastrophic(query)) return { changed: 0, files: 0, error: "정규식 오류" }; // 위험 패턴 거부(프리즈 방지)
  let re;
  try {
    const pat = rx ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(ww ? "\\b(?:" + pat + ")\\b" : pat, cs ? "g" : "gi");
  } catch { return { changed: 0, files: 0, error: "정규식 오류" }; }
  const inc = globToMatcher(opts?.include);
  const exc = globToMatcher(opts?.exclude);
  let changed = 0, files = 0;
  async function walk(dirAbs, relBase, depth) {
    if (depth > MAX_DEPTH) return;
    let items;
    try { items = await fs.readdir(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.isSymbolicLink()) continue; // 심볼릭 링크는 따라가지 않음(워크스페이스 밖 접근/쓰기 방지)
      if (it.name.startsWith(".") && it.isDirectory() && it.name !== ".github") continue;
      if (it.isDirectory() && IGNORE_DIRS.has(it.name)) continue;
      const rel = relBase ? relBase + "/" + it.name : it.name;
      if (it.isDirectory()) { await walk(path.join(dirAbs, it.name), rel, depth + 1); continue; }
      if (inc && !inc(rel)) continue;
      if (exc && exc(rel)) continue;
      const ext = (it.name.split(".").pop() || "").toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      const abs = path.join(dirAbs, it.name);
      let st; try { st = await fs.stat(abs); } catch { continue; }
      if (st.size > MAX_FILE_BYTES) continue;
      let text; try { text = await fs.readFile(abs, "utf8"); } catch { continue; }
      if (text.indexOf(String.fromCharCode(0)) >= 0) continue;
      re.lastIndex = 0;
      const matches = text.match(re);
      if (!matches || !matches.length) continue;
      re.lastIndex = 0;
      // 정규식 모드만 $1/$& 등 지원; 리터럴 모드는 $ 를 이스케이프해 교체문자열의 $ 오해석로 인한 손상 방지
      const next = text.replace(re, rx ? replacement : replacement.replace(/\$/g, "$$$$"));
      await fs.writeFile(abs, next, "utf8");
      changed += matches.length; files++;
    }
  }
  try { await walk(root, "", 0); } catch { /* */ }
  return { changed, files };
});

// ── 새 창 ──────────────────────────────────────────────────────────────────
ipcMain.on("schutz:newWindow", () => {
  // 새 창은 VS Code처럼 가볍게 — 기본 1분할
  createWindow(1);
});

// ── Claude Code CLI 연동 (구독 계정 인증 사용, API 키 불필요) ──────────────
const cliProcs = new Map(); // webContents.id → child

const os = require("os");
const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();
const APPDATA = process.env.APPDATA || "";

// 구독 인증 CLI 에이전트 정의 — 각 벤더의 공식 에이전트를 그대로 구동한다 (권한·품질 무손실)
const CLI_DEFS = {
  claude: {
    candidates: ["claude", `"${path.join(HOME, ".local", "bin", "claude.exe")}"`, `"${path.join(APPDATA, "npm", "claude.cmd")}"`],
    login: null, // 감지된 명령 자체를 실행 (대화형 로그인 플로우)
    configDir: path.join(HOME, ".claude"),
  },
  codex: {
    candidates: ["codex", `"${path.join(APPDATA, "npm", "codex.cmd")}"`, `"${path.join(HOME, ".local", "bin", "codex.exe")}"`],
    login: "login",
    configDir: path.join(HOME, ".codex"),
  },
};
const cliCmds = {}; // id → 감지된 실행 명령

function tryCli(cmd) {
  return new Promise(resolve => {
    let p;
    try {
      p = spawn(cmd, ["--version"], { shell: true });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    p.stdout.on("data", d => { out += d.toString(); });
    p.on("error", () => resolve(null));
    p.on("exit", code => resolve(code === 0 && out.trim() ? out.trim().split(/\r?\n/)[0] : null));
    setTimeout(() => { try { p.kill(); } catch {} resolve(null); }, 8000);
  });
}

ipcMain.handle("schutz:cliCheck", async () => {
  const agents = {};
  for (const [id, def] of Object.entries(CLI_DEFS)) {
    let ok = false, version = "";
    for (const cmd of def.candidates) {
      const v = await tryCli(cmd);
      if (v) { ok = true; version = v; cliCmds[id] = cmd; break; }
    }
    if (!ok) delete cliCmds[id];
    let hasConfig = false;
    try { hasConfig = require("fs").existsSync(def.configDir); } catch {}
    agents[id] = { ok, version, hasConfig };
  }
  return { agents };
});

// Claude Code · Codex 커스텀 명령 발견 — 알려진 디렉터리만 스캔(임의 경로 없음).
//  ~/.claude/commands/**/*.md (user) · <root>/.claude/commands/**/*.md (project) → claude
//  ~/.codex/prompts/*.md (user) → codex
function parseCmdFile(content) {
  let description = "", argHint = "", body = content;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      const key = kv[1].toLowerCase(); let val = kv[2].trim().replace(/^["']|["']$/g, "");
      if (key === "description") description = val;
      else if (key === "argument-hint" || key === "argumenthint") argHint = val;
    }
  }
  return { description, argHint, body: body.trim() };
}
async function scanCmdDir(baseDir, origin, scope, out, prefix = "") {
  let entries;
  try { entries = await fs.readdir(baseDir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (origin === "claude") await scanCmdDir(path.join(baseDir, e.name), origin, scope, out, prefix + e.name + ":"); continue; }
    if (!e.name.endsWith(".md")) continue;
    const name = prefix + e.name.slice(0, -3);
    let content = "";
    try { content = await fs.readFile(path.join(baseDir, e.name), "utf8"); } catch { continue; }
    if (content.length > 200_000) continue;
    const p = parseCmdFile(content);
    out.push({ name, origin, scope, description: p.description, argHint: p.argHint, body: p.body });
  }
}
ipcMain.handle("schutz:agentCommands", async (_e, root) => {
  const out = [];
  await scanCmdDir(path.join(HOME, ".claude", "commands"), "claude", "user", out);
  if (root && typeof root === "string") await scanCmdDir(path.join(root, ".claude", "commands"), "claude", "project", out);
  await scanCmdDir(path.join(HOME, ".codex", "prompts"), "codex", "user", out);
  return { commands: out };
});

// 앱 내 [로그인] — 실제 콘솔 창을 띄워 해당 CLI의 공식 OAuth 로그인 플로우를 그대로 실행
ipcMain.on("schutz:cliLogin", (_e, id) => {
  const def = CLI_DEFS[id];
  if (!def) return;
  const base = cliCmds[id] || id;
  const cmdline = def.login ? `${base} ${def.login}` : base;
  try {
    spawn("cmd.exe", ["/c", "start", `Schutz - ${id} 로그인`, "cmd", "/k", cmdline], { detached: true });
  } catch { /* ignore */ }
});

ipcMain.on("schutz:cliRun", (e, opts) => {
  // opts: { agent, cwd, prompt, resume, continue }
  if (cliProcs.has(e.sender.id)) return;
  const agent = opts.agent || "claude";
  let args;
  let stdinPrompt = true;
  // 세션 id 형식만 허용 — shell:true 경유 명령줄에 렌더러 값이 주입되는 것을 차단
  const safeResume = typeof opts.resume === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(opts.resume) ? opts.resume : null;
  if (opts.resume && !safeResume) {
    e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_error", message: "잘못된 세션 id" }));
    return;
  }
  if (agent === "claude") {
    args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"];
    if (opts.continue) args.push("--continue");
    else if (safeResume) args.push("--resume", safeResume);
  } else if (agent === "codex") {
    // Codex CLI(ChatGPT 구독): exec 비대화 모드, 프롬프트는 stdin.
    // continue/resume 요청 시 최근 세션 이어가기(best-effort — 미지원 버전은 stderr로 실패 보고).
    if (opts.continue || safeResume) args = ["exec", "resume", "--last", "--skip-git-repo-check", "-"];
    else args = ["exec", "--skip-git-repo-check", "-"];
  } else {
    e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_error", message: "알 수 없는 CLI 에이전트: " + agent }));
    return;
  }
  let proc;
  try {
    proc = spawn(cliCmds[agent] || agent, args, { cwd: opts.cwd || undefined, shell: true, env: process.env });
  } catch (err) {
    e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_error", message: String(err.message) }));
    return;
  }
  cliProcs.set(e.sender.id, proc);
  proc.stdin.on("error", () => { /* EPIPE 등 — write 실패로 main 크래시 방지 */ });
  if (typeof opts.prompt === "string") proc.stdin.write(opts.prompt);
  proc.stdin.end();
  let buf = "";
  const sendLine = line => {
    const t = line.trim();
    if (!t || e.sender.isDestroyed()) return;
    if (agent === "claude") e.sender.send("schutz:cliEvent", t);
    else e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_raw", text: line }));
  };
  proc.stdout.on("data", d => {
    buf += d.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) sendLine(line);
  });
  proc.stdout.on("end", () => { if (buf) { sendLine(buf); buf = ""; } }); // 개행 없는 마지막 라인 flush(마지막 결과 유실 방지)
  proc.stderr.on("data", d => {
    const t = d.toString().trim();
    if (t && !e.sender.isDestroyed()) e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_stderr", message: t.slice(0, 400) }));
  });
  // exit 가 아니라 close(stdio 완전 배수 후) 에서 종료 통지 → 마지막 출력이 schutz_exit 뒤로 밀리지 않게
  proc.on("close", code => {
    // 정체성 확인 — stop→재실행 레이스에서 죽은 procA의 늦은 close가 새 procB 항목을 지우지 않도록
    if (cliProcs.get(e.sender.id) !== proc) return;
    cliProcs.delete(e.sender.id);
    if (buf) { sendLine(buf); buf = ""; } // end 미발생 안전망
    if (!e.sender.isDestroyed()) e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_exit", code }));
  });
  proc.on("error", err => {
    // 비동기 spawn 실패(ENOENT 등) → main 크래시 방지 + 렌더러에 통지
    if (cliProcs.get(e.sender.id) === proc) cliProcs.delete(e.sender.id);
    if (!e.sender.isDestroyed()) e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_error", message: String(err && err.message || err) }));
  });
});

// shell:true 로 spawn 된 CLI 는 Windows 에서 cmd.exe 래퍼가 proc → kill 은 래퍼만 죽이고
// 실제 claude/codex(node) 는 고아로 계속 실행(토큰·quota 소모, cwd 점유, 중지 불능). 트리 종료 필요.
function killProcTree(proc) {
  if (!proc) return;
  try {
    if (process.platform === "win32" && proc.pid) {
      execFile("taskkill", ["/pid", String(proc.pid), "/T", "/F"], () => { try { proc.kill("SIGKILL"); } catch { /* */ } });
    } else {
      proc.kill("SIGTERM");
    }
  } catch { /* */ }
}

ipcMain.on("schutz:cliStop", e => {
  const p = cliProcs.get(e.sender.id);
  if (p) { killProcTree(p); cliProcs.delete(e.sender.id); }
});

// ── 터미널 (진짜 PTY, 멀티 탭) ───────────────────────────────────────────────
// @lydell/node-pty(N-API 프리빌트, ConPTY) — 빌드툴 없이 로드. 실패 시 파이프 셸로 폴백.
let ptyMod = null;
try { ptyMod = require("@lydell/node-pty"); } catch (err) { console.error("node-pty load failed, falling back to pipe:", err && err.message); }
const shells = new Map(); // `${senderId}::${termId}` → { kind, write, resize, kill }
const shellKey = (senderId, termId) => senderId + "::" + (termId || "0");

ipcMain.handle("schutz:ptyReal", () => !!ptyMod);

ipcMain.on("schutz:termStart", (e, cwd, termId, cols, rows) => {
  const key = shellKey(e.sender.id, termId);
  if (shells.has(key)) return;
  const isWin = process.platform === "win32";
  const sh = isWin ? "powershell.exe" : process.env.SHELL || "bash";
  const env = { ...process.env, FORCE_COLOR: "1", CLICOLOR_FORCE: "1", TERM: "xterm-256color" };
  const sendRaw = d => { if (!e.sender.isDestroyed()) e.sender.send("schutz:termData", termId, typeof d === "string" ? d : d.toString()); };

  if (ptyMod) {
    let proc;
    try {
      proc = ptyMod.spawn(sh, isWin ? ["-NoLogo"] : [], { name: "xterm-256color", cols: cols || 80, rows: rows || 24, cwd: cwd || undefined, env });
    } catch (err) { sendRaw("PTY 시작 실패: " + err.message + "\r\n"); return; }
    const wrap = { kind: "pty", write: d => { try { proc.write(d); } catch { /* */ } }, resize: (c, r) => { try { proc.resize(c, r); } catch { /* */ } }, kill: () => { try { proc.kill(); } catch { /* */ } } };
    proc.onData(sendRaw);
    // 정체성 확인 — kill→재시작 레이스에서 죽은 셸의 늦은 exit가 새 셸 항목을 지우거나
    // 종료 배너를 같은 id의 새 터미널에 흘려보내지 않도록(배너 send도 가드 안으로)
    proc.onExit(({ exitCode }) => { if (shells.get(key) !== wrap) return; shells.delete(key); if (!e.sender.isDestroyed()) e.sender.send("schutz:termData", termId, `\r\n[셸 종료: ${exitCode}]\r\n`); });
    shells.set(key, wrap);
    return;
  }

  // 폴백: 라인버퍼 파이프 셸(에코 없음 — 프론트가 로컬 라인 편집)
  let proc;
  try { proc = spawn(sh, isWin ? ["-NoLogo"] : ["-i"], { cwd: cwd || undefined, env }); }
  catch (err) { sendRaw("셸 시작 실패: " + err.message + "\r\n"); return; }
  const wrap = { kind: "pipe", write: line => { try { proc.stdin.write(line + "\n"); } catch { /* */ } }, resize: () => { }, kill: () => { try { proc.kill(); } catch { /* */ } } };
  const norm = d => sendRaw(d.toString().replace(/\r?\n/g, "\r\n"));
  proc.stdout.on("data", norm);
  proc.stderr.on("data", norm);
  proc.stdin.on("error", () => { /* EPIPE 무시 */ });
  proc.on("error", () => { if (shells.get(key) === wrap) shells.delete(key); });
  proc.on("exit", code => { if (shells.get(key) !== wrap) return; shells.delete(key); if (!e.sender.isDestroyed()) e.sender.send("schutz:termData", termId, `\r\n[셸 종료: ${code}]\r\n`); });
  shells.set(key, wrap);
});

ipcMain.on("schutz:termInput", (e, data, termId) => {
  const p = shells.get(shellKey(e.sender.id, termId));
  if (p) p.write(data);
});

ipcMain.on("schutz:termResize", (e, termId, cols, rows) => {
  const p = shells.get(shellKey(e.sender.id, termId));
  if (p) p.resize(cols, rows);
});

ipcMain.on("schutz:termKill", (e, termId) => {
  const key = shellKey(e.sender.id, termId);
  const p = shells.get(key);
  if (p) { p.kill(); shells.delete(key); }
});

// 렌더러 재로드 시 정리: 현재 살아있는 termId 목록에 없는 이 렌더러의 셸을 종료(고아 PTY 누수 방지).
// 리로드는 webContents를 파기하지 않아 언마운트 cleanup이 돌지 않으므로, 마운트 시 렌더러가 자기 탭 목록으로 조정.
ipcMain.on("schutz:termReconcile", (e, ids) => {
  const sid = e.sender.id;
  const prefix = sid + "::";
  const keep = new Set((Array.isArray(ids) ? ids : []).map(id => shellKey(sid, id)));
  for (const [key, p] of shells) {
    if (!key.startsWith(prefix) || keep.has(key)) continue; // 이 렌더러의, 목록에 없는 셸만
    try { p.kill(); } catch { /* */ }
    shells.delete(key);
  }
});

// ── 파일 워처 (외부 변경 감지) ──────────────────────────────────────────────
const watchers = new Map(); // webContents.id → { watcher, timer }

ipcMain.on("schutz:watchStart", (e, root) => {
  const wid = e.sender.id;
  // 기존 워처 정리
  const prev = watchers.get(wid);
  if (prev) { try { prev.watcher.close(); } catch { /* */ } clearTimeout(prev.timer); watchers.delete(wid); }
  if (!root) return;
  try { assertRoot(root); } catch { return; }
  let timer = null;
  let dirty = false;
  try {
    const watcher = fs.watch ? require("fs").watch(root, { recursive: true }, (_type, filename) => {
      if (filename) {
        const parts = String(filename).replace(/\\/g, "/").split("/");
        if (parts.some(seg => IGNORE_DIRS.has(seg))) return; // node_modules/.git 등 무시
      }
      dirty = true;
      const cur = watchers.get(wid);
      if (cur) {
        clearTimeout(cur.timer);
        cur.timer = setTimeout(() => { if (dirty && !e.sender.isDestroyed()) { dirty = false; e.sender.send("schutz:fsChange"); } }, 350);
      }
    }) : null;
    if (watcher) {
      watcher.on("error", () => { /* 워처 오류 무시 */ });
      watchers.set(wid, { watcher, timer });
    }
  } catch { /* recursive 미지원 등 — 워처 없이 진행 */ }
});

ipcMain.on("schutz:watchStop", (e) => {
  const w = watchers.get(e.sender.id);
  if (w) { try { w.watcher.close(); } catch { /* */ } clearTimeout(w.timer); watchers.delete(e.sender.id); }
});

app.on("web-contents-created", (_e, wc) => {
  wc.on("destroyed", () => {
    for (const [key, p] of [...shells.entries()]) {
      if (key.startsWith(wc.id + "::")) { try { p.kill(); } catch { /* */ } shells.delete(key); }
    }
    const w = watchers.get(wc.id);
    if (w) { try { w.watcher.close(); } catch { /* */ } clearTimeout(w.timer); watchers.delete(wc.id); }
    // CLI 자식 프로세스 정리 (orphan 방지) — Windows 는 트리 종료
    const cp = cliProcs.get(wc.id);
    if (cp) { killProcTree(cp); cliProcs.delete(wc.id); }
    // 소유 창이 사라진 AI 스트림 요청 중단
    for (const [rid, ac] of [...oaiRuns.entries()]) { if (ac._sid === wc.id) { try { ac.abort(); } catch { /* */ } oaiRuns.delete(rid); } }
    for (const [rid, ac] of [...anthRuns.entries()]) { if (ac._sid === wc.id) { try { ac.abort(); } catch { /* */ } anthRuns.delete(rid); } }
  });
  // 렌더러 재로드 시 destroyed 는 안 불린다(webContents 재사용) → 진행 중 AI 요청·CLI 를 여기서 중단.
  // (메인 프로세스 fetch 는 렌더러 리로드로 취소되지 않아 응답을 아무도 소비 못 하면서 토큰/quota 만 소모.)
  // 셸(PTY)은 termReconcile 로 별도 조정하므로 여기서 건드리지 않는다.
  wc.on("did-start-loading", () => {
    for (const [rid, ac] of [...oaiRuns.entries()]) { if (ac._sid === wc.id) { try { ac.abort(); } catch { /* */ } oaiRuns.delete(rid); } }
    for (const [rid, ac] of [...anthRuns.entries()]) { if (ac._sid === wc.id) { try { ac.abort(); } catch { /* */ } anthRuns.delete(rid); } }
    const cp = cliProcs.get(wc.id);
    if (cp) { killProcTree(cp); cliProcs.delete(wc.id); }
  });
});

app.whenReady().then(() => {
  createWindow();
  // 자동 업데이트 (패키징된 앱 + GitHub 릴리스 접근 가능할 때만 동작; 실패는 무시)
  if (!isDev) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch { /* electron-updater 미설치/실패 시 무시 */ }
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ══ 앱 내 직접 OAuth (PKCE) — 구독 계정 로그인 ═════════════════════════════
const crypto = require("crypto");
const http = require("http");

const b64url = buf => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const OAUTH = {
  claude: {
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    redirect: "https://console.anthropic.com/oauth/code/callback",
    scope: "org:create_api_key user:profile user:inference",
  },
  codex: {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    redirect: "http://localhost:1455/auth/callback",
    scope: "openid profile email offline_access",
  },
};
const oauthPending = {}; // id → { verifier, state }
let codexServer = null;

ipcMain.handle("schutz:oauthStart", async (e, id) => {
  const cfg = OAUTH[id];
  if (!cfg) return { ok: false, message: "지원하지 않는 프로바이더" };
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  // Claude 플로우는 state 슬롯에 PKCE verifier를 그대로 사용 (검증된 공개 구현과 동일)
  const state = id === "claude" ? verifier : b64url(crypto.randomBytes(16));
  oauthPending[id] = { verifier, state };

  const u = new URL(cfg.authUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirect);
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  if (id === "claude") u.searchParams.set("code", "true");
  if (id === "codex") {
    u.searchParams.set("id_token_add_organizations", "true");
    u.searchParams.set("codex_cli_simplified_flow", "true");
  }

  if (id === "codex") {
    // 로컬 콜백 서버 — 브라우저 승인 후 자동으로 코드 수신·교환
    try { if (codexServer) codexServer.close(); } catch {}
    codexServer = http.createServer(async (req, res) => {
      try {
        const ru = new URL(req.url, "http://localhost:1455");
        if (ru.pathname !== "/auth/callback") { res.writeHead(404); res.end(); return; }
        const code = ru.searchParams.get("code");
        // CSRF/로컬 임의 요청자 방지 — state 가 시작 시 발급한 값과 일치해야 함
        const gotState = ru.searchParams.get("state");
        const expState = oauthPending["codex"] && oauthPending["codex"].state;
        if (!code || !expState || gotState !== expState) { res.writeHead(400); res.end("invalid state"); return; }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<body style='font-family:sans-serif;background:#0C0E0D;color:#D5DAD5;display:flex;align-items:center;justify-content:center;height:100vh'>&#10003; 로그인 완료 — 이 창을 닫고 Schutz로 돌아가세요.</body>");
        const tok = await oauthExchange("codex", code, null);
        if (!e.sender.isDestroyed()) e.sender.send("schutz:oauthResult", JSON.stringify({ provider: "codex", ...tok }));
      } catch (err) {
        if (!e.sender.isDestroyed()) e.sender.send("schutz:oauthResult", JSON.stringify({ provider: "codex", ok: false, message: String(err && err.message || err) }));
      } finally {
        try { if (codexServer) codexServer.close(); } catch {}
        codexServer = null;
      }
    });
    const bound = await new Promise((res) => {
      codexServer.once("error", (err) => res({ ok: false, err }));
      codexServer.listen(1455, "127.0.0.1", () => res({ ok: true }));
    });
    if (!bound.ok) {
      // 바인드 실패(포트 1455 사용 중) → 콜백 서버 없음. 성공으로 위장하면 스피너가 영원히 돎 → 실패 반환.
      codexServer = null;
      return { ok: false, message: "포트 1455 를 사용할 수 없습니다(다른 Schutz 창/Codex CLI 실행 중일 수 있음). 닫고 다시 시도하세요." };
    }
    // 5분 후에도 미완료면 스피너가 영원히 돌지 않도록 실패 통지 후 정리
    setTimeout(() => { try { if (codexServer) { codexServer.close(); codexServer = null; if (!e.sender.isDestroyed()) e.sender.send("schutz:oauthResult", JSON.stringify({ provider: "codex", ok: false, message: "로그인 시간 초과" })); } } catch {} }, 5 * 60 * 1000);
  }

  shell.openExternal(u.toString());
  return { ok: true, mode: id === "claude" ? "paste" : "callback" };
});

async function oauthExchange(id, code, stateOverride) {
  const cfg = OAUTH[id];
  const pend = oauthPending[id];
  if (!pend) throw new Error("로그인 세션이 없습니다. [로그인]을 다시 눌러주세요.");
  const body = {
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirect,
    code_verifier: pend.verifier,
  };
  if (id === "claude") body.state = (stateOverride != null && stateOverride !== "") ? stateOverride : pend.verifier;
  const r = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("토큰 교환 실패 (" + r.status + "): " + text.slice(0, 200));
  const j = JSON.parse(text);
  // Codex: 토큰 JWT claim에서 ChatGPT 계정 ID 추출 (백엔드 호출에 필요)
  let accountId = null;
  if (id === "codex") {
    for (const tk of [j.id_token, j.access_token]) {
      if (accountId || !tk) continue;
      try {
        const payload = JSON.parse(Buffer.from(tk.split(".")[1], "base64url").toString("utf8"));
        const auth = payload["https://api.openai.com/auth"];
        if (auth && auth.chatgpt_account_id) accountId = auth.chatgpt_account_id;
      } catch { /* ignore */ }
    }
  }
  return {
    ok: true,
    access: j.access_token,
    refresh: j.refresh_token != null ? j.refresh_token : null,
    exp: Date.now() + (j.expires_in != null ? j.expires_in : 3600) * 1000,
    accountId,
  };
}

ipcMain.handle("schutz:oauthExchange", async (_e, id, pasted) => {
  try {
    let code = String(pasted).trim(), state = null;
    if (id === "claude" && code.includes("#")) {
      const i = code.indexOf("#");
      state = code.slice(i + 1).trim();
      code = code.slice(0, i).trim();
    }
    return await oauthExchange(id, code, state);
  } catch (err) {
    return { ok: false, message: String(err && err.message || err) };
  }
});

ipcMain.handle("schutz:oauthRefresh", async (_e, id, refreshToken) => {
  try {
    const cfg = OAUTH[id];
    const r = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId }),
    });
    const text = await r.text();
    // status 포함 반환 — 렌더러가 4xx(리프레시 토큰 폐기)와 네트워크 오류를 구분해 죽은 토큰만 정리하도록
    if (!r.ok) return { ok: false, status: r.status, message: "갱신 실패 (" + r.status + "): " + text.slice(0, 200) };
    const j = JSON.parse(text);
    return { ok: true, access: j.access_token, refresh: j.refresh_token != null ? j.refresh_token : refreshToken, exp: Date.now() + (j.expires_in != null ? j.expires_in : 3600) * 1000 };
  } catch (err) {
    return { ok: false, message: String(err && err.message || err) }; // 네트워크 등 — status 없음(일시적일 수 있어 토큰 유지)
  }
});

// ══ ChatGPT 구독(Codex 백엔드) SSE 릴레이 — 렌더러 CORS 우회용 ═══════════════
const oaiRuns = new Map(); // reqId → AbortController

ipcMain.on("schutz:oaiRun", async (e, opts) => {
  // opts: { id, access, accountId, body }
  const ac = new AbortController();
  ac._sid = e.sender.id;   // 창 종료 시 정리용 소유자 태그
  oaiRuns.set(opts.id, ac);
  const send = payload => {
    if (!e.sender.isDestroyed()) e.sender.send("schutz:oaiEvent", JSON.stringify({ id: opts.id, ...payload }));
  };
  try {
    const headers = {
      "content-type": "application/json",
      accept: "text/event-stream",
      authorization: "Bearer " + opts.access,
      "OpenAI-Beta": "responses=experimental",
      originator: "codex_cli_rs",
      session_id: opts.id,
    };
    if (opts.accountId) headers["chatgpt-account-id"] = opts.accountId;
    const r = await fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body),
      signal: ac.signal,
    });
    if (!r.ok || !r.body) {
      let detail = r.statusText;
      try { detail = (await r.text()).slice(0, 300); } catch {}
      send({ error: "ChatGPT 백엔드 오류 (" + r.status + "): " + detail });
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith("data:")) {
          const json = t.slice(5).trim();
          if (json && json !== "[DONE]") send({ data: json });
        }
      }
    }
  } catch (err) {
    if (!(err && err.name === "AbortError")) send({ error: String(err && err.message || err) });
  } finally {
    oaiRuns.delete(opts.id);
    send({ done: true });
  }
});

ipcMain.on("schutz:oaiStop", (_e, id) => {
  const ac = oaiRuns.get(id);
  if (ac) ac.abort();
});

// ══ Anthropic(Claude) SSE 릴레이 — 렌더러 CORS 우회 (조직이 브라우저 CORS 차단) ═══
const anthRuns = new Map(); // reqId → AbortController

ipcMain.on("schutz:anthropicRun", async (e, opts) => {
  // opts: { id, headers, body }
  const ac = new AbortController();
  ac._sid = e.sender.id;   // 창 종료 시 정리용 소유자 태그
  anthRuns.set(opts.id, ac);
  const send = payload => {
    if (!e.sender.isDestroyed()) e.sender.send("schutz:anthropicEvent", JSON.stringify({ id: opts.id, ...payload }));
  };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: opts.headers,
      body: JSON.stringify(opts.body),
      signal: ac.signal,
    });
    if (!r.ok || !r.body) {
      let detail = r.statusText;
      try { detail = (await r.text()).slice(0, 400); } catch {}
      send({ error: "Claude API 오류 (" + r.status + "): " + detail });
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const dataLine = part.split("\n").find(l => l.startsWith("data:"));
        if (dataLine) send({ data: dataLine.slice(5).trim() });
      }
    }
  } catch (err) {
    if (!(err && err.name === "AbortError")) send({ error: String(err && err.message || err) });
  } finally {
    anthRuns.delete(opts.id);
    send({ done: true });
  }
});

ipcMain.on("schutz:anthropicStop", (_e, id) => {
  const ac = anthRuns.get(id);
  if (ac) ac.abort();
});

// GET 프록시(렌더러 CORS 우회) — 신뢰된 모델 제공자 호스트로만 제한 (SSRF/자격증명 유출 방지)
const HTTPGET_HOSTS = new Set(["api.anthropic.com", "api.openai.com", "api.x.ai", "open.bigmodel.cn", "api.z.ai"]);
ipcMain.handle("schutz:httpGet", async (_e, url, headers) => {
  let u;
  try { u = new URL(url); } catch { return { ok: false, status: 0, error: "잘못된 URL" }; }
  if (u.protocol !== "https:" || !HTTPGET_HOSTS.has(u.hostname)) {
    return { ok: false, status: 0, error: "허용되지 않은 호스트: " + u.hostname };
  }
  try {
    const r = await fetch(u.toString(), { headers: headers || {} });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: String((e && e.message) || e) };
  }
});
