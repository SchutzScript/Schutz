import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, evaluateDelegation, wouldCycle, type PolicySnapshot } from "./policy";
import type { DelegationRequest, RejectReason } from "./types";

const base: PolicySnapshot = {
  knownAgents: ["claude", "gpt", "grok", "glm"],
  configuredAgents: ["claude", "gpt", "grok"],
  busyAgents: [],
  parentDepth: 0,
  parentChain: ["claude"],
  delegationsThisTurn: [],
  openDelegations: 0,
};

const req: DelegationRequest = {
  parentRunId: "r1",
  fromAgent: "claude",
  toAgent: "gpt",
  task: "일",
};

function decide(snap: Partial<PolicySnapshot> = {}, over: Partial<DelegationRequest> = {}) {
  return evaluateDelegation(DEFAULT_POLICY, { ...base, ...snap }, { ...req, ...over });
}

describe("evaluateDelegation — 사유별", () => {
  it("정상 요청은 통과", () => {
    expect(decide()).toEqual({ kind: "allow" });
  });

  const cases: Array<[RejectReason, Partial<PolicySnapshot>, Partial<DelegationRequest>]> = [
    ["self-delegation", {}, { toAgent: "claude" }],
    ["unknown-agent", {}, { toAgent: "없는에이전트" }],
    ["not-configured", {}, { toAgent: "glm" }], // known 이지만 configured 아님
    ["depth-exceeded", { parentDepth: 1 }, {}],
    ["duplicate-target", { delegationsThisTurn: ["gpt"] }, {}],
    ["per-turn-cap", { delegationsThisTurn: ["grok", "glm", "x"] }, {}],
    ["concurrency-cap", { openDelegations: 3 }, {}],
    ["agent-busy", { busyAgents: ["gpt"] }, {}],
  ];

  for (const [reason, snap, over] of cases) {
    it(`${reason} 을 거절한다`, () => {
      expect(decide(snap, over)).toEqual({ kind: "reject", reason });
    });
  }
});

describe("evaluateDelegation — 검사 순서가 계약이다", () => {
  // agent-busy 를 마지막에 두는 이유: 유일하게 시간에 따라 변하는 조건이라
  // 구조적 거절이 먼저 이겨야 같은 입력에 같은 오류가 나온다.
  // 이름을 잘못 적었는데 "지금 바빠요" 라고 답하면 모델이 엉뚱하게 재시도한다.
  it("self-delegation 이 unknown-agent 를 이긴다", () => {
    expect(decide({ knownAgents: ["gpt"] }, { toAgent: "claude" })).toEqual({
      kind: "reject",
      reason: "self-delegation",
    });
  });

  it("unknown-agent 가 not-configured 를 이긴다", () => {
    expect(decide({ knownAgents: [], configuredAgents: [] })).toEqual({
      kind: "reject",
      reason: "unknown-agent",
    });
  });

  it("depth-exceeded 가 agent-busy 를 이긴다", () => {
    expect(decide({ parentDepth: 5, busyAgents: ["gpt"] })).toEqual({
      kind: "reject",
      reason: "depth-exceeded",
    });
  });

  it("duplicate-target 이 per-turn-cap 을 이긴다", () => {
    expect(decide({ delegationsThisTurn: ["gpt", "grok", "glm"] })).toEqual({
      kind: "reject",
      reason: "duplicate-target",
    });
  });

  it("구조적 거절 전부가 agent-busy 를 이긴다", () => {
    expect(decide({ openDelegations: 99, busyAgents: ["gpt"] })).toEqual({
      kind: "reject",
      reason: "concurrency-cap",
    });
  });
});

describe("maxDepth 는 지금 구조를 명시화한 것", () => {
  // 현재 하위 에이전트는 DELEGATE_TOOL 을 못 받아 depth 가 우연히 1로 묶여 있다.
  // 그 암묵적 사실을 바꿀 수 있는 규칙으로 만든 것.
  it("maxDepth 1 이면 손자 위임이 막힌다", () => {
    expect(evaluateDelegation(DEFAULT_POLICY, { ...base, parentDepth: 1 }, req)).toEqual({
      kind: "reject",
      reason: "depth-exceeded",
    });
  });

  it("maxDepth 2 로 올리면 허용된다", () => {
    expect(
      evaluateDelegation({ ...DEFAULT_POLICY, maxDepth: 2 }, { ...base, parentDepth: 1 }, req),
    ).toEqual({ kind: "allow" });
  });
});

describe("사이클 — 자기 위임과 구분된다", () => {
  // 테스트가 잡아낸 설계 결함: 사슬의 마지막은 위임하는 당사자라, 사슬 전체로 판정하면
  // 자기 자신이 늘 포함돼 allowSelfDelegation 이 죽은 스위치가 됐다.
  // cycle 은 조상으로 되돌아가는 경우만 가리킨다.
  const deep = { ...DEFAULT_POLICY, maxDepth: 2 };

  it("A→B→A 는 사이클", () => {
    expect(
      evaluateDelegation(
        deep,
        { ...base, parentDepth: 1, parentChain: ["claude", "gpt"] },
        { ...req, fromAgent: "gpt", toAgent: "claude" },
      ),
    ).toEqual({ kind: "reject", reason: "cycle" });
  });

  it("A→B→C 는 사이클이 아니다", () => {
    expect(
      evaluateDelegation(
        deep,
        { ...base, parentDepth: 1, parentChain: ["claude", "gpt"] },
        { ...req, fromAgent: "gpt", toAgent: "grok" },
      ),
    ).toEqual({ kind: "allow" });
  });

  it("자기 자신은 사이클이 아니라 self-delegation 으로 잡힌다", () => {
    expect(
      evaluateDelegation(
        deep,
        { ...base, parentDepth: 1, parentChain: ["claude", "gpt"] },
        { ...req, fromAgent: "gpt", toAgent: "gpt" },
      ),
    ).toEqual({ kind: "reject", reason: "self-delegation" });
  });

  it("wouldCycle 은 조상 목록에 대한 단순 술어", () => {
    expect(wouldCycle(["claude"], "claude")).toBe(true);
    expect(wouldCycle(["claude"], "gpt")).toBe(false);
    expect(wouldCycle([], "claude")).toBe(false);
  });
});

describe("설정 스위치", () => {
  it("allowSelfDelegation 을 켜면 자기 위임이 통과", () => {
    expect(
      evaluateDelegation({ ...DEFAULT_POLICY, allowSelfDelegation: true }, base, {
        ...req,
        toAgent: "claude",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("allowDuplicateTargetPerTurn 을 켜면 중복 대상이 통과", () => {
    expect(
      evaluateDelegation(
        { ...DEFAULT_POLICY, allowDuplicateTargetPerTurn: true },
        { ...base, delegationsThisTurn: ["gpt"] },
        req,
      ),
    ).toEqual({ kind: "allow" });
  });
});
