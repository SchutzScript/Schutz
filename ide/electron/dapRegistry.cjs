// 디버그 어댑터 레지스트리 — 언어 추가 = 여기 한 줄.
const cp = require("child_process");

function onPath(cmd) {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const r = cp.spawnSync(which, [cmd], { encoding: "utf8" });
    return r.status === 0 && !!(r.stdout || "").trim();
  } catch { return false; }
}

/** 사용자 PATH의 python 실행 파일 (py 런처 우선순위는 낮게) */
function pythonCmd() {
  if (onPath("python")) return "python";
  if (onPath("python3")) return "python3";
  if (process.platform === "win32" && onPath("py")) return "py";
  return null;
}

/** debugpy 설치 여부 (어댑터 스폰 전 감지) */
function hasDebugpy(py) {
  try {
    const r = cp.spawnSync(py, ["-c", "import debugpy"], { encoding: "utf8" });
    return r.status === 0;
  } catch { return false; }
}

/** 언어 id → 디버그 어댑터 스펙. available=false면 안내. */
function buildRegistry() {
  const reg = {};
  const py = pythonCmd();
  if (py) {
    const ok = hasDebugpy(py);
    reg.python = {
      languageId: "python",
      available: ok,
      reason: ok ? "" : "debugpy 미설치 — `pip install debugpy` 후 다시 시도",
      // DAP 어댑터를 stdio로 기동 (debugpy.adapter)
      run: () => cp.spawn(py, ["-m", "debugpy.adapter"], { stdio: ["pipe", "pipe", "pipe"], env: process.env }),
    };
  }
  // node 디버깅은 확장형(js-debug DAP 서버) — 자리만 등록. 후속.
  return reg;
}

let _reg = null;
function registry() { if (!_reg) _reg = buildRegistry(); return _reg; }

module.exports = { registry };
