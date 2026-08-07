// 아직 수락하지 않은 제안이 **파일 안 어디에 걸려 있는가**.
//
// 지금까지 제안은 오른쪽 카드에만 있었다. 그래서 "이 줄이 왜 바뀌는가" 를 보려면
// 코드에서 눈을 떼고 카드로 가야 했고, 바꿀지 말지도 거기서만 눌렀다. 설계(2.2)가
// 적어 둔 자리는 **바뀌는 줄 그 자리**다 — 사유는 툴팁으로, 수락·거절은 CodeLens 로.
//
// 두 기능이 같은 질문을 공유한다: 이 제안이 지금 이 텍스트의 몇 번째 글자에 붙는가.
// 그 답만 여기서 낸다. 화면에 무엇을 그릴지는 부르는 쪽이 정한다.

export interface MarkInput {
  /** 지금 편집기에 있는 전체 텍스트 */
  text: string;
  /** 제안이 바꾸려는 원본 조각. 빈 문자열이면 새 파일 생성이다. */
  find: string;
  /** 제안이 만들어질 때 잡아 둔 범위(있으면 먼저 믿는다). 1-based. */
  range?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
}

export interface Mark {
  /** 1-based 줄·칸 — Monaco 가 그대로 받는 모양. */
  startLineNumber: number; startColumn: number;
  endLineNumber: number; endColumn: number;
}

/** 오프셋 → 1-based 줄·칸. */
export function posAt(text: string, offset: number): { line: number; column: number } {
  const o = Math.max(0, Math.min(offset, text.length));
  let line = 1, last = 0;
  for (let i = 0; i < o; i++) {
    if (text.charCodeAt(i) === 10) { line++; last = i + 1; }
  }
  return { line, column: o - last + 1 };
}

/** 1-based 줄·칸 → 오프셋. 범위를 벗어나면 -1. */
export function offsetOf(text: string, line: number, column: number): number {
  if (line < 1 || column < 1) return -1;
  let at = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf("\n", at);
    if (nl < 0) return -1;
    at = nl + 1;
  }
  const off = at + (column - 1);
  return off <= text.length ? off : -1;
}

/**
 * 제안이 붙을 자리. 못 찾거나 애매하면 null — **틀린 자리에 그리느니 안 그린다.**
 *
 * 판정 순서는 applyProposal 과 같다. 다르면 카드에 뜬 자리와 편집기에 그린 자리가
 * 어긋나고, 그건 사용자가 다른 곳을 보며 수락을 누르게 만든다.
 */
export function locate(inp: MarkInput): Mark | null {
  const { text, find } = inp;
  // 새 파일 생성은 파일 전체가 곧 그 제안이다. 첫 줄에 건다.
  if (find === "") return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };

  let start = -1;
  if (inp.range) {
    const s0 = offsetOf(text, inp.range.startLineNumber, inp.range.startColumn);
    const e0 = offsetOf(text, inp.range.endLineNumber, inp.range.endColumn);
    // 범위가 가리키는 **현재 내용**이 그 조각일 때만 믿는다. 파일이 그 사이 바뀌었으면
    // 같은 줄 번호가 전혀 다른 코드다.
    if (s0 >= 0 && e0 >= s0 && e0 <= text.length && text.slice(s0, e0) === find) start = s0;
  }
  if (start < 0) {
    const idx = text.indexOf(find);
    if (idx < 0) return null;
    // 두 군데면 어느 쪽인지 모른다. 찍어서 그리면 엉뚱한 줄에 "여기가 바뀝니다" 가 붙는다.
    if (text.indexOf(find, idx + 1) >= 0) return null;
    start = idx;
  }
  const a = posAt(text, start);
  const b = posAt(text, start + find.length);
  return { startLineNumber: a.line, startColumn: a.column, endLineNumber: b.line, endColumn: b.column };
}

/** 툴팁에 넣을 문장. 사유가 비어 있으면 툴팁을 달 이유가 없다. */
export function markTooltip(rationale: string, agent: string): string | null {
  const r = String(rationale ?? "").trim();
  if (!r) return null;
  const who = String(agent ?? "").trim();
  return who ? `**${who}** — ${r}` : r;
}
