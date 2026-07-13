import { AIProvider, ChatRequest, StreamEvent, getStoredKey } from "./provider";

/**
 * Claude(Anthropic) 어댑터 — 텍스트 스트리밍.
 * 브라우저/Electron 렌더러에서 직접 호출 (anthropic-dangerous-direct-browser-access).
 * 도구 호출→편집 매핑은 후속 작업.
 */
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly label = "Claude";

  isConfigured(): boolean {
    return getStoredKey("claude").trim().length > 0;
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const apiKey = getStoredKey("claude").trim();
    if (!apiKey) {
      yield { type: "error", message: "Claude API 키가 설정되지 않았습니다. 온보딩(#/onboarding) 4단계에서 입력하세요." };
      yield { type: "done" };
      return;
    }

    const system = req.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const messages = req.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: req.model || "claude-sonnet-5",
          max_tokens: 4096,
          stream: true,
          ...(system ? { system } : {}),
          messages,
        }),
        signal: req.signal,
      });
    } catch (e) {
      yield { type: "error", message: "네트워크 오류: " + (e instanceof Error ? e.message : String(e)) };
      yield { type: "done" };
      return;
    }

    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      yield { type: "error", message: `Claude API 오류 (${res.status}): ${detail}` };
      yield { type: "done" };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inTok = 0, outTok = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part.split("\n").find(l => l.startsWith("data:"));
        if (!dataLine) continue;
        const json = dataLine.slice(5).trim();
        if (!json) continue;
        let evt: any;
        try { evt = JSON.parse(json); } catch { continue; }
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          yield { type: "text", delta: evt.delta.text ?? "" };
        } else if (evt.type === "message_start" && evt.message?.usage) {
          inTok = evt.message.usage.input_tokens ?? 0;
        } else if (evt.type === "message_delta" && evt.usage) {
          outTok = evt.usage.output_tokens ?? 0;
        }
      }
    }
    if (inTok || outTok) yield { type: "usage", inputTokens: inTok, outputTokens: outTok };
    yield { type: "done" };
  }
}

export const SCHUTZ_SYSTEM_PROMPT = `당신은 Schutz IDE에 내장된 코딩 에이전트 팀의 관리자(Claude)입니다.
사용자는 당신의 작업 과정을 실시간으로 지켜봅니다. 한국어로 간결하게, 계획을 먼저 밝히고 답하세요.`;
