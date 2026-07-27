// 요청 시작 실패에 대한 재시도 정책.
//
// 왜 필요했나: 요청 경로에 재시도가 하나도 없었다. 관리자 에이전트가 하위 에이전트
// 셋에게 병렬로 위임하면 같은 구독을 동시에 두드리는데, 그게 정확히 rate limit 을
// 부르는 사용법이다. 한 번 429 가 나면 그 실행이 통째로 끝나 버렸다.
//
// **첫 바이트를 받기 전의 실패에만** 재시도한다. 스트림이 시작된 뒤 끊긴 경우는
// 모델이 이미 도구를 부르게 했을 수 있어, 다시 보내면 같은 편집·명령이 두 번 실행된다.
// 그래서 재시도 지점은 fetch 가 응답 헤더를 돌려주는 순간까지로 못 박는다.

/** 다시 보내볼 만한 상태 코드 — 일시적인 것만. 4xx 중에서는 429 뿐이다
 *  (400·401·403 은 다시 보내도 같은 답이 온다). */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 425 || (status >= 500 && status <= 599);
}

/** 서버가 Retry-After 로 지시하면 그걸 따른다 — 초 단위 또는 HTTP 날짜.
 *  해석할 수 없으면 null(= 우리 백오프를 쓴다). 지나치게 긴 값은 상한으로 자른다. */
export function parseRetryAfter(header: string | null | undefined, nowMs: number): number | null {
  if (!header) return null;
  const s = header.trim();
  if (/^\d+$/.test(s)) return Math.min(Number(s) * 1000, MAX_DELAY_MS);
  const at = Date.parse(s);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.min(at - nowMs, MAX_DELAY_MS));
}

export const MAX_ATTEMPTS = 3;      // 최초 1회 + 재시도 2회
export const BASE_DELAY_MS = 700;
export const MAX_DELAY_MS = 20_000;

/** 지수 백오프 + 지터. 같은 순간에 튕긴 병렬 에이전트들이 다시 같은 순간에
 *  몰려가지 않도록 흩는다 — 지터가 없으면 재시도가 두 번째 스파이크를 만든다. */
export function backoffDelay(attempt: number, rand: number): number {
  const base = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
  return Math.round(base * (0.5 + rand * 0.5));
}

/** 재시도할지 / 얼마나 기다릴지. 재시도하지 않으면 null. */
export function retryPlan(
  attempt: number,
  info: { status?: number; networkError?: boolean; retryAfter?: string | null },
  now: number,
  rand: number,
): number | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  const worth = info.networkError || (info.status !== undefined && isRetriableStatus(info.status));
  if (!worth) return null;
  return parseRetryAfter(info.retryAfter, now) ?? backoffDelay(attempt, rand);
}

/** 중단 가능한 sleep — 사용자가 멈추면 기다리는 중에도 즉시 빠져나온다. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(done, ms);
    function done() { clearTimeout(id); signal?.removeEventListener("abort", done); resolve(); }
    signal?.addEventListener("abort", done);
  });
}
