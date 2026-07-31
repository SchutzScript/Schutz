/**
 * 제안(find → replace)을 실제 텍스트에 얹는 계산.
 *
 * App.tsx 안에 인라인으로 있던 것을 뺐다. 여기가 틀리면 남의 코드를 엉뚱한 자리에
 * 덮어쓴다 — 줄/열 → 오프셋 환산, 범위 스테일 판정, 유일성 폴백, `$` 시퀀스 처리
 * 네 가지가 전부 조용히 틀릴 수 있는 종류의 코드라서 테스트가 붙을 곳에 둔다.
 *
 * 부수효과 없음. 파일도 모델도 안 건드린다 — 무엇을 쓸지만 계산해 돌려준다.
 */

export interface EditRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface ApplyInput {
  /** 기준 텍스트. 열린 버퍼가 미저장이면 **버퍼**, 아니면 디스크 내용. */
  base: string;
  find: string;
  /** 고른 헝크만 반영한 replace(effectiveReplace 결과). */
  replace: string;
  /** 인라인 편집이 알려준 범위. 있으면 우선 시도하되, 스테일이면 버린다. */
  range?: EditRange | null;
}

export type ApplyResult =
  | { ok: true; text: string; start: number; end: number }
  | { ok: false; error: "not_found" | "multiple" };

/** 1-기반 (줄, 열) → 0-기반 문자 오프셋.
 *  "\n" 으로만 나눈다 — CRLF 면 각 줄이 "\r" 을 달고 있고 length+1 이 그걸 그대로 센다. */
export function offsetOf(text: string, line: number, col: number): number {
  const ls = text.split("\n");
  let o = 0;
  for (let i = 0; i < line - 1 && i < ls.length; i++) o += (ls[i] ?? "").length + 1;
  return o + (col - 1);
}

export function applyProposal(inp: ApplyInput): ApplyResult {
  const { base, find, replace } = inp;

  // 새 파일 생성: 빈 문자열은 어디에나 있으므로 유일성 판정이 무의미하다.
  // 호출측이 "파일이 없다" 를 이미 확인한 뒤이므로 처음에 통째로 넣는다.
  if (find === "") return { ok: true, text: replace, start: 0, end: 0 };

  let start = -1;
  if (inp.range) {
    const s0 = offsetOf(base, inp.range.startLineNumber, inp.range.startColumn);
    const e0 = offsetOf(base, inp.range.endLineNumber, inp.range.endColumn);
    // 범위의 **현재 내용**이 고른 텍스트와 같을 때만 믿는다. 파일이 그 사이 바뀌었으면
    // 같은 줄 번호가 전혀 다른 코드를 가리킨다 — 그때 범위를 쓰면 조용히 오적용된다.
    if (s0 >= 0 && e0 >= s0 && e0 <= base.length && base.slice(s0, e0) === find) start = s0;
  }

  if (start < 0) {
    // 범위 없음 또는 스테일 → 텍스트 유일성 매칭 폴백. 두 군데면 어느 쪽인지 모르므로 거절한다.
    const idx = base.indexOf(find);
    if (idx < 0) return { ok: false, error: "not_found" };
    if (base.indexOf(find, idx + 1) >= 0) return { ok: false, error: "multiple" };
    start = idx;
  }

  const end = start + find.length;
  // 문자열 연결로 얹는다 — String.replace 의 `$&`·`$1` 해석을 아예 통과시키지 않는다.
  return { ok: true, text: base.slice(0, start) + replace + base.slice(end), start, end };
}
