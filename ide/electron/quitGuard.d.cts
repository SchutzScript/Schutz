// quitGuard.cjs 의 타입. 메인 프로세스 코드지만 판단 부분은 테스트에서 그대로 부른다.
export declare function shouldAsk(dirtyCount: unknown, alreadyDecided: boolean): boolean;
export declare function decide(response: unknown): "save" | "discard" | "cancel";
export declare function describe(files: unknown, max?: number): string;
export declare const BUTTONS: string[];
