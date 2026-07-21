// 다국어(i18n) — 경량 t() + 언어 사전. localStorage 영속(theme.ts get/set 패턴).
// 클래스 컴포넌트는 onLangChange 구독 → forceUpdate 로 리렌더한다.
import { MESSAGES } from "./i18n/messages";

export type Lang = "ko" | "en" | "de" | "ja";
/** 지원 언어 [코드, 표시명] — 설정/온보딩 선택기에서 사용 */
export const LANGS: [Lang, string][] = [["ko", "한국어"], ["en", "English"], ["de", "Deutsch"], ["ja", "日本語"]];
const LANG_KEY = "schutz.lang";
const FALLBACK: Lang = "ko";
const ALL: Lang[] = ["ko", "en", "de", "ja"];

/** 브라우저 언어에서 초기 언어 추정 (미지원이면 한국어) */
function detect(): Lang {
  try {
    const n = (navigator.language || "").toLowerCase();
    for (const l of ALL) if (n.startsWith(l)) return l;
  } catch { /* ignore */ }
  return "ko";
}

let current: Lang = (() => {
  try { const v = localStorage.getItem(LANG_KEY); if (v && (ALL as string[]).includes(v)) return v as Lang; } catch { /* ignore */ }
  return detect();
})();
// 감지된 초기 언어를 즉시 영속화 — setLang(동일 언어)이 조기 반환해도 선택이 유지되도록
try { localStorage.setItem(LANG_KEY, current); } catch { /* ignore */ }

const listeners = new Set<() => void>();
/** 언어 변경 구독 → 해제 함수 반환. 화면을 그리는 쪽은 **반드시** 이걸 구독해야 한다 —
 *  setLang 은 연출 때문에 커밋을 늦추므로, 호출 직후의 forceUpdate 는 아직 옛 언어를 그린다. */
export function onLangChange(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function getLang(): Lang { return current; }

// ── 전환 연출 ──────────────────────────────────────────────────────────────
// 두 박자다: 흐려서 내보내고 → 바닥에서 갈아끼우고 → 선명하게 들인다.
//
// 예전엔 들어오는 쪽만 페이드했다. 그러면 옛 글자가 100% 불투명한 상태에서 한 프레임에
// 갈리고, 한국어→독일어처럼 글자 폭이 크게 달라지는 조합에선 그 리플로가 가장 잘 보이는
// 순간에 일어난다. 페이드가 덮는 건 색이지 레이아웃이 아니라서, 순서가 바뀌어야 했다.
//
// 연출을 i18n 이 소유하는 이유: 진입점이 셋(설정·온보딩·오프닝 세팅)인데 예전엔 App 만
// 자기 리스너에서 클래스를 얹었다. 그래서 첫 실행 오프닝에서 언어를 고르면 아무 일도
// 일어나지 않았다 — 정확히 사람이 이 앱을 처음 만지는 자리에서.
const SWAP_OUT_MS = 150;
const SWAP_IN_MS = 320;
let swapTimer: ReturnType<typeof setTimeout> | undefined;
let swapRaf = 0;
/** 연출 중 예약된 언어 — 도중에 다시 눌러도 마지막 선택으로 수렴한다. */
let queued: Lang | null = null;

/** CSS 의 `animation-duration:.01ms !important` 는 JS 타이머를 막지 못한다 — 직접 묻는다.
 *  안 물으면 모션 최소화에서 화면이 바닥값에 붙은 채 150ms 를 서 있게 된다. */
function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
function swapRoot(): HTMLElement | null {
  try { return document.getElementById("root") ?? document.body ?? null; } catch { return null; }
}

export function setLang(l: Lang): void {
  if (!(ALL as string[]).includes(l) || l === (queued ?? current)) return;
  const root = swapRoot();
  if (!root || reducedMotion()) { commitLang(l); return; }

  queued = l;
  clearTimeout(swapTimer);
  cancelAnimationFrame(swapRaf);
  root.classList.remove("sz-lang-in");
  root.classList.add("sz-lang-out");
  swapTimer = setTimeout(() => {
    const next = queued ?? l;
    queued = null;
    commitLang(next);
    // out 은 forwards 라 바닥값을 물고 있다. 새 글자는 그 바닥에서 나타나므로 한 프레임
    // 늦게 클래스를 갈아도 번쩍이지 않는다 — React 가 언제 그리든 안전하다.
    swapRaf = requestAnimationFrame(() => {
      root.classList.remove("sz-lang-out");
      root.classList.add("sz-lang-in");
      swapTimer = setTimeout(() => root.classList.remove("sz-lang-in"), SWAP_IN_MS);
    });
  }, SWAP_OUT_MS);
}

function commitLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  applyLangSideEffects();
  for (const cb of Array.from(listeners)) { try { cb(); } catch { /* ignore */ } }
}

/** <html lang> 동기화 (확장 셰임 env.language 는 getLang()을 직접 읽음) */
function applyLangSideEffects(): void {
  try { document.documentElement.lang = current; } catch { /* ignore */ }
}
/** 첫 페인트 전 1회 호출 (main.tsx) */
export function applyLang(): void { applyLangSideEffects(); }

/** 번역 — 키 조회 → 현재 언어 → ko 폴백 → 키 자체. `{var}` 보간 지원. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = MESSAGES[key];
  if (!entry) {
    try { if ((import.meta as any).env?.DEV) console.warn("[i18n] 누락 키:", key); } catch { /* ignore */ }
    return key;
  }
  let s = entry[current] ?? entry[FALLBACK] ?? key;
  // 단일 패스 치환 — 앞 변수 값에 뒤 변수의 {토큰}이 들어가도 재치환되지 않도록
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
