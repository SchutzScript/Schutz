/**
 * 잔여 할당량 조회를 지금 내보낼지 말지.
 *
 * 이 조회는 공짜가 아니다 — 벤더에 실제 요청(1토큰)을 던져야 응답 **헤더**로 사용률이 온다.
 * 그래서 "주기적으로 갱신" 을 순진하게 setInterval 로 두면 앱을 켜 둔 내내 쓰지도 않는
 * 요청이 계속 나간다. 언제 나가도 되는지를 여기 한 곳에 모으고 테스트로 못 박는다.
 */

export interface QuotaPollInput {
  now: number;
  /** 잔여량이 마지막으로 갱신된 시각(실요청 헤더 또는 직전 조회). 아직 없으면 0. */
  lastAt: number;
  /** 창이 가려져 있는가 — 아무도 안 보는 화면을 위해 요청을 쓸 이유가 없다. */
  hidden: boolean;
  /** 이미 조회가 날아가 있는가 — 느린 응답 위에 다음 틱이 쌓이는 것을 막는다. */
  probing: boolean;
  /** 이보다 오래된 값이면 낡은 것으로 본다. */
  staleMs: number;
}

export function shouldProbeQuota(i: QuotaPollInput): boolean {
  if (i.probing) return false;
  if (i.hidden) return false;
  return i.now - i.lastAt >= i.staleMs;
}
