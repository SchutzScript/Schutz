/** 테마 토큰 — 온보딩 선택이 IDE 전체에 실제 적용된다 */

export interface ThemeTokens {
  name: string;
  bgRoot: string; bgPanel: string; bgEditor: string; bgCard: string; bgDock: string;
  bgPopup: string; bdPopup: string;
  fg: string; fgCode: string; fgSub: string; fgSub2: string;
  fgDim: string; fgDim2: string; fgDim3: string;
  accent: string; accentHi: string;
  onAccent: string;
  /** 시맨틱 — 추가/수락/성공. 브랜드 액센트(세이지)와 색상을 20°+ 벌려
   *  "탈색된 세이지 = 크롬, 선명한 초록 = 실제 의미"가 되도록 분리한다. */
  ok: string; okHi: string;
  /** 헤어라인/호버 오버레이 (다크=흰 알파, 라이트=검정 알파) */
  w03: string; w04: string; w05: string; w06: string; w07: string;
  w08: string; w10: string; w12: string; w14: string;
  /** 팝업/캡슐 그림자, 은은한 액센트 배경 */
  shadowPop: string; shadowSoft: string; accentSoft: string;
  monaco: string;
  /** 로고(밝은 PNG) 필터 — 라이트 테마에선 반전해 보이게 */
  logoFilter: string;
}

export const THEME_TOKENS: Record<string, ThemeTokens> = {
  feldgrau: {
    name: "Feldgrau",
    bgRoot: "#0D100E", bgPanel: "#121615", bgEditor: "#0F1211", bgCard: "#171B19", bgDock: "#0A0D0B",
    bgPopup: "#1A1F1C", bdPopup: "#2E342F",
    fg: "#E4E8E3", fgCode: "#D2D8D1", fgSub: "#B4BEB5", fgSub2: "#A3ADA4",
    fgDim: "#88918A", fgDim2: "#727B74", fgDim3: "#5C645E",
    accent: "#8FA893", accentHi: "#A9BCA9",
    onAccent: "#0C0E0D",
    ok: "#5CB98A", okHi: "#7ACCA2",
    w03: "rgba(255,255,255,.03)", w04: "rgba(255,255,255,.04)", w05: "rgba(255,255,255,.05)",
    w06: "rgba(255,255,255,.06)", w07: "rgba(255,255,255,.07)", w08: "rgba(255,255,255,.08)",
    w10: "rgba(255,255,255,.1)", w12: "rgba(255,255,255,.12)", w14: "rgba(255,255,255,.14)",
    shadowPop: "0 12px 32px rgba(0,0,0,.55)", shadowSoft: "0 5px 16px rgba(0,0,0,.5)",
    accentSoft: "rgba(143,168,147,.14)",
    monaco: "feldgrau",
    logoFilter: "none",
  },
  graphite: {
    name: "Graphite",
    bgRoot: "#0F1013", bgPanel: "#14151A", bgEditor: "#121316", bgCard: "#191B21", bgDock: "#0C0D10",
    bgPopup: "#1C1E24", bdPopup: "#2E3138",
    fg: "#E0E2E8", fgCode: "#CCCFD6", fgSub: "#AEB2BC", fgSub2: "#9DA1AC",
    fgDim: "#868A93", fgDim2: "#71757D", fgDim3: "#5A5D65",
    accent: "#9AA3B2", accentHi: "#B4BCC9",
    ok: "#5CB98A", okHi: "#7ACCA2",
    onAccent: "#0F1013",
    w03: "rgba(255,255,255,.03)", w04: "rgba(255,255,255,.04)", w05: "rgba(255,255,255,.05)",
    w06: "rgba(255,255,255,.06)", w07: "rgba(255,255,255,.07)", w08: "rgba(255,255,255,.08)",
    w10: "rgba(255,255,255,.1)", w12: "rgba(255,255,255,.12)", w14: "rgba(255,255,255,.14)",
    shadowPop: "0 12px 32px rgba(0,0,0,.55)", shadowSoft: "0 5px 16px rgba(0,0,0,.5)",
    accentSoft: "rgba(154,163,178,.16)",
    monaco: "feldgrau",
    logoFilter: "none",
  },
  paper: {
    name: "Paper",
    // 깔끔한 화이트 — 에디터는 순백, 패널은 옅은 뉴트럴 그레이로 층 분리
    bgRoot: "#F4F5F3", bgPanel: "#ECEEEA", bgEditor: "#FFFFFF", bgCard: "#FFFFFF", bgDock: "#E7E9E4",
    bgPopup: "#FFFFFF", bdPopup: "#D3D7CD",
    fg: "#161A15", fgCode: "#1F241F", fgSub: "#3E443B", fgSub2: "#525849",
    fgDim: "#6A7166", fgDim2: "#828978", fgDim3: "#9AA091",
    // 라이트에선 흰 배경 대비를 위해 어둡게(4.5+), 호버(okHi)는 더 어두운 방향
    ok: "#227A53", okHi: "#1A6544",
    accent: "#3F6B4E", accentHi: "#2E5A3D",
    onAccent: "#FFFFFF",
    w03: "rgba(30,40,25,.035)", w04: "rgba(30,40,25,.05)", w05: "rgba(30,40,25,.065)",
    w06: "rgba(30,40,25,.085)", w07: "rgba(30,40,25,.1)", w08: "rgba(30,40,25,.12)",
    w10: "rgba(30,40,25,.145)", w12: "rgba(30,40,25,.17)", w14: "rgba(30,40,25,.2)",
    shadowPop: "0 10px 28px rgba(40,50,35,.16)", shadowSoft: "0 4px 14px rgba(40,50,35,.12)",
    accentSoft: "rgba(63,107,78,.12)",
    monaco: "schutz-paper",
    logoFilter: "invert(0.82) sepia(0.1) saturate(0.6) brightness(0.92)",
  },
};

const KEY = "schutz.theme";

export function getThemeId(): string {
  try {
    const v = localStorage.getItem(KEY) ?? "feldgrau";
    return THEME_TOKENS[v] ? v : "feldgrau";
  } catch {
    return "feldgrau";
  }
}

export function setThemeId(id: string): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

/** CSS 변수로 문서 루트에 주입 */
export function applyTheme(id: string): void {
  const t = THEME_TOKENS[id] ?? THEME_TOKENS.feldgrau;
  const r = document.documentElement.style;
  r.setProperty("--bg-root", t.bgRoot);
  r.setProperty("--bg-panel", t.bgPanel);
  r.setProperty("--bg-editor", t.bgEditor);
  r.setProperty("--bg-card", t.bgCard);
  r.setProperty("--bg-dock", t.bgDock);
  r.setProperty("--bg-popup", t.bgPopup);
  r.setProperty("--bd-popup", t.bdPopup);
  r.setProperty("--fg", t.fg);
  r.setProperty("--fg-code", t.fgCode);
  r.setProperty("--fg-sub", t.fgSub);
  r.setProperty("--fg-sub2", t.fgSub2);
  r.setProperty("--fg-dim", t.fgDim);
  r.setProperty("--fg-dim2", t.fgDim2);
  r.setProperty("--fg-dim3", t.fgDim3);
  r.setProperty("--accent", t.accent);
  r.setProperty("--ok", t.ok);
  r.setProperty("--ok-hi", t.okHi);
  r.setProperty("--accent-hi", t.accentHi);
  r.setProperty("--on-accent", t.onAccent);
  r.setProperty("--w03", t.w03); r.setProperty("--w04", t.w04); r.setProperty("--w05", t.w05);
  r.setProperty("--w06", t.w06); r.setProperty("--w07", t.w07); r.setProperty("--w08", t.w08);
  r.setProperty("--w10", t.w10); r.setProperty("--w12", t.w12); r.setProperty("--w14", t.w14);
  r.setProperty("--shadow-pop", t.shadowPop);
  r.setProperty("--shadow-soft", t.shadowSoft);
  r.setProperty("--accent-soft", t.accentSoft);
  r.setProperty("--logo-filter", t.logoFilter);
  // 데스크톱: OS 타이틀바 버튼(최소화/닫기) 색도 테마 추종
  try { (window as any).schutz?.setOverlay?.(t.bgPanel, t.fgSub); } catch { /* ignore */ }
}

export function monacoThemeOf(id: string): string {
  return (THEME_TOKENS[id] ?? THEME_TOKENS.feldgrau).monaco;
}
