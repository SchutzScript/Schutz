/**
 * 위임 엔진 — 순수 타입.
 *
 * 이 디렉터리의 불변 규칙 3개:
 *  ⑴ import 0. React·Electron·DOM·window·localStorage·i18n 전부 금지.
 *     AbortController 조차 쓰지 않는다 — 불투명한 cancel: () => void 만 보관한다.
 *  ⑵ 사용자향 산문을 반환하지 않는다. 태그된 구조체만 돌려주고 App.tsx 가 t() 로 렌더한다.
 *     그래야 하드코딩된 "관리자 Claude" 와 한국어 전용 판정이 생기지 않는다.
 *  ⑶ 벽시계·난수 금지. Clock/IdSource 를 주입받아 모든 테스트가 결정론적이 된다.
 */

export type AgentId = string;
export type RunId = string;
export type DelegationId = string;

/**
 * 실행의 성격. 예전에는 abortCtls 키에 "__mcpgen" / "__inline:" 접두어를 심어
 * 문자열로 구분했다(App.tsx 의 `k === "__mcpgen" || k.startsWith("__inline")`).
 * 그 의미를 타입으로 끌어올린 것.
 */
export type RunRole = "manager" | "sub" | "inline" | "system";

export type RunStatus = "running" | "done" | "aborted";

/** 라운드 루프가 왜 끝났는가. 예전에는 상한(8)에 걸려도 아무 신호가 없었다. */
export type StopCause = "end" | "cap" | "abort" | "error";

/**
 * 위임이 거절된 이유. App.tsx 가 이 태그를 i18n 키로 바꿔 모델에게 돌려준다.
 * 조용히 실패하지 않는 게 핵심 — 모델은 왜 안 됐는지 알아야 다른 수를 둔다.
 */
export type RejectReason =
  | "unknown-agent"
  | "self-delegation"
  | "not-configured"
  | "agent-busy"
  | "depth-exceeded"
  | "per-turn-cap"
  | "concurrency-cap"
  | "duplicate-target"
  | "cycle";

/**
 * 하위 실행의 결과. 예전에는 runAgentLoop 이 void 를 반환해서 이게 통째로 없었고,
 * delegate_task 는 하위가 토큰 하나 내기도 전에 상수 성공 문자열을 돌려줬다.
 */
export type DelegationOutcome =
  | { status: "completed"; text: string; rounds: number; stopCause: StopCause }
  | { status: "empty"; rounds: number; stopCause: StopCause }
  | { status: "failed"; message: string }
  | { status: "timeout"; afterMs: number }
  | { status: "aborted" };

export interface DelegationRequest {
  parentRunId: RunId;
  fromAgent: AgentId;
  toAgent: AgentId;
  task: string;
}

export interface Clock {
  now(): number;
}

export interface IdSource {
  next(prefix: string): string;
}
