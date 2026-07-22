import { describe, it, expect } from "vitest";
import { parseHead, parseBody, CLI_MSG_CAP, CLI_CHAR_CAP, type CliItem } from "./cliChats";

// 여기 쓰인 레코드 모양은 전부 **실제 파일에서 확인한 것**이다. 손으로 지어낸 형식을
// 테스트하면 통과해도 아무것도 보장하지 못한다. 확인 경로:
//   ~/.claude/projects/<경로>/<uuid>.jsonl
//   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl

const jl = (...recs: unknown[]) => recs.map(r => JSON.stringify(r)).join("\n");

const cUser = (text: string, at = "2026-07-01T00:00:00.000Z") =>
  ({ type: "user", isSidechain: false, timestamp: at, sessionId: "S1", cwd: "C:\\w", gitBranch: "main",
     message: { role: "user", content: text } });
const cAsst = (blocks: unknown[], at = "2026-07-01T00:00:01.000Z") =>
  ({ type: "assistant", isSidechain: false, timestamp: at, sessionId: "S1", cwd: "C:\\w", gitBranch: "main",
     message: { role: "assistant", content: blocks } });

const msgs = (items: CliItem[]) => items.filter(i => i.kind === "msg");
const tools = (items: CliItem[]) => items.filter(i => i.kind === "tool");

describe("parseBody — Claude Code", () => {
  it("문자열 content 를 사람 말로 읽는다", () => {
    const b = parseBody("claude", jl(cUser("안녕")));
    expect(msgs(b.items)).toEqual([{ kind: "msg", role: "user", text: "안녕", at: Date.parse("2026-07-01T00:00:00.000Z") }]);
  });

  // 이 형식에서 제일 잘 틀리는 곳. 도구 결과가 `user` 레코드로 들어오기 때문에
  // 역할만 보고 가르면 셸 출력이 사용자 발언으로 둔갑한다.
  it("user 레코드의 tool_result 는 사람 말이 아니다", () => {
    const b = parseBody("claude", jl(
      cUser("파일 좀 봐줘"),
      cAsst([{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls -la" } }]),
      { type: "user", isSidechain: false, timestamp: "2026-07-01T00:00:02.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "total 12\ndrwx..." }] } },
    ));
    expect(msgs(b.items).map(m => m.text)).toEqual(["파일 좀 봐줘"]);
    expect(msgs(b.items).some(m => /total 12/.test(m.text))).toBe(false);
  });

  it("tool_result 의 content 가 배열이어도 말이 되지 않는다", () => {
    // 실측: 문자열 4142건, 배열 289건. 둘 다 온다.
    const b = parseBody("claude", jl(
      { type: "user", isSidechain: false, timestamp: "2026-07-01T00:00:02.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "출력" }] }] } },
    ));
    expect(b.items).toEqual([]);
  });

  it("서브에이전트(isSidechain)는 본 대화에 섞이지 않는다", () => {
    const b = parseBody("claude", jl(
      cUser("진짜 사용자"),
      { ...cUser("서브에이전트에게 준 지시"), isSidechain: true },
      { ...cAsst([{ type: "text", text: "서브에이전트 답" }]), isSidechain: true },
    ));
    expect(msgs(b.items).map(m => m.text)).toEqual(["진짜 사용자"]);
  });

  it("thinking 은 버리고 tool_use 는 도구 줄이 된다", () => {
    const b = parseBody("claude", jl(cAsst([
      { type: "thinking", thinking: "", signature: "EpwICokBCA8YAipA…" },
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "C:\\w\\a.ts" } },
      { type: "text", text: "읽었습니다" },
    ])));
    expect(tools(b.items)).toEqual([{ kind: "tool", name: "Read", detail: "C:\\w\\a.ts", at: Date.parse("2026-07-01T00:00:01.000Z") }]);
    expect(msgs(b.items).map(m => m.text)).toEqual(["읽었습니다"]);
  });

  it("도구 설명은 알아볼 수 있는 필드 하나만 쓴다", () => {
    const b = parseBody("claude", jl(cAsst([
      { type: "tool_use", name: "Bash", input: { command: "git status", description: "상태 확인", timeout: 5000 } },
    ])));
    expect(tools(b.items)[0]).toMatchObject({ name: "Bash", detail: "git status" });
  });

  it("같은 화자가 연달아 말하면 한 덩이로 잇는다", () => {
    const b = parseBody("claude", jl(
      cAsst([{ type: "text", text: "첫 문단" }]),
      cAsst([{ type: "text", text: "둘째 문단" }]),
    ));
    expect(msgs(b.items)).toHaveLength(1);
    expect(msgs(b.items)[0].kind === "msg" && msgs(b.items)[0]).toMatchObject({ text: "첫 문단\n\n둘째 문단" });
  });

  it("사이에 도구가 끼면 잇지 않는다 — 그건 진짜로 나뉜 것이다", () => {
    const b = parseBody("claude", jl(
      cAsst([{ type: "text", text: "찾아볼게요" }]),
      cAsst([{ type: "tool_use", name: "Grep", input: { pattern: "foo" } }]),
      cAsst([{ type: "text", text: "찾았습니다" }]),
    ));
    expect(msgs(b.items)).toHaveLength(2);
    expect(b.items.map(i => i.kind)).toEqual(["msg", "tool", "msg"]);
  });
});

describe("parseBody — Codex", () => {
  const cxUser = (text: string) =>
    ({ type: "event_msg", timestamp: "2026-07-22T03:00:00.000Z", payload: { type: "user_message", message: text } });
  const cxAsst = (text: string) =>
    ({ type: "response_item", timestamp: "2026-07-22T03:00:01.000Z",
       payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] } });

  it("사람 말은 event_msg 에서, 답은 response_item 에서 읽는다", () => {
    const b = parseBody("codex", jl(cxUser("커밋해"), cxAsst("했습니다")));
    expect(msgs(b.items).map(m => (m.kind === "msg" ? [m.role, m.text] : null)))
      .toEqual([["user", "커밋해"], ["ai", "했습니다"]]);
  });

  // agent_message 는 response_item 과 **같은 답**을 한 번 더 흘리는 UI 이벤트다.
  // 실측에서 662건씩 정확히 짝이 맞았다. 둘 다 받으면 답이 두 번씩 나온다.
  it("event_msg/agent_message 는 답을 두 번 만들지 않는다", () => {
    const b = parseBody("codex", jl(
      cxAsst("했습니다"),
      { type: "event_msg", timestamp: "2026-07-22T03:00:01.000Z", payload: { type: "agent_message", message: "했습니다" } },
    ));
    expect(msgs(b.items)).toHaveLength(1);
  });

  // response_item 의 user 메시지엔 주입 덩어리가 섞인다. event_msg 만 쓰므로 애초에
  // 안 들어오지만, 형식이 바뀌어 새어 들어와도 걸러지는지 본다.
  it("주입된 기계 블록은 사람 말이 아니다", () => {
    const b = parseBody("codex", jl(
      cxUser("<environment_context>\n  <current_date>2026-07-22</current_date>\n</environment_context>"),
      cxUser("<recommended_plugins>\nAtlassian Rovo\n</recommended_plugins>"),
      cxUser("진짜 질문"),
    ));
    expect(msgs(b.items).map(m => m.text)).toEqual(["진짜 질문"]);
  });

  it("reasoning 은 암호화되어 있어 버린다", () => {
    const b = parseBody("codex", jl(
      { type: "response_item", payload: { type: "reasoning", summary: [], encrypted_content: "gAAAAABqYDbTT2R5…" } },
    ));
    expect(b.items).toEqual([]);
  });

  it("custom_tool_call 과 function_call 둘 다 도구가 된다", () => {
    const b = parseBody("codex", jl(
      { type: "response_item", timestamp: "2026-07-22T03:00:02.000Z",
        payload: { type: "custom_tool_call", name: "exec", call_id: "c1", input: "const r = await tools.shell_command(…)" } },
      { type: "response_item", timestamp: "2026-07-22T03:00:03.000Z",
        payload: { type: "function_call", name: "apply_patch", arguments: { path: "README.md" } } },
    ));
    expect(tools(b.items).map(t => t.kind === "tool" && t.name)).toEqual(["exec", "apply_patch"]);
    expect(tools(b.items)[1]).toMatchObject({ detail: "README.md" });
  });

  it("developer 역할은 시스템 프롬프트라 대화가 아니다", () => {
    const b = parseBody("codex", jl(
      { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "<permissions instructions>…" }] } },
    ));
    expect(b.items).toEqual([]);
  });
});

describe("깨진 입력", () => {
  // 꼬리부터 읽으면 첫 줄은 거의 항상 반토막이다. 그건 오류가 아니라 예정된 일이라
  // 던지면 안 된다 — 던지면 218MB 파일은 영원히 못 연다.
  it("반토막 첫 줄을 버리고 나머지를 읽는다", () => {
    const good = jl(cUser("살아남아야 한다"));
    const half = '{"type":"assistant","message":{"content":[{"type":"te';
    const b = parseBody("claude", half + "\n" + good);
    expect(msgs(b.items).map(m => m.text)).toEqual(["살아남아야 한다"]);
  });

  it("빈 문자열·잡음에 던지지 않는다", () => {
    expect(parseBody("claude", "").items).toEqual([]);
    expect(parseBody("codex", "\n\n  \n").items).toEqual([]);
    expect(parseBody("claude", "not json at all").items).toEqual([]);
    expect(parseBody("claude", jl([1, 2, 3], "문자열", null)).items).toEqual([]);
  });
});

describe("상한", () => {
  const many = (n: number) => jl(...Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? cUser("질문 " + i) : cAsst([{ type: "text", text: "답 " + i }])));

  it("상한 안이면 자르지 않는다", () => {
    const b = parseBody("claude", many(10), 200);
    expect(b.clipped).toBe(false);
    expect(b.droppedMsgs).toBe(0);
    expect(msgs(b.items)).toHaveLength(10);
  });

  it("넘으면 최근 것부터 남기고 몇 개를 버렸는지 말한다", () => {
    const b = parseBody("claude", many(50), 10);
    expect(b.clipped).toBe(true);
    expect(b.droppedMsgs).toBe(40);
    expect(msgs(b.items)).toHaveLength(10);
    // 대화를 이어가려면 **끝**이 필요하다 — 남은 건 마지막 10개여야 한다.
    const last = msgs(b.items)[9];
    expect(last.kind === "msg" && last.text).toBe("답 49");
  });

  it("남긴 첫 말보다 앞의 도구는 함께 버린다 — 주인 없는 줄이 된다", () => {
    const b = parseBody("claude", jl(
      cUser("옛날 질문"),
      cAsst([{ type: "tool_use", name: "Read", input: { file_path: "old.ts" } }]),
      cUser("최근 질문"),
    ), 1);
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({ kind: "msg", text: "최근 질문" });
  });

  it("기본 상한은 200 이다", () => {
    expect(CLI_MSG_CAP).toBe(200);
    expect(parseBody("claude", many(400)).droppedMsgs).toBe(200);
  });
});

describe("parseHead", () => {
  it("Claude — 사용자가 붙인 이름이 자동 제목을 이긴다", () => {
    const h = parseHead("claude", jl(
      { type: "ai-title", aiTitle: "자동으로 붙은 제목", sessionId: "S1" },
      { type: "custom-title", customTitle: "내가 붙인 이름", sessionId: "S1" },
      cUser("첫 질문"),
    ), "제목 없음");
    expect(h.title).toBe("내가 붙인 이름");
  });

  it("Claude — 작업 폴더와 브랜치를 건진다", () => {
    const h = parseHead("claude", jl(cUser("안녕")), "제목 없음");
    expect(h).toMatchObject({ id: "S1", cwd: "C:\\w", branch: "main", title: "안녕" });
  });

  it("Codex — session_meta 에서 id·cwd, 제목은 첫 발언에서 만든다", () => {
    const h = parseHead("codex", jl(
      { type: "session_meta", payload: { id: "019f87d5", cwd: "c:\\Users\\29\\Desktop\\TechAPI" } },
      { type: "event_msg", payload: { type: "user_message", message: "<environment_context>…</environment_context>" } },
      { type: "event_msg", payload: { type: "user_message", message: "README 를 간단하게 바꾸고 싶은데" } },
    ), "제목 없음");
    expect(h).toMatchObject({ id: "019f87d5", cwd: "c:\\Users\\29\\Desktop\\TechAPI", title: "README 를 간단하게 바꾸고 싶은데" });
  });

  it("건질 게 없으면 넘겨준 이름을 쓴다", () => {
    expect(parseHead("claude", "", "이름 없는 대화").title).toBe("이름 없는 대화");
    expect(parseHead("codex", jl({ type: "session_meta", payload: { id: "x" } }), "이름 없는 대화").title).toBe("이름 없는 대화");
  });

  it("제목은 한 줄로 눕히고 60자에서 자른다 — 목록은 한 줄이다", () => {
    const long = "가".repeat(80);
    const h = parseHead("claude", jl(cUser("여러\n줄\n제목")), "x");
    expect(h.title).toBe("여러 줄 제목");
    expect(parseHead("claude", jl(cUser(long)), "x").title).toBe("가".repeat(60) + "…");
  });
});

// 개수 상한만으로는 저장이 안 지켜진다. 실제로 218MB 짜리 대화를 가져오다 저장이
// 통째로 실패했다 — 200마디가 전부 긴 로그였고, 합쳐 4MB 라 localStorage 를 넘겼다.
describe("글자 상한", () => {
  const long = (n: number, ch: string) => ch.repeat(n);
  const heavy = (count: number, chars: number) => jl(...Array.from({ length: count }, (_, i) =>
    i % 2 === 0 ? cUser(long(chars, "질")) : cAsst([{ type: "text", text: long(chars, "답") }])));

  it("개수는 남았는데 글자가 차면 거기서 자른다", () => {
    // 10마디 × 1000자 = 10,000자. 개수 상한(200)에는 한참 못 미친다.
    const b = parseBody("claude", heavy(10, 1000), 200, 3000);
    const m = msgs(b.items);
    expect(b.clipped).toBe(true);
    expect(m.length).toBeLessThan(10);
    const total = m.reduce((n, x) => n + (x.kind === "msg" ? x.text.length : 0), 0);
    expect(total).toBeLessThanOrEqual(3000);
  });

  it("글자로 잘려도 남는 건 **끝**이다 — 이어가려면 끝이 필요하다", () => {
    const b = parseBody("claude", heavy(10, 1000), 200, 2500);
    const m = msgs(b.items);
    const last = m[m.length - 1];
    expect(last.kind === "msg" && last.text[0]).toBe("답");   // 마지막 마디(i=9)
  });

  it("버린 마디 수를 정확히 센다", () => {
    const b = parseBody("claude", heavy(10, 1000), 200, 2500);
    expect(b.droppedMsgs).toBe(10 - msgs(b.items).length);
  });

  it("한 마디가 통째로 상한을 넘어도 빈 대화를 만들지 않는다", () => {
    const b = parseBody("claude", jl(cUser(long(5000, "가"))), 200, 100);
    expect(msgs(b.items)).toHaveLength(1);
  });

  it("도구 줄의 글자도 예산에 넣는다 — 안 세면 예산이 새어나간다", () => {
    const withTools = jl(
      cAsst([{ type: "tool_use", name: "Bash", input: { command: long(240, "x") } }]),
      cUser(long(100, "가")),
      cAsst([{ type: "tool_use", name: "Bash", input: { command: long(240, "y") } }]),
      cAsst([{ type: "text", text: long(100, "나") }]),
    );
    const b = parseBody("claude", withTools, 200, 250);
    const chars = b.items.reduce((n, i) => n + (i.kind === "msg" ? i.text.length : i.detail.length), 0);
    expect(chars).toBeLessThanOrEqual(250);
  });

  it("기본 글자 상한은 60만이다 — 5MB 저장소에 여덟 개는 들어간다", () => {
    expect(CLI_CHAR_CAP).toBe(600_000);
  });
});
