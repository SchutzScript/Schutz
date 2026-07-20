// 첫 실행 오프닝의 타임라인.
//
// import 0. 시간 계산과 비트 경계만 들고 있고 DOM·React·i18n 을 모른다 — engine/ 과
// 같은 규칙이다. 연출이 이상할 때 "타이밍이 틀렸나, 렌더가 틀렸나" 를 나눠서 볼 수
// 있어야 하고, 타이밍 쪽은 브라우저 없이 테스트로 잡을 수 있어야 한다.

export type BeatId =
  | "mark"      // 마크의 획이 그려진다
  | "say"       // 선언 — 큰 타이포
  | "setup"     // 색·바탕을 고른다. 여기서 멈춘다
  | "assemble"  // 고른 색으로 인터페이스가 조립된다
  | "ask"       // 대화창에 요청이 타이핑된다
  | "rewrite"   // 코드가 다시 쓰인다 (간판)
  | "approve"   // 검토 → 수락
  | "settle";   // 앱으로 안착

export interface Beat {
  id: BeatId;
  /** 시작 시각(ms) */
  at: number;
  /**
   * 여기서 재생이 멈추고 사용자를 기다린다. 오프닝 전체에서 setup 하나뿐 —
   * 자동으로 흘려보내면 색을 고를 틈이 없다.
   */
  gate?: boolean;
  /**
   * 실제로 붙잡을 시각. at 에 걸면 그 비트가 **페이드인되기도 전에** 멈춰서 화면에
   * 아무 선택지도 안 나온다(직전 장면이 반쯤 남은 채로 굳는다). 등장이 끝난 뒤를
   * 잡아야 한다.
   */
  holdAt?: number;
}

export const BEATS: readonly Beat[] = [
  { id: "mark",     at: 0 },
  { id: "say",      at: 3600 },
  { id: "setup",    at: 9500, gate: true, holdAt: 10500 },
  { id: "assemble", at: 12000 },
  { id: "ask",      at: 20000 },
  { id: "rewrite",  at: 26000 },
  { id: "approve",  at: 37500 },
  { id: "settle",   at: 46000 },
];

export const TOTAL_MS = 52000;

/** 게이트가 걸린 비트의 시각. 없으면 null. */
export function gateAt(): number | null {
  const g = BEATS.find(b => b.gate);
  return g ? (g.holdAt ?? g.at) : null;
}

/** t 시점에 재생 중인 비트. t 가 범위를 벗어나도 항상 하나를 돌려준다. */
export function beatAt(t: number): Beat {
  let cur = BEATS[0];
  for (const b of BEATS) if (t >= b.at) cur = b;
  return cur;
}

/**
 * 게이트를 아직 안 지났으면 시간을 그 지점에 붙잡는다.
 * 렌더러가 아니라 여기서 하는 이유 — 이게 "멈춘다" 의 정의라서 테스트가 가능해야 한다.
 */
export function clampToGate(t: number, passedGate: boolean): number {
  const g = gateAt();
  if (g === null || passedGate) return t;
  return Math.min(t, g);
}

/** 구간 [t0, t1] 안에서의 진행도 0..1. 구간 밖은 0 또는 1 로 잘린다. */
export function seg(t: number, t0: number, t1: number): number {
  if (t1 <= t0) return t >= t1 ? 1 : 0;
  const x = (t - t0) / (t1 - t0);
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** smoothstep. 시작·끝이 부드러워 패널이 튀어나오다 멈추는 느낌이 안 난다. */
export function ease(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/** 조립 순서 — 각 패널이 자기 방향에서 들어온다. dx/dy 는 시작 오프셋(px). */
export interface PanelEntry { key: "rail" | "left" | "editor" | "right"; at: number; dx: number; dy: number; }

export const PANEL_ENTRIES: readonly PanelEntry[] = [
  { key: "rail",   at: 12400, dx: -120, dy: 0 },
  { key: "left",   at: 13100, dx: -160, dy: 0 },
  { key: "editor", at: 13900, dx: 0,    dy: 130 },
  { key: "right",  at: 14700, dx: 160,  dy: 0 },
];

/** 조립 애니메이션 길이. 라벨은 이보다 조금 늦게 떴다가 사라진다. */
export const PANEL_DUR = 1100;
