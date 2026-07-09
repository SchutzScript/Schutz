import { AIProvider } from "../ai/provider";
import { ChatRequest, Message, PlanStep } from "../ai/types";
import { EditTransaction, TransactionManager } from "./transaction";

/** 오케스트레이터가 UI/에디터로 방출하는 상위 이벤트. */
export type OrchestratorEvent =
  | { type: "status"; text: string }
  | { type: "assistant_text"; delta: string; full: string }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "tool"; phase: "call" | "result"; id: string; name?: string; data: unknown }
  | { type: "transaction"; tx: EditTransaction }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "error"; message: string };

export type OrchestratorListener = (event: OrchestratorEvent) => void;

/**
 * pending 트랜잭션을 실제 에디터에 (애니메이션과 함께) 반영하는 싱크.
 * 에디터 레이어가 구현해서 주입한다. 오케스트레이터는 vscode API를 몰라도 된다.
 */
export interface EditSink {
  applyPending(tx: EditTransaction): Promise<void>;
}

/**
 * 대화 루프의 심장.
 * 프로바이더 스트림을 소비 → 편집을 트랜잭션으로 변환 → 상위 이벤트 방출.
 */
export class Orchestrator {
  private readonly listeners = new Set<OrchestratorListener>();
  private assistantBuffer = "";
  private abort?: AbortController;

  constructor(
    private readonly txManager: TransactionManager,
    private readonly editSink: EditSink,
  ) {}

  on(listener: OrchestratorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: OrchestratorEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
  }

  /** 진행 중인 턴을 취소한다. */
  cancel(): void {
    this.abort?.abort();
  }

  /**
   * 한 번의 대화 턴을 실행한다.
   * @returns 어시스턴트의 최종 텍스트
   */
  async runTurn(
    provider: AIProvider,
    messages: Message[],
    context: ChatRequest["context"],
    model?: string,
  ): Promise<string> {
    this.abort = new AbortController();
    this.assistantBuffer = "";
    const groupId = this.txManager.newGroupId();

    this.emit({ type: "turn_start" });
    this.emit({ type: "status", text: `${provider.label} 생각 중…` });

    try {
      const stream = provider.streamChat({
        messages,
        context,
        model: model || undefined,
        signal: this.abort.signal,
      });

      for await (const ev of stream) {
        switch (ev.type) {
          case "text": {
            this.assistantBuffer += ev.delta;
            this.emit({
              type: "assistant_text",
              delta: ev.delta,
              full: this.assistantBuffer,
            });
            break;
          }
          case "plan": {
            this.emit({ type: "plan", steps: ev.steps });
            break;
          }
          case "tool_call": {
            this.emit({ type: "status", text: `도구 실행: ${ev.name}` });
            this.emit({
              type: "tool",
              phase: "call",
              id: ev.id,
              name: ev.name,
              data: ev.args,
            });
            break;
          }
          case "tool_result": {
            this.emit({ type: "tool", phase: "result", id: ev.id, data: ev.result });
            break;
          }
          case "edit": {
            const tx = this.txManager.create(ev.patch, groupId);
            this.emit({ type: "transaction", tx });
            this.emit({
              type: "status",
              text: `편집 적용 중: ${ev.patch.file}`,
            });
            // 애니메이션과 함께 pending 반영. 완료까지 await 해서 순서를 지킨다.
            await this.editSink.applyPending(tx);
            break;
          }
          case "usage": {
            this.emit({
              type: "usage",
              inputTokens: ev.inputTokens,
              outputTokens: ev.outputTokens,
            });
            break;
          }
          case "error": {
            this.emit({ type: "error", message: ev.message });
            break;
          }
          case "done": {
            break;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: "error", message });
    } finally {
      this.emit({ type: "turn_end" });
      this.emit({ type: "status", text: "대기 중" });
    }

    return this.assistantBuffer;
  }
}
