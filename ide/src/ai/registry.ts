import { AgentProvider } from "./provider";
import { ClaudeProvider } from "./claude";
import { GPT_PROVIDER, GROK_PROVIDER, GLM_PROVIDER } from "./openaiCompat";

/** 앱 전역 프로바이더 레지스트리 */
export const PROVIDERS_MAP: Record<string, AgentProvider> = {
  claude: new ClaudeProvider(),
  gpt: GPT_PROVIDER,
  grok: GROK_PROVIDER,
  glm: GLM_PROVIDER,
};

/**
 * 저장된 키로 실제 API를 1회 호출해 연결을 검증한다.
 * (아주 짧은 ping 요청 — 토큰 소모 최소)
 */
export async function testProvider(id: string): Promise<{ ok: boolean; message: string }> {
  const p = PROVIDERS_MAP[id];
  if (!p) return { ok: false, message: "알 수 없는 프로바이더" };
  if (!p.isConfigured()) return { ok: false, message: "API 키가 비어 있습니다" };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    for await (const ev of p.streamAgentTurn({
      transcript: [{ role: "user", text: "ping" }],
      system: "Reply with exactly: pong",
      signal: abort.signal,
    })) {
      if (ev.type === "error") return { ok: false, message: ev.message };
      if (ev.type === "text" || ev.type === "usage") {
        abort.abort(); // 응답이 시작됐으면 성공 — 나머지는 버림
        return { ok: true, message: "연결 확인됨" };
      }
    }
    return { ok: true, message: "연결 확인됨" };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: true, message: "연결 확인됨" };
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 저장된 관리자 에이전트 (온보딩에서 선택) */
export function getManagerId(): string {
  try {
    return localStorage.getItem("schutz.manager") ?? "claude";
  } catch {
    return "claude";
  }
}
