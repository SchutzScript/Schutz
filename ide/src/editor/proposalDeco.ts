// 아직 수락하지 않은 제안을 **코드 옆에** 보여 준다.
//
// 지금까지 제안은 오른쪽 카드에만 있었다. 무엇이 왜 바뀌는지 보려면 코드에서 눈을
// 떼야 했고, 바꿀지 말지도 거기서만 눌렀다. 설계(DESIGN.md 2.2)가 적어 둔 자리는
// 바뀌는 그 줄이다 — 사유는 툴팁으로, 수락·거절은 CodeLens 로.
//
// 자리를 찾는 일은 review/proposalMarks.ts 가 한다. 여기는 화면에 얹기만 한다.

import monaco from "./monacoSetup";
import * as projectModels from "./projectModels";
import { locate, markTooltip } from "../review/proposalMarks";
import { t } from "../i18n";

export interface PendingProposal {
  id: string;
  rel: string;
  find: string;
  rationale: string;
  agent: string;
  range?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
}

export interface ProposalHandlers {
  accept: (id: string) => void;
  reject: (id: string) => void;
}

let pending: PendingProposal[] = [];
let handlers: ProposalHandlers | null = null;
let registered = false;
// Monaco 의 CodeLensProvider.onDidChange 는 프로바이더 자신을 실어 보낸다.
const changed = new monaco.Emitter<monaco.languages.CodeLensProvider>();
/** 모델 uri → 지금 그려 둔 툴팁 데코레이션 */
const marks = new Map<string, string[]>();

/** 이 모델에 걸린 제안들과 그 자리. 못 찾은 것은 뺀다 — 틀린 자리에 그리느니 안 그린다. */
function marksFor(model: monaco.editor.ITextModel): { p: PendingProposal; at: ReturnType<typeof locate> }[] {
  const rel = projectModels.relFor(model.uri.toString());
  if (!rel) return [];
  const text = model.getValue();
  const out: { p: PendingProposal; at: ReturnType<typeof locate> }[] = [];
  for (const p of pending) {
    if (p.rel !== rel) continue;
    const at = locate({ text, find: p.find, range: p.range ?? null });
    if (at) out.push({ p, at });
  }
  return out;
}

/** 한 번만 등록한다. 앱이 살아 있는 동안 목록만 갈아 끼운다. */
export function ensureRegistered(h: ProposalHandlers): void {
  handlers = h;
  if (registered) return;
  registered = true;

  // CodeLens 의 command 는 id 로 부른다 — 렌즈마다 클로저를 넘길 수 없다.
  monaco.editor.registerCommand("schutz.acceptProposal", (_a, id: string) => { handlers?.accept(String(id)); });
  monaco.editor.registerCommand("schutz.rejectProposal", (_a, id: string) => { handlers?.reject(String(id)); });

  const provider: monaco.languages.CodeLensProvider = {
    onDidChange: changed.event,
    provideCodeLenses: (model) => {
      const lenses: monaco.languages.CodeLens[] = marksFor(model).flatMap(({ p, at }) => ([
        {
          range: { startLineNumber: at!.startLineNumber, startColumn: 1, endLineNumber: at!.startLineNumber, endColumn: 1 },
          id: "acc-" + p.id,
          command: { id: "schutz.acceptProposal", title: "✓ " + t("misc.accept"), arguments: [p.id] },
        },
        {
          range: { startLineNumber: at!.startLineNumber, startColumn: 1, endLineNumber: at!.startLineNumber, endColumn: 1 },
          id: "rej-" + p.id,
          command: { id: "schutz.rejectProposal", title: "✕ " + t("misc.reject"), arguments: [p.id] },
        },
      ]));
      return { lenses, dispose: () => { /* 목록만 넘긴다 */ } };
    },
  };
  fireChange = () => changed.fire(provider);
  monaco.languages.registerCodeLensProvider({ scheme: "file" }, provider);
}

/** 등록 전에 refresh 가 오면 쏠 곳이 없다 — 등록될 때 채워진다. */
let fireChange: () => void = () => { /* 아직 등록 전 */ };

/** 제안 목록이 바뀔 때마다 부른다 — 렌즈를 새로 요청하게 하고 툴팁을 다시 그린다. */
export function refresh(list: PendingProposal[]): void {
  pending = list;
  fireChange();
  for (const model of monaco.editor.getModels()) {
    if (model.isDisposed()) continue;
    const key = model.uri.toString();
    const decos = marksFor(model).flatMap(({ p, at }) => {
      const hover = markTooltip(p.rationale, p.agent);
      if (!hover) return [];
      return [{
        range: new monaco.Range(at!.startLineNumber, at!.startColumn, at!.endLineNumber, at!.endColumn),
        options: {
          className: "sz-prop-pending",
          hoverMessage: { value: hover },
          // 개요 눈금에도 표시 — 긴 파일에서 제안이 어디 있는지 스크롤 없이 보인다.
          overviewRuler: { color: "rgba(196,168,130,.7)", position: monaco.editor.OverviewRulerLane.Right },
        },
      }];
    });
    const prev = marks.get(key) ?? [];
    if (!prev.length && !decos.length) continue;
    marks.set(key, model.deltaDecorations(prev, decos));
  }
}

/** 워크스페이스를 닫을 때 등 — 그려 둔 것을 걷는다. */
export function clearAll(): void {
  pending = [];
  for (const model of monaco.editor.getModels()) {
    const key = model.uri.toString();
    const prev = marks.get(key);
    if (prev?.length && !model.isDisposed()) { try { model.deltaDecorations(prev, []); } catch { /* */ } }
  }
  marks.clear();
  fireChange();
}
