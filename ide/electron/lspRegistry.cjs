// 언어 서버 레지스트리 — 언어 추가 = 여기 한 줄.
const path = require("path");
const cp = require("child_process");

/** pyright-langserver의 .js 진입점을 resolve (asar/PATH 무관하게 Electron 내장 Node로 실행) */
function resolvePyright() {
  try {
    const pkgJson = require.resolve("pyright/package.json");
    const dir = path.dirname(pkgJson);
    const pkg = require(pkgJson);
    const rel = (pkg.bin && (pkg.bin["pyright-langserver"] || pkg.bin.pyright)) || "langserver.index.js";
    return path.join(dir, rel);
  } catch {
    return null;
  }
}

/** PATH에서 실행 파일 존재 여부 (rust-analyzer/gopls 등) */
function onPath(cmd) {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const r = cp.spawnSync(which, [cmd], { encoding: "utf8" });
    return r.status === 0 && !!(r.stdout || "").trim();
  } catch {
    return false;
  }
}

/** 언어 id → 서버 기동 스펙. available=false면 렌더러는 하이라이트만. */
function buildRegistry() {
  const reg = {};

  const pyrightJs = resolvePyright();
  if (pyrightJs) {
    reg.python = {
      languageId: "python",
      run: (root) => cp.spawn(process.execPath, [pyrightJs, "--stdio"], {
        cwd: root || undefined,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      }),
      available: true,
    };
  }

  // PATH에 바이너리가 있으면 자동 활성 (없으면 등록 안 함 → 렌더러는 하이라이트만).
  // 언어 추가 = 아래 한 줄. key는 monaco 언어 id와 일치해야 함(c/cpp/shell/lua/java 등).
  const pathServer = (langId, cmd, args = []) => {
    if (!onPath(cmd)) return;
    reg[langId] = { languageId: langId, run: (root) => cp.spawn(cmd, args, { cwd: root, env: process.env, stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" }), available: true };
  };

  pathServer("rust", "rust-analyzer");
  pathServer("go", "gopls");
  pathServer("c", "clangd");
  pathServer("cpp", "clangd");
  pathServer("shell", "bash-language-server", ["start"]);
  pathServer("lua", "lua-language-server");
  pathServer("java", "jdtls");

  return reg;
}

let _reg = null;
function registry() { if (!_reg) _reg = buildRegistry(); return _reg; }

module.exports = { registry, resolvePyright };
