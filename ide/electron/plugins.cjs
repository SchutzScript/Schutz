// Claude Code 생태계 읽기 — 스킬(SKILL.md)과 플러그인 마켓플레이스.
//
// Schutz 는 이미 Claude Code 의 MCP 설정과 슬래시 명령을 읽어 온다(mcp.cjs · main.cjs).
// 여기서 마저 읽는 것은 두 가지다:
//   ⑴ 스킬 — SKILL.md 는 YAML 머리말 + 마크다운 지시문이다. **Claude API 기능이 아니라
//      프롬프트 묶음**이라 모델을 가리지 않는다. 그래서 Claude 든 GPT 든 똑같이 쓸 수 있다.
//   ⑵ 플러그인 마켓플레이스 — .claude-plugin/marketplace.json 이 카탈로그다. 플러그인 하나가
//      스킬·명령·MCP 서버를 함께 들고 온다.
//
// 본문(body)은 목록에 싣지 않는다. 스킬이 수십 개가 되면 프롬프트가 통째로 불어나므로,
// 목록에는 이름·설명만 주고 모델이 고른 것만 skillRead 로 읽어 간다(Claude Code 와 같은 방식).

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");

/** 아주 작은 YAML 머리말 파서 — 스킬 머리말은 스칼라와 문자열 배열뿐이라 이 정도면 충분하다.
 *  (js-yaml 을 새로 들이면 설치본이 커지고, 여기서 필요한 문법은 두 가지뿐이다.) */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);           // 배열 항목
    if (item && key) {
      if (!Array.isArray(meta[key])) meta[key] = [];
      meta[key].push(stripQuotes(item[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === "") { meta[key] = []; continue; }       // 다음 줄부터 배열
    if (val === "true" || val === "false") { meta[key] = val === "true"; continue; }
    // 인라인 배열 [a, b]
    if (/^\[.*\]$/.test(val)) { meta[key] = val.slice(1, -1).split(",").map(s => stripQuotes(s.trim())).filter(Boolean); continue; }
    meta[key] = stripQuotes(val);
  }
  return { meta, body: m[2] };
}
function stripQuotes(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** 한 디렉터리 아래의 <name>/SKILL.md 들을 읽는다. 본문은 싣지 않는다. */
function scanSkillsDir(dir, source, owner) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, "SKILL.md");
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    const { meta } = parseFrontmatter(text);
    const name = String(meta.name || e.name);
    out.push({
      id: (owner ? owner + ":" : "") + name,
      name,
      description: String(meta.description || ""),
      userInvocable: meta["user-invocable"] !== false,
      allowedTools: Array.isArray(meta["allowed-tools"]) ? meta["allowed-tools"] : [],
      source,                                   // user | project | plugin
      owner: owner || null,                     // 플러그인 이름(있으면)
      file,
    });
  }
  return out;
}

/** 활성화된 플러그인 목록 — Schutz 가 관리하는 파일. 없으면 빈 목록. */
function enabledPath() { return path.join(app.getPath("userData"), "plugins.json"); }
function readEnabled() {
  try { const j = JSON.parse(fs.readFileSync(enabledPath(), "utf8")); return Array.isArray(j.enabled) ? j.enabled : []; }
  catch { return []; }
}
function writeEnabled(list) {
  const p = enabledPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ enabled: list }, null, 2));
  fs.renameSync(tmp, p);
}

/** 로컬에 실제로 받아져 있는 플러그인 디렉터리들을 훑는다.
 *  마켓플레이스마다 plugins/ 와 external_plugins/ 두 갈래가 있다. */
function localPluginDirs() {
  const roots = [];
  const mkts = path.join(CLAUDE_DIR, "plugins", "marketplaces");
  let mk = [];
  try { mk = fs.readdirSync(mkts, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return roots; }
  for (const m of mk) {
    for (const sub of ["plugins", "external_plugins"]) {
      const base = path.join(mkts, m.name, sub);
      let ds = [];
      try { ds = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { continue; }
      for (const d of ds) roots.push({ marketplace: m.name, name: d.name, dir: path.join(base, d.name) });
    }
  }
  return roots;
}

/** 플러그인 하나가 들고 오는 것들 — 매니페스트 + 스킬/명령/MCP 유무. */
function readPlugin(p) {
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(p.dir, ".claude-plugin", "plugin.json"), "utf8")); } catch { /* 없어도 된다 */ }
  const skills = scanSkillsDir(path.join(p.dir, "skills"), "plugin", p.name);
  const commandsDir = path.join(p.dir, "commands");
  let commands = 0;
  try { commands = fs.readdirSync(commandsDir).filter(f => f.endsWith(".md")).length; } catch { /* */ }
  let mcp = false;
  for (const f of [".mcp.json", "mcp.json"]) { if (fs.existsSync(path.join(p.dir, f))) { mcp = true; break; } }
  return {
    name: manifest.name || p.name,
    description: manifest.description || "",
    version: manifest.version || "",
    keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
    marketplace: p.marketplace,
    dir: p.dir,
    skills: skills.length,
    commands,
    mcp,
    installed: true,
  };
}

/** 마켓플레이스 카탈로그(설치 안 된 것 포함) — .claude-plugin/marketplace.json */
function readCatalog() {
  const out = [];
  const mkts = path.join(CLAUDE_DIR, "plugins", "marketplaces");
  let mk = [];
  try { mk = fs.readdirSync(mkts, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return out; }
  for (const m of mk) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(mkts, m.name, ".claude-plugin", "marketplace.json"), "utf8")); } catch { continue; }
    for (const p of j.plugins || []) {
      out.push({
        name: p.name,
        description: p.description || "",
        author: (p.author && p.author.name) || "",
        category: p.category || "",
        homepage: p.homepage || "",
        marketplace: j.name || m.name,
        marketplaceOwner: (j.owner && j.owner.name) || "",
      });
    }
  }
  return out;
}

function init(ipcMain) {
  // 스킬 목록 — 사용자·프로젝트·활성 플러그인. 본문은 빼고 이름·설명만.
  ipcMain.handle("schutz:skillsList", (_e, root) => {
    try {
      const enabled = new Set(readEnabled());
      const skills = [
        ...scanSkillsDir(path.join(CLAUDE_DIR, "skills"), "user", null),
        ...(root ? scanSkillsDir(path.join(root, ".claude", "skills"), "project", null) : []),
      ];
      for (const p of localPluginDirs()) {
        if (!enabled.has(p.name)) continue;             // 켠 플러그인의 스킬만 노출한다
        skills.push(...scanSkillsDir(path.join(p.dir, "skills"), "plugin", p.name));
      }
      // 같은 id 가 겹치면 프로젝트 > 사용자 > 플러그인 순으로 앞의 것을 남긴다.
      const seen = new Set(); const uniq = [];
      for (const s of skills) { if (seen.has(s.id)) continue; seen.add(s.id); uniq.push(s); }
      return { ok: true, skills: uniq };
    } catch (e) { return { ok: false, error: String(e && e.message || e), skills: [] }; }
  });

  // 스킬 본문 — 모델이 고른 것만 이때 읽는다.
  ipcMain.handle("schutz:skillRead", (_e, file) => {
    try {
      // 스킬 파일만 읽게 못 박는다 — 경로를 그대로 믿고 아무 파일이나 열어 주면 안 된다.
      if (typeof file !== "string" || path.basename(file) !== "SKILL.md") return { ok: false, error: "스킬 파일이 아닙니다" };
      const real = fs.realpathSync(file);
      const allowed = [CLAUDE_DIR, app.getPath("userData")].map(d => { try { return fs.realpathSync(d); } catch { return d; } });
      // 프로젝트 스킬도 허용해야 하므로, 홈/.claude 밖이면 .claude/skills 경로 형태인지 본다.
      const ok = allowed.some(a => real.startsWith(a + path.sep)) || /[\\/]\.claude[\\/]skills[\\/]/.test(real);
      if (!ok) return { ok: false, error: "허용되지 않은 경로" };
      const text = fs.readFileSync(real, "utf8");
      const { meta, body } = parseFrontmatter(text);
      return { ok: true, name: meta.name || "", body: body.slice(0, 60000) };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  // 설치된 플러그인 + 카탈로그(창작마당) + 켜짐 상태
  ipcMain.handle("schutz:pluginList", () => {
    try {
      const enabled = new Set(readEnabled());
      const installed = localPluginDirs().map(readPlugin).map(p => ({ ...p, enabled: enabled.has(p.name) }));
      const byName = new Map(installed.map(p => [p.name, p]));
      const catalog = readCatalog().map(c => {
        const got = byName.get(c.name);
        return { ...c, installed: !!got, enabled: got ? got.enabled : false, skills: got ? got.skills : 0, commands: got ? got.commands : 0, mcp: got ? got.mcp : false };
      });
      // 카탈로그에 없지만 로컬에만 있는 것도 보여준다(외부 플러그인 등).
      for (const p of installed) if (!catalog.some(c => c.name === p.name)) catalog.push({ ...p, author: "", category: "", homepage: "", marketplaceOwner: "" });
      return { ok: true, plugins: catalog };
    } catch (e) { return { ok: false, error: String(e && e.message || e), plugins: [] }; }
  });

  ipcMain.handle("schutz:pluginSetEnabled", (_e, name, on) => {
    try {
      if (typeof name !== "string" || !name) return { ok: false, error: "이름 필요" };
      const list = new Set(readEnabled());
      if (on) list.add(name); else list.delete(name);
      writeEnabled([...list]);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });
}

module.exports = { init, parseFrontmatter };
