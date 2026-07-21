import { describe, expect, it } from "vitest";
import { buildTimeline, seqOf } from "./agentTimeline";

const ids = (rows: ReturnType<typeof buildTimeline>) => rows.map(r => (r.v as { id?: string })?.id ?? "ask");
const kinds = (rows: ReturnType<typeof buildTimeline>) => rows.map(r => r.k);

describe("seqOf", () => {
  it("_uid 규약의 접두어들을 전부 읽는다", () => {
    expect(seqOf("u12")).toBe(12);      // 사용자 메시지
    expect(seqOf("a13")).toBe(13);      // AI 메시지
    expect(seqOf("rt14")).toBe(14);     // run_command 도구
    expect(seqOf("cli15")).toBe(15);    // CLI 이벤트 도구
    expect(seqOf("pp16")).toBe(16);     // 제안
  });

  it("번호가 없으면 -1 — 배열 순서를 유지시키기 위한 값", () => {
    expect(seqOf("")).toBe(-1);
    expect(seqOf("no-digits")).toBe(-1);
  });

  // 데모의 startRun 이 _uid 를 안 거치고 "t1"~"t5" 를 직접 찍는다. 이 리터럴들은
  // 실제 실행 번호(수백~수천)보다 작아서 트랜스크립트 맨 위로 몰린다.
  // 데모를 에이전트 모드에서 돌리기 전에 반드시 손봐야 하는 지점이라 여기 못 박는다.
  it("데모 리터럴 id 는 작은 수로 읽혀 앞으로 정렬된다 (알려진 함정)", () => {
    expect(seqOf("t1")).toBe(1);
    expect(seqOf("t5")).toBe(5);
    const rows = buildTimeline({ messages: [{ id: "u900" }], tools: [{ id: "t1" }] });
    expect(ids(rows)).toEqual(["t1", "u900"]);   // 의도가 아니라 현상 — 데모 각본이 이걸 피해야 한다
  });
});

describe("네 갈래 병합", () => {
  it("id 번호 순으로 한 줄기가 된다", () => {
    const rows = buildTimeline({
      messages: [{ id: "u1" }, { id: "a4" }],
      tools: [{ id: "rt2" }, { id: "cli3" }],
      proposals: [{ id: "pp5" }],
    });
    expect(ids(rows)).toEqual(["u1", "rt2", "cli3", "a4", "pp5"]);
    expect(kinds(rows)).toEqual(["msg", "tool", "tool", "msg", "prop"]);
  });

  it("비어 있어도 죽지 않는다", () => {
    expect(buildTimeline({})).toEqual([]);
    expect(buildTimeline({ messages: [], tools: [], proposals: [], ask: null })).toEqual([]);
  });

  it("대기 중인 승인은 항상 맨 끝 — 지금 막고 있는 것이니까", () => {
    const rows = buildTimeline({
      messages: [{ id: "u9999" }],
      ask: { command: "npm test", rationale: "", agent: "claude" },
    });
    expect(kinds(rows)).toEqual(["msg", "ask"]);
    expect(rows[rows.length - 1].k).toBe("ask");
  });

  it("승인이 없으면 ask 행도 없다", () => {
    expect(kinds(buildTimeline({ messages: [{ id: "u1" }], ask: null }))).toEqual(["msg"]);
  });

  it("대기 중인 제안은 상태와 무관하게 행이 나온다", () => {
    const rows = buildTimeline({ proposals: [{ id: "pp1" }, { id: "pp2" }] });
    expect(ids(rows)).toEqual(["pp1", "pp2"]);
  });
});

describe("정렬 안정성", () => {
  // 레거시 세션의 메시지는 번호가 없을 수 있다. 그때 원래 배열 순서가 뒤집히면
  // 사용자 눈엔 아무 이유 없이 대화가 재배열된 것으로 보인다.
  it("번호가 없는 것들끼리는 들어온 순서를 지킨다", () => {
    const rows = buildTimeline({ messages: [{ id: "old-a" }, { id: "old-b" }, { id: "old-c" }] });
    expect(ids(rows)).toEqual(["old-a", "old-b", "old-c"]);
  });

  it("번호 없는 것이 번호 있는 것보다 앞선다 (복원분이 이번 세션보다 먼저다)", () => {
    const rows = buildTimeline({ messages: [{ id: "legacy" }, { id: "u3" }] });
    expect(ids(rows)).toEqual(["legacy", "u3"]);
  });

  it("번호가 같으면 갈래 등록 순서(메시지 → 도구 → 제안)를 따른다", () => {
    const rows = buildTimeline({
      messages: [{ id: "u7" }], tools: [{ id: "rt7" }], proposals: [{ id: "pp7" }],
    });
    expect(ids(rows)).toEqual(["u7", "rt7", "pp7"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const messages = [{ id: "u2" }, { id: "u1" }];
    buildTimeline({ messages });
    expect(messages.map(m => m.id)).toEqual(["u2", "u1"]);
  });
});
