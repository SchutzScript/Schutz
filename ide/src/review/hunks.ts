// 제안을 줄 단위 조각(헝크)으로 쪼개고, 고른 조각만 합성한다.
//
// README 가 "per-line accept and reject" 라고 적어 둔 것을 이행하는 자리다. 지금까지
// 제안은 통짜라 전부 아니면 전무였다.
//
// **적용 경로는 건드리지 않는다.** `_acceptProposal` 은 여전히 find → replace 치환을
// 한다. 여기서 하는 일은 "고른 헝크만 반영된 replace 를 다시 만드는 것" 뿐이다.
// 파일을 실제로 쓰는 코드가 그대로면 회귀할 자리가 없다.
//
// 두 가지가 반드시 성립해야 한다(테스트로 못 박아 둔다):
//   전부 고르면 → 원래 replace 와 글자 하나까지 같다 (기존 동작 유지)
//   하나도 안 고르면 → 원래 find 와 같다 (아무것도 안 바뀐다)

export interface ContextHunk { kind: "context"; lines: string[] }
export interface ChangeHunk { kind: "change"; index: number; before: string[]; after: string[] }
export type Hunk = ContextHunk | ChangeHunk;

/** LCS 표는 a×b 칸을 쓴다. 큰 편집에서 메모리·시간이 터지지 않게 상한을 둔다 —
 *  넘으면 통짜 헝크 하나로 떨어져 **지금과 똑같이** 동작한다(퇴행이 아니라 원복). */
export const LCS_CELL_CAP = 2_000_000;

/** 줄 단위 최장 공통 부분수열. 헝크 경계를 사람이 읽을 수 있게 만드는 게 목적이라
 *  Myers 같은 정교한 알고리즘까지는 필요 없다 — 제안은 대개 수십 줄이다. */
function lcsOps(a: string[], b: string[]): { t: "=" | "-" | "+"; line: string }[] {
  const n = a.length, m = b.length;
  // dp[i][j] = a[i..] 와 b[j..] 의 LCS 길이
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { t: "=" | "-" | "+"; line: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: "=", line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "-", line: a[i] }); i++; }
    else { out.push({ t: "+", line: b[j] }); j++; }
  }
  while (i < n) out.push({ t: "-", line: a[i++] });
  while (j < m) out.push({ t: "+", line: b[j++] });
  return out;
}

/** 문자열을 줄 배열로. split/join 은 정확히 왕복한다("a\n" → ["a",""] → "a\n"). */
const toLines = (s: string) => s.split("\n");

/** find/replace 를 헝크로 쪼갠다. 바뀐 덩어리 사이의 같은 줄은 context 로 남는다. */
export function buildHunks(find: string, replace: string): Hunk[] {
  const a = toLines(find), b = toLines(replace);

  // 너무 크면 쪼개지 않는다 — 헝크 하나 = 지금까지의 통짜 동작
  if (a.length * b.length > LCS_CELL_CAP) {
    return [{ kind: "change", index: 0, before: a, after: b }];
  }

  const ops = lcsOps(a, b);
  const hunks: Hunk[] = [];
  let idx = 0;
  let ctx: string[] = [];
  let before: string[] = [], after: string[] = [];

  const flushCtx = () => { if (ctx.length) { hunks.push({ kind: "context", lines: ctx }); ctx = []; } };
  const flushChange = () => {
    if (before.length || after.length) {
      hunks.push({ kind: "change", index: idx++, before, after });
      before = []; after = [];
    }
  };

  for (const op of ops) {
    if (op.t === "=") { flushChange(); ctx.push(op.line); }
    else { flushCtx(); (op.t === "-" ? before : after).push(op.line); }
  }
  flushChange();
  flushCtx();
  return hunks;
}

/** 고를 수 있는 조각의 수. 0 이면 바뀐 게 없다는 뜻이다. */
export function changeCount(hunks: Hunk[]): number {
  return hunks.reduce((n, h) => n + (h.kind === "change" ? 1 : 0), 0);
}

/** 고른 헝크만 반영한 텍스트를 만든다.
 *  안 고른 조각은 **원래대로**(before) 남긴다 — 그래야 "이 조각은 적용 안 함" 이 된다. */
export function composeFromHunks(hunks: Hunk[], selected: ReadonlySet<number>): string {
  const out: string[] = [];
  for (const h of hunks) {
    if (h.kind === "context") out.push(...h.lines);
    else out.push(...(selected.has(h.index) ? h.after : h.before));
  }
  return out.join("\n");
}

/** 전부 고른 상태 — 기본값. */
export function allSelected(hunks: Hunk[]): Set<number> {
  const s = new Set<number>();
  for (const h of hunks) if (h.kind === "change") s.add(h.index);
  return s;
}

/** 헝크 하나의 증감 — 카드에 `+n −m` 을 붙일 때 쓴다. */
export function hunkStats(h: ChangeHunk): { add: number; del: number } {
  return { add: h.after.length, del: h.before.length };
}
