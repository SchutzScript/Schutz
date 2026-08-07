import { describe, it, expect } from "vitest";
import { flattenNavTree, isTestPath, TS_KIND } from "./navTree";

/** 실제 워커가 주는 모양 그대로 — 맨 위는 파일 자신이고 이름에 따옴표가 붙는다. */
const TREE = {
  text: '"auth"', kind: "module", spans: [{ start: 0, length: 200 }],
  childItems: [
    {
      text: "TokenVault", kind: "class", spans: [{ start: 7, length: 120 }],
      childItems: [
        { text: "secret", kind: "property", spans: [{ start: 40, length: 20 }] },
        { text: "verifyToken", kind: "method", spans: [{ start: 66, length: 50 }] },
      ],
    },
    { text: "refreshSession", kind: "function", spans: [{ start: 130, length: 40 }] },
    { text: "SessionInfo", kind: "interface", spans: [{ start: 175, length: 25 }] },
  ],
};

describe("flattenNavTree", () => {
  it("파일 노드 자신은 심볼이 아니다", () => {
    expect(flattenNavTree(TREE, "").some(s => s.name === '"auth"')).toBe(false);
  });

  // 이 케이스 때문에 이 파일이 있다. 파일 노드가 부모를 안 남기니 그 자식들도
  // 부모가 0개가 되는데, 그걸로 최상위를 판정하면 전부 걸러져 결과가 늘 빈다.
  it("최상위 심볼이 파일 노드로 오해받아 사라지지 않는다", () => {
    const names = flattenNavTree(TREE, "").map(s => s.name);
    expect(names).toContain("TokenVault");
    expect(names).toContain("refreshSession");
    expect(names).toContain("SessionInfo");
  });

  it("중첩된 심볼도 낸다", () => {
    expect(flattenNavTree(TREE, "").map(s => s.name)).toContain("verifyToken");
  });

  it("담고 있는 것을 점으로 잇는다 — 파일 이름은 빼고", () => {
    const m = flattenNavTree(TREE, "verifyToken")[0]!;
    expect(m.container).toBe("TokenVault");
  });

  it("최상위 심볼의 container 는 비어 있다", () => {
    expect(flattenNavTree(TREE, "refreshSession")[0]!.container).toBe("");
  });

  it("이름으로 거른다(대소문자 무시)", () => {
    expect(flattenNavTree(TREE, "verifytoken").map(s => s.name)).toEqual(["verifyToken"]);
    expect(flattenNavTree(TREE, "VERIFY").map(s => s.name)).toEqual(["verifyToken"]);
  });

  it("일부만 맞아도 걸린다 — 앞에서 맞는 쪽이 먼저다", () => {
    expect(flattenNavTree(TREE, "Session").map(s => s.name)).toEqual(["SessionInfo", "refreshSession"]);
  });

  it("빈 질의는 전부 낸다", () => {
    expect(flattenNavTree(TREE, "")).toHaveLength(5);
  });

  it("오프셋을 그대로 전한다", () => {
    expect(flattenNavTree(TREE, "verifyToken")[0]!.offset).toBe(66);
  });

  it("kind 를 LSP 번호로 옮긴다", () => {
    const by = (n: string) => flattenNavTree(TREE, n)[0]!.kind;
    expect(by("TokenVault")).toBe(TS_KIND.class);
    expect(by("verifyToken")).toBe(TS_KIND.method);
    expect(by("SessionInfo")).toBe(TS_KIND.interface);
  });

  it("모르는 kind 는 0", () => {
    const t = { text: "f", kind: "x", childItems: [{ text: "weird", kind: "무엇", spans: [{ start: 1 }] }] };
    expect(flattenNavTree(t, "weird")[0]!.kind).toBe(0);
  });

  it("spans 가 없어도 버리지 않는다", () => {
    const t = { text: "f", childItems: [{ text: "noSpan", kind: "const" }] };
    const r = flattenNavTree(t, "noSpan");
    expect(r).toHaveLength(1);
    expect(r[0]!.offset).toBe(0);
  });

  // "X 가 어디 정의돼 있지" 에 import 줄을 내미는 것은 답이 아니다.
  it("import 로 끌어온 이름(alias)은 정의가 아니라 뺀다", () => {
    const t = {
      text: '"app"', kind: "module",
      childItems: [
        { text: "applyProposal", kind: "alias", spans: [{ start: 9 }] },
        { text: "applyProposal", kind: "function", spans: [{ start: 300 }] },
      ],
    };
    const r = flattenNavTree(t, "applyProposal");
    expect(r).toHaveLength(1);
    expect(r[0]!.offset).toBe(300);
  });

  it("정확히 같은 이름을 먼저 낸다", () => {
    const t = {
      text: "f",
      childItems: [
        { text: "findSymbolsLater", kind: "function", spans: [{ start: 10 }] },
        { text: "xxfindSymbols", kind: "function", spans: [{ start: 20 }] },
        { text: "findSymbols", kind: "function", spans: [{ start: 30 }] },
      ],
    };
    expect(flattenNavTree(t, "findSymbols").map(s => s.name))
      .toEqual(["findSymbols", "findSymbolsLater", "xxfindSymbols"]);
  });

  it("깨진 입력에 터지지 않는다", () => {
    expect(flattenNavTree(null, "x")).toEqual([]);
    expect(flattenNavTree(undefined, "x")).toEqual([]);
    expect(flattenNavTree("문자열", "x")).toEqual([]);
    expect(flattenNavTree({ text: "f", childItems: "배열아님" }, "x")).toEqual([]);
  });

  it("이름 없는 노드는 건너뛰되 그 자식은 본다", () => {
    const t = { text: "f", childItems: [{ text: "", kind: "module", childItems: [{ text: "inner", kind: "const", spans: [{ start: 5 }] }] }] };
    expect(flattenNavTree(t, "inner").map(s => s.name)).toEqual(["inner"]);
  });
});

describe("isTestPath", () => {
  it("테스트 파일을 알아본다", () => {
    for (const p of ["src/a.test.ts", "src/a.spec.tsx", "a.test.js", "src/__tests__/a.ts", "test/a.ts", "tests/deep/a.ts"]) {
      expect(isTestPath(p)).toBe(true);
    }
  });
  it("아닌 것을 테스트로 보지 않는다", () => {
    for (const p of ["src/a.ts", "src/latest.ts", "src/contest.ts", "src/protest/a.ts", "src/testing.ts"]) {
      expect(isTestPath(p)).toBe(false);
    }
  });
});
