import { describe, it, expect } from "vitest";
import { stripJsonc, parseJsonc } from "./jsonc";

describe("parseJsonc — 경로 별칭 (이 모듈이 존재하는 이유)", () => {
  // 정규식 판이 여기서 무너졌다. `"@/*"` 의 `/*` 를 주석 시작으로 보고 그 다음 `*/`
  // 까지 — 즉 파일 절반을 — 지워 버렸다. 별칭이 있는 프로젝트에서만 조용히 실패했다.
  it("별칭 글롭의 /* 를 주석으로 보지 않는다", () => {
    const src = `{
      // 프로젝트 설정
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@/*": ["src/*"] },  /* 별칭 */
      }
    }`;
    expect(parseJsonc(src)?.compilerOptions?.paths).toEqual({ "@/*": ["src/*"] });
  });

  it("별칭이 여럿이어도", () => {
    const src = `{"compilerOptions":{"paths":{"@/*":["src/*"],"~/*":["./lib/*"],"#c":["c.ts"]}}}`;
    expect(parseJsonc(src).compilerOptions.paths["~/*"]).toEqual(["./lib/*"]);
  });

  it("문자열 안의 // 도 살아남는다 — URL 이 흔하다", () => {
    const src = `{ "url": "https://example.com/a", "n": 1 }`;
    expect(parseJsonc(src)).toEqual({ url: "https://example.com/a", n: 1 });
  });
});

describe("stripJsonc — 주석", () => {
  it("줄 주석을 지운다", () => {
    expect(parseJsonc(`{ "a": 1 // 설명\n, "b": 2 }`)).toEqual({ a: 1, b: 2 });
  });
  it("블록 주석을 지운다", () => {
    expect(parseJsonc(`{ /* 앞 */ "a": /* 사이 */ 1 }`)).toEqual({ a: 1 });
  });
  it("여러 줄에 걸친 블록 주석", () => {
    expect(parseJsonc(`{\n/*\n여러\n줄\n*/\n"a": 1 }`)).toEqual({ a: 1 });
  });
  it("줄 주석이 줄바꿈을 안 먹는다 — 먹으면 다음 줄이 붙는다", () => {
    expect(parseJsonc(`{ "a": 1, // 하나\n"b": 2 }`)).toEqual({ a: 1, b: 2 });
  });
  it("주석 자리에 공백을 남겨 토큰이 안 붙는다", () => {
    expect(stripJsonc(`1/*x*/2`).replace(/\s+/g, "|")).toBe("1|2");
  });
});

describe("stripJsonc — 뒤따르는 쉼표", () => {
  it("객체", () => expect(parseJsonc(`{ "a": 1, }`)).toEqual({ a: 1 }));
  it("배열", () => expect(parseJsonc(`{ "a": [1, 2, ] }`)).toEqual({ a: [1, 2] }));
  it("중첩", () => expect(parseJsonc(`{ "a": { "b": [1,], }, }`)).toEqual({ a: { b: [1] } }));
  it("문자열 안의 쉼표는 안 건드린다", () => {
    expect(parseJsonc(`{ "a": "x, }" }`)).toEqual({ a: "x, }" });
  });
});

describe("stripJsonc — 이스케이프", () => {
  it("이스케이프된 따옴표가 문자열을 안 끝낸다", () => {
    expect(parseJsonc(`{ "a": "그는 \\"안녕\\" 이라 했다 // 아님" }`))
      .toEqual({ a: '그는 "안녕" 이라 했다 // 아님' });
  });
  it("역슬래시로 끝나는 문자열 — 윈도 경로", () => {
    expect(parseJsonc(`{ "p": "C:\\\\a\\\\b" }`)).toEqual({ p: "C:\\a\\b" });
  });
});

describe("parseJsonc — 못 읽으면 null", () => {
  it("망가진 JSON", () => expect(parseJsonc(`{ "a": }`)).toBeNull());
  it("빈 문자열", () => expect(parseJsonc("")).toBeNull());
  it("닫히지 않은 블록 주석도 죽지 않는다", () => expect(parseJsonc(`{ "a": 1 /* 안 닫힘`)).toBeNull());
});
