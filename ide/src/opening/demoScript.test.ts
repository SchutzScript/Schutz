import { describe, expect, it } from "vitest";
import {
  DEMO_STEPS, DEMO_FILE, DEMO_FIND, DEMO_REPLACE, TYPE_INTERVAL_MS,
  stepAt, totalWaitMs,
} from "./demoScript";

describe("데모 각본", () => {
  it("reveal 로 시작하고 done 으로 끝난다", () => {
    expect(DEMO_STEPS[0].id).toBe("reveal");
    expect(DEMO_STEPS[DEMO_STEPS.length - 1].id).toBe("done");
  });

  it("단계 id 가 중복되지 않는다", () => {
    const ids = DEMO_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 실제 제품은 제안이 검토에 올라온 **뒤에** 수락해야 파일이 바뀐다.
  // 순서를 뒤집으면 "파일에 바로 안 들어간다" 는 자막이 화면과 어긋난다.
  it("제안이 수락보다 먼저 온다", () => {
    const ids = DEMO_STEPS.map(s => s.id);
    expect(ids.indexOf("propose")).toBeLessThan(ids.indexOf("accept"));
  });

  it("모든 대기 시간이 양수다 — 0 이면 단계가 겹쳐 보인다", () => {
    for (const s of DEMO_STEPS) expect(s.waitMs).toBeGreaterThan(0);
  });

  it("자막이 붙은 단계는 화면이 알아서 움직이는 구간뿐", () => {
    const withCap = DEMO_STEPS.filter(s => s.caption).map(s => s.id);
    expect(withCap).toEqual(["reveal", "ask", "propose", "accept"]);
  });
});

describe("편집 대상", () => {
  it("바꿀 문자열과 결과가 다르다", () => {
    expect(DEMO_FIND).not.toBe(DEMO_REPLACE);
  });

  // 샘플 파일(demoFiles.cjs)에 실제로 있는 문자열이어야 수락이 성립한다.
  it("연도를 계산식으로 바꾸는 편집이다", () => {
    expect(DEMO_FIND).toContain("2024");
    expect(DEMO_REPLACE).toContain("getFullYear");
    expect(DEMO_FILE.endsWith(".jsx")).toBe(true);
  });
});

describe("stepAt / totalWaitMs", () => {
  it("범위를 벗어나면 null", () => {
    expect(stepAt(-1)).toBeNull();
    expect(stepAt(DEMO_STEPS.length)).toBeNull();
    expect(stepAt(0)?.id).toBe("reveal");
  });

  it("전체 시간이 사람이 볼 만한 길이다", () => {
    const total = totalWaitMs();
    expect(total).toBeGreaterThan(5_000);
    expect(total).toBeLessThan(30_000);   // 타이핑 시간이 더 붙는다
  });

  it("타이핑 간격이 읽을 수 있는 속도다", () => {
    expect(TYPE_INTERVAL_MS).toBeGreaterThanOrEqual(30);
    expect(TYPE_INTERVAL_MS).toBeLessThanOrEqual(120);
  });
});
