import { describe, it, expect } from "vitest";
import { isIgnorable, describe as describeErr, makeThrottle } from "./asyncErrors";

describe("isIgnorable", () => {
  it("Monaco 의 취소는 실패가 아니다 — 같이 시끄럽게 하면 진짜 오류가 묻힌다", () => {
    const e = new Error("Canceled"); e.name = "Canceled";
    expect(isIgnorable(e)).toBe(true);
    expect(isIgnorable({ name: "CancellationError" })).toBe(true);
  });

  it("이름 없이 메시지만 Canceled 로 오는 것도 잡는다", () => {
    expect(isIgnorable(new Error("Canceled"))).toBe(true);
    expect(isIgnorable("Canceled")).toBe(true);
  });

  it("우리가 일부러 끊은 요청도 실패가 아니다 — 에이전트 중지 버튼이 그렇다", () => {
    expect(isIgnorable({ name: "AbortError" })).toBe(true);
  });

  it("진짜 오류는 무시하지 않는다", () => {
    expect(isIgnorable(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isIgnorable("파일을 저장하지 못했습니다")).toBe(false);
  });

  it("이름에 Cancel 이 들어가기만 한 오류는 무시하지 않는다", () => {
    expect(isIgnorable(new Error("Canceled the wrong thing by mistake"))).toBe(false);
  });

  it("빈 값은 무시 대상이 아니다 — 알 수 없는 거부도 알려야 한다", () => {
    expect(isIgnorable(undefined)).toBe(false);
    expect(isIgnorable(null)).toBe(false);
  });
});

describe("describe", () => {
  it("Error 는 이름·메시지·스택", () => {
    const e = new Error("깨졌다");
    const d = describeErr(e);
    expect(d.title).toBe("Error: 깨졌다");
    expect(d.detail).toContain("깨졌다");
  });

  it("문자열도 받는다", () => {
    expect(describeErr("그냥 문자열").title).toBe("그냥 문자열");
  });

  it("객체는 JSON 으로", () => {
    expect(describeErr({ code: 7 }).title).toBe('{"code":7}');
  });

  it("직렬화가 안 되는 것도 던지지 않는다 — 오류 처리기가 오류를 내면 안 된다", () => {
    const cyc: any = {}; cyc.self = cyc;
    expect(() => describeErr(cyc)).not.toThrow();
    expect(describeErr(cyc).title).toContain("object");
  });

  it("제목은 길어도 잘린다", () => {
    expect(describeErr("가".repeat(500)).title.length).toBeLessThanOrEqual(200);
  });
});

describe("makeThrottle", () => {
  it("처음은 통과", () => {
    expect(makeThrottle()("A", 0)).toBe(true);
  });

  it("같은 제목은 창 안에서 한 번 — 루프 안의 실패가 화면을 덮으면 안 된다", () => {
    const t = makeThrottle(1000);
    expect(t("A", 0)).toBe(true);
    expect(t("A", 500)).toBe(false);
    expect(t("A", 999)).toBe(false);
  });

  it("창이 지나면 다시 알린다 — 한참 뒤 또 나면 그건 새 소식이다", () => {
    const t = makeThrottle(1000);
    t("A", 0);
    expect(t("A", 1000)).toBe(true);
  });

  it("다른 제목은 서로 막지 않는다", () => {
    const t = makeThrottle(1000);
    expect(t("A", 0)).toBe(true);
    expect(t("B", 1)).toBe(true);
  });

  it("제목이 매번 달라도 무한히 자라지 않는다", () => {
    const t = makeThrottle(10);
    for (let i = 0; i < 200; i++) t("제목" + i, i);
    // 오래된 것이 정리되므로 마지막 제목은 여전히 통과해야 한다.
    expect(t("새 제목", 1000)).toBe(true);
  });
});
