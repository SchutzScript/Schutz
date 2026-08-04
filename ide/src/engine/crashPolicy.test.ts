import { describe, it, expect } from "vitest";
// 메인 프로세스의 판단 부분. .cjs 라 앱은 require 로, 테스트는 여기서 그대로 불러 쓴다.
import { trimLog, makeNotifyGate, makeReloadGate, logLine } from "../../electron/crashPolicy.cjs";

describe("trimLog", () => {
  it("한도 안이면 그대로", () => {
    expect(trimLog("짧다", 1000)).toBe("짧다");
  });

  it("넘치면 뒤쪽(최근)을 남긴다 — 크래시 직전이 궁금하다", () => {
    const s = Array.from({ length: 500 }, (_, i) => "line " + i).join("\n");
    const out = trimLog(s, 400);
    expect(out).toContain("line 499");
    expect(out).not.toContain("line 0\n");
    expect(Buffer.byteLength(out, "utf8")).toBeLessThan(600);
  });

  it("반 토막 난 줄로 시작하지 않는다", () => {
    const s = Array.from({ length: 300 }, (_, i) => "aaaaaaaaaa" + i).join("\n");
    const out = trimLog(s, 200);
    const body = out.split("\n").slice(1);          // 첫 줄은 잘림 표시
    expect(body[0]).toMatch(/^aaaaaaaaaa\d+$/);
  });

  it("잘렸다는 것을 밝힌다 — 조용히 지우면 앞이 원래 없었는지 지워졌는지 모른다", () => {
    expect(trimLog("x".repeat(5000), 100)).toContain("잘림");
  });

  it("빈 값도 던지지 않는다", () => {
    expect(trimLog(undefined as any)).toBe("");
    expect(trimLog(null as any)).toBe("");
  });
});

describe("makeNotifyGate", () => {
  it("세션당 한 번만 — 같은 오류가 초당 여러 번 오면 모달로 앱을 못 쓴다", () => {
    const g = makeNotifyGate();
    expect(g()).toBe(true);
    expect(g()).toBe(false);
    expect(g()).toBe(false);
  });

  it("게이트끼리는 서로 무관하다", () => {
    const a = makeNotifyGate(), b = makeNotifyGate();
    a();
    expect(b()).toBe(true);
  });
});

describe("makeReloadGate", () => {
  it("빈 창을 그대로 두지 않는다 — 처음 두 번은 다시 싣는다", () => {
    const g = makeReloadGate(2, 1000);
    expect(g(0)).toBe(true);
    expect(g(100)).toBe(true);
  });

  it("짧은 사이에 되풀이되면 멈춘다 — 실을 때마다 또 죽으면 무한 반복이다", () => {
    const g = makeReloadGate(2, 1000);
    g(0); g(100);
    expect(g(200)).toBe(false);
  });

  it("시간이 지나면 다시 허용한다 — 한참 뒤의 크래시는 다른 사건이다", () => {
    const g = makeReloadGate(2, 1000);
    g(0); g(100); g(200);
    expect(g(5000)).toBe(true);
  });
});

describe("logLine", () => {
  it("시간과 종류를 앞에 붙인다", () => {
    const l = logLine(Date.UTC(2026, 7, 4, 1, 2, 3), "uncaught", "터졌다");
    expect(l).toContain("2026-08-04T01:02:03");
    expect(l).toContain("uncaught: 터졌다");
    expect(l.endsWith("\n")).toBe(true);
  });

  it("여러 줄 스택은 들여쓴다 — 다음 항목과 섞이면 어디까지가 하나인지 모른다", () => {
    expect(logLine(0, "k", "a\nb")).toContain("a\n    b");
  });

  it("빈 상세도 던지지 않는다", () => {
    expect(() => logLine(0, "k", undefined)).not.toThrow();
  });
});
