import { describe, it, expect } from "vitest";
import { lineCount, statsOf, summarizeChanges, totalOf, type ChangeInput } from "./changeset";

const P = (o: Partial<ChangeInput>): ChangeInput => ({
  rel: "a.ts", agent: "claude", status: "pending", find: "", replace: "", ...o,
});

describe("lineCount", () => {
  it("빈 문자열은 0줄 — split 하면 [\"\"] 라 1이 되는 함정", () => {
    expect(lineCount("")).toBe(0);
  });
  it("줄바꿈 없는 한 줄은 1", () => {
    expect(lineCount("hello")).toBe(1);
  });
  it("줄바꿈 수 + 1", () => {
    expect(lineCount("a\nb\nc")).toBe(3);
  });
  it("끝의 줄바꿈도 한 줄로 센다", () => {
    expect(lineCount("a\n")).toBe(2);
  });
});

describe("statsOf", () => {
  it("새 파일은 전부 추가", () => {
    expect(statsOf(P({ find: "", replace: "a\nb" }))).toEqual({ add: 2, del: 0 });
  });
  it("전부 삭제", () => {
    expect(statsOf(P({ find: "a\nb\nc", replace: "" }))).toEqual({ add: 0, del: 3 });
  });
  it("치환은 양쪽 다 센다", () => {
    expect(statsOf(P({ find: "a", replace: "x\ny" }))).toEqual({ add: 2, del: 1 });
  });
});

describe("summarizeChanges", () => {
  it("파일별로 묶고 증감을 더한다", () => {
    const r = summarizeChanges([
      P({ rel: "a.ts", find: "x", replace: "y\nz" }),
      P({ rel: "a.ts", find: "p\nq", replace: "r" }),
      P({ rel: "b.ts", find: "", replace: "new" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ rel: "a.ts", add: 3, del: 3, count: 2 });
    expect(r[1]).toMatchObject({ rel: "b.ts", add: 1, del: 0, count: 1 });
  });

  it("거절된 제안은 빼고 센다 — 되돌린 변경은 변경이 아니다", () => {
    const r = summarizeChanges([
      P({ rel: "a.ts", find: "x", replace: "y", status: "rejected" }),
      P({ rel: "b.ts", find: "", replace: "n", status: "accepted" }),
    ]);
    expect(r.map(f => f.rel)).toEqual(["b.ts"]);
  });

  it("한 파일이 전부 거절되면 목록에서 사라진다", () => {
    expect(summarizeChanges([P({ status: "rejected" })])).toEqual([]);
  });

  it("처음 등장한 순서를 지킨다 — 작업한 순서로 읽힌다", () => {
    const r = summarizeChanges([P({ rel: "z.ts" }), P({ rel: "a.ts" }), P({ rel: "z.ts" })]);
    expect(r.map(f => f.rel)).toEqual(["z.ts", "a.ts"]);
  });

  it("하나라도 안 끝났으면 pending", () => {
    const r = summarizeChanges([
      P({ rel: "a.ts", status: "accepted" }),
      P({ rel: "a.ts", status: "pending" }),
    ]);
    expect(r[0].status).toBe("pending");
  });

  it("전부 수락이면 accepted", () => {
    const r = summarizeChanges([
      P({ rel: "a.ts", status: "accepted" }),
      P({ rel: "a.ts", status: "accepted" }),
    ]);
    expect(r[0].status).toBe("accepted");
  });

  it("실패가 섞이면 실패가 이긴다 — 조용히 성공으로 보이면 안 된다", () => {
    const r = summarizeChanges([
      P({ rel: "a.ts", status: "accepted" }),
      P({ rel: "a.ts", status: "failed" }),
    ]);
    expect(r[0].status).toBe("failed");
  });

  it("같은 파일을 두 에이전트가 건드리면 둘 다 기록한다", () => {
    const r = summarizeChanges([
      P({ rel: "a.ts", agent: "claude" }),
      P({ rel: "a.ts", agent: "gpt" }),
      P({ rel: "a.ts", agent: "claude" }),
    ]);
    expect(r[0].agents).toEqual(["claude", "gpt"]);
  });

  it("빈 입력은 빈 목록", () => {
    expect(summarizeChanges([])).toEqual([]);
  });
});

describe("totalOf", () => {
  it("파일 수와 증감 총계", () => {
    const files = summarizeChanges([
      P({ rel: "a.ts", find: "x", replace: "y\nz" }),
      P({ rel: "b.ts", find: "", replace: "n" }),
    ]);
    expect(totalOf(files)).toEqual({ files: 2, add: 3, del: 1 });
  });
  it("빈 목록은 전부 0", () => {
    expect(totalOf([])).toEqual({ files: 0, add: 0, del: 0 });
  });
});
