import monaco from "./monacoSetup";
import { paneRegistry } from "./MonacoPane";

/**
 * AI 편집을 공유 모델에 "타이핑하듯" 적용한다.
 *
 * 이전에는 제안을 수락하면 setValue 로 파일 전체를 한 프레임에 갈아끼우고
 * paneVer 를 올려 MonacoPane 을 리마운트했다 — 코드가 툭 나타난 뒤 에디터가
 * 깜빡이고 스크롤·커서가 초기화됐다. 여기서는 마운트된 에디터의 모델에
 * 범위 편집을 누적해 적용하므로 그런 일이 없다.
 *
 * 타이핑 단계는 undo 스택에 하나로 묶인다(시작에서 pushStackElement 한 번).
 * 사용자가 Ctrl+Z 하면 AI 편집 전체가 한 번에 되돌아간다.
 */

/** 사용자가 모션 최소화를 켰으면 애니메이션 없이 즉시 적용한다.
 *  CSS 의 prefers-reduced-motion 오버라이드는 JS 타이머로 도는 이 코드를 막지 못한다.
 *  scrollTo/scrollIntoView 의 behavior:"smooth" 도 마찬가지다 — global.css 의
 *  `scroll-behavior: auto !important` 는 CSS 속성만 덮고 ScrollOptions 는 못 막는다.
 *  그래서 부드러운 스크롤을 쓰는 쪽도 이 술어를 직접 물어봐야 한다. */
export function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

const CHARS_PER_TICK = 3;
const TICK_MS = 16;
/** 한 번의 편집에 쓸 최대 시간 — 큰 파일 생성이 몇 분씩 타이핑되지 않게 */
const MAX_TOTAL_MS = 2200;

export interface TypeEditOpts {
  /** 편집 위치를 화면에 보이게 스크롤할지 */
  reveal?: boolean;
  /** 이 편집이 끝날 때까지 기다릴지(false 면 애니메이션을 걸어두고 즉시 반환) */
  await?: boolean;
  /** 타이핑을 이 배수만큼 늦춘다(1 = 평소). 첫 실행 데모 전용이다.
   *
   *  평소 속도는 실제 작업에 맞춰져 있다 — 편집이 수십 개 이어지니 빨라야 한다. 하지만
   *  보여주는 자리에서는 같은 속도가 "코드가 바뀌었다" 가 아니라 "깜빡였다" 로 읽힌다.
   *  여기 배수를 두는 이유는 그 두 요구가 진짜로 다르기 때문이다 — 상수를 낮추면
   *  실제 편집까지 같이 느려진다. */
  slow?: number;
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** offset(0-based) → Monaco Position */
function posAt(model: monaco.editor.ITextModel, offset: number): monaco.Position {
  return model.getPositionAt(Math.max(0, Math.min(offset, model.getValueLength())));
}

/**
 * model 의 [startOffset, endOffset) 를 replacement 로 바꾼다.
 * 지우기는 한 번에, 넣기는 청크 단위로.
 */
export async function typeEdit(
  model: monaco.editor.ITextModel,
  startOffset: number,
  endOffset: number,
  replacement: string,
  opts: TypeEditOpts = {},
): Promise<void> {
  if (model.isDisposed()) return;
  const editor = paneRegistry.panes.get(relOfModel(model) ?? "")?.editor ?? null;

  const applyWhole = () => {
    const r = monaco.Range.fromPositions(posAt(model, startOffset), posAt(model, endOffset));
    model.pushStackElement();
    model.pushEditOperations([], [{ range: r, text: replacement }], () => null);
    model.pushStackElement();
  };

  if (reducedMotion() || !replacement) { applyWhole(); return; }

  // 늦출 때는 상한도 함께 늘린다. 안 그러면 청크만 커져서 결국 같은 시간에 끝난다 —
  // 배수를 줬는데 아무 차이가 없는 게 이 함수에서 제일 헷갈리는 실패다.
  const slow = Math.max(1, opts.slow ?? 1);
  const tickMs = TICK_MS * slow;
  const maxTotal = MAX_TOTAL_MS * slow;
  // 청크 크기 — 길면 한 틱에 더 많이 넣어 총 시간을 상한 안에 둔다
  const ticks = Math.ceil(replacement.length / CHARS_PER_TICK);
  const step = ticks * tickMs > maxTotal
    ? Math.ceil(replacement.length / (maxTotal / tickMs))
    : CHARS_PER_TICK;

  model.pushStackElement(); // 여기부터 끝까지가 undo 하나

  // 1) 대상 범위를 먼저 비운다
  const delRange = monaco.Range.fromPositions(posAt(model, startOffset), posAt(model, endOffset));
  model.pushEditOperations([], [{ range: delRange, text: "" }], () => null);

  // 2) 커서 자리부터 조금씩 밀어 넣는다
  let written = 0;
  let decoIds: string[] = [];
  try {
    while (written < replacement.length) {
      if (model.isDisposed()) return;
      const chunk = replacement.slice(written, written + step);
      const at = posAt(model, startOffset + written);
      model.pushEditOperations([], [{ range: monaco.Range.fromPositions(at, at), text: chunk }], () => null);
      written += chunk.length;

      const head = posAt(model, startOffset + written);
      if (editor && !editor.getModel()?.isDisposed()) {
        // 쓰고 있는 줄을 강조 — git 거터와 별개 채널
        decoIds = editor.deltaDecorations(decoIds, [{
          range: new monaco.Range(head.lineNumber, 1, head.lineNumber, 1),
          options: { isWholeLine: true, className: "sz-ai-typing", overviewRuler: undefined },
        }]);
        if (opts.reveal !== false) editor.revealLineInCenterIfOutsideViewport(head.lineNumber, 0 /* Smooth */);
      }
      await delay(tickMs);
    }
  } finally {
    model.pushStackElement();
    if (editor && decoIds.length) {
      // 마지막엔 바뀐 범위 전체를 잠깐 빛냈다가 지운다
      const s = posAt(model, startOffset), e = posAt(model, startOffset + replacement.length);
      const flash = editor.deltaDecorations(decoIds, [{
        range: new monaco.Range(s.lineNumber, 1, e.lineNumber, 1),
        options: { isWholeLine: true, className: "sz-ai-changed" },
      }]);
      setTimeout(() => { try { editor.deltaDecorations(flash, []); } catch { /* 언마운트됨 */ } }, 1400);
    }
  }
}

/** paneRegistry 는 rel 로 키잉돼 있어 모델→rel 역조회가 필요하다 */
function relOfModel(model: monaco.editor.ITextModel): string | null {
  for (const [rel, api] of paneRegistry.panes) {
    if (api.editor.getModel() === model) return rel;
  }
  return null;
}
