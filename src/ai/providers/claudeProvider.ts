import { AIProvider } from "../provider";
import { ChatRequest, ModelInfo, StreamEvent } from "../types";

/**
 * Claude(Anthropic) 어댑터 — **실험적, 텍스트 스트리밍 전용**.
 *
 * 목적: "AIProvider 인터페이스만 만족하면 실제 모델이 그대로 붙는다"는 것을
 * 코드로 증명하기 위한 첫 실제 어댑터. 현재는 텍스트 델타와 사용량만 매핑하며,
 * 도구 호출/편집(tool_use → edit) 매핑은 아직 구현하지 않았다(후속 작업).
 *
 * 검증 상태: mock 프로바이더만 E2E 검증됨. 이 어댑터는 API 키가 있을 때만 동작하며
 * 아직 실사용 검증 전이다.
 */
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly label = "Claude (실험적)";
  readonly models: ModelInfo[] = [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", contextWindow: 200_000 },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", contextWindow: 200_000 },
  ];

  constructor(private readonly getApiKey: () => string) {}

  isConfigured(): boolean {
    return this.getApiKey().trim().length > 0;
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const apiKey = this.getApiKey().trim();
    if (!apiKey) {
      yield { type: "error", message: "Claude API 키가 설정되지 않았습니다." };
      yield { type: "done" };
      return;
    }

    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = req.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.model || this.models[0].id,
        max_tokens: 4096,
        stream: true,
        ...(system ? { system } : {}),
        messages,
      }),
      signal: req.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      yield { type: "error", message: `Claude API 오류 (${res.status}): ${detail}` };
      yield { type: "done" };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const evt = parseSse(part);
        if (!evt) {
          continue;
        }
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          yield { type: "text", delta: evt.delta.text ?? "" };
        } else if (evt.type === "message_delta" && evt.usage) {
          yield {
            type: "usage",
            inputTokens: evt.usage.input_tokens ?? 0,
            outputTokens: evt.usage.output_tokens ?? 0,
          };
        }
      }
    }
    yield { type: "done" };
  }
}

interface SseData {
  type?: string;
  delta?: { type?: string; text?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseSse(block: string): SseData | undefined {
  const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
  if (!dataLine) {
    return undefined;
  }
  const json = dataLine.slice("data:".length).trim();
  if (!json || json === "[DONE]") {
    return undefined;
  }
  try {
    return JSON.parse(json) as SseData;
  } catch {
    return undefined;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return res.statusText;
  }
}
