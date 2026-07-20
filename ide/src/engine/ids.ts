import type { Clock, IdSource } from "./types";

/**
 * 결정론적 id 발급기. prefix 별로 별도 카운터를 돌려 "r1", "r2", "d1" 처럼 읽히는 id 를 만든다.
 * Math.random 이나 Date.now 를 쓰지 않으므로 테스트가 스냅샷 비교를 할 수 있다.
 */
export function counterIds(): IdSource {
  const counters = new Map<string, number>();
  return {
    next(prefix: string): string {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return prefix + n;
    },
  };
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

/**
 * 테스트용 시계. 호출할 때마다 stepMs 만큼 전진한다.
 * step 이 0 이면 시간이 멈춘 것처럼 동작한다(순서만 보고 싶을 때).
 */
export function fixedClock(startMs = 0, stepMs = 1): Clock {
  let t = startMs;
  return {
    now(): number {
      const cur = t;
      t += stepMs;
      return cur;
    },
  };
}
