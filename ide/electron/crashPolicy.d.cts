// crashPolicy.cjs 의 타입. 메인 프로세스 코드는 .cjs 지만 순수한 판단 부분은
// 렌더러 쪽 테스트에서 그대로 불러 쓴다 — 그러려면 선언이 필요하다.
export declare function trimLog(text: string | null | undefined, maxBytes?: number): string;
export declare function makeNotifyGate(): () => boolean;
export declare function makeReloadGate(limit?: number, windowMs?: number): (now: number) => boolean;
export declare function logLine(when: number, kind: string, detail: unknown): string;
