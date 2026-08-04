/**
 * 언어 확장이 **내놓는 것**을 Monaco 가 아는 모양으로 옮긴다.
 *
 * 셰임의 languages 네임스페이스는 자동완성과 호버만 진짜였고, 바로 아래 넉 줄이
 * 이랬다:
 *
 *   registerDefinitionProvider() { return noopDisposable; },
 *   registerCodeActionsProvider() { return noopDisposable; },
 *   registerDocumentFormattingEditProvider() { return noopDisposable; },
 *   createDiagnosticCollection(name) { return { set() {}, delete() {}, clear() {}, ... }; },
 *
 * 등록은 성공하고(disposable 을 돌려주니 확장은 잘된 줄 안다) 결과만 사라진다.
 * 그중 진단이 제일 크다 — 린터 확장은 파일을 읽고 문제를 다 찾아낸 뒤 `set()` 에
 * 넘기고, 그 값이 그대로 버려진다. 화면에는 밑줄 하나 없고 문제 패널도 비어 있다.
 *
 * 순수 모듈이다. monaco 의 **상수 값**만 쓰고 monaco 자체는 부르지 않는다.
 */

/** Monaco MarkerSeverity — Hint 1 · Info 2 · Warning 4 · Error 8. */
export const M_HINT = 1, M_INFO = 2, M_WARN = 4, M_ERROR = 8;

/**
 * vscode DiagnosticSeverity → Monaco MarkerSeverity.
 *
 * vscode 는 **Error 가 0** 이다(Error 0 · Warning 1 · Information 2 · Hint 3).
 * LSP 쪽(lspConverters.ts)은 Error 가 1 인 다른 체계라 그 표를 그대로 쓰면 한 칸씩
 * 밀린다 — 오류가 경고로, 경고가 정보로 내려앉는다.
 */
export function markerSeverity(sev: unknown): number {
  switch (sev) {
    case 0: return M_ERROR;
    case 1: return M_WARN;
    case 2: return M_INFO;
    case 3: return M_HINT;
    // 안 준 경우는 오류로 본다. 진단을 내놓았다는 것 자체가 "봐 달라" 는 뜻이고,
    // 힌트로 낮추면 문제 패널에서 조용히 사라진다.
    default: return M_ERROR;
  }
}

export interface MonacoRange {
  startLineNumber: number; startColumn: number;
  endLineNumber: number; endColumn: number;
}

const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** vscode Range(0-기반) → Monaco Range(1-기반). 배열 꼴 `[start, end]` 도 받는다. */
export function toMonacoRange(r: any): MonacoRange {
  const s = Array.isArray(r) ? r[0] : r?.start;
  const e = Array.isArray(r) ? r[1] : r?.end;
  const sl = n(s?.line) + 1, sc = n(s?.character) + 1;
  // 끝을 안 주면 시작과 같은 자리로 둔다(길이 0). 확장이 한 점만 가리키는 흔한 꼴이다.
  const el = e ? n(e.line) + 1 : sl, ec = e ? n(e.character) + 1 : sc;
  // 거꾸로 들어온 범위는 뒤집어 준다 — Monaco 는 그대로 받으면 아무것도 안 그린다.
  if (el < sl || (el === sl && ec < sc)) return { startLineNumber: el, startColumn: ec, endLineNumber: sl, endColumn: sc };
  return { startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec };
}

export interface MarkerData extends MonacoRange {
  severity: number; message: string; code?: string; source?: string;
}

/** vscode Diagnostic → Monaco IMarkerData. */
export function toMarker(d: any): MarkerData {
  const code = d?.code;
  return {
    ...toMonacoRange(d?.range),
    severity: markerSeverity(d?.severity),
    message: String(d?.message ?? ""),
    // code 는 `{ value, target }` 객체일 수도 있다.
    ...(code != null ? { code: String(typeof code === "object" ? (code.value ?? "") : code) } : {}),
    ...(d?.source ? { source: String(d.source) } : {}),
  };
}

export function toMarkers(list: any): MarkerData[] {
  return Array.isArray(list) ? list.filter(Boolean).map(toMarker) : [];
}

export interface NormLocation { uri: any; range: MonacoRange }

/**
 * 정의 이동 결과를 한 모양으로 편다.
 *
 * 확장은 넷 중 아무 꼴로나 돌려준다: `Location`, `Location[]`, `LocationLink`,
 * `LocationLink[]`. LocationLink 는 `uri`/`range` 대신 `targetUri`/`targetRange` 를
 * 쓴다 — 그 이름을 안 보면 링크 꼴로 돌려주는 확장만 조용히 아무 데도 못 간다.
 */
export function toLocations(res: any): NormLocation[] {
  const arr = res == null ? [] : (Array.isArray(res) ? res : [res]);
  const out: NormLocation[] = [];
  for (const it of arr) {
    if (!it) continue;
    const uri = it.targetUri ?? it.uri;
    const range = it.targetSelectionRange ?? it.targetRange ?? it.range;
    if (!uri || !range) continue;
    out.push({ uri, range: toMonacoRange(range) });
  }
  return out;
}

export interface NormEdit { range: MonacoRange; text: string }

/** vscode TextEdit[] → Monaco 편집 목록. */
export function toEdits(edits: any): NormEdit[] {
  if (!Array.isArray(edits)) return [];
  const out: NormEdit[] = [];
  for (const e of edits) {
    if (!e?.range) continue;
    out.push({ range: toMonacoRange(e.range), text: String(e.newText ?? "") });
  }
  return out;
}
