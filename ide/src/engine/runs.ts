import type { AgentId, Clock, DelegationId, IdSource, RunId, RunRole, RunStatus } from "./types";

export interface RunRecord {
  runId: RunId;
  agentId: AgentId;
  role: RunRole;
  parentRunId: RunId | null;
  depth: number;
  delegationId: DelegationId | null;
  startedAt: number;
  endedAt: number | null;
  status: RunStatus;
}

export interface StartRunInput {
  agentId: AgentId;
  role: RunRole;
  parentRunId?: RunId | null;
  delegationId?: DelegationId | null;
  /** 취소 훅. AbortController 를 직접 들고 있지 않는 건 import 0 규칙 때문. */
  cancel: () => void;
}

const AGENT_ROLES: readonly RunRole[] = ["manager", "sub"];

/**
 * 실행 레지스트리 — **runId 로 키잉**한다.
 *
 * 예전에는 abortCtls 가 agentId 로 키잉돼 있었고, 그게 중지→재위임 레이스의 뿌리였다:
 * stopAgent 가 컨트롤러를 먼저 지우면, 죽어가는 루프의 finally 가 그 사이 같은 agentId 로
 * 시작된 **새 실행**에 대해 정리를 수행했다(락 해제, 상태 덮어쓰기).
 *
 * 여기서는 죽어가는 실행이 finish(myRunId) 를 부르고, 그게 false 면 자기 정리를 통째로
 * 건너뛴다. 레이스가 레이스가 아니게 된다.
 */
export class RunRegistry {
  private readonly ids: IdSource;
  private readonly clock: Clock;
  private readonly runs = new Map<RunId, RunRecord>();
  private readonly cancels = new Map<RunId, () => void>();
  /** agentId → 그 에이전트의 현재 실행. 새 실행이 시작되면 덮어써진다(= 이전 실행은 밀려남). */
  private readonly currentByAgent = new Map<AgentId, RunId>();

  constructor(deps: { ids: IdSource; clock: Clock }) {
    this.ids = deps.ids;
    this.clock = deps.clock;
  }

  start(input: StartRunInput): RunRecord {
    const parentRunId = input.parentRunId ?? null;
    const parent = parentRunId === null ? undefined : this.runs.get(parentRunId);
    const rec: RunRecord = {
      runId: this.ids.next("r"),
      agentId: input.agentId,
      role: input.role,
      parentRunId,
      depth: parent ? parent.depth + 1 : 0,
      delegationId: input.delegationId ?? null,
      startedAt: this.clock.now(),
      endedAt: null,
      status: "running",
    };
    this.runs.set(rec.runId, rec);
    this.cancels.set(rec.runId, input.cancel);
    this.currentByAgent.set(rec.agentId, rec.runId);
    return rec;
  }

  get(runId: RunId): RunRecord | undefined {
    return this.runs.get(runId);
  }

  currentRunFor(agentId: AgentId): RunRecord | undefined {
    const id = this.currentByAgent.get(agentId);
    return id === undefined ? undefined : this.runs.get(id);
  }

  isAgentBusy(agentId: AgentId): boolean {
    const cur = this.currentRunFor(agentId);
    return cur !== undefined && cur.status === "running";
  }

  /** 이 실행이 아직 그 에이전트의 현재 실행인가. 밀려났으면 false. */
  isCurrent(runId: RunId): boolean {
    const rec = this.runs.get(runId);
    if (rec === undefined) return false;
    return this.currentByAgent.get(rec.agentId) === runId;
  }

  /**
   * 실행 종료를 선언한다.
   *
   * **false 를 돌려주면 호출자는 자기 정리(락 해제·상태 갱신)를 전부 건너뛰어야 한다.**
   * 이미 끝났거나(중복 호출) 다른 실행에 밀려난 경우다 — 남의 실행을 정리하면 안 된다.
   */
  finish(runId: RunId, status: RunStatus): boolean {
    const rec = this.runs.get(runId);
    if (rec === undefined) return false;
    if (rec.endedAt !== null) return false; // 이미 종료됨
    const superseded = this.currentByAgent.get(rec.agentId) !== runId;
    rec.endedAt = this.clock.now();
    rec.status = status;
    this.cancels.delete(runId);
    if (!superseded) this.currentByAgent.delete(rec.agentId);
    return !superseded;
  }

  /** 실행을 취소한다. 레코드는 남긴다 — 감사와 밀려남 판정에 필요하다. */
  cancelRun(runId: RunId): boolean {
    const rec = this.runs.get(runId);
    if (rec === undefined || rec.endedAt !== null) return false;
    const cancel = this.cancels.get(runId);
    if (cancel !== undefined) {
      try {
        cancel();
      } catch {
        /* 취소 훅의 실패가 레지스트리를 망가뜨리면 안 된다 */
      }
    }
    return true;
  }

  /** agentId → 현재 실행을 찾아 취소. 취소한 runId 를 돌려준다. */
  cancelAgent(agentId: AgentId): RunId | null {
    const cur = this.currentRunFor(agentId);
    if (cur === undefined || cur.endedAt !== null) return null;
    this.cancelRun(cur.runId);
    return cur.runId;
  }

  /** 전체 또는 특정 역할만 취소. 취소된 runId 목록. */
  cancelAll(roles?: readonly RunRole[]): RunId[] {
    const out: RunId[] = [];
    for (const rec of this.runs.values()) {
      if (rec.endedAt !== null) continue;
      if (roles !== undefined && !roles.includes(rec.role)) continue;
      if (this.cancelRun(rec.runId)) out.push(rec.runId);
    }
    return out;
  }

  activeRuns(roles?: readonly RunRole[]): RunRecord[] {
    const out: RunRecord[] = [];
    for (const rec of this.runs.values()) {
      if (rec.endedAt !== null) continue;
      if (roles !== undefined && !roles.includes(rec.role)) continue;
      out.push(rec);
    }
    return out;
  }

  /**
   * 에이전트 실행(manager|sub)이 하나라도 살아 있는가.
   * inline 편집·MCP 생성은 세어선 안 된다 — 예전에 키 접두어 문자열로 하던 판정이다.
   */
  hasActiveAgentRuns(): boolean {
    return this.activeRuns(AGENT_ROLES).length > 0;
  }

  /** 루트에서 이 실행까지의 agentId 사슬. 사이클 판정과 디버깅용. */
  chain(runId: RunId): AgentId[] {
    const out: AgentId[] = [];
    const seen = new Set<RunId>();
    let cur: RunRecord | undefined = this.runs.get(runId);
    while (cur !== undefined && !seen.has(cur.runId)) {
      seen.add(cur.runId);
      out.push(cur.agentId);
      cur = cur.parentRunId === null ? undefined : this.runs.get(cur.parentRunId);
    }
    return out.reverse();
  }

  /** 끝난 지 오래된 레코드를 버린다 — 긴 세션에서 메모리가 무한히 늘지 않게. */
  reap(olderThanMs: number, nowMs: number): number {
    let n = 0;
    for (const [id, rec] of [...this.runs.entries()]) {
      if (rec.endedAt !== null && nowMs - rec.endedAt > olderThanMs) {
        this.runs.delete(id);
        this.cancels.delete(id);
        n++;
      }
    }
    return n;
  }

  /** 프로젝트 전환·/clear 시 전부 비운다. */
  reset(): void {
    this.runs.clear();
    this.cancels.clear();
    this.currentByAgent.clear();
  }
}
