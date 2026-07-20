import { describe, expect, it } from "vitest";
import { BEATS, TOTAL_MS, PANEL_ENTRIES, PANEL_DUR, CAPTION_OF, beatAt, captionFor, clampToGate, gateAt, seg, ease } from "./beats";

describe("타임라인이 무너지지 않는다", () => {
  it("비트가 시간순이고 겹치지 않는다", () => {
    for (let i = 1; i < BEATS.length; i++) {
      expect(BEATS[i].at).toBeGreaterThan(BEATS[i - 1].at);
    }
  });

  it("마지막 비트가 끝나기 전에 총 길이가 오지 않는다", () => {
    expect(TOTAL_MS).toBeGreaterThan(BEATS[BEATS.length - 1].at);
  });

  it("조립은 assemble 비트 안에서 시작하고 ask 전에 끝난다", () => {
    const assemble = BEATS.find(b => b.id === "assemble")!;
    const ask = BEATS.find(b => b.id === "ask")!;
    for (const p of PANEL_ENTRIES) {
      expect(p.at).toBeGreaterThanOrEqual(assemble.at);
      expect(p.at + PANEL_DUR).toBeLessThanOrEqual(ask.at);
    }
  });

  it("모든 패널이 어느 방향에서든 들어온다 — 제자리 페이드는 조립으로 안 읽힌다", () => {
    for (const p of PANEL_ENTRIES) expect(Math.abs(p.dx) + Math.abs(p.dy)).toBeGreaterThan(0);
  });
});

describe("자막", () => {
  it("자막이 붙은 비트는 전부 실제 BeatId 다", () => {
    const ids = new Set(BEATS.map(b => b.id));
    for (const k of Object.keys(CAPTION_OF)) expect(ids.has(k as never)).toBe(true);
  });

  // 마크·선언·세팅·안착은 그 자체가 이미 큰 글자라, 자막이 겹치면 시끄럽다.
  it("글자가 주인공인 비트에는 자막을 달지 않는다", () => {
    for (const id of ["mark", "say", "setup", "settle"] as const) {
      expect(captionFor(id)).toBeNull();
    }
  });

  it("화면이 알아서 움직이는 비트에는 전부 자막이 있다", () => {
    for (const id of ["assemble", "ask", "rewrite", "approve"] as const) {
      expect(captionFor(id)).not.toBeNull();
    }
  });
});

describe("beatAt", () => {
  it("경계 시각은 그 비트에 속한다", () => {
    for (const b of BEATS) expect(beatAt(b.at).id).toBe(b.id);
  });

  it("경계 직전은 앞 비트다", () => {
    for (let i = 1; i < BEATS.length; i++) {
      expect(beatAt(BEATS[i].at - 1).id).toBe(BEATS[i - 1].id);
    }
  });

  it("범위를 벗어나도 항상 하나를 돌려준다", () => {
    expect(beatAt(-9999).id).toBe(BEATS[0].id);
    expect(beatAt(TOTAL_MS * 10).id).toBe(BEATS[BEATS.length - 1].id);
  });
});

describe("게이트 — 오프닝에서 유일하게 사용자를 기다리는 지점", () => {
  it("게이트는 setup 하나뿐", () => {
    const gated = BEATS.filter(b => b.gate);
    expect(gated).toHaveLength(1);
    expect(gated[0].id).toBe("setup");
  });

  // 실제로 겪은 버그: at 에 걸었더니 세팅이 페이드인되기 전에 멈춰서 화면에
  // 선택지가 하나도 안 나오고 직전 장면이 반쯤 남은 채 굳었다.
  it("붙잡는 시각은 비트 시작이 아니라 등장이 끝난 뒤다", () => {
    const g = BEATS.find(b => b.gate)!;
    expect(g.holdAt).toBeDefined();
    expect(g.holdAt!).toBeGreaterThan(g.at);
    expect(gateAt()).toBe(g.holdAt);
  });

  it("붙잡는 시각이 다음 비트를 넘지 않는다 — 넘으면 조립이 먼저 시작된다", () => {
    const i = BEATS.findIndex(b => b.gate);
    expect(gateAt()!).toBeLessThan(BEATS[i + 1].at);
  });

  it("안 지났으면 게이트 지점에 붙잡힌다", () => {
    const g = gateAt()!;
    expect(clampToGate(g + 8000, false)).toBe(g);
    expect(clampToGate(TOTAL_MS, false)).toBe(g);
  });

  it("게이트 이전 시간은 붙잡지 않는다 — 앞부분은 그냥 흘러야 한다", () => {
    const g = gateAt()!;
    expect(clampToGate(g - 1000, false)).toBe(g - 1000);
    expect(clampToGate(0, false)).toBe(0);
  });

  it("지나고 나면 그대로 흐른다", () => {
    expect(clampToGate(TOTAL_MS, true)).toBe(TOTAL_MS);
  });
});

describe("seg / ease", () => {
  it("구간 밖은 0 과 1 로 잘린다", () => {
    expect(seg(-100, 0, 1000)).toBe(0);
    expect(seg(5000, 0, 1000)).toBe(1);
    expect(seg(500, 0, 1000)).toBeCloseTo(0.5);
  });

  it("길이 0 구간에서 0 으로 나누지 않는다", () => {
    expect(Number.isNaN(seg(100, 500, 500))).toBe(false);
    expect(seg(100, 500, 500)).toBe(0);
    expect(seg(500, 500, 500)).toBe(1);
  });

  it("ease 는 0..1 을 벗어나지 않고 양 끝이 평평하다", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-5)).toBe(0);
    expect(ease(5)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    // 시작이 평평하다 = 초반 변화량이 선형보다 작다
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
  });
});
