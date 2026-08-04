import { describe, it, expect } from "vitest";
import { globToRegExp, matchesGlob, classify, dispatch, type WatcherSpec } from "./fsWatch";

const m = (glob: string, rel: string) => matchesGlob(globToRegExp(glob), rel);

describe("globToRegExp", () => {
  it("* 는 경로 구분자를 넘지 않는다 — 넘으면 확장이 엉뚱한 파일에 반응한다", () => {
    expect(m("*.json", "a.json")).toBe(true);
    expect(m("*.json", "sub/a.json")).toBe(false);
  });

  it("** 는 넘는다", () => {
    expect(m("**/*.ts", "a/b/c.ts")).toBe(true);
    expect(m("**/*.ts", "a.ts")).toBe(true);   // `**/` 는 0개 디렉터리도 뜻한다
  });

  it("중간의 ** 도 0단계를 허용한다", () => {
    expect(m("src/**/x.ts", "src/x.ts")).toBe(true);
    expect(m("src/**/x.ts", "src/a/b/x.ts")).toBe(true);
    expect(m("src/**/x.ts", "other/x.ts")).toBe(false);
  });

  it("? 는 한 글자, 구분자는 안 넘는다", () => {
    expect(m("a?.ts", "ab.ts")).toBe(true);
    expect(m("a?.ts", "abc.ts")).toBe(false);
    expect(m("a?b", "a/b")).toBe(false);
  });

  it("{a,b} 묶음", () => {
    expect(m("**/*.{ts,tsx}", "src/a.tsx")).toBe(true);
    expect(m("**/*.{ts,tsx}", "src/a.js")).toBe(false);
  });

  it("문자 클래스", () => {
    expect(m("v[0-9].ts", "v1.ts")).toBe(true);
    expect(m("v[0-9].ts", "vx.ts")).toBe(false);
    expect(m("a[b", "a[b")).toBe(true);   // 닫는 괄호가 없으면 그냥 글자
  });

  it("점은 글자 그대로다 — 정규식의 '아무 글자' 가 아니다", () => {
    expect(m("a.json", "axjson")).toBe(false);
  });

  it("정규식 특수문자가 새지 않는다", () => {
    expect(m("a+b.ts", "a+b.ts")).toBe(true);
    expect(m("a+b.ts", "aab.ts")).toBe(false);
  });

  it("역슬래시 경로와 앞의 ./ 를 정규화한다", () => {
    expect(m("./**/*.ts", "src\\a.ts")).toBe(true);
  });

  it("부분 일치가 아니라 전체 일치다", () => {
    expect(m("a.ts", "xa.ts")).toBe(false);
    expect(m("a.ts", "a.tsx")).toBe(false);
  });
});

describe("classify", () => {
  it("새 트리에만 있으면 만들어짐", () => {
    expect(classify(["a"], ["a", "b"], ["b"])).toEqual({ created: ["b"], changed: [], deleted: [] });
  });

  it("옛 트리에만 있으면 지워짐", () => {
    expect(classify(["a", "b"], ["a"], ["b"])).toEqual({ created: [], changed: [], deleted: ["b"] });
  });

  it("양쪽에 다 있으면 고쳐짐", () => {
    expect(classify(["a"], ["a"], ["a"])).toEqual({ created: [], changed: ["a"], deleted: [] });
  });

  it("잠깐 생겼다 사라진 파일에는 아무것도 안 쏜다 — 빌드 임시 파일이 그렇다", () => {
    expect(classify(["a"], ["a"], ["tmp"])).toEqual({ created: [], changed: [], deleted: [] });
  });

  it("워처가 안 알려 준 것도 트리 비교로 잡는다 — 브랜치 전환에서 알림이 뭉개진다", () => {
    expect(classify(["a"], ["b"], [])).toEqual({ created: ["b"], changed: [], deleted: ["a"] });
  });

  it("같은 경로가 여러 번 와도 한 번만 쏜다", () => {
    expect(classify(["a"], ["a"], ["a", "a", "a"]).changed).toEqual(["a"]);
  });

  it("역슬래시·앞 슬래시를 정규화한다", () => {
    expect(classify([], ["a/b.ts"], ["a\\b.ts"]).created).toEqual(["a/b.ts"]);
  });

  it("빈 이름은 버린다", () => {
    expect(classify([], [], ["", null as any])).toEqual({ created: [], changed: [], deleted: [] });
  });
});

describe("dispatch", () => {
  const mkW = (o: Partial<WatcherSpec> & { id: string; glob: string; got: string[][] }): WatcherSpec => ({
    id: o.id, re: globToRegExp(o.glob),
    ignoreCreate: o.ignoreCreate ?? false, ignoreChange: o.ignoreChange ?? false, ignoreDelete: o.ignoreDelete ?? false,
    fire: (k, rel) => o.got.push([k, rel]),
  });

  it("글롭에 맞는 것만 보낸다", () => {
    const got: string[][] = [];
    dispatch([mkW({ id: "w", glob: "**/*.ts", got })], { created: ["a.ts", "a.js"], changed: [], deleted: [] });
    expect(got).toEqual([["create", "a.ts"]]);
  });

  it("무시 표시가 있으면 그 종류는 안 보낸다", () => {
    const got: string[][] = [];
    dispatch([mkW({ id: "w", glob: "**", got, ignoreChange: true })], { created: ["a"], changed: ["b"], deleted: ["c"] });
    expect(got.map(g => g[0])).toEqual(["create", "delete"]);
  });

  it("하나가 던져도 나머지는 받는다 — 남의 확장이 우리를 막으면 안 된다", () => {
    const got: string[][] = [];
    const bad: WatcherSpec = { id: "bad", re: globToRegExp("**"), ignoreCreate: false, ignoreChange: false, ignoreDelete: false, fire: () => { throw new Error("boom"); } };
    const n = dispatch([bad, mkW({ id: "ok", glob: "**", got })], { created: ["a"], changed: [], deleted: [] });
    expect(got).toEqual([["create", "a"]]);
    expect(n).toBe(1);
  });

  it("감시자가 없으면 아무 일도 없다", () => {
    expect(dispatch([], { created: ["a"], changed: [], deleted: [] })).toBe(0);
  });
});
