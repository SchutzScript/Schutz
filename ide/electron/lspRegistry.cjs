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

/** 이 앱이 아는 언어 서버 전부. 설치돼 있든 아니든 여기 다 적는다.
 *
 *  예전엔 PATH 에 있는 것만 등록했다. 그래서 gopls 가 없으면 Go 파일은 하이라이트만
 *  되고 정의·진단·심볼이 전부 조용히 없었다 — 사용자는 앱이 원래 그런 줄 안다.
 *  무엇이 있고 무엇이 없는지 알려면 "없는 것" 도 알고 있어야 한다. */
const KNOWN = [
  { languageId: "rust", command: "rust-analyzer", args: [], install: "rustup component add rust-analyzer" },
  { languageId: "go", command: "gopls", args: [], install: "go install golang.org/x/tools/gopls@latest" },
  { languageId: "c", command: "clangd", args: [], install: "LLVM 설치(clangd 포함)" },
  { languageId: "cpp", command: "clangd", args: [], install: "LLVM 설치(clangd 포함)" },
  { languageId: "shell", command: "bash-language-server", args: ["start"], install: "npm i -g bash-language-server" },
  { languageId: "lua", command: "lua-language-server", args: [], install: "lua-language-server 설치" },
  { languageId: "java", command: "jdtls", args: [], install: "Eclipse JDT Language Server 설치" },
];

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

  // KNOWN 을 훑어 PATH 에 있는 것만 켠다. 없는 것도 목록에는 남겨 둔다(catalog).
  // 언어 추가 = KNOWN 에 한 줄. key 는 monaco 언어 id 와 같아야 한다.
  for (const spec of KNOWN) {
    if (!onPath(spec.command)) continue;
    reg[spec.languageId] = {
      languageId: spec.languageId,
      run: (root) => cp.spawn(spec.command, spec.args, { cwd: root, env: process.env, stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" }),
      available: true,
    };
  }

  return reg;
}

/** 아는 서버 전부와 그 설치 여부. 렌더러가 "이 언어는 서버가 없다" 를 말할 때 쓴다. */
function catalog() {
  const reg = registry();
  const rows = [{ languageId: "python", command: "pyright", install: "번들됨", available: !!reg.python }];
  for (const spec of KNOWN) {
    rows.push({ languageId: spec.languageId, command: spec.command, install: spec.install, available: !!reg[spec.languageId] });
  }
  return rows;
}

let _reg = null;
function registry() { if (!_reg) _reg = buildRegistry(); return _reg; }

module.exports = { registry, catalog, resolvePyright };
