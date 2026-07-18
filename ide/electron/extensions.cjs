// Schutz 확장 호스트 (경량, 네이티브) — %APPDATA%/Schutz/extensions/<id>/ 스캔.
// 매니페스트(schutz-extension.json) + 엔트리 JS. 렌더러가 큐레이트 API로 로드.
const fs = require("fs");
const path = require("path");

function extDir(app) { return path.join(app.getPath("userData"), "extensions"); }
function stateFile(app) { return path.join(extDir(app), ".state.json"); }

/** 확장 id 검증 — 경로 구분자·'..' 금지 (슬러그만 허용) */
function validExtId(id) { return typeof id === "string" && /^[A-Za-z0-9._-]+$/.test(id) && id !== "." && id !== ".."; }

/** 확장 디렉터리 내부로 경로를 안전하게 해석. 이탈 시 throw.
 *  id 는 슬러그 검증, 최종 경로는 base 컨테인먼트(구분자 포함)로 확인. */
function safeExtPath(app, id, rel) {
  if (!validExtId(id)) throw new Error("잘못된 확장 id");
  const base = path.resolve(extDir(app), id);
  const full = path.resolve(base, rel || "");
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("경로 이탈");
  return full;
}

function readState(app) {
  try { return JSON.parse(fs.readFileSync(stateFile(app), "utf8")); } catch { return {}; }
}
function writeState(app, st) {
  try { fs.mkdirSync(extDir(app), { recursive: true }); fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2)); } catch { /* */ }
}

/** 첫 실행 시 샘플 확장 설치 (데모) */
function ensureSample(app) {
  const dir = path.join(extDir(app), "hello-schutz");
  const manifest = path.join(dir, "schutz-extension.json");
  if (fs.existsSync(manifest)) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({
      id: "hello-schutz", name: "Hello Schutz", version: "1.0.0",
      description: "샘플 확장 — 팔레트 커맨드 + 패널 기여 데모",
      main: "extension.js",
      contributes: { commands: [{ id: "hello.say", title: "Hello: 인사하기" }] },
    }, null, 2));
    fs.writeFileSync(path.join(dir, "extension.js"), `// Schutz 확장 엔트리 — activate(schutz) 를 export.
// schutz API: commands.register(id,title,fn), ui.showPanel(title,html), toast(kind,msg), getActiveFile()
exports.activate = function (schutz) {
  schutz.commands.register("hello.say", "Hello: 인사하기", function () {
    schutz.toast("ok", "안녕하세요! Schutz 확장이 동작합니다 👋");
    schutz.ui.showPanel("Hello", "<div style='padding:12px;font-family:sans-serif'>" +
      "<h3>Hello Schutz</h3><p>현재 파일: <code>" + (schutz.getActiveFile() || "(없음)") + "</code></p>" +
      "<p>이 패널은 확장이 기여했습니다.</p></div>");
  });
};
`);
  } catch { /* */ }
}

function scan(app) {
  const dir = extDir(app);
  const st = readState(app);
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const edir = path.join(dir, e.name);
    // 1) Schutz 네이티브 매니페스트
    const schutzMf = path.join(edir, "schutz-extension.json");
    if (fs.existsSync(schutzMf)) {
      try {
        const m = JSON.parse(fs.readFileSync(schutzMf, "utf8"));
        const id = m.id || e.name;
        out.push({ kind: "schutz", id, name: m.name || id, version: m.version || "0.0.0", description: m.description || "", main: m.main || "extension.js", contributes: m.contributes || {}, dir: edir, enabled: st[id] !== false, programmatic: true });
      } catch { /* */ }
      continue;
    }
    // 2) VS Code 확장 (package.json)
    const vscodeMf = path.join(edir, "package.json");
    if (fs.existsSync(vscodeMf)) {
      try {
        const m = JSON.parse(fs.readFileSync(vscodeMf, "utf8"));
        const id = (m.publisher ? m.publisher + "." : "") + (m.name || e.name);
        const contributes = m.contributes || {};
        // 프로그램형 판정: main(런타임 코드)이 있으면 vscode.* API 필요 → 미지원
        const programmatic = !!m.main;
        out.push({ kind: "vscode", id, name: m.displayName || m.name || e.name, version: m.version || "0.0.0", description: m.description || "", main: m.main || null, activationEvents: m.activationEvents || [], contributes, dir: edir, enabled: st[id] !== false, programmatic, engines: m.engines || {} });
      } catch { /* */ }
    }
  }
  return out;
}

/** https GET → Buffer (리다이렉트 추적) */
function httpsGetBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const MAX = 256 * 1024 * 1024; // 256MB 상한 — main 프로세스 메모리 고갈 방지
    const req = require("https").get(url, { headers: { "User-Agent": "Schutz-IDE" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(httpsGetBuffer(res.headers.location, redirects + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      if (+res.headers["content-length"] > MAX) { res.resume(); req.destroy(); return reject(new Error("응답이 너무 큽니다")); }
      const chunks = []; let total = 0;
      res.on("data", c => { total += c.length; if (total > MAX) { req.destroy(); return reject(new Error("응답이 너무 큽니다")); } chunks.push(c); });
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

/** .vsix 버퍼(ZIP) → extensions/<id>/ 에 extension/ 하위를 해제 */
function installVsixBuffer(app, buf) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(buf);
  const pkgEntry = zip.getEntry("extension/package.json");
  if (!pkgEntry) throw new Error("유효한 .vsix 아님 (extension/package.json 없음)");
  const pkg = JSON.parse(pkgEntry.getData().toString("utf8"));
  const id = (pkg.publisher ? pkg.publisher + "." : "") + pkg.name;
  if (!validExtId(id)) throw new Error("잘못된 확장 id: " + id);
  const target = path.resolve(extDir(app), id);
  // 임시 폴더에 먼저 해제 → 성공 시에만 기존 교체(추출 실패해도 기존 확장 보존)
  const tmp = target + ".tmp-" + process.pid + "-" + Date.now();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      // 정규화된 이름(백슬래시 → 슬래시)으로 판정
      const norm = entry.entryName.replace(/\\/g, "/");
      if (!norm.startsWith("extension/")) continue;
      const rel = norm.slice("extension/".length);
      if (!rel || rel.split("/").includes("..")) continue; // zip-slip 세그먼트 거부
      const dest = path.resolve(tmp, rel);
      // 컨테인먼트 확인 — tmp 밖으로 나가는 엔트리는 건너뜀
      if (dest !== tmp && !dest.startsWith(tmp + path.sep)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
    }
    try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* */ }
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    throw err;
  }
  return { id, name: pkg.displayName || pkg.name };
}

function init(ipcMain) {
  const { app, shell } = require("electron");
  ipcMain.handle("schutz:extList", () => { ensureSample(app); return scan(app); });
  ipcMain.handle("schutz:extReadEntry", (_e, id, main) => {
    // Node 모듈 해석 흉내 — "./dist/main" 처럼 확장자 없는 main 도 main.js/.cjs/index.js 로 해석
    const m = main || "extension.js";
    const cands = [m];
    if (!/\.[cm]?js$/.test(m)) cands.push(m + ".js", m + ".cjs", m + "/index.js", m + "/index.cjs");
    let lastErr = "엔트리 파일 없음";
    for (const c of cands) {
      try { return fs.readFileSync(safeExtPath(app, id, c), "utf8"); } catch (err) { lastErr = String(err && err.message || err); }
    }
    return { error: lastErr };
  });
  // 확장 디렉터리 내 임의 파일 읽기 (테마/스니펫/문법 JSON) — 경로 이탈 방지
  ipcMain.handle("schutz:extReadFile", (_e, id, relPath) => {
    try { return fs.readFileSync(safeExtPath(app, id, relPath), "utf8"); } catch (err) { return { error: String(err && err.message || err) }; }
  });
  // 바이너리(폰트/SVG) → base64 (아이콘 테마용)
  ipcMain.handle("schutz:extReadFileBase64", (_e, id, relPath) => {
    try { return fs.readFileSync(safeExtPath(app, id, relPath)).toString("base64"); } catch (err) { return { error: String(err && err.message || err) }; }
  });
  ipcMain.handle("schutz:extSetEnabled", (_e, id, enabled) => { const st = readState(app); st[id] = !!enabled; writeState(app, st); return { ok: true }; });
  ipcMain.handle("schutz:extOpenDir", () => { ensureSample(app); const d = extDir(app); try { fs.mkdirSync(d, { recursive: true }); } catch { /* */ } shell.openPath(d); return { ok: true }; });

  // Open VSX 검색
  ipcMain.handle("schutz:openVsxSearch", async (_e, query) => {
    try {
      const q = (query || "").trim();
      // 빈 쿼리면 인기 확장(다운로드순)을 보여줌 — VS Code 마켓처럼
      const url = q
        ? "https://open-vsx.org/api/-/search?query=" + encodeURIComponent(q) + "&size=30&sortBy=relevance"
        : "https://open-vsx.org/api/-/search?size=30&sortBy=downloadCount&sortOrder=desc";
      const buf = await httpsGetBuffer(url);
      const j = JSON.parse(buf.toString("utf8"));
      return {
        ok: true, extensions: (j.extensions || []).map(x => ({
          namespace: x.namespace, name: x.name, version: x.version,
          displayName: x.displayName || x.name, description: x.description || "",
          downloadCount: x.downloadCount || 0, rating: x.averageRating || 0,
          icon: (x.files && x.files.icon) || "",
        })),
      };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
  // Open VSX 상세 (메타데이터 + README)
  ipcMain.handle("schutz:openVsxDetail", async (_e, namespace, name) => {
    try {
      const metaBuf = await httpsGetBuffer(`https://open-vsx.org/api/${namespace}/${name}`);
      const m = JSON.parse(metaBuf.toString("utf8"));
      let readme = "";
      if (m.files && m.files.readme) {
        try { readme = (await httpsGetBuffer(m.files.readme)).toString("utf8"); } catch { /* README 없음 */ }
      }
      return {
        ok: true,
        detail: {
          namespace, name, version: m.version,
          displayName: m.displayName || name, description: m.description || "",
          downloadCount: m.downloadCount || 0, rating: m.averageRating || 0, reviewCount: m.reviewCount || 0,
          icon: (m.files && m.files.icon) || "",
          license: m.license || "", categories: m.categories || [], tags: (m.tags || []).slice(0, 12),
          repository: (m.files && m.files.repository) || m.repository || "",
          homepage: m.homepage || "",
          publishedBy: (m.publishedBy && m.publishedBy.loginName) || namespace,
          timestamp: m.timestamp || "",
          readme,
        },
      };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
  // Open VSX 설치
  ipcMain.handle("schutz:vsixInstallOpenVsx", async (_e, namespace, name) => {
    try {
      const metaBuf = await httpsGetBuffer(`https://open-vsx.org/api/${namespace}/${name}`);
      const meta = JSON.parse(metaBuf.toString("utf8"));
      const dl = meta.files && meta.files.download;
      if (!dl) return { ok: false, error: "다운로드 URL 없음" };
      const vsix = await httpsGetBuffer(dl);
      const r = installVsixBuffer(app, vsix);
      return { ok: true, ...r };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
  // 로컬 .vsix 설치
  ipcMain.handle("schutz:vsixInstallFile", async (_e, filePath) => {
    try { const buf = fs.readFileSync(filePath); const r = installVsixBuffer(app, buf); return { ok: true, ...r }; }
    catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
}

module.exports = { init };
