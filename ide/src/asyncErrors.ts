/**
 * 처리 안 된 비동기 실패를 **보이게** 한다.
 *
 * main.tsx 의 ErrorBoundary 는 렌더 중에 던진 것만 잡는다. 클릭 핸들러 안의 `await`
 * 가 거부되면 React 는 아무것도 모르고, 앱에도 그걸 지켜보는 곳이 없었다 — 오류도
 * 로그도 토스트도 없이 그냥 아무 일도 안 일어난다. 이 저장소에서 가장 자주 나온
 * 결함 모양이 정확히 그것이다.
 *
 * 다만 전부를 실패로 볼 수는 없다. Monaco 는 예약된 작업을 취소할 때 `Canceled` 를
 * **던져서** 알린다(정상 동작이다). 그걸 같이 시끄럽게 하면 진짜 오류가 그 속에
 * 묻힌다 — 신호를 만들려다 소음을 만드는 꼴이다.
 *
 * 순수 모듈이다.
 */

/** 앱이 이 이름으로 창에 사건을 쏜다. App 이 받아 한 번만 알린다. */
export const ASYNC_ERROR_EVENT = "schutz:async-error";

/**
 * 무시해도 되는가.
 *
 * - Monaco/vscode 계열의 취소(`Canceled`, `CancellationError`) — 취소는 실패가 아니다.
 * - `AbortError` — fetch·스트림을 우리가 일부러 끊은 것이다(에이전트 중지 버튼).
 */
export function isIgnorable(reason: unknown): boolean {
  if (!reason) return false;
  const name = (reason as any)?.name;
  if (name === "Canceled" || name === "CancellationError" || name === "AbortError") return true;
  const msg = typeof reason === "string" ? reason : String((reason as any)?.message ?? "");
  // Monaco 의 취소는 name·message 가 둘 다 "Canceled" 인 평범한 Error 로 온다.
  return msg === "Canceled" || msg === "Canceled: Canceled";
}

/** 로그·신고에 쓸 한 줄 + 스택. 무엇이 왔든 문자열로 만든다. */
export function describe(reason: unknown): { title: string; detail: string } {
  if (reason instanceof Error) {
    return { title: `${reason.name}: ${reason.message}`, detail: reason.stack ?? `${reason.name}: ${reason.message}` };
  }
  if (typeof reason === "string") return { title: reason.slice(0, 200), detail: reason };
  try { const s = JSON.stringify(reason); return { title: s.slice(0, 200), detail: s }; }
  catch { return { title: String(reason), detail: String(reason) }; }
}

/**
 * 같은 실패가 쏟아질 때 몇 번이나 알릴지.
 *
 * 실패 하나가 루프 안에 있으면 초당 수십 번 온다. 그때마다 토스트를 띄우면 화면을
 * 못 쓴다. 그렇다고 첫 번째만 알리고 마는 것도 곤란하다 — 한참 뒤 다시 나면 그건
 * 새 소식이다. 그래서 **같은 제목은 창(window) 안에서 한 번**만 알린다.
 */
export function makeThrottle(windowMs = 60_000) {
  const last = new Map<string, number>();
  return (title: string, now: number): boolean => {
    const prev = last.get(title);
    if (prev !== undefined && now - prev < windowMs) return false;
    last.set(title, now);
    // 오래된 것은 버린다 — 제목이 매번 다른 오류(주소가 섞인 메시지)로 무한히 자라지 않게.
    if (last.size > 64) {
      for (const [k, v] of last) if (now - v >= windowMs) last.delete(k);
    }
    return true;
  };
}
