// 확장 호스트 (렌더러) — 활성 확장의 엔트리를 큐레이트 API로 로드.
// 확장은 신뢰 코드로 간주(VS Code와 동일 모델)하되, 편의 API는 이 표면으로 한정한다.
// Schutz 네이티브(schutz API) + VS Code 프로그램형(vscode 셰임으로 activate 실행) 둘 다 지원.
import { makeVscodeApi, disposeShimRegistrations, deliverFsDelta, listExtViews, onExtViewsChanged } from "./vscodeShim";
import { onHook, clearHooks, emitHook, HOOK_EVENTS, type HookEvent } from "./hooks";
import { editorEvents } from "./vscodeShim";
import { paneRegistry } from "../editor/MonacoPane";
import { t } from "../i18n";

export interface ExtCommand { id: string; title: string; run: (...args: any[]) => any; source: string; }
export interface ExtInfo { id: string; name: string; version: string; description: string; enabled: boolean; commands: number; kind: "schutz" | "vscode"; programmatic: boolean; contributes: string[]; }

export interface HostDeps {
  toast: (kind: "ok" | "error" | "info", msg: string) => void;
  showPanel: (title: string, html: string) => void;
  getActiveFile: () => string | null;
  /** vscode 셰임이 문서·편집기를 만들려면 이 둘이 필요하다. 없이 두었을 때
   *  activeTextEditor 가 영원히 undefined 였다. */
  workspaceRoot: () => string | null;
  openFiles: () => string[];
  /** 확장이 사용자에게 묻는 통로. 없으면 셰임이 곧장 취소로 답한다. */
  prompt: (req: any) => Promise<any>;
  /** 상태바 항목 올리기/내리기. */
  statusSet: (item: any) => void;
  statusRemove: (id: string) => void;
  /** 확장 → 웹뷰 메시지. */
  postToView: (viewId: string, msg: any) => void;
  /** 파일 하나 저장 / 아직 안 연 파일 읽기 / 트리 줄 펼치기. */
  saveFile: (rel: string) => Promise<boolean>;
  readFile: (rel: string) => Promise<string | null>;
  revealInView: (viewId: string, element: any, expand: boolean) => Promise<void>;
  /** 확장이 중단점을 더하거나 뺀다. */
  debugBreakpoints?: (op: "add" | "remove", bps: any[]) => void;
  /** WorkspaceEdit 의 파일 만들기·지우기·이름 바꾸기 — 셰임이 그대로 받아 쓴다. */
  fileOps?: {
    exists: (rel: string) => boolean;
    isDirty: (rel: string) => boolean;
    create: (rel: string, content: string, overwrite: boolean) => Promise<boolean>;
    remove: (rel: string) => Promise<boolean>;
    rename: (from: string, to: string, overwrite: boolean) => Promise<boolean>;
  };
}

let commands: ExtCommand[] = [];
let deps: HostDeps | null = null;
// 활성 프로그램형 확장의 ctx/deactivate 추적 — 리로드 시 정리(구독 미해제·deactivate 미호출 누수 방지)
let activeContexts: { name: string; ctx: any; deactivate?: (...a: any[]) => any }[] = [];

/** 이전 로드의 확장 정리 — ctx.subscriptions 의 disposable 해제 + 확장의 deactivate() 호출 */
function teardownExtensions() {
  clearHooks();   // 리로드마다 핸들러가 쌓이지 않게 — 명령과 같은 수명이다
  for (const { ctx, deactivate } of activeContexts) {
    for (const sub of (ctx?.subscriptions || [])) { try { sub?.dispose?.(); } catch { /* */ } }
    try { deactivate?.(); } catch { /* */ }
  }
  activeContexts = [];
}

export function getExtCommands(): ExtCommand[] { return commands; }

/** IDE 쪽에서 사건을 알린다. 확장 핸들러가 터지면 토스트로 보고하되 흐름은 막지 않는다. */
export function notifyExtensions(ev: HookEvent, payload: Record<string, unknown>): void {
  emitHook(ev, payload, (source, err) => {
    deps?.toast("error", t("exth.commandError", { source, msg: err instanceof Error ? err.message : String(err) }));
  });
  // vscode 확장은 같은 사건을 자기 이름으로 듣는다. 셰임의 이벤트들은 아무도 안 쏘는
  // 빈 EventEmitter 였다 — onDidSaveTextDocument 를 구독한 확장은 영원히 안 불렸다.
  const rel = typeof payload.rel === "string" ? payload.rel : null;
  if (!rel) return;
  // 활성 편집기 통지는 문서가 아직 없어도 걸어 둔다 — 새로 여는 파일은 이 시점에
  // 모델도 페인도 없어서 shimDocFor 가 빈손으로 돌아온다. 예전엔 그 자리에서 함께
  // 끊겨, 탭을 바꿔도 확장은 영영 못 듣고 데코레이션이 다시 그려지지 않았다.
  if (ev === "file.open") notifyActiveEditor(rel);
  const doc = shimDocFor(rel);
  if (!doc) return;
  if (ev === "file.open") editorEvents.docOpened.fire(doc);
  else if (ev === "file.save") editorEvents.docSaved.fire(doc);
}

/** "이 편집기가 활성이다" 를 확장에게 알린다.
 *
 *  **페인이 실제로 떠 있을 때만 쏜다.** 아직 없으면 이 사건을 받은 확장이 곧장
 *  setDecorations 를 불러도 붙일 자리가 없어 조용히 사라진다 — 데코레이션을 쓰는
 *  확장은 거의 다 이 사건에 매달려 그리므로, 이르게 쏘면 안 쏜 것과 같다.
 *
 *  openFile 은 setState 전에 부르고, 탭을 바꿀 때 페인이 다시 마운트되지 않는
 *  경우도 있다(모델만 갈아끼운다). 그래서 "있으면 쏘고 없으면 잠깐 기다린다".
 *  기다림은 유한하다 — 못 뜨면 조용히 접는다. */
let activeWait: ReturnType<typeof setTimeout> | null = null;
let lastActiveRel: string | null = null;

export function notifyActiveEditor(rel: string): void {
  if (activeWait) { clearTimeout(activeWait); activeWait = null; }
  if (!rel) return;
  let tries = 0;
  const attempt = () => {
    activeWait = null;
    const pane = paneRegistry.panes.get(rel);
    if (!pane) {
      // 페인이 아직 없다. 40ms 씩 최대 25번(1초) 기다린다 — 그 안에 안 뜨면
      // 그 탭은 편집기가 아니거나(이미지·미리보기) 사용자가 다시 옮긴 것이다.
      if (++tries <= 25) activeWait = setTimeout(attempt, 40);
      return;
    }
    if (lastActiveRel === rel) return;   // 같은 파일로 두 번 쏘지 않는다
    lastActiveRel = rel;
    const ed = shimEditorFor(rel);
    if (ed) editorEvents.activeChanged.fire(ed);
  };
  attempt();
}

paneRegistry.onReady = (rel: string) => notifyActiveEditor(rel);

/** 사건을 쏠 때 쓸 문서 통로. makeVscodeApi 가 확장마다 인덱스를 만들지만,
 *  사건에는 확장과 무관한 문서 하나면 된다. */
let shimDocFor: (rel: string) => any = () => null;
let shimEditorFor: (rel: string) => any = () => null;
export function setShimDocSource(d: (rel: string) => any, e: (rel: string) => any): void {
  shimDocFor = d; shimEditorFor = e;
}

/** 등록된 확장 명령 실행 (vscode 셰임의 executeCommand 위임용).
 *  해석 순서: (1) 정확 일치(전체 id 로 호출) → (2) 호출 확장 자신의 네임스페이스(callerExtId:id).
 *  기존 전역 `endsWith(":"+id)` 는 다른 확장의 동일 접미 명령으로 오매칭되어 제거. */
function runCommandById(id: string, args: any[], callerExtId?: string): any {
  let c = commands.find(x => x.id === id);
  if (!c && callerExtId) c = commands.find(x => x.id === callerExtId + ":" + id);
  if (c) return c.run(...args);
  return undefined;
}

/** 커맨드 핸들러 래핑 — 동기 throw 뿐 아니라 비동기(Promise) reject 도 토스트로 보고.
 *  (기존 동기 try/catch 는 async 핸들러의 거부를 못 잡아 무보고 실패 + unhandledrejection 발생) */
function wrapRun(run: (...a: any[]) => any, source: string) {
  const report = (e: any) => deps?.toast("error", t("exth.commandError", { source, msg: e instanceof Error ? e.message : String(e) }));
  return (...a: any[]) => {
    try {
      const r = run(...a);
      if (r && typeof r.then === "function") return r.then((x: any) => x, report);
      return r;
    } catch (e) { report(e); }
  };
}

function addCommand(id: string, title: string, run: (...args: any[]) => any, source: string) {
  commands = commands.filter(c => c.id !== id);
  commands.push({ id, title, run: wrapRun(run, source), source });
}

/** 로드 세대. loadExtensions 가 겹쳐 돌면(리로드 버튼 연타·StrictMode 이중 마운트)
 *  앞선 판의 activate 가 뒤늦게 끝나면서 이미 정리된 자리에 다시 등록한다. 그러면
 *  같은 확장의 핸들러가 두 벌 살아 **훅이 두 번씩 온다**(실제로 그랬다).
 *  등록 시점에 자기가 아직 최신 판인지 확인하게 해서 막는다. */
let loadGen = 0;

function makeApi(ext: { id: string; name: string }, gen: number) {
  return {
    extId: ext.id,
    commands: {
      register: (id: string, title: string, run: () => void) => {
        const cid = ext.id + ":" + id;
        commands = commands.filter(c => c.id !== cid);
        commands.push({ id: cid, title, run: wrapRun(run, ext.name), source: ext.name });
      },
    },
    ui: { showPanel: (title: string, html: string) => deps?.showPanel(title, html) },
    /** IDE 에서 벌어지는 일을 구독한다. 돌려받은 함수를 부르면 해제된다.
     *  관찰 전용이다 — 훅은 무엇도 막거나 바꾸지 못한다. 목록은 hooks.ts 의 HOOK_EVENTS. */
    on: (event: string, fn: (payload: Record<string, unknown>) => void) =>
      (gen === loadGen ? onHook(event, fn, ext.name) : () => { /* 지난 판의 늦은 등록 — 버린다 */ }),
    events: HOOK_EVENTS.slice(),
    toast: (kind: "ok" | "error" | "info", msg: string) => deps?.toast(kind, msg),
    getActiveFile: () => deps?.getActiveFile() ?? null,
  };
}

/** 선언형 기여(테마·아이콘·문법·언어·스니펫)를 제공하는 확장인지 — activate 실패해도 "핵심은 동작" 판정용 */
const DECL_KEYS = ["themes", "iconThemes", "grammars", "languages", "snippets"];
function hasDeclarativeValue(ext: any): boolean {
  const c = ext?.contributes || {};
  return DECL_KEYS.some(k => (Array.isArray(c[k]) ? c[k].length > 0 : !!c[k]));
}

// ── Node 내장 모듈 최소 폴리필 (렌더러 샌드박스엔 Node 없음) ──────────────
// path: 확장이 자기 파일 경로를 만들 때 필요. posix 스타일이면 대부분 충분.
const pathPoly: any = {
  sep: "/", delimiter: ":",
  normalize(p: string) { const win = p.replace(/\\/g, "/"); const parts: string[] = []; for (const seg of win.split("/")) { if (seg === "" || seg === ".") continue; if (seg === "..") { if (parts.length && parts[parts.length - 1] !== "..") parts.pop(); else parts.push(".."); } else parts.push(seg); } const abs = win.startsWith("/"); return (abs ? "/" : "") + parts.join("/") || (abs ? "/" : "."); },
  join(...segs: string[]) { return pathPoly.normalize(segs.filter(s => typeof s === "string" && s.length).join("/")); },
  resolve(...segs: string[]) { let p = ""; for (let i = segs.length - 1; i >= 0; i--) { const s = segs[i]; if (typeof s !== "string" || !s) continue; p = p ? s + "/" + p : s; if (pathPoly.isAbsolute(s)) break; } if (!pathPoly.isAbsolute(p)) p = "/" + p; return pathPoly.normalize(p); },
  dirname(p: string) { const s = p.replace(/\\/g, "/").replace(/\/+$/, ""); const i = s.lastIndexOf("/"); return i <= 0 ? (i === 0 ? "/" : ".") : s.slice(0, i); },
  basename(p: string, ext?: string) { let b = p.replace(/\\/g, "/").replace(/\/+$/, ""); b = b.slice(b.lastIndexOf("/") + 1); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; },
  extname(p: string) { const b = pathPoly.basename(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
  isAbsolute(p: string) { return /^([a-zA-Z]:)?[\\/]/.test(p || ""); },
  relative(from: string, to: string) { const f = pathPoly.normalize(from).split("/").filter(Boolean); const t = pathPoly.normalize(to).split("/").filter(Boolean); let i = 0; while (i < f.length && i < t.length && f[i] === t[i]) i++; return [...f.slice(i).map(() => ".."), ...t.slice(i)].join("/") || "."; },
  parse(p: string) { const dir = pathPoly.dirname(p); const base = pathPoly.basename(p); const ext = pathPoly.extname(base); return { root: pathPoly.isAbsolute(p) ? "/" : "", dir, base, ext, name: ext ? base.slice(0, -ext.length) : base }; },
  format(o: any) { return pathPoly.join(o.dir || o.root || "", o.base || ((o.name || "") + (o.ext || ""))); },
};
pathPoly.posix = pathPoly; pathPoly.win32 = pathPoly;

class NodeEmitter {
  private m: Record<string, ((...a: any[]) => void)[]> = {};
  on(ev: string, fn: any) { (this.m[ev] ||= []).push(fn); return this; }
  once(ev: string, fn: any) { const w = (...a: any[]) => { this.off(ev, w); fn(...a); }; return this.on(ev, w); }
  off(ev: string, fn: any) { this.m[ev] = (this.m[ev] || []).filter(f => f !== fn); return this; }
  removeListener(ev: string, fn: any) { return this.off(ev, fn); }
  removeAllListeners(ev?: string) { if (ev) delete this.m[ev]; else this.m = {}; return this; }
  emit(ev: string, ...a: any[]) { (this.m[ev] || []).slice().forEach(f => { try { f(...a); } catch { /* */ } }); return (this.m[ev] || []).length > 0; }
  addListener(ev: string, fn: any) { return this.on(ev, fn); }
  listeners(ev: string) { return (this.m[ev] || []).slice(); }
  setMaxListeners() { return this; }
}
const osPoly: any = { platform: () => (navigator.userAgent.includes("Win") ? "win32" : navigator.userAgent.includes("Mac") ? "darwin" : "linux"), arch: () => "x64", EOL: navigator.userAgent.includes("Win") ? "\r\n" : "\n", homedir: () => "/", tmpdir: () => "/tmp", hostname: () => "schutz", type: () => "Schutz", release: () => "1.0.0", cpus: () => [], totalmem: () => 0, freemem: () => 0, userInfo: () => ({ username: "schutz", homedir: "/" }) };
const utilPoly: any = { inherits: (ctor: any, sup: any) => { ctor.super_ = sup; Object.setPrototypeOf(ctor.prototype, sup.prototype); }, promisify: (fn: any) => (...a: any[]) => new Promise((res, rej) => fn(...a, (e: any, r: any) => e ? rej(e) : res(r))), format: (...a: any[]) => a.join(" "), inspect: (o: any) => { try { return JSON.stringify(o); } catch { return String(o); } }, TextEncoder, TextDecoder, deprecate: (fn: any) => fn, isDeepStrictEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) };

/** 프로그램형 VS Code 확장용 require — vscode 셰임 + Node 내장 폴리필. 미지원 모듈은 명확히 throw(캐치되어 "제한"으로 분류). */
function makeHostRequire(vscode: any) {
  return (m: string) => {
    const id = m.replace(/^node:/, "");
    if (id === "vscode") return vscode;
    if (id === "path") return pathPoly;
    if (id === "os") return osPoly;
    if (id === "util") return utilPoly;
    if (id === "events") { (NodeEmitter as any).EventEmitter = NodeEmitter; return NodeEmitter; }
    if (id === "assert") return Object.assign((v: any, msg?: string) => { if (!v) throw new Error(msg || "assert 실패"); }, { ok: (v: any, msg?: string) => { if (!v) throw new Error(msg || "assert 실패"); } });
    throw new Error(t("exth.moduleNotSupported", { m }));
  };
}

/** 활성 확장 로드 → 커맨드 등록. 반환: 로드 수·하드 오류·기능 제한 목록 */
export async function loadExtensions(d: HostDeps): Promise<{ loaded: number; errors: string[]; limited: { id: string; name: string; reason: string }[] }> {
  const gen = ++loadGen;
  deps = d;
  teardownExtensions();                             // 이전 로드의 ctx.subscriptions·deactivate 정리
  commands = [];
  disposeShimRegistrations();                       // 이전 로드의 Monaco 프로바이더 정리
  (window as any).__schutzRunCommand = runCommandById; // vscode 셰임 executeCommand 위임
  const errors: string[] = [];
  const limited: { id: string; name: string; reason: string }[] = [];
  if (!window.schutz) return { loaded: 0, errors, limited };
  let list: any[] = [];
  try { list = await window.schutz.extList(); } catch { return { loaded: 0, errors: [t("exth.extListLoadFailed")], limited }; }
  let loaded = 0;
  const activations: Promise<void>[] = []; // activate 를 병렬 수집 — 한 확장의 느린/멈춘 activate 가 나머지를 막지 않게
  for (const ext of list) {
    if (!ext.enabled) continue;
    if (ext.kind === "vscode") {
      // 프로그램형(main 있음)만 실행 — 선언형 기여는 vscodeExt.ts 가 처리
      if (!ext.main) continue;
      try {
        const code = await window.schutz.extReadEntry(ext.id, ext.main);
        if (typeof code !== "string") {
          const reason = t("exth.entryFileNotFound", { main: ext.main });
          if (hasDeclarativeValue(ext)) limited.push({ id: ext.id, name: ext.name, reason });
          else errors.push(ext.name + ": " + reason);
          continue;
        }
        const vscode = makeVscodeApi({ toast: d.toast, showPanel: d.showPanel, getActiveFile: d.getActiveFile, workspaceRoot: d.workspaceRoot, openFiles: d.openFiles, prompt: d.prompt, statusSet: d.statusSet, statusRemove: d.statusRemove, postToView: d.postToView, saveFile: d.saveFile, readFile: d.readFile, revealInView: d.revealInView, fileOps: d.fileOps, debugBreakpoints: d.debugBreakpoints, registerCommand: addCommand }, ext);
        const moduleObj = { exports: {} as any };
        const require = makeHostRequire(vscode);
        const ctx = {
          subscriptions: [] as any[],
          extensionPath: ext.dir, extensionUri: vscode.Uri.file(ext.dir),
          // 확장별 네임스페이스로 영속(workspaceState 는 큐레이트 모델상 확장 단위로 근사 — 리로드 소실만 해결)
          globalState: memento("schutz.extstate.g." + ext.id), workspaceState: memento("schutz.extstate.w." + ext.id),
          asAbsolutePath: (p: string) => ext.dir + "/" + p,
          extensionMode: 1, secrets: { get: () => Promise.resolve(undefined), store: () => Promise.resolve(), delete: () => Promise.resolve() },
          environmentVariableCollection: { replace() {}, append() {}, prepend() {} },
          globalStorageUri: vscode.Uri.file(ext.dir), storageUri: vscode.Uri.file(ext.dir), logUri: vscode.Uri.file(ext.dir),
        };
        // eslint-disable-next-line no-new-func
        const fn = new Function("exports", "module", "require", "console", code);
        fn(moduleObj.exports, moduleObj, require, console);
        const activate = moduleObj.exports.activate || moduleObj.exports.default?.activate;
        // 리로드 시 정리를 위해 ctx(구독)와 deactivate 추적
        activeContexts.push({ name: ext.name, ctx, deactivate: moduleObj.exports.deactivate || moduleObj.exports.default?.deactivate });
        if (typeof activate === "function") {
          // await 하지 않고 병렬 수집 — activate 오류는 여기서 분류(동기 require/eval 오류는 아래 catch 가 처리)
          activations.push(Promise.resolve().then(() => activate(ctx)).then(() => { loaded++; }).catch((e: any) => {
            const reason = e instanceof Error ? e.message : String(e);
            if (hasDeclarativeValue(ext)) limited.push({ id: ext.id, name: ext.name, reason });
            else errors.push(ext.name + ": " + reason);
          }));
        }
      } catch (e) {
        // 동기 로드(require/eval) 실패 — 선언형 기여가 있으면 핵심은 동작하므로 "제한"으로 분류
        const reason = e instanceof Error ? e.message : String(e);
        if (hasDeclarativeValue(ext)) limited.push({ id: ext.id, name: ext.name, reason });
        else errors.push(ext.name + ": " + reason);
      }
      continue;
    }
    // Schutz 네이티브
    let code: any;
    try { code = await window.schutz.extReadEntry(ext.id, ext.main || "extension.js"); } catch { errors.push(ext.id + ": " + t("exth.entryReadFailed")); continue; }
    if (typeof code !== "string") { errors.push(ext.id + ": " + (code?.error || t("exth.entryMissing"))); continue; }
    try {
      const api = makeApi(ext, gen);
      const moduleObj = { exports: {} as any };
      // eslint-disable-next-line no-new-func
      const fn = new Function("exports", "module", "schutz", "console", code);
      fn(moduleObj.exports, moduleObj, api, console);
      const activate = moduleObj.exports.activate || moduleObj.exports.default?.activate;
      if (typeof activate === "function") activate(api);
      loaded++;
    } catch (e) { errors.push(ext.id + ": " + (e instanceof Error ? e.message : String(e))); }
  }
  await Promise.allSettled(activations); // 모든 vscode activate 완료 대기(loaded/errors 확정 후 반환)
  return { loaded, errors, limited };
}

/** VS Code Memento(globalState/workspaceState) — localStorage 백엔드로 실제 영속.
 *  (기존 구현은 인메모리라 리로드/재시작마다 소실 → 확장의 1회성 설정·마이그레이션 플래그가 매번 초기화됐음) */
function memento(nsKey: string) {
  const read = (): Record<string, any> => { try { return JSON.parse(localStorage.getItem(nsKey) || "{}"); } catch { return {}; } };
  const write = (o: Record<string, any>) => { try { localStorage.setItem(nsKey, JSON.stringify(o)); } catch { /* 용량초과 등 무시 */ } };
  return {
    get: (k: string, def?: any) => { const s = read(); return k in s ? s[k] : def; },
    update: (k: string, v: any) => { const s = read(); if (v === undefined) delete s[k]; else s[k] = v; write(s); return Promise.resolve(); },
    keys: () => Object.keys(read()),
    setKeysForSync: () => { /* no-op */ },
  };
}

/** 확장이 붙인 사이드바 뷰들. */
export { listExtViews, onExtViewsChanged };

/** 앱이 알아낸 파일 변화를 확장의 감시자들에게 넘긴다. */
export function notifyFsDelta(delta: { created: string[]; changed: string[]; deleted: string[] }): number {
  return deliverFsDelta(delta);
}

/** 관리 UI용 목록 */
export async function listExtensions(): Promise<ExtInfo[]> {
  if (!window.schutz) return [];
  try {
    const list = await window.schutz.extList();
    return list.map((e: any) => ({
      id: e.id, name: e.name, version: e.version, description: e.description, enabled: e.enabled,
      commands: (e.contributes?.commands?.length ?? 0), kind: e.kind, programmatic: e.programmatic,
      contributes: Object.keys(e.contributes || {}).filter(k => ["themes", "iconThemes", "grammars", "snippets", "languages", "commands"].includes(k)),
    }));
  } catch { return []; }
}
