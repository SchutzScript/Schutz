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
/** 언어 변경 구독 → 해제 함수 반환 (App.componentDidMount 에서 forceUpdate 연결) */
export function onLangChange(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function getLang(): Lang { return current; }

export function setLang(l: Lang): void {
  if (!(ALL as string[]).includes(l) || l === current) return;
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
