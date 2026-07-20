// 첫 실행 데모의 각본.
//
// 목업이 아니라 **진짜 UI** 를 움직인다. 여기 있는 건 순서와 시간뿐이고, 각 단계가
// 하는 일은 App 의 실제 코드 경로다 — 진짜 워크스페이스를 열고, 진짜 Monaco 모델에
// 타이핑하고, 진짜 제안을 검토 패널에 올리고, 진짜 수락 경로로 파일에 반영한다.
//
// API 호출은 0회다. "에이전트" 가 할 일을 각본이 직접 상태에 밀어넣을 뿐이라,
// 화면에 보이는 건 전부 실제 상태다. 사용자 파일은 건드리지 않는다 — userData 아래
// 샘플 프로젝트에서만 돈다.
//
// import 0. 시간과 순서만 들고 있어 브라우저 없이 테스트할 수 있다.

export type DemoStepId =
  | "reveal"    // 오버레이가 걷히고 진짜 앱이 드러난다
  | "ask"       // 대화 입력창에 요청이 타이핑된다
  | "work"      // 에이전트가 파일을 연다
  | "propose"   // 제안이 검토 패널에 올라온다
  | "accept"    // 수락 → 코드가 타이핑되며 바뀐다
  | "done";     // 마무리

export interface DemoStep {
  id: DemoStepId;
  /** 앞 단계가 끝난 뒤 이 단계를 시작하기까지 기다리는 시간(ms) */
  waitMs: number;
  /** 하단 자막 키(i18n `open.cap.<key>.t/.b`). 없으면 자막 없음 */
  caption?: string;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  { id: "reveal",  waitMs: 400,  caption: "assemble" },
  { id: "ask",     waitMs: 2600, caption: "ask" },
  { id: "work",    waitMs: 1400 },
  // 제안이 먼저 올라오고, 그 다음에 수락해야 코드가 바뀐다 — 실제 제품 순서 그대로다.
  // 순서를 뒤집으면 "파일에 바로 안 들어간다" 는 말이 화면과 어긋난다.
  { id: "propose", waitMs: 1200, caption: "approve" },
  { id: "accept",  waitMs: 2400, caption: "rewrite" },
  { id: "done",    waitMs: 2600 },
];

/** 요청 한 글자당 타이핑 간격(ms). 사람이 읽으면서 따라올 수 있는 속도. */
export const TYPE_INTERVAL_MS = 55;

/** 데모가 쓰는 샘플 파일과 편집 내용. main 의 demoFiles.cjs 와 짝이 맞아야 한다. */
export const DEMO_FILE = "src/components/Footer.jsx";
export const DEMO_FIND = "© 2024 SCHUTZ STUDIO";
export const DEMO_REPLACE = "© {new Date().getFullYear()} SCHUTZ STUDIO";

/** 단계 id 로 각본을 찾는다. */
export function stepAt(i: number): DemoStep | null {
  return i >= 0 && i < DEMO_STEPS.length ? DEMO_STEPS[i] : null;
}

/** 전체 소요 시간(대략) — 타이핑 시간은 별도라 하한이다. */
export function totalWaitMs(): number {
  return DEMO_STEPS.reduce((n, s) => n + s.waitMs, 0);
}
