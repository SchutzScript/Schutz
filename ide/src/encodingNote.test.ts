import { describe, it, expect } from "vitest";
import { encodingKind, encodingMessage } from "./encodingNote";

describe("encodingKind", () => {
  it("코드가 없으면 null", () => {
    expect(encodingKind("그냥 오류")).toBeNull();
    expect(encodingKind("")).toBeNull();
  });

  it("Error.message 앞에 붙는 접두사를 지나 읽는다", () => {
    // IPC 를 건너오며 "Error invoking remote method '...': Error: " 가 앞에 붙는다.
    expect(encodingKind("Error invoking remote method 'schutz:readFile': Error: SCHUTZ_ENCODING:not-utf8")).toBe("not-utf8");
  });

  it("종류를 그대로 읽는다", () => {
    expect(encodingKind("SCHUTZ_ENCODING:utf16le")).toBe("utf16le");
    expect(encodingKind("SCHUTZ_ENCODING:binary")).toBe("binary");
  });

  it("뒤에 딸린 말은 종류에 섞지 않는다", () => {
    expect(encodingKind("SCHUTZ_ENCODING:binary\n    at foo (bar.js:1)")).toBe("binary");
  });
});

describe("encodingMessage", () => {
  it("인코딩 오류가 아니면 받은 문장을 그대로 돌려준다", () => {
    expect(encodingMessage("파일이 너무 큽니다 (900 KB)")).toBe("파일이 너무 큽니다 (900 KB)");
  });

  it("원시 코드를 사람에게 보이지 않는다", () => {
    for (const k of ["not-utf8", "utf16le", "utf16be", "binary"]) {
      const msg = encodingMessage("SCHUTZ_ENCODING:" + k);
      expect(msg).not.toContain("SCHUTZ_ENCODING");
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("UTF-16 두 방향이 같은 문장을 쓴다", () => {
    expect(encodingMessage("SCHUTZ_ENCODING:utf16le")).toBe(encodingMessage("SCHUTZ_ENCODING:utf16be"));
  });

  it("종류마다 다른 문장이다", () => {
    const a = encodingMessage("SCHUTZ_ENCODING:not-utf8");
    const b = encodingMessage("SCHUTZ_ENCODING:utf16le");
    const c = encodingMessage("SCHUTZ_ENCODING:binary");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("모르는 종류는 일반 안내로 떨어진다(빈칸이 아니다)", () => {
    expect(encodingMessage("SCHUTZ_ENCODING:koi8r")).toBe(encodingMessage("SCHUTZ_ENCODING:not-utf8"));
  });
});
