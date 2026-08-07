import { describe, it, expect } from "vitest";
import { badPath, planFileOps, deletedBy, type FileOp, type FileFacts } from "./fileOps";

/** 지금 있는 파일과 저장 안 한 파일을 적어 두고 묻는다. */
function facts(exists: string[], dirty: string[] = []): FileFacts {
  return { exists: r => exists.includes(r), isDirty: r => dirty.includes(r) };
}
const create = (rel: string, o: Partial<FileOp> = {}): FileOp => ({ kind: "create", rel, ...o });
const del = (rel: string, o: Partial<FileOp> = {}): FileOp => ({ kind: "delete", rel, ...o });
const ren = (rel: string, to: string, o: Partial<FileOp> = {}): FileOp => ({ kind: "rename", rel, to, ...o });

describe("badPath", () => {
  it("평범한 상대 경로는 통과한다", () => {
    expect(badPath("src/a.ts")).toBe(false);
    expect(badPath("a.ts")).toBe(false);
  });
  it("워크스페이스 밖으로 나가는 경로를 막는다", () => {
    expect(badPath("../secret")).toBe(true);
    expect(badPath("src/../../x")).toBe(true);
    expect(badPath("/etc/passwd")).toBe(true);
    expect(badPath("C:/Windows/system32")).toBe(true);
    expect(badPath("src\\..\\..\\x")).toBe(true);
  });
  it("빈 값도 막는다", () => {
    expect(badPath("")).toBe(true);
    expect(badPath("   ")).toBe(true);
    expect(badPath(undefined)).toBe(true);
    expect(badPath(42)).toBe(true);
  });
});

describe("planFileOps — 만들기", () => {
  it("없는 파일을 만든다", () => {
    const r = planFileOps([create("new.ts")], facts([]));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.ops).toHaveLength(1);
  });
  it("이미 있으면 기본은 실패다 — 남의 파일을 조용히 덮지 않는다", () => {
    const r = planFileOps([create("a.ts")], facts(["a.ts"]));
    expect(r.ok).toBe(false);
  });
  it("overwrite 면 덮어쓴다", () => {
    expect(planFileOps([create("a.ts", { overwrite: true })], facts(["a.ts"])).ok).toBe(true);
  });
  it("ignoreIfExists 면 건너뛰되 건너뛴 것을 알린다", () => {
    const r = planFileOps([create("a.ts", { ignoreIfExists: true })], facts(["a.ts"]));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) { expect(r.ops).toHaveLength(0); expect(r.skipped).toHaveLength(1); }
  });
});

describe("planFileOps — 지우기", () => {
  it("있는 파일을 지운다", () => {
    expect(planFileOps([del("a.ts")], facts(["a.ts"])).ok).toBe(true);
  });
  it("없는 파일은 기본이 실패", () => {
    expect(planFileOps([del("a.ts")], facts([])).ok).toBe(false);
  });
  it("ignoreIfNotExists 면 건너뛴다", () => {
    const r = planFileOps([del("a.ts", { ignoreIfNotExists: true })], facts([]));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.skipped).toHaveLength(1);
  });
  // 이것이 이 파일에서 가장 중요한 줄이다.
  it("저장하지 않은 편집이 있으면 지우지 않는다", () => {
    const r = planFileOps([del("a.ts")], facts(["a.ts"], ["a.ts"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("저장하지 않은");
  });
});

describe("planFileOps — 이름 바꾸기", () => {
  it("있는 파일의 이름을 바꾼다", () => {
    expect(planFileOps([ren("a.ts", "b.ts")], facts(["a.ts"])).ok).toBe(true);
  });
  it("원본이 없으면 실패", () => {
    expect(planFileOps([ren("a.ts", "b.ts")], facts([])).ok).toBe(false);
  });
  it("목적지가 이미 있으면 기본은 실패", () => {
    expect(planFileOps([ren("a.ts", "b.ts")], facts(["a.ts", "b.ts"])).ok).toBe(false);
  });
  it("overwrite 면 덮어쓴다", () => {
    expect(planFileOps([ren("a.ts", "b.ts", { overwrite: true })], facts(["a.ts", "b.ts"])).ok).toBe(true);
  });
  it("덮어쓸 목적지에 저장 안 한 편집이 있으면 막는다", () => {
    const r = planFileOps([ren("a.ts", "b.ts", { overwrite: true })], facts(["a.ts", "b.ts"], ["b.ts"]));
    expect(r.ok).toBe(false);
  });
});

describe("planFileOps — 한 판 안의 앞뒤 관계", () => {
  it("방금 만든 파일을 곧바로 지울 수 있다", () => {
    expect(planFileOps([create("new.ts"), del("new.ts")], facts([])).ok).toBe(true);
  });
  it("방금 지운 자리에 다시 만들 수 있다", () => {
    expect(planFileOps([del("a.ts"), create("a.ts")], facts(["a.ts"])).ok).toBe(true);
  });
  it("이름을 바꾼 뒤 옛 이름으로 다시 만들 수 있다", () => {
    expect(planFileOps([ren("a.ts", "b.ts"), create("a.ts")], facts(["a.ts"])).ok).toBe(true);
  });
  it("이름을 바꾼 뒤 그 목적지를 또 옮길 수 있다", () => {
    expect(planFileOps([ren("a.ts", "b.ts"), ren("b.ts", "c.ts")], facts(["a.ts"])).ok).toBe(true);
  });
});

describe("planFileOps — 순서와 전부-아니면-전무", () => {
  it("지우기를 마지막으로 미룬다", () => {
    const r = planFileOps([del("old.ts"), create("new.ts")], facts(["old.ts"]));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.ops.map(o => o.kind)).toEqual(["create", "delete"]);
  });
  it("나머지 순서는 확장이 적은 그대로다", () => {
    const r = planFileOps([create("a.ts"), ren("a.ts", "b.ts"), create("c.ts")], facts([]));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.ops.map(o => o.rel)).toEqual(["a.ts", "a.ts", "c.ts"]);
  });
  it("하나라도 못 하면 아무것도 하지 않는다", () => {
    // 앞의 만들기는 멀쩡한데 뒤의 지우기가 미저장이라 전체가 접힌다.
    const r = planFileOps([create("new.ts"), del("a.ts")], facts(["a.ts"], ["a.ts"]));
    expect(r.ok).toBe(false);
  });
  it("워크스페이스 밖 경로는 통째로 거절한다", () => {
    expect(planFileOps([create("../evil.ts")], facts([])).ok).toBe(false);
    expect(planFileOps([ren("a.ts", "../evil.ts")], facts(["a.ts"])).ok).toBe(false);
  });
});

describe("deletedBy", () => {
  it("지워지는 파일을 모은다", () => {
    expect([...deletedBy([del("a.ts")])]).toEqual(["a.ts"]);
  });
  it("이름을 바꾸면 옛 이름이 사라진다", () => {
    expect([...deletedBy([ren("a.ts", "b.ts")])]).toEqual(["a.ts"]);
  });
  it("다시 만든 파일은 사라진 것이 아니다", () => {
    expect([...deletedBy([del("a.ts"), create("a.ts")])]).toEqual([]);
  });
  it("이름을 바꾼 목적지는 사라진 것이 아니다", () => {
    expect([...deletedBy([del("b.ts"), ren("a.ts", "b.ts")])]).toEqual(["a.ts"]);
  });
});
