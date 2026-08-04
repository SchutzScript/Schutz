// 최소 vscode API 셰임 — 프로그램형 VS Code 확장의 activate() 를 렌더러에서 실행할 수 있게 한다.
// 지원: commands · window 메시지/출력채널 · languages(완성/호버/정의) · workspace 설정 · 기본 타입.
// Node/네이티브 의존이나 미구현 API를 쓰는 확장은 실패(캐치되어 보고). "단순 확장"용.
import monaco from "../editor/monacoSetup";
import { getLang } from "../i18n";
import * as projectModels from "../editor/projectModels";
import { makeDocIndex } from "./shimDoc";
import { normalizePicks, normalizeButtons, type PromptReq } from "./prompt";
import { toMarkers, toLocations, toEdits } from "./shimLang";
import { setShimDocSource } from "./extHost";

export interface ShimDeps {
  toast: (kind: "ok" | "error" | "info", msg: string) => void;
  showPanel: (title: string, html: string) => void;
  getActiveFile: () => string | null;
  registerCommand: (id: string, title: string, run: (...args: any[]) => any, source: string) => void;
  /** 열려 있는 파일들과 워크스페이스 루트 — 문서·편집기를 만들려면 이 둘이 있어야 한다.
   *  없이 두었더니 activeTextEditor 가 영원히 undefined 였다. */
  workspaceRoot: () => string | null;
  openFiles: () => string[];
  /** 사용자에게 묻는다. 취소면 undefined 로 풀린다 — 그게 vscode 규약이다.
   *  이 통로가 없던 동안 showQuickPick·showInputBox 는 **묻지도 않고** undefined 를
   *  돌려줬고, 확장은 사용자가 취소한 줄 알고 흐름을 접었다. */
  prompt: (req: PromptReq) => Promise<any>;
}

const disposables: monaco.IDisposable[] = [];
/** 이전 로드에서 등록한 Monaco 프로바이더 정리 (재로드 시 중복 방지) */
export function disposeShimRegistrations() {
  for (const d of disposables.splice(0)) { try { d.dispose(); } catch { /* */ } }
}

// ── 기본 타입 ──────────────────────────────────────────────────
class Position { constructor(public line: number, public character: number) {} }
class Range {
  start: Position; end: Position;
  constructor(a: any, b?: any, c?: number, d?: number) {
    if (a instanceof Position) { this.start = a; this.end = b; }
    else { this.start = new Position(a, b); this.end = new Position(c!, d!); }
  }
}
class Selection extends Range {}
class Location { constructor(public uri: any, public range: Range) {} }
class Disposable { constructor(private fn?: () => void) {} dispose() { try { this.fn?.(); } catch { /* */ } } static from(...items: { dispose(): any }[]) { return new Disposable(() => items.forEach(i => { try { i.dispose(); } catch { /* */ } })); } }
class EventEmitter<T = any> {
  private listeners = new Set<(e: T) => void>();
  event = (l: (e: T) => void) => { this.listeners.add(l); return new Disposable(() => this.listeners.delete(l)); };
  fire(e: T) { for (const l of this.listeners) { try { l(e); } catch { /* */ } } }
  dispose() { this.listeners.clear(); }
}
class MarkdownString { value: string; constructor(v = "") { this.value = v; } appendText(s: string) { this.value += s; return this; } appendMarkdown(s: string) { this.value += s; return this; } appendCodeblock(code: string, lang = "") { this.value += "\n```" + lang + "\n" + code + "\n```\n"; return this; } }
class CompletionItem { label: any; kind?: number; detail?: string; documentation?: any; insertText?: any; constructor(label: any, kind?: number) { this.label = label; this.kind = kind; } }
class Hover { contents: any[]; range?: Range; constructor(contents: any, range?: Range) { this.contents = Array.isArray(contents) ? contents : [contents]; this.range = range; } }
class ThemeIcon { constructor(public id: string) {} }
class ThemeColor { constructor(public id: string) {} }
const noopDisposable = { dispose() { /* */ } };

const UriShim = {
  parse: (s: string) => { try { return monaco.Uri.parse(s); } catch { return monaco.Uri.file(s); } },
  file: (p: string) => monaco.Uri.file(p),
  joinPath: (base: any, ...segs: string[]) => monaco.Uri.file((base?.path || base?.fsPath || "") + "/" + segs.join("/")),
};

const CompletionItemKind = { Text: 0, Method: 1, Function: 2, Constructor: 3, Field: 4, Variable: 5, Class: 6, Interface: 7, Module: 8, Property: 9, Unit: 10, Value: 11, Enum: 12, Keyword: 13, Snippet: 14, Color: 15, File: 16, Reference: 17, Folder: 18, EnumMember: 19, Constant: 20, Struct: 21, Event: 22, Operator: 23, TypeParameter: 24 };
const monacoKindFor = (k?: number) => {
  const M = monaco.languages.CompletionItemKind;
  const map: Record<number, number> = { 1: M.Method, 2: M.Function, 5: M.Variable, 6: M.Class, 7: M.Interface, 8: M.Module, 9: M.Property, 13: M.Keyword, 14: M.Snippet, 20: M.Constant, 21: M.Struct };
  return map[k ?? 0] ?? M.Text;
};

function langIdsFromSelector(sel: any): string[] {
  const arr = Array.isArray(sel) ? sel : [sel];
  const out: string[] = [];
  for (const s of arr) {
    if (typeof s === "string") out.push(s);
    else if (s && typeof s.language === "string") out.push(s.language);
  }
  return out;
}

/** vscode 모듈 셰임 인스턴스 생성 — 확장별로 만든다(구독/컨텍스트 격리). */
/** 셰임이 쏘는 편집기 사건들. 앱이 fireShimEvent 로 밀어 준다 — 예전엔 전부 아무도
 *  안 쏘는 빈 EventEmitter 라, 저장·열기를 구독한 확장은 영원히 안 불렸다. */
export const editorEvents = {
  activeChanged: new EventEmitter<any>(),
  selectionChanged: new EventEmitter<any>(),
  docChanged: new EventEmitter<any>(),
  docOpened: new EventEmitter<any>(),
  docClosed: new EventEmitter<any>(),
  docSaved: new EventEmitter<any>(),
};

/** 루트를 떼어 워크스페이스 상대 경로로. uri·경로·문서 아무거나 받는다. */
function stripRoot(root: string, p: string): string {
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\//, "") + "/";
  const q = String(p).replace(/\\/g, "/").replace(/^\//, "");
  return q.startsWith(r) ? q.slice(r.length) : q;
}
function relOfWith(root: string | null, arg: any): string | null {
  if (!arg) return null;
  const p = typeof arg === "string" ? arg : (arg.fsPath || arg.path || arg.uri?.fsPath || arg.uri?.path);
  if (!p) return null;
  return root ? stripRoot(root, p) : String(p);
}

export function makeVscodeApi(deps: ShimDeps, ext: { id: string; name: string }) {
  const docs = makeDocIndex(
    { root: deps.workspaceRoot, activeRel: deps.getActiveFile, openRels: deps.openFiles },
    { Position, Range, Selection },
  );
  const relOf = (arg: any) => relOfWith(deps.workspaceRoot(), arg);
  /** 프로바이더에 넘길 문서.
   *
   *  vscode 는 프로바이더의 첫 인자로 **TextDocument** 를 준다고 약속한다. 그런데
   *  여기서는 Monaco 모델을 그대로 넘기고 있었다. 모델에는 `getText`·`lineAt`·
   *  `fileName` 이 없으므로, 그걸 부르는 프로바이더는 첫 줄에서 던지고 바깥
   *  try/catch 가 그 예외를 삼켰다 — 확장 입장에서는 "결과가 없다" 와 구별되지 않는다.
   *  자동완성과 호버가 등록은 되는데 아무것도 안 나오던 이유다.
   *
   *  워크스페이스 밖 모델(diff·미리보기)은 상대 경로가 없어 문서를 못 만든다. 그때는
   *  예전처럼 모델을 넘긴다 — 없는 것보다는 낫다. */
  const docForModel = (model: monaco.editor.ITextModel): any => {
    try {
      const rel = projectModels.relFor(model.uri.toString());
      if (rel) { const d = docs.docFor(rel); if (d) return d; }
    } catch { /* */ }
    return model;
  };
  // 사건을 쏠 때 쓸 통로. 확장마다 덮어써도 같은 것을 가리키므로 문제 없다.
  setShimDocSource((rel) => docs.docFor(rel), (rel) => docs.editorFor(rel));
  const folder = () => {
    const r = deps.workspaceRoot();
    if (!r) return undefined;
    const name = r.replace(/\\/g, "/").split("/").filter(Boolean).pop() || r;
    return { uri: UriShim.file(r), name, index: 0 };
  };
  const executeCommand = async (id: string, ...args: any[]) => {
    // 내장 명령 일부만 지원; 나머지는 등록된 확장 명령으로 위임(자기 네임스페이스 우선 해석)
    try { return (window as any).__schutzRunCommand?.(id, args, ext.id); } catch { /* */ }
    return undefined;
  };

  const languages = {
    registerCompletionItemProvider(selector: any, provider: any, ...triggers: string[]) {
      const created: monaco.IDisposable[] = [];
      for (const lang of langIdsFromSelector(selector)) {
        const d = monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: triggers,
          async provideCompletionItems(model, position) {
            try {
              const items = await provider.provideCompletionItems(docForModel(model), new Position(position.lineNumber - 1, position.column - 1), { triggerKind: 0 }, null);
              const list = Array.isArray(items) ? items : (items?.items ?? []);
              const word = model.getWordUntilPosition(position);
              const range = { startLineNumber: position.lineNumber, startColumn: word.startColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn };
              return {
                suggestions: list.map((it: any) => ({
                  label: typeof it.label === "string" ? it.label : (it.label?.label ?? ""),
                  kind: monacoKindFor(it.kind),
                  insertText: typeof it.insertText === "string" ? it.insertText : (it.insertText?.value ?? (typeof it.label === "string" ? it.label : "")),
                  detail: it.detail,
                  documentation: it.documentation?.value ?? it.documentation,
                  range,
                })),
              };
            } catch { return { suggestions: [] }; }
          },
        });
        disposables.push(d); created.push(d);
      }
      // 실제 disposable 반환 — 확장이 재등록 위해 dispose 하면 옛 프로바이더가 실제로 해제(중복 제안·누수 방지)
      return { dispose() { for (const d of created) { try { d.dispose(); } catch { /* */ } const i = disposables.indexOf(d); if (i >= 0) disposables.splice(i, 1); } } };
    },
    registerHoverProvider(selector: any, provider: any) {
      const created: monaco.IDisposable[] = [];
      for (const lang of langIdsFromSelector(selector)) {
        const d = monaco.languages.registerHoverProvider(lang, {
          async provideHover(model, position) {
            try {
              const h = await provider.provideHover(docForModel(model), new Position(position.lineNumber - 1, position.column - 1), null);
              if (!h) return undefined;
              const contents = (h.contents || []).map((c: any) => ({ value: typeof c === "string" ? c : (c?.value ?? "") }));
              return { contents };
            } catch { return undefined; }
          },
        });
        disposables.push(d); created.push(d);
      }
      return { dispose() { for (const d of created) { try { d.dispose(); } catch { /* */ } const i = disposables.indexOf(d); if (i >= 0) disposables.splice(i, 1); } } };
    },
    registerDefinitionProvider(selector: any, provider: any) {
      const created: monaco.IDisposable[] = [];
      for (const lang of langIdsFromSelector(selector)) {
        const d = monaco.languages.registerDefinitionProvider(lang, {
          async provideDefinition(model, position) {
            try {
              const res = await provider.provideDefinition(docForModel(model), new Position(position.lineNumber - 1, position.column - 1), null);
              // uri 는 확장이 만든 것(우리 Uri 셰임이거나 문자열)이라 monaco.Uri 로 다시 세운다.
              return toLocations(res).map(l => ({ uri: monaco.Uri.parse(String(l.uri?.toString?.() ?? l.uri)), range: l.range }));
            } catch { return []; }
          },
        });
        disposables.push(d); created.push(d);
      }
      return { dispose() { for (const d of created) { try { d.dispose(); } catch { /* */ } const i = disposables.indexOf(d); if (i >= 0) disposables.splice(i, 1); } } };
    },
    registerCodeActionsProvider() { return noopDisposable; },
    registerDocumentFormattingEditProvider(selector: any, provider: any) {
      const created: monaco.IDisposable[] = [];
      for (const lang of langIdsFromSelector(selector)) {
        const d = monaco.languages.registerDocumentFormattingEditProvider(lang, {
          async provideDocumentFormattingEdits(model) {
            try {
              const edits = await provider.provideDocumentFormattingEdits(docForModel(model), { tabSize: 2, insertSpaces: true }, null);
              return toEdits(edits);
            } catch { return []; }
          },
        });
        disposables.push(d); created.push(d);
      }
      return { dispose() { for (const d of created) { try { d.dispose(); } catch { /* */ } const i = disposables.indexOf(d); if (i >= 0) disposables.splice(i, 1); } } };
    },
    /** 린터가 찾아낸 문제를 실제로 화면에 올린다.
     *
     *  예전엔 set/delete/clear 가 전부 빈 함수였다. 린터 확장은 파일을 다 읽고 문제를
     *  찾아 넘긴 뒤 아무 일도 일어나지 않는 것을 봤다 — 밑줄도, 문제 패널의 한 줄도 없다.
     *
     *  owner 를 확장마다 나눠 둔다. 한 이름을 나눠 쓰면 나중에 set 하는 확장이 앞
     *  확장의 진단을 지운다. */
    createDiagnosticCollection(name?: string) {
      const owner = "ext:" + ext.id + ":" + (name || "default");
      // 이 컬렉션이 마커를 올려 둔 모델들. clear/dispose 때 되짚어 지우려면 필요하다 —
      // 안 들고 있으면 "지웠다" 고 하고 옛 문제가 화면에 남는다.
      const touched = new Set<string>();
      const modelFor = (uri: any) => {
        const key = String(uri?.toString?.() ?? uri ?? "");
        if (!key) return null;
        try { return monaco.editor.getModel(monaco.Uri.parse(key)); } catch { return null; }
      };
      const put = (uri: any, list: any) => {
        const m = modelFor(uri);
        if (!m) return;   // 안 열린 파일 — 열릴 때 확장이 다시 진단한다
        const markers = toMarkers(list);
        monaco.editor.setModelMarkers(m, owner, markers);
        if (markers.length) touched.add(m.uri.toString()); else touched.delete(m.uri.toString());
      };
      const clearAll = () => {
        for (const key of touched) {
          try { const m = monaco.editor.getModel(monaco.Uri.parse(key)); if (m) monaco.editor.setModelMarkers(m, owner, []); } catch { /* 사라진 모델 */ }
        }
        touched.clear();
      };
      const coll = {
        name: name || "default",
        // vscode 는 set(uri, diags) 와 set(entries[]) 둘 다 받는다.
        set(a: any, b?: any) {
          if (Array.isArray(a) && b === undefined) { for (const [u, list] of a) put(u, list); return; }
          put(a, b);
        },
        delete(uri: any) { put(uri, []); },
        clear: clearAll,
        dispose() { clearAll(); },
        // 확장이 자기 진단을 되읽는 흐름이 있다. 빈 함수로 두면 "없다" 로 오해한다.
        get(uri: any) { const m = modelFor(uri); return m ? monaco.editor.getModelMarkers({ owner, resource: m.uri }) : []; },
        has(uri: any) { const m = modelFor(uri); return !!m && touched.has(m.uri.toString()); },
        forEach(cb: (uri: any, diags: any[]) => void) {
          for (const key of touched) {
            try { const u = monaco.Uri.parse(key); cb(u, monaco.editor.getModelMarkers({ owner, resource: u })); } catch { /* */ }
          }
        },
      };
      // 확장이 dispose 를 잊어도 재로드 때 정리된다 — 안 그러면 옛 진단이 계속 남는다.
      disposables.push({ dispose: clearAll });
      return coll;
    },
    setLanguageConfiguration() { return noopDisposable; },
  };

  /** 알림인가 물음인가를 인자로 가른다. vscode 도 이 한 함수로 둘 다 한다. */
  const msgOrAsk = async (tone: "info" | "warn" | "error", msg: string, items: any[]) => {
    const buttons = normalizeButtons(items);
    if (!buttons.length) {
      deps.toast(tone === "error" ? "error" : "info", ext.name + (tone === "warn" ? " ⚠ " : ": ") + msg);
      return undefined;
    }
    const got = await deps.prompt({ kind: "buttons", source: ext.name, title: String(msg), tone, buttons });
    return got == null ? undefined : buttons[got as number]!.raw;
  };

  const window_ = {
    // 버튼 없이 부르면 알림이다(토스트). 버튼을 주면 **물음**이다 — 예전엔 둘 다
    // 토스트로 흘리고 undefined 를 돌려줘, `if (await showInformationMessage(m, "Reload") === "Reload")`
    // 같은 흔한 흐름이 영원히 거짓이었다. 뭔가 뜨긴 하니 더 알아채기 어려웠다.
    showInformationMessage: (msg: string, ...items: any[]) => msgOrAsk("info", msg, items),
    showWarningMessage: (msg: string, ...items: any[]) => msgOrAsk("warn", msg, items),
    showErrorMessage: (msg: string, ...items: any[]) => msgOrAsk("error", msg, items),
    setStatusBarMessage: (_msg: string) => noopDisposable,
    createOutputChannel: (name: string) => {
      let buf = "";
      return {
        name, append: (s: string) => { buf += s; }, appendLine: (s: string) => { buf += s + "\n"; },
        clear: () => { buf = ""; }, show: () => deps.showPanel(name, `<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px;padding:12px">${buf.replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!))}</pre>`),
        hide: () => {}, dispose: () => {}, replace: (s: string) => { buf = s; },
      };
    },
    createStatusBarItem: () => ({ text: "", tooltip: "", command: "", show() {}, hide() {}, dispose() {} }),
    showQuickPick: async (items: any, options?: any) => {
      // 확장은 배열을 Promise 로 넘기기도 한다(파일 목록을 읽어 오는 흐름).
      const list = normalizePicks(await Promise.resolve(items));
      if (!list.length) return undefined;
      const many = options?.canPickMany === true;
      const got = await deps.prompt({
        kind: "pick", source: ext.name,
        title: String(options?.placeHolder ?? options?.title ?? ""),
        items: list, many,
        match: { matchOnDescription: options?.matchOnDescription === true, matchOnDetail: options?.matchOnDetail === true },
      });
      if (got == null) return undefined;
      // 넘겨받은 값 그대로 돌려준다 — 확장은 대개 자기가 붙인 필드를 보고 다음을 정한다.
      return many ? (got as number[]).map(i => list[i]!.raw) : list[got as number]!.raw;
    },
    showInputBox: async (options?: any) => {
      const got = await deps.prompt({
        kind: "input", source: ext.name,
        title: String(options?.prompt ?? options?.title ?? ""),
        detail: String(options?.placeHolder ?? ""),
        value: String(options?.value ?? ""),
        password: options?.password === true,
        validate: options?.validateInput,
      });
      return got == null ? undefined : String(got);
    },
    createTextEditorDecorationType: () => ({ dispose() {}, key: "sz-deco" }),
    registerTreeDataProvider: () => noopDisposable,
    registerWebviewViewProvider: () => noopDisposable,
    onDidChangeActiveTextEditor: editorEvents.activeChanged.event,
    onDidChangeTextEditorSelection: editorEvents.selectionChanged.event,
    // 예전엔 이 둘이 늘 undefined / 빈 배열이었다. 확장은 로드되고 "성공" 으로 보고된
    // 뒤 현재 파일을 못 읽어 조용히 아무것도 하지 않았다 — 앱은 그 정보를 다 갖고 있었다.
    get activeTextEditor() { return docs.activeEditor(); },
    get visibleTextEditors() { return docs.visibleEditors(); },
    showTextDocument: (doc: any) => Promise.resolve(docs.editorFor(relOf(doc))),
    withProgress: (_opts: any, task: any) => Promise.resolve(task({ report() {} }, { isCancellationRequested: false, onCancellationRequested: new EventEmitter().event })),
  };

  const workspace = {
    getConfiguration: (_section?: string) => ({
      get: (_key: string, def?: any) => def,
      has: () => false,
      update: () => Promise.resolve(),
      inspect: () => undefined,
    }),
    onDidChangeConfiguration: new EventEmitter().event,
    onDidChangeTextDocument: editorEvents.docChanged.event,
    onDidOpenTextDocument: editorEvents.docOpened.event,
    onDidCloseTextDocument: editorEvents.docClosed.event,
    onDidSaveTextDocument: editorEvents.docSaved.event,
    onDidChangeWorkspaceFolders: new EventEmitter().event,
    // 폴더를 안 주면 대부분의 확장이 첫 줄에서 물러난다.
    get workspaceFolders() { const f = folder(); return f ? [f] : undefined; },
    get textDocuments() { return docs.documents(); },
    getWorkspaceFolder: (_uri?: any) => folder(),
    createFileSystemWatcher: () => ({ onDidCreate: new EventEmitter().event, onDidChange: new EventEmitter().event, onDidDelete: new EventEmitter().event, dispose() {} }),
    openTextDocument: (arg?: any) => {
      // 열려 있지 않은 파일은 아직 못 연다(모델이 없다). 그래도 reject 로 끝내던
      // 자리라, 최소한 열려 있는 파일에는 답한다.
      const d = docs.docFor(relOf(arg));
      return d ? Promise.resolve(d) : Promise.reject(new Error("열려 있는 파일만 지원합니다"));
    },
    registerTextDocumentContentProvider: () => noopDisposable,
    fs: {},
    name: undefined,
  };

  const commands = {
    // 확장 id 로 네임스페이스 → 서로 다른 확장이 같은 raw id('extension.helloWorld' 등)를 등록해도 충돌/덮어쓰기 없음.
    // title 은 raw id 유지(팔레트 가독성). executeCommand 는 자기 네임스페이스로 해석(아래).
    registerCommand: (id: string, cb: (...args: any[]) => any) => {
      deps.registerCommand(ext.id + ":" + id, id, cb, ext.name);
      return new Disposable();
    },
    registerTextEditorCommand: (id: string, cb: (...args: any[]) => any) => {
      deps.registerCommand(ext.id + ":" + id, id, cb, ext.name);
      return new Disposable();
    },
    executeCommand,
    getCommands: () => Promise.resolve([]),
  };

  const api: any = {
    version: "1.85.0",
    commands, window: window_, languages, workspace,
    env: { appName: "Schutz", language: getLang(), machineId: "schutz", openExternal: () => Promise.resolve(true), clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve("") } },
    Uri: UriShim, Position, Range, Selection, Location, Disposable, EventEmitter,
    MarkdownString, CompletionItem, CompletionItemKind, Hover, ThemeIcon, ThemeColor,
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Active: -1, One: 1, Two: 2 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    TextEdit: { replace: (range: any, newText: string) => ({ range, newText }), insert: (position: any, newText: string) => ({ range: new Range(position, position), newText }) },
    languages_: languages,
  };
  return api;
}
