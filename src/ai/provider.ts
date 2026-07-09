import { ChatRequest, ModelInfo, Message, StreamEvent } from "./types";

/**
 * 모든 AI 백엔드가 구현해야 하는 계약.
 * 이 인터페이스만 만족하면 Schutz에 어떤 모델이든 붙는다.
 */
export interface AIProvider {
  readonly id: string;
  readonly label: string;
  readonly models: ModelInfo[];

  /** 스트리밍 채팅. 실시간 UX의 전제이므로 필수. */
  streamChat(req: ChatRequest): AsyncIterable<StreamEvent>;

  /** 토큰 카운트 (선택). 비용 미터에 사용. */
  countTokens?(messages: Message[]): Promise<number>;

  /** API 키 등 준비 상태 확인 (선택). false면 설정 안내를 띄운다. */
  isConfigured?(): boolean;
}

/**
 * 프로바이더 레지스트리.
 * 확장 활성화 시 사용 가능한 어댑터를 등록하고, 설정값으로 하나를 고른다.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  /** 요청 id가 없거나 미등록이면 첫 번째(등록 순) 프로바이더로 폴백. */
  resolve(id: string | undefined): AIProvider | undefined {
    if (id && this.providers.has(id)) {
      return this.providers.get(id);
    }
    return this.list()[0];
  }
}
