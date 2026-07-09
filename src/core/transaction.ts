import { Patch } from "../ai/types";

export type TransactionStatus = "pending" | "accepted" | "rejected";

/**
 * AI의 편집 하나(한 파일 단위)를 나타내는 트랜잭션.
 * 편집은 즉시 확정되지 않고 pending 상태로 화면에 먼저 보인다.
 */
export interface EditTransaction {
  id: string;
  patch: Patch;
  status: TransactionStatus;
  createdAt: number;
  /** 배치 단위 되돌리기를 위해, 같은 AI 응답에 속한 편집끼리 묶는 그룹 id */
  groupId: string;
}

export type TransactionListener = (event: TransactionEvent) => void;

export type TransactionEvent =
  | { type: "created"; tx: EditTransaction }
  | { type: "updated"; tx: EditTransaction }
  | { type: "cleared" };

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * 트랜잭션 저장소. UI/에디터 레이어는 여기에 구독해서 상태 변화를 반영한다.
 * 실제 파일 적용/롤백은 applyFn/revertFn 콜백에 위임한다(에디터 레이어가 주입).
 */
export class TransactionManager {
  private readonly txs = new Map<string, EditTransaction>();
  private readonly listeners = new Set<TransactionListener>();

  onChange(listener: TransactionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TransactionEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
  }

  create(patch: Patch, groupId: string): EditTransaction {
    const tx: EditTransaction = {
      id: nextId("tx"),
      patch,
      status: "pending",
      createdAt: Date.now(),
      groupId,
    };
    this.txs.set(tx.id, tx);
    this.emit({ type: "created", tx });
    return tx;
  }

  get(id: string): EditTransaction | undefined {
    return this.txs.get(id);
  }

  list(): EditTransaction[] {
    return [...this.txs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  pending(): EditTransaction[] {
    return this.list().filter((t) => t.status === "pending");
  }

  setStatus(id: string, status: TransactionStatus): EditTransaction | undefined {
    const tx = this.txs.get(id);
    if (!tx) {
      return undefined;
    }
    tx.status = status;
    this.emit({ type: "updated", tx });
    return tx;
  }

  clear(): void {
    this.txs.clear();
    this.emit({ type: "cleared" });
  }

  newGroupId(): string {
    return nextId("grp");
  }
}
