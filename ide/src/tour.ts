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
}

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", anchor: null, titleKey: "tour.welcome.title", bodyKey: "tour.welcome.body" },

  // ── 둘러보기: 어디에 무엇이 있는가 ──────────────────────────────────
  { id: "rail", when: h => h.mode() === "editor", anchor: "rail", titleKey: "tour.rail.title", bodyKey: "tour.rail.body", placement: "right" },
  {
    id: "tree", anchor: "left-panel", titleKey: "tour.tree.title", bodyKey: "tour.tree.body",
    before: h => h.showLeftTab("tree"), when: h => h.mode() === "editor", placement: "right",
  },
  { id: "editor", when: h => h.mode() === "editor", anchor: "editor", titleKey: "tour.editor.title", bodyKey: "tour.editor.body" },

  // ── 핵심: AI 가 코드를 고치고, 사용자가 받아들인다 ──────────────────
  // Ctrl+K 와 변경 검토가 이 앱의 간판인데 예전 투어엔 언급조차 없었다.
  { id: "inlineEdit", when: h => h.mode() === "editor", anchor: "editor", titleKey: "tour.inlineEdit.title", bodyKey: "tour.inlineEdit.body", placement: "left" },
  { id: "chat", anchor: "chat", titleKey: "tour.chat.title", bodyKey: "tour.chat.body", placement: "right" },
  { id: "agents", when: h => h.mode() === "editor", anchor: "agents", titleKey: "tour.agents.title", bodyKey: "tour.agents.body", placement: "left" },
  { id: "review", when: h => h.mode() === "editor", anchor: "review", titleKey: "tour.review.title", bodyKey: "tour.review.body", placement: "left" },
  { id: "runCommand", anchor: "chat", titleKey: "tour.runCommand.title", bodyKey: "tour.runCommand.body", placement: "right" },

  // ── 개발 환경 ───────────────────────────────────────────────────────
  {
    id: "terminal", anchor: "terminal", titleKey: "tour.terminal.title", bodyKey: "tour.terminal.body",
    before: h => h.showTerminal(true), placement: "above",
  },
  {
    id: "git", anchor: "left-panel", titleKey: "tour.git.title", bodyKey: "tour.git.body",
    before: h => { h.showTerminal(false); h.showLeftTab("git"); },
    when: h => h.mode() === "editor" && h.hasWorkspace(), placement: "right",
  },
  {
    id: "ext", anchor: "left-panel", titleKey: "tour.ext.title", bodyKey: "tour.ext.body",
    before: h => h.showLeftTab("ext"), when: h => h.mode() === "editor", placement: "right",
  },
  {
    id: "navigate", anchor: "menubar", titleKey: "tour.navigate.title", bodyKey: "tour.navigate.body",
    before: h => { if (h.mode() === "editor") h.showLeftTab("tree"); }, placement: "below",
  },
  { id: "mcp", anchor: "mcp", titleKey: "tour.mcp.title", bodyKey: "tour.mcp.body", placement: "below" },
  { id: "done", anchor: "menubar", titleKey: "tour.done.title", bodyKey: "tour.done.body", placement: "below" },
];

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
