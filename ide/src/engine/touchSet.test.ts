import { describe, it, expect } from "vitest";
import { makeTouchSet, DEFAULT_MAX } from "../../electron/touchSet.cjs";

describe("makeTouchSet", () => {
  it("모은 것을 그대로 돌려준다", () => {
    const s = makeTouchSet();
    s.add("a.ts"); s.add("b/c.ts");
    const d = s.drain();
    expect(d.rels).toEqual(["a.ts", "b/c.ts"]);
    expect(d.overflow).toBe(false);
  });

  it("역슬래시를 슬래시로 맞춘다 — 윈도우 워처가 주는 모양이다", () => {
    const s = makeTouchSet();
    s.add("src\\editor\\pane.ts");
    expect(s.drain().rels).toEqual(["src/editor/pane.ts"]);
  });

  it("같은 경로를 두 번 세지 않는다", () => {
    const s = makeTouchSet();
    s.add("a.ts"); s.add("a.ts"); s.add("a.ts");
    expect(s.size).toBe(1);
  });

  it("빈 값은 담지 않는다", () => {
    const s = makeTouchSet();
    s.add(""); s.add(null); s.add(undefined);
    expect(s.size).toBe(0);
    expect(s.drain().overflow).toBe(false);
  });

  // 이것이 이 파일의 이유다. 예전엔 상한을 넘으면 말없이 버렸고, 그 알림을 받은
  // 확장은 자기가 전부 안다고 여겼다.
  it("상한을 넘으면 버렸다고 말한다", () => {
    const s = makeTouchSet(3);
    for (const r of ["a", "b", "c", "d", "e"]) s.add(r);
    const d = s.drain();
    expect(d.rels).toEqual(["a", "b", "c"]);
    expect(d.overflow).toBe(true);
    expect(d.dropped).toBe(2);
  });

  it("상한 이하면 넘쳤다고 하지 않는다", () => {
    const s = makeTouchSet(3);
    s.add("a"); s.add("b"); s.add("c");
    expect(s.drain().overflow).toBe(false);
  });

  it("중복은 상한을 깎지 않는다", () => {
    const s = makeTouchSet(2);
    s.add("a"); s.add("a"); s.add("b");
    const d = s.drain();
    expect(d.rels).toEqual(["a", "b"]);
    expect(d.overflow).toBe(false);
  });

  it("꺼내면 비고, 넘침 표시도 함께 지워진다", () => {
    const s = makeTouchSet(1);
    s.add("a"); s.add("b");
    expect(s.drain().overflow).toBe(true);
    const second = s.drain();
    expect(second.rels).toEqual([]);
    expect(second.overflow).toBe(false);
  });

  it("기본 상한은 실제 저장소 규모를 담을 만큼 크다", () => {
    // 2000 은 브랜치 하나만 갈아타도 넘쳤다.
    expect(DEFAULT_MAX).toBeGreaterThanOrEqual(20000);
  });
});
