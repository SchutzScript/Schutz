// 여러 위임을 하나의 작업 그래프로 묶는 층.
//
// 아래층(runs.ts / policy.ts)은 **위임 한 건**을 다룬다 — 이 에이전트를 불러도 되나,
// 지금 바쁜가, 깊이가 넘치나. 그 한 건을 여러 개 엮어 "A 와 B 를 동시에 돌리고, 둘 다
// 끝나면 C 에게 그 결과를 넘긴다" 를 만드는 자리가 여기다.
//
// **약속을 만들지 않는다.** Promise·타이머·await 이 하나도 없다. 이건 부르는 쪽이
// 손으로 돌리는 상태 기계다: 지금 시작해도 되는 것을 물어보고(ready), 시작했다고
// 알려주고(start), 끝났다고 알려준다(settle). 그래서 시간이 안 흐르는 테스트에서
// 모든 경합을 재현할 수 있고, engine/ 의 import 0 규칙도 그대로 지킨다.
//
// 이 파일이 지키는 선이 하나 더 있다. **안 돈 작업을 없던 일로 만들지 않는다.**
// 의존이 실패해서 못 돈 것, 그 뒤에 딸려 막힌 것, 돌긴 돌았는데 아무 말도 안 한 것을
// 전부 구분해서 남긴다. 여덟 개를 시켰는데 셋만 답이 오고 나머지는 조용한 것이
// 이 앱이 계속 고쳐 온 바로 그 실패다.

import type { AgentId, DelegationOutcome } from "./types";

export type TaskId = string;

export interface TaskDef {
  id: TaskId;
  agent: AgentId;
  /** 이 에이전트에게 시킬 말. */
  task: string;
  /** 먼저 끝나야 하는 작업들. 빈 배열이면 처음부터 돌 수 있다. */
  needs: readonly TaskId[];
}

/**
 * 작업의 최종 상태.
 *
 * `empty` 를 `done` 과 굳이 나눠 둔다 — 돌긴 돌았는데 아무것도 안 낸 것과 결과를 낸 것은
 * 다르다. 합쳐 버리면 뒤 작업이 빈 입력을 받고도 "앞이 잘 끝났다" 고 읽는다.
 * `skipped` 는 의존이 무너져 **시작조차 안 한** 것이다.
 */
export type TaskStatus = "pending" | "running" | "done" | "empty" | "failed" | "skipped" | "aborted";

/** 왜 안 돌았나. 직접 원인과 딸려 막힌 것을 구분한다 — 원인 하나에 스무 개가 막혔을 때
 *  스무 개를 다 원인처럼 보고하면 진짜 원인이 묻힌다. */
export type SkipCause =
  | { kind: "dep-failed"; dep: TaskId }
  | { kind: "dep-skipped"; dep: TaskId }
  | { kind: "dep-aborted"; dep: TaskId };

export interface TaskState {
  id: TaskId;
  agent: AgentId;
  status: TaskStatus;
  /** 끝났으면 아래층이 준 결과 그대로. 안 끝났으면 null. */
  outcome: DelegationOutcome | null;
  /** skipped 일 때만 채워진다. */
  skipped: SkipCause | null;
}

/** 그래프가 성립하지 않는 이유. 전부 짜는 쪽의 실수라 돌리기 전에 걸러야 한다. */
export type PlanError =
  | { kind: "duplicate-id"; id: TaskId }
  | { kind: "unknown-dep"; id: TaskId; dep: TaskId }
  | { kind: "self-dep"; id: TaskId }
  | { kind: "cycle"; ids: readonly TaskId[] }
  | { kind: "empty-id"; at: number };

/**
 * 판별자를 문자열로 둔다. `{ok:true}|{ok:false}` 형태는 루트 tsconfig(strict:false)에서
 * 좀혀지지 않아 `r.error` 가 컴파일 오류가 된다 — App.tsx 가 그 설정으로 검사된다.
 * policy.ts 의 PolicyDecision 이 같은 이유로 같은 모양을 쓴다.
 */
export type PlanResult =
  | {
      kind: "ok";
      order: readonly TaskId[];
      /**
       * 동시에 돌 수 있는 것끼리 묶은 단. Kahn 이 어차피 만드는 것을 버리지 않고 낸다 —
       * 화면이 "이 셋을 같이 돌리고, 끝나면 이것" 을 그리려면 순서만으로는 모자란다.
       *
       * 실행 순서가 아니라 **구조**다. 실제로는 앞 단이 다 끝나기 전에도 의존만 맞으면
       * 다음 것이 뜨고(ready 가 그렇게 동다), 동시 상한 때문에 한 단이 나눠 돌기도 한다.
       */
      waves: readonly (readonly TaskId[])[];
    }
  | { kind: "bad"; error: PlanError };

/**
 * 그래프를 검사하고 위상 순서를 낸다.
 *
 * 순서는 **정의 순서를 최대한 지킨다** — 의존만 맞으면 적어 놓은 차례대로 나온다.
 * 화면에 그 순서로 그리게 되므로, 같은 그래프를 두 번 짜면 두 번 같은 그림이어야 한다.
 *
 * 사이클은 남은 것들을 그대로 실어 보낸다. "어딘가 순환이 있다" 만으로는 못 고친다.
 */
export function planTasks(defs: readonly TaskDef[]): PlanResult {
  const byId = new Map<TaskId, TaskDef>();
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]!;
    const id = String(d.id ?? "");
    if (!id) return { kind: "bad", error: { kind: "empty-id", at: i } };
    if (byId.has(id)) return { kind: "bad", error: { kind: "duplicate-id", id } };
    byId.set(id, d);
  }
  for (const d of defs) {
    for (const dep of d.needs) {
      if (dep === d.id) return { kind: "bad", error: { kind: "self-dep", id: d.id } };
      if (!byId.has(dep)) return { kind: "bad", error: { kind: "unknown-dep", id: d.id, dep } };
    }
  }

  // Kahn. 매 바퀴 **정의 순서로** 훑어 준비된 것을 담으므로 결과가 결정론적이다.
  const remaining = new Set(byId.keys());
  const order: TaskId[] = [];
  const waves: TaskId[][] = [];
  while (remaining.size > 0) {
    const wave: TaskId[] = [];
    for (const d of defs) {
      if (!remaining.has(d.id)) continue;
      if (d.needs.every(dep => !remaining.has(dep))) wave.push(d.id);
    }
    if (wave.length === 0) {
      return { kind: "bad", error: { kind: "cycle", ids: [...remaining] } };
    }
    for (const id of wave) remaining.delete(id);
    order.push(...wave);
    waves.push(wave);
  }
  return { kind: "ok", order, waves };
}

/** 끝난 작업들을 훑어 만든 보고. 부르는 쪽이 t() 로 렌더한다 — 여기서 산문을 만들지 않는다. */
export interface OrchestraReport {
  total: number;
  done: readonly TaskId[];
  /** 돌았지만 아무 말도 안 한 것. done 과 섞지 않는다. */
  empty: readonly TaskId[];
  failed: readonly TaskId[];
  aborted: readonly TaskId[];
  /** 시작조차 못 한 것과 그 이유. */
  skipped: readonly { id: TaskId; cause: SkipCause }[];
  /** 아직 안 끝난 것(pending·running). 중간에 물어보면 여기 담긴다. */
  open: readonly TaskId[];
}

/**
 * 작업 그래프 하나를 끝까지 끌고 가는 상태 기계.
 *
 * 부르는 쪽의 순환은 이렇게 생겼다:
 *
 * ```
 * const g = new Orchestra(defs);           // planTasks 가 통과한 defs 여야 한다
 * while (!g.finished()) {
 *   const batch = g.ready(freeSlots());    // 정책이 허락하는 만큼만
 *   if (batch.length === 0) break;         // 돌 게 없는데 안 끝났다 = 전부 남의 결과 대기
 *   for (const t of batch) { g.start(t.id); dispatch(t); }
 *   const { id, outcome } = await raceAnyFinished();
 *   g.settle(id, outcome);
 * }
 * g.report();
 * ```
 *
 * `ready` 가 빈 배열인데 `finished()` 도 아니면, 돌고 있는 것이 있다는 뜻이다.
 * 돌고 있는 것도 없는데 그렇다면 그건 버그가 아니라 **사이클**인데, planTasks 가
 * 이미 막았으므로 여기까지 오지 않는다.
 */
export class Orchestra {
  private readonly defs: readonly TaskDef[];
  private readonly byId: Map<TaskId, TaskDef>;
  private readonly states = new Map<TaskId, TaskState>();

  constructor(defs: readonly TaskDef[]) {
    this.defs = defs;
    this.byId = new Map(defs.map(d => [d.id, d]));
    for (const d of defs) {
      this.states.set(d.id, { id: d.id, agent: d.agent, status: "pending", outcome: null, skipped: null });
    }
  }

  get size(): number {
    return this.defs.length;
  }

  state(id: TaskId): TaskState | undefined {
    return this.states.get(id);
  }

  /** 화면용. 정의 순서 그대로. */
  states_(): TaskState[] {
    return this.defs.map(d => this.states.get(d.id)!);
  }

  runningCount(): number {
    let n = 0;
    for (const s of this.states.values()) if (s.status === "running") n++;
    return n;
  }

  /**
   * 지금 시작해도 되는 작업들. 의존이 **전부 성공**해야 준비된 것으로 본다.
   *
   * `limit` 은 지금 더 태울 수 있는 개수다 — 이미 돌고 있는 것은 부르는 쪽이 빼고 준다
   * (동시 실행 상한은 policy.ts 가 관장하지, 여기가 아니다).
   * 정의 순서로 낸다.
   */
  ready(limit: number): TaskDef[] {
    if (!(limit > 0)) return [];
    const out: TaskDef[] = [];
    for (const d of this.defs) {
      if (out.length >= limit) break;
      const s = this.states.get(d.id)!;
      if (s.status !== "pending") continue;
      if (d.needs.every(dep => this.satisfied(dep))) out.push(d);
    }
    return out;
  }

  /**
   * 의존으로서 통과인가. `empty` 도 통과다 — 돌긴 돌았다. 대신 보고에 남는다.
   *
   * 무너진 의존을 여기서도 막고 cascade 에서도 막는다. **일부러 두 겹이다.**
   * 무너지면 cascade 가 뒤엣것들을 즉시 skipped 로 닫으므로, 실제로는 이 판정이
   * 무너진 의존을 볼 일이 없다 — 이 줄을 느슨하게 바꿔도 통과하는 테스트를 만들 수 없다.
   * 그래도 남기는 이유: cascade 는 **이유를 적는** 쪽이고 이쪽은 **못 돌게 막는** 쪽인데,
   * 이 판정만 남기고 cascade 를 없애면 막힌 작업이 pending 인 채로 굳어 finished() 가
   * 영영 참이 안 되고, 보고에는 이유 없이 open 으로만 뜬다 — 이 모듈이 막으려는 바로 그
   * 실패다. cascade 를 손볼 때 이 줄에 기대지 말 것.
   */
  private satisfied(dep: TaskId): boolean {
    const s = this.states.get(dep);
    return s !== undefined && (s.status === "done" || s.status === "empty");
  }

  /** 시작했다고 표시한다. pending 이 아니면 false — 같은 것을 두 번 태우지 않는다. */
  start(id: TaskId): boolean {
    const s = this.states.get(id);
    if (s === undefined || s.status !== "pending") return false;
    s.status = "running";
    return true;
  }

  /**
   * 결과를 접수하고, 그 여파를 그래프에 전파한다.
   *
   * 실패하면 그 작업에 기대던 것들이 줄줄이 막힌다. 그것들을 `skipped` 로 **지금**
   * 확정한다 — 나중에 "돌지 않았음" 으로 뭉뚱그리면 왜 안 돌았는지가 사라진다.
   */
  settle(id: TaskId, outcome: DelegationOutcome): boolean {
    const s = this.states.get(id);
    if (s === undefined || s.status !== "running") return false;
    s.outcome = outcome;
    s.status = statusOf(outcome);
    if (s.status !== "done" && s.status !== "empty") this.cascade(id, s.status);
    return true;
  }

  /** 바깥에서 통째로 중단시켰을 때. 안 끝난 것 전부를 aborted/skipped 로 닫는다. */
  abortAll(): void {
    for (const d of this.defs) {
      const s = this.states.get(d.id)!;
      if (s.status === "running") {
        s.status = "aborted";
        s.outcome = { status: "aborted" };
      }
    }
    for (const d of this.defs) {
      const s = this.states.get(d.id)!;
      if (s.status === "pending") {
        s.status = "skipped";
        s.skipped = { kind: "dep-aborted", dep: d.id };
      }
    }
  }

  /** 막힌 것들을 따라 내려가며 닫는다. 직접 원인과 딸려 막힌 것을 구분해 남긴다. */
  private cascade(from: TaskId, cause: TaskStatus): void {
    const kind: SkipCause["kind"] =
      cause === "failed" ? "dep-failed" : cause === "aborted" ? "dep-aborted" : "dep-skipped";
    let front: { dep: TaskId; kind: SkipCause["kind"] }[] = [{ dep: from, kind }];
    while (front.length > 0) {
      const next: { dep: TaskId; kind: SkipCause["kind"] }[] = [];
      for (const cur of front) {
        for (const d of this.defs) {
          if (!d.needs.includes(cur.dep)) continue;
          const s = this.states.get(d.id)!;
          if (s.status !== "pending") continue;   // 이미 돌고 있거나 이미 닫힌 것은 안 건드린다
          s.status = "skipped";
          s.skipped = { kind: cur.kind, dep: cur.dep };
          // 한 단계 내려가면 "딸려 막힘" 이다 — 원인은 위에 하나뿐이다.
          next.push({ dep: d.id, kind: "dep-skipped" });
        }
      }
      front = next;
    }
  }

  /** 더 진행할 것이 없는가 — pending 도 running 도 없을 때. */
  finished(): boolean {
    for (const s of this.states.values()) {
      if (s.status === "pending" || s.status === "running") return false;
    }
    return true;
  }

  /**
   * 끝난 작업들의 결과 텍스트. 뒤 작업의 프롬프트를 지을 때 쓴다.
   *
   * 아무 말도 안 한 의존은 **목록에서 빼지 않고** 빈 문자열로 낸다 — 빼 버리면
   * 부르는 쪽이 "그런 의존은 없었다" 로 읽는다.
   */
  inputsFor(id: TaskId): { id: TaskId; text: string }[] {
    const d = this.byId.get(id);
    if (d === undefined) return [];
    return d.needs.map(dep => {
      const s = this.states.get(dep);
      const text = s?.outcome?.status === "completed" ? s.outcome.text : "";
      return { id: dep, text };
    });
  }

  report(): OrchestraReport {
    const done: TaskId[] = [];
    const empty: TaskId[] = [];
    const failed: TaskId[] = [];
    const aborted: TaskId[] = [];
    const skipped: { id: TaskId; cause: SkipCause }[] = [];
    const open: TaskId[] = [];
    for (const d of this.defs) {
      const s = this.states.get(d.id)!;
      switch (s.status) {
        case "done": done.push(s.id); break;
        case "empty": empty.push(s.id); break;
        case "failed": failed.push(s.id); break;
        case "aborted": aborted.push(s.id); break;
        case "skipped": skipped.push({ id: s.id, cause: s.skipped! }); break;
        default: open.push(s.id); break;
      }
    }
    return { total: this.defs.length, done, empty, failed, aborted, skipped, open };
  }
}

/** 아래층의 결과를 작업 상태로 옮긴다. `timeout` 은 실패다 — 답을 못 받은 건 매한가지고,
 *  뒤 작업이 없는 결과를 받고 도는 것보다 막히는 편이 정직하다. */
function statusOf(o: DelegationOutcome): TaskStatus {
  switch (o.status) {
    case "completed": return "done";
    case "empty": return "empty";
    case "aborted": return "aborted";
    default: return "failed";   // failed | timeout
  }
}
