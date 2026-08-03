import type { ThemeTokens } from "../theme";

/**
 * Monaco 위젯 색을 앱 테마 토큰에서 만든다.
 *
 * 지금까지 테마는 에디터 **본문** 색만 정하고 위젯 색은 비워 뒀다. 그러면 Monaco 가
 * 자기 기본값(vs / vs-dark)으로 떨어진다 — 찾기 위젯이 Feldgrau 에서 #252526,
 * Paper 에서 #F3F3F3 로 떴다. 앱 팝업은 #1A1F1C / #FFFFFF 인데, 에디터 안쪽만
 * 남의 옷을 입고 있었다. 자동완성 목록·우클릭 메뉴·호버·Peek 도 전부 같았다.
 *
 * CSS 로 덮어쓰지 않고 **테마 색 키를 채우는** 쪽을 고른 이유: Monaco 의 내부 클래스
 * 이름은 버전마다 바뀌지만 색 키는 공개 계약이다. 모서리 둥글기처럼 색이 아닌 것만
 * CSS 가 맡는다.
 */

/** "#RRGGBB" + 알파(0~1) → "#RRGGBBAA". Monaco 는 8자리 hex 를 받는다. */
export function alpha(hex: string, a: number): string {
  const h = hex.trim().slice(0, 7);
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
  return h + v.toString(16).padStart(2, "0").toUpperCase();
}

/**
 * 앱 토큰 → Monaco 색 키.
 *
 * rgba() 형태의 헤어라인 토큰(w06 등)은 쓰지 않는다 — Monaco 는 hex 만 받는다.
 * 필요한 반투명은 hex 토큰에서 alpha() 로 만든다.
 */
export function monacoWidgetColors(t: ThemeTokens): Record<string, string> {
  const light = !!t.light;
  /** 목록에서 고른 줄 — 밝은 테마는 액센트를 옅게, 어두운 테마는 조금 진하게. */
  const sel = alpha(t.accent, light ? 0.16 : 0.22);
  const hover = alpha(t.fg, light ? 0.06 : 0.07);

  return {
    // 떠 있는 것들의 바탕 — 앱의 팝업과 같은 종이를 쓴다
    "editorWidget.background": t.bgPopup,
    "editorWidget.foreground": t.fg,
    "editorWidget.border": t.bdPopup,
    "editorWidget.resizeBorder": t.accent,
    "widget.shadow": alpha(light ? "#283223" : "#000000", light ? 0.16 : 0.55),

    // 찾기/바꾸기 입력칸 — 여기가 가장 크게 어긋나 있었다
    "input.background": t.bgRoot,
    "input.foreground": t.fg,
    "input.border": t.bdPopup,
    "input.placeholderForeground": t.fgDim2,
    "inputOption.activeBackground": alpha(t.accent, 0.18),
    "inputOption.activeBorder": t.accent,
    "inputOption.activeForeground": t.fg,
    "inputValidation.errorBackground": t.errSoft.startsWith("#") ? t.errSoft : alpha(t.err, 0.14),
    "inputValidation.errorBorder": t.err,
    "inputValidation.errorForeground": t.fg,
    "focusBorder": t.accent,

    // 찾은 것 — 액센트 계열로. 기본값(주황)은 이 팔레트에 없는 색이다.
    "editor.findMatchBackground": alpha(t.accentHi, 0.38),
    "editor.findMatchHighlightBackground": alpha(t.accent, 0.22),
    "editor.findRangeHighlightBackground": alpha(t.accent, 0.1),

    // 자동완성
    "editorSuggestWidget.background": t.bgPopup,
    "editorSuggestWidget.border": t.bdPopup,
    "editorSuggestWidget.foreground": t.fgSub,
    "editorSuggestWidget.selectedBackground": sel,
    "editorSuggestWidget.selectedForeground": t.fg,
    "editorSuggestWidget.highlightForeground": t.accentHi,
    "editorSuggestWidget.focusHighlightForeground": t.accentHi,

    // 목록 일반(자동완성·빠른 입력·Peek 결과가 공유한다)
    "list.hoverBackground": hover,
    "list.focusBackground": sel,
    "list.focusForeground": t.fg,
    "list.activeSelectionBackground": sel,
    "list.activeSelectionForeground": t.fg,
    "list.inactiveSelectionBackground": alpha(t.accent, 0.1),
    "list.highlightForeground": t.accentHi,

    // 호버 툴팁
    "editorHoverWidget.background": t.bgPopup,
    "editorHoverWidget.border": t.bdPopup,
    "editorHoverWidget.foreground": t.fgSub,
    "editorHoverWidget.statusBarBackground": t.bgCard,

    // 우클릭 메뉴
    "menu.background": t.bgPopup,
    "menu.foreground": t.fgSub,
    "menu.border": t.bdPopup,
    "menu.selectionBackground": sel,
    "menu.selectionForeground": t.fg,
    "menu.separatorBackground": t.bdPopup,

    // 위젯 안의 버튼(바꾸기 확인 등)
    "button.background": t.accent,
    "button.foreground": t.onAccent,
    "button.hoverBackground": t.accentHi,

    // 줄 이동(Ctrl+G) 같은 빠른 입력
    "quickInput.background": t.bgPopup,
    "quickInput.foreground": t.fg,
    "quickInputList.focusBackground": sel,
    "quickInputList.focusForeground": t.fg,

    // 정의 미리보기(Peek)
    "peekView.border": t.accent,
    "peekViewEditor.background": t.bgEditor,
    "peekViewResult.background": t.bgPanel,
    "peekViewResult.selectionBackground": sel,
    "peekViewTitle.background": t.bgCard,
    "peekViewTitleLabel.foreground": t.fg,
    "peekViewTitleDescription.foreground": t.fgDim,

    // 물결 밑줄 — 0.1.0 에서 만든 시맨틱 토큰을 그대로 쓴다
    "editorError.foreground": t.err,
    "editorWarning.foreground": t.warn,
    "editorInfo.foreground": t.accent,

    // 이름 바꾸기 입력
    "editorGhostText.foreground": t.fgDim2,
  };
}
