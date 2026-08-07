import { describe, it, expect } from "vitest";
import { freshState, observe, STREAK_BEFORE_TELLING, type ToolSupportState } from "./toolSupport";

/** 턴을 여러 번 흘려 넣고 마지막 상태와 "말한 횟수" 를 돌려준다. */
function run(turns: { sentTools: boolean; toolCalls: number }[], start: ToolSupportState = freshState()) {
  let s = start;
  let tells = 0;
  for (const t of turns) {
    const r = observe(s, t);
    s = r.next;
    if (r.tell) tells++;
  }
  return { state: s, tells };
}

const empty = { sentTools: true, toolCalls: 0 };
const used = { sentTools: true, toolCalls: 2 };
const noTools = { sentTools: false, toolCalls: 0 };

describe("observe", () => {
  it("도구를 한 번 쓰면 할 줄 아는 것으로 확정한다", () => {
    const { state } = run([used]);
    expect(state.everCalled).toBe(true);
    expect(state.emptyStreak).toBe(0);
  });

  it("할 줄 아는 모델이 도구를 안 쓴 턴은 아무 일도 아니다", () => {
    const { state, tells } = run([used, empty, empty, empty, empty, empty]);
    expect(tells).toBe(0);
    expect(state.everCalled).toBe(true);
  });

  // "이 함수 뭐 하는 거야" 같은 질문이 훨씬 많다 — 한 번 비었다고 경고하면 시끄럽다.
  it("한두 번 비었다고 말하지 않는다", () => {
    expect(run([empty]).tells).toBe(0);
    expect(run([empty, empty]).tells).toBe(0);
  });

  it("연달아 세 번 비면 말한다", () => {
    const { tells } = run(Array(STREAK_BEFORE_TELLING).fill(empty));
    expect(tells).toBe(1);
  });

  it("한 프로바이더당 한 번만 말한다", () => {
    const { tells, state } = run(Array(12).fill(empty));
    expect(tells).toBe(1);
    expect(state.told).toBe(true);
  });

  it("중간에 도구를 쓰면 연속이 끊긴다", () => {
    const { tells } = run([empty, empty, used, empty, empty]);
    expect(tells).toBe(0);
  });

  it("도구를 안 보낸 턴은 세지 않는다 — 판단 근거가 없다", () => {
    const { state, tells } = run([noTools, noTools, noTools, noTools]);
    expect(tells).toBe(0);
    expect(state.emptyStreak).toBe(0);
  });

  it("도구 없는 턴이 섞여도 연속은 이어진다", () => {
    const { tells } = run([empty, noTools, empty, noTools, empty]);
    expect(tells).toBe(1);
  });

  it("입력 상태를 고쳐 쓰지 않는다", () => {
    const before = freshState();
    const snapshot = { ...before };
    observe(before, empty);
    expect(before).toEqual(snapshot);
  });

  it("이미 말한 뒤에도 도구를 쓰기 시작하면 확정된다", () => {
    const told: ToolSupportState = { everCalled: false, emptyStreak: 5, told: true };
    const { state } = run([used], told);
    expect(state.everCalled).toBe(true);
    expect(state.told).toBe(true);
  });
});
