// touchSet.cjs 의 타입. 메인 프로세스 코드지만 판단 부분은 테스트에서 그대로 부른다.
export interface TouchDrain {
  rels: string[];
  /** 상한에 걸려 버린 경로가 있었다 — 이 목록은 전부가 아니다. */
  overflow: boolean;
  dropped: number;
}
export interface TouchSet {
  add(rel: unknown): void;
  readonly size: number;
  readonly overflowed: boolean;
  readonly dropped: number;
  drain(): TouchDrain;
}
export declare function makeTouchSet(max?: number): TouchSet;
export declare const DEFAULT_MAX: number;
