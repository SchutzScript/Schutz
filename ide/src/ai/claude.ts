import { AIProvider, ChatRequest, StreamEvent, getStoredKey } from "./provider";

export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

export type ClaudeEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ClaudeTurnRequest {
  /** Anthropic Messages API 원형 메시지 배열 (tool_use/tool_result 블록 포함 가능) */
  rawMessages: any[];
  system?: string;
  tools?: any[];
  model?: string;
  signal?: AbortSignal;
}

/**
 * Claude(Anthropic) 어댑터 — 텍스트 + tool_use 스트리밍.
 * 브라우저/Electron 렌더러에서 직접 호출.
 */
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly label = "Claude";

  isConfigured(): boolean {
    return getStoredKey("claude").trim().length > 0;
  }

  /** AIProvider 계약용 단순 래퍼 (텍스트 전용) */
  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const system = req.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const raw = req.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));
    for await (const ev of this.streamTurn({ rawMessages: raw, system, model: req.model, signal: req.signal })) {
      if (ev.type === "text" || ev.type === "usage" || ev.type === "error" || ev.type === "done") yield ev;
    }
  }

  /** 한 턴 스트리밍 — tool_use 블록까지 파싱해 방출 */
  async *streamTurn(req: ClaudeTurnRequest): AsyncIterable<ClaudeEvent> {
    const apiKey = getStoredKey("claude").trim();
    if (!apiKey) {
      yield { type: "error", message: "Claude API 키가 설정되지 않았습니다. 온보딩(#/onboarding) 4단계에서 입력하세요." };
      yield { type: "done" };
      return;
    }

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
          max_tokens: 8192,
          stream: true,
          ...(req.system ? { system: req.system } : {}),
          ...(req.tools && req.tools.length ? { tools: req.tools } : {}),
          messages: req.rawMessages,
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
    // 진행 중인 tool_use 블록 (index → 누적 JSON)
    const toolBuf: Record<number, { id: string; name: string; json: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part.split("\n").find(l => l.startsWith("data:"));
        if (!dataLine) continue;
        let evt: any;
        try { evt = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

        switch (evt.type) {
          case "message_start":
            inTok = evt.message?.usage?.input_tokens ?? 0;
            break;
          case "content_block_start":
            if (evt.content_block?.type === "tool_use") {
              toolBuf[evt.index] = { id: evt.content_block.id, name: evt.content_block.name, json: "" };
            }
            break;
          case "content_block_delta":
            if (evt.delta?.type === "text_delta") {
              yield { type: "text", delta: evt.delta.text ?? "" };
            } else if (evt.delta?.type === "input_json_delta" && toolBuf[evt.index]) {
              toolBuf[evt.index].json += evt.delta.partial_json ?? "";
            }
            break;
          case "content_block_stop": {
            const tb = toolBuf[evt.index];
            if (tb) {
              let input: any = {};
              try { input = tb.json ? JSON.parse(tb.json) : {}; } catch { /* 빈 입력 */ }
              yield { type: "tool_call", call: { id: tb.id, name: tb.name, input } };
              delete toolBuf[evt.index];
            }
            break;
          }
          case "message_delta":
            if (evt.usage) outTok = evt.usage.output_tokens ?? outTok;
            if (evt.delta?.stop_reason) yield { type: "stop", reason: evt.delta.stop_reason };
            break;
        }
      }
    }
    if (inTok || outTok) yield { type: "usage", inputTokens: inTok, outputTokens: outTok };
    yield { type: "done" };
  }
}

/** 워크스페이스가 열려 있을 때 Claude에게 주는 도구들 */
export const WORKSPACE_TOOLS = [
  {
    name: "list_files",
    description: "워크스페이스의 파일 목록(상대 경로)을 반환한다.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_file",
    description: "워크스페이스의 파일 내용을 읽는다.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "워크스페이스 상대 경로" } },
      required: ["path"],
    },
  },
  {
    name: "propose_edit",
    description:
      "파일 편집을 제안한다. 즉시 적용되지 않고 사용자가 검토 후 수락/거절한다. " +
      "find는 파일 안에 정확히 한 번 존재하는 연속 텍스트여야 하며, replace로 치환된다.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "워크스페이스 상대 경로" },
        find: { type: "string", description: "치환 대상 원문 (파일에 정확히 1회 존재)" },
        replace: { type: "string", description: "새 텍스트" },
        rationale: { type: "string", description: "이 변경을 하는 이유 (한 문장)" },
      },
      required: ["path", "find", "replace", "rationale"],
    },
  },
];

export const SCHUTZ_SYSTEM_PROMPT = `당신은 Schutz IDE에 내장된 코딩 에이전트 팀의 관리자(Claude)입니다.
사용자는 당신의 작업 과정을 실시간으로 지켜봅니다. 한국어로 간결하게, 계획을 먼저 밝히고 진행하세요.

도구가 제공된 경우(워크스페이스 열림):
- 파일을 고치기 전에 반드시 read_file로 현재 내용을 확인하세요.
- 모든 편집은 propose_edit로 제안하세요. 직접 쓸 수 없으며, 사용자가 수락해야 반영됩니다.
- find는 파일에 정확히 한 번 존재하는 텍스트여야 합니다. 여러 곳을 고치려면 제안을 나누세요.
- 변경은 최소한으로, rationale은 한 문장으로.`;
