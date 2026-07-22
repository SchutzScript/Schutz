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
  | "look"      // 에이전트가 찾고 읽는다 — 도구 줄이 하나씩 쌓인다
  | "propose"   // 제안이 검토 패널에 올라온다
  | "accept"    // 수락 → 코드가 타이핑되며 바뀐다
  | "ask2"      // 두 번째 요청 — 대화가 이어진다
  | "run"       // 명령을 돌려도 되냐고 묻고, 승인하면 출력이 흐른다
  | "done";     // 마무리

export interface DemoStep {
  id: DemoStepId;
  /** 앞 단계가 끝난 뒤 이 단계를 시작하기까지 기다리는 시간(ms) */
  waitMs: number;
  /** 하단 자막 키(i18n `open.cap.<key>.t/.b`). 없으면 자막 없음 */
  caption?: string;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  // reveal 이 길다. 오버레이가 걷힌 **직후**가 이 데모에서 제일 중요한 순간이라서다 —
  // 방금 고른 테마로 조립된 화면을 보는 시간이다. 예전엔 400ms 였는데, 그러면 자막
  // ("화면은 네 부분입니다")이 읽히기 전에 다음 자막이 덮고 곧바로 타이핑이 시작된다.
  // 사용자에게는 설정을 끝내자마자 무언가가 제멋대로 움직이는 것으로 보인다.
  { id: "reveal",  waitMs: 3000, caption: "assemble" },
  { id: "ask",     waitMs: 2400, caption: "ask" },
  // 이 앱의 약속은 "무엇을 읽고 무엇을 고쳤는지 다 보인다" 인데, 예전 시연엔 도구 줄이
  // **한 줄도** 안 나왔다. 상태만 "편집 중" 으로 바뀌고 결과가 튀어나왔다 — 그건 다른
  // 도구와 구분되지 않는 그림이다.
  { id: "look",    waitMs: 2200, caption: "look" },
  // 제안이 먼저 올라오고, 그 다음에 수락해야 코드가 바뀐다 — 실제 제품 순서 그대로다.
  // 순서를 뒤집으면 "파일에 바로 안 들어간다" 는 말이 화면과 어긋난다.
  { id: "propose", waitMs: 2400, caption: "approve" },
  { id: "accept",  waitMs: 3000, caption: "rewrite" },
  // 한 번 고치고 끝나면 "한 번 쓰고 마는 도구" 로 보인다. 이어서 다음 걸 시킨다.
  { id: "ask2",    waitMs: 2400, caption: "again" },
  { id: "run",     waitMs: 2600, caption: "runAsk" },
  { id: "done",    waitMs: 3000 },
];

/** 두 번째 요청이 부르는 명령. 진짜로 돌리지 않는다 — 시연은 API 도 셸도 건드리지 않는다.
 *  승인 카드와 출력 줄이 어떻게 생겼는지만 보여준다. */
export const DEMO_CMD = "npm test";
/** 승인 뒤 터미널 자리에 흐르는 출력. 지어낸 문장이 아니라 이 샘플에서 나올 법한 모양이다. */
export const DEMO_CMD_OUT = [
  "PASS  src/components/Footer.test.jsx",
  "  ✓ renders the current year (12 ms)",
  "",
  "Tests: 1 passed, 1 total",
].join("\n");

/** 요청 한 글자당 타이핑 간격(ms). 사람이 읽으면서 따라올 수 있는 속도. */
export const TYPE_INTERVAL_MS = 72;

/** 데모에서 코드가 타이핑되는 속도를 이만큼 늦춘다.
 *
 *  기본 편집 애니메이션은 3자/16ms(≈187자/초)라, 데모가 바꾸는 42자가 **224ms** 만에
 *  끝난다. 실제 작업 중에는 그게 맞다 — 편집이 수십 개씩 이어지니 빨라야 한다. 하지만
 *  첫 실행 데모에서 이건 "코드가 바뀌었다" 가 아니라 "화면이 한 번 깜빡였다" 로 보인다.
 *  editAnimator 의 상수를 낮추면 실제 편집까지 느려지므로, 데모만 배율을 준다. */
export const DEMO_TYPE_SLOWDOWN = 7;

/** 코드가 바뀔 때 에디터 글자 크기를 이만큼 키운다(px). 원래 크기는 데모가 끝나면 되돌린다.
 *
 *  CSS transform 으로 확대하면 글자가 흐려진다. 폰트 크기를 올리면 Monaco 가 다시 그려서
 *  선명한 채로 커진다 — "좀 더 자세하게" 가 말 그대로 성립한다. */
export const DEMO_ZOOM_FONT = 18;
/** 확대·복귀에 쓰는 시간(ms). 한 번에 튀면 확대가 아니라 화면 전환으로 읽힌다. */
export const DEMO_ZOOM_MS = 900;

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
