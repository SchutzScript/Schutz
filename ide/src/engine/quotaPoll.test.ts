import { describe, it, expect } from "vitest";
import { shouldProbeQuota } from "./quotaPoll";

const STALE = 10 * 60_000;
const base = { now: 1_000_000, lastAt: 1_000_000, hidden: false, probing: false, staleMs: STALE };

describe("shouldProbeQuota", () => {
  it("방금 갱신됐으면 안 나간다", () => {
    expect(shouldProbeQuota(base)).toBe(false);
  });

  it("낡았고 창이 보이면 나간다", () => {
    expect(shouldProbeQuota({ ...base, lastAt: base.now - STALE })).toBe(true);
    expect(shouldProbeQuota({ ...base, lastAt: base.now - STALE * 3 })).toBe(true);
  });

  it("경계에서 1ms 모자라면 아직 안 나간다", () => {
    expect(shouldProbeQuota({ ...base, lastAt: base.now - STALE + 1 })).toBe(false);
  });

  it("창이 가려져 있으면 아무리 낡아도 안 나간다 — 아무도 안 보는 화면을 위해 과금하지 않는다", () => {
    expect(shouldProbeQuota({ ...base, lastAt: 0, hidden: true })).toBe(false);
  });

  it("이미 조회 중이면 겹쳐 보내지 않는다 — 느린 응답 위에 매 틱이 쌓이면 안 된다", () => {
    expect(shouldProbeQuota({ ...base, lastAt: 0, probing: true })).toBe(false);
  });

  it("한 번도 못 받았으면(lastAt=0) 첫 틱에 바로 나간다", () => {
    expect(shouldProbeQuota({ ...base, lastAt: 0 })).toBe(true);
  });

  it("실요청이 헤더를 갱신하면 그만큼 다음 조회가 미뤄진다", () => {
    // 9분 전 실요청 → 아직. 그 뒤 1분이 더 지나면 나간다.
    expect(shouldProbeQuota({ ...base, lastAt: base.now - 9 * 60_000 })).toBe(false);
    expect(shouldProbeQuota({ ...base, now: base.now + 60_000, lastAt: base.now - 9 * 60_000 })).toBe(true);
  });

  it("1분 틱이 아무리 자주 와도 10분에 한 번만 나간다", () => {
    let lastAt = 0, sent = 0;
    const fired: number[] = [];
    for (let m = 0; m <= 25; m++) {
      const now = base.now + m * 60_000;
      if (shouldProbeQuota({ ...base, now, lastAt, staleMs: STALE })) { sent++; fired.push(m); lastAt = now; }
    }
    // 26번 두드렸지만 실제 요청은 0·10·20분 세 번뿐이다
    expect(fired).toEqual([0, 10, 20]);
    expect(sent).toBe(3);
  });
});
