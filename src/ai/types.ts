/**
 * Schutz AI 레이어 공통 타입.
 *
 * 이 파일은 어떤 AI 벤더에도 종속되지 않는 계약(contract)을 정의한다.
 * Claude / OpenAI / Gemini / 로컬 모델은 이 타입들을 구현하는 어댑터로 붙는다.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  /** tool 역할 메시지의 경우, 어떤 tool_call에 대한 결과인지 */
  toolCallId?: string;
}

/** 하나의 논리적 편집(한 파일 내 연속/비연속 변경 묶음). */
export interface Patch {
  /** 워크스페이스 상대 경로 */
  file: string;
  edits: PatchEdit[];
  /** 이 편집을 왜 하는지 — diff 툴팁/Agent 패널에 노출 */
  rationale?: string;
}

export interface PatchEdit {
  /** 0-based 시작 라인 (포함) */
  startLine: number;
  /** 0-based 끝 라인 (포함). 삽입만 할 때는 startLine - 1 로 빈 범위를 표현 */
  endLine: number;
  /** 대체할 새 텍스트 (여러 줄 가능). 삭제 시 빈 문자열 */
  newText: string;
}

export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "active" | "done" | "failed";
  detail?: string;
}

/** 프로바이더 스트림에서 흘러나오는 이벤트. UI 실시간성의 원천. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; result: unknown }
  | { type: "edit"; patch: Patch }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: Message[];
  model?: string;
  tools?: ToolSpec[];
  /** 워크스페이스 컨텍스트 힌트 (열린 파일 등) */
  context?: {
    activeFile?: string;
    /** 활성 파일의 현재 전체 텍스트 (프로바이더가 패치 좌표를 계산하는 데 사용) */
    activeFileText?: string;
    selection?: string;
  };
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  label: string;
  contextWindow?: number;
}
