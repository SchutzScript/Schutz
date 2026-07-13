import {
  AIProvider, ChatRequest, StreamEvent,
  AgentProvider, AgentTurnRequest, AgentEvent, NeutralMsg, ToolDef,
  getStoredKey, getOAuth, freshOAuth, getModelOverride,
} from "./provider";

export type { ToolCall } from "./provider";

/**
 * Claude(Anthropic) 어댑터 — 텍스트 + tool_use 스트리밍.
 * 브라우저/Electron 렌더러에서 직접 호출.
 */
export class ClaudeProvider implements AIProvider, AgentProvider {
  readonly id = "claude";
  readonly label = "Claude";

  isConfigured(): boolean {
    // 구독 계정(OAuth) 또는 API 키
    return !!getOAuth("claude") || getStoredKey("claude").trim().length > 0;
  }

  /** AIProvider 계약용 단순 래퍼 (텍스트 전용) */
  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const system = req.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const transcript: NeutralMsg[] = req.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", text: m.content }));
    for await (const ev of this.streamAgentTurn({ transcript, system, model: req.model, signal: req.signal })) {
      if (ev.type === "text" || ev.type === "usage" || ev.type === "error" || ev.type === "done") yield ev;
    }
  }

  private toNative(transcript: NeutralMsg[]): any[] {
    return transcript.map(m => {
      if (m.role === "assistant") {
        const content: any[] = [];
        if (m.text) content.push({ type: "text", text: m.text });
        for (const c of m.calls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.input ?? {} });
        return { role: "assistant", content: content.length ? content : m.text ?? "" };
      }
      if (m.results && m.results.length) {
        return {
          role: "user",
          content: m.results.map(r => ({ type: "tool_result", tool_use_id: r.id, content: r.content })),
        };
      }
      return { role: "user", content: m.text ?? "" };
    });
  }

  async *streamAgentTurn(req: AgentTurnRequest): AsyncIterable<AgentEvent> {
    // 인증 우선순위: 구독 계정(OAuth Bearer) → API 키
    const oauth = await freshOAuth("claude");
    const apiKey = getStoredKey("claude").trim();
    if (!oauth && !apiKey) {
      yield { type: "error", message: "Claude 계정이 연결되지 않았습니다. 설정(⚙)에서 [Claude 계정으로 로그인] 또는 API 키를 입력하세요." };
      yield { type: "done" };
      return;
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    let system: any = req.system;
    if (oauth) {
      headers["authorization"] = "Bearer " + oauth.access;
      headers["anthropic-beta"] = "oauth-2025-04-20";
      // 구독(OAuth) 경로는 Claude Code 시스템 프리픽스가 필수
      system = [
        { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
        ...(req.system ? [{ type: "text", text: req.system }] : []),
      ];
    } else {
      headers["x-api-key"] = apiKey;
    }

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: req.model || getModelOverride("claude") || "claude-sonnet-5",
          max_tokens: 8192,
          stream: true,
          ...(system ? { system } : {}),
          ...(req.tools && req.tools.length ? { tools: req.tools } : {}),
          messages: this.toNative(req.transcript),
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
    let stop: "end" | "tool_use" | "error" = "end";
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
            if (evt.delta?.stop_reason === "tool_use") stop = "tool_use";
            break;
        }
      }
    }
    if (inTok || outTok) yield { type: "usage", inputTokens: inTok, outputTokens: outTok };
    yield { type: "stop", reason: stop };
    yield { type: "done" };
  }
}

/** 워크스페이스가 열려 있을 때 에이전트에게 주는 도구들 */
export const WORKSPACE_TOOLS: ToolDef[] = [
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
    name: "propose_create",
    description: "새 파일 생성을 제안한다. 즉시 만들어지지 않고 사용자가 검토 후 수락하면 생성된다.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "생성할 파일의 워크스페이스 상대 경로" },
        content: { type: "string", description: "파일 전체 내용" },
        rationale: { type: "string", description: "이 파일이 필요한 이유 (한 문장)" },
      },
      required: ["path", "content", "rationale"],
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

/** 관리자 전용: 다른 에이전트에게 작업 위임 */
export const DELEGATE_TOOL: ToolDef = {
  name: "delegate_task",
  description:
    "연결된 다른 AI 에이전트에게 하위 작업을 위임한다. 위임된 에이전트는 동시에(병렬로) " +
    "자기 파일을 작업하며, 파일 락으로 격리되므로 같은 파일을 두 에이전트가 동시에 고칠 수 없다.",
  input_schema: {
    type: "object",
    properties: {
      agent: { type: "string", description: "위임 대상: gpt | grok | glm" },
      task: { type: "string", description: "위임할 작업 설명 (대상 파일과 목표를 구체적으로)" },
    },
    required: ["agent", "task"],
  },
};

export const SCHUTZ_SYSTEM_PROMPT = `당신은 Schutz IDE에 내장된 코딩 에이전트입니다.
사용자는 당신의 작업 과정을 실시간으로 지켜봅니다. 한국어로 간결하게, 계획을 먼저 밝히고 진행하세요.

도구가 제공된 경우(워크스페이스 열림):
- 파일을 고치기 전에 반드시 read_file로 현재 내용을 확인하세요.
- 모든 편집은 propose_edit로 제안하세요. 직접 쓸 수 없으며, 사용자가 수락해야 반영됩니다.
- find는 파일에 정확히 한 번 존재하는 텍스트여야 합니다. 여러 곳을 고치려면 제안을 나누세요.
- 변경은 최소한으로, rationale은 한 문장으로.`;

export const MANAGER_SYSTEM_EXTRA = `

당신은 팀의 관리자입니다. delegate_task로 다른 에이전트에게 하위 작업을 나눠줄 수 있습니다.
- 서로 다른 파일은 병렬로 위임하세요. 같은 파일을 두 에이전트에게 주지 마세요 (파일 락 충돌).
- 위임 후에는 무엇을 누구에게 맡겼는지 사용자에게 요약하세요.`;
