/**
 * MCP 의 나머지 두 기둥을 **에이전트에게** 준다.
 *
 * 서버가 내주는 리소스와 프롬프트는 읽어서 패널에 세어 두기만 했다. 모델은 그것들이
 * 있다는 사실조차 몰랐다 — 문서 한 벌을 리소스로 내주는 서버를 붙여도, 물어보면
 * "그런 건 없다" 고 답한다.
 *
 * 도구는 **줄 것이 있을 때만** 만든다. 리소스를 내주는 서버가 하나도 없는데
 * `mcp_read_resource` 를 목록에 넣으면, 모델은 매 턴 그 설명을 읽고 가끔 헛되이
 * 부른다. 도구 목록은 공짜가 아니다.
 *
 * 순수 모듈이다.
 */

export interface ResourceRef { server: string; uri: string; name?: string; description?: string; mimeType?: string }
export interface PromptRef { server: string; name: string; description?: string; arguments?: { name: string; description?: string; required?: boolean }[] }

export const LIST_RESOURCES = "mcp_list_resources";
export const READ_RESOURCE = "mcp_read_resource";
export const GET_PROMPT = "mcp_get_prompt";

const EXTRA = new Set([LIST_RESOURCES, READ_RESOURCE, GET_PROMPT]);
export function isExtraTool(name: string): boolean { return EXTRA.has(name); }

export interface ToolDefLike { name: string; description: string; input_schema: any }

/** 목록에 실제로 뭔가 있을 때만 도구를 만든다. */
export function extraToolDefs(resources: readonly ResourceRef[], prompts: readonly PromptRef[]): ToolDefLike[] {
  const out: ToolDefLike[] = [];
  if (resources.length) {
    const servers = [...new Set(resources.map(r => r.server))];
    out.push({
      name: LIST_RESOURCES,
      description: `List the resources MCP servers expose (${resources.length} across ${servers.join(", ")}). Returns each resource's server and uri; pass those to ${READ_RESOURCE} to read one.`,
      input_schema: {
        type: "object",
        properties: { server: { type: "string", description: "Only list this server's resources. Omit for all." } },
      },
    });
    out.push({
      name: READ_RESOURCE,
      description: `Read one MCP resource. Get the server and uri from ${LIST_RESOURCES}.`,
      input_schema: {
        type: "object",
        properties: {
          server: { type: "string", description: "Server name." },
          uri: { type: "string", description: "Resource uri exactly as listed." },
        },
        required: ["server", "uri"],
      },
    });
  }
  if (prompts.length) {
    // 프롬프트는 대개 몇 개뿐이라 이름을 설명에 그대로 적는다 — 목록 조회 한 번을 아낀다.
    const names = prompts.map(p => `${p.server}/${p.name}`).slice(0, 40).join(", ");
    out.push({
      name: GET_PROMPT,
      description: `Fetch a prompt template an MCP server provides. Available: ${names}${prompts.length > 40 ? ", …" : ""}.`,
      input_schema: {
        type: "object",
        properties: {
          server: { type: "string", description: "Server name." },
          name: { type: "string", description: "Prompt name." },
          arguments: { type: "object", description: "Arguments the prompt declares, as name/value pairs." },
        },
        required: ["server", "name"],
      },
    });
  }
  return out;
}

/** 모델에게 보여 줄 리소스 목록. */
export function formatResourceList(resources: readonly ResourceRef[], server?: string): string {
  const list = server ? resources.filter(r => r.server === server) : resources;
  if (!list.length) {
    // "없다" 와 "서버 이름을 잘못 적었다" 는 다르다. 뒤쪽이면 뭘 고쳐야 하는지 알려 준다.
    if (server && resources.length) return `No resources on "${server}". Servers with resources: ${[...new Set(resources.map(r => r.server))].join(", ")}`;
    return "No MCP server currently exposes resources.";
  }
  return list.map(r => {
    const bits = [r.name, r.description].filter(Boolean).join(" — ");
    return `${r.server}  ${r.uri}${bits ? "  (" + bits + ")" : ""}${r.mimeType ? "  [" + r.mimeType + "]" : ""}`;
  }).join("\n");
}

/** resources/read 응답 → 글자. */
export function formatResourceContents(result: any): string {
  const contents = result?.contents;
  if (!Array.isArray(contents) || !contents.length) return "(empty resource)";
  return contents.map((c: any) => {
    if (typeof c?.text === "string") return c.text;
    // 바이너리는 통째로 실으면 대화창을 먹는다. 무엇인지만 알린다.
    if (typeof c?.blob === "string") return `[binary ${c.mimeType || "resource"}, ${c.blob.length} base64 chars — not inlined]`;
    return JSON.stringify(c);
  }).join("\n");
}

/** prompts/get 응답 → 글자. 메시지 배열을 역할과 함께 편다. */
export function formatPromptResult(result: any): string {
  const msgs = result?.messages;
  const head = result?.description ? String(result.description) + "\n\n" : "";
  if (!Array.isArray(msgs) || !msgs.length) return head || "(empty prompt)";
  return head + msgs.map((m: any) => {
    const c = m?.content;
    const text = typeof c === "string" ? c
      : typeof c?.text === "string" ? c.text
      : Array.isArray(c) ? c.map((x: any) => x?.text ?? JSON.stringify(x)).join("\n")
      : JSON.stringify(c);
    return `[${m?.role ?? "user"}] ${text}`;
  }).join("\n\n");
}

/** 인자를 확인한다. 틀렸으면 무엇이 틀렸는지 돌려준다 — 조용히 빈 결과를 주면
 *  모델은 "그런 리소스가 없다" 로 읽고 물러난다. */
export function checkResourceArgs(resources: readonly ResourceRef[], server: unknown, uri: unknown): string | null {
  const s = String(server ?? "").trim(), u = String(uri ?? "").trim();
  if (!s || !u) return "Both server and uri are required.";
  const onServer = resources.filter(r => r.server === s);
  if (!onServer.length) return `No such server with resources: "${s}". Available: ${[...new Set(resources.map(r => r.server))].join(", ")}`;
  if (!onServer.some(r => r.uri === u)) return `No resource "${u}" on "${s}". Available: ${onServer.map(r => r.uri).slice(0, 20).join(", ")}`;
  return null;
}

export function checkPromptArgs(prompts: readonly PromptRef[], server: unknown, name: unknown): string | null {
  const s = String(server ?? "").trim(), n = String(name ?? "").trim();
  if (!s || !n) return "Both server and name are required.";
  const onServer = prompts.filter(p => p.server === s);
  if (!onServer.length) return `No such server with prompts: "${s}". Available: ${[...new Set(prompts.map(p => p.server))].join(", ")}`;
  if (!onServer.some(p => p.name === n)) return `No prompt "${n}" on "${s}". Available: ${onServer.map(p => p.name).join(", ")}`;
  return null;
}

/** 필수 인자가 빠졌는지. 서버에 보내기 전에 잡으면 왕복 한 번을 아낀다. */
export function missingPromptArgs(prompts: readonly PromptRef[], server: string, name: string, args: any): string[] {
  const p = prompts.find(x => x.server === server && x.name === name);
  if (!p) return [];
  const given = args && typeof args === "object" ? args : {};
  return (p.arguments ?? []).filter(a => a.required && !(a.name in given)).map(a => a.name);
}
