import { reducedMotion } from "./motion";

// UI 모드 — 이 앱이 어떤 모양으로 서 있는지.
//
//   editor : 지금까지의 모양. 레일·파일 트리·탭·에디터·우측 패널.
//   agent  : 대화가 화면 전체가 되는 모양. 도구 호출·diff·승인이 한 줄기로 흐르고,
//            파일은 필요할 때만 전체 화면 시트로 떴다 닫힌다.
//
// 저장 범위는 **프로젝트별 + 전역 기본값**이다. 첫 실행에서 고른 값이 전역 기본값이
// 되고(그 시점엔 워크스페이스가 아직 없다), 프로젝트를 연 뒤 바꾸면 그 프로젝트에만
// 남는다 — 대화만 하는 저장소와 손으로 고치는 저장소를 따로 둘 수 있게.
//
// theme.ts 의 스칼라 패턴(검증하는 getter + 조용한 setter)을 그대로 따른다. 목록을 여기
// 한 곳에서만 내보내는 것도 의도다 — 오프닝이 테마 목록을 자기 파일에 하드코딩했다가
// THEME_TOKENS 와 어긋난 전례가 있다.

export type UiMode = "editor" | "agent";

export const UI_MODES: readonly UiMode[] = ["editor", "agent"];

const KEY = "schutz.uiMode";
const FALLBACK: UiMode = "editor";

function isMode(v: unknown): v is UiMode {
  return typeof v === "string" && (UI_MODES as readonly string[]).includes(v);
}

/** 워크스페이스별 키. root 가 없으면(첫 실행) 전역 키만 쓴다. */
function keyFor(root?: string | null): string {
  return root ? `${KEY}:${root}` : KEY;
}

/** 전역 기본값 — 첫 실행 선택이 여기 들어간다. */
export function getGlobalUiMode(): UiMode {
  try {
    const v = localStorage.getItem(KEY);
    return isMode(v) ? v : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** 이 프로젝트에서 쓸 모드 — 프로젝트 설정이 있으면 그것, 없으면 전역 기본값. */
export function getUiMode(root?: string | null): UiMode {
  try {
    if (root) {
      const v = localStorage.getItem(keyFor(root));
      if (isMode(v)) return v;
    }
  } catch { /* ignore */ }
  return getGlobalUiMode();
}

/** 모드 저장. root 를 주면 그 프로젝트에만, 없으면 전역 기본값으로 쓴다.
 *  전역만 바뀌었을 때 이미 자기 값을 가진 프로젝트가 따라오지 않는 건 의도다 — 그
 *  프로젝트에서 사용자가 명시적으로 고른 값이 더 구체적인 의사표시다. */
export function setUiMode(m: UiMode, root?: string | null): void {
  if (!isMode(m)) return;
  try { localStorage.setItem(keyFor(root), m); } catch { /* ignore */ }
}

/** 이 프로젝트의 개별 설정을 지워 전역 기본값을 따르게 한다. */
export function clearUiModeFor(root: string): void {
  try { localStorage.removeItem(keyFor(root)); } catch { /* ignore */ }
}

/** 첫 페인트 전 1회 (main.tsx) — React 가 커밋하기 전에 모양을 알려둔다.
 *  없으면 에이전트 모드 사용자가 에디터 레이아웃을 한 프레임 보고 지나간다. */
export function applyUiMode(m: UiMode): void {
  try { document.documentElement.dataset.mode = m; } catch { /* ignore */ }
}

// ── 변신 ───────────────────────────────────────────────────────────────────
// setLang(i18n.ts)이 검증한 패턴을 그대로 쓴다. 거기서 배운 네 가지가 여기서도 그대로
// 필요하다: 기능 감지 / 모션 최소화는 JS 로 질의 / flushSync / ready 의 reject 삼키기.
//
// 다만 언어 전환과 결정적으로 다른 점이 하나 있다. 언어 전환은 상자가 안 바뀌어 제자리
// 교차 디졸브면 충분했지만, 모드 전환은 **상자가 통째로 달라진다**. 그래서 구조 영역마다
// view-transition-name 을 붙여 브라우저가 옛 상자에서 새 상자로 각각 이어 붙이게 한다.
// 이름을 리스트 항목에 붙이면 안 된다 — 같은 이름이 두 번 잡히면 전환 전체가 중단된다.

/** 연출 중임을 알리는 루트 속성. CSS 가 이걸 보고 모드 전용 키프레임을 켠다.
 *  (언어 전환도 같은 이름들을 지나가지만 그쪽은 상자가 안 바뀌므로 기본 디졸브로 둔다.) */
const ANIM_ATTR = "modeAnim";

/** 변신이 도는 중인가. 단축키 연타·키 리핏으로 겹쳐 부르면 전환들이 서로를 끊고, 먼저 것의
 *  finished 가 ANIM_ATTR 를 지워 나중 전환의 CSS 이름이 중간에 빠진다 — 그러면 부드러운
 *  변신 대신 "확 바뀜" 이 된다. 도는 동안엔 새 요청을 무시해 한 번에 하나만 돈다. */
let switching = false;

export function switchUiMode(next: UiMode, commit: () => void, flush: (fn: () => void) => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
  };
  const start = doc.startViewTransition;
  if (reducedMotion() || typeof start !== "function") { commit(); return; }
  // 이미 변신 중이면 이 요청은 버린다 — 겹치면 애니메이션이 깨진다. 도는 동안의 연타는
  // "한 번 더 토글" 이 아니라 "지금 걸 마저 보여줘" 로 해석하는 게 자연스럽다.
  if (switching) return;

  try {
    switching = true;
    document.documentElement.dataset[ANIM_ATTR] = next === "agent" ? "to-agent" : "to-editor";
    // flushSync 가 없으면 브라우저가 아직 옛 화면인 상태를 "새 화면" 으로 잡아
    // 아무것도 안 바뀐 디졸브가 된다 — 언어 전환에서 이미 확인한 함정이다.
    const vt = start.call(doc, () => flush(commit));
    void vt.ready.catch(() => { /* 도중에 다른 전환이 끼어들면 reject 된다 — 정상 */ });
    void vt.finished.finally(() => { switching = false; try { delete document.documentElement.dataset[ANIM_ATTR]; } catch { /* */ } });
  } catch {
    switching = false;
    try { delete document.documentElement.dataset[ANIM_ATTR]; } catch { /* */ }
    commit();   // 연출이 실패해도 모드는 바뀌어야 한다
  }
}

