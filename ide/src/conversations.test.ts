import { describe, expect, it } from "vitest";
import { CONV_CAP, groupByDay, parseIndex, prune, titleFrom, upsert, type ConvMeta } from "./conversations";

const meta = (id: string, updatedAt: number, title = id): ConvMeta => ({ id, title, updatedAt, msgCount: 1 });
const ids = (l: readonly ConvMeta[]) => l.map(c => c.id);

describe("titleFrom", () => {
  // 에이전트 답변에서 뽑으면 목록이 전부 "네, 확인했습니다…" 로 시작해 구분이 안 된다
  it("첫 **사용자** 메시지에서 뽑는다", () => {
    const msgs = [
      { role: "ai", text: "무엇을 도와드릴까요?" },
      { role: "user", text: "Footer 연도 고쳐줘" },
      { role: "user", text: "그리고 테스트도" },
    ];
    expect(titleFrom(msgs, "새 대화")).toBe("Footer 연도 고쳐줘");
  });

  it("사용자 메시지가 없으면 대체 문구", () => {
    expect(titleFrom([{ role: "ai", text: "안녕하세요" }], "새 대화")).toBe("새 대화");
    expect(titleFrom([], "새 대화")).toBe("새 대화");
  });

  it("공백뿐인 메시지는 건너뛴다", () => {
    expect(titleFrom([{ role: "user", text: "   \n " }, { role: "user", text: "진짜 요청" }], "새 대화")).toBe("진짜 요청");
  });

  // 목록은 한 줄이다 — 줄바꿈이 남으면 행 높이가 제각각이 된다
  it("줄바꿈을 공백으로 눕힌다", () => {
    expect(titleFrom([{ role: "user", text: "첫 줄\n\n둘째 줄" }], "새 대화")).toBe("첫 줄 둘째 줄");
  });

  it("40자에서 자르고 말줄임을 붙인다", () => {
    const long = "가".repeat(60);
    const out = titleFrom([{ role: "user", text: long }], "새 대화");
    expect(out).toHaveLength(41);
    expect(out.endsWith("…")).toBe(true);
  });

  it("정확히 40자는 자르지 않는다", () => {
    const exact = "나".repeat(40);
    expect(titleFrom([{ role: "user", text: exact }], "새 대화")).toBe(exact);
  });

  it("text 가 없어도 죽지 않는다", () => {
    expect(titleFrom([{ role: "user" }], "새 대화")).toBe("새 대화");
  });
});

describe("upsert", () => {
  it("최신순으로 정렬한다", () => {
    const idx = upsert(upsert([], meta("a", 100)), meta("b", 200));
    expect(ids(idx)).toEqual(["b", "a"]);
  });

  it("같은 id 는 덮어쓴다 (두 줄이 되지 않는다)", () => {
    let idx = upsert([], meta("a", 100, "옛 제목"));
    idx = upsert(idx, meta("a", 300, "새 제목"));
    expect(idx).toHaveLength(1);
    expect(idx[0].title).toBe("새 제목");
  });

  // 같은 밀리초에 두 번 저장되면 목록이 이유 없이 재배열되는 것처럼 보인다
  it("updatedAt 이 같으면 원래 순서를 지킨다", () => {
    let idx = upsert([], meta("a", 500));
    idx = upsert(idx, meta("b", 500));
    idx = upsert(idx, meta("c", 500));
    expect(ids(idx)).toEqual(["a", "b", "c"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const orig = [meta("a", 100)];
    upsert(orig, meta("b", 200));
    expect(ids(orig)).toEqual(["a"]);
  });
});

describe("prune", () => {
  it("상한 이하면 그대로 둔다", () => {
    const idx = [meta("a", 3), meta("b", 2)];
    expect(prune(idx, 5)).toEqual({ kept: idx, dropped: [] });
  });

  // 떨어진 것들의 **본문도** 지워야 해서 목록을 돌려준다 — 안 그러면 고아 키가 쌓인다
  it("초과분을 오래된 것부터 떨어뜨리고 그 목록을 돌려준다", () => {
    const idx = [meta("c", 3), meta("b", 2), meta("a", 1)];
    const { kept, dropped } = prune(idx, 2);
    expect(ids(kept)).toEqual(["c", "b"]);
    expect(ids(dropped)).toEqual(["a"]);
  });

  it("기본 상한은 50", () => {
    expect(CONV_CAP).toBe(50);
    const many = Array.from({ length: 55 }, (_, i) => meta("c" + i, 1000 - i));
    const { kept, dropped } = prune(many);
    expect(kept).toHaveLength(50);
    expect(dropped).toHaveLength(5);
  });
});

describe("groupByDay", () => {
  const NOON = new Date(2026, 6, 22, 12, 0, 0).getTime();
  const H = 3_600_000;

  it("오늘 / 어제 / 이전으로 나눈다", () => {
    const g = groupByDay([
      meta("now", NOON),
      meta("dawn", NOON - 11 * H),        // 같은 날 새벽 1시
      meta("yest", NOON - 24 * H),
      meta("old", NOON - 72 * H),
    ], NOON);
    expect(ids(g.today)).toEqual(["now", "dawn"]);
    expect(ids(g.yesterday)).toEqual(["yest"]);
    expect(ids(g.older)).toEqual(["old"]);
  });

  // 자정 직후는 "몇 시간 전" 이어도 어제다 — 달력 기준이지 경과 시간 기준이 아니다
  it("자정을 넘기면 어제로 간다", () => {
    const justAfterMidnight = new Date(2026, 6, 22, 0, 30, 0).getTime();
    const justBefore = justAfterMidnight - 60 * 60 * 1000;
    const g = groupByDay([meta("before", justBefore)], justAfterMidnight);
    expect(ids(g.yesterday)).toEqual(["before"]);
    expect(g.today).toEqual([]);
  });

  it("빈 목록도 처리한다", () => {
    expect(groupByDay([], NOON)).toEqual({ today: [], yesterday: [], older: [] });
  });
});

describe("parseIndex", () => {
  it("없거나 망가진 값은 빈 목록", () => {
    expect(parseIndex(null)).toEqual([]);
    expect(parseIndex("")).toEqual([]);
    expect(parseIndex("{not json")).toEqual([]);
    expect(parseIndex('{"nope":1}')).toEqual([]);
  });

  // 손상된 항목 하나가 목록 전체를 죽이면 안 된다
  it("이상한 항목만 골라 버리고 나머지는 살린다", () => {
    const raw = JSON.stringify([
      { id: "ok", title: "정상", updatedAt: 5, msgCount: 3 },
      { id: "", title: "빈 id", updatedAt: 5 },
      { title: "id 없음", updatedAt: 5 },
      { id: "nan", title: "시간 이상", updatedAt: "어제" },
      null,
      "문자열",
    ]);
    expect(ids(parseIndex(raw))).toEqual(["ok"]);
  });

  it("msgCount 가 없으면 0 으로 채운다", () => {
    expect(parseIndex(JSON.stringify([{ id: "a", title: "t", updatedAt: 1 }]))[0].msgCount).toBe(0);
  });
});
