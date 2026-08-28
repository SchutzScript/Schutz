import { describe, it, expect } from "vitest";
import { Orchestra, planTasks } from "./orchestra";
import type { TaskDef } from "./orchestra";
import type { DelegationOutcome } from "./types";

const T = (id: string, needs: string[] = [], agent = "a:" + id): TaskDef =>
  ({ id, agent, task: "t:" + id, needs });

const ok = (text: string): DelegationOutcome => ({ status: "completed", text, rounds: 1, stopCause: "end" });
const empty: DelegationOutcome = { status: "empty", rounds: 1, stopCause: "end" };
const fail: DelegationOutcome = { status: "failed", message: "boom" };
const timeout: DelegationOutcome = { status: "timeout", afterMs: 1000 };

describe("planTasks", () => {
  it("의존 없는 것들은 적은 순서 그대로", () => {
    const r = planTasks([T("a"), T("b"), T("c")]);
    expect(r).toEqual({ kind: "ok", order: ["a", "b", "c"] });
  });

  it("의존이 앞에 온다", () => {
    const r = planTasks([T("c", ["a", "b"]), T("a"), T("b", ["a"])]);
    expect(r.kind === "ok" && r.order).toEqual(["a", "b", "c"]);
  });

  // 같은 그래프를 두 번 짜면 두 번 같은 그림이어야 한다 — 화면이 이 순서로 그려진다.
  it("의존만 맞으면 정의 순서를 지킨다", () => {
    const r = planTasks([T("z"), T("y"), T("x")]);
    expect(r.kind === "ok" && r.order).toEqual(["z", "y", "x"]);
  });

  it("사이클이면 남은 것들을 그대로 실어 보낸다", () => {
    const r = planTasks([T("a", ["b"]), T("b", ["a"]), T("c")]);
    expect(r.kind).toBe("bad");
    expect(r.kind === "bad" && r.error).toEqual({ kind: "cycle", ids: ["a", "b"] });
  });

  it("긴 사이클도 잡는다", () => {
    const r = planTasks([T("a", ["c"]), T("b", ["a"]), T("c", ["b"])]);
    expect(r.kind === "bad" && r.error.kind).toBe("cycle");
  });

  it("없는 의존", () => {
    const r = planTasks([T("a", ["nope"])]);
    expect(r.kind === "bad" && r.error).toEqual({ kind: "unknown-dep", id: "a", dep: "nope" });
  });

  it("자기 자신에 의존", () => {
    const r = planTasks([T("a", ["a"])]);
    expect(r.kind === "bad" && r.error).toEqual({ kind: "self-dep", id: "a" });
  });

  it("id 가 겹침", () => {
    const r = planTasks([T("a"), T("a")]);
    expect(r.kind === "bad" && r.error).toEqual({ kind: "duplicate-id", id: "a" });
  });

  it("빈 id 는 자리까지 알려준다", () => {
    const r = planTasks([T("a"), T("")]);
    expect(r.kind === "bad" && r.error).toEqual({ kind: "empty-id", at: 1 });
  });

  it("빈 그래프", () => {
    expect(planTasks([])).toEqual({ kind: "ok", order: [] });
  });
});

describe("Orchestra — 돌리기", () => {
  it("의존 없는 것부터, 상한만큼만 낸다", () => {
    const g = new Orchestra([T("a"), T("b"), T("c", ["a"])]);
    expect(g.ready(10).map(d => d.id)).toEqual(["a", "b"]);
    expect(g.ready(1).map(d => d.id)).toEqual(["a"]);
    expect(g.ready(0)).toEqual([]);
    expect(g.ready(-1)).toEqual([]);
  });

  it("의존이 끝나야 다음이 준비된다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"])]);
    g.start("a");
    expect(g.ready(10)).toEqual([]);          // a 는 돌고 있고 b 는 아직
    g.settle("a", ok("결과"));
    expect(g.ready(10).map(d => d.id)).toEqual(["b"]);
  });

  it("의존이 여럿이면 전부 끝나야 한다", () => {
    const g = new Orchestra([T("a"), T("b"), T("c", ["a", "b"])]);
    g.start("a"); g.start("b");
    g.settle("a", ok("1"));
    expect(g.ready(10)).toEqual([]);
    g.settle("b", ok("2"));
    expect(g.ready(10).map(d => d.id)).toEqual(["c"]);
  });

  it("같은 것을 두 번 태우지 않는다", () => {
    const g = new Orchestra([T("a")]);
    expect(g.start("a")).toBe(true);
    expect(g.start("a")).toBe(false);
    expect(g.ready(10)).toEqual([]);
  });

  it("돌지 않는 것을 끝났다고 할 수 없다", () => {
    const g = new Orchestra([T("a")]);
    expect(g.settle("a", ok("x"))).toBe(false);     // 아직 pending
    g.start("a");
    expect(g.settle("a", ok("x"))).toBe(true);
    expect(g.settle("a", ok("x"))).toBe(false);     // 두 번은 안 된다
  });

  it("모르는 id", () => {
    const g = new Orchestra([T("a")]);
    expect(g.start("zz")).toBe(false);
    expect(g.settle("zz", ok("x"))).toBe(false);
    expect(g.state("zz")).toBeUndefined();
  });

  it("runningCount 와 finished", () => {
    const g = new Orchestra([T("a"), T("b")]);
    expect(g.finished()).toBe(false);
    g.start("a");
    expect(g.runningCount()).toBe(1);
    g.settle("a", ok("x"));
    g.start("b"); g.settle("b", ok("y"));
    expect(g.runningCount()).toBe(0);
    expect(g.finished()).toBe(true);
  });

  it("빈 그래프는 처음부터 끝나 있다", () => {
    const g = new Orchestra([]);
    expect(g.finished()).toBe(true);
    expect(g.ready(10)).toEqual([]);
    expect(g.report().total).toBe(0);
  });
});

describe("Orchestra — 무너졌을 때", () => {
  // 이 파일이 있는 이유. 여덟 개를 시켰는데 셋만 답이 오고 나머지가 조용한 것이
  // 이 앱이 계속 고쳐 온 실패다. 안 돈 것은 안 돌았다고 남아야 한다.
  it("실패한 의존에 걸린 것들이 이유와 함께 남는다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"]), T("c", ["b"])]);
    g.start("a");
    g.settle("a", fail);
    expect(g.finished()).toBe(true);
    const r = g.report();
    expect(r.failed).toEqual(["a"]);
    expect(r.skipped).toEqual([
      { id: "b", cause: { kind: "dep-failed", dep: "a" } },
      { id: "c", cause: { kind: "dep-skipped", dep: "b" } },
    ]);
    expect(r.open).toEqual([]);
  });

  it("직접 원인은 하나다 — 스무 개가 막혀도 원인이 스무 개가 되지 않는다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"]), T("c", ["a"]), T("d", ["b", "c"])]);
    g.start("a"); g.settle("a", fail);
    const r = g.report();
    const direct = r.skipped.filter(s => s.cause.kind === "dep-failed").map(s => s.id);
    expect(direct).toEqual(["b", "c"]);
    expect(r.skipped.find(s => s.id === "d")!.cause).toEqual({ kind: "dep-skipped", dep: "b" });
  });

  it("무너진 가지만 막고 옆 가지는 계속 돈다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"]), T("x"), T("y", ["x"])]);
    g.start("a"); g.start("x");
    g.settle("a", fail);
    expect(g.ready(10)).toEqual([]);        // x 아직 돎
    g.settle("x", ok("좋음"));
    expect(g.ready(10).map(d => d.id)).toEqual(["y"]);
  });

  it("답을 못 받은 것(timeout)은 실패다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"])]);
    g.start("a"); g.settle("a", timeout);
    expect(g.state("a")!.status).toBe("failed");
    expect(g.report().skipped[0]!.cause).toEqual({ kind: "dep-failed", dep: "a" });
  });

  it("중단된 의존은 실패와 구분해서 남는다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"])]);
    g.start("a"); g.settle("a", { status: "aborted" });
    const r = g.report();
    expect(r.aborted).toEqual(["a"]);
    expect(r.skipped).toEqual([{ id: "b", cause: { kind: "dep-aborted", dep: "a" } }]);
  });

  // 돌긴 돌았는데 아무 말도 안 한 것. 뒤는 계속 가되, 보고에서는 성공과 안 섞인다.
  it("아무 말도 안 한 것은 뒤를 막지 않지만 done 과 섞이지 않는다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"])]);
    g.start("a"); g.settle("a", empty);
    expect(g.ready(10).map(d => d.id)).toEqual(["b"]);
    const r = g.report();
    expect(r.done).toEqual([]);
    expect(r.empty).toEqual(["a"]);
  });

  it("중간에 물어보면 안 끝난 것이 open 에 담긴다", () => {
    const g = new Orchestra([T("a"), T("b")]);
    g.start("a");
    expect(g.report().open).toEqual(["a", "b"]);
  });

  it("통째로 중단하면 남은 것이 전부 닫힌다", () => {
    const g = new Orchestra([T("a"), T("b"), T("c", ["a"])]);
    g.start("a"); g.start("b");
    g.settle("b", ok("됨"));
    g.abortAll();
    expect(g.finished()).toBe(true);
    const r = g.report();
    expect(r.done).toEqual(["b"]);
    expect(r.aborted).toEqual(["a"]);
    expect(r.skipped.map(s => s.id)).toEqual(["c"]);
    expect(r.open).toEqual([]);
  });

  it("끝난 것은 중단이 건드리지 않는다", () => {
    const g = new Orchestra([T("a")]);
    g.start("a"); g.settle("a", ok("x"));
    g.abortAll();
    expect(g.state("a")!.status).toBe("done");
  });
});

describe("inputsFor", () => {
  it("의존의 결과를 의존 순서대로 낸다", () => {
    const g = new Orchestra([T("a"), T("b"), T("c", ["a", "b"])]);
    g.start("a"); g.settle("a", ok("하나"));
    g.start("b"); g.settle("b", ok("둘"));
    expect(g.inputsFor("c")).toEqual([{ id: "a", text: "하나" }, { id: "b", text: "둘" }]);
  });

  // 빼 버리면 부르는 쪽이 "그런 의존은 없었다" 로 읽는다.
  it("아무 말도 안 한 의존도 자리를 남긴다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"])]);
    g.start("a"); g.settle("a", empty);
    expect(g.inputsFor("b")).toEqual([{ id: "a", text: "" }]);
  });

  it("아직 안 끝난 의존도 자리를 남긴다", () => {
    const g = new Orchestra([T("a"), T("b", ["a"])]);
    expect(g.inputsFor("b")).toEqual([{ id: "a", text: "" }]);
  });

  it("의존이 없으면 빈 목록, 모르는 id 도 빈 목록", () => {
    const g = new Orchestra([T("a")]);
    expect(g.inputsFor("a")).toEqual([]);
    expect(g.inputsFor("zz")).toEqual([]);
  });
});

describe("states_", () => {
  it("정의 순서 그대로 낸다", () => {
    const g = new Orchestra([T("z"), T("y")]);
    expect(g.states_().map(s => s.id)).toEqual(["z", "y"]);
    expect(g.states_().map(s => s.status)).toEqual(["pending", "pending"]);
    expect(g.states_()[0]!.agent).toBe("a:z");
  });
});

describe("한 판 끝까지", () => {
  // 부르는 쪽의 순환을 그대로 흉내낸다. 동시 상한 2 에서 다섯 개짜리 그래프.
  it("팬아웃 후 합치기", () => {
    const defs = [T("s1"), T("s2"), T("s3"), T("merge", ["s1", "s2", "s3"]), T("post", ["merge"])];
    expect(planTasks(defs).kind).toBe("ok");
    const g = new Orchestra(defs);
    const LIMIT = 2;
    const inflight: string[] = [];
    const started: string[][] = [];
    let guard = 0;
    while (!g.finished() && guard++ < 20) {
      const batch = g.ready(LIMIT - inflight.length);
      if (batch.length > 0) started.push(batch.map(d => d.id));
      for (const d of batch) { g.start(d.id); inflight.push(d.id); }
      const next = inflight.shift();
      if (next === undefined) break;
      g.settle(next, ok("r:" + next));
    }
    expect(started).toEqual([["s1", "s2"], ["s3"], ["merge"], ["post"]]);
    expect(g.finished()).toBe(true);
    const r = g.report();
    expect(r.done).toEqual(["s1", "s2", "s3", "merge", "post"]);
    expect(r.total).toBe(5);
  });
});
