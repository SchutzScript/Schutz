import type {
  AgentId,
  Clock,
  DelegationId,
  DelegationOutcome,
  DelegationRequest,
  IdSource,
  RejectReason,
  RunId,
} from "./types";

export type LedgerEvent =
  | {
      seq: number;
      at: number;
      kind: "requested";
      delegationId: DelegationId;
      parentRunId: RunId;
      fromAgent: AgentId;
      toAgent: AgentId;
      task: string;
      depth: number;
    }
  | { seq: number; at: number; kind: "rejected"; delegationId: DelegationId; reason: RejectReason }
  | { seq: number; at: number; kind: "started"; delegationId: DelegationId; childRunId: RunId }
  | { seq: number; at: number; kind: "settled"; delegationId: DelegationId; outcome: DelegationOutcome };

/** 유니온의 각 variant 에 분배되는 Omit. 그냥 Omit 을 쓰면 공통 키만 남는다. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type DelegationState = "requested" | "rejected" | "running" | "settled";

export interface DelegationView {
  delegationId: DelegationId;
  parentRunId: RunId;
  fromAgent: AgentId;
  toAgent: AgentId;
  task: string;
  depth: number;
  state: DelegationState;
  childRunId: RunId | null;
  outcome: DelegationOutcome | null;
  rejection: RejectReason | null;
  requestedAt: number;
  settledAt: number | null;
}

/**
 * 위임 원장 — 추가 전용.
 *
 * 존재 이유: "관리자가 위임했는가" 를 **산문 신뢰에서 기계 조회로** 바꾸는 것.
 * 예전에는 루프 지역 변수 `delegated` 하나로 판정했는데, 그 플래그는 execTool 이
 * 실행되기 **전에** 켜졌다. 그래서 알 수 없는 에이전트·미연결·이미 작업 중 —
 * 세 오류 반환 모두 "위임함" 으로 집계됐다. 사용자가 가장 방치되기 쉬운 경우가 정확히 거기다.
 *
 * didDelegate(실제로 하위 실행이 떴는가) 와 attemptedDelegate(부르기라도 했는가) 를
 * 분리한 게 그 버그를 표현 가능하게 만든 부분이다.
 */
export class DelegationLedger {
  private readonly ids: IdSource;
  private readonly clock: Clock;
  private readonly log: LedgerEvent[] = [];
  private readonly views = new Map<DelegationId, DelegationView>();
  private seq = 0;

  constructor(deps: { ids: IdSource; clock: Clock }) {
    this.ids = deps.ids;
    this.clock = deps.clock;
  }

  /**
   * Omit 은 유니온에 그냥 쓰면 공통 키만 남긴다(keyof 가 교집합이라).
   * 각 variant 에 분배되도록 조건부 타입으로 감싼다.
   */
  private push(e: DistOmit<LedgerEvent, "seq" | "at">): void {
    this.log.push({ ...e, seq: ++this.seq, at: this.clock.now() } as LedgerEvent);
  }

  request(req: DelegationRequest, depth: number): DelegationId {
    const delegationId = this.ids.next("d");
    const at = this.clock.now();
    this.log.push({
      seq: ++this.seq,
      at,
      kind: "requested",
      delegationId,
      parentRunId: req.parentRunId,
      fromAgent: req.fromAgent,
      toAgent: req.toAgent,
      task: req.task,
      depth,
    });
    this.views.set(delegationId, {
      delegationId,
      parentRunId: req.parentRunId,
      fromAgent: req.fromAgent,
      toAgent: req.toAgent,
      task: req.task,
      depth,
      state: "requested",
      childRunId: null,
      outcome: null,
      rejection: null,
      requestedAt: at,
      settledAt: null,
    });
    return delegationId;
  }

  reject(id: DelegationId, reason: RejectReason): void {
    const v = this.views.get(id);
    if (v === undefined || v.state !== "requested") return; // 순서가 어긋난 호출은 무시 (원장은 안 깨진다)
    this.push({ kind: "rejected", delegationId: id, reason });
    v.state = "rejected";
    v.rejection = reason;
    v.settledAt = this.clock.now();
  }

  start(id: DelegationId, childRunId: RunId): void {
    const v = this.views.get(id);
    if (v === undefined || v.state !== "requested") return;
    this.push({ kind: "started", delegationId: id, childRunId });
    v.state = "running";
    v.childRunId = childRunId;
  }

  settle(id: DelegationId, outcome: DelegationOutcome): void {
    const v = this.views.get(id);
    if (v === undefined || v.state === "settled" || v.state === "rejected") return;
    this.push({ kind: "settled", delegationId: id, outcome });
    v.state = "settled";
    v.outcome = outcome;
    v.settledAt = this.clock.now();
  }

  view(id: DelegationId): DelegationView | undefined {
    const v = this.views.get(id);
    return v === undefined ? undefined : { ...v };
  }

  forParent(runId: RunId): DelegationView[] {
    const out: DelegationView[] = [];
    for (const v of this.views.values()) if (v.parentRunId === runId) out.push({ ...v });
    return out;
  }

  /** 아직 결과가 안 난 것들 — 라운드 끝에서 모을 대상. */
  pendingFor(runId: RunId): DelegationView[] {
    return this.forParent(runId).filter(v => v.state === "requested" || v.state === "running");
  }

  /** 전역 동시 실행 수 — 동시성 상한 판정용. */
  openCount(): number {
    let n = 0;
    for (const v of this.views.values()) if (v.state === "requested" || v.state === "running") n++;
    return n;
  }

  /** 실제로 하위 실행이 떴는가. 거짓 주장 가드의 올바른 입력. */
  didDelegate(runId: RunId): boolean {
    return this.forParent(runId).some(v => v.childRunId !== null);
  }

  /** 부르기라도 했는가 (거절 포함). didDelegate 와의 차이가 곧 그 버그다. */
  attemptedDelegate(runId: RunId): boolean {
    return this.forParent(runId).length > 0;
  }

  allSettled(runId: RunId): boolean {
    return this.pendingFor(runId).length === 0;
  }

  /** 이 턴에 이미 위임한 대상들 — 중복 위임 판정용. */
  targetsFor(runId: RunId): AgentId[] {
    return this.forParent(runId)
      .filter(v => v.state !== "rejected")
      .map(v => v.toAgent);
  }

  /** 복사본을 돌려준다 — 호출자가 원장을 변조할 수 없게. */
  events(): readonly LedgerEvent[] {
    return this.log.slice();
  }

  reset(): void {
    this.log.length = 0;
    this.views.clear();
    this.seq = 0;
  }
}
