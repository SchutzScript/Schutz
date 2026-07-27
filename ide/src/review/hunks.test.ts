import { describe, it, expect } from "vitest";
import {
  buildHunks, changeCount, composeFromHunks, allSelected, hunkStats,
  LCS_CELL_CAP, type ChangeHunk,
} from "./hunks";

/** 이 두 가지가 이 모듈의 존재 이유다. 깨지면 파일을 잘못 쓴다. */
function expectRoundTrip(find: string, replace: string) {
  const h = buildHunks(find, replace);
  expect(composeFromHunks(h, allSelected(h)), "전부 고르면 replace 와 같아야 한다").toBe(replace);
  expect(composeFromHunks(h, new Set()), "하나도 안 고르면 find 와 같아야 한다").toBe(find);
}

describe("불변 조건 — 전부/하나도", () => {
  it("한 줄 치환", () => expectRoundTrip("a", "b"));
  it("여러 줄 치환", () => expectRoundTrip("a\nb\nc", "x\ny"));
  it("가운데만 바뀜", () => expectRoundTrip("a\nb\nc", "a\nX\nc"));
  it("앞뒤로 떨어진 두 곳이 바뀜", () => expectRoundTrip("a\nb\nc\nd\ne", "A\nb\nc\nd\nE"));
  it("순수 추가", () => expectRoundTrip("a\nc", "a\nb\nc"));
  it("순수 삭제", () => expectRoundTrip("a\nb\nc", "a\nc"));
  it("새 파일 (find 가 빈 문자열)", () => expectRoundTrip("", "line1\nline2"));
  it("전체 삭제", () => expectRoundTrip("a\nb", ""));
  it("끝 줄바꿈이 있는 경우", () => expectRoundTrip("a\nb\n", "a\nB\n"));
  it("바뀐 게 없는 경우", () => expectRoundTrip("a\nb", "a\nb"));
  it("빈 줄이 섞인 경우", () => expectRoundTrip("a\n\nb", "a\n\nB"));
  it("들여쓰기만 바뀐 경우", () => expectRoundTrip("  a\n  b", "\ta\n\tb"));
});

describe("buildHunks", () => {
  it("바뀐 게 없으면 change 헝크가 0개", () => {
    const h = buildHunks("a\nb", "a\nb");
    expect(changeCount(h)).toBe(0);
    expect(h.every(x => x.kind === "context")).toBe(true);
  });

  it("떨어진 두 변경은 헝크 두 개로 갈린다", () => {
    const h = buildHunks("a\nb\nc\nd\ne", "A\nb\nc\nd\nE");
    expect(changeCount(h)).toBe(2);
  });

  it("붙어 있는 변경은 헝크 하나다", () => {
    const h = buildHunks("a\nb\nc", "X\nY\nc");
    expect(changeCount(h)).toBe(1);
  });

  it("헝크 index 는 0부터 순서대로", () => {
    const h = buildHunks("a\nb\nc\nd\ne", "A\nb\nc\nd\nE");
    const idx = h.filter((x): x is ChangeHunk => x.kind === "change").map(x => x.index);
    expect(idx).toEqual([0, 1]);
  });

  it("변경 사이의 같은 줄은 context 로 남는다", () => {
    const h = buildHunks("a\nKEEP\nc", "A\nKEEP\nC");
    const ctx = h.filter(x => x.kind === "context").flatMap(x => (x as any).lines);
    expect(ctx).toContain("KEEP");
  });
});

describe("일부만 고르기", () => {
  const find = "a\nb\nc\nd\ne";
  const replace = "A\nb\nc\nd\nE";

  it("첫 헝크만 고르면 첫 줄만 바뀐다", () => {
    const h = buildHunks(find, replace);
    expect(composeFromHunks(h, new Set([0]))).toBe("A\nb\nc\nd\ne");
  });

  it("두 번째 헝크만 고르면 마지막 줄만 바뀐다", () => {
    const h = buildHunks(find, replace);
    expect(composeFromHunks(h, new Set([1]))).toBe("a\nb\nc\nd\nE");
  });

  it("없는 index 는 무시한다 — 선택 상태가 낡아도 죽지 않는다", () => {
    const h = buildHunks(find, replace);
    expect(composeFromHunks(h, new Set([0, 99]))).toBe("A\nb\nc\nd\ne");
  });

  it("추가만 있는 헝크를 빼면 그 줄이 안 들어간다", () => {
    const h = buildHunks("a\nc", "a\nb\nc");
    expect(composeFromHunks(h, new Set())).toBe("a\nc");
    expect(composeFromHunks(h, allSelected(h))).toBe("a\nb\nc");
  });

  it("삭제만 있는 헝크를 빼면 그 줄이 남는다", () => {
    const h = buildHunks("a\nb\nc", "a\nc");
    expect(composeFromHunks(h, new Set())).toBe("a\nb\nc");
  });
});

describe("큰 편집 — 통짜로 떨어진다", () => {
  it("상한을 넘으면 헝크 하나로, 왕복은 그대로 성립", () => {
    const n = Math.ceil(Math.sqrt(LCS_CELL_CAP)) + 50;
    const find = Array.from({ length: n }, (_, i) => "a" + i).join("\n");
    const replace = Array.from({ length: n }, (_, i) => "b" + i).join("\n");
    const h = buildHunks(find, replace);
    expect(changeCount(h)).toBe(1);
    expect(composeFromHunks(h, allSelected(h))).toBe(replace);
    expect(composeFromHunks(h, new Set())).toBe(find);
  });
});

describe("hunkStats", () => {
  it("추가·삭제 줄 수", () => {
    const h = buildHunks("a\nb", "X\nY\nZ");
    const ch = h.find((x): x is ChangeHunk => x.kind === "change")!;
    expect(hunkStats(ch)).toEqual({ add: 3, del: 2 });
  });
});

describe("allSelected", () => {
  it("change 헝크만 담는다", () => {
    const h = buildHunks("a\nKEEP\nc", "A\nKEEP\nC");
    expect(allSelected(h).size).toBe(changeCount(h));
  });
  it("바뀐 게 없으면 빈 집합", () => {
    expect(allSelected(buildHunks("a", "a")).size).toBe(0);
  });
});
