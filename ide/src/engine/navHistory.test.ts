import { describe, it, expect } from "vitest";
import {
  emptyNav, current, isNewSpot, push, back, forward, canBack, canForward, dropMissing,
  NAV_LIMIT, NAV_MIN_JUMP, type NavState,
} from "./navHistory";

const S = (rel: string, line: number) => ({ rel, line });
const trail = (s: NavState) => s.spots.map(p => `${p.rel}:${p.line}`);

describe("빈 상태", () => {
  it("아무 데도 못 간다", () => {
    const s = emptyNav();
    expect(current(s)).toBeNull();
    expect(canBack(s)).toBe(false);
    expect(canForward(s)).toBe(false);
    expect(back(s)).toBe(s);       // 같은 객체 → 호출측이 "안 움직였다" 를 안다
    expect(forward(s)).toBe(s);
  });
});

describe("자리를 남긴다", () => {
  it("다른 파일은 늘 새 자리다", () => {
    let s = push(emptyNav(), S("a.ts", 1));
    s = push(s, S("b.ts", 1));
    expect(trail(s)).toEqual(["a.ts:1", "b.ts:1"]);
    expect(current(s)).toEqual(S("b.ts", 1));
  });

  it("같은 파일에서 크게 뛰면 새 자리", () => {
    let s = push(emptyNav(), S("a.ts", 10));
    s = push(s, S("a.ts", 10 + NAV_MIN_JUMP));
    expect(trail(s)).toEqual(["a.ts:10", "a.ts:20"]);
  });

  it("같은 파일에서 조금 움직인 것은 기록하지 않는다 — 뒤로 가기가 커서 취소가 되면 안 된다", () => {
    let s = push(emptyNav(), S("a.ts", 10));
    for (let i = 1; i < NAV_MIN_JUMP; i++) s = push(s, S("a.ts", 10 + i));
    expect(s.spots.length).toBe(1);
    expect(current(s)).toEqual(S("a.ts", 19));   // 줄 번호만 최신으로 갱신
  });

  it("한 줄씩 걸어 내려가면 아무리 멀리 가도 새 자리가 안 생긴다", () => {
    // 기준이 매번 최신으로 갱신되므로 차이가 쌓이지 않는다. 의도된 동작이다 —
    // 방향키로 200줄을 내려간 것은 "다른 곳으로 갔다" 가 아니다.
    let s = push(emptyNav(), S("a.ts", 1));
    for (let i = 2; i <= 200; i++) s = push(s, S("a.ts", i));
    expect(s.spots.length).toBe(1);
    expect(current(s)).toEqual(S("a.ts", 200));
  });

  it("경계에서 딱 1 모자라면 아직 같은 자리", () => {
    let s = push(emptyNav(), S("a.ts", 10));
    s = push(s, S("a.ts", 10 + NAV_MIN_JUMP - 1));
    expect(s.spots.length).toBe(1);
  });

  it("위로 뛴 것도 똑같이 센다", () => {
    let s = push(emptyNav(), S("a.ts", 100));
    s = push(s, S("a.ts", 100 - NAV_MIN_JUMP));
    expect(trail(s)).toEqual(["a.ts:100", "a.ts:90"]);
  });

  it("상한을 넘으면 오래된 것부터 버린다", () => {
    let s = emptyNav();
    for (let i = 0; i < NAV_LIMIT + 5; i++) s = push(s, S("f" + i + ".ts", 1));
    expect(s.spots.length).toBe(NAV_LIMIT);
    expect(s.spots[0]!.rel).toBe("f5.ts");
    expect(s.idx).toBe(NAV_LIMIT - 1);   // 잘라낸 뒤에도 커서는 맨 끝
  });
});

describe("뒤로·앞으로", () => {
  const three = () => push(push(push(emptyNav(), S("a.ts", 1)), S("b.ts", 2)), S("c.ts", 3));

  it("뒤로 갔다 앞으로 오면 제자리", () => {
    const s = three();
    expect(current(back(back(s)))).toEqual(S("a.ts", 1));
    expect(current(forward(forward(back(back(s)))))).toEqual(S("c.ts", 3));
  });

  it("맨 앞·맨 뒤에서는 안 움직인다", () => {
    const s = back(back(three()));
    expect(canBack(s)).toBe(false);
    expect(back(s)).toBe(s);
    const e = three();
    expect(canForward(e)).toBe(false);
    expect(forward(e)).toBe(e);
  });

  it("뒤로 간 뒤 새 곳으로 가면 앞쪽 기록은 버린다 — 브라우저와 같다", () => {
    let s = back(three());                 // a, b, [c] → a, [b], c
    expect(canForward(s)).toBe(true);
    s = push(s, S("d.ts", 4));
    expect(trail(s)).toEqual(["a.ts:1", "b.ts:2", "d.ts:4"]);
    expect(canForward(s)).toBe(false);
  });

  it("뒤로 간 자리에서 잔이동해도 앞쪽 기록은 살아 있다", () => {
    let s = back(three());
    s = push(s, S("b.ts", 3));             // 같은 자리 갱신
    expect(canForward(s)).toBe(true);
    expect(trail(s)).toEqual(["a.ts:1", "b.ts:3", "c.ts:3"]);
  });
});

describe("사라진 파일 정리", () => {
  it("지워진 파일은 기록에서 뺀다 — 되돌아가면 빈 탭이 열린다", () => {
    const s = push(push(push(emptyNav(), S("a.ts", 1)), S("gone.ts", 2)), S("c.ts", 3));
    const out = dropMissing(s, rel => rel !== "gone.ts");
    expect(trail(out)).toEqual(["a.ts:1", "c.ts:3"]);
    expect(current(out)).toEqual(S("c.ts", 3));
  });

  it("보고 있던 자리가 사라지면 가장 최근으로 옮긴다", () => {
    let s = push(push(emptyNav(), S("a.ts", 1)), S("gone.ts", 2));
    s = { spots: s.spots, idx: 1 };
    const out = dropMissing(s, rel => rel !== "gone.ts");
    expect(current(out)).toEqual(S("a.ts", 1));
  });

  it("정리 후 이어지는 중복은 하나로 접는다", () => {
    const s = push(push(push(emptyNav(), S("a.ts", 1)), S("gone.ts", 2)), S("a.ts", 1));
    const out = dropMissing(s, rel => rel !== "gone.ts");
    expect(trail(out)).toEqual(["a.ts:1"]);
  });

  it("전부 사라지면 빈 기록", () => {
    const s = push(emptyNav(), S("gone.ts", 1));
    const out = dropMissing(s, () => false);
    expect(out.spots).toEqual([]);
    expect(current(out)).toBeNull();
  });
});
