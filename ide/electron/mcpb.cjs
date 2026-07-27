// MCP 번들(.mcpb / 옛 .dxt) 설치 — 파일을 끌어다 놓으면 MCP 서버가 된다.
//
// 번들은 manifest.json + 서버 코드가 든 zip 이다. 하는 일은 셋뿐이다:
//   1) 안전하게 푼다 (userData/mcpb/<이름>/)
//   2) 매니페스트를 읽어 "무엇을 실행할지" 를 돌려준다
//   3) 사용자가 채운 값으로 명령을 완성해 돌려준다 — 등록은 기존 mcpAdd 가 한다
//
// **매니페스트를 해석하는 규칙은 여기 없다.** src/engine/mcpb.ts 에 순수 함수로 있고
// vitest 가 덮는다. 남이 준 파일이 우리 기계에서 실행할 명령을 정하는 자리라, 그 규칙이
// 두 군데 있으면 설치 화면에 보여 준 것과 실제로 도는 것이 달라진다.
//
// 규칙을 CJS 에서 못 import 하므로(빌드 대상이 다르다) 이 파일은 **해석하지 않고**
// 매니페스트 원문을 그대로 렌더러에 넘긴다. 파싱·치환은 전부 렌더러가 한다.

const path = require("path");
const fs = require("fs");

let store = null;   // userData/mcpb

/** 한 번에 풀 수 있는 크기 상한 — zip 폭탄 방어. */
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** zip 안 경로가 풀어도 되는 것인가 — engine/mcpb.ts 의 safeZipEntry 와 같은 규칙.
 *  (거기 테스트가 있다. 여기서는 실제로 막는 쪽이라 한 번 더 둔다 — 이 판정이 뚫리면
 *   압축을 푸는 것만으로 홈 디렉터리가 덮인다.) */
function safeEntry(name) {
  if (!name || name.length > 512) return false;
  const p = String(name).replace(/\\/g, "/");
  if (p.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  if (p.includes("\0")) return false;
  return !p.split("/").some(seg => seg === "..");
}

function bundleDir(name) {
  if (!NAME_RE.test(String(name || ""))) throw new Error("잘못된 번들 이름입니다");
  return path.join(store, String(name));
}

/** zip 을 dest 에 푼다. 항목 하나라도 수상하면 통째로 접는다 — 절반만 푸는 게 제일 나쁘다. */
function extract(zipPath, dest) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) throw new Error("번들 안의 파일이 너무 많습니다");
  let total = 0;
  for (const e of entries) {
    if (!safeEntry(e.entryName)) throw new Error("번들에 이상한 경로가 들어 있습니다: " + e.entryName);
    total += e.header.size || 0;
    if (total > MAX_TOTAL_BYTES) throw new Error("번들을 풀면 너무 커집니다");
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const e of entries) {
    const rel = e.entryName.replace(/\\/g, "/");
    const abs = path.join(dest, rel);
    // 한 번 더 확인 — 이름이 아니라 **결과 경로**로 본다(정규화 뒤에도 밖이면 거부).
    const rootReal = path.resolve(dest);
    if (path.resolve(abs) !== rootReal && !path.resolve(abs).startsWith(rootReal + path.sep)) {
      throw new Error("번들이 설치 폴더 밖을 가리킵니다: " + e.entryName);
    }
    if (e.isDirectory) { fs.mkdirSync(abs, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, e.getData());
  }
}

/** manifest.json 을 찾는다. 루트에 있는 게 정석이지만 한 겹 감싼 번들도 흔하다. */
function findManifest(dir) {
  const direct = path.join(dir, "manifest.json");
  if (fs.existsSync(direct)) return { file: direct, base: dir };
  let subs = [];
  try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return null; }
  if (subs.length === 1) {
    const f = path.join(dir, subs[0].name, "manifest.json");
    if (fs.existsSync(f)) return { file: f, base: path.join(dir, subs[0].name) };
  }
  return null;
}

function init(ipcMain, deps) {
  store = path.join(deps.app.getPath("userData"), "mcpb");

  // 끌어다 놓기만으로는 있는 줄 모른다 — 고르는 길도 둔다.
  ipcMain.handle("schutz:mcpbPick", async (e) => {
    const { dialog, BrowserWindow } = require("electron");
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      title: "MCP 번들 고르기",
      properties: ["openFile"],
      filters: [{ name: "MCP 번들", extensions: ["mcpb", "dxt"] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return r.filePaths[0];
  });

  // 끌어다 놓은 파일을 임시 이름으로 풀고 매니페스트 **원문**을 돌려준다.
  // 아직 아무것도 등록하지 않는다 — 사용자가 무엇이 설치될지 보고 정한다.
  ipcMain.handle("schutz:mcpbOpen", async (_e, filePath) => {
    try {
      if (typeof filePath !== "string" || !filePath) return { ok: false, error: "파일 경로가 없습니다" };
      if (!/\.(mcpb|dxt)$/i.test(filePath)) return { ok: false, error: "MCP 번들(.mcpb) 파일이 아닙니다" };
      const st = fs.statSync(filePath);
      if (!st.isFile()) return { ok: false, error: "파일이 아닙니다" };

      fs.mkdirSync(store, { recursive: true });
      const staging = path.join(store, ".staging");
      extract(filePath, staging);
      const found = findManifest(staging);
      if (!found) return { ok: false, error: "번들 안에 manifest.json 이 없습니다" };
      let raw;
      try { raw = JSON.parse(fs.readFileSync(found.file, "utf8")); }
      catch (e) { return { ok: false, error: "manifest.json 을 읽지 못했습니다: " + (e && e.message) }; }
      return { ok: true, manifest: raw, staged: true, bytes: st.size };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  });

  // 확정 — 임시 폴더를 제 이름으로 옮긴다. 그 자리가 곧 `${__dirname}` 이 된다.
  ipcMain.handle("schutz:mcpbCommit", async (_e, name) => {
    try {
      const dest = bundleDir(name);
      const staging = path.join(store, ".staging");
      const found = findManifest(staging);
      if (!found) return { ok: false, error: "풀어 둔 번들이 없습니다. 다시 끌어다 놓아 주세요." };
      fs.rmSync(dest, { recursive: true, force: true });
      // 한 겹 감싼 번들이면 그 안쪽을 옮긴다 — `${__dirname}` 이 매니페스트 옆이어야 한다.
      fs.renameSync(found.base, dest);
      fs.rmSync(staging, { recursive: true, force: true });
      return { ok: true, dir: dest };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  });

  // 설치를 접었을 때 임시 폴더를 치운다.
  ipcMain.handle("schutz:mcpbDiscard", async () => {
    try { fs.rmSync(path.join(store, ".staging"), { recursive: true, force: true }); } catch { /* */ }
    return { ok: true };
  });

  // 번들로 깔린 것 목록 — MCP 서버 목록에 "번들에서 왔다" 를 표시하는 데 쓴다.
  ipcMain.handle("schutz:mcpbList", async () => {
    try {
      return fs.readdirSync(store, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("."))
        .map(d => d.name);
    } catch { return []; }
  });

  // 번들 폴더를 지운다. MCP 설정에서 빼는 것은 부르는 쪽(mcpRemove)이 한다.
  ipcMain.handle("schutz:mcpbRemove", async (_e, name) => {
    try {
      fs.rmSync(bundleDir(name), { recursive: true, force: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });
}

module.exports = { init };
