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
  return { root, name: path.basename(root), entries, truncated: entries.length >= MAX_ENTRIES };
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

let cliCmd = null; // 감지된 claude 실행 경로 (cliRun에서 재사용)

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
    p.on("exit", code => resolve(code === 0 && out.trim() ? out.trim() : null));
    setTimeout(() => { try { p.kill(); } catch {} resolve(null); }, 8000);
  });
}

ipcMain.handle("schutz:cliCheck", async () => {
  // GUI로 실행된 앱은 PATH가 좁을 수 있으므로 알려진 설치 경로도 직접 시도
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    "claude",
    home ? `"${path.join(home, ".local", "bin", "claude.exe")}"` : null,
    process.env.APPDATA ? `"${path.join(process.env.APPDATA, "npm", "claude.cmd")}"` : null,
    home ? `"${path.join(home, ".local", "bin", "claude")}"` : null,
  ].filter(Boolean);
  for (const cmd of candidates) {
    const v = await tryCli(cmd);
    if (v) {
      cliCmd = cmd;
      return { ok: true, version: v };
    }
  }
  cliCmd = null;
  return { ok: false };
});

ipcMain.on("schutz:cliRun", (e, opts) => {
  // opts: { cwd, prompt, resume }
  if (cliProcs.has(e.sender.id)) return;
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"];
  if (opts.resume) args.push("--resume", opts.resume);
  let proc;
  try {
    proc = spawn(cliCmd || "claude", args, { cwd: opts.cwd || undefined, shell: true, env: process.env });
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
      if (t && !e.sender.isDestroyed()) e.sender.send("schutz:cliEvent", t);
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
