import { describe, it, expect } from "vitest";
import { missingFor, shouldTell, hintText, missingList, type ServerRow } from "./lspHint";

const CAT: ServerRow[] = [
  { languageId: "python", command: "pyright", install: "번들됨", available: true },
  { languageId: "go", command: "gopls", install: "go install golang.org/x/tools/gopls@latest", available: false },
  { languageId: "rust", command: "rust-analyzer", install: "rustup component add rust-analyzer", available: false },
  { languageId: "c", command: "clangd", install: "LLVM 설치(clangd 포함)", available: true },
];

describe("missingFor", () => {
  it("서버가 없는 언어를 짚는다", () => {
    expect(missingFor(CAT, "go")?.command).toBe("gopls");
  });
  it("있는 언어는 알릴 것이 없다", () => {
    expect(missingFor(CAT, "python")).toBeNull();
    expect(missingFor(CAT, "c")).toBeNull();
  });
  // TypeScript 는 Monaco 워커가 맡으므로 이 목록에 없다 — 없다고 말하면 거짓말이다.
  it("모르는 언어는 알리지 않는다", () => {
    expect(missingFor(CAT, "typescript")).toBeNull();
    expect(missingFor(CAT, "plaintext")).toBeNull();
    expect(missingFor(CAT, "")).toBeNull();
  });
  it("빈 카탈로그에도 터지지 않는다", () => {
    expect(missingFor([], "go")).toBeNull();
  });
});

describe("shouldTell", () => {
  it("처음이면 말한다", () => {
    expect(shouldTell(new Set(), "go")).toBe(true);
  });
  it("이미 말한 언어는 다시 말하지 않는다", () => {
    expect(shouldTell(new Set(["go"]), "go")).toBe(false);
  });
  it("언어별로 따로 센다", () => {
    expect(shouldTell(new Set(["go"]), "rust")).toBe(true);
  });
});

describe("hintText", () => {
  it("무엇이 없고 무엇을 깔면 되는지 둘 다 말한다", () => {
    const s = hintText(CAT[1]!);
    expect(s).toContain("gopls");
    expect(s).toContain("go install");
  });
});

describe("missingList", () => {
  it("없는 것만 이름순으로 낸다", () => {
    expect(missingList(CAT).map(r => r.languageId)).toEqual(["go", "rust"]);
  });
  it("원본을 건드리지 않는다", () => {
    const before = CAT.map(r => r.languageId);
    missingList(CAT);
    expect(CAT.map(r => r.languageId)).toEqual(before);
  });
  it("다 깔려 있으면 빈 목록", () => {
    expect(missingList(CAT.map(r => ({ ...r, available: true })))).toEqual([]);
  });
});
