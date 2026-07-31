import { describe, it, expect, beforeEach } from "vitest";
import { onHook, emitHook, clearHooks, hookCount, isHookEvent, HOOK_EVENTS, MAX_PER_SOURCE } from "./hooks";

beforeEach(() => clearHooks());

describe("구독", () => {
  it("건 순서대로 부른다", () => {
    const seen: string[] = [];
    onHook("file.save", () => seen.push("a"), "x");
    onHook("file.save", () => seen.push("b"), "y");
    emitHook("file.save", { rel: "a.ts" });
    expect(seen).toEqual(["a", "b"]);
  });

  it("payload 를 그대로 넘긴다", () => {
    let got: unknown = null;
    onHook("file.open", p => { got = p; }, "x");
    emitHook("file.open", { rel: "src/a.ts" });
    expect(got).toEqual({ rel: "src/a.ts" });
  });

  it("다른 사건에는 안 불린다", () => {
    let n = 0;
    onHook("file.save", () => n++, "x");
    emitHook("file.open", {});
    expect(n).toBe(0);
  });

  it("해제하면 더 안 불린다", () => {
    let n = 0;
    const off = onHook("run.start", () => n++, "x");
    emitHook("run.start", {});
    off();
    emitHook("run.start", {});
    expect(n).toBe(1);
  });

  it("두 번 해제해도 남의 것을 지우지 않는다", () => {
    let n = 0;
    const off = onHook("run.end", () => n++, "x");
    onHook("run.end", () => n++, "y");
    off(); off();
    emitHook("run.end", {});
    expect(n).toBe(1);
  });

  it("모르는 사건은 조용히 무시한다 — 오타 하나로 확장 로드가 깨지면 안 된다", () => {
    const off = onHook("file.saved", () => { /* */ }, "x");   // 실제 이름은 file.save
    expect(hookCount()).toBe(0);
    expect(() => off()).not.toThrow();
  });

  it("함수가 아니면 무시한다", () => {
    onHook("file.save", undefined as never, "x");
    expect(hookCount()).toBe(0);
  });
});

describe("실패 격리", () => {
  it("하나가 터져도 나머지는 돈다 — 확장이 저장 경로를 멈추게 두지 않는다", () => {
    const seen: string[] = [];
    onHook("file.save", () => { throw new Error("boom"); }, "bad");
    onHook("file.save", () => seen.push("after"), "good");
    const errs: string[] = [];
    const ran = emitHook("file.save", {}, s => errs.push(s));
    expect(seen).toEqual(["after"]);
    expect(errs).toEqual(["bad"]);
    expect(ran).toBe(2);
  });

  it("보고 자체가 터져도 emit 은 성공한다", () => {
    onHook("file.save", () => { throw new Error("boom"); }, "bad");
    expect(() => emitHook("file.save", {}, () => { throw new Error("보고 실패"); })).not.toThrow();
  });

  it("onError 를 안 줘도 조용히 넘어간다", () => {
    onHook("file.save", () => { throw new Error("boom"); }, "bad");
    expect(() => emitHook("file.save", {})).not.toThrow();
  });
});

describe("도는 중 변경", () => {
  it("emit 도중에 건 훅은 이번 판에 안 불린다", () => {
    let late = 0;
    onHook("run.start", () => { onHook("run.start", () => late++, "x"); }, "x");
    emitHook("run.start", {});
    expect(late).toBe(0);
    emitHook("run.start", {});
    expect(late).toBe(1);
  });

  it("emit 도중 스스로 해제해도 그 판은 끝까지 돈다", () => {
    const seen: string[] = [];
    let off2: (() => void) | null = null;
    onHook("run.end", () => { seen.push("a"); off2?.(); }, "x");
    off2 = onHook("run.end", () => seen.push("b"), "y");
    emitHook("run.end", {});
    expect(seen).toEqual(["a", "b"]);
    emitHook("run.end", {});
    expect(seen).toEqual(["a", "b", "a"]);
  });
});

describe("정리와 상한", () => {
  it("확장별로 걷어낸다", () => {
    onHook("file.save", () => { /* */ }, "x");
    onHook("file.save", () => { /* */ }, "y");
    clearHooks("x");
    expect(hookCount("file.save")).toBe(1);
  });

  it("인자 없이 부르면 전부 걷어낸다 — 확장 리로드", () => {
    onHook("file.save", () => { /* */ }, "x");
    onHook("file.open", () => { /* */ }, "y");
    clearHooks();
    expect(hookCount()).toBe(0);
  });

  it("한 확장이 상한을 넘게 달면 거절한다", () => {
    for (let i = 0; i < MAX_PER_SOURCE + 5; i++) onHook("file.save", () => { /* */ }, "x");
    expect(hookCount()).toBe(MAX_PER_SOURCE);
    onHook("file.save", () => { /* */ }, "y");   // 다른 확장은 영향 없다
    expect(hookCount()).toBe(MAX_PER_SOURCE + 1);
  });
});

describe("사건 이름", () => {
  it("공개 목록만 참이다", () => {
    for (const e of HOOK_EVENTS) expect(isHookEvent(e)).toBe(true);
    expect(isHookEvent("file.saved")).toBe(false);
    expect(isHookEvent("")).toBe(false);
  });
  it("이름이 중복되지 않는다", () => {
    expect(new Set(HOOK_EVENTS).size).toBe(HOOK_EVENTS.length);
  });
});
