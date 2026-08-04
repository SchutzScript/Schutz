import { describe, it, expect } from "vitest";
import { cleanText, upsert, remove, removeSource, ordered, ALIGN_LEFT, ALIGN_RIGHT, type StatusItem } from "./statusBar";

const mk = (o: Partial<StatusItem> & { id: string }): StatusItem => ({
  source: "확장", text: "t", tooltip: "", alignment: ALIGN_LEFT, priority: 0, seq: 0, ...o,
});

describe("cleanText", () => {
  it("codicon 표기를 걷어낸다 — 안 걷으면 $(sync~spin) 이 글자로 보인다", () => {
    expect(cleanText("$(sync~spin) 빌드 중")).toBe("빌드 중");
    expect(cleanText("$(check) 3 problems $(x)")).toBe("3 problems");
  });

  it("아이콘만 있는 항목은 점 하나를 남긴다 — 빈 글자는 폭이 0 이라 눌 수 없다", () => {
    expect(cleanText("$(bell)")).toBe("•");
    expect(cleanText("")).toBe("•");
    expect(cleanText(undefined)).toBe("•");
  });

  it("빈칸을 정리한다", () => expect(cleanText("  a   b  ")).toBe("a b"));
  it("닫는 괄호가 없으면 건드리지 않는다", () => expect(cleanText("$(broken")).toBe("$(broken"));
});

describe("upsert", () => {
  it("없으면 뒤에 붙인다", () => {
    expect(upsert([], mk({ id: "a" })).map(x => x.id)).toEqual(["a"]);
  });

  it("같은 id 면 갈아 끼운다", () => {
    const r = upsert([mk({ id: "a", text: "옛" })], mk({ id: "a", text: "새" }));
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toBe("새");
  });

  it("갈아 끼울 때 seq 는 처음 것을 지킨다 — 글자만 바꿨는데 옆으로 튀면 안 된다", () => {
    const r = upsert([mk({ id: "a", seq: 1 }), mk({ id: "b", seq: 2 })], mk({ id: "a", seq: 99, text: "새" }));
    expect(r[0]!.seq).toBe(1);
  });

  it("원래 배열을 건드리지 않는다", () => {
    const orig = [mk({ id: "a" })];
    upsert(orig, mk({ id: "b" }));
    expect(orig).toHaveLength(1);
  });
});

describe("remove / removeSource", () => {
  const list = [mk({ id: "a", source: "X" }), mk({ id: "b", source: "Y" }), mk({ id: "c", source: "X" })];
  it("id 하나를 뺀다", () => expect(remove(list, "b").map(x => x.id)).toEqual(["a", "c"]));
  it("없는 id 는 아무 일도 없다", () => expect(remove(list, "z")).toHaveLength(3));
  it("확장 하나가 올린 것을 전부 걷는다", () => expect(removeSource(list, "X").map(x => x.id)).toEqual(["b"]));
});

describe("ordered", () => {
  const list = [
    mk({ id: "l1", alignment: ALIGN_LEFT, priority: 1, seq: 0 }),
    mk({ id: "l2", alignment: ALIGN_LEFT, priority: 9, seq: 1 }),
    mk({ id: "r1", alignment: ALIGN_RIGHT, priority: 1, seq: 2 }),
    mk({ id: "r2", alignment: ALIGN_RIGHT, priority: 9, seq: 3 }),
  ];

  it("왼쪽 그룹은 우선순위가 큰 것이 앞(= 더 왼쪽)", () => {
    expect(ordered(list, ALIGN_LEFT).map(x => x.id)).toEqual(["l2", "l1"]);
  });

  it("오른쪽 그룹은 우선순위가 큰 것이 뒤(= 더 오른쪽) — 뒤집지 않으면 vscode 와 반대다", () => {
    expect(ordered(list, ALIGN_RIGHT).map(x => x.id)).toEqual(["r1", "r2"]);
  });

  it("우선순위가 같으면 등록 순서를 지킨다", () => {
    const same = [mk({ id: "b", seq: 5 }), mk({ id: "a", seq: 1 })];
    expect(ordered(same, ALIGN_LEFT).map(x => x.id)).toEqual(["a", "b"]);
  });

  it("다른 정렬의 항목은 안 섞인다", () => {
    expect(ordered(list, ALIGN_LEFT).every(x => x.alignment === ALIGN_LEFT)).toBe(true);
  });

  it("원래 배열을 건드리지 않는다", () => {
    const orig = list.slice();
    ordered(list, ALIGN_RIGHT);
    expect(list).toEqual(orig);
  });
});
