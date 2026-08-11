import { describe, it, expect } from "vitest";
import { parseCustomEditors, matchesPattern, editorFor, type CustomEditorDecl } from "./customEditors";

describe("parseCustomEditors", () => {
  it("viewType 과 파일 패턴을 읽는다", () => {
    const r = parseCustomEditors({
      customEditors: [{ viewType: "my.editor", selector: [{ filenamePattern: "*.draw" }] }],
    }, "pub.ext");
    expect(r).toEqual([{ viewType: "my.editor", extId: "pub.ext", patterns: ["*.draw"], optional: false }]);
  });

  it("selector 가 여럿이면 다 읽는다", () => {
    const r = parseCustomEditors({
      customEditors: [{ viewType: "v", selector: [{ filenamePattern: "*.a" }, { filenamePattern: "*.b" }] }],
    }, "e");
    expect(r[0]!.patterns).toEqual(["*.a", "*.b"]);
  });

  it("priority: option 은 자동으로 열지 않는 것으로 표시한다", () => {
    const r = parseCustomEditors({
      customEditors: [{ viewType: "v", selector: [{ filenamePattern: "*.a" }], priority: "option" }],
    }, "e");
    expect(r[0]!.optional).toBe(true);
  });

  // 선언이 깨졌다고 확장 전체가 죽으면 안 된다 — 그 항목만 버린다.
  it("모양이 어긋난 항목은 버리고 나머지는 살린다", () => {
    const r = parseCustomEditors({
      customEditors: [
        { viewType: "", selector: [{ filenamePattern: "*.a" }] },
        { viewType: "ok", selector: [] },
        { viewType: "good", selector: [{ filenamePattern: "*.c" }] },
      ],
    }, "e");
    expect(r.map(d => d.viewType)).toEqual(["good"]);
  });

  it("customEditors 가 없거나 이상하면 빈 목록", () => {
    expect(parseCustomEditors(undefined, "e")).toEqual([]);
    expect(parseCustomEditors({}, "e")).toEqual([]);
    expect(parseCustomEditors({ customEditors: "무엇" }, "e")).toEqual([]);
  });

  it("객체 하나만 준 경우도 받는다", () => {
    const r = parseCustomEditors({ customEditors: { viewType: "v", selector: { filenamePattern: "*.a" } } }, "e");
    expect(r).toHaveLength(1);
  });
});

describe("matchesPattern", () => {
  it("확장자 패턴", () => {
    expect(matchesPattern("a.draw", "*.draw")).toBe(true);
    expect(matchesPattern("deep/dir/a.draw", "*.draw")).toBe(true);
    expect(matchesPattern("a.txt", "*.draw")).toBe(false);
  });
  it("경로가 붙은 패턴", () => {
    expect(matchesPattern("src/a.draw", "src/*.draw")).toBe(true);
    expect(matchesPattern("src/deep/a.draw", "src/*.draw")).toBe(false);
    expect(matchesPattern("src/deep/a.draw", "src/**/*.draw")).toBe(true);
  });
  it("대소문자를 가리지 않는다", () => {
    expect(matchesPattern("A.DRAW", "*.draw")).toBe(true);
  });
  it("역슬래시 경로도 받는다", () => {
    expect(matchesPattern("src\\a.draw", "src/*.draw")).toBe(true);
  });
  it("깨진 패턴에 터지지 않는다", () => {
    expect(matchesPattern("a.draw", "")).toBe(false);
    expect(matchesPattern("", "*.draw")).toBe(false);
  });
});

describe("editorFor", () => {
  const decl = (viewType: string, patterns: string[], optional = false): CustomEditorDecl =>
    ({ viewType, extId: "e", patterns, optional });

  it("선언과 구현이 둘 다 있으면 고른다", () => {
    expect(editorFor("a.draw", [decl("v", ["*.draw"])], new Set(["v"]))?.viewType).toBe("v");
  });

  // 선언만 있고 확장이 아직 안 떴으면 텍스트로 열려야 한다 — 빈 화면보다 낫다.
  it("구현이 등록되지 않았으면 안 고른다", () => {
    expect(editorFor("a.draw", [decl("v", ["*.draw"])], new Set())).toBeNull();
  });

  it("패턴이 안 맞으면 안 고른다", () => {
    expect(editorFor("a.txt", [decl("v", ["*.draw"])], new Set(["v"]))).toBeNull();
  });

  it("option 인 것은 자동으로 열지 않는다", () => {
    expect(editorFor("a.draw", [decl("v", ["*.draw"], true)], new Set(["v"]))).toBeNull();
  });

  it("여럿이면 먼저 선언된 것", () => {
    const decls = [decl("first", ["*.draw"]), decl("second", ["*.draw"])];
    expect(editorFor("a.draw", decls, new Set(["first", "second"]))?.viewType).toBe("first");
  });

  it("등록된 것만 있으면 그것을 고른다", () => {
    const decls = [decl("first", ["*.draw"]), decl("second", ["*.draw"])];
    expect(editorFor("a.draw", decls, new Set(["second"]))?.viewType).toBe("second");
  });

  it("아무것도 없으면 null", () => {
    expect(editorFor("a.draw", [], new Set())).toBeNull();
  });
});
