/**
 * 확장이 상태바에 올리는 항목.
 *
 * 예전 셰임은 이랬다:
 *
 *   createStatusBarItem: () => ({ text: "", tooltip: "", command: "", show() {}, hide() {}, dispose() {} }),
 *   setStatusBarMessage: (_msg) => noopDisposable,
 *
 * `text` 는 그냥 객체의 속성이라 대입은 성공한다. `show()` 도 성공한다. 그런데 그
 * 객체를 읽는 곳이 어디에도 없다. 확장이 "빌드 중…", "3 problems", 로그인 상태 같은
 * 것을 상태바로 알리는 흐름이 통째로 사라졌다 — 실패한 흔적조차 없다.
 *
 * 순수 모듈이다.
 */

export const ALIGN_LEFT = 1, ALIGN_RIGHT = 2;

export interface StatusItem {
  /** 확장·항목을 합친 고유 키. 같은 id 로 다시 오면 갈아 끼운다. */
  id: string;
  /** 어느 확장이 올렸는가 — 툴팁에 밝힌다. */
  source: string;
  text: string;
  tooltip: string;
  alignment: number;
  /** 큰 값이 바깥쪽(왼쪽 그룹은 더 왼쪽, 오른쪽 그룹은 더 오른쪽). vscode 와 같다. */
  priority: number;
  /** 눌렀을 때 실행할 것. 없으면 그냥 글자다. */
  run?: (() => void) | undefined;
  /** 등록 순서 — 우선순위가 같을 때 순서를 고정한다. */
  seq: number;
}

/**
 * `$(icon)` 표기를 걷어낸다.
 *
 * vscode 는 상태바 글자에 codicon 을 `$(sync~spin) 빌드 중` 처럼 끼운다. 우리는 그
 * 아이콘 폰트를 안 싣는다. 그대로 두면 사용자에게 `$(sync~spin)` 이라는 글자가 그대로
 * 보이므로 걷어낸다.
 *
 * 걷어낸 뒤 아무것도 안 남는 경우가 있다(아이콘만 올리는 항목). 그때는 점 하나를
 * 남긴다 — 빈 글자는 폭이 0 이라 **누를 수 있는 것이 화면에서 사라진다.**
 */
export function cleanText(raw: unknown): string {
  const s = String(raw ?? "").replace(/\$\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return s || "•";
}

/** 같은 id 면 갈아 끼우고, 없으면 뒤에 붙인다. 새 배열을 돌려준다. */
export function upsert(list: readonly StatusItem[], item: StatusItem): StatusItem[] {
  const i = list.findIndex(x => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  // seq 는 처음 것을 지킨다 — 글자만 바꿨는데 항목이 옆으로 튀면 안 된다.
  next[i] = { ...item, seq: list[i]!.seq };
  return next;
}

export function remove(list: readonly StatusItem[], id: string): StatusItem[] {
  return list.filter(x => x.id !== id);
}

/** 한 확장이 올린 것을 전부 걷는다(확장 재로드·비활성화). */
export function removeSource(list: readonly StatusItem[], source: string): StatusItem[] {
  return list.filter(x => x.source !== source);
}

/**
 * 화면에 놓을 순서.
 *
 * 왼쪽 그룹은 우선순위가 **큰** 것이 더 왼쪽, 오른쪽 그룹은 우선순위가 큰 것이 더
 * 오른쪽 — vscode 가 그렇다. 우리 상태바는 왼쪽에서 오른쪽으로 그리므로, 오른쪽
 * 그룹은 뒤집어야 눈에 보이는 순서가 vscode 와 같아진다.
 */
export function ordered(list: readonly StatusItem[], alignment: number): StatusItem[] {
  const g = list.filter(x => x.alignment === alignment);
  g.sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
  return alignment === ALIGN_RIGHT ? g.reverse() : g;
}
