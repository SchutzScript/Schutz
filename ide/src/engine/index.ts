import { counterIds, systemClock } from "./ids";
import { DelegationLedger } from "./ledger";
import { DEFAULT_POLICY, evaluateDelegation, type PolicyConfig, type PolicySnapshot } from "./policy";
import { RunRegistry, type RunRecord } from "./runs";
import type { Clock, DelegationId, DelegationRequest, IdSource, RejectReason, RunId } from "./types";

export * from "./types";
export { RunRegistry, type RunRecord, type StartRunInput } from "./runs";
export { DelegationLedger, type DelegationView, type LedgerEvent, type DelegationState } from "./ledger";
export {
  DEFAULT_POLICY,
  evaluateDelegation,
  wouldCycle,
  type PolicyConfig,
  type PolicySnapshot,
  type PolicyDecision,
} from "./policy";
export { counterIds, fixedClock, systemClock } from "./ids";

/** requestDelegation 이 정책에 넘길 환경. parentDepth/parentChain 은 엔진이 채운다. */
export type DelegationEnv = Omit<PolicySnapshot, "parentDepth" | "parentChain" | "delegationsThisTurn" | "openDelegations">;

/**
 * 판별자는 문자열이어야 한다 — App.tsx 는 루트 tsconfig(strict:false)로 검사되는데
 * 거기선 `{ok:true}|{ok:false}` 형태가 좁혀지지 않아 `res.reason` 이 컴파일 오류가 난다.
 */
export type RequestDelegationResult =
  | { kind: "started"; delegationId: DelegationId; childRun: RunRecord }
  | { kind: "rejected"; delegationId: DelegationId; reason: RejectReason };

/**
 * 얇은 파사드. 상태는 전부 하위 모듈이 들고 있고, 여기서는 한 번의 호출로
 * 정책 판정 → 원장 기록 → 하위 실행 시작을 묶는 것만 한다.
 */
export class Engine {
  readonly runs: RunRegistry;
  readonly ledger: DelegationLedger;
  readonly policy: PolicyConfig;

  constructor(deps: { ids?: IdSource; clock?: Clock; policy?: Partial<PolicyConfig> } = {}) {
    const ids = deps.ids ?? counterIds();
    const clock = deps.clock ?? systemClock;
    this.runs = new RunRegistry({ ids, clock });
    this.ledger = new DelegationLedger({ ids, clock });
    this.policy = { ...DEFAULT_POLICY, ...deps.policy };
  }

  /**
   * 위임 요청 하나를 처리한다.
   *
   * 거절이어도 **원장에 남긴다** — attemptedDelegate 가 그걸 세고, 거절 사유는
   * App.tsx 가 i18n 으로 바꿔 모델에게 돌려준다. 조용히 실패하지 않는 게 요점.
   */
  requestDelegation(
    req: DelegationRequest,
    env: DelegationEnv,
    cancel: () => void,
    /**
     * 이 한 건에만 적용할 정책. 작업 그래프가 쓴다.
     *
     * per-turn 상한과 중복 대상 금지는 **계획 없이** 위임하는 모델을 묶으려고 둔 것이다.
     * 그래프는 돌리기 전에 검사받고 화면에 다 보이는 계획이라, 그 두 개를 그래프 자신의
     * 크기 제한으로 대신한다. 동시 실행 상한은 **안 푼다** — 그건 취향이 아니라
     * 파일 락과 요금이 걸린 진짜 자원 한계다.
     */
    override?: Partial<PolicyConfig>,
  ): RequestDelegationResult {
    const parent = this.runs.get(req.parentRunId);
    const snap: PolicySnapshot = {
      ...env,
      parentDepth: parent?.depth ?? 0,
      parentChain: parent ? this.runs.chain(req.parentRunId) : [req.fromAgent],
      delegationsThisTurn: this.ledger.targetsFor(req.parentRunId),
      openDelegations: this.ledger.openCount(),
    };

    const delegationId = this.ledger.request(req, snap.parentDepth + 1);
    const decision = evaluateDelegation(override ? { ...this.policy, ...override } : this.policy, snap, req);
    if (decision.kind === "reject") {
      this.ledger.reject(delegationId, decision.reason);
      return { kind: "rejected", delegationId, reason: decision.reason };
    }

    const childRun = this.runs.start({
      agentId: req.toAgent,
      role: "sub",
      parentRunId: req.parentRunId,
      delegationId,
      cancel,
    });
    this.ledger.start(delegationId, childRun.runId);
    return { kind: "started", delegationId, childRun };
  }

  /** 프로젝트 전환·/clear — 실행과 원장이 프로젝트를 넘어 새지 않게. */
  reset(): void {
    this.runs.reset();
    this.ledger.reset();
  }
}

export function createEngine(deps?: {
  ids?: IdSource;
  clock?: Clock;
  policy?: Partial<PolicyConfig>;
}): Engine {
  return new Engine(deps);
}
