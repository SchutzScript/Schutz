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
