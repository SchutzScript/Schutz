// MCP 서버 생성기 — 프로그램 분석 결과를 AI 프롬프트로 만들고, 생성된 코드를 다듬는다.
// 생성 서버는 의존성 0(zero-dep) Node stdio 서버(프로토콜 보일러플레이트 포함)라 즉시 실행 가능.

export type GenMode = "cli" | "project" | "openapi" | "generic";

/** 이름 슬러그화 ([A-Za-z0-9._-]) */
export function slug(s: string): string {
  const v = (s || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return v || "custom";
}

/** 생성 서버가 따라야 할 zero-dep MCP stdio 서버 스켈레톤 (프로토콜 부분은 그대로 유지) */
export const SERVER_SKELETON = `#!/usr/bin/env node
// Schutz가 생성한 MCP stdio 서버 (의존성 0 — Node 내장 모듈만 사용)
// 필요한 도구를 TOOLS 배열에 정의한다. 각 도구: { name, description, inputSchema(JSON Schema), run: async (args) => 결과 }
const { spawn } = require("child_process");
// 예: CLI 래핑 도우미 — 명령을 실행하고 stdout 을 반환
function runCmd(cmd, args) {
  return new Promise((resolve) => {
    let out = "", err = "";
    const p = spawn(cmd, args, { shell: process.platform === "win32", windowsHide: true });
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("error", e => resolve("실행 오류: " + e.message));
    p.on("exit", () => resolve((out || err).slice(0, 60000)));
    setTimeout(() => { try { p.kill(); } catch {} resolve(out || err || "타임아웃"); }, 60000);
  });
}
const TOOLS = [
  // TODO: 도구 정의
];
// ── MCP stdio 프로토콜 (수정하지 말 것) ──
let __buf = "";
process.stdin.on("data", (d) => { __buf += d; let nl; while ((nl = __buf.indexOf("\\n")) >= 0) { const line = __buf.slice(0, nl).trim(); __buf = __buf.slice(nl + 1); if (line) { let m; try { m = JSON.parse(line); } catch { continue; } handle(m); } } });
function __send(o) { process.stdout.write(JSON.stringify(o) + "\\n"); }
async function handle(m) {
  try {
    if (m.method === "initialize") return __send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "__NAME__", version: "1.0.0" } } });
    if (m.method === "notifications/initialized") return;
    if (m.method === "tools/list") return __send({ jsonrpc: "2.0", id: m.id, result: { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
    if (m.method === "tools/call") {
      const t = TOOLS.find(x => x.name === (m.params && m.params.name));
      if (!t) return __send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "unknown tool" } });
      try { const out = await t.run((m.params && m.params.arguments) || {}); __send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: String(out) }] } }); }
      catch (e) { __send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "오류: " + (e && e.message || e) }], isError: true } }); }
      return;
    }
    if (m.id != null) __send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
  } catch (e) { if (m && m.id != null) __send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: String(e && e.message || e) } }); }
}
`;

export function genSystem(): string {
  return "당신은 MCP(Model Context Protocol) 서버 생성기입니다. 주어진 프로그램 분석을 바탕으로, 아래 스켈레톤을 그대로 사용하되 TOOLS 배열만 채워 완전한 Node MCP stdio 서버 파일 하나를 만듭니다. " +
    "규칙: (1) 의존성 0 — Node 내장 모듈(child_process, https, fs, path 등)만 사용. npm 설치 금지. " +
    "(2) 프로토콜 보일러플레이트(handle/__send/stdin)는 절대 수정하지 말 것. __NAME__ 은 서버 이름으로 치환. " +
    "(3) 각 도구의 inputSchema 는 유효한 JSON Schema(type:object). run(args) 는 async 이며 문자열/JSON 결과를 반환. " +
    "(4) CLI 래핑이면 runCmd(cmd,args)로 실제 명령을 호출. API면 https/fetch로 호출. " +
    "(5) 응답은 코드펜스·설명 없이 순수 JavaScript 파일 전체만 출력.";
}

export function genUser(mode: GenMode, name: string, analysis: string): string {
  const intro: Record<GenMode, string> = {
    cli: "다음은 CLI 도구의 --help 출력입니다. 주요 서브커맨드/기능을 MCP 도구로 노출하세요(runCmd 로 실행).",
    project: "다음은 코드 프로젝트의 구조·핵심 파일 요약입니다. 이 프로젝트의 유용한 기능을 MCP 도구로 노출하세요.",
    openapi: "다음은 OpenAPI 스펙입니다. 주요 엔드포인트를 MCP 도구로 노출하세요(https 로 호출).",
    generic: "다음은 만들고 싶은 MCP 서버 설명입니다. 적절한 도구들을 설계해 구현하세요.",
  };
  return `${intro[mode]}\n\n서버 이름: ${name}\n\n=== 분석 ===\n${analysis.slice(0, 20000)}\n\n=== 스켈레톤 (이 형식을 그대로 따르세요) ===\n${SERVER_SKELETON}\n\n위 스켈레톤에서 TOOLS 배열을 채우고 __NAME__ 을 "${name}"으로 바꾼 완전한 파일 전체를 순수 코드로만 출력하세요.`;
}

/** AI 응답에서 코드펜스 제거 */
export function extractCode(out: string): string {
  let code = out.trim();
  if (code.startsWith("```")) code = code.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "").trim();
  return code;
}
