// 메인 프로세스가 죽거나 렌더러가 사라졌을 때 무엇을 할지 정하는 **순수한 부분**.
//
// 메인에는 전역 오류 처리가 아예 없었다. Node 는 처리 안 된 거부를 기본으로 던지므로,
// 어딘가의 async IPC 하나가 실패하면 메인이 죽고 **앱이 통째로 사라진다** — 창도,
// 저장 안 한 버퍼도, 아무 설명도 없이. 렌더러에는 공들인 크래시 화면이 있는데
// 정작 더 치명적인 쪽이 비어 있었다.
//
// 여기 있는 것은 판단만 한다. 파일·다이얼로그는 main.cjs 가 한다.

/** 로그가 무한히 자라지 않게 자른다. 뒤쪽(최근)을 남긴다 — 크래시 직전이 궁금하지
 *  처음 켠 날이 궁금한 게 아니다. */
function trimLog(text, maxBytes = 512 * 1024) {
  const s = String(text ?? "");
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  // 대충 자른 뒤 첫 줄바꿈까지 버린다 — 반 토막 난 줄로 시작하지 않게.
  const cut = s.slice(-Math.floor(maxBytes * 0.9));
  const nl = cut.indexOf("\n");
  return "…(앞부분 잘림)\n" + (nl >= 0 ? cut.slice(nl + 1) : cut);
}

/** 사용자에게 알릴 것인가.
 *
 *  한 번 어긋나면 같은 오류가 초당 여러 번 오는 일이 흔하다. 그때마다 모달을 띄우면
 *  앱을 아예 못 쓴다. 세션당 한 번만 알리고, 나머지는 로그로만 남긴다. */
function makeNotifyGate() {
  let told = false;
  return () => { if (told) return false; told = true; return true; };
}

/** 렌더러가 죽었을 때 다시 실을 것인가.
 *
 *  빈 창을 그대로 두면 아무것도 못 한다. 그래서 다시 싣되, 짧은 사이에 되풀이되면
 *  멈춘다 — 새로 실을 때마다 같은 이유로 또 죽는 상황이면 무한 반복이 된다.
 *  그때는 사용자에게 넘긴다. */
function makeReloadGate(limit = 2, windowMs = 60_000) {
  const times = [];
  return (now) => {
    while (times.length && now - times[0] > windowMs) times.shift();
    times.push(now);
    return times.length <= limit;
  };
}

/** 한 줄 로그. 시간과 종류를 앞에 붙인다 — 여러 종류가 섞이면 순서가 유일한 단서다. */
function logLine(when, kind, detail) {
  return "[" + new Date(when).toISOString() + "] " + kind + ": " + String(detail ?? "").replace(/\r?\n/g, "\n    ") + "\n";
}

module.exports = { trimLog, makeNotifyGate, makeReloadGate, logLine };
