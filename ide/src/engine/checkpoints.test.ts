import { describe, it, expect } from "vitest";
import {
  planUndo, actionable, mergeCapture, applyAfter, summarize, pruneCheckpoints,
  sweepableRuns,
  type CheckpointEntry, type DiskState, type CheckpointHeader,
} from "./checkpoints";

const E = (o: Partial<CheckpointEntry>): CheckpointEntry => ({
  rel: "a.ts", kind: "modify", beforeHash: "H0", afterHash: "H1", ...o,
});
const D = (o: Partial<DiskState>): DiskState => ({ exists: true, hash: "H1", ...o });
const disk = (rel: string, d: Partial<DiskState>) => new Map([[rel, D(d)]]);
const only = (entries: CheckpointEntry[], m: Map<string, DiskState>) => planUndo(entries, m)[0]!;

describe("planUndo — 되돌려도 되는 경우", () => {
  it("우리가 쓴 그대로면 되돌린다", () => {
    expect(only([E({})], disk("a.ts", { hash: "H1" }))).toEqual({ rel: "a.ts", action: "restore" });
  });

  it("그 실행이 만든 파일은 지운다", () => {
    const v = only([E({ kind: "create", beforeHash: null })], disk("a.ts", { hash: "H1" }));
    expect(v).toEqual({ rel: "a.ts", action: "delete" });
  });

  it("사용자가 지워 버린 파일은 되살린다 — 덮어쓸 게 없으니 잃는 것도 없다", () => {
    const v = only([E({})], disk("a.ts", { exists: false, hash: null }));
    expect(v).toEqual({ rel: "a.ts", action: "restore" });
  });
});

describe("planUndo — 할 일이 없는 경우", () => {
  it("이미 원본 상태면 건너뛴다", () => {
    const v = only([E({})], disk("a.ts", { hash: "H0" }));
    expect(v).toEqual({ rel: "a.ts", action: "skip", why: "already-restored" });
  });

  it("우리가 만든 파일이 이미 없으면 건너뛴다", () => {
    const v = only([E({ kind: "create", beforeHash: null })], disk("a.ts", { exists: false, hash: null }));
    expect(v).toEqual({ rel: "a.ts", action: "skip", why: "gone" });
  });

  it("캡처만 하고 쓰기가 실패했으면 건너뛴다 — 원문 못 찾음·중복 매칭 등", () => {
    const v = only([E({ afterHash: null })], disk("a.ts", { hash: "뭐가됐든" }));
    expect(v).toEqual({ rel: "a.ts", action: "skip", why: "never-written" });
  });

  it("원본이 너무 커서 안 들고 있으면 건너뛴다", () => {
    const v = only([E({ oversize: true })], disk("a.ts", { hash: "H1" }));
    expect(v).toEqual({ rel: "a.ts", action: "skip", why: "oversize" });
  });

  it("oversize 는 다른 모든 판정보다 앞선다 — 되돌릴 원본 자체가 없다", () => {
    const v = only([E({ oversize: true, afterHash: null })], disk("a.ts", { exists: false, hash: null }));
    expect(v.action).toBe("skip");
    expect((v as any).why).toBe("oversize");
  });
});

describe("planUndo — 사람에게 물어야 하는 경우", () => {
  it("우리가 쓴 뒤에 누가 고쳤으면 드리프트 — 조용히 덮지 않는다", () => {
    const v = only([E({})], disk("a.ts", { hash: "사용자가바꾼해시" }));
    expect(v).toEqual({ rel: "a.ts", action: "conflict", why: "drift" });
  });

  it("저장 안 한 버퍼가 떠 있으면 막는다 — 되돌려도 다음 저장이 도로 덮는다", () => {
    const v = only([E({})], disk("a.ts", { hash: "H1", dirtyInEditor: true }));
    expect(v).toEqual({ rel: "a.ts", action: "conflict", why: "unsaved-buffer" });
  });

  it("더러운 버퍼는 드리프트보다 먼저 걸린다", () => {
    const v = only([E({})], disk("a.ts", { hash: "다른것", dirtyInEditor: true }));
    expect((v as any).why).toBe("unsaved-buffer");
  });

  it("만든 파일이라도 그 뒤에 고쳐졌으면 함부로 지우지 않는다", () => {
    const v = only([E({ kind: "create", beforeHash: null })], disk("a.ts", { hash: "사용자가이어서작업" }));
    expect(v).toEqual({ rel: "a.ts", action: "conflict", why: "drift" });
  });
});

describe("planUndo — 잡다한 것", () => {
  it("디스크 정보가 아예 없으면 없는 파일로 본다", () => {
    expect(planUndo([E({})], new Map())[0]).toEqual({ rel: "a.ts", action: "restore" });
  });
  it("여러 파일을 각각 판정한다", () => {
    const plan = planUndo(
      [E({ rel: "a.ts" }), E({ rel: "b.ts" }), E({ rel: "c.ts", kind: "create", beforeHash: null })],
      new Map([
        ["a.ts", D({ hash: "H1" })],
        ["b.ts", D({ hash: "바뀜" })],
        ["c.ts", D({ hash: "H1" })],
      ]),
    );
    expect(plan.map(v => v.action)).toEqual(["restore", "conflict", "delete"]);
  });
  it("빈 입력은 빈 계획", () => expect(planUndo([], new Map())).toEqual([]));
});

describe("actionable", () => {
  it("실제로 바뀌는 것만 골라낸다", () => {
    const plan = planUndo(
      [E({ rel: "a.ts" }), E({ rel: "b.ts", afterHash: null })],
      new Map([["a.ts", D({ hash: "H1" })]]),
    );
    expect(actionable(plan).map(v => v.rel)).toEqual(["a.ts"]);
  });
});

describe("mergeCapture — 처음 것이 원본", () => {
  it("같은 파일을 두 번 캡처해도 첫 원본을 지킨다", () => {
    let es = mergeCapture([], E({ rel: "a.ts", beforeHash: "처음" }));
    es = mergeCapture(es, E({ rel: "a.ts", beforeHash: "나중" }));
    expect(es).toHaveLength(1);
    expect(es[0]!.beforeHash).toBe("처음");
  });
  it("다른 파일은 더한다", () => {
    let es = mergeCapture([], E({ rel: "a.ts" }));
    es = mergeCapture(es, E({ rel: "b.ts" }));
    expect(es.map(e => e.rel)).toEqual(["a.ts", "b.ts"]);
  });
  it("입력을 바꾸지 않는다", () => {
    const orig = [E({ rel: "a.ts" })];
    mergeCapture(orig, E({ rel: "b.ts" }));
    expect(orig).toHaveLength(1);
  });
});

describe("applyAfter", () => {
  it("해당 파일의 afterHash 만 갱신한다", () => {
    const es = [E({ rel: "a.ts", afterHash: "옛것" }), E({ rel: "b.ts", afterHash: "그대로" })];
    const r = applyAfter(es, "a.ts", "새것");
    expect(r[0]!.afterHash).toBe("새것");
    expect(r[1]!.afterHash).toBe("그대로");
  });
  it("없는 파일은 만들지 않는다 — 캡처 안 된 것을 되돌릴 수는 없다", () => {
    const r = applyAfter([E({ rel: "a.ts" })], "없는파일.ts", "H");
    expect(r).toHaveLength(1);
  });
});

describe("summarize", () => {
  it("만든 것과 고친 것을 센다", () => {
    const es = [E({ rel: "a" }), E({ rel: "b", kind: "create", beforeHash: null }), E({ rel: "c" })];
    expect(summarize(es)).toEqual({ files: 3, created: 1, modified: 2 });
  });
});

describe("pruneCheckpoints", () => {
  const H = (id: string, at: number, bytes = 10, open = false): CheckpointHeader =>
    ({ rootRunId: id, startedAt: at, bytes, open });

  it("상한 안이면 아무것도 안 버린다", () => {
    expect(pruneCheckpoints([H("a", 1), H("b", 2)], { maxRuns: 5, maxBytes: 100 })).toEqual([]);
  });

  it("개수를 넘기면 오래된 것부터 버린다", () => {
    const drop = pruneCheckpoints([H("old", 1), H("mid", 2), H("new", 3)], { maxRuns: 2, maxBytes: 1000 });
    expect(drop).toEqual(["old"]);
  });

  it("용량을 넘기면 그만큼 버린다", () => {
    const drop = pruneCheckpoints([H("a", 1, 60), H("b", 2, 60)], { maxRuns: 99, maxBytes: 100 });
    expect(drop).toEqual(["a"]);
  });

  it("도는 실행은 절대 안 버린다 — 지금 쓰고 있는 안전망이다", () => {
    const drop = pruneCheckpoints([H("live", 1, 500, true), H("done", 2, 10)], { maxRuns: 1, maxBytes: 1 });
    expect(drop).toEqual(["done"]);
  });

  it("열린 것만 있으면 버릴 게 없다 — 상한을 넘겨도", () => {
    const drop = pruneCheckpoints([H("x", 1, 9999, true)], { maxRuns: 0, maxBytes: 0 });
    expect(drop).toEqual([]);
  });
});

describe("sweepableRuns — 창이 둘일 때 남의 체크포인트를 닫지 않는다", () => {
  const H = (o: Partial<CheckpointHeader> & { rootRunId: string }): CheckpointHeader =>
    ({ startedAt: 1000, bytes: 0, open: true, ...o });
  const base = { ownerId: "A", now: 1_000_000, staleMs: 90_000, selfBusy: false };

  it("닫힌 것은 대상이 아니다", () => {
    expect(sweepableRuns([H({ rootRunId: "r", open: false, owner: "A" })], base)).toEqual([]);
  });

  it("내 것이고 내가 놀고 있으면 치운다 — 죽었다 살아난 뒤의 고아 정리", () => {
    expect(sweepableRuns([H({ rootRunId: "r", owner: "A", beatAt: base.now })], base)).toEqual(["r"]);
  });

  it("내 것이어도 내가 돌고 있으면 안 치운다", () => {
    expect(sweepableRuns([H({ rootRunId: "r", owner: "A" })], { ...base, selfBusy: true })).toEqual([]);
  });

  it("남의 것이 방금 신호를 보냈으면 손대지 않는다 — 이게 실제 데이터 유실 경로였다", () => {
    expect(sweepableRuns([H({ rootRunId: "r", owner: "B", beatAt: base.now - 1000 })], base)).toEqual([]);
  });

  it("내가 바쁘든 말든 남의 살아 있는 실행은 그대로 둔다", () => {
    const hs = [H({ rootRunId: "r", owner: "B", beatAt: base.now })];
    expect(sweepableRuns(hs, { ...base, selfBusy: true })).toEqual([]);
  });

  it("남의 것이라도 신호가 끊긴 지 오래면 치운다 — 그 창은 죽었다", () => {
    expect(sweepableRuns([H({ rootRunId: "r", owner: "B", beatAt: base.now - 90_000 })], base)).toEqual(["r"]);
  });

  it("경계에서 1ms 모자라면 아직 살아 있는 것으로 본다", () => {
    expect(sweepableRuns([H({ rootRunId: "r", owner: "B", beatAt: base.now - 89_999 })], base)).toEqual([]);
  });

  it("주인·신호가 없는 옛 형식은 시작 시각으로 판단한다", () => {
    expect(sweepableRuns([H({ rootRunId: "old", startedAt: base.now - 200_000 })], base)).toEqual(["old"]);
    expect(sweepableRuns([H({ rootRunId: "new", startedAt: base.now - 1000 })], base)).toEqual([]);
  });

  it("섞여 있어도 각각 따로 판단한다", () => {
    const hs = [
      H({ rootRunId: "mine", owner: "A" }),
      H({ rootRunId: "live", owner: "B", beatAt: base.now }),
      H({ rootRunId: "dead", owner: "C", beatAt: base.now - 120_000 }),
      H({ rootRunId: "done", owner: "B", open: false }),
    ];
    expect(sweepableRuns(hs, base)).toEqual(["mine", "dead"]);
  });
});
