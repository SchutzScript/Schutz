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

function createWindow() {
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

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
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
  await fs.writeFile(abs, content, "utf8");
  return true;
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
