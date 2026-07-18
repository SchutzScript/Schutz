// 최소 vscode API 셰임 — 프로그램형 VS Code 확장의 activate() 를 렌더러에서 실행할 수 있게 한다.
// 지원: commands · window 메시지/출력채널 · languages(완성/호버/정의) · workspace 설정 · 기본 타입.
// Node/네이티브 의존이나 미구현 API를 쓰는 확장은 실패(캐치되어 보고). "단순 확장"용.
import monaco from "../editor/monacoSetup";
import { getLang } from "../i18n";

export interface ShimDeps {
  toast: (kind: "ok" | "error" | "info", msg: string) => void;
  showPanel: (title: string, html: string) => void;
  getActiveFile: () => string | null;
  registerCommand: (id: string, title: string, run: (...args: any[]) => any, source: string) => void;
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
export function makeVscodeApi(deps: ShimDeps, ext: { id: string; name: string }) {
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
              const items = await provider.provideCompletionItems(model, new Position(position.lineNumber - 1, position.column - 1), { triggerKind: 0 }, null);
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
              const h = await provider.provideHover(model, new Position(position.lineNumber - 1, position.column - 1), null);
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
    registerDefinitionProvider() { return noopDisposable; },
    registerCodeActionsProvider() { return noopDisposable; },
    registerDocumentFormattingEditProvider() { return noopDisposable; },
    createDiagnosticCollection(name?: string) { return { set() {}, delete() {}, clear() {}, dispose() {}, name }; },
    setLanguageConfiguration() { return noopDisposable; },
  };

  const window_ = {
    showInformationMessage: (msg: string, ..._items: any[]) => { deps.toast("info", ext.name + ": " + msg); return Promise.resolve(undefined); },
    showWarningMessage: (msg: string, ..._items: any[]) => { deps.toast("info", ext.name + " ⚠ " + msg); return Promise.resolve(undefined); },
    showErrorMessage: (msg: string, ..._items: any[]) => { deps.toast("error", ext.name + ": " + msg); return Promise.resolve(undefined); },
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
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
    createTextEditorDecorationType: () => ({ dispose() {}, key: "sz-deco" }),
    registerTreeDataProvider: () => noopDisposable,
    registerWebviewViewProvider: () => noopDisposable,
    onDidChangeActiveTextEditor: new EventEmitter().event,
    onDidChangeTextEditorSelection: new EventEmitter().event,
    get activeTextEditor() { return undefined; },
    visibleTextEditors: [] as any[],
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
    onDidChangeTextDocument: new EventEmitter().event,
    onDidOpenTextDocument: new EventEmitter().event,
    onDidCloseTextDocument: new EventEmitter().event,
    onDidSaveTextDocument: new EventEmitter().event,
    onDidChangeWorkspaceFolders: new EventEmitter().event,
    workspaceFolders: undefined as any,
    getWorkspaceFolder: () => undefined,
    getText: () => "",
    createFileSystemWatcher: () => ({ onDidCreate: new EventEmitter().event, onDidChange: new EventEmitter().event, onDidDelete: new EventEmitter().event, dispose() {} }),
    openTextDocument: () => Promise.reject(new Error("openTextDocument 미지원")),
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
