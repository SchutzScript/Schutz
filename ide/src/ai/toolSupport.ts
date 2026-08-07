// 이 모델이 도구를 쓸 줄 아는가 — 물어볼 수 없으니 관찰해서 판단한다.
//
// 로컬 모델을 붙일 수 있게 되면서 생긴 문제다. 작은 모델은 tool use 를 아예 지원하지
// 않거나, 도구 정의를 받고도 그냥 산문으로 답한다. 그러면 에이전트는 "작업하기" 를
// 눌러도 파일 하나 안 건드리고 말만 하고 끝난다 — 사용자 눈에는 **앱이 고장 난 것**
// 으로 보인다. 실제로는 모델이 못 하는 것이고, 그건 말해 주면 되는 일이다.
//
// 그렇다고 도구를 안 쓴 턴마다 경고하면 안 된다. "이 함수 뭐 하는 거야" 처럼 도구가
// 필요 없는 질문이 훨씬 많다. 그래서 두 가지를 함께 본다:
//   1. 이 프로바이더가 **한 번이라도** 도구를 부른 적이 있는가 — 있으면 할 줄 아는 것이다.
//   2. 도구를 실어 보냈는데 아무것도 안 부른 턴이 연달아 몇 번인가.
// 둘 다 아니어야 말한다. 그리고 한 프로바이더당 한 번만 말한다.

export interface ToolSupportState {
  /** 이 프로바이더가 도구를 부른 적이 있다 — 그러면 영원히 묻지 않는다. */
  everCalled: boolean;
  /** 도구를 줬는데 하나도 안 부른 턴이 연달아 몇 번인지. */
  emptyStreak: number;
  /** 이미 알린 적이 있다. */
  told: boolean;
}

export function freshState(): ToolSupportState {
  return { everCalled: false, emptyStreak: 0, told: false };
}

/** 몇 번 연속 비어야 말할지. 한 번은 흔하다 — 도구가 필요 없는 질문이 그렇다. */
export const STREAK_BEFORE_TELLING = 3;

export interface TurnOutcome {
  /** 이 턴에 도구 정의를 실어 보냈는가. 안 보냈으면 판단 근거가 없다. */
  sentTools: boolean;
  /** 이 턴에 모델이 도구를 부른 횟수. */
  toolCalls: number;
}

/**
 * 턴 하나를 보고 상태를 갱신하고, 지금 알려야 하는지 답한다.
 *
 * 입력을 바꾸지 않는다 — 부르는 쪽이 돌려받은 상태를 저장한다.
 */
export function observe(prev: ToolSupportState, turn: TurnOutcome): { next: ToolSupportState; tell: boolean } {
  // 도구를 안 보낸 턴은 아무 말도 해 주지 않는다(모델을 판단할 근거가 없다).
  if (!turn.sentTools) return { next: prev, tell: false };

  if (turn.toolCalls > 0) {
    // 할 줄 안다는 것이 확인됐다. 다시는 의심하지 않는다.
    return { next: { everCalled: true, emptyStreak: 0, told: prev.told }, tell: false };
  }

  if (prev.everCalled) {
    // 할 줄 아는 모델이 이번엔 안 쓴 것뿐이다 — 그건 정상이다.
    return { next: prev, tell: false };
  }

  const emptyStreak = prev.emptyStreak + 1;
  const tell = !prev.told && emptyStreak >= STREAK_BEFORE_TELLING;
  return { next: { everCalled: false, emptyStreak, told: prev.told || tell }, tell };
}
