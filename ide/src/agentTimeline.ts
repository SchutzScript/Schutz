// 에이전트 모드 트랜스크립트의 **순서**.
//
// 화면을 그리지 않는다 — 무엇이 어떤 차례로 오는지만 정한다. import 0 이라 브라우저 없이
// 테스트할 수 있고, 순서가 틀렸을 때 "렌더가 틀렸나 순서가 틀렸나" 를 나눠서 볼 수 있다.
// engine/·opening/beats 와 같은 규칙이다.
//
// 전순서는 **이미 데이터에 있다.** App 의 _uid 하나가 메시지(u/a), 도구(rt/t/cli),
// 제안(pp) 에 단조 증가 번호를 찍고, 세션 복원도 같은 `\d+$` 규약으로 _uid 를 복원분
// 뒤로 민다. 그래서 타임스탬프 필드도, 병렬 배열도, 스키마 마이그레이션도 필요 없다.

export interface SeqLike { id: string }

export type Row =
  | { k: "msg"; seq: number; v: unknown }
  | { k: "tool"; seq: number; v: unknown }
  | { k: "prop"; seq: number; v: unknown }
  | { k: "ask"; seq: number; v: unknown };

export type RowKind = Row["k"];

/**
 * id 끝의 숫자를 뽑는다. 못 뽑으면 -1 — 배열 순서를 유지시키기 위한 값이다.
 *
 * **함정:** 데모의 startRun 이 "t1"~"t5" 를 찍는다. 이건 _uid 를 안 거친 리터럴인데
 * `\d+$` 는 1~5 를 뽑아내므로 실제 실행이 만든 번호(수백~수천)보다 **앞으로** 정렬된다.
 * 오늘은 데모가 에디터 모드 전용이라 무해하지만, 데모를 에이전트 모드에서 돌리는 순간
 * 도구 줄이 전부 맨 위로 몰린다. 아래 테스트가 이 사실을 못 박아둔다.
 */
export function seqOf(id: string): number {
  const m = /(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : -1;
}

/**
 * 네 갈래를 하나의 시간축으로 합친다.
 *
 * 정렬은 **안정적**이어야 한다 — seq 가 같거나 둘 다 -1 인 경우(레거시 세션, 데모
 * 리터럴 id)에 원래 배열 순서가 뒤집히면, 사용자가 보기엔 아무 이유 없이 대화가
 * 재배열된 것으로 보인다. Array.prototype.sort 는 안정 정렬이지만 서로 다른 배열에서
 * 온 원소끼리는 기준이 없으므로, 들어온 순서를 tie-break 로 함께 들고 간다.
 */
export function buildTimeline(src: {
  messages?: readonly SeqLike[];
  tools?: readonly SeqLike[];
  proposals?: readonly SeqLike[];
  /** 지금 답을 기다리는 승인 하나. id 가 없으므로 항상 맨 끝이다. */
  ask?: unknown | null;
}): Row[] {
  const rows: (Row & { ord: number })[] = [];
  let ord = 0;
  const push = (k: RowKind, list: readonly SeqLike[] | undefined) => {
    for (const v of list ?? []) rows.push({ k, seq: seqOf(v.id), v, ord: ord++ } as Row & { ord: number });
  };
  push("msg", src.messages);
  push("tool", src.tools);
  push("prop", src.proposals);

  rows.sort((a, b) => (a.seq - b.seq) || (a.ord - b.ord));

  // 대기 중인 승인은 id 가 없다. 지금 막지 않으면 진행이 안 되는 것이므로 늘 마지막이다.
  const out: Row[] = rows.map(({ k, seq, v }) => ({ k, seq, v } as Row));
  if (src.ask) out.push({ k: "ask", seq: Number.POSITIVE_INFINITY, v: src.ask });
  return out;
}
