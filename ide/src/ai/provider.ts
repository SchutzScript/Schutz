/**
 * AI Provider 추상화 — 멀티 에이전트 공통 계약.
 * 이 인터페이스만 구현하면 어떤 모델이든 붙는다 (Claude/GPT/Grok/GLM/로컬).
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

// ── 에이전트(도구 사용) 계약 ────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

/** 벤더 무관 도구 정의 (Anthropic 스키마 기준 — OpenAI 계열 어댑터가 내부 변환) */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * 벤더 중립 대화 기록. 각 어댑터가 자기 API 형식으로 변환한다.
 * - assistant 턴: text + 그 턴의 tool 호출들
 * - user 턴: text 또는 도구 실행 결과들
 */
export interface NeutralMsg {
  role: "user" | "assistant";
  text?: string;
  calls?: ToolCall[];
  results?: { id: string; content: string }[];
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: "end" | "tool_use" | "error" }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AgentTurnRequest {
  transcript: NeutralMsg[];
  system?: string;
  tools?: ToolDef[];
  model?: string;
  signal?: AbortSignal;
}

export interface AgentProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  streamAgentTurn(req: AgentTurnRequest): AsyncIterable<AgentEvent>;
}

// ── 키 저장 (프로토타입: localStorage — 추후 OS 키체인) ───────────────────

export const KEY_STORE = {
  claude: "schutz.key.claude",
  gpt: "schutz.key.gpt",
  grok: "schutz.key.grok",
  glm: "schutz.key.glm",
} as const;

export type ProviderId = keyof typeof KEY_STORE;

export function getStoredKey(provider: ProviderId): string {
  try {
    return localStorage.getItem(KEY_STORE[provider]) ?? "";
  } catch {
    return "";
  }
}

export function setStoredKey(provider: ProviderId, key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORE[provider], key);
    else localStorage.removeItem(KEY_STORE[provider]);
  } catch {
    // storage 불가 환경이면 무시
  }
}


// ── 앱 내 OAuth 토큰 저장 (구독 계정 인증) ─────────────────────────────────

export interface OAuthTokens {
  access: string;
  refresh: string | null;
  exp: number;
  accountId?: string | null;
}

export function getOAuth(id: string): OAuthTokens | null {
  try {
    const raw = localStorage.getItem("schutz.oauth." + id);
    if (!raw) return null;
    const t = JSON.parse(raw);
    return t && t.access ? t : null;
  } catch {
    return null;
  }
}

export function setOAuth(id: string, tokens: OAuthTokens | null): void {
  try {
    if (tokens) localStorage.setItem("schutz.oauth." + id, JSON.stringify(tokens));
    else localStorage.removeItem("schutz.oauth." + id);
  } catch { /* ignore */ }
}

/** 만료 임박 시 자동 갱신 후 액세스 토큰 반환 (실패 시 null) */
// 진행 중 리프레시 공유 — 동시 호출이 단발성 refresh 토큰을 두 번 소모해 두 번째가 실패하는 것 방지
const refreshingOAuth: Record<string, Promise<OAuthTokens | null>> = {};
export async function freshOAuth(id: string): Promise<OAuthTokens | null> {
  const t = getOAuth(id);
  if (!t) return null;
  if (Date.now() < t.exp - 60_000) return t;
  if (!t.refresh) { setOAuth(id, null); return null; } // 만료 + 리프레시 토큰 없음 → 죽은 토큰 제거(영구 stuck-connected 방지)
  if (!window.schutz?.oauthRefresh) return null;        // 리프레시 API 없음(웹) → 갱신만 불가, 토큰 유지
  if (refreshingOAuth[id]) return refreshingOAuth[id];
  const p = (async (): Promise<OAuthTokens | null> => {
    const r = await window.schutz!.oauthRefresh(id, t.refresh!);
    if (!r.ok || !r.access) {
      // 4xx(리프레시 토큰 폐기/회전) 는 죽은 토큰 → 제거해 재로그인 유도. 네트워크(무 status) 는 일시적일 수 있어 유지.
      const st = (r as { status?: number }).status;
      if (typeof st === "number" && st >= 400 && st < 500) setOAuth(id, null);
      return null;
    }
    const nt = { ...t, access: r.access, refresh: r.refresh ?? t.refresh, exp: r.exp ?? Date.now() + 3600_000 };
    setOAuth(id, nt);
    return nt;
  })();
  refreshingOAuth[id] = p;
  try { return await p; } finally { delete refreshingOAuth[id]; }
}


// ── 모델 오버라이드 (/model 명령·설정) ────────────────────────────────────
export function getModelOverride(id: string): string | null {
  try { return localStorage.getItem("schutz.model." + id); } catch { return null; }
}
export function setModelOverride(id: string, model: string | null): void {
  try {
    if (model) localStorage.setItem("schutz.model." + id, model);
    else localStorage.removeItem("schutz.model." + id);
  } catch { /* ignore */ }
}
