import {
  AIProvider, ChatRequest, StreamEvent,
  AgentProvider, AgentTurnRequest, AgentEvent, NeutralMsg, ToolDef,
  getStoredKey, getOAuth, freshOAuth, getModelOverride,
} from "./provider";
import { getLang, t } from "../i18n";
import { retryPlan, sleep } from "./retry";

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
      // 사진을 붙였으면 이미지 블록 + 텍스트로 보낸다. 이미지를 먼저 두는 편이 "이걸 보고
      // 이렇게 해줘" 라는 읽는 순서와 맞는다.
      if (m.images && m.images.length) {
        const content: any[] = m.images.map(im => ({
          type: "image", source: { type: "base64", media_type: im.mime, data: im.data },
        }));
        if (m.text) content.push({ type: "text", text: m.text });
        return { role: "user", content };
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

    const body = {
      model: req.model || getModelOverride("claude") || "claude-sonnet-5",
      max_tokens: 8192,
      stream: true,
      ...(system ? { system } : {}),
      ...(req.tools && req.tools.length ? { tools: req.tools } : {}),
      messages: this.toNative(req.transcript),
    };

    // Electron: 메인 프로세스 릴레이로 CORS 우회 (조직이 브라우저 직접 호출을 차단하는 경우 대응)
    const dataLines: AsyncIterable<string> = (window as any).schutz?.anthropicRun
      ? this.relayDataLines(headers, body, req.signal)
      : await this.directDataLines(headers, body, req.signal);
    yield* this.parseAnthropicStream(dataLines);
  }

  /** SSE `data:` JSON 문자열 스트림을 AgentEvent로 변환 (직접/릴레이 공용) */
  private async *parseAnthropicStream(dataLines: AsyncIterable<string>): AsyncIterable<AgentEvent> {
    let inTok = 0, outTok = 0;
    let stop: "end" | "tool_use" | "error" = "end";
    let sawAny = false; // 이벤트가 하나라도 왔는가 — 조용히 끊긴 스트림을 정상 종료와 구분한다
    const toolBuf: Record<number, { id: string; name: string; json: string }> = {};
    for await (const json of dataLines) {
      sawAny = true;
      if (json === "__ERROR__") { stop = "error"; continue; }
      if (json.startsWith("__ERRMSG__")) { yield { type: "error", message: json.slice(10) }; stop = "error"; continue; }
      let evt: any;
      try { evt = JSON.parse(json); } catch { continue; }
      switch (evt.type) {
        case "error":
          // 스트림 중간 오류 이벤트 — 조용히 빈 응답으로 끝나지 않도록 표면화
          yield { type: "error", message: evt.error?.message || evt.error?.type || "Anthropic stream error" };
          stop = "error";
          break;
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
            delete toolBuf[evt.index];
            // 인자 JSON 이 깨졌으면 **건너뛴다.** 예전엔 {} 로 삼켰는데, 그러면 경로가 빈
            // propose_edit 이 만들어지는 식으로 모델이 하려던 것과 다른 일이 조용히 실행됐다.
            // openaiCompat 은 처음부터 이렇게 하고 있었다 — 여기만 달랐다.
            let input: any;
            try { input = tb.json ? JSON.parse(tb.json) : {}; }
            catch { yield { type: "error", message: t("oai.badToolArgs", { name: tb.name }) }; break; }
            yield { type: "tool_call", call: { id: tb.id, name: tb.name, input } };
          }
          break;
        }
        case "message_delta":
          if (evt.usage) outTok = evt.usage.output_tokens ?? outTok;
          if (evt.delta?.stop_reason === "tool_use") stop = "tool_use";
          break;
      }
    }
    // 아무 이벤트도 없이 끝났다면 요청이 중간에 취소·차단된 것이다.
    // 예전엔 이걸 "모델이 할 말이 없었다"와 똑같이 취급해, 도구를 쓴 턴이 답 없이 조용히 끝났다.
    if (!sawAny && stop !== "error") {
      yield { type: "error", message: "응답이 오지 않고 요청이 끊겼습니다. 다시 시도해 주세요." };
      stop = "error";
    }
    if (inTok || outTok) yield { type: "usage", inputTokens: inTok, outputTokens: outTok };
    yield { type: "stop", reason: stop };
    yield { type: "done" };
  }

  /** 웹/직접 fetch 경로 → `data:` JSON 문자열 스트림 */
  private async directDataLines(headers: Record<string, string>, body: any, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    // 429·5xx·네트워크 오류는 잠깐 기다렸다 다시 보낸다. 재시도는 **응답 헤더를 받기
    // 전까지만** — 스트림이 시작된 뒤라면 모델이 이미 도구를 부르게 했을 수 있어,
    // 다시 보내면 같은 편집·명령이 두 번 실행된다. (정책·백오프는 retry.ts)
    let res: Response | null = null;
    let lastErr = "";
    for (let attempt = 1; ; attempt++) {
      let netErr = false;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body), signal });
      } catch (e) {
        // 사용자가 멈춘 것은 실패가 아니다 — 재시도하지 않는다.
        if (signal?.aborted) return (async function* () { yield "__ERRMSG__요청이 취소되었습니다."; })();
        netErr = true; res = null;
        lastErr = "네트워크 오류: " + (e instanceof Error ? e.message : String(e));
      }
      if (res && res.ok && res.body) break;
      if (res) {
        let detail = res.statusText;
        try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
        lastErr = "Claude API 오류 (" + res.status + "): " + detail;
      }
      const wait = retryPlan(
        attempt,
        { status: res?.status, networkError: netErr, retryAfter: res?.headers.get("retry-after") },
        Date.now(), Math.random(),
      );
      if (wait === null) { const msg = lastErr; return (async function* () { yield "__ERRMSG__" + msg; })(); }
      await sleep(wait, signal);
      if (signal?.aborted) return (async function* () { yield "__ERRMSG__요청이 취소되었습니다."; })();
    }
    const reader = res!.body!.getReader();
    return (async function* () {
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.split("\n").find(l => l.startsWith("data:"));
          if (dataLine) yield dataLine.slice(5).trim();
        }
      }
    })();
  }

  /** Electron 릴레이 경로 → `data:` JSON 문자열 스트림 (async 큐) */
  private async *relayDataLines(headers: Record<string, string>, body: any, signal?: AbortSignal): AsyncIterable<string> {
    const sx = (window as any).schutz;
    const id = "anth" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    const queue: any[] = [];
    let notify: (() => void) | null = null;
    const off = sx.onAnthropicEvent((line: string) => {
      try { const ev = JSON.parse(line); if (ev.id !== id) return; queue.push(ev); notify?.(); } catch { /* */ }
    });
    const onAbort = () => sx.anthropicStop(id);
    signal?.addEventListener("abort", onAbort);
    sx.anthropicRun({ id, headers, body });
    try {
      while (true) {
        while (queue.length === 0) { await new Promise<void>(r => { notify = r; }); notify = null; }
        const ev = queue.shift();
        if (ev.error) { yield "__ERRMSG__" + String(ev.error); }
        else if (ev.done) break;
        else if (ev.data) yield ev.data;
      }
    } finally {
      off();
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** 워크스페이스가 열려 있을 때 에이전트에게 주는 도구들 */
export const WORKSPACE_TOOLS: ToolDef[] = [
  {
    name: "list_files",
    description:
      "워크스페이스의 파일 목록(상대 경로)을 반환한다. " +
      "큰 저장소에서는 glob 으로 좁혀라 — 좁히지 않으면 앞부분만 돌려주고 잘렸다고 알린다.",
    input_schema: {
      type: "object",
      properties: {
        glob: {
          type: "string",
          description: "쉼표로 구분한 glob 필터 (예: src/**/*.ts,*.json). 생략하면 전체.",
        },
      },
      required: [],
    },
  },
  {
    name: "set_plan",
    description:
      "여러 단계가 필요한 일을 시작할 때 계획을 올린다. 사용자 화면의 계획 패널에 그대로 뜬다. " +
      "단계를 끝낼 때마다 done 을 갱신해 다시 부르면 진행이 보인다. " +
      "한두 번의 도구 호출로 끝나는 일에는 쓰지 않는다 — 짧은 일에 계획을 붙이면 소음이다.",
    input_schema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "계획 단계. 각 줄은 한 문장으로 짧게.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "무엇을 하는 단계인지" },
              done: { type: "boolean", description: "이미 끝났으면 true" },
            },
            required: ["label"],
          },
        },
      },
      required: ["steps"],
    },
  },
  {
    name: "search_files",
    description:
      "워크스페이스 전체에서 텍스트를 찾아 파일·줄번호·해당 줄을 돌려준다. " +
      "낯선 코드에서 무언가가 어디에 정의·사용되는지 찾을 때 가장 먼저 쓸 도구다 — " +
      "파일을 통째로 읽기 전에 이것으로 위치를 좁혀라.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "찾을 텍스트 (2글자 이상)" },
        include: { type: "string", description: "포함할 파일 glob (쉼표 구분, 예: src/**/*.ts)" },
        exclude: { type: "string", description: "제외할 파일 glob (쉼표 구분)" },
        regex: { type: "boolean", description: "query 를 정규식으로 해석한다" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_file",
    description:
      "워크스페이스의 파일 내용을 읽는다. 줄 번호가 붙어서 온다. " +
      "큰 파일은 offset·limit 으로 필요한 구간만 읽어라 — 생략하면 앞부분만 오고 잘렸다고 알린다.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "워크스페이스 상대 경로" },
        offset: { type: "number", description: "읽기 시작할 줄 번호 (1부터). 생략하면 1." },
        limit: { type: "number", description: "읽을 줄 수. 생략하면 기본 상한까지." },
      },
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
  {
    name: "run_command",
    description:
      "워크스페이스 루트에서 셸 명령을 실행하고 출력을 돌려받는다. " +
      "빌드·테스트·설치·스크립트 실행(npm install, npm run dev, pytest 등)에 쓴다. " +
      "npm run dev 처럼 계속 떠 있어야 하는 개발 서버는 background:true 로 실행한다. " +
      "그러면 종료를 기다리지 않고 접속 주소를 돌려주며, 그 화면이 편집 그룹에 자동으로 열린다. " +
      "일반 명령(빌드·테스트·설치)은 background 없이 실행해 출력을 받는다. " +
      "파일 수정은 이 도구 대신 propose_edit/propose_create 를 쓸 것.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "실행할 셸 명령 (워크스페이스 루트에서 실행됨)" },
        rationale: { type: "string", description: "이 명령을 실행하는 이유 (한 문장)" },
        background: { type: "boolean", description: "계속 떠 있는 서버면 true — 주소를 받아 화면이 편집창에 열린다" },
      },
      required: ["command", "rationale"],
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

/** 응답 언어 이름 — UI 언어(getLang)에 맞춰 에이전트가 그 언어로 답하도록 지시 */
const RESP_LANG: Record<string, string> = { ko: "한국어", en: "English", de: "Deutsch (German)", ja: "日本語 (Japanese)" };
/** 언어 인식 시스템 프롬프트 — 호출 시점의 UI 언어로 응답하도록 동적 생성 */
export function schutzSystemPrompt(): string {
  const lang = RESP_LANG[getLang()] || "한국어";
  return `당신은 Schutz IDE에 내장된 코딩 에이전트입니다.
사용자는 당신의 작업 과정을 실시간으로 지켜봅니다. 반드시 ${lang}(으)로, 간결하게 응답하고 계획을 먼저 밝히고 진행하세요.

도구가 제공된 경우(워크스페이스 열림):
- 단계가 여럿인 일은 set_plan으로 계획을 먼저 올리고, 한 단계를 끝낼 때마다 done을 갱신해 다시 부르세요. 사용자는 그 패널로 진행을 봅니다. 한두 번의 도구 호출로 끝나는 일에는 쓰지 마세요.
- 낯선 코드를 파악할 때는 search_files로 먼저 위치를 좁히세요. 파일을 통째로 읽는 것보다 훨씬 빠르고 정확합니다.
- 큰 파일은 read_file의 offset·limit으로 필요한 구간만 읽으세요. 결과가 잘렸다고 나오면 이어서 부르거나 범위를 좁히세요.
- 파일을 고치기 전에 반드시 read_file로 현재 내용을 확인하세요.
- 모든 편집은 propose_edit로 제안하세요. 직접 쓸 수 없으며, 사용자가 수락해야 반영됩니다.
- find는 파일에 정확히 한 번 존재하는 텍스트여야 합니다. 여러 곳을 고치려면 제안을 나누세요.
- 변경은 최소한으로, rationale은 한 문장으로.`;
}

export const MANAGER_SYSTEM_EXTRA = `

당신은 팀의 관리자입니다. delegate_task로 다른 에이전트에게 하위 작업을 나눠줄 수 있습니다.
- 서로 다른 파일은 병렬로 위임하세요. 같은 파일을 두 에이전트에게 주지 마세요 (파일 락 충돌).
- **위임은 반드시 delegate_task 도구를 호출해야 실제로 일어납니다.** 도구를 부르지 않고
  "위임했습니다"라고 말만 하면 아무 일도 일어나지 않고 사용자는 오지 않을 결과를 기다립니다.
  계획만 세우고 끝내지 마세요 — 이번 턴에 도구를 부르세요.
- 도구를 부른 뒤에야 무엇을 누구에게 맡겼는지 요약하세요.`;
