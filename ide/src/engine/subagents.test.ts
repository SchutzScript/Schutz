import { describe, it, expect } from "vitest";
import {
  targetIdOf, isSubagentTarget, findSubagent, providerFor, filterTools,
  rosterLines, personaSystem, SUB_PREFIX, type SubagentDef,
} from "./subagents";

const A = (o: Partial<SubagentDef> = {}): SubagentDef => ({
  id: "reviewer", name: "reviewer", description: "코드를 본다", tools: [], model: "",
  prompt: "꼼꼼히 보라.", source: "plugin", owner: "myplugin", ...o,
});

describe("대상 id", () => {
  it("프로바이더 id 와 겹치지 않게 접두어를 붙인다", () => {
    expect(targetIdOf(A({ id: "gpt" }))).toBe("@gpt");
    expect(isSubagentTarget("@gpt")).toBe(true);
    expect(isSubagentTarget("gpt")).toBe(false);
  });
  it("접두어로 찾는다", () => {
    const list = [A({ id: "a" }), A({ id: "myplugin:b" })];
    expect(findSubagent(list, "@myplugin:b")?.id).toBe("myplugin:b");
    expect(findSubagent(list, "@없음")).toBeNull();
    expect(findSubagent(list, "a")).toBeNull();   // 접두어 없으면 프로바이더다
  });
  it("접두어는 한 글자", () => expect(SUB_PREFIX).toBe("@"));
});

describe("providerFor — 어떤 모델로 태울까", () => {
  const conf = ["claude", "gpt"];
  it("Claude Code 관례의 별칭을 옮긴다", () => {
    expect(providerFor(A({ model: "sonnet" }), conf, "gpt")).toBe("claude");
    expect(providerFor(A({ model: "opus" }), conf, "gpt")).toBe("claude");
    expect(providerFor(A({ model: "OpenAI" }), conf, "claude")).toBe("gpt");
  });
  it("우리 프로바이더 id 를 그대로 써도 된다", () => {
    expect(providerFor(A({ model: "grok" }), ["claude", "grok"], "claude")).toBe("grok");
  });
  it("원하는 모델이 연결 안 돼 있으면 부른 쪽을 따른다 — 안 쓴 모델로 요금이 나가면 안 된다", () => {
    expect(providerFor(A({ model: "grok" }), conf, "gpt")).toBe("gpt");
  });
  it("model 이 비면 부른 쪽을 따른다", () => {
    expect(providerFor(A({ model: "" }), conf, "gpt")).toBe("gpt");
  });
  it("부른 쪽마저 연결이 없으면 연결된 첫 번째", () => {
    expect(providerFor(A({ model: "" }), conf, "grok")).toBe("claude");
  });
  it("연결된 게 하나도 없으면 null — 위임 자체가 성립하지 않는다", () => {
    expect(providerFor(A(), [], "claude")).toBeNull();
  });
});

describe("filterTools", () => {
  const all = [{ name: "read_file" }, { name: "propose_edit" }, { name: "run_command" }];
  it("비어 있으면 전부 준다", () => {
    expect(filterTools(all, [])).toEqual({ tools: all, applied: false });
  });
  it("고른 것만 준다", () => {
    const r = filterTools(all, ["read_file", "propose_edit"]);
    expect(r.tools.map(t => t.name)).toEqual(["read_file", "propose_edit"]);
    expect(r.applied).toBe(true);
  });
  it("공백을 다듬는다", () => {
    expect(filterTools(all, [" run_command "]).tools.map(t => t.name)).toEqual(["run_command"]);
  });
  it("하나도 안 맞으면 제한을 접는다 — 도구 0개로 도는 에이전트는 아무 일도 못 한다", () => {
    const r = filterTools(all, ["없는도구", "또없음"]);
    expect(r.tools).toHaveLength(3);
    expect(r.applied).toBe(false);
  });
  it("원본을 바꾸지 않는다", () => {
    filterTools(all, ["read_file"]);
    expect(all).toHaveLength(3);
  });
});

describe("rosterLines", () => {
  it("어디서 왔는지와 설명을 함께", () => {
    expect(rosterLines([A()])).toEqual(["@reviewer (myplugin) — 코드를 본다"]);
  });
  it("프로젝트 것은 그렇게 표시", () => {
    expect(rosterLines([A({ source: "project", owner: null })])[0]).toContain("(프로젝트)");
  });
  it("설명이 없으면 이름만", () => {
    expect(rosterLines([A({ description: "", owner: null, source: "user" })])).toEqual(["@reviewer"]);
  });
});

describe("personaSystem", () => {
  it("누구인지 밝히고 지침을 잇는다", () => {
    const s = personaSystem(A());
    expect(s).toContain('"reviewer"');
    expect(s).toContain("코드를 본다");
    expect(s).toContain("꼼꼼히 보라.");
  });
  it("본문이 없어도 이름은 밝힌다", () => {
    expect(personaSystem(A({ prompt: "   " }))).toContain('"reviewer"');
  });
});
