// DAP(디버그 어댑터 프로토콜) 클라이언트 — IPC(window.schutz.dap*) 위. 단일 활성 세션.
// DAP는 JSON-RPC가 아니라 seq/type(request|response|event) 기반이므로 직접 구현한다.

import { t } from "../i18n";

export interface StoppedBody { reason: string; threadId?: number; text?: string; allThreadsStopped?: boolean; }
export interface DapEvents {
  onStopped?: (b: StoppedBody) => void;
  onContinued?: () => void;
  onOutput?: (category: string, text: string) => void;
  onTerminated?: () => void;
  onExited?: (code: number) => void;
}

interface Pending { resolve: (body: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout>; }

let sessionId: string | null = null;
let shuttingDown = false; // 종료 진행 중 — terminated 이벤트 + 프로세스 exit 의 이중 onTerminated 방지
let shutdownPromise: Promise<void> | null = null; // 진행 중 shutdown 공유 — launch 의 await shutdown() 과 직렬화(세션 stomp 방지)
let seq = 1;
const pending = new Map<number, Pending>();
let events: DapEvents = {};
let offMsg: (() => void) | null = null;
let offExit: (() => void) | null = null;
let capabilities: any = {};

export function isActive(): boolean { return !!sessionId; }

function handle(msg: any) {
  if (msg.type === "response") {
    const p = pending.get(msg.request_seq);
    if (p) { pending.delete(msg.request_seq); clearTimeout(p.timer); msg.success ? p.resolve(msg.body ?? {}) : p.reject(new Error(msg.message || t("dap.commandFailed", { command: msg.command }))); }
  } else if (msg.type === "event") {
    switch (msg.event) {
      case "stopped": events.onStopped?.(msg.body ?? {}); break;
      case "continued": events.onContinued?.(); break;
      case "output": events.onOutput?.(msg.body?.category ?? "console", msg.body?.output ?? ""); break;
      case "terminated": if (!shuttingDown) { events.onTerminated?.(); void shutdown(); } break;
      case "exited": events.onExited?.(msg.body?.exitCode ?? 0); break;
      case "initialized": _onInitialized?.(); break;
    }
  }
}

let _onInitialized: (() => void) | null = null;

function send(command: string, args?: any): Promise<any> {
  if (!sessionId || !window.schutz) return Promise.reject(new Error(t("dap.noSession")));
  const s = ++seq;
  const msg = { seq: s, type: "request", command, arguments: args ?? {} };
  return new Promise((resolve, reject) => {
    // 응답 시 clearTimeout 하도록 timer 를 pending 에 보관(장기 세션서 수백개 타이머 누적 방지)
    const timer = setTimeout(() => { if (pending.has(s)) { pending.delete(s); reject(new Error(t("dap.commandTimeout", { command }))); } }, 15000);
    pending.set(s, { resolve, reject, timer });
    window.schutz!.dapSend(sessionId!, msg);
  });
}

/** 세션 시작 + 초기화 + 브레이크포인트 + launch. 성공 시 true. */
export async function launch(
  languageId: string,
  config: { program: string; cwd: string; args?: string[]; stopOnEntry?: boolean },
  breakpointsByPath: Record<string, number[]>,
  cbs: DapEvents,
): Promise<{ ok: boolean; reason?: string }> {
  await shutdown();
  if (!window.schutz) return { ok: false, reason: t("dap.desktopOnly") };
  const start = await window.schutz.dapStart(languageId);
  if (!start.ok || !start.sessionId) return { ok: false, reason: start.reason };
  sessionId = start.sessionId;
  events = cbs;
  seq = 1;
  offMsg = window.schutz.onDapMessage((sid, m) => { if (sid === sessionId) handle(m); });
  offExit = window.schutz.onDapExit((sid) => { if (sid === sessionId && !shuttingDown) { cbs.onTerminated?.(); void shutdown(); } });

  // initialize → (initialized 이벤트에서 브레이크포인트+configurationDone) → launch
  const initializedDone = new Promise<void>((res) => {
    // initialized 이벤트를 영영 못 받아도 무한 대기하지 않도록 타임아웃
    const to = setTimeout(res, 15000);
    _onInitialized = async () => {
      clearTimeout(to);
      try {
        for (const [path, lines] of Object.entries(breakpointsByPath)) {
          if (!lines.length) continue;
          await send("setBreakpoints", { source: { path }, breakpoints: lines.map(l => ({ line: l })), lines }).catch(() => { });
        }
        await send("setExceptionBreakpoints", { filters: [] }).catch(() => { });
        await send("configurationDone").catch(() => { });
      } finally { res(); }
    };
  });

  try {
    capabilities = await send("initialize", {
      clientID: "schutz", clientName: "Schutz", adapterID: languageId, locale: "en",
      linesStartAt1: true, columnsStartAt1: true, pathFormat: "path",
      supportsVariableType: true, supportsVariablePaging: false, supportsRunInTerminalRequest: false,
    });
    // launch (fire) — initialized 이벤트가 브레이크포인트 설정을 유발
    const launchP = send("launch", { request: "launch", type: languageId, program: config.program, args: config.args ?? [], cwd: config.cwd, console: "internalConsole", stopOnEntry: !!config.stopOnEntry, justMyCode: true });
    await initializedDone;
    await launchP;
    return { ok: true };
  } catch (e) {
    await shutdown();
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function getCapabilities() { return capabilities; }

// ── 실행 제어 ──────────────────────────────────────────────
export const cont = (threadId: number) => send("continue", { threadId }).catch(() => { });
export const next = (threadId: number) => send("next", { threadId }).catch(() => { });
export const stepIn = (threadId: number) => send("stepIn", { threadId }).catch(() => { });
export const stepOut = (threadId: number) => send("stepOut", { threadId }).catch(() => { });
export const pause = (threadId: number) => send("pause", { threadId }).catch(() => { });

// ── 상태 조회 ──────────────────────────────────────────────
export async function stackTrace(threadId: number): Promise<any[]> {
  try { const b = await send("stackTrace", { threadId, startFrame: 0, levels: 50 }); return b.stackFrames ?? []; } catch { return []; }
}
export async function scopes(frameId: number): Promise<any[]> {
  try { const b = await send("scopes", { frameId }); return b.scopes ?? []; } catch { return []; }
}
export async function variables(variablesReference: number): Promise<any[]> {
  try { const b = await send("variables", { variablesReference }); return b.variables ?? []; } catch { return []; }
}
export async function evaluate(expression: string, frameId?: number): Promise<string> {
  try { const b = await send("evaluate", { expression, frameId, context: "repl" }); return b.result ?? ""; } catch (e) { return String(e instanceof Error ? e.message : e); }
}
/** 실행 중 브레이크포인트 갱신 */
export async function updateBreakpoints(path: string, lines: number[]): Promise<void> {
  if (!sessionId) return;
  await send("setBreakpoints", { source: { path }, breakpoints: lines.map(l => ({ line: l })), lines }).catch(() => { });
}

export function shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;   // 진행 중이면 같은 종료를 공유(중복 실행/세션 stomp 방지)
  if (!sessionId) return Promise.resolve();
  shuttingDown = true;
  const sid = sessionId;                         // dapStop 용으로 캡처 — await 중 재할당돼도 안전
  shutdownPromise = (async () => {
    try { await send("disconnect", { terminateDebuggee: true }).catch(() => { }); } catch { /* */ }
    try { window.schutz?.dapStop(sid); } catch { /* */ }
    offMsg?.(); offExit?.(); offMsg = null; offExit = null;
    for (const p of pending.values()) clearTimeout(p.timer); // 미완 요청 타이머 정리
    pending.clear(); _onInitialized = null; sessionId = null; events = {};
    shuttingDown = false; shutdownPromise = null;
  })();
  return shutdownPromise;
}
