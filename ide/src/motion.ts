// 모션 최소화 질의 한 곳.
//
// 별도 파일인 이유가 둘 있다. 하나는 복붙 방지 — 뷰 트랜지션을 쓰는 곳이 둘(언어 전환,
// 모드 변신)이고 앞으로 더 늘어날 텐데, 각자 matchMedia 를 부르면 한쪽만 고쳐지는 날이 온다.
// 다른 하나는 무게 — i18n.ts 에 두면 uiMode.ts 가 그걸 import 하느라 react-dom 까지 끌고 와서,
// node 환경으로 가볍게 도는 uiMode 테스트가 무거워진다.
//
// **CSS 로는 안 된다.** global.css 의 `animation-duration:.01ms !important` 는
// ::view-transition-* 의사요소에 닿지 않고, JS 타이머는 애초에 막지 못한다.
export function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
