import { describe, it, expect } from "vitest";
import { THEME_TOKENS } from "./theme";
import { contrast, luminance, AA_TEXT } from "./contrast";

/** 텍스트 색으로 쓰이는 토큰만. 줄·배지 배경(*Soft)·헤어라인은 대상이 아니다. */
const TEXT_TOKENS = ["fg", "fgCode", "fgSub", "fgSub2", "ok", "okHi", "err", "errHi", "warn", "warnHi", "dirty"] as const;
/** 그 텍스트가 실제로 놓이는 바탕들. */
const SURFACES = ["bgCard", "bgPanel", "bgEditor", "bgPopup"] as const;

describe("contrast", () => {
  it("양 끝을 안다", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#8FA893", "#8FA893")).toBeCloseTo(1, 5);
  });
  it("순서에 무관하다", () => {
    expect(contrast("#A3312F", "#FFFFFF")).toBeCloseTo(contrast("#FFFFFF", "#A3312F"), 6);
  });
  it("휘도가 sRGB 감마를 편다", () => {
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
    expect(luminance("#808080")).toBeCloseTo(0.2159, 3);
  });
});

describe("테마 시맨틱 색이 모든 바탕에서 읽힌다", () => {
  for (const [id, t] of Object.entries(THEME_TOKENS)) {
    for (const tok of TEXT_TOKENS) {
      for (const surf of SURFACES) {
        it(`${id}: ${tok} on ${surf}`, () => {
          const r = contrast(t[tok], t[surf]);
          expect(r, `${t[tok]} on ${t[surf]} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    }
  }
});

describe("회귀 방지 — 예전 하드코딩 색은 밝은 테마에서 기준 미달이었다", () => {
  const white = THEME_TOKENS.paper!.bgCard;
  it.each([
    ["오류 #CE9A9A", "#CE9A9A"],
    ["경고 #C4A882", "#C4A882"],
    ["삭제 #C97B7B", "#C97B7B"],
    ["미저장 #CCB491", "#CCB491"],
  ])("%s 는 Paper 흰 카드에서 4.5 미만이다 — 그래서 토큰으로 옮겼다", (_n, hex) => {
    expect(contrast(hex, white)).toBeLessThan(AA_TEXT);
  });

  it("새 토큰은 같은 자리에서 기준을 넘는다", () => {
    const p = THEME_TOKENS.paper!;
    expect(contrast(p.err, white)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(p.warn, white)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(p.dirty, white)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
