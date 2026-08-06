// 데코레이션 타입을 실제로 화면에 붙이는 쪽. 변환 규칙은 decorations.ts 에 있고,
// 여기는 스타일시트 한 장과 편집기별 적용분을 들고 있는 살림꾼이다.
//
// 스타일시트가 한 장인 이유: 타입마다 <style> 을 만들면 확장이 데코레이션 타입을
// 자주 만들고 버리는 흔한 꼴(줄마다 다른 색)에서 head 가 수천 개로 불어난다.

import type monacoNS from "monaco-editor";
import { styleSheetFor, monacoOptions, normalizeDecos, drawsNothing } from "./decorations";

let sheet: HTMLStyleElement | null = null;
const rules = new Map<string, string>();   // 타입 id → 규칙 전문
let seq = 0;

function flush(): void {
  if (typeof document === "undefined") return;
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.setAttribute("data-schutz", "ext-decorations");
    document.head.appendChild(sheet);
  }
  sheet.textContent = [...rules.values()].filter(Boolean).join("\n");
}

type Collection = monacoNS.editor.IEditorDecorationsCollection;

export interface DecoTypeHandle {
  /** Monaco 에 넘길 옵션 — setDecorations 가 읽는다. */
  readonly _szDeco: ReturnType<typeof monacoOptions>;
  readonly key: string;
  /** 이 타입이 아무것도 안 그리는가(확장이 빈 옵션을 준 경우). */
  readonly _szEmpty: boolean;
  /** 편집기별로 지금 그려 둔 것. 같은 타입으로 다시 설정하면 갈아끼워야 한다(누적이 아니다). */
  readonly _szByEditor: WeakMap<object, Collection>;
  /** 폐기할 때 걷어야 하므로 따로 모아 둔다 — WeakMap 은 훑을 수 없다. */
  readonly _szCols: Set<Collection>;
  dispose(): void;
}

/** vscode.window.createTextEditorDecorationType */
export function createDecoType(opts: any): DecoTypeHandle {
  const id = String(++seq);
  const css = styleSheetFor(id, opts);
  if (css) { rules.set(id, css); flush(); }
  const options = monacoOptions(id, opts);
  const empty = drawsNothing(opts);
  const cols = new Set<Collection>();
  return {
    _szDeco: options,
    _szEmpty: empty,
    _szByEditor: new WeakMap<object, Collection>(),
    _szCols: cols,
    key: "szdeco-" + id,
    dispose() {
      rules.delete(id);
      flush();
      // 이 타입으로 그려 둔 것도 함께 걷는다 — 규칙만 지우면 클래스 없는
      // 데코레이션이 남아 다음 편집에서 엉뚱한 자리를 잡는다.
      for (const c of cols) { try { c.clear(); } catch { /* 이미 폐기된 편집기 */ } }
      cols.clear();
    },
  };
}

/** vscode.TextEditor.setDecorations */
export function applyDecos(editor: any, type: any, list: any): void {
  const h = type as DecoTypeHandle | undefined;
  if (!editor || !h?._szDeco || !h._szByEditor) return;

  const decos = normalizeDecos(list).map(d => ({
    range: d.range,
    options: d.hover ? { ...h._szDeco, hoverMessage: { value: d.hover } } : h._szDeco,
  }));

  const existing = h._szByEditor.get(editor);
  if (existing) {
    // set([]) 이 곧 "이 타입으로 그린 것을 전부 지운다" 이다. 확장이 그렇게 지운다.
    try { existing.set(decos as any); } catch { /* 폐기된 편집기 */ }
    return;
  }
  if (!decos.length) return;   // 지울 것도 그릴 것도 없다
  try {
    const c = editor.createDecorationsCollection(decos) as Collection;
    h._szByEditor.set(editor, c);
    h._szCols.add(c);
  } catch { /* 폐기된 편집기 */ }
}

/** 확장 하나가 내려갈 때 그 확장이 만든 타입을 전부 정리한다. */
export function disposeAllDecos(handles: Iterable<DecoTypeHandle>): void {
  for (const h of handles) { try { h.dispose(); } catch { /* */ } }
}
