// 사용법 스포트라이트 투어 — 실제 UI 요소(data-tour)를 하이라이트하며 단계별 안내.
//
// App 을 import 하지 않는다. 단계가 패널을 열어야 할 때는 아래 TourHost 를 통해서만
// 앱을 건드린다 — 그래야 이 파일이 순수하게 남고, 단계 목록을 읽는 것만으로 투어가
// 무엇을 하는지 알 수 있다.

/** 투어가 앱에 요구하는 최소 능력. App 이 이걸 구현해 넘긴다. */
export interface TourHost {
  /** 좌측 패널 탭 전환 — Git·확장처럼 평소 안 보이는 패널을 띄운다. */
  showLeftTab(tab: string): void;
  /** 터미널 독 열기/닫기. */
  showTerminal(open: boolean): void;
  hasWorkspace(): boolean;
  /** 지금 어떤 모양으로 서 있는지. 에이전트 모드엔 레일도 트리도 탭도 없어서
   *  그것들을 가리키는 단계는 앵커가 아예 없다 — when 으로 미리 걸러낸다.
   *  (앵커 검사만 믿으면 단계가 조용히 건너뛰어져 진행 번호만 이상해진다.) */
  mode(): "editor" | "agent";
  /** 에이전트 모드의 사이드바 탭(최근 항목 ↔ 아티팩트). */
  showAsideTab(tab: "recents" | "artifacts"): void;
  /** 에이전트 모드에서 코드를 오른쪽에 띄운다. 닫혀 있으면 그 열이 아예 없어
   *  앵커가 크기 0 이 되고, 단계가 조용히 중앙 카드로 퇴화한다. */
  showSide(open: boolean): void;
}

export type Placement = "right" | "left" | "below" | "above" | "center";

export interface TourStep {
  /** 안정 식별자. 순서를 바꿔도 저장된 진행 위치가 엉키지 않게 인덱스 대신 이걸 쓴다. */
  id: string;
  /** data-tour 앵커 (null 이면 화면 중앙 카드) */
  anchor: string | null;
  titleKey: string;
  bodyKey: string;
  /**
   * 앵커를 화면에 띄우는 준비 동작. 안 보이는 패널 안에 있는 앵커는 이게 없으면
   * anchorRect 가 null 을 돌려주고, 예전엔 그대로 중앙 카드로 조용히 퇴화했다
   * ("왜 아무것도 강조가 안 되지").
   */
  before?: (host: TourHost) => void;
  /** 이 단계를 보여줄 조건. 거짓이면 건너뛴다. */
  when?: (host: TourHost) => boolean;
  /** 카드 위치 선호. 미지정이면 우측 우선 자동 배치. */
  placement?: Placement;
  /**
   * 카드에 붙는 뼈대 그림에서 강조할 자리(tourFigure.tsx).
   *
   *  스포트라이트는 실물을 비추지만 실물은 그 순간 화면에 있는 것에 따라 달라 보인다 —
   *  트리가 비었거나 검토 패널이 비면 무엇이 강조된 건지 알 수 없다. 뼈대는 늘 같은
   *  모양이라 "여기가 그 자리다" 가 흔들리지 않는다.
   *
   *  없으면 그림 없이 글만 나온다(환영·마무리처럼 자리를 가리키지 않는 단계).
   */
  figure?: string;
}

export const TOUR_STEPS: TourStep[] = [
  // 환영·마무리는 어느 한 곳을 짚지 않지만 **화면 전체** 그림을 준다 — 모든 카드가 같은
  // 크기의 그림을 가져야 단계를 넘길 때 제목·본문이 위아래로 흔들리지 않는다(overview).
  { id: "welcome", figure: "overview", anchor: null, titleKey: "tour.welcome.title", bodyKey: "tour.welcome.body" },

  // ── 에디터 모드 트랙 ────────────────────────────────────────────────
  // 레일은 트리·소스컨트롤·디버그·확장 넷의 입구다. 넷을 각각 한 단계씩 주면
  // 투어가 메뉴 낭독이 되므로, 입구를 한 번 짚고 본문에서 넷을 다 부른다.
  { id: "rail", figure: "rail", when: h => h.mode() === "editor", anchor: "rail", titleKey: "tour.rail.title", bodyKey: "tour.rail.body", placement: "right" },
  {
    id: "tree", figure: "left", anchor: "left-panel", titleKey: "tour.tree.title", bodyKey: "tour.tree.body",
    before: h => h.showLeftTab("tree"), when: h => h.mode() === "editor", placement: "right",
  },
  // 편집기와 Ctrl+K 를 한 단계로 묶는다. 같은 곳을 두 번 가리키면 진도가 안 나가는
  // 느낌이 들고, 둘은 어차피 "여기서 고친다" 는 한 이야기다.
  { id: "editor", figure: "editor", when: h => h.mode() === "editor", anchor: "editor", titleKey: "tour.editor.title", bodyKey: "tour.editor.body" },
  { id: "chat", figure: "chat", when: h => h.mode() === "editor", anchor: "chat", titleKey: "tour.chat.title", bodyKey: "tour.chat.body", placement: "right" },
  { id: "agents", figure: "right", when: h => h.mode() === "editor", anchor: "agents", titleKey: "tour.agents.title", bodyKey: "tour.agents.body", placement: "left" },
  { id: "review", figure: "right", when: h => h.mode() === "editor", anchor: "review", titleKey: "tour.review.title", bodyKey: "tour.review.body", placement: "left" },
  {
    id: "git", figure: "left", anchor: "left-panel", titleKey: "tour.git.title", bodyKey: "tour.git.body",
    before: h => h.showLeftTab("git"),
    when: h => h.mode() === "editor" && h.hasWorkspace(), placement: "right",
  },

  // ── 에이전트 모드 트랙 ──────────────────────────────────────────────
  // 예전엔 이 모드에 단계가 7개뿐이었고 그나마 절반이 공용 크롬이었다. 첫 실행에서
  // 고를 수 있게 해놓고 고른 쪽을 안 가르치면, 고른 사람일수록 덜 배우게 된다.
  { id: "agChat", figure: "conv", when: h => h.mode() === "agent", anchor: "chat", titleKey: "tour.agChat.title", bodyKey: "tour.agChat.body", placement: "center" },
  { id: "agComposer", figure: "composer", when: h => h.mode() === "agent", anchor: "composer", titleKey: "tour.agComposer.title", bodyKey: "tour.agComposer.body", placement: "above" },
  { id: "agAside", figure: "aside", when: h => h.mode() === "agent", anchor: "aside", titleKey: "tour.agAside.title", bodyKey: "tour.agAside.body", placement: "right" },
  {
    id: "agRecents", figure: "aside", anchor: "recents", titleKey: "tour.agRecents.title", bodyKey: "tour.agRecents.body",
    before: h => h.showAsideTab("recents"), when: h => h.mode() === "agent", placement: "right",
  },
  {
    id: "agArtifacts", figure: "aside", anchor: "recents", titleKey: "tour.agArtifacts.title", bodyKey: "tour.agArtifacts.body",
    before: h => h.showAsideTab("artifacts"), when: h => h.mode() === "agent", placement: "right",
  },
  {
    // 에이전트 모드에서 .vtEditor 는 **오른쪽 산출물 패널**이다. 같은 앵커가 모드마다
    // 다른 것을 가리킨다 — 그래서 이 단계와 위 "editor" 단계는 서로 배타적이다.
    id: "agSide", figure: "side", anchor: "editor", titleKey: "tour.agSide.title", bodyKey: "tour.agSide.body",
    before: h => { h.showAsideTab("recents"); h.showSide(true); },
    when: h => h.mode() === "agent", placement: "left",
  },
  {
    id: "agImport", figure: "aside", anchor: "aside", titleKey: "tour.agImport.title", bodyKey: "tour.agImport.body",
    before: h => h.showSide(false), when: h => h.mode() === "agent", placement: "right",
  },
  { id: "agReview", figure: "conv", when: h => h.mode() === "agent", anchor: "chat", titleKey: "tour.agReview.title", bodyKey: "tour.agReview.body", placement: "center" },

  // ── 공용 꼬리 ───────────────────────────────────────────────────────
  {
    id: "terminal", figure: "terminal", anchor: "terminal", titleKey: "tour.terminal.title", bodyKey: "tour.terminal.body",
    before: h => h.showTerminal(true), placement: "above",
  },
  {
    id: "navigate", figure: "menubar", anchor: "menubar", titleKey: "tour.navigate.title", bodyKey: "tour.navigate.body",
    before: h => { h.showTerminal(false); if (h.mode() === "editor") h.showLeftTab("tree"); }, placement: "below",
  },
  { id: "mcp", figure: "menubar", anchor: "mcp", titleKey: "tour.mcp.title", bodyKey: "tour.mcp.body", placement: "below" },
  // 모드 전환은 두 트랙을 잇는 다리다 — 방금 배운 것 말고 **다른 모양도 있다**.
  { id: "mode", figure: "mode", anchor: "mode", titleKey: "tour.mode.title", bodyKey: "tour.mode.body", placement: "below" },
  { id: "done", figure: "overview", anchor: "menubar", titleKey: "tour.done.title", bodyKey: "tour.done.body", placement: "below" },
];

/** 지금 모양에서 **실제로 보게 될** 단계들.
 *
 *  진행 표시가 이걸 써야 한다. TOUR_STEPS.length 를 그대로 쓰면 에이전트 모드에서
 *  "10 / 21" 이 뜬다 — 21 은 두 트랙을 합친 수라 어느 쪽에서도 도달하지 않고, 번호는
 *  건너뛴 만큼 튄다. 사용자에게는 진행이 고장 난 것으로 보인다.
 *
 *  when 이 host 를 보므로(모드·워크스페이스 유무) 이 목록은 상황에 따라 달라진다.
 *  그래서 상수가 아니라 함수다. */
export function visibleSteps(host: TourHost): TourStep[] {
  return TOUR_STEPS.filter(s => !s.when || s.when(host));
}

/** 보이는 단계들 안에서 이 단계가 몇 번째인가(1부터). 못 찾으면 0. */
export function visiblePos(host: TourHost, id: string): number {
  return visibleSteps(host).findIndex(s => s.id === id) + 1;
}

export interface SpotRect { x: number; y: number; w: number; h: number; }

/** data-tour 앵커의 화면 사각형(여백 포함). 요소 없거나 크기 0이면 null. */
export function anchorRect(anchor: string | null, pad = 6): SpotRect | null {
  if (!anchor) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // 한쪽만 0 이어도 하이라이트할 게 없다. 예전엔 && 라서 높이 0 으로 접힌 터미널
  // 독이 사각형을 돌려주고 얇은 선만 빛났다.
  if (r.width === 0 || r.height === 0) return null;
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
}

/**
 * 카드 위치. placement 를 주면 그쪽을 먼저 시도하고, 뷰포트를 벗어나면 자동 배치로
 * 넘어간다 — 선호를 존중하되 화면 밖으로 내보내지는 않는다.
 */
export function cardPos(
  rect: SpotRect | null, cardW: number, cardH: number, placement?: Placement,
): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 14;
  if (!rect || placement === "center") {
    return { left: Math.round((vw - cardW) / 2), top: Math.round((vh - cardH) / 2) };
  }

  const fits = (l: number, t: number) => l >= 8 && t >= 8 && l + cardW <= vw - 8 && t + cardH <= vh - 8;
  const cand: Record<Exclude<Placement, "center">, { left: number; top: number }> = {
    right: { left: rect.x + rect.w + gap, top: rect.y },
    left: { left: rect.x - cardW - gap, top: rect.y },
    below: { left: rect.x, top: rect.y + rect.h + gap },
    above: { left: rect.x, top: rect.y - cardH - gap },
  };
  // 위에서 "center" 는 이미 걸러졌다 — placement 는 방향 넷 중 하나이거나 미지정.
  const AUTO = ["right", "below", "above", "left"] as const;
  const order = placement ? [placement, ...AUTO.filter(p => p !== placement)] : [...AUTO];

  for (const p of order) {
    const c = cand[p];
    if (fits(c.left, c.top)) return { left: Math.round(c.left), top: Math.round(c.top) };
  }
  // 어디에도 안 맞으면 우측 후보를 뷰포트 안으로 밀어넣는다. 8px 하한이 이기도록
  // max 를 나중에 — 뷰포트가 카드보다 작아도 왼쪽/위가 잘리지 않게.
  const c = cand.right;
  return {
    left: Math.round(Math.max(8, Math.min(c.left, vw - cardW - 8))),
    top: Math.round(Math.max(8, Math.min(c.top, vh - cardH - 8))),
  };
}
