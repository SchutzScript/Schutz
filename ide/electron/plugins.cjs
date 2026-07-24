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

/** Schutz 가 직접 받은 플러그인이 사는 곳. Claude Code 의 디렉터리를 건드리지 않는다 —
 *  남의 도구가 관리하는 트리에 끼어들면 서로 지우고 덮어쓰게 된다. */
function ownPluginsDir() { return path.join(app.getPath("userData"), "plugins"); }

/** 로컬에 실제로 받아져 있는 플러그인 디렉터리들을 훑는다.
 *  Claude Code 가 받아둔 것(마켓플레이스마다 plugins/ 와 external_plugins/)과
 *  Schutz 가 직접 받은 것(userData/plugins) 둘 다. */
function localPluginDirs() {
  const roots = [];
  // Schutz 가 받은 것 먼저 — 같은 이름이면 이쪽을 쓴다(우리가 버전을 안다).
  try {
    for (const d of fs.readdirSync(ownPluginsDir(), { withFileTypes: true })) {
      if (d.isDirectory()) roots.push({ marketplace: "schutz", name: d.name, dir: path.join(ownPluginsDir(), d.name) });
    }
  } catch { /* 아직 하나도 안 받았으면 없다 */ }
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
    // 이름은 **디렉터리 이름**으로 잡는다. 카탈로그가 부르는 이름이 곧 우리가 받아 둔 폴더
    // 이름인데, plugin.json 안의 name 은 저장소 안에서만 통하는 다른 이름일 때가 있다
    // (42crunch-api-security-testing 이 안에서는 api-security-testing 인 식). 그걸 쓰면
    // 카탈로그와 설치본이 서로를 못 알아본다.
    name: p.name,
    description: manifest.description || "",
    version: manifest.version || "",
    keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
    marketplace: p.marketplace,
    dir: p.dir,
    skills: skills.length,
    commands,
    mcp,
    installed: true,
    own: p.marketplace === "schutz",   // Schutz 가 받은 것만 지울 수 있다
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
        source: p.source ?? null,          // 설치할 때 어디서 받을지
      });
    }
  }
  return out;
}

// ── 카탈로그에서 직접 받기 ───────────────────────────────────────────────────
// 카탈로그의 source 는 네 갈래인데 원격 셋은 모두 git 이다:
//   git-subdir {url, path, ref}  저장소를 받아 그 **하위 디렉터리**만 쓴다
//   url        {url, sha}        저장소 통째가 플러그인이다
//   github     {repo, commit}    위와 같고 주소만 조립하면 된다
//   "./plugins/이름"             마켓플레이스 저장소에 이미 들어 있다 — 받을 것이 없다

const { spawn } = require("child_process");

/** git 은 shell 없이 부른다 — 주소가 인자로 들어가므로 셸을 끼우면 메타문자가 명령이 된다. */
function git(args, cwd) {
  return new Promise((resolve) => {
    let out = "";
    const p = spawn("git", args, { cwd, windowsHide: true });
    const feed = (d) => { out += d.toString(); };
    p.stdout.on("data", feed); p.stderr.on("data", feed);
    p.on("error", (e) => resolve({ ok: false, out: out + "\n" + e.message }));
    p.on("close", (code) => resolve({ ok: code === 0, out }));
  });
}

/** 카탈로그 source → {repo, ref, sub}. 받을 수 없으면 null. */
function resolveSource(src) {
  if (!src || typeof src === "string") return null;          // 문자열이면 이미 로컬
  if (src.source === "git-subdir") return { repo: src.url, ref: src.ref || src.sha || "", sub: src.path || "" };
  if (src.source === "url") return { repo: src.url, ref: src.sha || "", sub: "" };
  if (src.source === "github" && src.repo) return { repo: `https://github.com/${src.repo}.git`, ref: src.commit || src.sha || "", sub: "" };
  return null;
}

/** 받아도 되는 주소인가 — https 만, 그리고 셸/인자 장난이 섞이지 않은 평범한 URL 만. */
function safeRepoUrl(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (/[\s"'`$;|&<>\\]/.test(u) || u.startsWith("-")) return null;
  return url.toString();
}

function init(ipcMain) {
  // 카탈로그에서 직접 받아 설치한다. 받은 것은 Schutz 몫의 디렉터리에 둔다.
  ipcMain.handle("schutz:pluginInstall", async (_e, name) => {
    let tmp = "";
    try {
      if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return { ok: false, error: "잘못된 이름" };
      const entry = readCatalog().find(c => c.name === name);
      if (!entry) return { ok: false, error: "카탈로그에 없는 플러그인입니다" };
      const src = resolveSource(entry.source);
      if (!src) return { ok: false, error: "이 플러그인은 마켓플레이스 저장소에 들어 있어 따로 받을 것이 없습니다" };
      const repo = safeRepoUrl(src.repo);
      if (!repo) return { ok: false, error: "받을 수 없는 주소입니다(https 만 허용)" };

      const dest = path.join(ownPluginsDir(), name);
      if (fs.existsSync(dest)) return { ok: true, already: true };
      fs.mkdirSync(ownPluginsDir(), { recursive: true });
      tmp = path.join(ownPluginsDir(), "." + name + ".tmp");
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });

      let r = await git(["clone", "--depth", "1", repo, tmp], ownPluginsDir());
      if (!r.ok) return { ok: false, error: "clone 실패 — git 이 설치돼 있는지 확인하세요.\n" + r.out.slice(-300) };
      // 특정 커밋/태그가 지정돼 있으면 거기로 맞춘다. 실패하면 기본 가지를 그대로 쓴다
      // (얕은 복제라 옛 커밋이 없을 수 있는데, 그렇다고 설치를 통째로 접을 일은 아니다).
      if (src.ref) {
        const f = await git(["fetch", "--depth", "1", "origin", src.ref], tmp);
        if (f.ok) await git(["checkout", "-q", "FETCH_HEAD"], tmp);
      }

      // 하위 디렉터리만 쓰는 종류면 그것만 꺼낸다.
      let from = tmp;
      if (src.sub) {
        if (src.sub.includes("..")) return { ok: false, error: "잘못된 경로" };
        from = path.join(tmp, src.sub);
        if (!fs.existsSync(from)) return { ok: false, error: "저장소에 " + src.sub + " 가 없습니다" };
      }
      // 플러그인다운 모양인지 본다 — 아니면 엉뚱한 저장소를 받은 것이다.
      const looksRight = [".claude-plugin", "skills", "commands", "agents"]
        .some(d => fs.existsSync(path.join(from, d)));
      if (!looksRight) return { ok: false, error: "플러그인 구조가 아닙니다(.claude-plugin·skills·commands 없음)" };

      fs.cpSync(from, dest, { recursive: true });
      try { fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true }); } catch { /* */ }
      return { ok: true, dir: dest };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
    }
  });

  // 받은 플러그인 지우기 — Schutz 가 받은 것만. 남의 디렉터리는 건드리지 않는다.
  ipcMain.handle("schutz:pluginUninstall", (_e, name) => {
    try {
      if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return { ok: false, error: "잘못된 이름" };
      const dir = path.join(ownPluginsDir(), name);
      if (!fs.existsSync(dir)) return { ok: false, error: "Schutz 가 받은 플러그인이 아닙니다" };
      fs.rmSync(dir, { recursive: true, force: true });
      writeEnabled(readEnabled().filter(n => n !== name));
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

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
        return { ...c, source: undefined, installed: !!got, enabled: got ? got.enabled : false, skills: got ? got.skills : 0, commands: got ? got.commands : 0, mcp: got ? got.mcp : false, own: got ? got.own : false, canInstall: !got && !!resolveSource(c.source) };
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
