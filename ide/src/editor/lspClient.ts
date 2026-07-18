import { AbstractMessageReader, AbstractMessageWriter, createMessageConnection } from "vscode-jsonrpc/browser";
import monaco from "./monacoSetup";
import { toMarker } from "./lspConverters";

/** IPC(window.schutz.lsp*)를 타는 vscode-jsonrpc 전송 — serverId로 라우팅 */
class IpcReader extends AbstractMessageReader {
  private cb: ((m: any) => void) | null = null;
  private off: () => void;
  constructor(private serverId: string) {
    super();
    this.off = window.schutz!.onLspMessage((sid: string, msg: any) => { if (sid === this.serverId && this.cb) this.cb(msg); });
  }
  listen(callback: any) { this.cb = callback; return { dispose: () => { this.cb = null; } }; }
  dispose() { try { this.off(); } catch { /* */ } super.dispose(); }
}
class IpcWriter extends AbstractMessageWriter {
  constructor(private serverId: string) { super(); }
  async write(msg: any) { try { window.schutz!.lspSend(this.serverId, msg); } catch { /* */ } }
  end() { /* */ }
}

interface Session {
  languageId: string;
  serverId: string;
  connection: ReturnType<typeof createMessageConnection>;
  versions: Map<string, number>;
  ready: Promise<void>;
  dead: boolean;
}

const sessions = new Map<string, Session>(); // languageId → session
let currentRoot: string | null = null;
let lspLangs: Set<string> | null = null;
let offExit: (() => void) | null = null;

export async function initLsp() {
  if (lspLangs || !window.schutz) return;
  try { lspLangs = new Set(await window.schutz.lspLanguages()); } catch { lspLangs = new Set(); }
  offExit = window.schutz.onLspExit((serverId: string) => {
    for (const [lang, s] of sessions) {
      if (s.serverId === serverId) {
        s.dead = true;
        sessions.delete(lang);
        // 해당 언어 마커 제거
        for (const m of monaco.editor.getModels()) monaco.editor.setModelMarkers(m, "lsp-" + lang, []);
      }
    }
  });
}

export function isLspLanguage(languageId: string): boolean {
  return !!lspLangs && lspLangs.has(languageId);
}

export function setRoot(root: string | null) { currentRoot = root; }

const startingLsp = new Map<string, Promise<Session | null>>();
async function ensureServer(languageId: string): Promise<Session | null> {
  if (!window.schutz || !currentRoot || !isLspLanguage(languageId)) return null;
  const existing = sessions.get(languageId);
  if (existing && !existing.dead) { await existing.ready; return existing; }
  // 동시 호출이 서버를 중복 spawn 하지 않도록 진행 중 start 를 공유
  const inflight = startingLsp.get(languageId);
  if (inflight) return inflight;
  const p = (async (): Promise<Session | null> => {
  const start = await window.schutz!.lspStart(languageId, currentRoot!);
  if (!start.ok || !start.serverId) return null;
  const serverId = start.serverId;
  const connection = createMessageConnection(new IpcReader(serverId), new IpcWriter(serverId));
  const session: Session = { languageId, serverId, connection, versions: new Map(), dead: false, ready: Promise.resolve() };

  // 서버→클라이언트 요청 응답. pyright는 configuration 응답을 기다리며 분석을 보류하므로
  // 이 핸들러들이 없으면 진단이 영원히 오지 않는다(가장 중요한 함정).
  const rootUriStr = () => monaco.Uri.file(currentRoot!.replace(/\\/g, "/")).toString();
  connection.onRequest("workspace/configuration", (params: any) =>
    (params.items ?? [{}]).map(() => ({})),
  );
  connection.onRequest("workspace/workspaceFolders", () =>
    currentRoot ? [{ uri: rootUriStr(), name: currentRoot.split(/[\\/]/).pop() || "root" }] : null,
  );
  connection.onRequest("client/registerCapability", () => null);
  connection.onRequest("client/unregisterCapability", () => null);
  connection.onRequest("window/workDoneProgress/create", () => null);
  // 서버가 코드액션/커맨드 실행 결과로 편집을 밀어넣는 경로 → 열린 모델에 반영
  connection.onRequest("workspace/applyEdit", (params: any) => {
    const applied = applyLspWorkspaceEdit(params?.edit);
    return { applied };
  });

  connection.onNotification("textDocument/publishDiagnostics", (params: any) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(params.uri));
    if (!model) return;
    monaco.editor.setModelMarkers(model, "lsp-" + languageId, (params.diagnostics ?? []).map(toMarker));
  });
  connection.onError(() => {
    // 연결 오류 시 프로세스가 남지 않도록 명시적으로 종료 (orphan 방지)
    session.dead = true;
    sessions.delete(languageId);
    try { window.schutz?.lspStop(serverId); } catch { /* */ }
    for (const m of monaco.editor.getModels()) monaco.editor.setModelMarkers(m, "lsp-" + languageId, []);
  });
  connection.onClose(() => { session.dead = true; sessions.delete(languageId); });
  connection.listen();

  session.ready = (async () => {
    const rootUri = monaco.Uri.file(currentRoot!.replace(/\\/g, "/")).toString();
    try {
    await connection.sendRequest("initialize", {
      processId: null,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: currentRoot!.split(/[\\/]/).pop() || "root" }],
      capabilities: {
        // 주의: workspace.workspaceFolders/configuration 을 선언하면 pyright가
        // 폴더/설정 핸드셰이크를 기다리며 분석을 보류 → 진단이 오지 않는다.
        // 그래서 workspace 블록은 비운다(진단·기능 모두 정상).
        textDocument: {
          completion: { completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"], resolveSupport: { properties: ["documentation", "detail", "additionalTextEdits"] } }, contextSupport: true },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          rename: { prepareSupport: true },
          signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"] } },
          publishDiagnostics: { relatedInformation: true },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          foldingRange: { lineFoldingOnly: true },
          documentHighlight: {},
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix", "refactor", "source", "source.organizeImports"] } }, resolveSupport: { properties: ["edit"] }, dataSupport: true },
          inlayHint: { resolveSupport: { properties: ["tooltip"] } },
          formatting: {},
          rangeFormatting: {},
        },
        // 주의: workspaceFolders/configuration 은 여전히 금지(P24 지뢰 — pyright 분석 보류).
        // applyEdit/symbol/executeCommand 는 핸드셰이크를 유발하지 않아 안전(단, 변경 후 진단 회귀검증).
        workspace: { applyEdit: true, symbol: { symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) } }, executeCommand: {} },
      },
    });
    connection.sendNotification("initialized", {});
    // 세션 준비 후 이미 열린 문서를 재-개방(레이스·재시작 대비). 문서 없으면 pyright는 진단 안 보냄.
    for (const model of monaco.editor.getModels()) {
      if (model.isDisposed() || model.getLanguageId() !== languageId) continue;
      const u = model.uri.toString();
      if (session.versions.has(u)) continue;
      session.versions.set(u, 1);
      connection.sendNotification("textDocument/didOpen", { textDocument: { uri: u, languageId, version: 1, text: model.getValue() } });
    }
    } catch { session.dead = true; }
  })();
  sessions.set(languageId, session);
  await session.ready;
  return session;
  })();
  startingLsp.set(languageId, p);
  try { return await p; } finally { startingLsp.delete(languageId); }
}

/** initLsp 완료·워크스페이스 오픈 후, 이미 열린 LSP 언어 모델을 서버에 개방(레이스 보정) */
export async function syncOpenModels(): Promise<void> {
  const langs = new Set<string>();
  for (const model of monaco.editor.getModels()) {
    if (model.isDisposed()) continue;
    const lang = model.getLanguageId();
    if (isLspLanguage(lang)) langs.add(lang);
  }
  for (const lang of langs) await ensureServer(lang); // ensureServer가 열린 문서 재-개방까지 처리
}

/** 프로바이더용 — 요청 전송 (세션 없으면 null) */
export async function request(languageId: string, method: string, params: any): Promise<any> {
  const s = await ensureServer(languageId);
  if (!s || s.dead) return null;
  try { return await s.connection.sendRequest(method, params); } catch { return null; }
}

/** LSP 커맨드 실행(코드액션의 command 경로) — 결과 편집은 workspace/applyEdit로 되돌아옴 */
export async function executeCommand(languageId: string, command: string, args: any[]): Promise<any> {
  return request(languageId, "workspace/executeCommand", { command, arguments: args ?? [] });
}

/** 살아있는 모든 세션에 workspace/symbol 질의 후 병합 (Ctrl+T) — 새 서버는 안 띄움 */
export async function workspaceSymbols(query: string): Promise<any[]> {
  const out: any[] = [];
  for (const [, s] of sessions) {
    if (s.dead) continue;
    try { const r = await s.connection.sendRequest("workspace/symbol", { query }); if (Array.isArray(r)) out.push(...r); } catch { /* */ }
  }
  return out;
}

/** LSP WorkspaceEdit를 열린 monaco 모델에 인메모리 반영(dirty 표시). 서버-푸시 편집·커맨드 결과용 */
export function applyLspWorkspaceEdit(we: any): boolean {
  if (!we) return false;
  const applyTo = (uriStr: string, changes: any[]) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
    if (!model) return;
    const ops = (changes ?? []).map((c: any) => ({
      range: {
        startLineNumber: (c.range?.start?.line ?? 0) + 1, startColumn: (c.range?.start?.character ?? 0) + 1,
        endLineNumber: (c.range?.end?.line ?? 0) + 1, endColumn: (c.range?.end?.character ?? 0) + 1,
      },
      text: c.newText ?? "",
    }));
    if (ops.length) model.pushEditOperations([], ops, () => null);
  };
  let touched = false;
  if (we.changes) for (const uri of Object.keys(we.changes)) { applyTo(uri, we.changes[uri]); touched = true; }
  if (Array.isArray(we.documentChanges)) for (const dc of we.documentChanges) { if (dc.textDocument && dc.edits) { applyTo(dc.textDocument.uri, dc.edits); touched = true; } }
  return touched;
}

export async function didOpen(uri: string, languageId: string, text: string) {
  const s = await ensureServer(languageId);
  if (!s) return;
  if (s.versions.has(uri)) return; // ensureServer 재-개방 등으로 이미 열림 → 중복 didOpen 방지
  s.versions.set(uri, 1);
  s.connection.sendNotification("textDocument/didOpen", { textDocument: { uri, languageId, version: 1, text } });
}
export async function didChange(uri: string, languageId: string, text: string) {
  const s = sessions.get(languageId);
  if (!s || s.dead) return;
  try { await s.ready; } catch { return; } // initialize 핸드셰이크 완료 후 전송 (버전 desync 방지)
  // 아직 didOpen 되지 않았으면 스킵 — didOpen 이 전체 텍스트를 보냄
  if (s.dead || !s.versions.has(uri)) return;
  const v = (s.versions.get(uri) ?? 1) + 1;
  s.versions.set(uri, v);
  s.connection.sendNotification("textDocument/didChange", { textDocument: { uri, version: v }, contentChanges: [{ text }] });
}
export function didClose(uri: string, languageId: string) {
  const s = sessions.get(languageId);
  if (!s || s.dead) return;
  s.versions.delete(uri);
  s.connection.sendNotification("textDocument/didClose", { textDocument: { uri } });
}

export function shutdownAll() {
  for (const [lang, s] of sessions) {
    try { s.connection.sendRequest("shutdown").catch(() => { }); } catch { /* */ }
    try { window.schutz?.lspStop(s.serverId); } catch { /* */ }
    for (const m of monaco.editor.getModels()) monaco.editor.setModelMarkers(m, "lsp-" + lang, []);
  }
  sessions.clear();
}
