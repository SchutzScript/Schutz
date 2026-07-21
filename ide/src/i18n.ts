// 다국어(i18n) — 경량 t() + 언어 사전. localStorage 영속(theme.ts get/set 패턴).
// 클래스 컴포넌트는 onLangChange 구독 → forceUpdate 로 리렌더한다.
import { flushSync } from "react-dom";
import { reducedMotion } from "./motion";
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
// 테마를 바꿀 때처럼 — 어두워지지도, 흐려지지도, 깜빡이지도 않고 그냥 갈린다.
//
// 두 번을 헛짚었다. 처음엔 들어오는 쪽만 페이드했다(옛 글자가 100% 불투명한 상태에서 한
// 프레임에 갈리니 리플로가 그대로 보임). 다음엔 흐려서 내보냈다 들였다(이번엔 안 튀지만
// 화면 전체가 눈에 띄게 죽었다 살아난다 — 설정 하나 바꾸는 값으로는 과하다).
//
// 둘 다 같은 착각에서 나왔다. **화면을 가려서** 바뀌는 순간을 숨기려 한 것이다. 뷰 트랜지션은
// 가리지 않는다 — 옛 화면을 스냅샷으로 잡아두고 새 화면을 그 위에 겹쳐 교차 디졸브한다.
// 둘 다 제 밝기 그대로다. 대부분의 픽셀(코드·패널·아이콘)은 양쪽이 같아서 아무 일도 안
// 일어난 것처럼 보이고, 실제로 달라진 글자만 제자리에서 녹아 바뀐다.
//
// 겹침 처리도 브라우저가 한다 — 연출 중에 또 누르면 앞 전환이 스킵되고 새 전환이 선다.
// 그래서 예약 큐도, 타이머도, 클래스 뒷정리도 필요 없다.
//
// 연출을 i18n 이 소유하는 이유: 진입점이 셋(설정·온보딩·오프닝 세팅)인데 예전엔 App 만
// 자기 리스너에서 연출을 걸었다. 그래서 첫 실행 오프닝에서 언어를 고르면 아무 일도
// 일어나지 않았다 — 정확히 사람이 이 앱을 처음 만지는 자리에서.

/** 전환이 예약됐지만 아직 커밋 안 된 언어. 중복 판정은 반드시 이걸 먼저 본다 —
 *  커밋이 늦춰지는 동안 `current` 는 **옛 언어**라, 그것만 보면 "독일어 눌렀다가 곧바로
 *  한국어(=현재 언어)로 되돌리기" 가 조기 반환에 걸려 조용히 씹히고 독일어로 끝난다. */
let pending: Lang | null = null;

export function setLang(l: Lang): void {
  if (!(ALL as string[]).includes(l) || l === (pending ?? current)) return;

  const start = (document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  }).startViewTransition;
  if (reducedMotion() || typeof start !== "function") { commitLang(l); return; }

  pending = l;
  try {
    // flushSync 가 있어야 콜백 안에서 DOM 이 다 갈린다. 비동기로 그리면 브라우저가 아직
    // 옛 화면인 상태를 "새 화면"으로 잡아 아무것도 안 바뀐 디졸브가 된다.
    const vt = start.call(document, () => flushSync(() => commitLang(l)));
    // 연출 중에 또 누르면 앞 전환이 스킵되면서 ready 가 reject 된다 — 정상 경로다.
    void vt.ready.catch(() => { /* ignore */ });
  } catch {
    commitLang(l);   // 연출이 실패해도 언어는 바뀌어야 한다
  }
}

function commitLang(l: Lang): void {
  // 예약분을 먼저 턴다 — 이 커밋이 조기 반환하더라도 다음 클릭이 막히면 안 된다.
  if (pending === l) pending = null;
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
