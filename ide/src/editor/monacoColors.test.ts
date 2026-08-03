import { describe, it, expect } from "vitest";
import { monacoWidgetColors, alpha } from "./monacoColors";
import { THEME_TOKENS } from "../theme";
import { contrast, AA_TEXT } from "../contrast";

describe("alpha", () => {
  it("hex 뒤에 알파 두 자리를 붙인다", () => {
    expect(alpha("#8FA893", 1)).toBe("#8FA893FF");
    expect(alpha("#8FA893", 0)).toBe("#8FA89300");
    expect(alpha("#8FA893", 0.5)).toBe("#8FA89380");
  });
  it("이미 알파가 붙어 있으면 갈아 끼운다 — 두 번 붙어 10자리가 되면 Monaco 가 무시한다", () => {
    expect(alpha("#8FA893FF", 0.2)).toBe("#8FA89333");
  });
  it("범위를 벗어난 값은 잘라 낸다", () => {
    expect(alpha("#000000", 2)).toBe("#000000FF");
    expect(alpha("#000000", -1)).toBe("#00000000");
  });
});

describe("Monaco 위젯 색", () => {
  const themes = Object.entries(THEME_TOKENS);

  it("모든 테마에서 값이 전부 hex 다 — rgba() 를 넣으면 Monaco 가 통째로 무시한다", () => {
    for (const [id, t] of themes) {
      for (const [k, v] of Object.entries(monacoWidgetColors(t))) {
        expect(v, `${id}.${k} = ${v}`).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
      }
    }
  });

  it("눈에 띄던 자리를 실제로 덮는다", () => {
    for (const [id, t] of themes) {
      const c = monacoWidgetColors(t);
      for (const k of [
        "editorWidget.background", "input.background", "focusBorder",
        "editorSuggestWidget.background", "menu.background", "editorHoverWidget.background",
        "quickInput.background", "editor.findMatchBackground",
      ]) expect(c[k], `${id}.${k}`).toBeTruthy();
    }
  });

  it("떠 있는 것들의 바탕이 앱 팝업과 같다 — 이게 어긋나서 남의 옷처럼 보였다", () => {
    for (const [id, t] of themes) {
      const c = monacoWidgetColors(t);
      expect(c["editorWidget.background"], id).toBe(t.bgPopup);
      expect(c["editorSuggestWidget.background"], id).toBe(t.bgPopup);
      expect(c["menu.background"], id).toBe(t.bgPopup);
      expect(c["editorHoverWidget.background"], id).toBe(t.bgPopup);
    }
  });

  it("VS Code 기본값이 하나도 남지 않는다", () => {
    const stock = ["#252526", "#3C3C3C", "#F3F3F3", "#616161", "#007ACC", "#0E639C", "#094771"];
    for (const [id, t] of themes) {
      const vals = Object.values(monacoWidgetColors(t)).map(v => v.slice(0, 7).toUpperCase());
      for (const s of stock) expect(vals, `${id} 에 ${s} 가 남았다`).not.toContain(s);
    }
  });

  it("위젯 위의 글자가 읽힌다 — 팝업 바탕 대비 AA", () => {
    for (const [id, t] of themes) {
      const c = monacoWidgetColors(t);
      for (const k of ["editorWidget.foreground", "editorSuggestWidget.foreground", "menu.foreground", "editorHoverWidget.foreground"]) {
        const r = contrast(c[k]!.slice(0, 7), t.bgPopup);
        expect(r, `${id}.${k} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it("입력칸 글자도 입력칸 바탕에서 읽힌다", () => {
    for (const [id, t] of themes) {
      const c = monacoWidgetColors(t);
      const r = contrast(c["input.foreground"]!.slice(0, 7), c["input.background"]!.slice(0, 7));
      expect(r, `${id} input = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("물결 밑줄은 0.1.0 의 시맨틱 토큰을 쓴다 — 색을 또 만들지 않는다", () => {
    for (const [id, t] of themes) {
      const c = monacoWidgetColors(t);
      expect(c["editorError.foreground"], id).toBe(t.err);
      expect(c["editorWarning.foreground"], id).toBe(t.warn);
    }
  });

  it("밝은 테마와 어두운 테마가 실제로 다른 값을 낸다", () => {
    const paper = monacoWidgetColors(THEME_TOKENS.paper!);
    const dark = monacoWidgetColors(THEME_TOKENS.feldgrau!);
    expect(paper["editorWidget.background"]).not.toBe(dark["editorWidget.background"]);
    expect(paper["input.foreground"]).not.toBe(dark["input.foreground"]);
  });
});
