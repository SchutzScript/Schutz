import { describe, it, expect } from "vitest";
import { markerSeverity, toMonacoRange, toMarker, toMarkers, toLocations, toEdits, M_HINT, M_INFO, M_WARN, M_ERROR } from "./shimLang";

describe("markerSeverity", () => {
  it("vscode 는 Error 가 0 이다 — LSP 표(Error=1)를 쓰면 한 칸씩 밀린다", () => {
    expect(markerSeverity(0)).toBe(M_ERROR);
    expect(markerSeverity(1)).toBe(M_WARN);
    expect(markerSeverity(2)).toBe(M_INFO);
    expect(markerSeverity(3)).toBe(M_HINT);
  });

  it("안 준 경우는 오류로 본다 — 힌트로 낮추면 문제 패널에서 사라진다", () => {
    expect(markerSeverity(undefined)).toBe(M_ERROR);
    expect(markerSeverity(null)).toBe(M_ERROR);
    expect(markerSeverity("error")).toBe(M_ERROR);
  });
});

describe("toMonacoRange", () => {
  it("0-기반을 1-기반으로 옮긴다", () => {
    expect(toMonacoRange({ start: { line: 0, character: 0 }, end: { line: 2, character: 5 } }))
      .toEqual({ startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 6 });
  });

  it("배열 꼴 [start, end] 도 받는다", () => {
    expect(toMonacoRange([{ line: 1, character: 2 }, { line: 1, character: 4 }]))
      .toEqual({ startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 5 });
  });

  it("끝이 없으면 시작과 같은 자리 — 한 점을 가리키는 흔한 꼴이다", () => {
    expect(toMonacoRange({ start: { line: 3, character: 7 } }))
      .toEqual({ startLineNumber: 4, startColumn: 8, endLineNumber: 4, endColumn: 8 });
  });

  it("거꾸로 들어온 범위는 뒤집는다 — 그대로 두면 아무것도 안 그려진다", () => {
    expect(toMonacoRange({ start: { line: 5, character: 2 }, end: { line: 1, character: 0 } }))
      .toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 6, endColumn: 3 });
  });

  it("빠지거나 이상한 값은 문서 첫 자리로 떨어진다", () => {
    expect(toMonacoRange(undefined)).toEqual({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    expect(toMonacoRange({ start: { line: NaN, character: "x" } }).startLineNumber).toBe(1);
  });
});

describe("toMarker", () => {
  const d = { range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } }, message: "쓰지 않는 변수", severity: 1, source: "eslint", code: "no-unused-vars" };

  it("진단 하나를 마커로 옮긴다", () => {
    expect(toMarker(d)).toEqual({
      startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 10,
      severity: M_WARN, message: "쓰지 않는 변수", code: "no-unused-vars", source: "eslint",
    });
  });

  it("code 가 { value, target } 객체여도 읽는다", () => {
    expect(toMarker({ ...d, code: { value: "E123", target: "https://x" } }).code).toBe("E123");
  });

  it("code·source 가 없으면 키 자체를 넣지 않는다", () => {
    const m = toMarker({ range: d.range, message: "m", severity: 0 });
    expect("code" in m).toBe(false);
    expect("source" in m).toBe(false);
  });

  it("메시지가 없어도 빈 문자열로 살아남는다 — 마커를 통째로 버리지 않는다", () => {
    expect(toMarker({ range: d.range, severity: 0 }).message).toBe("");
  });
});

describe("toMarkers", () => {
  it("배열이 아니면 빈 목록", () => {
    expect(toMarkers(null)).toEqual([]);
    expect(toMarkers({ message: "x" })).toEqual([]);
  });
  it("빈 항목은 걸러낸다", () => {
    expect(toMarkers([null, { range: { start: { line: 0, character: 0 } }, message: "a", severity: 0 }])).toHaveLength(1);
  });
});

describe("toLocations", () => {
  const R = { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } };

  it("Location 하나를 받는다", () => {
    expect(toLocations({ uri: "u", range: R })).toEqual([{ uri: "u", range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4 } }]);
  });

  it("Location 배열을 받는다", () => {
    expect(toLocations([{ uri: "a", range: R }, { uri: "b", range: R }]).map(l => l.uri)).toEqual(["a", "b"]);
  });

  it("LocationLink 의 targetUri/targetRange 도 읽는다 — 이 이름을 안 보면 링크 꼴만 조용히 실패한다", () => {
    expect(toLocations([{ targetUri: "t", targetRange: R }])).toEqual([{ uri: "t", range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4 } }]);
  });

  it("targetSelectionRange 가 있으면 그쪽이 더 좁으므로 우선한다", () => {
    const sel = { start: { line: 2, character: 1 }, end: { line: 2, character: 2 } };
    expect(toLocations([{ targetUri: "t", targetRange: R, targetSelectionRange: sel }])[0]!.range.startColumn).toBe(2);
  });

  it("uri 나 range 가 빠진 항목은 버린다", () => {
    expect(toLocations([{ uri: "a" }, { range: R }, null, undefined])).toEqual([]);
  });

  it("결과가 없으면 빈 목록", () => {
    expect(toLocations(null)).toEqual([]);
    expect(toLocations([])).toEqual([]);
  });
});

describe("toEdits", () => {
  it("TextEdit 를 옮긴다", () => {
    expect(toEdits([{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } }, newText: "ab" }]))
      .toEqual([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 }, text: "ab" }]);
  });

  it("newText 가 없으면 빈 문자열 — 삭제로 본다", () => {
    expect(toEdits([{ range: { start: { line: 0, character: 0 } } }])[0]!.text).toBe("");
  });

  it("range 없는 항목은 버린다", () => {
    expect(toEdits([{ newText: "x" }])).toEqual([]);
  });

  it("배열이 아니면 빈 목록", () => {
    expect(toEdits(undefined)).toEqual([]);
  });
});
