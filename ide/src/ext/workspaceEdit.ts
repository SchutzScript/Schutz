/**
 * `vscode.WorkspaceEdit` 와 코드 액션.
 *
 * 셰임에 WorkspaceEdit 가 아예 없었다. 그래서 `new vscode.WorkspaceEdit()` 는 첫 줄에서
 * 죽고, 편집을 담은 코드 액션은 확장이 **만들 수조차** 없었다. 그 위에 얹힌
 * `registerCodeActionsProvider` 도 그래서 빈 disposable 로 남겨 뒀다 — 반쪽을 붙이면
 * 되는 것과 안 되는 것을 가리기가 더 어려워지니까.
 *
 * 이제 둘을 같이 붙인다. 여기 있는 것은 순수한 부분이다: 편집을 모으고, 파일별로
 * 묶고, **한 파일 안에서 뒤에서부터 적용되도록 정렬**한다. 앞에서부터 적용하면 먼저
 * 넣은 글자만큼 뒤 편집의 자리가 밀린다 — 확장이 준 범위는 전부 **원본 기준**이다.
 */

import { toMonacoRange, type MonacoRange } from "./shimLang";

export interface Edit { range: MonacoRange; text: string }
export interface FileEdits { key: string; edits: Edit[] }

const keyOf = (uri: any): string => String(uri?.toString?.() ?? uri ?? "");

/** 모아 둔 편집을 파일별로 묶는다. 순서는 넣은 순서를 지킨다. */
export function groupByFile(raw: readonly { uri: any; range: any; text: string }[]): FileEdits[] {
  const out: FileEdits[] = [];
  const at = new Map<string, FileEdits>();
  for (const e of raw) {
    const key = keyOf(e.uri);
    if (!key) continue;
    let g = at.get(key);
    if (!g) { g = { key, edits: [] }; at.set(key, g); out.push(g); }
    g.edits.push({ range: toMonacoRange(e.range), text: String(e.text ?? "") });
  }
  return out;
}

/**
 * 한 파일 안의 편집을 **뒤에서부터** 적용하도록 정렬한다.
 *
 * 확장이 주는 범위는 전부 원본 기준이라, 앞에서부터 적용하면 두 번째 편집부터
 * 자리가 어긋난다. 같은 자리에 여럿이면 넣은 순서를 지킨다 — 그래야 한 지점에
 * 여러 조각을 넣을 때 확장이 적은 차례대로 이어 붙는다.
 */
export function sortForApply(edits: readonly Edit[]): Edit[] {
  return edits
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      (b.e.range.startLineNumber - a.e.range.startLineNumber)
      || (b.e.range.startColumn - a.e.range.startColumn)
      || (b.i - a.i))
    .map(x => x.e);
}

/** 겹치는 편집이 있는가. 겹치면 어느 쪽을 살릴지 우리가 정할 수 없다 —
 *  적용을 통째로 거절하고 확장에 알리는 편이 반만 적용된 파일보다 낫다. */
export function hasOverlap(edits: readonly Edit[]): boolean {
  const s = [...edits].sort((a, b) =>
    (a.range.startLineNumber - b.range.startLineNumber) || (a.range.startColumn - b.range.startColumn));
  for (let i = 1; i < s.length; i++) {
    const p = s[i - 1]!.range, c = s[i]!.range;
    if (p.endLineNumber > c.startLineNumber
      || (p.endLineNumber === c.startLineNumber && p.endColumn > c.startColumn)) return true;
  }
  return false;
}

export interface NormAction {
  title: string;
  kind: string;
  isPreferred: boolean;
  /** 편집이 있으면 파일별로 묶인 것. 없으면 빈 배열. */
  files: FileEdits[];
  commandId?: string;
  commandArgs: any[];
}

/**
 * vscode CodeAction 을 편다. `Command` 를 그대로 돌려주는 프로바이더도 있다
 * (옛 API 가 그랬고 지금도 허용된다) — 그때는 title 이 `command.title` 에 있다.
 */
export function normalizeAction(raw: any): NormAction | null {
  if (!raw) return null;
  const isCommandOnly = typeof raw.command === "string";
  const cmd = isCommandOnly ? raw : raw.command;
  const title = String(raw.title ?? cmd?.title ?? "");
  // 제목이 없으면 사용자에게 고를 거리가 안 된다. 빈 줄을 메뉴에 올리지 않는다.
  if (!title) return null;
  const out: NormAction = {
    title,
    kind: String(raw.kind?.value ?? raw.kind ?? ""),
    isPreferred: raw.isPreferred === true,
    files: raw.edit ? groupByFile(collectEdits(raw.edit)) : [],
    commandArgs: Array.isArray(cmd?.arguments) ? cmd.arguments : [],
  };
  const id = typeof cmd === "string" ? cmd : cmd?.command;
  if (id) out.commandId = String(id);
  return out;
}

/** WorkspaceEdit 안의 편집 목록을 꺼낸다. 우리 셰임이 만든 것이면 `_edits` 를 들고
 *  있고, 확장이 직접 만든 비슷한 객체면 `entries()` 를 준다. 둘 다 받는다. */
export function collectEdits(we: any): { uri: any; range: any; text: string }[] {
  if (Array.isArray(we?._edits)) return we._edits;
  if (typeof we?.entries === "function") {
    const out: { uri: any; range: any; text: string }[] = [];
    try {
      for (const [uri, edits] of we.entries()) {
        for (const e of (edits ?? [])) out.push({ uri, range: e?.range, text: e?.newText ?? "" });
      }
    } catch { /* 모양이 다르면 포기 */ }
    return out;
  }
  return [];
}
