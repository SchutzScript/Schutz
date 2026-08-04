/**
 * 디스크에서 사라진 파일의 열린 버퍼를 어떻게 할 것인가.
 *
 * 예전엔 트리에 없는 모델을 **전부** 폐기했다. dirty 검사가 없었다. 그래서
 *
 *   1. 파일을 열어 고치고 저장하지 않은 채 두고,
 *   2. 밖에서 그 파일이 사라지면(브랜치 전환, git stash, 빌드 스크립트, 다른 편집기의
 *      "임시 파일에 쓰고 이름 바꾸기" 식 저장),
 *   3. 다음 트리 동기화가 그 모델을 dispose 한다.
 *
 * 저장 안 한 편집이 경고도 되돌리기도 없이 사라진다. 0.1.0 에서 두 번 고친 것과 같은
 * 부류의 세 번째 형태다.
 *
 * 그렇다고 전부 남기면 안 된다. 사라진 파일의 깨끗한 모델이 남아 있으면 dirtyRels 가
 * 없는 경로를 계속 내주고, 모두 저장이 **사용자가 지운 파일을 되살린다.**
 *
 * 그래서 가른다: 고친 것은 남기고, 안 고친 것은 버린다. 되살아나는 일은 사용자가
 * 직접 저장을 눌렀을 때만 일어나고, 그때는 화면에 dirty 표시가 떠 있다.
 */

export interface StaleDecision {
  /** 폐기할 rel — 사라졌고 고치지도 않았다. */
  drop: string[];
  /** 남길 rel — 사라졌지만 저장 안 한 편집이 있다. 사용자에게 알려야 한다. */
  keep: string[];
}

export function decideStale(
  opened: readonly string[],
  present: ReadonlySet<string>,
  isDirty: (rel: string) => boolean,
): StaleDecision {
  const drop: string[] = [], keep: string[] = [];
  for (const rel of opened) {
    if (present.has(rel)) continue;
    // 사라진 파일. 고친 게 있으면 남긴다 — 지우면 되돌릴 방법이 아예 없다.
    (safeDirty(isDirty, rel) ? keep : drop).push(rel);
  }
  return { drop, keep };
}

/** isDirty 가 던져도 판단이 멈추면 안 된다. 모르면 **고친 것으로 본다** —
 *  잘못 남기면 탭 하나가 더 열려 있을 뿐이고, 잘못 버리면 작업이 사라진다. */
function safeDirty(isDirty: (rel: string) => boolean, rel: string): boolean {
  try { return isDirty(rel); } catch { return true; }
}

/** 사라진 파일 중 새로 알려야 할 것. 이미 알린 것은 다시 알리지 않는다 —
 *  트리 동기화는 자주 돌고, 그때마다 같은 토스트가 뜨면 화면을 못 쓴다. */
export function newlyGone(keep: readonly string[], alreadyTold: ReadonlySet<string>): string[] {
  return keep.filter(rel => !alreadyTold.has(rel));
}

/** 다시 나타난 파일은 알림 기록에서 지운다 — 사라졌다 돌아왔다 다시 사라지면
 *  그건 새 소식이다. */
export function stillGone(told: ReadonlySet<string>, present: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const rel of told) if (!present.has(rel)) out.add(rel);
  return out;
}
