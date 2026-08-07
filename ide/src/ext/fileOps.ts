// WorkspaceEdit 의 파일 조작 — 무엇을 할지 **먼저 정하고**, 그다음에 한다.
//
// createFile·deleteFile·renameFile 은 셰임에서 던지고 있었다. 리팩터 확장의 기본기라
// (파일 옮기기, 심볼 추출해 새 파일 만들기) 그게 없으면 그런 확장은 첫 줄에서 죽는다.
//
// 텍스트 편집과 다른 점이 하나 있다. 편집은 모델을 거치므로 Ctrl+Z 로 되돌아오지만
// **파일을 지우는 것은 되돌릴 수 없다.** 그래서 판단을 여기 순수 함수로 떼어 두고,
// 하나라도 못 하겠으면 **아무것도 하지 않는다.** 반만 적용된 리팩터는 확장도 사용자도
// 수습할 수 없는 상태를 만든다 — 텍스트 편집 쪽이 이미 그 규칙으로 돌고 있다.
//
// 가장 조심하는 것: **저장하지 않은 편집이 있는 파일을 지우거나 이름을 바꾸지 않는다.**
// 사람이 안 보는 자리에서 도는 코드라 물어볼 수도 없다. 확장에게 "못 했다" 로 답하는
// 편이 낫다 — 이번 판 내내 지켜 온 선이다.

export type FileOpKind = "create" | "delete" | "rename";

export interface FileOp {
  kind: FileOpKind;
  rel: string;
  /** rename 의 목적지. */
  to?: string;
  /** vscode 가 주는 옵션 그대로. */
  overwrite?: boolean;
  ignoreIfExists?: boolean;
  ignoreIfNotExists?: boolean;
  /** createFile 에 딸려 온 내용(vscode 확장은 보통 만든 뒤 편집으로 채운다). */
  content?: string;
}

/** 지금 워크스페이스 상태를 물어보는 통로. 판단은 이것만 보고 한다. */
export interface FileFacts {
  exists: (rel: string) => boolean;
  isDirty: (rel: string) => boolean;
}

export type PlanResult =
  | { ok: true; ops: FileOp[]; skipped: FileOp[] }
  | { ok: false; reason: string };

/** 워크스페이스 밖으로 나가거나 비어 있는 경로를 거른다. */
export function badPath(rel: unknown): boolean {
  if (typeof rel !== "string" || !rel.trim()) return true;
  const p = rel.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return true;   // 절대 경로
  return p.split("/").some(seg => seg === "..");
}

/**
 * 할 일을 확정한다. 실행 순서도 여기서 정한다.
 *
 * 만들기·이름 바꾸기를 먼저, 지우기를 마지막에 둔다. 확장이 흔히 쓰는 꼴이
 * "파일을 만들고 거기에 편집을 넣는다" 이고, 지우기를 뒤로 미뤄야 같은 판에서
 * 지워질 파일을 읽는 편집이 먼저 끝난다.
 */
export function planFileOps(ops: readonly FileOp[], facts: FileFacts): PlanResult {
  const skipped: FileOp[] = [];
  const keep: FileOp[] = [];
  // 이 판에서 새로 생길·사라질 것을 반영해 가며 본다 — 같은 판에서 만든 파일을
  // 곧바로 지우는 것도 정상이다.
  const created = new Set<string>();
  const removed = new Set<string>();
  const here = (rel: string) => (created.has(rel) ? true : removed.has(rel) ? false : facts.exists(rel));

  for (const op of ops) {
    if (badPath(op.rel)) return { ok: false, reason: "워크스페이스 밖 경로: " + String(op.rel) };
    if (op.kind === "rename" && badPath(op.to)) return { ok: false, reason: "워크스페이스 밖 경로: " + String(op.to) };

    if (op.kind === "create") {
      if (here(op.rel)) {
        if (op.overwrite) { keep.push(op); continue; }
        if (op.ignoreIfExists) { skipped.push(op); continue; }
        return { ok: false, reason: "이미 있는 파일: " + op.rel };
      }
      created.add(op.rel); removed.delete(op.rel);
      keep.push(op);
      continue;
    }

    if (op.kind === "delete") {
      if (!here(op.rel)) {
        if (op.ignoreIfNotExists) { skipped.push(op); continue; }
        return { ok: false, reason: "없는 파일을 지우려 합니다: " + op.rel };
      }
      // 저장 안 한 편집을 지우는 것은 되돌릴 방법이 없다.
      if (facts.isDirty(op.rel)) return { ok: false, reason: "저장하지 않은 편집이 있어 지울 수 없습니다: " + op.rel };
      removed.add(op.rel); created.delete(op.rel);
      keep.push(op);
      continue;
    }

    // rename
    const to = op.to as string;
    if (!here(op.rel)) {
      if (op.ignoreIfNotExists) { skipped.push(op); continue; }
      return { ok: false, reason: "없는 파일의 이름을 바꾸려 합니다: " + op.rel };
    }
    if (here(to) && !op.overwrite) return { ok: false, reason: "이미 있는 이름입니다: " + to };
    // 목적지가 덮어써질 파일이고 그쪽에 저장 안 한 편집이 있으면 그것도 사라진다.
    if (here(to) && facts.isDirty(to)) return { ok: false, reason: "저장하지 않은 편집이 있어 덮어쓸 수 없습니다: " + to };
    removed.add(op.rel); created.add(to); created.delete(op.rel); removed.delete(to);
    keep.push(op);
  }

  // 지우기를 뒤로 민다. 나머지는 확장이 적은 순서 그대로다.
  const order = (k: FileOpKind) => (k === "delete" ? 1 : 0);
  const sorted = keep.map((op, i) => ({ op, i })).sort((a, b) => order(a.op.kind) - order(b.op.kind) || a.i - b.i).map(x => x.op);
  return { ok: true, ops: sorted, skipped };
}

/** 이 판이 끝난 뒤 사라질 파일들 — 그 파일에 걸린 텍스트 편집은 버려야 한다. */
export function deletedBy(ops: readonly FileOp[]): Set<string> {
  const gone = new Set<string>();
  for (const op of ops) {
    if (op.kind === "delete") gone.add(op.rel);
    else if (op.kind === "rename") { gone.add(op.rel); gone.delete(op.to as string); }
    else gone.delete(op.rel);
  }
  return gone;
}
