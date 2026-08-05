import { describe, it, expect } from "vitest";
import { detect, errorFor, kindOf, PREFIX } from "../../electron/encoding.cjs";

const U8 = (s: string) => Buffer.from(s, "utf8");

describe("detect", () => {
  it("평범한 UTF-8 은 통과", () => {
    expect(detect(U8("export const a = 1;\n"))).toBeNull();
    expect(detect(U8("한글도 UTF-8 이면 괜찮다\n"))).toBeNull();
    expect(detect(U8(""))).toBeNull();
  });

  it("UTF-8 BOM 은 UTF-8 이다 — 표식이 있다고 막으면 안 된다", () => {
    expect(detect(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), U8("a\n")]))).toBeNull();
  });

  it("UTF-16 은 바이트 순서 표식으로 알아본다", () => {
    expect(detect(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from("hi", "utf16le")]))).toBe("utf16le");
    expect(detect(Buffer.from([0xFE, 0xFF, 0x00, 0x68]))).toBe("utf16be");
  });

  it("CP949 한글은 UTF-8 로 해석되지 않는다 — 열면 깨지고 저장하면 원본이 사라진다", () => {
    // "안녕" (EUC-KR)
    expect(detect(Buffer.from([0xBE, 0xC8, 0xB3, 0xE7]))).toBe("not-utf8");
  });

  it("Latin-1 도 마찬가지", () => {
    expect(detect(Buffer.from([0x63, 0x61, 0x66, 0xE9]))).toBe("not-utf8");   // café
  });

  it("NUL 이 있으면 텍스트가 아니다 — 확장자만 텍스트인 파일이 흔하다", () => {
    expect(detect(Buffer.from([0x61, 0x00, 0x62]))).toBe("binary");
  });

  it("UTF-16 을 바이너리보다 먼저 알아본다 — 둘 다 NUL 이 있다", () => {
    expect(detect(Buffer.from([0xFF, 0xFE, 0x68, 0x00]))).toBe("utf16le");
  });

  it("빈 값에도 던지지 않는다", () => {
    expect(detect(null as any)).toBeNull();
    expect(detect(undefined as any)).toBeNull();
  });
});

describe("errorFor / kindOf", () => {
  it("왕복한다", () => {
    expect(kindOf(errorFor("not-utf8"))).toBe("not-utf8");
    expect(kindOf(errorFor("utf16le"))).toBe("utf16le");
  });

  it("Electron 이 앞에 덧붙여도 찾는다 — IPC 오류는 감싸여서 온다", () => {
    expect(kindOf("Error invoking remote method 'schutz:readFile': Error: " + PREFIX + "binary")).toBe("binary");
  });

  it("다른 오류는 null", () => {
    expect(kindOf("파일이 너무 큽니다 (5000 KB)")).toBeNull();
    expect(kindOf(undefined)).toBeNull();
  });
});
