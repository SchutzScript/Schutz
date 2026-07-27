import { describe, it, expect } from "vitest";
import { normalizeSteps, mergePlan, stopPlan, PLAN_MAX, type PlanStep } from "./plan";

const S = (label: string, done = false) => ({ label, done });

describe("normalizeSteps", () => {
  it("빈 라벨과 공백만인 것은 버린다", () => {
    expect(normalizeSteps([S("a"), S("  "), S("")])).toEqual([S("a")]);
  });
  it("라벨 앞뒤 공백을 다듬는다", () => {
    expect(normalizeSteps([{ label: "  구조 파악  " }])).toEqual([S("구조 파악")]);
  });
  it("같은 라벨이 둘이면 뒤엣것을 버린다 — id 가 충돌한다", () => {
    expect(normalizeSteps([S("a"), S("b"), S("a", true)])).toEqual([S("a"), S("b")]);
  });
  it("done 은 불리언으로 강제한다", () => {
    expect(normalizeSteps([{ label: "a", done: "yes" }])).toEqual([S("a", true)]);
    expect(normalizeSteps([{ label: "a" }])).toEqual([S("a", false)]);
  });
  it("상한을 넘기면 자른다", () => {
    const many = Array.from({ length: PLAN_MAX + 7 }, (_, i) => S("step" + i));
    expect(normalizeSteps(many)).toHaveLength(PLAN_MAX);
  });
  it("배열이 아니면 빈 목록 — 모델이 엉뚱한 걸 보내도 죽지 않는다", () => {
    for (const bad of [null, undefined, "steps", 42, {}]) expect(normalizeSteps(bad)).toEqual([]);
  });
});

describe("mergePlan", () => {
  it("안 끝난 것 중 첫 번째가 active 다", () => {
    const r = mergePlan([], [S("a", true), S("b"), S("c")], "claude");
    expect(r.map(x => x.st)).toEqual(["done", "active", "pending"]);
  });
  it("전부 끝났으면 active 가 없다", () => {
    const r = mergePlan([], [S("a", true), S("b", true)], "claude");
    expect(r.map(x => x.st)).toEqual(["done", "done"]);
  });
  it("아무것도 안 끝났으면 첫 번째만 active", () => {
    const r = mergePlan([], [S("a"), S("b")], "claude");
    expect(r.map(x => x.st)).toEqual(["active", "pending"]);
  });

  it("같은 라벨은 id 를 유지한다 — 안 그러면 스피너가 껌뻑인다", () => {
    const first = mergePlan([], [S("a"), S("b")], "claude");
    const second = mergePlan(first, [S("a", true), S("b")], "claude");
    expect(second[0].id).toBe(first[0].id);
    expect(second[1].id).toBe(first[1].id);
    expect(second.map(x => x.st)).toEqual(["done", "active"]);
  });

  it("처음 올린 에이전트를 기억한다 — 나중 호출이 주인을 바꾸지 않는다", () => {
    const first = mergePlan([], [S("a")], "claude");
    const second = mergePlan(first, [S("a", true)], "gpt");
    expect(second[0].agent).toBe("claude");
  });

  it("새로 끼워 넣은 단계는 새 id 를 받는다", () => {
    const first = mergePlan([], [S("a"), S("c")], "claude");
    const second = mergePlan(first, [S("a", true), S("b"), S("c")], "claude");
    expect(second.map(x => x.label)).toEqual(["a", "b", "c"]);
    expect(second[0].id).toBe(first[0].id);          // 유지
    expect(second[2].id).toBe(first[1].id);          // c 도 유지 — 순서가 밀려도 라벨로 찾는다
    expect(second[1].id).not.toBe(first[1].id);      // b 는 새것
  });

  it("사라진 단계는 결과에서 빠진다 — 모델이 보낸 것이 전부다", () => {
    const first = mergePlan([], [S("a"), S("b")], "claude");
    const second = mergePlan(first, [S("a")], "claude");
    expect(second.map(x => x.label)).toEqual(["a"]);
  });

  it("빈 목록이면 빈 계획", () => {
    expect(mergePlan([{ id: "x", label: "a", agent: "claude", st: "done" }], [], "claude")).toEqual([]);
  });
});

describe("stopPlan", () => {
  it("진행 중이던 것만 stopped 로 바꾼다", () => {
    const prev: PlanStep[] = [
      { id: "1", label: "a", agent: "c", st: "done" },
      { id: "2", label: "b", agent: "c", st: "active" },
      { id: "3", label: "c", agent: "c", st: "pending" },
    ];
    expect(stopPlan(prev).map(x => x.st)).toEqual(["done", "stopped", "pending"]);
  });
  it("멈출 게 없으면 그대로", () => {
    const prev: PlanStep[] = [{ id: "1", label: "a", agent: "c", st: "done" }];
    expect(stopPlan(prev)).toEqual(prev);
  });
});
