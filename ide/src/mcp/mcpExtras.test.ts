import { describe, it, expect } from "vitest";
import {
  extraToolDefs, isExtraTool, formatResourceList, formatResourceContents, formatPromptResult,
  checkResourceArgs, checkPromptArgs, missingPromptArgs,
  LIST_RESOURCES, READ_RESOURCE, GET_PROMPT,
} from "./mcpExtras";

const RES = [
  { server: "docs", uri: "doc://a", name: "가이드", description: "설명", mimeType: "text/markdown" },
  { server: "docs", uri: "doc://b" },
  { server: "db", uri: "db://schema" },
];
const PR = [
  { server: "docs", name: "summarize", description: "요약", arguments: [{ name: "topic", required: true }, { name: "tone" }] },
];

describe("extraToolDefs", () => {
  it("줄 것이 없으면 도구를 안 만든다 — 못 쓰는 도구가 매 턴 설명만 먹는다", () => {
    expect(extraToolDefs([], [])).toEqual([]);
  });

  it("리소스가 있으면 목록·읽기 둘", () => {
    const d = extraToolDefs(RES, []);
    expect(d.map(x => x.name)).toEqual([LIST_RESOURCES, READ_RESOURCE]);
  });

  it("프롬프트만 있으면 프롬프트 도구만", () => {
    expect(extraToolDefs([], PR).map(x => x.name)).toEqual([GET_PROMPT]);
  });

  it("리소스 도구 설명에 개수와 서버가 실린다", () => {
    const d = extraToolDefs(RES, [])[0]!;
    expect(d.description).toContain("3");
    expect(d.description).toContain("docs");
    expect(d.description).toContain("db");
  });

  it("프롬프트 이름은 설명에 그대로 적는다 — 목록 조회 한 번을 아낀다", () => {
    expect(extraToolDefs([], PR)[0]!.description).toContain("docs/summarize");
  });

  it("읽기 도구는 server·uri 를 요구한다", () => {
    const d = extraToolDefs(RES, []).find(x => x.name === READ_RESOURCE)!;
    expect(d.input_schema.required).toEqual(["server", "uri"]);
  });
});

describe("isExtraTool", () => {
  it("우리 도구만 참", () => {
    expect(isExtraTool(READ_RESOURCE)).toBe(true);
    expect(isExtraTool("mcp__docs__search")).toBe(false);
    expect(isExtraTool("read_file")).toBe(false);
  });
});

describe("formatResourceList", () => {
  it("서버와 uri 를 함께 적는다 — 읽기에 둘 다 필요하다", () => {
    const s = formatResourceList(RES);
    expect(s).toContain("docs  doc://a");
    expect(s).toContain("db  db://schema");
  });

  it("이름·설명·mime 이 있으면 곁들인다", () => {
    expect(formatResourceList([RES[0]!])).toContain("(가이드 — 설명)");
    expect(formatResourceList([RES[0]!])).toContain("[text/markdown]");
  });

  it("서버로 거른다", () => {
    expect(formatResourceList(RES, "db")).toBe("db  db://schema");
  });

  it("이름이 틀린 서버는 무엇이 있는지 알려 준다 — '없다' 와 '오타' 는 다르다", () => {
    expect(formatResourceList(RES, "없는서버")).toContain("docs");
  });

  it("정말 하나도 없으면 그렇게 말한다", () => {
    expect(formatResourceList([])).toContain("No MCP server");
  });
});

describe("formatResourceContents", () => {
  it("텍스트를 이어 붙인다", () => {
    expect(formatResourceContents({ contents: [{ text: "가" }, { text: "나" }] })).toBe("가\n나");
  });

  it("바이너리는 통째로 싣지 않는다 — 대화창을 먹는다", () => {
    const s = formatResourceContents({ contents: [{ blob: "AAAA", mimeType: "image/png" }] });
    expect(s).toContain("image/png");
    expect(s).toContain("not inlined");
    expect(s).not.toContain("AAAA");
  });

  it("빈 응답도 말이 되게", () => {
    expect(formatResourceContents({})).toBe("(empty resource)");
    expect(formatResourceContents({ contents: [] })).toBe("(empty resource)");
  });
});

describe("formatPromptResult", () => {
  it("역할과 함께 편다", () => {
    const s = formatPromptResult({ messages: [{ role: "user", content: { text: "안녕" } }] });
    expect(s).toBe("[user] 안녕");
  });

  it("설명이 있으면 머리에 붙인다", () => {
    expect(formatPromptResult({ description: "요약기", messages: [{ role: "user", content: "x" }] })).toContain("요약기");
  });

  it("content 가 배열이어도 읽는다", () => {
    expect(formatPromptResult({ messages: [{ role: "assistant", content: [{ text: "가" }, { text: "나" }] }] })).toContain("가\n나");
  });

  it("역할이 없으면 user 로 본다", () => {
    expect(formatPromptResult({ messages: [{ content: "x" }] })).toContain("[user]");
  });

  it("메시지가 없으면 그렇게 말한다", () => {
    expect(formatPromptResult({})).toBe("(empty prompt)");
  });
});

describe("checkResourceArgs", () => {
  it("맞으면 null", () => expect(checkResourceArgs(RES, "docs", "doc://a")).toBeNull());
  it("빠지면 알려 준다", () => expect(checkResourceArgs(RES, "", "doc://a")).toContain("required"));
  it("모르는 서버면 있는 것을 알려 준다", () => {
    expect(checkResourceArgs(RES, "없음", "x")).toContain("docs");
  });
  it("모르는 uri 면 그 서버의 것을 알려 준다 — 조용한 빈 결과는 '없다' 로 읽힌다", () => {
    const m = checkResourceArgs(RES, "docs", "doc://없음")!;
    expect(m).toContain("doc://a");
    expect(m).toContain("doc://b");
  });
});

describe("checkPromptArgs / missingPromptArgs", () => {
  it("맞으면 null", () => expect(checkPromptArgs(PR, "docs", "summarize")).toBeNull());
  it("모르는 프롬프트면 있는 것을 알려 준다", () => {
    expect(checkPromptArgs(PR, "docs", "없음")).toContain("summarize");
  });
  it("필수 인자가 빠진 것을 서버에 보내기 전에 잡는다", () => {
    expect(missingPromptArgs(PR, "docs", "summarize", {})).toEqual(["topic"]);
    expect(missingPromptArgs(PR, "docs", "summarize", { topic: "x" })).toEqual([]);
  });
  it("선택 인자는 안 따진다", () => {
    expect(missingPromptArgs(PR, "docs", "summarize", { topic: "x" })).not.toContain("tone");
  });
  it("모르는 프롬프트면 빈 목록 — 그 오류는 checkPromptArgs 가 낸다", () => {
    expect(missingPromptArgs(PR, "docs", "없음", {})).toEqual([]);
  });
});
