import { describe, it, expect } from "vitest";
import { normalizePicks, matchPick, filterPicks, stepIndex, normalizeButtons, validateInput } from "./prompt";

describe("normalizePicks", () => {
  it("문자열 배열을 라벨로 받는다", () => {
    const r = normalizePicks(["a", "b"]);
    expect(r.map(x => x.label)).toEqual(["a", "b"]);
    expect(r.map(x => x.index)).toEqual([0, 1]);
  });

  it("원래 값을 그대로 들고 있는다 — 확장이 넘긴 다른 필드가 결과로 돌아가야 한다", () => {
    const item = { label: "열기", uri: "file:///x", run: () => 1 };
    const r = normalizePicks([item]);
    expect(r[0]!.raw).toBe(item);
  });

  it("description·detail·picked 를 읽는다", () => {
    const r = normalizePicks([{ label: "L", description: "D", detail: "T", picked: true }]);
    expect(r[0]).toMatchObject({ label: "L", description: "D", detail: "T", picked: true });
  });

  it("label 이 없으면 자리 번호로 채운다 — 빈 줄이면 무엇인지 알 수 없다", () => {
    expect(normalizePicks([{ description: "x" } as any])[0]!.label).toBe("(1)");
  });

  it("배열이 아니면 빈 목록", () => {
    expect(normalizePicks(null)).toEqual([]);
    expect(normalizePicks(undefined)).toEqual([]);
    expect(normalizePicks("nope" as any)).toEqual([]);
  });
});

describe("matchPick", () => {
  const [it0] = normalizePicks([{ label: "Open File", description: "workspace", detail: "src/App.tsx" }]);

  it("빈 질의는 전부 통과", () => expect(matchPick(it0!, "")).toBe(true));
  it("대소문자를 무시한다", () => expect(matchPick(it0!, "OPEN")).toBe(true));

  it("조각이 전부 들어 있어야 한다 — 순서는 상관없다", () => {
    expect(matchPick(it0!, "file open")).toBe(true);
    expect(matchPick(it0!, "open zzz")).toBe(false);
  });

  it("description·detail 은 기본으로 안 본다", () => {
    expect(matchPick(it0!, "workspace")).toBe(false);
    expect(matchPick(it0!, "workspace", { matchOnDescription: true })).toBe(true);
    expect(matchPick(it0!, "App.tsx", { matchOnDetail: true })).toBe(true);
  });
});

describe("filterPicks", () => {
  const items = normalizePicks(["alpha", "beta", "alphabet"]);

  it("맞는 것만 남기고 원래 자리를 유지한다", () => {
    const r = filterPicks(items, "alpha");
    expect(r.map(x => x.label)).toEqual(["alpha", "alphabet"]);
    expect(r.map(x => x.index)).toEqual([0, 2]);
  });

  it("확장이 정해 둔 순서를 흔들지 않는다 — 첫 항목이 대개 권장값이다", () => {
    expect(filterPicks(items, "a").map(x => x.label)).toEqual(["alpha", "beta", "alphabet"]);
  });
});

describe("stepIndex", () => {
  it("끝에서 반대편으로 돈다", () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });
  it("가운데선 그냥 움직인다", () => expect(stepIndex(1, 1, 3)).toBe(2));
  it("빈 목록이면 0", () => expect(stepIndex(5, 1, 0)).toBe(0));
  it("범위 밖 커서도 안전하다", () => expect(stepIndex(99, 1, 3)).toBe(1));
});

describe("normalizeButtons", () => {
  it("문자열을 버튼으로", () => {
    expect(normalizeButtons(["Yes", "No"]).map(b => b.label)).toEqual(["Yes", "No"]);
  });

  it("MessageItem 의 title 을 읽고 isCloseAffordance 를 표시한다", () => {
    const r = normalizeButtons([{ title: "Reload" }, { title: "Later", isCloseAffordance: true }]);
    expect(r.map(b => [b.label, b.isClose])).toEqual([["Reload", false], ["Later", true]]);
  });

  it("첫 인자로 끼워 넣는 옵션 객체는 버튼이 아니다", () => {
    expect(normalizeButtons([{ modal: true }, "OK"]).map(b => b.label)).toEqual(["OK"]);
  });

  it("고른 결과로 원래 값을 돌려줄 수 있게 raw 를 들고 있는다", () => {
    const mi = { title: "Reload", id: 7 };
    expect(normalizeButtons([mi])[0]!.raw).toBe(mi);
  });

  it("항목이 없으면 빈 목록 — 그때는 알림이지 물음이 아니다", () => {
    expect(normalizeButtons([])).toEqual([]);
    expect(normalizeButtons(undefined)).toEqual([]);
  });
});

describe("validateInput", () => {
  it("검사기가 없으면 통과", async () => {
    expect(await validateInput(undefined, "x")).toBeNull();
  });

  it("문자열을 오류 문구로 돌려준다", async () => {
    expect(await validateInput((v: string) => (v ? null : "비어 있습니다"), "")).toBe("비어 있습니다");
    expect(await validateInput((v: string) => (v ? null : "비어 있습니다"), "a")).toBeNull();
  });

  it("빈 문자열은 통과로 본다", async () => {
    expect(await validateInput(() => "", "x")).toBeNull();
  });

  it("{ message } 모양도 받는다", async () => {
    expect(await validateInput(() => ({ message: "안 됨", severity: 3 }), "x")).toBe("안 됨");
  });

  it("Promise 를 기다린다", async () => {
    expect(await validateInput(async () => "늦은 오류", "x")).toBe("늦은 오류");
  });

  it("확장이 던진 예외로 물음이 죽지 않는다 — 통과로 본다", async () => {
    expect(await validateInput(() => { throw new Error("boom"); }, "x")).toBeNull();
    expect(await validateInput(async () => { throw new Error("boom"); }, "x")).toBeNull();
  });
});
