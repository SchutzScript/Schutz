import { describe, it, expect } from "vitest";
import { buildReviewSystemPrompt, buildReviewUserPrompt, parseFindings, severityRank } from "./reviewer";

describe("buildReviewSystemPrompt", () => {
  it("격리: 같은 언어면 늘 같은 문자열 — 외부 값 보간 지점이 없다", () => {
    const p = buildReviewSystemPrompt();
    expect(p).toContain("JSON");
    // diff·history·repo 같은 실제 값이 프롬프트에 절대 안 섞여야 한다.
    // 언어는 닫힌 집합이라 자유 문자열이 들어올 자리가 없다.
    expect(buildReviewSystemPrompt()).toBe(p);
    expect(buildReviewSystemPrompt("ko")).toBe(p);
  });

  it("결과 언어를 지시한다 — UI 는 4개국어인데 리뷰만 늘 한국어로 오던 자리", () => {
    expect(buildReviewSystemPrompt("en")).toContain("in English");
    expect(buildReviewSystemPrompt("de")).toContain("auf Deutsch");
    expect(buildReviewSystemPrompt("ja")).toContain("日本語");
    expect(buildReviewSystemPrompt("ko")).toContain("한국어");
  });

  it("모르는 언어는 한국어로 떨어진다 — 지시가 통째로 빠지면 안 된다", () => {
    expect(buildReviewSystemPrompt("zz" as any)).toBe(buildReviewSystemPrompt("ko"));
  });
});

describe("buildReviewUserPrompt", () => {
  it("diff 를 그대로 담는다", () => {
    expect(buildReviewUserPrompt("@@ -1 +1 @@\n-a\n+b")).toContain("@@ -1 +1 @@");
  });
});

describe("parseFindings", () => {
  it("순수 JSON 배열", () => {
    const r = parseFindings('[{"severity":"high","file":"a.ts","line":42,"summary":"널 역참조","detail":"x null"}]');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: "high", file: "a.ts", line: 42, summary: "널 역참조", detail: "x null" });
    expect(r[0].id).toBeTruthy();
  });

  it("코드펜스로 감싼 JSON", () => {
    const r = parseFindings('```json\n[{"severity":"low","file":"b.ts","summary":"사소"}]\n```');
    expect(r).toHaveLength(1);
    expect(r[0].severity).toBe("low");
    expect(r[0].line).toBeUndefined();
  });

  it("본문에 잡담이 섞여도 첫 배열만 뽑는다", () => {
    const r = parseFindings('여기 결과입니다:\n[{"severity":"med","file":"c.ts","summary":"경쟁"}]\n이상입니다.');
    expect(r).toHaveLength(1);
    expect(r[0].file).toBe("c.ts");
  });

  it("빈 배열 → 발견 없음", () => {
    expect(parseFindings("[]")).toEqual([]);
    expect(parseFindings("```\n[]\n```")).toEqual([]);
  });

  it("쓰레기·빈 입력 → 던지지 않고 []", () => {
    expect(parseFindings("리뷰 실패했어요")).toEqual([]);
    expect(parseFindings("")).toEqual([]);
    expect(parseFindings("{not json")).toEqual([]);
  });

  it("알 수 없는 severity 는 med 로, 알맹이 없는 원소는 버린다", () => {
    const r = parseFindings('[{"severity":"critical","file":"d.ts","summary":"x"},{},{"foo":1}]');
    expect(r).toHaveLength(1);
    expect(r[0].severity).toBe("med");
  });

  it("line 이 숫자가 아니면 생략", () => {
    const r = parseFindings('[{"severity":"high","file":"e.ts","line":"열둘","summary":"y"}]');
    expect(r[0].line).toBeUndefined();
  });
});

describe("severityRank", () => {
  it("high < med < low 순으로 정렬된다", () => {
    expect(severityRank("high")).toBeLessThan(severityRank("med"));
    expect(severityRank("med")).toBeLessThan(severityRank("low"));
  });
});
