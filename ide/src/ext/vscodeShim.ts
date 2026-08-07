// 최소 vscode API 셰임 — 프로그램형 VS Code 확장의 activate() 를 렌더러에서 실행할 수 있게 한다.
// 지원: commands · window 메시지/출력채널 · languages(완성/호버/정의) · workspace 설정 · 기본 타입.
// Node/네이티브 의존이나 미구현 API를 쓰는 확장은 실패(캐치되어 보고). "단순 확장"용.
import monaco from "../editor/monacoSetup";
import { getLang, t } from "../i18n";
import * as projectModels from "../editor/projectModels";
import { makeDocIndex } from "./shimDoc";
import { normalizePicks, normalizeButtons, type PromptReq } from "./prompt";
import { toMarkers, toLocations, toEdits } from "./shimLang";
import { flattenDefaults, fullKey, readValue, hasValue, inspectValue, sectionValues, affects } from "./config";
import { cleanText, ALIGN_LEFT, ALIGN_RIGHT, type StatusItem } from "./statusBar";
import { globToRegExp, dispatch as fsDispatch, type WatcherSpec, type FsDelta } from "./fsWatch";
import { parseViews, containerTitle, normalizeTreeItem, type ViewDecl, type TreeRow } from "./views";
import { collectEdits, groupByFile, sortForApply, hasOverlap, normalizeAction } from "./workspaceEdit";
import { createDecoType, applyDecos, disposeAllDecos, type DecoTypeHandle } from "./decoStore";
import { planFileOps, deletedBy, badPath, type FileOp } from "./fileOps";
import { setShimDocSource } from "./extHost";

/** 지금 살아 있는 파일 감시자들. 확장을 다시 읽으면 disposeShimRegistrations 가 비운다. */
const fsWatchers = new Map<string, WatcherSpec>();
let fsWatchSeq = 0;

/** 앱이 파일 변화를 알아냈을 때 부른다. 맞는 감시자에게만 간다. */
export function deliverFsDelta(delta: FsDelta): number {
  return fsDispatch(fsWatchers.values(), delta);
}

/** 확장이 붙인 뷰들. 앱의 사이드바가 이 표를 읽어 그린다.
 *  예전엔 registerTreeDataProvider/registerWebviewViewProvider 가 빈 disposable 만
 *  돌려줬고, 그 뷰가 놓일 자리 자체가 앱에 없었다. */
export interface RegisteredView {
  id: string;
  title: string;
  /** 어느 확장이 붙였는가. 명령은 확장별로 이름이 붙어 저장되므로(ext.id + ":" + id)
   *  이걸 같이 넘기지 않으면 줄을 눌러도 아무 일이 없다. */
  extId: string;
  group: string;
  source: string;
  kind: "tree" | "webview";
  /** 트리 — 자식 목록과 줄 하나를 확장에 물어본다. */
  children?: (element: any) => Promise<any[]>;
  item?: (element: any) => Promise<TreeRow>;
  /** 트리가 스스로 "바뀌었다" 고 알릴 때 부를 것을 등록한다. */
  onChange?: (fn: () => void) => () => void;
  /** 웹뷰 — 앱이 붙일 자리를 마련한 뒤 부른다. HTML 을 돌려준다. */
  resolve?: () => Promise<string>;
  /** 웹뷰가 보낸 메시지를 확장에 넘긴다. */
  post?: (msg: any) => void;
  /** 확장에게 메시지를 보낸다(앱 → 웹뷰는 App 이 iframe 에 직접 쏜다). */
}

const extViews = new Map<string, RegisteredView>();
const viewListeners = new Set<() => void>();
function viewsChanged() { for (const f of viewListeners) { try { f(); } catch { /* */ } } }

export function listExtViews(): RegisteredView[] { return [...extViews.values()]; }
export function onExtViewsChanged(fn: () => void): () => void {
  viewListeners.add(fn);
  return () => viewListeners.delete(fn);
}

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
  /** 상태바에 항목을 올리고 내린다. 없으면 확장이 올린 글자가 어디에도 안 보인다. */
  statusSet: (item: StatusItem) => void;
  statusRemove: (id: string) => void;
  /** 확장 → 웹뷰 메시지. App 이 iframe 을 들고 있다. */
  postToView: (viewId: string, msg: any) => void;
  /** 파일 하나 저장 — document.save() 가 탄다. */
  saveFile: (rel: string) => Promise<boolean>;
  /** 아직 안 연 파일의 내용을 읽는다 — openTextDocument 가 탄다. */
  readFile: (rel: string) => Promise<string | null>;
  /** 트리 뷰에서 한 줄을 펼쳐 보여 준다. */
  revealInView: (viewId: string, element: any, expand: boolean) => Promise<void>;
  /** WorkspaceEdit 의 파일 만들기·지우기·이름 바꾸기. 앱이 모델 정리와 트리 갱신까지
   *  맡는다 — 셰임이 디스크만 건드리면 열린 버퍼가 실제 파일과 어긋난다. */
  fileOps?: {
    exists: (rel: string) => boolean;
    isDirty: (rel: string) => boolean;
    create: (rel: string, content: string, overwrite: boolean) => Promise<boolean>;
    remove: (rel: string) => Promise<boolean>;
    rename: (from: string, to: string, overwrite: boolean) => Promise<boolean>;
  };
}

const disposables: monaco.IDisposable[] = [];
/** 이전 로드에서 등록한 Monaco 프로바이더 정리 (재로드 시 중복 방지) */
/** 확장별로 만들어 둔 데코레이션 타입 — 정리 때 그려 둔 것까지 걷기 위해 들고 있다. */
const decoTypesByExt = new Map<string, DecoTypeHandle[]>();

export function disposeShimRegistrations() {
  for (const d of disposables.splice(0)) { try { d.dispose(); } catch { /* */ } }
  for (const list of decoTypesByExt.values()) disposeAllDecos(list);
  decoTypesByExt.clear();
}

// ── 기본 타입 ──────────────────────────────────────────────────
class Position { constructor(public line: number, public character: number) {} }
class Range {
  start: Position; end: Position;
  constructor(a: any, b?: any, c?: number, d?: number) {
    // 확장은 `{ line, character }` 리터럴을 그대로 넘기기도 한다. instanceof 만 보면
    // 그게 줄 번호 자리로 들어가 범위가 통째로 엉킨다 — 편집이 엉뚱한 곳에 적히거나
    // 아무 데도 안 적힌다.
    const isPos = (v: any) => v instanceof Position || (v && typeof v === "object" && "line" in v);
    if (isPos(a)) { this.start = a; this.end = isPos(b) ? b : a; }
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
/** WorkspaceEdit 이 적어 두는 파일 조작 — 아직 상대 경로로 풀기 전이다. */
interface RawFileOp {
  kind: "create" | "delete" | "rename";
  uri: any; toUri?: any;
  overwrite?: boolean; ignoreIfExists?: boolean; ignoreIfNotExists?: boolean;
  contents?: any;
}

/** createFile 의 contents 는 Uint8Array 로 온다. 없으면 빈 파일이고, 확장은 보통
 *  그 뒤에 편집으로 채운다. */
function decodeContents(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return new TextDecoder().decode(v); } catch { return ""; }
}

/** 확장이 편집을 모아 담는 그릇. 이게 없어서 `new vscode.WorkspaceEdit()` 가 첫 줄에서
 *  죽었고, 편집을 담은 코드 액션은 확장이 만들 수조차 없었다. */
class WorkspaceEdit {
  _edits: { uri: any; range: any; text: string }[] = [];
  replace(uri: any, range: any, newText: string) { this._edits.push({ uri, range, text: newText }); }
  insert(uri: any, position: any, newText: string) { this._edits.push({ uri, range: new Range(position, position), text: newText }); }
  delete(uri: any, range: any) { this._edits.push({ uri, range, text: "" }); }
  set(uri: any, edits: any[]) {
    // vscode 의 set 은 그 파일의 편집을 **갈아 끼운다.** 덧붙이면 앞서 넣은 것이 같이 남아
    // 두 번 적용된다.
    const key = String(uri?.toString?.() ?? uri ?? "");
    this._edits = this._edits.filter(e => String(e.uri?.toString?.() ?? e.uri ?? "") !== key);
    for (const e of edits ?? []) this._edits.push({ uri, range: e?.range, text: e?.newText ?? "" });
  }
  has(uri: any) { const k = String(uri?.toString?.() ?? uri ?? ""); return this._edits.some(e => String(e.uri?.toString?.() ?? e.uri ?? "") === k); }
  get size() { return new Set(this._edits.map(e => String(e.uri?.toString?.() ?? e.uri ?? ""))).size; }
  entries() {
    const by = new Map<string, { uri: any; list: any[] }>();
    for (const e of this._edits) {
      const k = String(e.uri?.toString?.() ?? e.uri ?? "");
      if (!by.has(k)) by.set(k, { uri: e.uri, list: [] });
      by.get(k)!.list.push({ range: e.range, newText: e.text });
    }
    return [...by.values()].map(v => [v.uri, v.list] as [any, any[]]);
  }
  /** 파일 조작. 적어만 두고 실제 실행은 applyEdit 이 한다 — 무엇을 할지 다 모은 뒤에
   *  판단해야 "하나라도 못 하면 아무것도 안 한다" 를 지킬 수 있다.
   *
   *  여기서는 uri 를 그대로 들고 있는다. 워크스페이스 루트를 아는 것은 applyEdit 쪽이라
   *  상대 경로로 바꾸는 것도 거기서 한다. */
  _ops: RawFileOp[] = [];
  createFile(uri: any, options?: any, _meta?: any) {
    this._ops.push({ kind: "create", uri, overwrite: !!options?.overwrite, ignoreIfExists: !!options?.ignoreIfExists, contents: options?.contents });
  }
  deleteFile(uri: any, options?: any, _meta?: any) {
    this._ops.push({ kind: "delete", uri, ignoreIfNotExists: !!options?.ignoreIfNotExists });
  }
  renameFile(from: any, to: any, options?: any, _meta?: any) {
    this._ops.push({ kind: "rename", uri: from, toUri: to, overwrite: !!options?.overwrite, ignoreIfNotExists: !!options?.ignoreIfNotExists });
  }
}
class CodeAction {
  edit?: any; command?: any; diagnostics?: any[]; isPreferred?: boolean;
  constructor(public title: string, public kind?: any) {}
}
const CodeActionKind = {
  Empty: { value: "" }, QuickFix: { value: "quickfix" }, Refactor: { value: "refactor" },
  RefactorExtract: { value: "refactor.extract" }, RefactorInline: { value: "refactor.inline" },
  RefactorRewrite: { value: "refactor.rewrite" }, Source: { value: "source" },
  SourceOrganizeImports: { value: "source.organizeImports" }, SourceFixAll: { value: "source.fixAll" },
};
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
  // 윈도우에서 드라이브 글자의 대소문자가 어긋난다. 앱은 워크스페이스를 `C:/…` 로
  // 들고 있는데 Uri.fsPath 는 `c:\…` 를 준다. 그대로 비교하면 접두사가 안 맞아
  // **절대 경로가 그대로 상대 경로 자리에 들어가고**, 뒤이은 파일 조회가 전부 빗나간다.
  // 자를 위치만 대소문자 없이 정하고, 잘라 낸 조각은 원본 그대로 쓴다.
  return q.toLowerCase().startsWith(r.toLowerCase()) ? q.slice(r.length) : q;
}
function relOfWith(root: string | null, arg: any): string | null {
  if (!arg) return null;
  const p = typeof arg === "string" ? arg : (arg.fsPath || arg.path || arg.uri?.fsPath || arg.uri?.path);
  if (!p) return null;
  return root ? stripRoot(root, p) : String(p);
}

export function makeVscodeApi(deps: ShimDeps, ext: { id: string; name: string; contributes?: any }) {
  // 이 확장이 만든 데코레이션 타입. 확장이 내려갈 때 그려 둔 것까지 함께 걷는다 —
  // 규칙만 남기고 가면 다음 확장이 만든 타입과 클래스가 섞인다.
  const extDecoTypes: DecoTypeHandle[] = [];
  decoTypesByExt.set(ext.id, extDecoTypes);
  const docs = makeDocIndex(
    { root: deps.workspaceRoot, activeRel: deps.getActiveFile, openRels: deps.openFiles, save: deps.saveFile },
    { Position, Range, Selection },
  );
  const relOf = (arg: any) => relOfWith(deps.workspaceRoot(), arg);

  /** WorkspaceEdit 를 열린 모델에 적용한다.
   *
   *  모델을 거치므로 Ctrl+Z 로 되돌릴 수 있고, 저장 기준선도 어긋나지 않는다.
   *  안 열린 파일은 손대지 않는다 — 디스크에 직접 쓰면 되돌릴 방법이 없다. */
  /** 편집 그룹의 키(uri 문자열)에서 상대 경로를 뽑는다.
   *
   *  키는 `uri.toString()` 이라 퍼센트 인코딩돼 있다(`file:///c%3A/...`). 그대로
   *  relOf 에 넣으면 루트와 안 맞아 빈손으로 온다 — 아직 만들어지지 않은 파일은
   *  모델로도 찾을 수 없어서, 그 둘이 겹치면 "만들고 나서 편집" 이 통째로 거절됐다. */
  const relForKey = (uriKey: string): string | null => {
    const byUri = projectModels.relFor(uriKey);
    if (byUri) return byUri;
    // `file:///c%3A/...` 를 먼저 사람 경로로 되돌린다. 그냥 relOf 에 넣으면 루트와
    // 안 맞는데, stripRoot 는 안 맞을 때 **받은 문자열을 그대로 돌려준다** — 그래서
    // null 이 아니라 uri 문자열이 상대 경로 행세를 했고, 아직 없는 파일을 만들려던
    // 편집이 "모델을 못 찾았다" 로 접혔다.
    let raw = String(uriKey || "");
    if (/^file:\/\//i.test(raw)) {
      try { raw = decodeURIComponent(raw.replace(/^file:\/\/\/?/i, "")); } catch { /* 망가진 인코딩 */ }
    }
    const rel = relOf(raw);
    // stripRoot 가 손대지 못한 값(루트 밖·uri 그대로)은 상대 경로가 아니다.
    if (!rel || badPath(rel)) return null;
    return rel;
  };

  const modelForUri = (uriKey: string): monaco.editor.ITextModel | null => {
    const rel = relForKey(uriKey);
    return rel ? projectModels.getByRel(rel) : null;
  };

  const applyWorkspaceEdit = async (we: any): Promise<boolean> => {
    // ── 1. 파일 조작을 먼저 확정한다 ──
    // 텍스트 편집과 달리 되돌릴 수 없으므로, 무엇을 할지 전부 정한 뒤에 손을 댄다.
    const raw: RawFileOp[] = Array.isArray(we?._ops) ? we._ops : [];
    const fileOps: FileOp[] = [];
    for (const r of raw) {
      const rel = relOf(r.uri);
      const to = r.toUri ? relOf(r.toUri) : undefined;
      // 워크스페이스 밖이면 relOf 가 빈손으로 온다. planFileOps 가 거절하도록 그대로 넘긴다.
      fileOps.push({
        kind: r.kind, rel: rel ?? String(r.uri?.toString?.() ?? r.uri ?? ""),
        ...(r.kind === "rename" ? { to: to ?? String(r.toUri?.toString?.() ?? r.toUri ?? "") } : {}),
        overwrite: r.overwrite, ignoreIfExists: r.ignoreIfExists, ignoreIfNotExists: r.ignoreIfNotExists,
        ...(r.kind === "create" ? { content: decodeContents(r.contents) } : {}),
      });
    }

    const files = groupByFile(collectEdits(we));
    if (!files.length && !fileOps.length) return false;

    let plan: FileOp[] = [];
    if (fileOps.length) {
      if (!deps.fileOps) return false;   // 앱이 통로를 안 준 경우(브라우저 프리뷰 등)
      const decided = planFileOps(fileOps, {
        exists: rel => deps.fileOps!.exists(rel),
        isDirty: rel => deps.fileOps!.isDirty(rel),
      });
      // 못 하겠으면 텍스트 편집도 손대지 않는다 — 반만 적용된 리팩터가 제일 나쁘다.
      if (decided.ok !== true) { deps.toast("error", t("exth.fileOpRefused", { why: decided.reason })); return false; }
      plan = decided.ops;
    }

    // ── 2. 텍스트 편집을 검사한다 ──
    // 이 판에서 사라질 파일에 걸린 편집은 버린다(지워질 파일을 고칠 이유가 없다).
    // 이 판에서 새로 만들어질 파일은 아직 모델이 없으므로 파일 조작 뒤에 다시 찾는다.
    const gone = deletedBy(plan);
    const willCreate = new Set(plan.filter(o => o.kind === "create").map(o => o.rel));
    const renamedTo = new Map(plan.filter(o => o.kind === "rename").map(o => [o.rel, o.to as string]));
    const pending: { key: string; edits: { range: any; text: string }[] }[] = [];
    for (const f of files) {
      const rel = relForKey(f.key);
      if (rel && gone.has(rel)) continue;
      if (hasOverlap(f.edits)) return false;
      const fresh = rel && (willCreate.has(rel) || renamedTo.has(rel));
      if (!fresh) {
        const model = modelForUri(f.key);
        if (!model || model.isDisposed()) return false;
      }
      pending.push({ key: f.key, edits: sortForApply(f.edits) });
    }

    // ── 3. 실행 ──
    for (const op of plan) {
      let ok = false;
      try {
        if (op.kind === "create") ok = await deps.fileOps!.create(op.rel, op.content ?? "", !!op.overwrite);
        else if (op.kind === "delete") ok = await deps.fileOps!.remove(op.rel);
        else ok = await deps.fileOps!.rename(op.rel, op.to as string, !!op.overwrite);
      } catch { ok = false; }
      // 여기서 실패하면 앞의 것은 이미 벌어진 뒤다. 되돌릴 수는 없으니 어디까지
      // 됐는지 말하고 멈춘다 — 조용히 성공으로 답하는 것보다 낫다.
      if (!ok) { deps.toast("error", t("exth.fileOpFailed", { rel: op.kind === "rename" ? op.rel + " → " + op.to : op.rel })); return false; }
    }

    const root = deps.workspaceRoot();
    for (const p of pending) {
      let model = modelForUri(p.key);
      if ((!model || model.isDisposed()) && root) {
        // 방금 만든 파일은 아직 모델이 없다. 여기서 세워 두면 편집이 모델을 거치므로
        // Ctrl+Z 로 되돌릴 수 있고, 저장 기준선도 어긋나지 않는다.
        const rel = relForKey(p.key);
        if (rel) { try { model = projectModels.ensure(root, rel, ""); } catch { model = null; } }
      }
      if (!model || model.isDisposed()) continue;
      model.pushEditOperations([], p.edits.map(e => ({ range: e.range, text: e.text })), () => null);
    }
    return true;
  };
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
    /** 코드 액션. WorkspaceEdit 가 없던 동안은 붙일 수가 없었다 — 편집을 담은 액션을
     *  확장이 만들 수조차 없었으니, 반쪽만 붙이면 되는 것과 안 되는 것만 흐려진다. */
    registerCodeActionsProvider(selector: any, provider: any, _metadata?: any) {
      // metadata.providedCodeActionKinds 는 받아만 두고 쓰지 않는다. Monaco 는 종류를
      // 프로바이더가 아니라 등록 쪽에서 받는데, 그 목록은 "무엇을 낼 수 있는지" 힌트라
      // 없어도 액션은 그대로 나온다. 확장 쪽 호출이 깨지지 않게 인자만 받아 둔다.
      const created: monaco.IDisposable[] = [];
      for (const lang of langIdsFromSelector(selector)) {
        const d = monaco.languages.registerCodeActionProvider(lang, {
          async provideCodeActions(model, range, context) {
            try {
              const doc = docForModel(model);
              const vrange = new Range(range.startLineNumber - 1, range.startColumn - 1, range.endLineNumber - 1, range.endColumn - 1);
              // 이 자리의 진단을 함께 넘긴다. 빠른 수정은 대개 그걸 보고 무엇을 고칠지 정한다.
              const diagnostics = (context?.markers ?? []).map((m: any) => ({
                message: m.message,
                range: new Range(m.startLineNumber - 1, m.startColumn - 1, m.endLineNumber - 1, m.endColumn - 1),
                severity: m.severity === 8 ? 0 : m.severity === 4 ? 1 : m.severity === 2 ? 2 : 3,
                source: m.source, code: m.code,
              }));
              const res = await provider.provideCodeActions(doc, vrange, { diagnostics, only: undefined, triggerKind: 1 }, null);
              const list = (Array.isArray(res) ? res : []).map(normalizeAction).filter(Boolean) as any[];
              return {
                actions: list.map(a => ({
                  title: a.title,
                  kind: a.kind || undefined,
                  isPreferred: a.isPreferred,
                  // 편집은 Monaco 가 직접 적용하게 넘긴다 — undo 스택에 한 덩어리로 남는다.
                  edit: a.files.length ? { edits: a.files.flatMap((f: any) => {
                    const m2 = modelForUri(f.key);
                    if (!m2) return [];
                    return sortForApply(f.edits).map(e => ({ resource: m2.uri, textEdit: { range: e.range, text: e.text }, versionId: undefined }));
                  }) } : undefined,
                  command: a.commandId ? { id: ext.id + ":" + a.commandId, title: a.title, arguments: a.commandArgs } : undefined,
                  diagnostics: [],
                })),
                dispose() { /* */ },
              };
            } catch { return { actions: [], dispose() { /* */ } }; }
          },
        });
        disposables.push(d); created.push(d);
      }
      return { dispose() { for (const d of created) { try { d.dispose(); } catch { /* */ } const i = disposables.indexOf(d); if (i >= 0) disposables.splice(i, 1); } } };
    },
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

  let statusSeq = 0;
  const window_ = {
    // 버튼 없이 부르면 알림이다(토스트). 버튼을 주면 **물음**이다 — 예전엔 둘 다
    // 토스트로 흘리고 undefined 를 돌려줘, `if (await showInformationMessage(m, "Reload") === "Reload")`
    // 같은 흔한 흐름이 영원히 거짓이었다. 뭔가 뜨긴 하니 더 알아채기 어려웠다.
    showInformationMessage: (msg: string, ...items: any[]) => msgOrAsk("info", msg, items),
    showWarningMessage: (msg: string, ...items: any[]) => msgOrAsk("warn", msg, items),
    showErrorMessage: (msg: string, ...items: any[]) => msgOrAsk("error", msg, items),
    /** 잠깐 띄우는 한 줄. 시간을 주면 그때 스스로 내려간다. */
    setStatusBarMessage: (msg: string, hideAfter?: number) => {
      const id = "sbmsg:" + ext.id + ":" + (++statusSeq);
      deps.statusSet({ id, source: ext.name, text: cleanText(msg), tooltip: "", alignment: ALIGN_RIGHT, priority: -1, seq: 0 });
      const off = () => deps.statusRemove(id);
      if (typeof hideAfter === "number" && hideAfter > 0) setTimeout(off, hideAfter);
      return { dispose: off };
    },
    createOutputChannel: (name: string) => {
      let buf = "";
      return {
        name, append: (s: string) => { buf += s; }, appendLine: (s: string) => { buf += s + "\n"; },
        clear: () => { buf = ""; }, show: () => deps.showPanel(name, `<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px;padding:12px">${buf.replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!))}</pre>`),
        hide: () => {}, dispose: () => {}, replace: (s: string) => { buf = s; },
      };
    },
    /** 상태바 항목. 예전엔 `text` 를 받아 두기만 하는 빈 객체였다 — 대입도 show() 도
     *  성공하는데 그 객체를 읽는 곳이 없어서, "빌드 중…" 같은 알림이 통째로 사라졌다. */
    createStatusBarItem: (...args: any[]) => {
      // vscode 는 (alignment, priority) 와 (id, alignment, priority) 둘 다 받는다.
      const withId = typeof args[0] === "string";
      const alignment = withId ? args[1] : args[0];
      const priority = withId ? args[2] : args[1];
      const id = "sb:" + ext.id + ":" + (++statusSeq);
      let shown = false;
      const item: any = {
        id, text: "", tooltip: "", command: undefined, color: undefined, name: undefined,
        alignment: alignment === ALIGN_LEFT ? ALIGN_LEFT : ALIGN_RIGHT,
        priority: typeof priority === "number" ? priority : 0,
        show() { shown = true; push(); },
        hide() { shown = false; deps.statusRemove(id); },
        dispose() { shown = false; deps.statusRemove(id); },
      };
      const push = () => {
        if (!shown) return;
        const cmd = typeof item.command === "string" ? item.command : item.command?.command;
        deps.statusSet({
          id, source: ext.name,
          text: cleanText(item.text),
          // 어느 확장이 올린 글자인지 밝힌다 — 상태바는 앱의 것으로 읽히는 자리다.
          tooltip: [String(item.tooltip ?? ""), ext.name].filter(Boolean).join(" — "),
          alignment: item.alignment, priority: item.priority, seq: 0,
          run: cmd ? () => { void executeCommand(cmd); } : undefined,
        });
      };
      // 확장은 show() 뒤에도 text 를 계속 갈아 끼운다(진행 표시). 그때마다 올려 줘야 한다.
      return new Proxy(item, { set(t, k, v) { (t as any)[k] = v; push(); return true; } });
    },
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
    // 예전엔 `() => ({ dispose() {}, key: "sz-deco" })` 였다. 확장은 성공을 받고
    // 화면에는 아무것도 없었다 — 인라인 blame·커버리지 표시가 전부 여기 걸려 있었다.
    createTextEditorDecorationType: (options: any) => {
      const h = createDecoType(options);
      if (h._szEmpty) {
        // 옵션에서 알아들은 것이 하나도 없으면 그려도 보이는 것이 없다. 조용히
        // 성공을 답하는 대신 말해 준다 — 그게 이 자리에서 없애려던 바로 그 모양이다.
        console.warn(`[ext:${ext.id}] createTextEditorDecorationType: 그릴 수 있는 속성이 없습니다.`);
      }
      extDecoTypes.push(h);
      return h;
    },
    registerTreeDataProvider: (viewId: string, provider: any) => {
      const id = String(viewId);
      extViews.set(id, {
        id, extId: ext.id, title: titleFor(id), group: groupFor(id), source: ext.name, kind: "tree",
        children: async (element?: any) => {
          const r = await provider?.getChildren?.(element);
          return Array.isArray(r) ? r : [];
        },
        item: async (element: any) => normalizeTreeItem(await provider?.getTreeItem?.(element)),
        onChange: (fn: () => void) => {
          const ev = provider?.onDidChangeTreeData;
          if (typeof ev !== "function") return () => { /* 알림 없는 프로바이더 */ };
          const d = ev(() => fn());
          return () => { try { d?.dispose?.(); } catch { /* */ } };
        },
      });
      viewsChanged();
      const d = { dispose() { extViews.delete(id); viewsChanged(); } };
      disposables.push(d);
      return d;
    },
    /** createTreeView 는 같은 등록에 손잡이를 하나 더 얹은 것이다. */
    createTreeView: (viewId: string, options: any) => {
      const d = window_.registerTreeDataProvider(viewId, options?.treeDataProvider);
      return {
        visible: true, selection: [], onDidChangeVisibility: new EventEmitter().event,
        onDidChangeSelection: new EventEmitter().event, onDidExpandElement: new EventEmitter().event,
        onDidCollapseElement: new EventEmitter().event,
        // 트리 줄을 펼쳐 보여 준다. 어느 줄인지는 앱이 프로바이더에 되물어 찾는다 —
        // 확장이 넘기는 것은 자기 데이터 객체라 우리가 곧장 알아볼 수 없다.
        reveal: (element: any, options?: any) => deps.revealInView(String(viewId), element, options?.expand !== false),
        get title() { return titleFor(String(viewId)); },
        set title(_v: string) { /* 제목은 매니페스트가 정한다 */ },
        dispose: d.dispose,
      };
    },
    registerWebviewViewProvider: (viewId: string, provider: any) => {
      const id = String(viewId);
      let onMsg: ((m: any) => void) | null = null;
      extViews.set(id, {
        id, extId: ext.id, title: titleFor(id), group: groupFor(id), source: ext.name, kind: "webview",
        resolve: async () => {
          let html = "";
          const webview: any = {
            options: {}, cspSource: "schutz:",
            get html() { return html; },
            set html(v: string) { html = String(v ?? ""); viewsChanged(); },
            onDidReceiveMessage: (fn: (m: any) => void) => { onMsg = fn; return { dispose() { onMsg = null; } }; },
            // 앱 → 웹뷰. App 이 iframe 을 들고 있으므로 그쪽에 넘긴다.
            postMessage: (m: any) => { deps.postToView(id, m); return Promise.resolve(true); },
            asWebviewUri: (u: any) => u,
          };
          const view: any = {
            webview, visible: true, title: titleFor(id), description: "",
            onDidChangeVisibility: new EventEmitter().event, onDidDispose: new EventEmitter().event,
            show: () => { /* 앱이 이미 보여 주고 있다 */ },
          };
          await provider?.resolveWebviewView?.(view, { state: undefined }, { isCancellationRequested: false, onCancellationRequested: new EventEmitter().event });
          return html;
        },
        post: (msg: any) => { try { onMsg?.(msg); } catch { /* 확장이 던진 것 */ } },
      });
      viewsChanged();
      const d = { dispose() { extViews.delete(id); viewsChanged(); } };
      disposables.push(d);
      return d;
    },
    onDidChangeActiveTextEditor: editorEvents.activeChanged.event,
    onDidChangeTextEditorSelection: editorEvents.selectionChanged.event,
    // 예전엔 이 둘이 늘 undefined / 빈 배열이었다. 확장은 로드되고 "성공" 으로 보고된
    // 뒤 현재 파일을 못 읽어 조용히 아무것도 하지 않았다 — 앱은 그 정보를 다 갖고 있었다.
    get activeTextEditor() { return docs.activeEditor(); },
    get visibleTextEditors() { return docs.visibleEditors(); },
    showTextDocument: (doc: any) => Promise.resolve(docs.editorFor(relOf(doc))),
    withProgress: (_opts: any, task: any) => Promise.resolve(task({ report() {} }, { isCancellationRequested: false, onCancellationRequested: new EventEmitter().event })),
  };

  // ── 설정 ──
  // 확장은 자기 기본값을 package.json 의 contributes.configuration 에 적어 두고
  // `get(key)` 를 인자 없이 부른다. 예전 셰임은 그 선언을 아예 안 읽어서 그런 호출이
  // 전부 undefined 였다 — 확장은 "설정이 꺼져 있다" 로 읽고 기능을 접었다.
  const viewDecls: ViewDecl[] = parseViews(ext.contributes);
  const declFor = (id: string) => viewDecls.find(v => v.id === id);
  const titleFor = (id: string) => declFor(id)?.name || id;
  const groupFor = (id: string) => {
    const d = declFor(id);
    return d ? containerTitle(ext.contributes, d.container) : ext.name;
  };

  const cfgDefaults = flattenDefaults(ext.contributes);
  const CFG_NS = "schutz.extconfig." + ext.id;
  const readStored = (): Record<string, any> => {
    try { return JSON.parse(localStorage.getItem(CFG_NS) || "{}"); } catch { return {}; }
  };
  const writeStored = (o: Record<string, any>) => {
    try { localStorage.setItem(CFG_NS, JSON.stringify(o)); } catch { /* 용량초과 */ }
  };
  const cfgChanged = new EventEmitter<any>();

  const getConfiguration = (section?: string) => {
    const src = { defaults: cfgDefaults, stored: readStored() };
    const key = (k: string) => fullKey(section, k);
    // vscode 의 설정 객체는 값을 **속성으로도** 노출한다(`cfg.enable`). 그렇게 읽는
    // 확장이 흔해서, 아래 메서드보다 먼저 얹고 메서드가 덮어쓰게 둔다.
    return Object.assign(sectionValues(src, section), {
      get: (k: string, def?: any) => readValue(src, key(k), def),
      has: (k: string) => hasValue(src, key(k)),
      inspect: (k: string) => inspectValue(src, key(k)),
      update: (k: string, value: any) => {
        const full = key(k);
        const next = readStored();
        // undefined 는 "기본값으로 되돌린다" 는 뜻이다(vscode 규약). 그대로 저장하면
        // 사용자가 undefined 를 골랐다는 뜻이 되어 선언 기본값이 영영 안 돌아온다.
        if (value === undefined) delete next[full]; else next[full] = value;
        writeStored(next);
        cfgChanged.fire({ affectsConfiguration: (q: string) => affects([full], q) });
        return Promise.resolve();
      },
    });
  };

  const workspace = {
    getConfiguration,
    onDidChangeConfiguration: cfgChanged.event,
    onDidChangeTextDocument: editorEvents.docChanged.event,
    onDidOpenTextDocument: editorEvents.docOpened.event,
    onDidCloseTextDocument: editorEvents.docClosed.event,
    onDidSaveTextDocument: editorEvents.docSaved.event,
    onDidChangeWorkspaceFolders: new EventEmitter().event,
    // 폴더를 안 주면 대부분의 확장이 첫 줄에서 물러난다.
    get workspaceFolders() { const f = folder(); return f ? [f] : undefined; },
    get textDocuments() { return docs.documents(); },
    getWorkspaceFolder: (_uri?: any) => folder(),
    /** 파일 감시자. 예전엔 아무도 쏘지 않는 이미터 셋이라, 파일이 바뀌면 다시 읽는
     *  확장이 한 번도 깨어나지 않았다. 정작 바뀐 경로는 메인이 처음부터 알고 있었다. */
    createFileSystemWatcher: (pattern: any, ignoreCreate?: boolean, ignoreChange?: boolean, ignoreDelete?: boolean) => {
      // RelativePattern(`{ base, pattern }`) 도 온다. 우리는 워크스페이스 하나만
      // 다루므로 pattern 만 본다 — base 를 무시해도 루트 밖은 애초에 안 감시한다.
      const glob = typeof pattern === "string" ? pattern : String(pattern?.pattern ?? "**/*");
      const onCreate = new EventEmitter<any>(), onChange = new EventEmitter<any>(), onDelete = new EventEmitter<any>();
      const id = "fsw:" + ext.id + ":" + (++fsWatchSeq);
      const root = deps.workspaceRoot();
      fsWatchers.set(id, {
        id, re: globToRegExp(glob),
        ignoreCreate: ignoreCreate === true, ignoreChange: ignoreChange === true, ignoreDelete: ignoreDelete === true,
        fire: (kind, rel) => {
          // 확장은 Uri 를 기대한다. 루트가 없으면 상대 경로로라도 준다.
          const uri = UriShim.file(root ? root.replace(/\\/g, "/").replace(/\/+$/, "") + "/" + rel : rel);
          (kind === "create" ? onCreate : kind === "delete" ? onDelete : onChange).fire(uri);
        },
      });
      const d = { dispose() { fsWatchers.delete(id); } };
      // 확장이 dispose 를 잊어도 재로드 때 정리된다.
      disposables.push(d);
      return {
        onDidCreate: onCreate.event, onDidChange: onChange.event, onDidDelete: onDelete.event,
        ignoreCreateEvents: ignoreCreate === true, ignoreChangeEvents: ignoreChange === true, ignoreDeleteEvents: ignoreDelete === true,
        dispose: d.dispose,
      };
    },
    /** 확장이 직접 편집을 적용한다. 예전엔 이 함수 자체가 없어서, WorkspaceEdit 를
     *  만들 수 있었더라도 쓸 데가 없었다. */
    applyEdit: (we: any) => applyWorkspaceEdit(we),
    openTextDocument: async (arg?: any) => {
      const rel = relOf(arg);
      if (!rel) throw new Error("openTextDocument: 경로가 필요합니다");
      const open = docs.docFor(rel);
      if (open) return open;
      // 안 열린 파일이면 디스크에서 읽어 모델을 만든다. **탭은 열지 않는다** —
      // vscode 도 그렇고, 확장이 파일 하나를 훑을 때마다 탭이 생기면 못 쓴다.
      const root = deps.workspaceRoot();
      if (!root) throw new Error("openTextDocument: 열린 워크스페이스가 없습니다");
      const text = await deps.readFile(rel);
      if (text == null) throw new Error("openTextDocument: 읽을 수 없습니다 — " + rel);
      projectModels.ensure(root, rel, text);
      const d = docs.docFor(rel);
      if (!d) throw new Error("openTextDocument: 문서를 만들지 못했습니다 — " + rel);
      return d;
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
    // env 셋이 전부 성공을 답하고 아무것도 안 했다. openExternal 은 true 를 돌려주며
    // 브라우저를 열지 않았고(그 IPC 는 진작 있었다), 클립보드는 어디에도 쓰지 않고
    // 늘 빈 문자열을 읽었다. 확장 입장에서는 "썼는데 비어 있다" 라 자기 버그로 보인다.
    env: {
      appName: "Schutz", language: getLang(), machineId: "schutz",
      openExternal: async (target: any) => {
        const url = String(target?.toString?.() ?? target ?? "");
        if (!url) return false;
        const r = await window.schutz?.openExternal(url);
        return !!r?.ok;   // 메인이 http/https/mailto 만 연다 — 거절도 그대로 전한다
      },
      clipboard: {
        writeText: (text: string) => navigator.clipboard.writeText(String(text ?? "")),
        readText: () => navigator.clipboard.readText(),
      },
    },
    Uri: UriShim, Position, Range, Selection, Location, Disposable, EventEmitter,
    MarkdownString, CompletionItem, CompletionItemKind, Hover, ThemeIcon, ThemeColor,
    WorkspaceEdit, CodeAction, CodeActionKind,
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
