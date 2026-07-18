import {
  AgentProvider, AgentTurnRequest, AgentEvent, NeutralMsg, ToolDef,
  ProviderId, getStoredKey, getOAuth, freshOAuth, getModelOverride,
} from "./provider";
import { t } from "../i18n";

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
    if (this.cfg.id === "gpt" && getOAuth("codex")) return true;
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

  /** ChatGPT 구독(codex 백엔드) 스트리밍 — Responses API.
   *  예전엔 텍스트 전용이라 이 경로에서는 편집 도구가 전혀 전달되지 않았고, 모델이 산문으로만
   *  답해 "작업하기는 뜨는데 아무것도 안 되어 있는" 증상이 났다. 이제 도구를 실어 보내고
   *  function_call 이벤트를 파싱한다. 백엔드가 도구를 거부하면 조용히 넘기지 말고 그대로 알린다. */
  private async *streamCodexBackend(req: AgentTurnRequest): AsyncIterable<AgentEvent> {
    const tok = await freshOAuth("codex");
    if (!tok || !window.schutz?.oaiRun) {
      yield { type: "error", message: t("oai.chatgptTokenExpired") };
      yield { type: "done" };
      return;
    }
    const input: any[] = [];
    for (const m of req.transcript) {
      if (m.role === "assistant") {
        if (m.text) input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: m.text }] });
        // 도구 호출도 기록에 남겨야 다음 턴에서 결과와 짝이 맞는다 (call_id 로 연결)
        for (const c of m.calls ?? []) {
          input.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.input ?? {}) });
        }
      } else if (m.results && m.results.length) {
        for (const r of m.results) input.push({ type: "function_call_output", call_id: r.id, output: r.content });
      } else {
        input.push({ type: "message", role: "user", content: [{ type: "input_text", text: m.text ?? "" }] });
      }
    }
    const id = "oai" + Date.now() + Math.floor(Math.random() * 1e6);
    const queue: any[] = [];
    let notify: (() => void) | null = null;
    const off = window.schutz.onOaiEvent(line => {
      try {
        const ev = JSON.parse(line);
        if (ev.id !== id) return;
        queue.push(ev);
        notify?.();
      } catch { /* ignore */ }
    });
    const onAbort = () => window.schutz?.oaiStop(id);
    req.signal?.addEventListener("abort", onAbort);
    window.schutz.oaiRun({
      id, access: tok.access, accountId: tok.accountId ?? null,
      body: {
        model: getModelOverride("codex") || "gpt-5.6-terra",
        instructions: req.system ?? "",
        input,
        stream: true,
        store: false,
        // Responses API 의 도구 형식은 chat-completions 와 달리 평평하다
        // ({type,name,description,parameters}) — function 아래에 중첩하지 않는다.
        ...(req.tools && req.tools.length
          ? { tools: req.tools.map(t2 => ({ type: "function", name: t2.name, description: t2.description, parameters: t2.input_schema })) }
          : {}),
      },
    });
    // item_id → 조립 중인 함수 호출. Responses API 는 인자를 델타로 흘려보낸다.
    const fnBuf = new Map<string, { callId: string; name: string; args: string }>();
    let sawCall = false;
    try {
      let doneFlag = false;
      while (!doneFlag) {
        while (queue.length === 0) {
          await new Promise<void>(res => { notify = res; });
          notify = null;
        }
        const ev = queue.shift();
        if (ev.error) {
          yield { type: "error", message: String(ev.error) };
        } else if (ev.done) {
          doneFlag = true;
        } else if (ev.data) {
          let d: any;
          try { d = JSON.parse(ev.data); } catch { continue; }
          if (d.type === "response.output_text.delta" && d.delta) {
            yield { type: "text", delta: d.delta };
          } else if (d.type === "response.output_item.added" && d.item?.type === "function_call") {
            fnBuf.set(String(d.item.id ?? d.output_index), { callId: String(d.item.call_id ?? d.item.id ?? ""), name: String(d.item.name ?? ""), args: "" });
          } else if (d.type === "response.function_call_arguments.delta") {
            const b2 = fnBuf.get(String(d.item_id ?? d.output_index));
            if (b2) b2.args += d.delta ?? "";
          } else if (d.type === "response.output_item.done" && d.item?.type === "function_call") {
            // 완성본이 오면 그것을 신뢰한다(델타 유실 대비)
            const key = String(d.item.id ?? d.output_index);
            const b2 = fnBuf.get(key) ?? { callId: "", name: "", args: "" };
            const callId = String(d.item.call_id ?? b2.callId ?? key);
            const name = String(d.item.name ?? b2.name);
            const argsRaw = typeof d.item.arguments === "string" && d.item.arguments ? d.item.arguments : b2.args;
            fnBuf.delete(key);
            // 호출별 개별 파싱 — 하나가 깨져도 나머지 호출은 살린다
            let parsed: any = {};
            try { parsed = argsRaw ? JSON.parse(argsRaw) : {}; }
            catch { yield { type: "error", message: t("oai.badToolArgs", { name }) }; continue; }
            sawCall = true;
            yield { type: "tool_call", call: { id: callId, name, input: parsed } };
          } else if (d.type === "response.completed" && d.response?.usage) {
            yield { type: "usage", inputTokens: d.response.usage.input_tokens ?? 0, outputTokens: d.response.usage.output_tokens ?? 0 };
          } else if (d.type === "response.failed") {
            yield { type: "error", message: t("oai.responseFailed", { detail: d.response?.error?.message ?? t("oai.unknown") }) };
          }
        }
      }
    } finally {
      off();
      req.signal?.removeEventListener("abort", onAbort);
    }
    // 도구를 하나라도 불렀으면 루프가 계속되어야 한다 — end 로 끊으면 실행 전에 버려진다
    yield { type: "stop", reason: sawCall ? "tool_use" : "end" };
    yield { type: "done" };
  }

  async *streamAgentTurn(req: AgentTurnRequest): AsyncIterable<AgentEvent> {
    const apiKey = getStoredKey(this.cfg.id).trim();
    // GPT: API 키가 없고 ChatGPT 계정이 연결돼 있으면 구독(codex 백엔드) 경로
    if (this.cfg.id === "gpt" && !apiKey && getOAuth("codex")) {
      yield* this.streamCodexBackend(req);
      return;
    }
    if (!apiKey) {
      yield { type: "error", message: t("oai.apiKeyNotSet", { label: this.label }) };
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
          model: req.model || getModelOverride(this.cfg.id) || this.cfg.defaultModel,
          stream: true,
          stream_options: { include_usage: true },
          messages: this.toNative(req.transcript, req.system),
          ...(this.toNativeTools(req.tools) ? { tools: this.toNativeTools(req.tools) } : {}),
        }),
        signal: req.signal,
      });
    } catch (e) {
      yield { type: "error", message: t("oai.networkError", { detail: e instanceof Error ? e.message : String(e) }) };
      yield { type: "done" };
      return;
    }

    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      yield { type: "error", message: t("oai.apiError", { label: this.label, status: res.status, detail }) };
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
            // 이름은 대입 — 누적하면 델타마다 전체 이름을 보내는 백엔드에서
            // "propose_editpropose_edit" 이 되어 알 수 없는 도구로 떨어진다
            if (tc.function?.name) buf.name = tc.function.name;
            if (tc.function?.arguments) buf.args += tc.function.arguments;
          }
        }
      }
    }

    // 스트림 종료 후 누적된 tool_call 방출
    let emitted = 0;
    for (const k of Object.keys(toolBuf)) {
      const b = toolBuf[+k];
      if (!b.name) continue;
      let input: any = {};
      // 인자 파싱 실패를 {} 로 삼키면 빈 경로 제안이 만들어진다 — 그 호출만 건너뛰고 알린다
      try { input = b.args ? JSON.parse(b.args) : {}; }
      catch { yield { type: "error", message: t("oai.badToolArgs", { name: b.name }) }; continue; }
      emitted++;
      yield { type: "tool_call", call: { id: b.id || "tc" + k, name: b.name, input } };
    }
    if (inTok || outTok) yield { type: "usage", inputTokens: inTok, outputTokens: outTok };
    // finish_reason 만 믿으면, 도구 호출을 파싱해놓고도 실행 전에 버리는 백엔드가 있다
    yield { type: "stop", reason: (finish === "tool_calls" || emitted > 0) ? "tool_use" : "end" };
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
