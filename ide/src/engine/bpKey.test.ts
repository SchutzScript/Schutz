import { describe, it, expect } from "vitest";
import { bpKey } from "./bpKey";

const bp = (uri: string, line: number) => ({ location: { uri, range: { start: { line } } } });

describe("bpKey", () => {
  it("같은 목록은 같은 키", () => {
    expect(bpKey([bp("a.ts", 1)])).toBe(bpKey([bp("a.ts", 1)]));
  });

  // 이것 때문에 이 함수가 있다. 개수로 견주면 이 판을 놓치고, 확장은 옛 목록을
  // 그대로 믿은 채 엉뚱한 줄에 표시를 남긴다.
  it("하나 끄고 하나 켜면 다른 키다(개수는 같다)", () => {
    const before = [bp("a.ts", 1), bp("a.ts", 2)];
    const after = [bp("a.ts", 1), bp("a.ts", 3)];
    expect(before.length).toBe(after.length);
    expect(bpKey(before)).not.toBe(bpKey(after));
  });

  it("파일이 다르면 다른 키", () => {
    expect(bpKey([bp("a.ts", 1)])).not.toBe(bpKey([bp("b.ts", 1)]));
  });

  it("순서가 달라도 같은 목록이면 같은 키", () => {
    expect(bpKey([bp("a.ts", 2), bp("a.ts", 1)])).toBe(bpKey([bp("a.ts", 1), bp("a.ts", 2)]));
  });

  it("빈 목록", () => {
    expect(bpKey([])).toBe("");
    expect(bpKey([])).not.toBe(bpKey([bp("a.ts", 1)]));
  });

  it("깨진 항목에 터지지 않는다", () => {
    expect(() => bpKey([null, undefined, {}, { location: {} }] as any)).not.toThrow();
  });
});
