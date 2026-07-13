const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

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

function createWindow(layout) {
  const win = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1400,
    minHeight: 800,
    backgroundColor: "#0C0E0D",
    title: "Schutz",
    icon: path.join(__dirname, "..", "public", "assets", "logo-t.png"),
    autoHideMenuBar: true, // 자체 메뉴바를 렌더러에 그리므로 OS 메뉴는 숨김
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const q = layout ? "?layout=" + layout : "";
  if (isDev) {
    win.loadURL(DEV_URL + q);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), layout ? { search: "layout=" + layout } : undefined);
  }

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

// ── 파일 시스템 IPC ────────────────────────────────────────────────────────

/** root 밖으로 나가는 경로(../ 등)를 차단한다. */
function safeJoin(root, rel) {
  const abs = path.resolve(root, rel);
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new Error("워크스페이스 밖 경로는 접근할 수 없습니다: " + rel);
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
  const entries = [];
  async function walk(dirAbs, relBase, depth) {
    if (depth > MAX_DEPTH || entries.length >= MAX_ENTRIES) return;
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
  return { root, name: path.basename(root), entries, branch, truncated: entries.length >= MAX_ENTRIES };
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
  if (agent === "claude") {
    args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"];
    if (opts.continue) args.push("--continue");
    else if (opts.resume) args.push("--resume", opts.resume);
  } else if (agent === "codex") {
    // Codex CLI(ChatGPT 구독): exec 비대화 모드, 프롬프트는 stdin
    args = ["exec", "--skip-git-repo-check", "-"];
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
  proc.stdin.write(opts.prompt);
  proc.stdin.end();
  let buf = "";
  proc.stdout.on("data", d => {
    buf += d.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t || e.sender.isDestroyed()) continue;
      if (agent === "claude") {
        e.sender.send("schutz:cliEvent", t);
      } else {
        e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_raw", text: line }));
      }
    }
  });
  proc.stderr.on("data", d => {
    const t = d.toString().trim();
    if (t && !e.sender.isDestroyed()) e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_stderr", message: t.slice(0, 400) }));
  });
  proc.on("exit", code => {
    cliProcs.delete(e.sender.id);
    if (!e.sender.isDestroyed()) e.sender.send("schutz:cliEvent", JSON.stringify({ type: "schutz_exit", code }));
  });
});

ipcMain.on("schutz:cliStop", e => {
  const p = cliProcs.get(e.sender.id);
  if (p) { try { p.kill("SIGTERM"); } catch {} cliProcs.delete(e.sender.id); }
});

// ── 간이 터미널 (셸 프로세스 파이프 — PTY 아님, v1) ─────────────────────────
const shells = new Map(); // webContents.id → child process

ipcMain.on("schutz:termStart", (e, cwd) => {
  if (shells.has(e.sender.id)) return;
  const isWin = process.platform === "win32";
  const sh = isWin ? "powershell.exe" : process.env.SHELL || "bash";
  const args = isWin ? ["-NoLogo"] : [];
  let proc;
  try {
    proc = spawn(sh, args, { cwd: cwd || undefined, env: process.env });
  } catch (err) {
    e.sender.send("schutz:termData", "셸 시작 실패: " + err.message + "\n");
    return;
  }
  shells.set(e.sender.id, proc);
  const send = d => { if (!e.sender.isDestroyed()) e.sender.send("schutz:termData", d.toString()); };
  proc.stdout.on("data", send);
  proc.stderr.on("data", send);
  proc.on("exit", code => {
    shells.delete(e.sender.id);
    if (!e.sender.isDestroyed()) e.sender.send("schutz:termData", `\n[셸 종료: ${code}]\n`);
  });
});

ipcMain.on("schutz:termInput", (e, line) => {
  const p = shells.get(e.sender.id);
  if (p) p.stdin.write(line + "\n");
});

app.on("web-contents-created", (_e, wc) => {
  wc.on("destroyed", () => {
    const p = shells.get(wc.id);
    if (p) { p.kill(); shells.delete(wc.id); }
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
    await new Promise((res) => {
      codexServer.once("error", () => res());
      codexServer.listen(1455, "127.0.0.1", res);
    });
    setTimeout(() => { try { if (codexServer) { codexServer.close(); codexServer = null; } } catch {} }, 5 * 60 * 1000);
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
    if (!r.ok) throw new Error("갱신 실패 (" + r.status + "): " + text.slice(0, 200));
    const j = JSON.parse(text);
    return { ok: true, access: j.access_token, refresh: j.refresh_token != null ? j.refresh_token : refreshToken, exp: Date.now() + (j.expires_in != null ? j.expires_in : 3600) * 1000 };
  } catch (err) {
    return { ok: false, message: String(err && err.message || err) };
  }
});

// ══ ChatGPT 구독(Codex 백엔드) SSE 릴레이 — 렌더러 CORS 우회용 ═══════════════
const oaiRuns = new Map(); // reqId → AbortController

ipcMain.on("schutz:oaiRun", async (e, opts) => {
  // opts: { id, access, accountId, body }
  const ac = new AbortController();
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
