import { AIProvider } from "../provider";
import { ChatRequest, ModelInfo, StreamEvent, Patch, PlanStep } from "../types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 백엔드 미정 단계용 가짜 프로바이더.
 *
 * 실제 모델 없이도 네 기둥 UX(편집 애니메이션 / diff / Agent 계획 패널 / 멀티파일 오버뷰)를
 * 전부 구동·데모할 수 있게, 그럴듯한 에이전트 루프를 스트리밍으로 흉내낸다.
 *
 * 실제 Claude/OpenAI 어댑터로 교체해도 Orchestrator·UI는 한 줄도 안 바뀐다.
 */
export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly label = "Mock (오프라인 데모)";
  readonly models: ModelInfo[] = [
    { id: "mock-1", label: "Schutz Mock 1", contextWindow: 200_000 },
  ];

  isConfigured(): boolean {
    return true;
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const signal = req.signal;
    const aborted = () => signal?.aborted ?? false;

    const demoFiles = req.context?.demoFiles;
    if (demoFiles && demoFiles.length > 0) {
      yield* this.streamMultiFile(demoFiles, aborted);
      return;
    }

    const activeFile = req.context?.activeFile ?? "example.ts";
    const text = req.context?.activeFileText ?? "";
    const lines = text.length ? text.split(/\r?\n/) : [];

    // 1) 계획 방출 (Agent 패널)
    const plan: PlanStep[] = [
      { id: "s1", title: "활성 파일 읽기", status: "active" },
      { id: "s2", title: "개선점 분석", status: "pending" },
      { id: "s3", title: "편집 적용", status: "pending" },
    ];
    yield { type: "plan", steps: structuredClone(plan) };
    await sleep(300);
    if (aborted()) return;

    // 2) 파일 읽기 툴 호출 (툴 타임라인)
    yield { type: "tool_call", id: "t1", name: "read_file", args: { path: activeFile } };
    await sleep(400);
    yield {
      type: "tool_result",
      id: "t1",
      result: { path: activeFile, lineCount: lines.length },
    };

    plan[0].status = "done";
    plan[1].status = "active";
    yield { type: "plan", steps: structuredClone(plan) };
    await sleep(250);
    if (aborted()) return;

    // 3) 설명 텍스트 스트리밍
    const explanation =
      `\`${activeFile}\` (${lines.length}줄)를 살펴봤어요. ` +
      `파일 상단 문서 배너를 추가하고, 첫 번째 함수/선언 위에 설명 주석을 붙이겠습니다. ` +
      `모든 변경은 pending 상태로 표시되니 수락/거절하실 수 있어요.\n`;
    for (const chunk of chunkText(explanation, 8)) {
      if (aborted()) return;
      yield { type: "text", delta: chunk };
      await sleep(45);
    }

    plan[1].status = "done";
    plan[2].status = "active";
    yield { type: "plan", steps: structuredClone(plan) };
    await sleep(200);

    // 4) 편집 패치 방출 (에디터 애니메이션 + diff 트리거)
    const patch = buildDemoPatch(activeFile, lines);
    yield { type: "edit", patch };
    await sleep(150);
    if (aborted()) return;

    plan[2].status = "done";
    yield { type: "plan", steps: structuredClone(plan) };

    // 5) 사용량 + 종료
    yield {
      type: "usage",
      inputTokens: Math.max(50, lines.length * 4),
      outputTokens: 180,
    };
    yield { type: "done" };
  }

  /** 여러 파일에 각각 안전한 배너 삽입을 제안하는 멀티파일 데모 (기둥4). */
  private async *streamMultiFile(
    files: string[],
    aborted: () => boolean,
  ): AsyncIterable<StreamEvent> {
    const plan: PlanStep[] = files.map((f, i) => ({
      id: `f${i}`,
      title: `${f} 문서화`,
      status: i === 0 ? "active" : "pending",
    }));
    yield { type: "plan", steps: structuredClone(plan) };
    await sleep(250);

    const intro = `${files.length}개 파일에 문서 배너를 추가하겠습니다. 멀티파일 오버뷰에서 한눈에 확인하고 일괄 수락/거절하세요.\n`;
    for (const chunk of chunkText(intro, 8)) {
      if (aborted()) return;
      yield { type: "text", delta: chunk };
      await sleep(40);
    }

    for (let i = 0; i < files.length; i++) {
      if (aborted()) return;
      const file = files[i];
      // 파일 최상단 배너 삽입은 내용과 무관하게 안전(순수 삽입).
      const patch: Patch = {
        file,
        rationale: "문서화: 파일 상단 배너 추가",
        edits: [{ startLine: 0, endLine: -1, newText: `// Reviewed by Schutz — ${file}\n` }],
      };
      yield { type: "edit", patch };
      plan[i].status = "done";
      if (i + 1 < plan.length) {
        plan[i + 1].status = "active";
      }
      yield { type: "plan", steps: structuredClone(plan) };
      await sleep(200);
    }

    yield { type: "usage", inputTokens: 120, outputTokens: files.length * 30 };
    yield { type: "done" };
  }
}

/** 활성 파일 내용으로 안전한(삽입 위주) 데모 패치를 만든다. */
function buildDemoPatch(file: string, lines: string[]): Patch {
  const banner =
    `// ─────────────────────────────────────────────\n` +
    `// Reviewed by Schutz — 자동 문서 배너\n` +
    `// ─────────────────────────────────────────────`;

  const edits = [
    // 파일 최상단에 배너 삽입 (빈 범위 = 순수 삽입)
    { startLine: 0, endLine: -1, newText: banner + "\n" },
  ];

  // 첫 번째 함수/클래스/선언 라인 위에 설명 주석 삽입
  const declIdx = lines.findIndex((l) =>
    /\b(function|class|def|interface)\b|=>\s*\{?\s*$|const\s+\w+\s*=/.test(l),
  );
  if (declIdx >= 0) {
    edits.push({
      startLine: declIdx,
      endLine: declIdx - 1,
      newText: `// [Schutz] 이 선언은 리뷰됨 — 아래 로직 확인 필요\n`,
    });
  }

  return {
    file,
    rationale: "문서화 개선: 파일 배너와 핵심 선언 주석을 추가해 가독성을 높임",
    edits,
  };
}

/** 문자열을 대략 size 글자씩 쪼갠다 (스트리밍 흉내). */
function chunkText(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) {
    out.push(s.slice(i, i + size));
  }
  return out;
}
