// 저장 안 한 것이 있는데 종료를 누르면 무엇을 할지 — **순수한 부분**.
//
// 지금까지는 이랬다. 트레이 '종료' → app.quit() → before-quit 이 트레이를 없애고
// 실행 중인 프로세스를 죽인다 → 창을 닫으려는데 렌더러의 beforeunload 가 막는다.
// 결과: 앱은 살아 있고, 트레이 아이콘은 사라졌고, 눌렀던 종료는 아무 일도 안 한 것처럼
// 보인다. 창을 트레이로 내려둔 상태였다면 **앱에 닿을 방법이 없다.**
//
// (Electron 에서 beforeunload 가 app.quit() 을 막는다는 것은 최소 재현으로 확인했다.
//  브라우저처럼 대화상자를 띄우지 않고 조용히 취소된다.)
//
// 그래서 막기 전에 **묻는다.** 여기 있는 것은 판단만 한다 — 대화상자는 main.cjs 가 띄운다.

/** 물어볼 것인가. 저장 안 한 것이 없으면 그냥 나간다. */
function shouldAsk(dirtyCount, alreadyDecided) {
  return !alreadyDecided && typeof dirtyCount === "number" && dirtyCount > 0;
}

/** 대화상자 버튼. 순서가 곧 응답 번호라 한곳에서 정한다. */
const BUTTONS = ["저장하고 종료", "저장하지 않고 종료", "취소"];

/** 응답 번호 → 무엇을 할지. 모르는 번호(창을 그냥 닫는 등)는 **취소**로 본다 —
 *  판단이 애매할 때 종료해 버리면 작업이 사라진다. */
function decide(response) {
  if (response === 0) return "save";
  if (response === 1) return "discard";
  return "cancel";
}

/** 사람에게 보여 줄 문구. 파일 이름을 몇 개 보여 주고 나머지는 수로 줄인다 —
 *  스무 개를 늘어놓으면 무엇을 잃는지가 오히려 안 읽힌다. */
function describe(files, max = 5) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!list.length) return "";
  const head = list.slice(0, max).join("\n");
  return list.length > max ? head + "\n… 외 " + (list.length - max) + "개" : head;
}

module.exports = { shouldAsk, decide, describe, BUTTONS };
