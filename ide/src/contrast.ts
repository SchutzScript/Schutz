/**
 * WCAG 대비비 계산.
 *
 * 눈으로 고른 색이 밝은 테마에서 실제로 몇 대 몇인지 아무도 재지 않았고, 그래서
 * Paper 의 흰 카드 위에서 오류 메시지가 2.41:1(기준 4.5) 로 거의 안 읽히는 채로 굴러갔다.
 * 이 파일이 있으면 그 판정이 테스트가 된다.
 */

/** "#RRGGBB" → 상대 휘도 (WCAG 2.x) */
export function luminance(hex: string): number {
  const h = hex.trim();
  const ch = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** 두 색의 대비비. 1(같음) ~ 21(검정↔흰색). 본문 텍스트 AA 기준은 4.5. */
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** 본문 크기 텍스트 AA */
export const AA_TEXT = 4.5;
