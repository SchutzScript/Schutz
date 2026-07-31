import { describe, it, expect } from "vitest";
import { applyProposal, offsetOf } from "./editApply";

const R = (sl: number, sc: number, el: number, ec: number) =>
  ({ startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec });

describe("offsetOf", () => {
  it("LF 텍스트의 줄/열을 오프셋으로 옮긴다", () => {
    const t = "abc\ndef\nghi";
    expect(offsetOf(t, 1, 1)).toBe(0);
    expect(offsetOf(t, 2, 1)).toBe(4);
    expect(offsetOf(t, 3, 4)).toBe(11);
  });

  it("CRLF 면 \\r 도 한 글자로 센다", () => {
    const t = "abc\r\ndef";
    expect(offsetOf(t, 2, 1)).toBe(5);
    expect(t.slice(offsetOf(t, 2, 1), offsetOf(t, 2, 4))).toBe("def");
  });
});

describe("applyProposal — 기본", () => {
  it("유일한 텍스트를 바꾸고 원래 범위를 돌려준다", () => {
    const r = applyProposal({ base: "let a = 1;\nlet b = 2;\n", find: "b = 2", replace: "b = 99" });
    expect(r).toEqual({ ok: true, text: "let a = 1;\nlet b = 99;\n", start: 15, end: 20 });
  });

  it("end 는 항상 start + find.length — 애니메이션이 원본 span 을 집는다", () => {
    const r = applyProposal({ base: "xxhelloxx", find: "hello", replace: "" });
    expect(r).toMatchObject({ ok: true, start: 2, end: 7, text: "xxxx" });
  });

  it("못 찾으면 not_found", () => {
    expect(applyProposal({ base: "abc", find: "zzz", replace: "q" }))
      .toEqual({ ok: false, error: "not_found" });
  });

  it("두 군데면 multiple — 어느 쪽인지 모르므로 거절한다", () => {
    expect(applyProposal({ base: "foo\nfoo\n", find: "foo", replace: "bar" }))
      .toEqual({ ok: false, error: "multiple" });
  });
});

describe("applyProposal — $ 시퀀스", () => {
  it("$& 를 매치 전체로 펴지 않고 글자 그대로 쓴다", () => {
    const r = applyProposal({ base: "a TARGET z", find: "TARGET", replace: "$& $&" });
    expect(r).toMatchObject({ ok: true, text: "a $& $& z" });
  });

  it("$1·$`·$' 도 그대로 남는다", () => {
    const r = applyProposal({ base: "[X]", find: "X", replace: "$1$`$'$$" });
    expect(r).toMatchObject({ ok: true, text: "[$1$`$'$$]" });
  });
});

describe("applyProposal — 범위", () => {
  const base = "dup\ndup\ndup\n"; // 세 번 나온다 → 폴백은 반드시 multiple

  it("범위가 맞으면 중복 텍스트여도 그 자리에 적용한다", () => {
    const r = applyProposal({ base, find: "dup", replace: "OK", range: R(2, 1, 2, 4) });
    expect(r).toMatchObject({ ok: true, text: "dup\nOK\ndup\n", start: 4, end: 7 });
  });

  it("범위가 한 글자 어긋나면 버리고 폴백 — 중복이라 multiple", () => {
    expect(applyProposal({ base, find: "dup", replace: "OK", range: R(2, 2, 2, 5) }))
      .toEqual({ ok: false, error: "multiple" });
  });

  it("범위가 파일 밖을 가리키면 폴백", () => {
    expect(applyProposal({ base: "solo", find: "solo", replace: "S", range: R(9, 1, 9, 5) }))
      .toMatchObject({ ok: true, text: "S", start: 0, end: 4 });
  });

  it("파일 끝에 걸친 범위도 정상 적용", () => {
    const b = "head\ntail";
    const r = applyProposal({ base: b, find: "tail", replace: "TAIL", range: R(2, 1, 2, 5) });
    expect(r).toMatchObject({ ok: true, text: "head\nTAIL", start: 5, end: 9 });
  });

  it("CRLF 파일에서도 범위가 맞는다", () => {
    const b = "one\r\ntwo\r\none\r\n";
    const r = applyProposal({ base: b, find: "one", replace: "1", range: R(3, 1, 3, 4) });
    expect(r).toMatchObject({ ok: true, text: "one\r\ntwo\r\n1\r\n", start: 10, end: 13 });
  });
});

describe("applyProposal — 새 파일", () => {
  it("find 가 빈 문자열이면 통째로 넣는다(빈 문자열 유일성 판정 회피)", () => {
    expect(applyProposal({ base: "", find: "", replace: "hello\n" }))
      .toEqual({ ok: true, text: "hello\n", start: 0, end: 0 });
  });
});
