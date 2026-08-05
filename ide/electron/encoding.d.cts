// encoding.cjs 의 타입. 메인 프로세스 코드지만 판정 부분은 테스트에서 그대로 부른다.
export declare function detect(buf: Buffer | null | undefined): null | "utf16le" | "utf16be" | "binary" | "not-utf8";
export declare function errorFor(kind: string): string;
export declare function kindOf(message: unknown): string | null;
export declare const PREFIX: string;
