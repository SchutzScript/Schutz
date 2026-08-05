// 승인 요청 줄 세우기.
//
// askRunApproval 은 resolve 를 필드 하나(`_askRunResolve`)에 담고 있었다. 실행이 하나뿐일
// 때는 맞는데, 이 앱은 위임으로 **여러 실행이 동시에 돈다.** 한 라운드에 delegate_task 가
// 둘이면 하위 실행 둘이 나란히 돌고, 둘 다 셸 명령 승인을 물을 수 있다.
//
// 그때 뒤에 온 물음이 앞의 resolve 를 덮어썼다. 사용자가 답하면 **뒤엣것만** 풀리고,
// 앞의 실행은 영원히 await 에 매달린다 — 상태는 "편집 중" 인 채로 멈추고, 그 실행이
// 쥔 파일 락은 finally 에 도달하지 못해 풀리지 않으며, 화면에는 아무 말도 안 나온다.
// 그 파일을 건드리려는 다른 에이전트는 계속 "작업 중입니다" 만 듣는다.
//
// 그래서 덮지 않고 줄을 세운다. 하나씩 보여 주고, 답한 것만 풀고, 다음을 올린다.
// 모든 물음은 정확히 한 번 풀린다 — 그게 여기서 지켜야 할 전부다.

export interface Pending<T> {
  readonly item: T;
  readonly resolve: (ok: boolean) => void;
}

export class AskQueue<T> {
  private q: Pending<T>[] = [];

  /** 물음을 줄 끝에 세운다. 앞엣것을 덮지 않는다. */
  add(item: T, resolve: (ok: boolean) => void): void {
    this.q.push({ item, resolve });
  }

  /** 지금 보여 줄 물음. 없으면 null. */
  current(): T | null {
    const head = this.q[0];
    return head ? head.item : null;
  }

  get size(): number { return this.q.length; }

  /** 지금 보이는 물음에 답한다 → 다음 물음(없으면 null)을 돌려준다. */
  answer(ok: boolean): T | null {
    const head = this.q.shift();
    head?.resolve(ok);
    return this.current();
  }

  /** 조건에 맞는 물음을 전부 거절로 걷어낸다(예: 그 에이전트를 중지했을 때).
   *  보이던 것이 걷혀 나갔을 수 있으므로 지금 보여 줄 물음을 돌려준다. */
  cancelWhere(pred: (item: T) => boolean, ok = false): T | null {
    const keep: Pending<T>[] = [];
    const drop: Pending<T>[] = [];
    for (const p of this.q) (pred(p.item) ? drop : keep).push(p);
    this.q = keep;
    for (const p of drop) p.resolve(ok);
    return this.current();
  }

  /** 전부 거절로 정리한다. 매달린 물음을 남기고 떠나지 않는다. */
  cancelAll(ok = false): void {
    const all = this.q;
    this.q = [];
    for (const p of all) p.resolve(ok);
  }
}
