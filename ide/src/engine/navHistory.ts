/**
 * 편집 위치 기록 — Alt+← / Alt+→.
 *
 * "방금 어디 있었더라" 를 되짚는 길이 없었다. 정의로 점프하고 나면 원래 보던 자리로
 * 돌아오려면 파일 이름과 줄 번호를 기억하고 있어야 했다.
 *
 * 브라우저 뒤로 가기와 같은 규칙이다: 뒤로 간 뒤에 **새로운 곳**으로 가면 앞쪽 기록은
 * 버린다. 부수효과 없는 순수 함수로 두어 그 규칙을 테스트로 못 박는다.
 */

export interface NavSpot {
  rel: string;
  line: number;
}

export interface NavState {
  /** 방문 기록. 오래된 것이 앞. */
  spots: NavSpot[];
  /** 지금 어디를 보고 있는가. spots 의 인덱스. 비어 있으면 -1. */
  idx: number;
}

export const NAV_LIMIT = 60;
/** 같은 파일 안에서 이만큼 이상 뛰면 별도의 자리로 친다. 한 줄씩 내려가는 것까지
 *  기록하면 뒤로 가기가 커서 이동 취소가 되어 쓸모없어진다. */
export const NAV_MIN_JUMP = 10;

export const emptyNav = (): NavState => ({ spots: [], idx: -1 });

/** 지금 보고 있는 자리. 없으면 null. */
export function current(s: NavState): NavSpot | null {
  return s.idx >= 0 && s.idx < s.spots.length ? s.spots[s.idx]! : null;
}

/** 새로 간 자리를 기록할 만한가 — 같은 파일의 코앞이면 아니다. */
export function isNewSpot(s: NavState, next: NavSpot): boolean {
  const cur = current(s);
  if (!cur) return true;
  if (cur.rel !== next.rel) return true;
  return Math.abs(cur.line - next.line) >= NAV_MIN_JUMP;
}

/** 자리를 하나 남긴다. 뒤로 간 상태에서 부르면 앞쪽 기록은 버려진다(브라우저와 같다). */
export function push(s: NavState, next: NavSpot): NavState {
  if (!isNewSpot(s, next)) {
    // 같은 자리 안에서의 잔이동 — 줄 번호만 최신으로 갱신해 둔다.
    if (s.idx < 0) return s;
    const spots = s.spots.slice();
    spots[s.idx] = next;
    return { spots, idx: s.idx };
  }
  const kept = s.spots.slice(0, s.idx + 1);
  kept.push(next);
  const over = kept.length - NAV_LIMIT;
  const spots = over > 0 ? kept.slice(over) : kept;
  return { spots, idx: spots.length - 1 };
}

export const canBack = (s: NavState): boolean => s.idx > 0;
export const canForward = (s: NavState): boolean => s.idx >= 0 && s.idx < s.spots.length - 1;

/** 한 칸 뒤로. 갈 곳이 없으면 상태를 그대로 돌려준다(호출측이 === 로 판별한다). */
export function back(s: NavState): NavState {
  return canBack(s) ? { spots: s.spots, idx: s.idx - 1 } : s;
}
export function forward(s: NavState): NavState {
  return canForward(s) ? { spots: s.spots, idx: s.idx + 1 } : s;
}

/** 사라진 파일을 기록에서 걷어낸다 — 닫은 게 아니라 **지워진** 파일로 되돌아가면
 *  빈 탭이 열린다. 이어지는 중복은 하나로 접는다. */
export function dropMissing(s: NavState, exists: (rel: string) => boolean): NavState {
  const cur = current(s);
  const kept: NavSpot[] = [];
  let idx = -1;
  for (let i = 0; i < s.spots.length; i++) {
    const sp = s.spots[i]!;
    if (!exists(sp.rel)) continue;
    const last = kept[kept.length - 1];
    if (last && last.rel === sp.rel && last.line === sp.line) {
      if (s.spots[i] === cur) idx = kept.length - 1;
      continue;
    }
    kept.push(sp);
    if (s.spots[i] === cur) idx = kept.length - 1;
  }
  if (idx < 0) idx = kept.length - 1;   // 보고 있던 자리가 사라졌다 → 가장 최근으로
  return { spots: kept, idx };
}
