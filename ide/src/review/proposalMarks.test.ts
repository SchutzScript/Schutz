import { describe, it, expect } from "vitest";
import { posAt, offsetOf, locate, markTooltip } from "./proposalMarks";

const TEXT = "const a = 1;\nconst b = 2;\nconst c = 3;\n";

describe("posAt", () => {
  it("첫 글자는 1줄 1칸", () => {
    expect(posAt(TEXT, 0)).toEqual({ line: 1, column: 1 });
  });
  it("줄바꿈 다음은 다음 줄 첫 칸", () => {
    expect(posAt(TEXT, 13)).toEqual({ line: 2, column: 1 });
  });
  it("줄 가운데도 센다", () => {
    expect(posAt(TEXT, 19)).toEqual({ line: 2, column: 7 });
  });
  it("범위를 넘으면 끝으로 붙인다", () => {
    expect(posAt(TEXT, 9999).line).toBe(4);
    expect(posAt(TEXT, -5)).toEqual({ line: 1, column: 1 });
  });
});

describe("offsetOf", () => {
  it("posAt 의 역이다", () => {
    for (const off of [0, 5, 13, 19, 30]) {
      const p = posAt(TEXT, off);
      expect(offsetOf(TEXT, p.line, p.column)).toBe(off);
    }
  });
  it("없는 줄은 -1", () => {
    expect(offsetOf(TEXT, 99, 1)).toBe(-1);
    expect(offsetOf(TEXT, 0, 1)).toBe(-1);
    expect(offsetOf(TEXT, 1, 0)).toBe(-1);
  });
});

describe("locate", () => {
  it("유일한 조각을 찾는다", () => {
    expect(locate({ text: TEXT, find: "const b = 2;" })).toEqual({
      startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 13,
    });
  });

  it("여러 줄에 걸친 조각도 찾는다", () => {
    const m = locate({ text: TEXT, find: "const b = 2;\nconst c = 3;" });
    expect(m).toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 13 });
  });

  it("새 파일 생성은 첫 줄에 건다", () => {
    expect(locate({ text: "", find: "" })).toEqual({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });

  it("없으면 null — 없는 자리에 그리지 않는다", () => {
    expect(locate({ text: TEXT, find: "nope" })).toBeNull();
  });

  // 찍어서 그리면 엉뚱한 줄에 "여기가 바뀝니다" 가 붙는다.
  it("두 군데면 null", () => {
    expect(locate({ text: "x;\nx;\n", find: "x;" })).toBeNull();
  });

  it("범위를 주면 그쪽을 먼저 믿는다 — 같은 조각이 하나뿐이어도 범위가 이긴다", () => {
    const m = locate({
      text: TEXT, find: "const c = 3;",
      range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 13 },
    });
    expect(m).toEqual({ startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 13 });
  });

  it("범위가 낡았으면 무시하고 텍스트로 찾는다", () => {
    // 파일이 그 사이 바뀌어 3번 줄이 다른 코드가 된 상황
    const m = locate({
      text: TEXT, find: "const b = 2;",
      range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 13 },
    });
    expect(m).toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 13 });
  });

  it("범위가 낡았고 조각이 여러 군데면 null", () => {
    const m = locate({
      text: "x;\nx;\n", find: "x;",
      range: { startLineNumber: 9, startColumn: 1, endLineNumber: 9, endColumn: 3 },
    });
    expect(m).toBeNull();
  });

  it("범위가 파일 밖을 가리켜도 터지지 않는다", () => {
    expect(locate({ text: TEXT, find: "없는것", range: { startLineNumber: 999, startColumn: 999, endLineNumber: 999, endColumn: 999 } })).toBeNull();
  });
});

describe("markTooltip", () => {
  it("사유와 에이전트를 함께 낸다", () => {
    expect(markTooltip("null 체크가 없어 추가함", "claude")).toBe("**claude** — null 체크가 없어 추가함");
  });
  it("에이전트가 없으면 사유만", () => {
    expect(markTooltip("이유", "")).toBe("이유");
  });
  it("사유가 비면 툴팁을 달지 않는다", () => {
    expect(markTooltip("", "claude")).toBeNull();
    expect(markTooltip("   ", "claude")).toBeNull();
    expect(markTooltip(undefined as any, "claude")).toBeNull();
  });
});
