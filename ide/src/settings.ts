/** 에디터·자율성 환경설정 — 온보딩과 설정 모달이 공유하는 단일 소스.
 *  theme.ts의 get/set 패턴을 그대로 따른다 (localStorage, 예외 안전). */

/** 폴백 — 일본어 가나/한자(SUIT/Pretendard 미포함)는 시스템 JP 폰트로, 장식 글리프(✕ ↻ ◆ ✂ ＠ ⇆ ✓ ⚠️)는 심볼/이모지로. */
const SYM = "'Yu Gothic UI', 'Yu Gothic', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'MS PGothic', 'Segoe UI Symbol', 'Segoe UI Emoji', 'Apple Color Emoji'";
/** 코드 폰트 id → 실제 font-family (온보딩 CODEFONTS 키와 일치: plex / jb) */
export const CODE_FONTS: Record<string, { name: string; stack: string }> = {
  plex: { name: "IBM Plex Mono", stack: `'IBM Plex Mono', ${SYM}, monospace` },
  jb: { name: "JetBrains Mono", stack: `'JetBrains Mono', ${SYM}, monospace` },
};
/** UI 폰트 id → 실제 font-family (온보딩 UIFONTS 키와 일치: suit / pretendard) */
export const UI_FONTS: Record<string, { name: string; stack: string }> = {
  suit: { name: "SUIT", stack: `'SUIT Variable', ${SYM}, sans-serif` },
  pretendard: { name: "Pretendard", stack: `'Pretendard Variable', Pretendard, ${SYM}, sans-serif` },
};
export const KEYMAPS: [string, string][] = [["intellij", "IntelliJ"], ["vscode", "VS Code"], ["vim", "Vim"]];

export interface EditorPrefs {
  codeFont: string; // plex | jb
  fontSize: number; // 11..16
  uiFont: string;   // suit | pretendard
  keymap: string;   // intellij | vscode | vim
  wordWrap: boolean;
  minimap: boolean;
  formatOnSave: boolean;
  autoSave: "off" | "afterDelay" | "onFocusChange";
  tabSize: number;              // 2 | 4 | 8
  lineNumbers: boolean;         // 줄 번호 표시
  cursorStyle: "line" | "block" | "underline";
  renderWhitespace: boolean;    // 공백 표시
}
export interface Autonomy {
  policy: string; // manual | balanced | auto
  rules: { docs: boolean; tests: boolean; deps: boolean };
}

const ED_KEY = "schutz.editor";
const AU_KEY = "schutz.autonomy";

const ED_DEFAULT: EditorPrefs = { codeFont: "plex", fontSize: 13, uiFont: "suit", keymap: "intellij", wordWrap: false, minimap: false, formatOnSave: false, autoSave: "off", tabSize: 4, lineNumbers: true, cursorStyle: "line", renderWhitespace: false };
const AU_DEFAULT: Autonomy = { policy: "manual", rules: { docs: true, tests: true, deps: false } };

export function getEditorPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(ED_KEY);
    if (!raw) return { ...ED_DEFAULT };
    const p = JSON.parse(raw);
    return {
      codeFont: CODE_FONTS[p.codeFont] ? p.codeFont : ED_DEFAULT.codeFont,
      fontSize: typeof p.fontSize === "number" && p.fontSize >= 9 && p.fontSize <= 28 ? p.fontSize : ED_DEFAULT.fontSize,
      uiFont: UI_FONTS[p.uiFont] ? p.uiFont : ED_DEFAULT.uiFont,
      keymap: ["intellij", "vscode", "vim"].includes(p.keymap) ? p.keymap : ED_DEFAULT.keymap,
      wordWrap: !!p.wordWrap,
      minimap: !!p.minimap,
      formatOnSave: !!p.formatOnSave,
      autoSave: ["off", "afterDelay", "onFocusChange"].includes(p.autoSave) ? p.autoSave : "off",
      tabSize: [2, 4, 8].includes(p.tabSize) ? p.tabSize : 4,
      lineNumbers: p.lineNumbers !== false,
      cursorStyle: ["line", "block", "underline"].includes(p.cursorStyle) ? p.cursorStyle : "line",
      renderWhitespace: !!p.renderWhitespace,
    };
  } catch { return { ...ED_DEFAULT }; }
}

export function setEditorPrefs(p: Partial<EditorPrefs>): void {
  try {
    const next = { ...getEditorPrefs(), ...p };
    localStorage.setItem(ED_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function getAutonomy(): Autonomy {
  try {
    const raw = localStorage.getItem(AU_KEY);
    if (!raw) return { policy: AU_DEFAULT.policy, rules: { ...AU_DEFAULT.rules } };
    const a = JSON.parse(raw);
    return {
      policy: ["manual", "balanced", "auto"].includes(a.policy) ? a.policy : AU_DEFAULT.policy,
      rules: {
        docs: !!(a.rules?.docs ?? AU_DEFAULT.rules.docs),
        tests: !!(a.rules?.tests ?? AU_DEFAULT.rules.tests),
        deps: !!(a.rules?.deps ?? AU_DEFAULT.rules.deps),
      },
    };
  } catch { return { policy: AU_DEFAULT.policy, rules: { ...AU_DEFAULT.rules } }; }
}

export function setAutonomy(a: Partial<Autonomy>): void {
  try {
    const cur = getAutonomy();
    const next = { policy: a.policy ?? cur.policy, rules: { ...cur.rules, ...(a.rules ?? {}) } };
    localStorage.setItem(AU_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function codeFontStack(id?: string): string {
  return (CODE_FONTS[id ?? getEditorPrefs().codeFont] ?? CODE_FONTS.plex).stack;
}
export function uiFontStack(id?: string): string {
  return (UI_FONTS[id ?? getEditorPrefs().uiFont] ?? UI_FONTS.suit).stack;
}

/** UI·코드 폰트를 문서 전역 CSS 변수로 적용 (--font-ui / --font-code → 전 컴포넌트가 참조) */
export function applyUiFont(uiFont?: string, codeFont?: string): void {
  try {
    const root = document.documentElement.style;
    root.setProperty("--font-ui", uiFontStack(uiFont));
    root.setProperty("--font-code", codeFontStack(codeFont));
  } catch { /* ignore */ }
}

/** 자율성 규칙 매칭 — 경로가 어느 자동수락 범주에 드는지 판정.
 *  balanced 정책에서 해당 범주 rule이 켜져 있으면 자동 수락한다. */
export function autoAcceptFor(rel: string, a: Autonomy): boolean {
  if (a.policy === "auto") return true;
  if (a.policy !== "balanced") return false;
  const p = rel.toLowerCase();
  const isDocs = p.endsWith(".md") || p.endsWith(".mdx") || p.endsWith(".txt") || p.startsWith("docs/") || p.includes("/docs/");
  const isTests = /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[a-z]+$/.test(p);
  const isDeps = /(^|\/)package\.json$/.test(p) || /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p);
  if (isTests) return a.rules.tests; // 테스트를 문서보다 먼저 판정 (foo.test.md 같은 경우)
  if (isDocs) return a.rules.docs;
  if (isDeps) return a.rules.deps;
  return false;
}

/* ── 활성 VS Code 확장 테마/아이콘테마 영속화 (재시작 후 자동 복원) ───────── */
const VSX_THEME_KEY = "schutz.vsxTheme";
const ICON_THEME_KEY = "schutz.iconTheme";

/** 활성 가져온-테마의 Monaco 테마 id (없으면 "" = 내장 테마 사용) */
export function getActiveVsxTheme(): string {
  try { return localStorage.getItem(VSX_THEME_KEY) || ""; } catch { return ""; }
}
export function setActiveVsxTheme(id: string): void {
  try { id ? localStorage.setItem(VSX_THEME_KEY, id) : localStorage.removeItem(VSX_THEME_KEY); } catch { /* ignore */ }
}

export interface ActiveIconTheme { extId: string; path: string; label: string; }
/** 활성 아이콘 테마(확장 id + 테마경로 + 라벨). null이면 내장 아이콘 */
export function getActiveIconTheme(): ActiveIconTheme | null {
  try { const r = localStorage.getItem(ICON_THEME_KEY); return r ? JSON.parse(r) as ActiveIconTheme : null; } catch { return null; }
}
export function setActiveIconTheme(v: ActiveIconTheme | null): void {
  try { v ? localStorage.setItem(ICON_THEME_KEY, JSON.stringify(v)) : localStorage.removeItem(ICON_THEME_KEY); } catch { /* ignore */ }
}
