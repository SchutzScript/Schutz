// AI 실행을 통째로 되돌리기 위한 판단 로직.
//
// 자율성이 `auto` 면 편집이 묻지도 않고 파일에 적용된다. 그런데 지금까지 회수 수단은
// 파일별 Monaco 실행취소와 git 뿐이었다 — "방금 그 실행이 한 일 전부" 를 되돌릴 방법이
// 없었다. 이 모듈은 그 되돌리기가 **무엇을 건드려도 되는지** 를 정한다.
//
// 여기에 파일 IO 는 없다. 메인 프로세스가 사실(디스크 상태)을 모아 주면 이 함수가
// 판단만 하고, 렌더러가 그 판단을 사용자에게 보여준 뒤 확인된 것만 되돌려 달라고
// 요청한다. 판단이 한 군데에만 있어야 확인 화면과 실제 동작이 어긋나지 않는다.

/** 캡처된 파일 하나. `kind: "create"` 는 그 실행이 **만든** 파일 — 되돌리기는 삭제다. */
export interface CheckpointEntry {
  rel: string;
  kind: "modify" | "create";
  /** 손대기 전 내용의 해시. create 면 null. */
  beforeHash: string | null;
  /** 우리가 마지막으로 쓴 내용의 해시. 쓰기 전에 실패했으면 null. */
  afterHash: string | null;
  /** 원본이 너무 커서 보관하지 않음 — 되돌릴 수 없다. */
  oversize?: boolean;
}

/** 지금 디스크가 어떤 상태인지. 메인이 읽어서 채운다. */
export interface DiskState {
  exists: boolean;
  hash: string | null;
  /** 에디터에 저장 안 한 편집이 떠 있는가 (projectModels.isDirty) */
  dirtyInEditor?: boolean;
}

export type UndoVerdict =
  | { rel: string; action: "restore" }                       // 원본으로 되돌린다
  | { rel: string; action: "delete" }                        // 그 실행이 만든 파일 — 지운다
  | { rel: string; action: "skip"; why: SkipReason }          // 할 일이 없다
  | { rel: string; action: "conflict"; why: ConflictReason }; // 사람이 정해야 한다

export type SkipReason = "already-restored" | "gone" | "never-written" | "oversize";
export type ConflictReason = "drift" | "unsaved-buffer";

/**
 * 되돌리기 계획. 표 그대로다 — 순서가 중요하다.
 *
 * 가장 조심할 것: **우리가 쓴 뒤에 사용자가 고친 파일을 조용히 덮지 않는다.**
 * 그 판정은 "지금 디스크 해시 ≠ 우리가 마지막으로 쓴 해시" 로 한다.
 * (`projectModels.externalChangeOf` 를 쓰려다 접었다 — markSaved 가 그 표시를 지우는데
 *  수락 경로가 매번 markSaved 를 부른다. 우리 손으로 신호를 지우고 그걸 읽는 꼴이 된다.)
 */
export function planUndo(entries: readonly CheckpointEntry[], disk: ReadonlyMap<string, DiskState>): UndoVerdict[] {
  return entries.map(e => {
    const d = disk.get(e.rel) ?? { exists: false, hash: null };

    // 원본을 못 들고 있으면 되돌릴 수가 없다. 캡처 시점에 이미 알렸어야 한다.
    if (e.oversize) return { rel: e.rel, action: "skip", why: "oversize" };

    // 캡처는 했는데 쓰기가 실패한 경우(원문 못 찾음·중복 매칭·파일 존재 …) — 건드린 게 없다.
    if (e.afterHash === null) return { rel: e.rel, action: "skip", why: "never-written" };

    // 저장 안 한 버퍼가 떠 있으면 디스크를 되돌려도 다음 Ctrl+S 가 도로 덮는다.
    // 되돌린 척하고 되돌아가지 않는 게 가장 나쁘므로 사람에게 넘긴다.
    if (d.dirtyInEditor) return { rel: e.rel, action: "conflict", why: "unsaved-buffer" };

    if (!d.exists) {
      // 우리가 만든 파일이 이미 없다 — 할 일 없음.
      if (e.kind === "create") return { rel: e.rel, action: "skip", why: "gone" };
      // 우리가 고친 파일을 사용자가 지웠다. 덮어쓸 것이 없으니 되살려도 잃는 게 없다.
      return { rel: e.rel, action: "restore" };
    }

    // 우리가 쓴 그대로다 → 안전하게 되돌린다.
    if (d.hash === e.afterHash) {
      return e.kind === "create" ? { rel: e.rel, action: "delete" } : { rel: e.rel, action: "restore" };
    }

    // 이미 원본 상태다(사용자가 직접 되돌렸거나 다른 되돌리기가 지나갔다).
    if (e.beforeHash !== null && d.hash === e.beforeHash) {
      return { rel: e.rel, action: "skip", why: "already-restored" };
    }

    // 우리가 쓴 것도, 원본도 아니다 = 그 뒤에 누군가 고쳤다.
    return { rel: e.rel, action: "conflict", why: "drift" };
  });
}

/** 실제로 무언가 바뀌는 항목만. 되돌릴 게 없으면 버튼을 눌러도 소용없다.
 *  (`needsConfirm` 도 만들었다가 지웠다 — 되돌리기는 파괴적이라 충돌이 없어도 늘 묻는다.
 *   부르는 데가 없는 함수를 남기면 "조건부로 안 물을 수도 있다" 는 거짓 신호가 된다.) */
export function actionable(plan: readonly UndoVerdict[]): UndoVerdict[] {
  return plan.filter(v => v.action === "restore" || v.action === "delete");
}

/* ── 캡처 쪽 ─────────────────────────────────────────────────────────────── */

/** 같은 파일을 여러 번 고쳐도 **처음 것** 이 원본이다. 두 번째 캡처는 무시한다. */
export function mergeCapture(
  entries: readonly CheckpointEntry[],
  next: CheckpointEntry,
): CheckpointEntry[] {
  if (entries.some(e => e.rel === next.rel)) return [...entries];
  return [...entries, next];
}

/** 쓰기에 성공할 때마다 "우리가 마지막으로 쓴 것" 을 갱신한다. 없는 항목은 만들지 않는다. */
export function applyAfter(
  entries: readonly CheckpointEntry[],
  rel: string,
  afterHash: string,
): CheckpointEntry[] {
  return entries.map(e => (e.rel === rel ? { ...e, afterHash } : e));
}

/** 카드에 쓸 한 줄 요약. */
export function summarize(entries: readonly CheckpointEntry[]): { files: number; created: number; modified: number } {
  return {
    files: entries.length,
    created: entries.filter(e => e.kind === "create").length,
    modified: entries.filter(e => e.kind === "modify").length,
  };
}

/* ── 보관 상한 ───────────────────────────────────────────────────────────── */

export interface CheckpointHeader {
  rootRunId: string;
  startedAt: number;
  bytes: number;
  /** 아직 도는 실행 — 절대 버리지 않는다. */
  open: boolean;
  /** 이 실행을 돌리는 창의 id. 옛 형식이면 "". */
  owner?: string;
  /** 주인이 마지막으로 살아 있다고 알린 시각(ms). 옛 형식이면 0/없음. */
  beatAt?: number;
}

/** 열린 채 남은 체크포인트 중 **이 창이 닫아도 되는** 것.
 *
 *  실행 도중에 앱이 죽으면 체크포인트가 open 인 채 남는다. 그러면 목록에도 안 뜨고
 *  보관 상한에서도 빠져 영영 안 지워지므로 누군가는 치워야 한다. 문제는 창이 둘일 때다 —
 *  예전엔 주인 개념이 없어서 **놀고 있는 창이 옆 창에서 돌고 있는 실행의 체크포인트를
 *  닫고, 이어서 보관 상한이 그걸 지웠다.** 그 실행은 되돌릴 수 없게 된다.
 *
 *  그래서 두 경우만 청소한다:
 *   - 내 것이고, 내가 지금 아무것도 안 돌리고 있다 (예전 동작 그대로)
 *   - 남의 것인데 오래 조용하다 = 그 창은 죽었다 (heartbeat 가 끊겼다)
 *
 *  주인을 모르는 옛 형식(owner "")은 heartbeat 도 없으므로 나이로만 판단한다. */
export function sweepableRuns(
  headers: readonly CheckpointHeader[],
  o: { ownerId: string; now: number; staleMs: number; selfBusy: boolean },
): string[] {
  const out: string[] = [];
  for (const h of headers) {
    if (!h.open) continue;
    const mine = !!h.owner && h.owner === o.ownerId;
    if (mine) { if (!o.selfBusy) out.push(h.rootRunId); continue; }
    const last = h.beatAt || h.startedAt || 0;
    if (o.now - last >= o.staleMs) out.push(h.rootRunId);
  }
  return out;
}

/** heartbeat 가 이만큼 끊기면 그 창은 죽은 것으로 본다. 턴 하나가 길어도 15초마다
 *  신호를 보내므로 넉넉하다. */
export const CHECKPOINT_STALE_MS = 90_000;

/** 보관 상한. 되돌리기는 "방금 한 일" 을 위한 것이지 이력 보관이 아니다 —
 *  넉넉하되 userData 를 무한히 불리지 않을 만큼만. */
export const CHECKPOINT_LIMITS = { maxRuns: 20, maxBytes: 64 * 1024 * 1024 };

/**
 * 상한을 넘긴 만큼 버릴 runId 목록. 오래된 것부터, **열린 것은 건드리지 않는다.**
 * 실제 삭제는 부르는 쪽이 한다 — 이 모듈은 파일을 만지지 않는다.
 */
export function pruneCheckpoints(
  headers: readonly CheckpointHeader[],
  limits: { maxRuns: number; maxBytes: number },
): string[] {
  const closed = headers.filter(h => !h.open).sort((a, b) => a.startedAt - b.startedAt);
  const openBytes = headers.filter(h => h.open).reduce((n, h) => n + h.bytes, 0);
  const drop: string[] = [];

  // 개수 상한 — 열린 것도 자리를 차지하므로 전체 개수로 센다
  let count = headers.length;
  let bytes = openBytes + closed.reduce((n, h) => n + h.bytes, 0);

  for (const h of closed) {
    if (count <= limits.maxRuns && bytes <= limits.maxBytes) break;
    drop.push(h.rootRunId);
    count--;
    bytes -= h.bytes;
  }
  return drop;
}
