/**
 * AI Provider 추상화 — VSCode 확장 프로토타입의 계약을 IDE로 이식.
 * 이 인터페이스만 구현하면 어떤 모델이든 붙는다 (Claude/GPT/Grok/로컬).
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatRequest {
  messages: Message[];
  model?: string;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  streamChat(req: ChatRequest): AsyncIterable<StreamEvent>;
  isConfigured(): boolean;
}

/** localStorage 기반 키 저장 (프로토타입용 — 추후 OS 키체인으로 이전) */
export const KEY_STORE = {
  claude: "schutz.key.claude",
};

export function getStoredKey(provider: keyof typeof KEY_STORE): string {
  try {
    return localStorage.getItem(KEY_STORE[provider]) ?? "";
  } catch {
    return "";
  }
}

export function setStoredKey(provider: keyof typeof KEY_STORE, key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORE[provider], key);
    else localStorage.removeItem(KEY_STORE[provider]);
  } catch {
    // storage 불가 환경이면 무시
  }
}
