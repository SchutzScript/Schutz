import { describe, expect, it } from "vitest";
import { createEngine, type DelegationEnv } from "./index";
import { counterIds, fixedClock } from "./ids";

function eng() {
  return createEngine({ ids: counterIds(), clock: fixedClock(1000, 10) });
}

const env: DelegationEnv = {
  knownAgents: ["claude", "gpt", "grok"],
  configuredAgents: ["claude", "gpt", "grok"],
  busyAgents: [],
};

const noop = () => {};

describe("Engine.requestDelegation", () => {
  it("허용되면 하위 실행이 뜨고 원장이 started 를 기록한다", () => {
    const e = eng();
    const mgr = e.runs.start({ agentId: "claude", role: "manager", cancel: noop });

    const res = e.requestDelegation(
      { parentRunId: mgr.runId, fromAgent: "claude", toAgent: "gpt", task: "일" },
      env,
      noop,
    );

    expect(res.kind).toBe("started");
    if (res.kind !== "started") return;
    expect(res.childRun.agentId).toBe("gpt");
    expect(res.childRun.parentRunId).toBe(mgr.runId);
    expect(res.childRun.depth).toBe(1);
    expect(e.ledger.didDelegate(mgr.runId)).toBe(true);
  });

  it("거절돼도 원장에 남는다 — 조용히 실패하지 않는다", () => {
    const e = eng();
    const mgr = e.runs.start({ agentId: "claude", role: "manager", cancel: noop });

    const res = e.requestDelegation(
      { parentRunId: mgr.runId, fromAgent: "claude", toAgent: "claude", task: "일" },
      env,
      noop,
    );

    expect(res).toMatchObject({ kind: "rejected", reason: "self-delegation" });
    expect(e.ledger.attemptedDelegate(mgr.runId)).toBe(true);
    expect(e.ledger.didDelegate(mgr.runId)).toBe(false);
    expect(e.runs.hasActiveAgentRuns()).toBe(true); // 관리자만 살아 있다
  });

  it("이미 도는 에이전트에는 agent-busy 로 거절", () => {
    const e = eng();
    const mgr = e.runs.start({ agentId: "claude", role: "manager", cancel: noop });
    e.runs.start({ agentId: "gpt", role: "sub", cancel: noop }); // gpt 가 이미 바쁨

    const res = e.requestDelegation(
      { parentRunId: mgr.runId, fromAgent: "claude", toAgent: "gpt", task: "일" },
      { ...env, busyAgents: ["gpt"] },
      noop,
    );
    expect(res).toMatchObject({ kind: "rejected", reason: "agent-busy" });
  });

  it("턴 예산은 원장에서 읽는다 — 4번째 위임이 막힌다", () => {
    const e = eng();
    const mgr = e.runs.start({ agentId: "claude", role: "manager", cancel: noop });
    const wide: DelegationEnv = {
      knownAgents: ["claude", "a", "b", "c", "d"],
      configuredAgents: ["claude", "a", "b", "c", "d"],
      busyAgents: [],
    };

    for (const to of ["a", "b", "c"]) {
      expect(
        e.requestDelegation({ parentRunId: mgr.runId, fromAgent: "claude", toAgent: to, task: "일" }, wide, noop).kind,
      ).toBe("started");
    }
    const fourth = e.requestDelegation(
      { parentRunId: mgr.runId, fromAgent: "claude", toAgent: "d", task: "일" },
      wide,
      noop,
    );
    expect(fourth).toMatchObject({ kind: "rejected", reason: "per-turn-cap" });
  });

  it("거절은 턴 예산을 소모하지 않는다", () => {
    const e = eng();
    const mgr = e.runs.start({ agentId: "claude", role: "manager", cancel: noop });

    // 이름 오타 3번 — 예산을 태우면 안 된다
    for (let i = 0; i < 3; i++) {
      e.requestDelegation(
        { parentRunId: mgr.runId, fromAgent: "claude", toAgent: "오타" + i, task: "일" },
        env,
        noop,
      );
    }
    const real = e.requestDelegation(
      { parentRunId: mgr.runId, fromAgent: "claude", toAgent: "gpt", task: "일" },
      env,
      noop,
    );
    expect(real.kind).toBe("started");
  });

  it("reset 은 실행과 원장을 함께 비운다 — 프로젝트 전환 시 누수 방지", () => {
    const e = eng();
    const mgr = e.runs.start({ agentId: "claude", role: "manager", cancel: noop });
    e.requestDelegation({ parentRunId: mgr.runId, fromAgent: "claude", toAgent: "gpt", task: "일" }, env, noop);

    e.reset();
    expect(e.runs.hasActiveAgentRuns()).toBe(false);
    expect(e.ledger.events()).toHaveLength(0);
    expect(e.ledger.attemptedDelegate(mgr.runId)).toBe(false);
  });
});
