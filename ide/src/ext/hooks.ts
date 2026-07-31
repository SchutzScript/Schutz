/**
 * 확장이 IDE 안에서 벌어지는 일을 **알 수 있게** 하는 자리.
 *
 * 지금까지 확장 API 는 명령 등록·패널 표시·토스트뿐이었다. 확장이 먼저 말을 걸 수는
 * 있어도, 사용자가 파일을 열거나 저장하거나 에이전트가 편집을 수락하는 것은 알 방법이
 * 없었다 — 그래서 "저장할 때마다 무언가 하는" 종류의 확장은 아예 쓸 수 없었다.
 *
 * 관찰 전용이다. 훅은 무엇도 막거나 바꾸지 못한다. 그 계약을 나중에 넓힐 수는 있지만,
 * 지금 열어 두면 확장 하나가 저장을 영영 붙잡을 수 있다.
 */

export type HookEvent =
  /** 프로젝트를 열었다. { root } */
  | "workspace.open"
  /** 파일을 열었다(탭으로). { rel } */
  | "file.open"
  /** 파일을 디스크에 저장했다. { rel } */
  | "file.save"
  /** 에이전트 제안을 수락/거절했다. { rel, agent } */
  | "proposal.accept"
  | "proposal.reject"
  /** 에이전트 턴이 시작/종료했다. { agent } */
  | "run.start"
  | "run.end";

export const HOOK_EVENTS: HookEvent[] = [
  "workspace.open", "file.open", "file.save",
  "proposal.accept", "proposal.reject", "run.start", "run.end",
];

export type HookHandler = (payload: Record<string, unknown>) => void;

interface Entry { ev: HookEvent; fn: HookHandler; source: string }

/** 확장 하나가 같은 사건에 이만큼 넘게 달면 실수다 — 조용히 새는 대신 거절한다. */
export const MAX_PER_SOURCE = 32;

let entries: Entry[] = [];

export function isHookEvent(x: string): x is HookEvent {
  return (HOOK_EVENTS as string[]).includes(x);
}

/** 구독. 해제 함수를 돌려준다(확장 리로드 때 호출측이 부른다). 모르는 사건이면 no-op. */
export function onHook(ev: string, fn: HookHandler, source: string): () => void {
  if (!isHookEvent(ev) || typeof fn !== "function") return () => { /* 아무것도 안 걺 */ };
  if (entries.filter(e => e.source === source).length >= MAX_PER_SOURCE) return () => { /* 상한 초과 */ };
  const entry: Entry = { ev, fn, source };
  entries.push(entry);
  return () => { entries = entries.filter(e => e !== entry); };
}

/** 이 확장이 건 것을 전부 뗀다 — 확장을 끄거나 다시 읽을 때. */
export function clearHooks(source?: string): void {
  entries = source === undefined ? [] : entries.filter(e => e.source !== source);
}

export function hookCount(ev?: HookEvent): number {
  return ev ? entries.filter(e => e.ev === ev).length : entries.length;
}

/**
 * 사건을 알린다. **어떤 핸들러가 터져도 나머지는 계속 돈다** — 확장 하나가 IDE 의
 * 저장 경로를 멈추게 두면 안 된다. 터진 것은 onError 로 넘겨 호출측이 보고한다.
 *
 * 등록 순서대로 부른다. 스냅숏을 떠서 도는 중에 구독/해제가 일어나도 이번 판은 흔들리지 않는다.
 */
export function emitHook(
  ev: HookEvent,
  payload: Record<string, unknown>,
  onError?: (source: string, err: unknown) => void,
): number {
  let ran = 0;
  for (const e of entries.slice()) {
    if (e.ev !== ev) continue;
    ran++;
    try { e.fn(payload); }
    catch (err) { try { onError?.(e.source, err); } catch { /* 보고마저 실패 — 삼킨다 */ } }
  }
  return ran;
}
