import { describe, it, expect } from "vitest";
import { AskQueue } from "./askQueue";

/** 물음 하나를 세우고, 언제 어떻게 풀렸는지 볼 수 있게 감싼다. */
function ask<T>(q: AskQueue<T>, item: T) {
  const log: boolean[] = [];
  q.add(item, ok => log.push(ok));
  return log;
}

describe("AskQueue", () => {
  it("먼저 온 물음을 보여 준다", () => {
    const q = new AskQueue<string>();
    ask(q, "a"); ask(q, "b");
    expect(q.current()).toBe("a");
    expect(q.size).toBe(2);
  });

  it("빈 줄에서는 보여 줄 것이 없다", () => {
    const q = new AskQueue<string>();
    expect(q.current()).toBeNull();
    expect(q.answer(true)).toBeNull();
  });

  // 이것이 이 파일의 이유다. 예전 구현은 resolve 를 필드 하나에 담아서, 두 번째
  // 물음이 첫 번째의 resolve 를 덮었다 — 첫 실행은 영원히 await 에 매달렸다.
  it("나중 물음이 앞의 물음을 덮어 매달아 두지 않는다", () => {
    const q = new AskQueue<string>();
    const a = ask(q, "a");
    const b = ask(q, "b");
    expect(q.answer(true)).toBe("b");   // a 에 답 → 다음은 b
    expect(a).toEqual([true]);
    expect(b).toEqual([]);              // 아직 안 풀렸다(매달린 게 아니라 대기 중)
    expect(q.answer(false)).toBeNull();
    expect(b).toEqual([false]);
  });

  it("답은 지금 보이는 물음에만 간다", () => {
    const q = new AskQueue<string>();
    const a = ask(q, "a");
    const b = ask(q, "b");
    q.answer(false);
    expect(a).toEqual([false]);
    expect(b).toEqual([]);
  });

  it("한 물음이 두 번 풀리지 않는다", () => {
    const q = new AskQueue<string>();
    const a = ask(q, "a");
    q.answer(true);
    q.answer(true);      // 빈 줄에 대고 답해도 a 를 다시 풀지 않는다
    q.cancelAll();
    expect(a).toEqual([true]);
  });

  it("그 에이전트의 물음만 걷어내고 나머지는 남긴다", () => {
    const q = new AskQueue<{ agent: string }>();
    const a = ask(q, { agent: "A" });
    const b = ask(q, { agent: "B" });
    const a2 = ask(q, { agent: "A" });
    expect(q.cancelWhere(x => x.agent === "A")).toEqual({ agent: "B" });
    expect(a).toEqual([false]);
    expect(a2).toEqual([false]);
    expect(b).toEqual([]);
    expect(q.size).toBe(1);
  });

  it("보이던 것이 아닌 뒤쪽만 걷히면 보이는 물음은 그대로다", () => {
    const q = new AskQueue<{ agent: string }>();
    const a = ask(q, { agent: "A" });
    ask(q, { agent: "B" });
    expect(q.cancelWhere(x => x.agent === "B")).toEqual({ agent: "A" });
    expect(a).toEqual([]);
  });

  it("정리하면 매달린 물음이 하나도 남지 않는다", () => {
    const q = new AskQueue<string>();
    const logs = [ask(q, "a"), ask(q, "b"), ask(q, "c")];
    q.cancelAll();
    expect(q.size).toBe(0);
    expect(q.current()).toBeNull();
    for (const l of logs) expect(l).toEqual([false]);
  });

  it("정리 값을 승인으로 줄 수도 있다(자율 모드 전환 등)", () => {
    const q = new AskQueue<string>();
    const a = ask(q, "a");
    q.cancelAll(true);
    expect(a).toEqual([true]);
  });
});
