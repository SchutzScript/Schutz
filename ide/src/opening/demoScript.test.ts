import { describe, expect, it } from "vitest";
import {
  DEMO_STEPS, DEMO_FILE, DEMO_FIND, DEMO_REPLACE, TYPE_INTERVAL_MS,
  DEMO_TYPE_SLOWDOWN, DEMO_ZOOM_FONT, DEMO_ZOOM_MS,
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

  // 화면이 알아서 움직이는 동안 설명이 없으면 그냥 구경만 하게 된다. 마무리(done)만
  // 예외다 — 그 자리엔 곧 마무리 카드가 뜨므로 자막이 겹친다.
  it("마무리를 뺀 모든 단계에 자막이 붙는다", () => {
    for (const s of DEMO_STEPS) {
      if (s.id === "done") expect(s.caption).toBeUndefined();
      else expect(s.caption, s.id).toBeTruthy();
    }
  });

  // 시연이 보여줘야 하는 것: 찾고 읽는 과정 · 대화가 이어짐 · 명령은 물어보고 돌린다.
  // 예전엔 파일 하나를 한 줄 고치고 끝이라, 다른 도구와 구분되는 그림이 하나도 없었다.
  it("한 번 고치고 끝나지 않는다", () => {
    const ids = DEMO_STEPS.map(s => s.id);
    expect(ids).toContain("look");   // 도구 줄
    expect(ids).toContain("ask2");   // 두 번째 요청
    expect(ids).toContain("run");    // 명령 승인
    expect(ids.indexOf("ask2")).toBeGreaterThan(ids.indexOf("accept"));
    expect(ids.indexOf("look")).toBeLessThan(ids.indexOf("propose"));
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

describe("보여주는 속도", () => {
  // 오버레이가 걷힌 직후가 이 데모에서 제일 중요한 순간이다 — 방금 고른 테마로 조립된
  // 화면을 보는 시간. 예전엔 400ms 라 자막이 읽히기 전에 타이핑이 시작됐고, 설정을
  // 끝내자마자 화면이 제멋대로 움직이는 것처럼 보였다.
  it("첫 박자가 자막을 읽을 만큼 길다", () => {
    const reveal = DEMO_STEPS.find(s => s.id === "reveal")!;
    expect(reveal.caption).toBe("assemble");
    expect(reveal.waitMs).toBeGreaterThanOrEqual(2500);
  });

  it("어느 박자도 성급하지 않다", () => {
    for (const s of DEMO_STEPS) expect(s.waitMs).toBeGreaterThanOrEqual(2000);
  });

  // 평소 편집 속도는 3자/16ms 라 데모가 바꾸는 42자가 224ms 만에 끝난다 — 그건
  // "코드가 바뀌었다" 가 아니라 "깜빡였다" 로 보인다.
  it("코드 타이핑을 눈에 띄게 늦춘다", () => {
    expect(DEMO_TYPE_SLOWDOWN).toBeGreaterThanOrEqual(4);
    const perTick = 16 * DEMO_TYPE_SLOWDOWN;
    const ticks = Math.ceil(DEMO_REPLACE.length / 3);
    expect(ticks * perTick).toBeGreaterThan(1500);   // 최소 1.5초는 보인다
  });

  it("확대가 원래 크기보다 크고 순간이동이 아니다", () => {
    expect(DEMO_ZOOM_FONT).toBeGreaterThan(13);      // 기본 폰트 크기
    expect(DEMO_ZOOM_FONT).toBeLessThanOrEqual(28);  // EditorPrefs 상한
    expect(DEMO_ZOOM_MS).toBeGreaterThanOrEqual(500);
  });

  it("전체 길이가 여전히 사람이 앉아서 볼 만하다", () => {
    expect(totalWaitMs()).toBeLessThan(30_000);
  });
});
