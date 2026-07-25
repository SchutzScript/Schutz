// 독립 코드 리뷰어 — 순수 함수 묶음(React/Electron import 금지, engine/* 규율 그대로).
//
// 핵심 규율: 리뷰어는 **diff 만** 본다. 매니저 대화·도구·프로젝트 지침을 절대 넘기지 않는다.
// 그래야 "자기가 방금 짠 변경을 관대하게 보는" 편향 없이 남의 눈으로 지적한다.
// 이 파일은 프롬프트 문자열과 출력 파서만 들고 있고, 실제 모델 호출은 App.tsx 가 한다.

export type Severity = "high" | "med" | "low";

export interface Finding {
  id: string;
  severity: Severity;
  file: string;
  line?: number;
  summary: string;
  detail?: string;
}

/** 리뷰어 시스템 프롬프트. 인자가 없다 — repo·history 를 절대 보간하지 않는다는 뜻이다.
 *  (테스트가 이 사실을 단언한다: 반환 문자열에 외부 값이 섞이면 격리가 깨진 것.) */
export function buildReviewSystemPrompt(): string {
  return [
    "당신은 깐깐한 코드 리뷰어입니다. 아래 통합 diff(unified diff)만 보고, 이 변경에서 실제로",
    "문제가 될 만한 것을 적대적으로 찾아냅니다. 변경되지 않은 코드나 diff 밖의 맥락은 추측하지 마세요.",
    "찾을 것: 버그·정확성 오류, 리소스/메모리 누수, 경쟁 조건, 입력 미검증·보안 결함,",
    "예외/에러 무시, 되돌릴 수 없는 파괴적 연산, 성능 함정, 빠진 정리(cleanup).",
    "스타일·포매팅·취향은 지적하지 마세요. 확신이 낮으면 severity 를 낮추되 억지로 만들지 마세요.",
    "문제가 하나도 없으면 빈 배열을 반환합니다.",
    "",
    "출력은 오직 JSON 배열 하나. 설명·머리말·코드펜스 없이 순수 JSON 만.",
    "각 원소: {\"severity\":\"high|med|low\",\"file\":\"경로\",\"line\":정수(모르면 생략),\"summary\":\"한 줄 요약\",\"detail\":\"왜 문제인지\"}",
    "예: [{\"severity\":\"high\",\"file\":\"src/a.ts\",\"line\":42,\"summary\":\"널 역참조\",\"detail\":\"x 가 null 일 때 x.y 접근\"}]",
  ].join("\n");
}

/** 리뷰어가 diff 를 넣을 사용자 메시지 본문. */
export function buildReviewUserPrompt(diff: string): string {
  return "다음 변경을 리뷰하세요:\n\n" + diff;
}

const SEVS: Severity[] = ["high", "med", "low"];

/** 모델 출력에서 Finding[] 를 뽑는다 — 관대하게.
 *  코드펜스를 벗기고, 순수 JSON 이 아니면 첫 배열 리터럴만 잘라서 파싱을 시도한다.
 *  못 읽으면 던지지 않고 [] 를 돌려준다(리뷰 실패가 커밋을 조용히 막지 않도록). */
export function parseFindings(raw: string): Finding[] {
  let s = (raw || "").trim();
  if (!s) return [];
  // ```json … ``` / ``` … ``` 펜스 제거 (inlineEdit 과 같은 관용구)
  if (s.startsWith("```")) s = s.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "").trim();
  let parsed: unknown = tryJson(s);
  if (parsed === undefined) {
    // 본문에 다른 말이 섞였을 때: 첫 '[' 부터 마지막 ']' 까지만 떼어 본다.
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a >= 0 && b > a) parsed = tryJson(s.slice(a, b + 1));
  }
  if (!Array.isArray(parsed)) return [];

  const out: Finding[] = [];
  let n = 0;
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const file = typeof o.file === "string" ? o.file.trim() : "";
    const summary = typeof o.summary === "string" ? o.summary.trim() : "";
    if (!file && !summary) continue;                 // 알맹이 없는 원소는 버린다
    const sev = SEVS.includes(o.severity as Severity) ? (o.severity as Severity) : "med";
    const lineNum = typeof o.line === "number" && isFinite(o.line) ? Math.trunc(o.line) : undefined;
    const detail = typeof o.detail === "string" && o.detail.trim() ? o.detail.trim() : undefined;
    out.push({
      id: "fd" + (n++),
      severity: sev,
      file: file || "(알 수 없음)",
      line: lineNum,
      summary: summary || file,
      detail,
    });
  }
  return out;
}

/** 심각도 정렬 우선순위 — high 가 위로. */
export function severityRank(s: Severity): number {
  return s === "high" ? 0 : s === "med" ? 1 : 2;
}

function tryJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}
