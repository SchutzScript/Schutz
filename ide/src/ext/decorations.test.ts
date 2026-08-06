import { describe, it, expect } from "vitest";
import {
  cssColor, cssDecls, pseudoDecls, classNames, styleSheetFor,
  monacoOptions, drawsNothing, normalizeDecos, hoverText,
} from "./decorations";

describe("cssColor", () => {
  it("문자열 색은 그대로 쓴다", () => {
    expect(cssColor("#8FA893")).toBe("#8FA893");
    expect(cssColor("  rgba(0,0,0,.2) ")).toBe("rgba(0,0,0,.2)");
  });
  it("ThemeColor 는 우리 토큰과 대응이 없어 버린다", () => {
    expect(cssColor({ id: "editor.background" })).toBeNull();
  });
  it("빈 값은 색이 아니다", () => {
    expect(cssColor("")).toBeNull();
    expect(cssColor(undefined)).toBeNull();
    expect(cssColor(null)).toBeNull();
  });
});

describe("cssDecls", () => {
  it("알아듣는 속성을 CSS 선언으로 옮긴다", () => {
    const d = cssDecls({ backgroundColor: "#222", color: "red", fontWeight: "bold" });
    expect(d).toContain("background:#222");
    expect(d).toContain("color:red");
    expect(d).toContain("font-weight:bold");
  });
  it("모르는 속성은 조용히 넘긴다", () => {
    expect(cssDecls({ someFutureThing: "x" })).toEqual([]);
  });
  it("ThemeColor 로 온 색은 그 속성만 빠지고 나머지는 남는다", () => {
    const d = cssDecls({ backgroundColor: { id: "editor.bg" }, color: "red" });
    expect(d).toEqual(["color:red"]);
  });
  it("빈 옵션에도 터지지 않는다", () => {
    expect(cssDecls(undefined)).toEqual([]);
    expect(cssDecls(null)).toEqual([]);
  });
});

describe("pseudoDecls", () => {
  it("contentText 가 있어야 만든다", () => {
    expect(pseudoDecls({ color: "red" })).toBeNull();
    expect(pseudoDecls({ contentText: "" })).toBeNull();
    expect(pseudoDecls(undefined)).toBeNull();
  });
  it("글자와 스타일을 함께 낸다", () => {
    const d = pseudoDecls({ contentText: " 3 refs", color: "#888", margin: "0 0 0 1em" });
    expect(d).toContain('content:" 3 refs"');
    expect(d).toContain("color:#888");
    expect(d).toContain("margin:0 0 0 1em");
  });
  // 확장이 준 문자열이 규칙 밖으로 새어 나가면 스타일시트 전체가 깨진다.
  it("따옴표와 역슬래시를 막는다", () => {
    const d = pseudoDecls({ contentText: 'a"b\\c' });
    expect(d![0]).toBe('content:"a\\"b\\\\c"');
  });
  it("줄바꿈은 한 줄로 눕힌다", () => {
    expect(pseudoDecls({ contentText: "a\nb" })![0]).toBe('content:"a b"');
  });
});

describe("styleSheetFor", () => {
  it("본문과 앞뒤를 각각 규칙으로 낸다", () => {
    const css = styleSheetFor("7", { backgroundColor: "#111", after: { contentText: "x" } });
    expect(css).toContain(".szdeco-7{background:#111}");
    expect(css).toContain('.szdeco-7-a::after{content:"x"}');
  });
  it("그릴 것이 없으면 빈 문자열", () => {
    expect(styleSheetFor("7", {})).toBe("");
    expect(styleSheetFor("7", { isWholeLine: true })).toBe("");
  });
  it("클래스 이름은 id 로 갈린다", () => {
    expect(classNames("1").base).not.toBe(classNames("2").base);
  });
});

describe("monacoOptions", () => {
  it("글자 범위는 inlineClassName 으로 간다", () => {
    const o = monacoOptions("1", { backgroundColor: "#111" });
    expect(o.inlineClassName).toBe("szdeco-1");
    expect(o.className).toBeUndefined();
  });
  it("줄 전체는 className 과 isWholeLine 으로 간다", () => {
    const o = monacoOptions("1", { backgroundColor: "#111", isWholeLine: true });
    expect(o.className).toBe("szdeco-1");
    expect(o.inlineClassName).toBeUndefined();
    expect(o.isWholeLine).toBe(true);
  });
  it("스타일이 없어도 앞뒤 글자만으로 그린다", () => {
    const o = monacoOptions("1", { after: { contentText: "→" } });
    expect(o.afterContentClassName).toBe("szdeco-1-a");
    expect(o.inlineClassName).toBeUndefined();
  });
  it("개요 눈금 색을 옮긴다", () => {
    expect(monacoOptions("1", { overviewRulerColor: "#C97B7B" }).overviewRuler).toEqual({ color: "#C97B7B", position: 1 });
  });
  it("ThemeColor 눈금은 대응이 없어 빠진다", () => {
    expect(monacoOptions("1", { overviewRulerColor: { id: "x" } }).overviewRuler).toBeUndefined();
  });
});

describe("drawsNothing", () => {
  it("빈 옵션은 아무것도 안 그린다", () => {
    expect(drawsNothing({})).toBe(true);
    expect(drawsNothing({ isWholeLine: true })).toBe(true);
  });
  it("무엇이든 하나 있으면 그린다", () => {
    expect(drawsNothing({ backgroundColor: "#111" })).toBe(false);
    expect(drawsNothing({ before: { contentText: "•" } })).toBe(false);
    expect(drawsNothing({ overviewRulerColor: "red" })).toBe(false);
  });
});

describe("normalizeDecos", () => {
  const R = (l: number, c: number, l2: number, c2: number) => ({ start: { line: l, character: c }, end: { line: l2, character: c2 } });

  it("Range 배열을 받는다", () => {
    expect(normalizeDecos([R(0, 0, 0, 4)])).toEqual([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 } }]);
  });
  it("DecorationOptions 배열도 받는다", () => {
    const out = normalizeDecos([{ range: R(2, 1, 2, 3), hoverMessage: "왜" }]);
    expect(out).toEqual([{ range: { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 4 }, hover: "왜" }]);
  });
  it("배열이 아니면 빈 목록", () => {
    expect(normalizeDecos(undefined)).toEqual([]);
    expect(normalizeDecos(null)).toEqual([]);
    expect(normalizeDecos("nope")).toEqual([]);
  });
  it("빈 칸은 건너뛴다", () => {
    expect(normalizeDecos([null, undefined, {}])).toEqual([]);
  });
  it("빈 배열은 '전부 지우기' 다 — 빈 목록으로 그대로 전한다", () => {
    expect(normalizeDecos([])).toEqual([]);
  });
});

describe("hoverText", () => {
  it("문자열·MarkdownString·배열을 모두 받는다", () => {
    expect(hoverText("a")).toBe("a");
    expect(hoverText({ value: "**b**" })).toBe("**b**");
    expect(hoverText(["a", { value: "b" }])).toBe("a\n\nb");
  });
  it("비어 있으면 없는 것으로 친다", () => {
    expect(hoverText("")).toBeUndefined();
    expect(hoverText({ value: "" })).toBeUndefined();
    expect(hoverText([])).toBeUndefined();
    expect(hoverText(undefined)).toBeUndefined();
  });
});
