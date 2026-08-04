import { describe, it, expect } from "vitest";
import { shouldAsk, decide, describe as describeFiles, BUTTONS } from "../../electron/quitGuard.cjs";

describe("shouldAsk", () => {
  it("저장 안 한 것이 있으면 묻는다", () => expect(shouldAsk(2, false)).toBe(true));
  it("없으면 그냥 나간다", () => expect(shouldAsk(0, false)).toBe(false));

  it("이미 정했으면 다시 묻지 않는다 — 안 그러면 종료가 대화상자 고리에 갇힌다", () => {
    expect(shouldAsk(3, true)).toBe(false);
  });

  it("수를 모르면 묻지 않는다 — 렌더러가 아직 알려주기 전이다", () => {
    expect(shouldAsk(undefined, false)).toBe(false);
    expect(shouldAsk(null, false)).toBe(false);
    expect(shouldAsk("2", false)).toBe(false);
  });
});

describe("decide", () => {
  it("버튼 순서대로", () => {
    expect(decide(0)).toBe("save");
    expect(decide(1)).toBe("discard");
    expect(decide(2)).toBe("cancel");
  });

  it("모르는 응답은 취소로 본다 — 애매할 때 종료하면 작업이 사라진다", () => {
    expect(decide(undefined)).toBe("cancel");
    expect(decide(-1)).toBe("cancel");
    expect(decide(99)).toBe("cancel");
  });

  it("버튼 문구와 번호가 어긋나지 않는다", () => {
    expect(BUTTONS).toHaveLength(3);
    expect(BUTTONS[0]).toContain("저장하고");
    expect(BUTTONS[1]).toContain("않고");
  });
});

describe("describe", () => {
  it("파일 이름을 줄바꿈으로 늘어놓는다", () => {
    expect(describeFiles(["a.ts", "b.ts"])).toBe("a.ts\nb.ts");
  });

  it("너무 많으면 줄인다 — 스무 개를 늘어놓으면 무엇을 잃는지가 안 읽힌다", () => {
    const many = Array.from({ length: 9 }, (_, i) => "f" + i + ".ts");
    const out = describeFiles(many, 3);
    expect(out).toContain("f0.ts");
    expect(out).toContain("외 6개");
    expect(out).not.toContain("f8.ts");
  });

  it("빈 값도 던지지 않는다", () => {
    expect(describeFiles(undefined)).toBe("");
    expect(describeFiles([])).toBe("");
    expect(describeFiles([null, undefined] as any)).toBe("");
  });
});
