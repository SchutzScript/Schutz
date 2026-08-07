import { describe, it, expect } from "vitest";
import { chatUrlFrom, modelsUrlFrom } from "./provider";

// 사람이 적는 것은 보통 "http://localhost:11434" 까지다. 나머지를 우리가 채운다.
describe("chatUrlFrom", () => {
  it("호스트만 주면 /v1/chat/completions 를 붙인다", () => {
    expect(chatUrlFrom("http://localhost:11434")).toBe("http://localhost:11434/v1/chat/completions");
  });
  it("끝의 슬래시를 정리한다", () => {
    expect(chatUrlFrom("http://localhost:1234/")).toBe("http://localhost:1234/v1/chat/completions");
    expect(chatUrlFrom("http://localhost:1234///")).toBe("http://localhost:1234/v1/chat/completions");
  });
  it("버전까지 적었으면 그 뒤만 붙인다", () => {
    expect(chatUrlFrom("http://localhost:1234/v1")).toBe("http://localhost:1234/v1/chat/completions");
    expect(chatUrlFrom("https://api.example.com/v1beta")).toBe("https://api.example.com/v1beta/chat/completions");
  });
  it("이미 완성된 주소는 그대로 둔다", () => {
    const full = "http://localhost:11434/v1/chat/completions";
    expect(chatUrlFrom(full)).toBe(full);
  });
  it("경로가 있는 프록시 주소도 받는다", () => {
    expect(chatUrlFrom("https://proxy.corp/llm")).toBe("https://proxy.corp/llm/v1/chat/completions");
  });
  it("빈 값은 빈 값이다 — 기본 주소로 떨어지라는 뜻", () => {
    expect(chatUrlFrom("")).toBe("");
    expect(chatUrlFrom("   ")).toBe("");
    expect(chatUrlFrom(undefined as any)).toBe("");
  });
});

describe("modelsUrlFrom", () => {
  it("같은 자리의 모델 목록 주소를 만든다", () => {
    expect(modelsUrlFrom("http://localhost:11434/v1/chat/completions")).toBe("http://localhost:11434/v1/models");
  });
  it("버전 경로가 달라도 따라간다", () => {
    expect(modelsUrlFrom("https://api.example.com/v1beta/chat/completions")).toBe("https://api.example.com/v1beta/models");
  });
});
