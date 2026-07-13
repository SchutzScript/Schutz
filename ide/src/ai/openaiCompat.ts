import {
  AgentProvider, AgentTurnRequest, AgentEvent, NeutralMsg, ToolDef,
  ProviderId, getStoredKey,
} from "./provider";

export interface CompatConfig {
  id: ProviderId;
  label: string;
  /** chat/completions 엔드포인트 전체 URL */
  url: string;
  defaultModel: string;
}

/** OpenAI Chat Completions 호환 어댑터 — GPT(OpenAI) / Grok(xAI) / GLM(Zhipu) 공용 */
export class OpenAICompatProvider implements AgentProvider {
  readonly id: string;
  readonly label: string;

  constructor(private readonly cfg: CompatConfig) {
    this.id = cfg.id;
    this.label = cfg.label;
  }

  isConfigured(): boolean {
    return getStoredKey(this.cfg.id).trim().length > 0;
  }

  private toNative(transcript: NeutralMsg[], system?: string): any[] {
    const out: any[] = [];
    if (system) out.push({ role: "system", content: system });
    for (const m of transcript) {
      if (m.role === "assistant") {
        const msg: any = { role: "assistant", content: m.text || null };
        if (m.calls && m.calls.length) {
          msg.tool_calls = m.calls.map(c => ({
            id: c.id, type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
          }));
        }
        out.push(msg);
      } else if (m.results && m.results.length) {
        for (const r of m.results) {
          out.push({ role: "tool", tool_call_id: r.id, content: r.content });
        }
      } else {
        out.push({ role: "user", content: m.text ?? "" });
      }
    }
    return out;
  }

  private toNativeTools(tools?: ToolDef[]): any[] | undefined {
    if (!tools || !tools.length) return undefined;
    return tools.map(t => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }

  async *streamAgentTurn(req: AgentTurnRequest): AsyncIterable<AgentEvent> {
    const apiKey = getStoredKey(this.cfg.id).trim();
    if (!apiKey) {
      yield { type: "error", message: `${this.label} API 키가 설정되지 않았습니다.` };
      yield { type: "done" };
      return;
    }

    let res: Response;
    try {
      res = await fetch(this.cfg.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: req.model || this.cfg.defaultModel,
          stream: true,
          stream_options: { include_usage: true },
          messages: this.toNative(req.transcript, req.system),
          ...(this.toNativeTools(req.tools) ? { tools: this.toNativeTools(req.tools) } : {}),
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
      yield { type: "error", message: `${this.label} API 오류 (${res.status}): ${detail}` };
      yield { type: "done" };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inTok = 0, outTok = 0;
    let finish = "";
    // index → 누적 tool_call
    const toolBuf: Record<number, { id: string; name: string; args: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const json = t.slice(5).trim();
        if (!json || json === "[DONE]") continue;
        let evt: any;
        try { evt = JSON.parse(json); } catch { continue; }

        if (evt.usage) {
          inTok = evt.usage.prompt_tokens ?? inTok;
          outTok = evt.usage.completion_tokens ?? outTok;
        }
        const choice = evt.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finish = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) {
          yield { type: "text", delta: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const buf = toolBuf[idx] || (toolBuf[idx] = { id: "", name: "", args: "" });
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name += tc.function.name;
            if (tc.function?.arguments) buf.args += tc.function.arguments;
          }
        }
      }
    }

    // 스트림 종료 후 누적된 tool_call 방출
    for (const k of Object.keys(toolBuf)) {
      const b = toolBuf[+k];
      if (!b.name) continue;
      let input: any = {};
      try { input = b.args ? JSON.parse(b.args) : {}; } catch { /* 빈 입력 */ }
      yield { type: "tool_call", call: { id: b.id || "tc" + k, name: b.name, input } };
    }
    if (inTok || outTok) yield { type: "usage", inputTokens: inTok, outputTokens: outTok };
    yield { type: "stop", reason: finish === "tool_calls" ? "tool_use" : "end" };
    yield { type: "done" };
  }
}

export const GPT_PROVIDER = new OpenAICompatProvider({
  id: "gpt", label: "GPT",
  url: "https://api.openai.com/v1/chat/completions",
  defaultModel: "gpt-5.2",
});

export const GROK_PROVIDER = new OpenAICompatProvider({
  id: "grok", label: "Grok",
  url: "https://api.x.ai/v1/chat/completions",
  defaultModel: "grok-4",
});

export const GLM_PROVIDER = new OpenAICompatProvider({
  id: "glm", label: "GLM",
  url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  defaultModel: "glm-4.6",
});
