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
    monaco: "feldgrau",
  },
  paper: {
    name: "Paper",
    bgRoot: "#F7F6F2", bgPanel: "#EFEDE7", bgEditor: "#FBFAF7", bgCard: "#FFFFFF", bgDock: "#ECEAE4",
    bgPopup: "#FFFFFF", bdPopup: "#D8D5CC",
    fg: "#2A2D2A", fgCode: "#333632", fgSub: "#565B56", fgSub2: "#6B706A",
    fgDim: "#8A8D86", fgDim2: "#A2A49D", fgDim3: "#C0C2BA",
    accent: "#5F7565", accentHi: "#4C6152",
    onAccent: "#FFFFFF",
    w03: "rgba(0,0,0,.03)", w04: "rgba(0,0,0,.045)", w05: "rgba(0,0,0,.055)",
    w06: "rgba(0,0,0,.07)", w07: "rgba(0,0,0,.08)", w08: "rgba(0,0,0,.09)",
    w10: "rgba(0,0,0,.11)", w12: "rgba(0,0,0,.13)", w14: "rgba(0,0,0,.16)",
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
}

export function monacoThemeOf(id: string): string {
  return (THEME_TOKENS[id] ?? THEME_TOKENS.feldgrau).monaco;
}
