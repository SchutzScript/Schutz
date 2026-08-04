/**
 * 확장이 **사용자에게 무언가를 묻는** 경로.
 *
 * 셰임에서 묻는 함수는 셋인데 셋 다 이랬다:
 *
 *   showQuickPick: () => Promise.resolve(undefined),
 *   showInputBox:  () => Promise.resolve(undefined),
 *   showInformationMessage: (msg, ..._items) => { toast(...); return Promise.resolve(undefined); },
 *
 * vscode 규약에서 `undefined` 는 **"사용자가 취소했다"** 다. 그래서 확장은 물음을 띄운
 * 적도 없이 "취소당했다" 고 판단하고 흐름을 접었다. 오류도 안 나고 토스트도 안 뜬다 —
 * activeTextEditor 때와 같은 종류의 조용한 무동작이다. 특히 세 번째가 고약한데, 토스트는
 * 뜨니까 **뭔가 일어난 것처럼 보인다.** 정작 `"Reload"` 버튼을 누를 방법이 없다.
 *
 * 여기 있는 것은 그 물음의 순수한 부분이다 — 항목 정규화, 필터, 커서 이동, 검증.
 * React 도 monaco 도 모른다.
 */

/** 확장이 넘기는 항목. 문자열이거나 vscode.QuickPickItem 모양이다. */
export type PickChoice = string | { label?: string; description?: string; detail?: string; picked?: boolean; [k: string]: any };

export interface NormPick {
  label: string;
  description: string;
  detail: string;
  picked: boolean;
  /** 원래 값. 고른 결과로 **이것을** 돌려준다 — 확장이 넘긴 객체의 다른 필드
   *  (`id`, `uri`, 핸들러 등)를 그대로 되받아야 뒤 흐름이 이어진다. */
  raw: PickChoice;
  /** 원본 배열에서의 자리. 필터한 뒤에도 어느 항목인지 잃지 않는다. */
  index: number;
}

const str = (v: any) => (v == null ? "" : String(v));

export function normalizePicks(items: readonly PickChoice[] | null | undefined): NormPick[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw, index) => {
    if (typeof raw === "string") return { label: raw, description: "", detail: "", picked: false, raw, index };
    return {
      // label 이 없는 객체를 넘기는 확장이 있다. 빈 줄로 두면 고를 수는 있는데 뭔지
      // 알 수 없으니, 최소한 자리 번호라도 보인다.
      label: str(raw?.label) || `(${index + 1})`,
      description: str(raw?.description),
      detail: str(raw?.detail),
      picked: raw?.picked === true,
      raw,
      index,
    };
  });
}

export interface MatchOpts {
  matchOnDescription?: boolean;
  matchOnDetail?: boolean;
}

/** 공백으로 끊은 모든 조각이 들어 있어야 맞는 것으로 본다. 대소문자는 무시한다.
 *  vscode 의 퍼지 점수까지 흉내 내지는 않는다 — 순서를 흔들면 확장이 정해 둔
 *  우선순위(대개 첫 항목이 권장값)가 무너진다. */
export function matchPick(it: NormPick, query: string, o: MatchOpts = {}): boolean {
  const parts = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return true;
  let hay = it.label.toLowerCase();
  if (o.matchOnDescription) hay += " " + it.description.toLowerCase();
  if (o.matchOnDetail) hay += " " + it.detail.toLowerCase();
  return parts.every(p => hay.includes(p));
}

export function filterPicks(items: readonly NormPick[], query: string, o: MatchOpts = {}): NormPick[] {
  return items.filter(it => matchPick(it, query, o));
}

/** 위/아래 키. 끝에서 반대편으로 돈다 — 목록이 비면 0. */
export function stepIndex(cur: number, delta: number, len: number): number {
  if (len <= 0) return 0;
  const c = Number.isFinite(cur) ? Math.trunc(cur) : 0;
  return ((c + delta) % len + len) % len;
}

/** showInformationMessage(msg, ...items) 의 버튼들.
 *  항목은 문자열이거나 vscode.MessageItem(`{ title, isCloseAffordance }`) 이다. */
export interface MsgButton { label: string; raw: any; isClose: boolean }

export function normalizeButtons(items: readonly any[] | null | undefined): MsgButton[] {
  if (!Array.isArray(items)) return [];
  return items
    // 옵션 객체(`{ modal: true }`)를 첫 인자로 끼워 넣는 호출이 있다. 버튼이 아니다.
    .filter(x => typeof x === "string" || (x && typeof x === "object" && ("title" in x)))
    .map(x => typeof x === "string"
      ? { label: x, raw: x, isClose: false }
      : { label: str(x.title), raw: x, isClose: x.isCloseAffordance === true });
}

/** validateInput 을 돌린다. 문자열/`{message}`/null/Promise/예외를 모두 받는다.
 *  돌려주는 것은 보여 줄 오류 문구이거나 null(통과). 확장이 던진 예외로 물음이
 *  통째로 죽으면 안 되므로, 예외는 "통과" 로 본다. */
export async function validateInput(fn: any, value: string): Promise<string | null> {
  if (typeof fn !== "function") return null;
  try {
    const r = await fn(value);
    if (r == null) return null;
    if (typeof r === "string") return r || null;
    if (typeof r === "object" && "message" in r) return str((r as any).message) || null;
    return null;
  } catch { return null; }
}

/** 셰임 → 앱으로 넘어가는 물음 하나. 앱은 이 모양만 알면 된다. */
export type PromptReq =
  | { kind: "pick"; source: string; title: string; items: NormPick[]; many: boolean; match: MatchOpts }
  | { kind: "input"; source: string; title: string; detail: string; value: string; password: boolean; validate: any }
  | { kind: "buttons"; source: string; title: string; tone: "info" | "warn" | "error"; buttons: MsgButton[] };
