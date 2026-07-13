/** 테마 토큰 — 온보딩 선택이 IDE 전체에 실제 적용된다 */

export interface ThemeTokens {
  name: string;
  bgRoot: string; bgPanel: string; bgEditor: string; bgCard: string; bgDock: string;
  bgPopup: string; bdPopup: string;
  fg: string; fgCode: string; fgSub: string; fgSub2: string;
  fgDim: string; fgDim2: string; fgDim3: string;
  accent: string; accentHi: string;
  onAccent: string;
  /** 헤어라인/호버 오버레이 (다크=흰 알파, 라이트=검정 알파) */
  w03: string; w04: string; w05: string; w06: string; w07: string;
  w08: string; w10: string; w12: string; w14: string;
  /** 팝업/캡슐 그림자, 은은한 액센트 배경 */
  shadowPop: string; shadowSoft: string; accentSoft: string;
  monaco: string;
}

export const THEME_TOKENS: Record<string, ThemeTokens> = {
  feldgrau: {
    name: "Feldgrau",
    bgRoot: "#0C0E0D", bgPanel: "#101312", bgEditor: "#0E100F", bgCard: "#151917", bgDock: "#0A0C0B",
    bgPopup: "#181C1A", bdPopup: "#2A302C",
    fg: "#D5DAD5", fgCode: "#C4CBC4", fgSub: "#9AA59C", fgSub2: "#8B948C",
    fgDim: "#5A635C", fgDim2: "#4B534D", fgDim3: "#3A403C",
    accent: "#8FA893", accentHi: "#A9BCA9",
    onAccent: "#0C0E0D",
    w03: "rgba(255,255,255,.03)", w04: "rgba(255,255,255,.04)", w05: "rgba(255,255,255,.05)",
    w06: "rgba(255,255,255,.06)", w07: "rgba(255,255,255,.07)", w08: "rgba(255,255,255,.08)",
    w10: "rgba(255,255,255,.1)", w12: "rgba(255,255,255,.12)", w14: "rgba(255,255,255,.14)",
    shadowPop: "0 12px 32px rgba(0,0,0,.55)", shadowSoft: "0 5px 16px rgba(0,0,0,.5)",
    accentSoft: "rgba(143,168,147,.14)",
    monaco: "feldgrau",
  },
  graphite: {
    name: "Graphite",
    bgRoot: "#0F1013", bgPanel: "#14151A", bgEditor: "#121316", bgCard: "#191B21", bgDock: "#0C0D10",
    bgPopup: "#1C1E24", bdPopup: "#2E3138",
    fg: "#DADCE2", fgCode: "#C8CBD2", fgSub: "#A2A6B0", fgSub2: "#8F939E",
    fgDim: "#63666E", fgDim2: "#53565E", fgDim3: "#41434A",
    accent: "#9AA3B2", accentHi: "#B4BCC9",
    onAccent: "#0F1013",
    w03: "rgba(255,255,255,.03)", w04: "rgba(255,255,255,.04)", w05: "rgba(255,255,255,.05)",
    w06: "rgba(255,255,255,.06)", w07: "rgba(255,255,255,.07)", w08: "rgba(255,255,255,.08)",
    w10: "rgba(255,255,255,.1)", w12: "rgba(255,255,255,.12)", w14: "rgba(255,255,255,.14)",
    shadowPop: "0 12px 32px rgba(0,0,0,.55)", shadowSoft: "0 5px 16px rgba(0,0,0,.5)",
    accentSoft: "rgba(154,163,178,.16)",
    monaco: "feldgrau",
  },
  paper: {
    name: "Paper",
    // 따뜻한 종이 톤 — 순백 대신 미색, 패널은 한 단계 어둡게 층 분리
    bgRoot: "#F3F1EA", bgPanel: "#EAE7DE", bgEditor: "#FAF8F2", bgCard: "#FFFFFF", bgDock: "#E4E1D7",
    bgPopup: "#FFFFFF", bdPopup: "#CFCABD",
    fg: "#20241F", fgCode: "#2E332C", fgSub: "#4E5449", fgSub2: "#646A5E",
    fgDim: "#83887B", fgDim2: "#9BA090", fgDim3: "#BBBFB1",
    accent: "#4E6A55", accentHi: "#3D5745",
    onAccent: "#FFFFFF",
    w03: "rgba(40,45,35,.04)", w04: "rgba(40,45,35,.055)", w05: "rgba(40,45,35,.07)",
    w06: "rgba(40,45,35,.09)", w07: "rgba(40,45,35,.105)", w08: "rgba(40,45,35,.12)",
    w10: "rgba(40,45,35,.14)", w12: "rgba(40,45,35,.17)", w14: "rgba(40,45,35,.2)",
    shadowPop: "0 10px 28px rgba(60,60,45,.18)", shadowSoft: "0 4px 14px rgba(60,60,45,.14)",
    accentSoft: "rgba(78,106,85,.13)",
    monaco: "schutz-paper",
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
  r.setProperty("--accent-hi", t.accentHi);
  r.setProperty("--on-accent", t.onAccent);
  r.setProperty("--w03", t.w03); r.setProperty("--w04", t.w04); r.setProperty("--w05", t.w05);
  r.setProperty("--w06", t.w06); r.setProperty("--w07", t.w07); r.setProperty("--w08", t.w08);
  r.setProperty("--w10", t.w10); r.setProperty("--w12", t.w12); r.setProperty("--w14", t.w14);
  r.setProperty("--shadow-pop", t.shadowPop);
  r.setProperty("--shadow-soft", t.shadowSoft);
  r.setProperty("--accent-soft", t.accentSoft);
}

export function monacoThemeOf(id: string): string {
  return (THEME_TOKENS[id] ?? THEME_TOKENS.feldgrau).monaco;
}
