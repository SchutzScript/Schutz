import { describe, it, expect } from "vitest";
import {
  isRetriableStatus, parseRetryAfter, backoffDelay, retryPlan,
  MAX_ATTEMPTS, MAX_DELAY_MS, BASE_DELAY_MS,
} from "./retry";

describe("isRetriableStatus", () => {
  it("429·408·425 와 5xx 만 다시 보낸다", () => {
    for (const s of [429, 408, 425, 500, 502, 503, 599]) expect(isRetriableStatus(s)).toBe(true);
  });
  it("다시 보내도 같은 답이 올 4xx 는 재시도하지 않는다", () => {
    for (const s of [400, 401, 403, 404, 422]) expect(isRetriableStatus(s)).toBe(false);
  });
  it("성공은 재시도 대상이 아니다", () => {
    for (const s of [200, 201, 204, 304]) expect(isRetriableStatus(s)).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("초 단위 숫자를 밀리초로 바꾼다", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
  });
  it("HTTP 날짜는 지금으로부터 남은 시간으로 바꾼다", () => {
    const now = Date.parse("2026-07-26T00:00:00Z");
    expect(parseRetryAfter("Sun, 26 Jul 2026 00:00:05 GMT", now)).toBe(5000);
  });
  it("이미 지난 시각은 0 으로 눕힌다 (음수 대기 금지)", () => {
    const now = Date.parse("2026-07-26T00:01:00Z");
    expect(parseRetryAfter("Sun, 26 Jul 2026 00:00:00 GMT", now)).toBe(0);
  });
  it("터무니없이 긴 지시는 상한으로 자른다", () => {
    expect(parseRetryAfter("99999", 0)).toBe(MAX_DELAY_MS);
  });
  it("없거나 해석 불가면 null — 우리 백오프를 쓴다", () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter(undefined, 0)).toBeNull();
    expect(parseRetryAfter("나중에", 0)).toBeNull();
  });
});

describe("backoffDelay", () => {
  it("시도마다 배로 늘어난다", () => {
    // rand=1 이면 지터 계수가 1 이라 기본값 그대로
    expect(backoffDelay(1, 1)).toBe(BASE_DELAY_MS);
    expect(backoffDelay(2, 1)).toBe(BASE_DELAY_MS * 2);
    expect(backoffDelay(3, 1)).toBe(BASE_DELAY_MS * 4);
  });
  it("지터는 절반까지만 깎는다 — 0 대기로 몰려가지 않게", () => {
    expect(backoffDelay(1, 0)).toBe(BASE_DELAY_MS / 2);
    expect(backoffDelay(5, 0)).toBeGreaterThan(0);
  });
  it("아무리 늘어도 상한을 넘지 않는다", () => {
    expect(backoffDelay(20, 1)).toBe(MAX_DELAY_MS);
  });
});

describe("retryPlan", () => {
  it("429 는 백오프만큼 기다렸다 다시 보낸다", () => {
    expect(retryPlan(1, { status: 429 }, 0, 1)).toBe(BASE_DELAY_MS);
  });
  it("네트워크 오류도 다시 보낸다 (상태 코드가 없다)", () => {
    expect(retryPlan(1, { networkError: true }, 0, 1)).toBe(BASE_DELAY_MS);
  });
  it("Retry-After 가 있으면 우리 백오프보다 그 지시를 따른다", () => {
    expect(retryPlan(1, { status: 429, retryAfter: "5" }, 0, 1)).toBe(5000);
  });
  it("인증 실패는 몇 번을 보내도 같으므로 재시도하지 않는다", () => {
    expect(retryPlan(1, { status: 401 }, 0, 1)).toBeNull();
  });
  it("마지막 시도 뒤에는 포기한다 — 무한 재시도 금지", () => {
    expect(retryPlan(MAX_ATTEMPTS, { status: 429 }, 0, 1)).toBeNull();
    expect(retryPlan(MAX_ATTEMPTS + 1, { status: 503 }, 0, 1)).toBeNull();
  });
});
