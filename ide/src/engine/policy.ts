import type { AgentId, DelegationRequest, RejectReason } from "./types";

export interface PolicyConfig {
  /** 위임 깊이 상한. 1 = 관리자만 위임 가능(현재 구조가 우연히 그런 상태를 명시화). */
  maxDepth: number;
  maxDelegationsPerTurn: number;
  maxConcurrentDelegations: number;
  maxRoundsPerRun: number;
  /** 하위 실행이 안 끝날 때 관리자를 놓아주는 상한. */
  delegationTimeoutMs: number;
  allowSelfDelegation: boolean;
  allowDuplicateTargetPerTurn: boolean;
}

/**
 * 기본값은 전부 **검증되지 않은 값**이다. 조사에서 확인했듯 published 임계값
 * (10파일 / 3작업 / 30초 vs 2분)은 모두 벤더 휴리스틱이고 측정 근거가 없다.
 * Stage 5 에서 원장 계측으로 우리 데이터로 대체한다. 그때까지는 보수적으로 잡는다.
 */
export const DEFAULT_POLICY: PolicyConfig = {
  maxDepth: 1,
  maxDelegationsPerTurn: 3,
  maxConcurrentDelegations: 3,
  maxRoundsPerRun: 8,
  delegationTimeoutMs: 180_000,
  allowSelfDelegation: false,
  allowDuplicateTargetPerTurn: false,
};

/**
 * 정책이 판단에 필요한 전부. 스냅샷으로 받으므로 policy.ts 는 아무것도 import 하지 않고,
 * 테스트는 리터럴 객체 하나로 모든 경우를 만들 수 있다.
 */
export interface PolicySnapshot {
  knownAgents: readonly AgentId[];
  configuredAgents: readonly AgentId[];
  busyAgents: readonly AgentId[];
  /** 부모 실행의 depth. 루트(관리자)는 0. */
  parentDepth: number;
  /** 루트→부모 agentId 사슬. 사이클 판정용. */
  parentChain: readonly AgentId[];
  /** 이번 턴에 이미 위임한 대상들(거절 제외). */
  delegationsThisTurn: readonly AgentId[];
  openDelegations: number;
}

/**
 * 판별자를 문자열로 둔다. `{allow:true}|{allow:false;reason}` 형태는 루트 tsconfig
 * (strict:false)에서 좁혀지지 않아 `decision.reason` 이 컴파일 오류가 난다.
 * App.tsx 는 루트 설정으로 검사되므로 여기서 소비 가능한 형태여야 한다.
 */
export type PolicyDecision = { kind: "allow" } | { kind: "reject"; reason: RejectReason };

/**
 * 검사 순서가 계약의 일부다 — 테스트가 이 순서를 고정한다.
 *
 * agent-busy 를 마지막에 두는 이유: 유일하게 시간에 따라 변하는 조건이라,
 * 구조적 거절이 먼저 이겨야 같은 입력에 같은 오류 메시지가 나온다.
 * (에이전트 이름을 잘못 적었는데 "지금 바빠요" 라고 답하면 모델이 엉뚱하게 재시도한다.)
 */
export function evaluateDelegation(
  cfg: PolicyConfig,
  snap: PolicySnapshot,
  req: DelegationRequest,
): PolicyDecision {
  if (!cfg.allowSelfDelegation && req.toAgent === req.fromAgent) {
    return { kind: "reject", reason: "self-delegation" };
  }
  if (!snap.knownAgents.includes(req.toAgent)) {
    return { kind: "reject", reason: "unknown-agent" };
  }
  if (!snap.configuredAgents.includes(req.toAgent)) {
    return { kind: "reject", reason: "not-configured" };
  }
  if (snap.parentDepth + 1 > cfg.maxDepth) {
    return { kind: "reject", reason: "depth-exceeded" };
  }
  // 사슬의 마지막은 위임하는 당사자다. 그건 self-delegation 스위치가 따로 관장하므로
  // 사이클 판정에서는 빼야 한다. 안 그러면 자기 자신이 늘 사슬에 있어서
  // allowSelfDelegation 을 켜도 여기서 막히는 죽은 스위치가 된다.
  // cycle 은 A→B→A 처럼 **조상**으로 되돌아가는 경우만 가리킨다.
  const ancestors = snap.parentChain.slice(0, -1);
  if (wouldCycle(ancestors, req.toAgent)) {
    return { kind: "reject", reason: "cycle" };
  }
  if (!cfg.allowDuplicateTargetPerTurn && snap.delegationsThisTurn.includes(req.toAgent)) {
    return { kind: "reject", reason: "duplicate-target" };
  }
  if (snap.delegationsThisTurn.length >= cfg.maxDelegationsPerTurn) {
    return { kind: "reject", reason: "per-turn-cap" };
  }
  if (snap.openDelegations >= cfg.maxConcurrentDelegations) {
    return { kind: "reject", reason: "concurrency-cap" };
  }
  if (snap.busyAgents.includes(req.toAgent)) {
    return { kind: "reject", reason: "agent-busy" };
  }
  return { kind: "allow" };
}

/**
 * 대상이 **조상** 목록에 있으면 사이클이다 (A→B→A).
 *
 * `ancestors` 는 위임하는 당사자를 **뺀** 사슬이어야 한다 — 자기 자신으로의 위임은
 * allowSelfDelegation 이 관장하는 별개 사안이다. evaluateDelegation 이 slice 해서 넘긴다.
 *
 * maxDepth 가 1 인 동안은 도달 불가능한 상태다 — 하위 에이전트는 delegate_task 를
 * 아예 못 받으므로. 그래도 술어와 테스트는 만들어 둔다. 조사에서 이 영역
 * (깊이 제한·사이클 감지·예산 상속)은 문헌이 전무했으므로, 축출·백오프 같은
 * 기계장치는 실제 필요가 생길 때까지 만들지 않는다.
 */
export function wouldCycle(ancestors: readonly AgentId[], target: AgentId): boolean {
  return ancestors.includes(target);
}
