import { describe, it, expect } from "vitest";
import { groupByFile, sortForApply, hasOverlap, normalizeAction, collectEdits } from "./workspaceEdit";

const R = (l1: number, c1: number, l2: number, c2: number) => ({ start: { line: l1, character: c1 }, end: { line: l2, character: c2 } });
const M = (l1: number, c1: number, l2: number, c2: number) => ({ startLineNumber: l1, startColumn: c1, endLineNumber: l2, endColumn: c2 });

describe("groupByFile", () => {
  it("파일별로 묶고 넣은 순서를 지킨다", () => {
    const g = groupByFile([
      { uri: "a", range: R(0, 0, 0, 1), text: "x" },
      { uri: "b", range: R(0, 0, 0, 1), text: "y" },
      { uri: "a", range: R(1, 0, 1, 1), text: "z" },
    ]);
    expect(g.map(f => f.key)).toEqual(["a", "b"]);
    expect(g[0]!.edits.map(e => e.text)).toEqual(["x", "z"]);
  });

  it("범위를 1-기반으로 옮긴다", () => {
    expect(groupByFile([{ uri: "a", range: R(0, 0, 0, 2), text: "x" }])[0]!.edits[0]!.range).toEqual(M(1, 1, 1, 3));
  });

  it("uri 를 toString 으로 정규화한다 — Uri 객체와 문자열이 같은 파일이어야 한다", () => {
    const uri = { toString: () => "file:///a" };
    const g = groupByFile([{ uri, range: R(0, 0, 0, 1), text: "x" }, { uri: "file:///a", range: R(1, 0, 1, 1), text: "y" }]);
    expect(g).toHaveLength(1);
  });

  it("uri 가 없는 편집은 버린다 — 어디에 쓸지 알 수 없다", () => {
    expect(groupByFile([{ uri: null, range: R(0, 0, 0, 1), text: "x" }])).toEqual([]);
  });

  it("text 가 없으면 빈 문자열 — 삭제로 본다", () => {
    expect(groupByFile([{ uri: "a", range: R(0, 0, 0, 1), text: undefined as any }])[0]!.edits[0]!.text).toBe("");
  });
});

describe("sortForApply", () => {
  it("뒤에서부터 적용하도록 정렬한다 — 앞에서부터 하면 뒤 편집 자리가 밀린다", () => {
    const r = sortForApply([
      { range: M(1, 1, 1, 2), text: "첫" },
      { range: M(3, 1, 3, 2), text: "셋" },
      { range: M(2, 1, 2, 2), text: "둘" },
    ]);
    expect(r.map(e => e.text)).toEqual(["셋", "둘", "첫"]);
  });

  it("같은 줄이면 칸이 뒤인 것부터", () => {
    const r = sortForApply([{ range: M(1, 1, 1, 2), text: "a" }, { range: M(1, 5, 1, 6), text: "b" }]);
    expect(r.map(e => e.text)).toEqual(["b", "a"]);
  });

  it("같은 자리면 넣은 순서를 지킨다 — 한 지점에 여러 조각을 이어 붙일 때 차례가 뒤집히면 안 된다", () => {
    // 뒤에서부터 적용하므로, 나중에 넣은 것이 먼저 적용돼야 최종 문자열이 "1,2,3" 이 된다.
    const r = sortForApply([
      { range: M(1, 1, 1, 1), text: "1" },
      { range: M(1, 1, 1, 1), text: "2" },
      { range: M(1, 1, 1, 1), text: "3" },
    ]);
    expect(r.map(e => e.text)).toEqual(["3", "2", "1"]);
  });

  it("원래 배열을 건드리지 않는다", () => {
    const src = [{ range: M(2, 1, 2, 2), text: "b" }, { range: M(1, 1, 1, 2), text: "a" }];
    const copy = src.slice();
    sortForApply(src);
    expect(src).toEqual(copy);
  });

  it("빈 목록", () => expect(sortForApply([])).toEqual([]));
});

describe("hasOverlap", () => {
  it("떨어져 있으면 아니다", () => {
    expect(hasOverlap([{ range: M(1, 1, 1, 3), text: "" }, { range: M(1, 5, 1, 7), text: "" }])).toBe(false);
  });

  it("맞닿기만 하면 아니다 — 이어 붙이는 편집은 정상이다", () => {
    expect(hasOverlap([{ range: M(1, 1, 1, 3), text: "" }, { range: M(1, 3, 1, 5), text: "" }])).toBe(false);
  });

  it("겹치면 참 — 어느 쪽을 살릴지 우리가 정할 수 없다", () => {
    expect(hasOverlap([{ range: M(1, 1, 1, 5), text: "" }, { range: M(1, 3, 1, 7), text: "" }])).toBe(true);
  });

  it("줄을 넘어 겹치는 것도 잡는다", () => {
    expect(hasOverlap([{ range: M(1, 1, 3, 5), text: "" }, { range: M(2, 1, 2, 2), text: "" }])).toBe(true);
  });

  it("순서가 뒤죽박죽이어도 잡는다", () => {
    expect(hasOverlap([{ range: M(2, 1, 2, 9), text: "" }, { range: M(1, 1, 2, 5), text: "" }])).toBe(true);
  });

  it("같은 자리에 여러 번 삽입하는 것은 겹침이 아니다", () => {
    expect(hasOverlap([{ range: M(1, 1, 1, 1), text: "a" }, { range: M(1, 1, 1, 1), text: "b" }])).toBe(false);
  });

  it("하나뿐이면 아니다", () => expect(hasOverlap([{ range: M(1, 1, 1, 3), text: "" }])).toBe(false));
});

describe("collectEdits", () => {
  it("우리 셰임이 만든 것(_edits)을 읽는다", () => {
    expect(collectEdits({ _edits: [{ uri: "a", range: R(0, 0, 0, 1), text: "x" }] })).toHaveLength(1);
  });

  it("entries() 를 주는 객체도 읽는다", () => {
    const we = { entries: () => [["a", [{ range: R(0, 0, 0, 1), newText: "x" }]]] };
    expect(collectEdits(we)).toEqual([{ uri: "a", range: R(0, 0, 0, 1), text: "x" }]);
  });

  it("모양을 모르면 빈 목록 — 던지지 않는다", () => {
    expect(collectEdits(undefined)).toEqual([]);
    expect(collectEdits({ nope: 1 })).toEqual([]);
    expect(collectEdits({ entries: () => { throw new Error("boom"); } })).toEqual([]);
  });
});

describe("normalizeAction", () => {
  it("편집을 담은 액션", () => {
    const a = normalizeAction({ title: "고치기", kind: { value: "quickfix" }, edit: { _edits: [{ uri: "a", range: R(0, 0, 0, 1), text: "x" }] } })!;
    expect(a.title).toBe("고치기");
    expect(a.kind).toBe("quickfix");
    expect(a.files[0]!.edits[0]!.text).toBe("x");
  });

  it("명령만 담은 액션", () => {
    const a = normalizeAction({ title: "실행", command: { command: "x.y", arguments: [1] } })!;
    expect([a.commandId, a.commandArgs, a.files]).toEqual(["x.y", [1], []]);
  });

  it("Command 를 그대로 돌려주는 옛 모양도 받는다 — 제목이 command.title 에 있다", () => {
    const a = normalizeAction({ command: "x.y", title: undefined, arguments: [2] });
    expect(a).toBeNull();   // title 이 없으면 메뉴에 못 올린다
    const b = normalizeAction({ command: "x.y", title: "옛 모양" })!;
    expect([b.title, b.commandId]).toEqual(["옛 모양", "x.y"]);
  });

  it("제목이 없으면 버린다 — 빈 줄을 메뉴에 올리지 않는다", () => {
    expect(normalizeAction({ edit: { _edits: [] } })).toBeNull();
    expect(normalizeAction(null)).toBeNull();
  });

  it("kind 가 문자열이어도 읽는다", () => {
    expect(normalizeAction({ title: "t", kind: "refactor" })!.kind).toBe("refactor");
  });

  it("isPreferred 를 옮긴다", () => {
    expect(normalizeAction({ title: "t", isPreferred: true })!.isPreferred).toBe(true);
    expect(normalizeAction({ title: "t" })!.isPreferred).toBe(false);
  });
});
