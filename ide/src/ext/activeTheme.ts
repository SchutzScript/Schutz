// 현재 적용해야 할 Monaco 에디터 테마 id 를 한 곳에서 결정한다.
// 우선순위: 가져온 VS Code 테마(영속 선택) > TextMate 문법 테마 > 내장 테마.
// 에디터/디프 생성 시 이 값을 theme 옵션으로 주면 새 창을 열어도 활성 테마가 유지된다.
import { getActiveVsxTheme } from "../settings";
import { getThemeId, monacoThemeOf } from "../theme";
import { isTextMateWired, tmThemeId } from "./textmate";
import { getImportedThemes } from "./vscodeExt";

export function activeMonacoTheme(): string {
  const vsx = getActiveVsxTheme();
  // 가져온 테마가 실제로 정의되어 있을 때만 사용 — 미정의 상태에서 setTheme 하면 기본 라이트로 폴백됨
  if (vsx && getImportedThemes().some(t => t.id === vsx)) return vsx;
  if (isTextMateWired()) return tmThemeId();
  return monacoThemeOf(getThemeId());
}
