import { describe, it, expect } from "vitest";
import { decideStale, newlyGone, stillGone } from "./staleModels";

const S = (...xs: string[]) => new Set(xs);

describe("decideStale", () => {
  it("사라졌고 안 고친 파일은 버린다 — 남기면 모두 저장이 지운 파일을 되살린다", () => {
    expect(decideStale(["a", "b"], S("a"), () => false)).toEqual({ drop: ["b"], keep: [] });
  });

  it("사라졌지만 고친 파일은 남긴다 — 지우면 되돌릴 방법이 아예 없다", () => {
    expect(decideStale(["a"], S(), () => true)).toEqual({ drop: [], keep: ["a"] });
  });

  it("아직 있는 파일은 건드리지 않는다", () => {
    expect(decideStale(["a", "b"], S("a", "b"), () => true)).toEqual({ drop: [], keep: [] });
  });

  it("같은 판에서 둘을 함께 가른다", () => {
    const dirty = new Set(["dirty.ts"]);
    expect(decideStale(["dirty.ts", "clean.ts", "here.ts"], S("here.ts"), r => dirty.has(r)))
      .toEqual({ drop: ["clean.ts"], keep: ["dirty.ts"] });
  });

  it("isDirty 가 던지면 고친 것으로 본다 — 잘못 남기면 탭 하나, 잘못 버리면 작업이다", () => {
    expect(decideStale(["a"], S(), () => { throw new Error("boom"); })).toEqual({ drop: [], keep: ["a"] });
  });

  it("열린 게 없으면 아무것도 안 한다", () => {
    expect(decideStale([], S("a"), () => true)).toEqual({ drop: [], keep: [] });
  });

  it("순서를 지킨다 — 알림에 그대로 실린다", () => {
    expect(decideStale(["b", "a"], S(), () => true).keep).toEqual(["b", "a"]);
  });
});

describe("newlyGone", () => {
  it("아직 안 알린 것만", () => {
    expect(newlyGone(["a", "b"], S("a"))).toEqual(["b"]);
  });

  it("트리 동기화는 자주 돈다 — 같은 것을 되풀이해 알리지 않는다", () => {
    expect(newlyGone(["a"], S("a"))).toEqual([]);
  });

  it("아무것도 안 알렸으면 전부", () => {
    expect(newlyGone(["a", "b"], S())).toEqual(["a", "b"]);
  });
});

describe("stillGone", () => {
  it("돌아온 파일은 기록에서 지운다 — 다시 사라지면 그건 새 소식이다", () => {
    expect([...stillGone(S("a", "b"), S("a"))]).toEqual(["b"]);
  });

  it("전부 돌아오면 비운다", () => {
    expect([...stillGone(S("a"), S("a"))]).toEqual([]);
  });

  it("아무것도 안 돌아오면 그대로", () => {
    expect([...stillGone(S("a", "b"), S())].sort()).toEqual(["a", "b"]);
  });
});
