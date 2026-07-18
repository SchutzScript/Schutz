// 사용법 스포트라이트 투어 — 실제 UI 요소(data-tour)를 하이라이트하며 단계별 안내.
export interface TourStep {
  /** data-tour 앵커 (null 이면 화면 중앙 카드) */
  anchor: string | null;
  titleKey: string;
  bodyKey: string;
}

export const TOUR_STEPS: TourStep[] = [
  { anchor: null, titleKey: "tour.welcome.title", bodyKey: "tour.welcome.body" },
  { anchor: "rail-tree", titleKey: "tour.tree.title", bodyKey: "tour.tree.body" },
  { anchor: "editor", titleKey: "tour.editor.title", bodyKey: "tour.editor.body" },
  { anchor: "chat", titleKey: "tour.chat.title", bodyKey: "tour.chat.body" },
  { anchor: "mcp", titleKey: "tour.mcp.title", bodyKey: "tour.mcp.body" },
  { anchor: "agents", titleKey: "tour.agents.title", bodyKey: "tour.agents.body" },
];

export interface SpotRect { x: number; y: number; w: number; h: number; }

/** data-tour 앵커의 화면 사각형(여백 포함). 요소 없거나 크기 0이면 null. */
export function anchorRect(anchor: string | null, pad = 6): SpotRect | null {
  if (!anchor) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
}

/** 카드 위치 — 스팟 우측 우선, 화면 밖이면 아래/위/중앙으로. 뷰포트 안으로 클램프. */
export function cardPos(rect: SpotRect | null, cardW: number, cardH: number): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 14;
  if (!rect) return { left: Math.round((vw - cardW) / 2), top: Math.round((vh - cardH) / 2) };
  let left = rect.x + rect.w + gap;
  let top = rect.y;
  if (left + cardW > vw - 8) {
    left = rect.x;                 // 아래쪽 배치
    top = rect.y + rect.h + gap;
    if (top + cardH > vh - 8) top = rect.y - cardH - gap; // 위쪽
  }
  // 8px 하한이 이기도록 순서 조정 (뷰포트가 카드보다 작아도 왼쪽/위가 잘리지 않게)
  left = Math.max(8, Math.min(left, vw - cardW - 8));
  top = Math.max(8, Math.min(top, vh - cardH - 8));
  return { left: Math.round(left), top: Math.round(top) };
}
