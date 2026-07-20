import { describe, expect, it, vi } from "vitest";
import { counterIds, fixedClock } from "./ids";
import { RunRegistry } from "./runs";

function reg() {
  return new RunRegistry({ ids: counterIds(), clock: fixedClock(1000, 10) });
}

const noop = () => {};

describe("RunRegistry — 중지 → 재위임 레이스", () => {
  // 이게 이 모듈이 존재하는 이유다.
  // 예전: abortCtls 가 agentId 로 키잉돼 있어서, stopAgent 가 컨트롤러를 먼저 지우면
  // 죽어가는 루프의 finally 가 그 사이 시작된 새 실행에 대해 정리를 수행했다.
  // 타이머 없이 결정론적으로 재현한다.
  it("밀려난 실행의 finish() 는 false — 호출자가 정리를 건너뛴다", () => {
    const r = reg();
    const run1 = r.start({ agentId: "claude", role: "manager", cancel: noop });

    r.cancelAgent("claude"); // 사용자가 중지를 누름
    const run2 = r.start({ agentId: "claude", role: "manager", cancel: noop }); // 곧바로 재실행

    // 뒤늦게 도착한 run1 의 finally
    expect(r.finish(run1.runId, "aborted")).toBe(false);

    // run2 는 멀쩡해야 한다 — 남의 정리에 휩쓸리면 안 된다
    expect(r.isCurrent(run2.runId)).toBe(true);
    expect(r.get(run2.runId)?.status).toBe("running");
    expect(r.hasActiveAgentRuns()).toBe(true);
  });

  it("자기 실행이 현재일 때만 finish() 가 true", () => {
    const r = reg();
    const run = r.start({ agentId: "gpt", role: "sub", cancel: noop });
    expect(r.finish(run.runId, "done")).toBe(true);
    expect(r.hasActiveAgentRuns()).toBe(false);
  });

  it("finish() 중복 호출은 false — 두 번 정리하지 않는다", () => {
    const r = reg();
    const run = r.start({ agentId: "gpt", role: "sub", cancel: noop });
    expect(r.finish(run.runId, "done")).toBe(true);
    expect(r.finish(run.runId, "done")).toBe(false);
  });

  it("cancelAgent 는 취소 훅을 부르고 runId 를 돌려준다", () => {
    const r = reg();
    const cancel = vi.fn();
    const run = r.start({ agentId: "claude", role: "manager", cancel });
    expect(r.cancelAgent("claude")).toBe(run.runId);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("취소 훅이 던져도 레지스트리는 안 망가진다", () => {
    const r = reg();
    const run = r.start({
      agentId: "claude",
      role: "manager",
      cancel: () => {
        throw new Error("boom");
      },
    });
    expect(() => r.cancelAgent("claude")).not.toThrow();
    expect(r.finish(run.runId, "aborted")).toBe(true);
  });
});

describe("RunRegistry — 역할 구분", () => {
  // 예전에는 abortCtls 키 접두어(`"__mcpgen"`, `"__inline:"`)를 문자열로 스니핑해서
  // "에이전트가 아직 도나" 를 판정했다. 그 의미를 타입으로 올렸다.
  it("hasActiveAgentRuns 는 inline/system 을 세지 않는다", () => {
    const r = reg();
    r.start({ agentId: "__inline", role: "inline", cancel: noop });
    r.start({ agentId: "__mcpgen", role: "system", cancel: noop });
    expect(r.hasActiveAgentRuns()).toBe(false);

    const mgr = r.start({ agentId: "claude", role: "manager", cancel: noop });
    expect(r.hasActiveAgentRuns()).toBe(true);

    r.finish(mgr.runId, "done");
    expect(r.hasActiveAgentRuns()).toBe(false); // inline/system 이 남아 있어도
  });

  it("cancelAll 은 역할로 거를 수 있다", () => {
    const r = reg();
    r.start({ agentId: "claude", role: "manager", cancel: noop });
    r.start({ agentId: "gpt", role: "sub", cancel: noop });
    const inline = r.start({ agentId: "__inline", role: "inline", cancel: noop });

    const cancelled = r.cancelAll(["manager", "sub"]);
    expect(cancelled).toHaveLength(2);
    expect(r.get(inline.runId)?.endedAt).toBeNull();
  });
});

describe("RunRegistry — depth 와 사슬", () => {
  it("자식의 depth 는 부모+1, chain 은 루트→리프", () => {
    const r = reg();
    const root = r.start({ agentId: "claude", role: "manager", cancel: noop });
    const child = r.start({ agentId: "gpt", role: "sub", parentRunId: root.runId, cancel: noop });
    const grand = r.start({ agentId: "grok", role: "sub", parentRunId: child.runId, cancel: noop });

    expect(root.depth).toBe(0);
    expect(child.depth).toBe(1);
    expect(grand.depth).toBe(2);
    expect(r.chain(grand.runId)).toEqual(["claude", "gpt", "grok"]);
  });

  it("isAgentBusy 는 끝난 실행을 바쁨으로 보지 않는다", () => {
    const r = reg();
    const run = r.start({ agentId: "gpt", role: "sub", cancel: noop });
    expect(r.isAgentBusy("gpt")).toBe(true);
    r.finish(run.runId, "done");
    expect(r.isAgentBusy("gpt")).toBe(false);
  });
});
