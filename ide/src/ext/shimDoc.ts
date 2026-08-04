import monaco from "../editor/monacoSetup";
import * as projectModels from "../editor/projectModels";
import { paneRegistry } from "../editor/MonacoPane";

/**
 * vscode 셰임의 문서·편집기 — **실제 Monaco 모델에 연결한다.**
 *
 * 예전 셰임은 `activeTextEditor` 가 늘 undefined 였고 `visibleTextEditors` 는 늘 빈
 * 배열이었다. 그래서 현재 파일을 읽는 확장은 로드되고 "성공" 으로 보고된 뒤 **조용히
 * 아무것도 하지 않았다.** 정작 앱은 그 정보를 다 갖고 있었다 — 모델도, 열린 페인도.
 *
 * 여기서 만드는 것은 얇은 겉면이다. 값은 늘 모델에서 그때그때 읽는다(스냅숏을 들고
 * 있으면 확장이 옛 내용을 보고 판단한다).
 */

export interface DocDeps {
  /** 워크스페이스 루트. 없으면 null — 그때는 문서를 만들 수 없다. */
  root: () => string | null;
  /** 이 파일 하나를 저장한다. 앱의 저장 경로를 타야 외부 변경 확인·기준선 갱신·
   *  저장 사건이 다 같이 돈다 — 확장이 디스크에 직접 쓰면 그게 전부 어긋난다. */
  save: (rel: string) => Promise<boolean>;
  /** 지금 활성 파일의 워크스페이스 상대 경로. */
  activeRel: () => string | null;
  /** 지금 열려 있는 모든 파일의 상대 경로. */
  openRels: () => string[];
}

const abs = (root: string, rel: string) => root.replace(/\\/g, "/").replace(/\/+$/, "") + "/" + rel;

/** 모델 → vscode.TextDocument 모양. 게터로 두어 늘 지금 값을 읽는다. */
export function makeDoc(root: string, rel: string, m: monaco.editor.ITextModel, Position: any, Range: any, save?: (rel: string) => Promise<boolean>) {
  const pos = (p: any) => ({ lineNumber: (p?.line ?? 0) + 1, column: (p?.character ?? 0) + 1 });
  return {
    uri: monaco.Uri.file(abs(root, rel)),
    get fileName() { return abs(root, rel); },
    get languageId() { return m.getLanguageId(); },
    get version() { return m.getVersionId(); },
    get isDirty() { return projectModels.isDirty(rel); },
    isUntitled: false,
    isClosed: false,
    get eol() { return m.getEOL() === "\r\n" ? 2 : 1; },
    get lineCount() { return m.getLineCount(); },
    getText(range?: any) {
      if (!range) return m.getValue();
      const a = pos(range.start), b = pos(range.end);
      return m.getValueInRange({ startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column });
    },
    lineAt(line: any) {
      const n = typeof line === "number" ? line : (line?.line ?? 0);
      const ln = Math.min(Math.max(1, n + 1), m.getLineCount());
      const text = m.getLineContent(ln);
      const firstNonWs = Math.max(0, m.getLineFirstNonWhitespaceColumn(ln) - 1);
      return {
        lineNumber: ln - 1, text,
        range: new Range(ln - 1, 0, ln - 1, text.length),
        rangeIncludingLineBreak: new Range(ln - 1, 0, ln - 1, text.length),
        firstNonWhitespaceCharacterIndex: firstNonWs,
        isEmptyOrWhitespace: text.trim().length === 0,
      };
    },
    offsetAt(p: any) { const q = pos(p); return m.getOffsetAt({ lineNumber: q.lineNumber, column: q.column }); },
    positionAt(off: number) { const p = m.getPositionAt(off); return new Position(p.lineNumber - 1, p.column - 1); },
    getWordRangeAtPosition(p: any) {
      const q = pos(p);
      const w = m.getWordAtPosition({ lineNumber: q.lineNumber, column: q.column });
      if (!w) return undefined;
      return new Range(q.lineNumber - 1, w.startColumn - 1, q.lineNumber - 1, w.endColumn - 1);
    },
    validateRange(r: any) { return r; },
    validatePosition(p: any) { return p; },
    /** 저장은 앱의 저장 경로를 탄다 — 확장이 직접 디스크에 쓰면 외부 변경 확인도,
     *  기준선 갱신도, 저장 사건도 건너뛴다. */
    save(): Promise<boolean> { return save ? save(rel) : Promise.resolve(false); },
  };
}

/** 문서 + 커서/선택 + 편집. vscode.TextEditor 의 쓰이는 부분만. */
export function makeEditor(doc: any, rel: string, Position: any, Selection: any, Range: any) {
  const api = () => paneRegistry.panes.get(rel) ?? null;
  const selFromEditor = () => {
    const e = api()?.editor;
    const s = e?.getSelection();
    if (!s) return new Selection(0, 0, 0, 0);
    return new Selection(s.startLineNumber - 1, s.startColumn - 1, s.endLineNumber - 1, s.endColumn - 1);
  };
  return {
    document: doc,
    get selection() { return selFromEditor(); },
    set selection(v: any) {
      const e = api()?.editor;
      if (!e) return;
      e.setSelection({ startLineNumber: v.start.line + 1, startColumn: v.start.character + 1, endLineNumber: v.end.line + 1, endColumn: v.end.character + 1 });
    },
    get selections() { return [selFromEditor()]; },
    get visibleRanges() {
      const r = api()?.editor.getVisibleRanges()?.[0];
      return r ? [new Range(r.startLineNumber - 1, 0, r.endLineNumber - 1, 0)] : [];
    },
    viewColumn: 1,
    options: {},
    /** 확장이 실제로 고칠 수 있게 한다. 모델을 거치므로 undo 스택에 남는다 —
     *  디스크에 직접 쓰면 되돌릴 수도, 저장 기준선을 맞출 수도 없다. */
    edit(cb: (b: any) => void): Promise<boolean> {
      const model = projectModels.getByRel(rel);
      if (!model) return Promise.resolve(false);
      const ops: monaco.editor.IIdentifiedSingleEditOperation[] = [];
      const toRange = (r: any) => ({
        startLineNumber: r.start.line + 1, startColumn: r.start.character + 1,
        endLineNumber: r.end.line + 1, endColumn: r.end.character + 1,
      });
      const builder = {
        replace: (r: any, text: string) => { ops.push({ range: toRange(r), text }); },
        insert: (p: any, text: string) => { ops.push({ range: { startLineNumber: p.line + 1, startColumn: p.character + 1, endLineNumber: p.line + 1, endColumn: p.character + 1 }, text }); },
        delete: (r: any) => { ops.push({ range: toRange(r), text: "" }); },
        setEndOfLine: () => { /* 미지원 — 조용히 넘긴다 */ },
      };
      try { cb(builder); } catch { return Promise.resolve(false); }
      if (!ops.length) return Promise.resolve(true);
      model.pushEditOperations([], ops, () => null);
      return Promise.resolve(true);
    },
    revealRange(r: any) {
      try { api()?.editor.revealRangeInCenter({ startLineNumber: r.start.line + 1, startColumn: 1, endLineNumber: r.end.line + 1, endColumn: 1 }); } catch { /* */ }
    },
    setDecorations() { /* 데코레이션 타입이 no-op 이라 여기도 no-op */ },
  };
}

/** 지금 상태에서 문서/편집기를 만들어 준다. 값은 부를 때마다 새로 읽는다. */
export function makeDocIndex(d: DocDeps, types: { Position: any; Range: any; Selection: any }) {
  const docFor = (rel: string | null) => {
    const root = d.root();
    if (!root || !rel) return undefined;
    const m = projectModels.getByRel(rel);
    if (!m || m.isDisposed()) return undefined;
    return makeDoc(root, rel, m, types.Position, types.Range, d.save);
  };
  const editorFor = (rel: string | null) => {
    const doc = docFor(rel);
    return doc && rel ? makeEditor(doc, rel, types.Position, types.Selection, types.Range) : undefined;
  };
  return {
    docFor, editorFor,
    activeEditor: () => editorFor(d.activeRel()),
    visibleEditors: () => d.openRels().map(editorFor).filter(Boolean),
    documents: () => d.openRels().map(docFor).filter(Boolean),
  };
}
