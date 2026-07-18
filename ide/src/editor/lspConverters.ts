import monaco from "./monacoSetup";

/** LSP(0-based) ↔ Monaco(1-based) 변환 모음 */

export function toRange(r: any): monaco.IRange {
  return {
    startLineNumber: (r?.start?.line ?? 0) + 1,
    startColumn: (r?.start?.character ?? 0) + 1,
    endLineNumber: (r?.end?.line ?? 0) + 1,
    endColumn: (r?.end?.character ?? 0) + 1,
  };
}
export function fromPosition(pos: monaco.Position): { line: number; character: number } {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

const SEV: Record<number, monaco.MarkerSeverity> = { 1: 8, 2: 4, 3: 2, 4: 1 };
export function toMarker(d: any): monaco.editor.IMarkerData {
  const r = toRange(d.range);
  return {
    severity: SEV[d.severity] ?? 8,
    message: d.message ?? "",
    startLineNumber: r.startLineNumber, startColumn: r.startColumn,
    endLineNumber: r.endLineNumber, endColumn: r.endColumn,
    code: d.code != null ? String(d.code) : undefined,
    source: d.source,
  };
}

/** LSP CompletionItemKind → Monaco CompletionItemKind */
const CK = monaco.languages.CompletionItemKind;
const KIND: Record<number, number> = {
  1: CK.Text, 2: CK.Method, 3: CK.Function, 4: CK.Constructor, 5: CK.Field, 6: CK.Variable,
  7: CK.Class, 8: CK.Interface, 9: CK.Module, 10: CK.Property, 11: CK.Unit, 12: CK.Value,
  13: CK.Enum, 14: CK.Keyword, 15: CK.Snippet, 16: CK.Color, 17: CK.File, 18: CK.Reference,
  19: CK.Folder, 20: CK.EnumMember, 21: CK.Constant, 22: CK.Struct, 23: CK.Event,
  24: CK.Operator, 25: CK.TypeParameter,
};

export function toCompletion(item: any, defaultRange: monaco.IRange): monaco.languages.CompletionItem {
  const insert = item.textEdit?.newText ?? item.insertText ?? item.label;
  const range = item.textEdit?.range ? toRange(item.textEdit.range) : (item.textEdit?.replace ? toRange(item.textEdit.replace) : defaultRange);
  const isSnippet = item.insertTextFormat === 2;
  return {
    label: item.label,
    kind: KIND[item.kind] ?? CK.Text,
    detail: item.detail,
    documentation: toMarkup(item.documentation),
    insertText: insert,
    insertTextRules: isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range,
    sortText: item.sortText,
    filterText: item.filterText,
    // 부가 편집(자동 import 등) — 없으면 pyright 의 `from x import y` 가 유실되어 미정의 이름 발생
    additionalTextEdits: Array.isArray(item.additionalTextEdits) ? item.additionalTextEdits.map((e: any) => ({ range: toRange(e.range), text: e.newText ?? "" })) : undefined,
    command: undefined,
    // 원본 보존 → resolve 시 사용
    _lsp: item,
  } as any;
}

export function toMarkup(doc: any): monaco.IMarkdownString | string | undefined {
  if (!doc) return undefined;
  if (typeof doc === "string") return { value: doc };
  if (doc.kind === "markdown") return { value: doc.value };
  if (doc.value != null) return { value: doc.value };
  return undefined;
}

export function toHover(h: any): monaco.languages.Hover | null {
  if (!h || !h.contents) return null;
  const c = h.contents;
  let value = "";
  if (Array.isArray(c)) value = c.map((x: any) => (typeof x === "string" ? x : x.value ?? "")).join("\n\n");
  else if (typeof c === "string") value = c;
  else value = c.value ?? "";
  if (!value) return null;
  return { contents: [{ value }], range: h.range ? toRange(h.range) : undefined };
}

/** LSP Location | Location[] | LocationLink[] → Monaco definitions */
export function toLocations(res: any): monaco.languages.Location[] {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : [res];
  return arr.map((l: any) => {
    const uri = l.uri ?? l.targetUri;
    const range = l.range ?? l.targetSelectionRange ?? l.targetRange;
    return { uri: monaco.Uri.parse(uri), range: toRange(range) };
  }).filter((l: any) => l.uri);
}

/** LSP WorkspaceEdit → Monaco rename edits */
export function toWorkspaceEdit(we: any): monaco.languages.WorkspaceEdit {
  const edits: monaco.languages.IWorkspaceTextEdit[] = [];
  const pushChanges = (uri: string, changes: any[]) => {
    for (const c of changes) edits.push({ resource: monaco.Uri.parse(uri), versionId: undefined, textEdit: { range: toRange(c.range), text: c.newText } });
  };
  if (we?.changes) for (const uri of Object.keys(we.changes)) pushChanges(uri, we.changes[uri]);
  if (we?.documentChanges) for (const dc of we.documentChanges) { if (dc.textDocument && dc.edits) pushChanges(dc.textDocument.uri, dc.edits); }
  return { edits };
}

/** LSP TextEdit[] → Monaco TextEdit[] (포맷/문서편집) */
export function toTextEdits(edits: any): monaco.languages.TextEdit[] {
  if (!Array.isArray(edits)) return [];
  return edits.map((e: any) => ({ range: toRange(e.range), text: e.newText ?? "" }));
}

/** LSP SymbolKind(1-26) → Monaco SymbolKind(0-25). 전 항목 = LSP - 1 이지만 안전하게 매핑 */
const SYMK = monaco.languages.SymbolKind;
const SYMBOL_KIND: Record<number, number> = {
  1: SYMK.File, 2: SYMK.Module, 3: SYMK.Namespace, 4: SYMK.Package, 5: SYMK.Class,
  6: SYMK.Method, 7: SYMK.Property, 8: SYMK.Field, 9: SYMK.Constructor, 10: SYMK.Enum,
  11: SYMK.Interface, 12: SYMK.Function, 13: SYMK.Variable, 14: SYMK.Constant, 15: SYMK.String,
  16: SYMK.Number, 17: SYMK.Boolean, 18: SYMK.Array, 19: SYMK.Object, 20: SYMK.Key,
  21: SYMK.Null, 22: SYMK.EnumMember, 23: SYMK.Struct, 24: SYMK.Event, 25: SYMK.Operator,
  26: SYMK.TypeParameter,
};

/** LSP DocumentSymbol[] (계층) 또는 SymbolInformation[] (평면) → Monaco DocumentSymbol[] */
export function toDocumentSymbols(res: any): monaco.languages.DocumentSymbol[] {
  if (!Array.isArray(res) || res.length === 0) return [];
  const isHierarchical = res[0] && "selectionRange" in res[0];
  if (isHierarchical) {
    const conv = (s: any): monaco.languages.DocumentSymbol => ({
      name: s.name || "?",
      detail: s.detail || "",
      kind: SYMBOL_KIND[s.kind] ?? SYMK.Variable,
      tags: s.deprecated ? [monaco.languages.SymbolTag.Deprecated] : [],
      range: toRange(s.range),
      selectionRange: toRange(s.selectionRange || s.range),
      children: Array.isArray(s.children) ? s.children.map(conv) : [],
    });
    return res.map(conv);
  }
  // SymbolInformation (평면) — containerName은 무시, 단순 목록
  return res.map((s: any): monaco.languages.DocumentSymbol => {
    const r = toRange(s.location?.range);
    return { name: s.name || "?", detail: s.containerName || "", kind: SYMBOL_KIND[s.kind] ?? SYMK.Variable, tags: [], range: r, selectionRange: r, children: [] };
  });
}

/** LSP FoldingRange[] → Monaco FoldingRange[] */
export function toFoldingRanges(res: any): monaco.languages.FoldingRange[] {
  if (!Array.isArray(res)) return [];
  const KIND: Record<string, monaco.languages.FoldingRangeKind> = {
    comment: monaco.languages.FoldingRangeKind.Comment,
    imports: monaco.languages.FoldingRangeKind.Imports,
    region: monaco.languages.FoldingRangeKind.Region,
  };
  return res.map((f: any) => ({ start: (f.startLine ?? 0) + 1, end: (f.endLine ?? 0) + 1, kind: f.kind ? KIND[f.kind] : undefined }));
}

/** LSP DocumentHighlight[] → Monaco DocumentHighlight[] (kind: 1/2/3 → 0/1/2) */
export function toDocumentHighlights(res: any): monaco.languages.DocumentHighlight[] {
  if (!Array.isArray(res)) return [];
  return res.map((h: any) => ({ range: toRange(h.range), kind: h.kind != null ? (h.kind - 1) as monaco.languages.DocumentHighlightKind : undefined }));
}

/** LSP InlayHint[] → Monaco InlayHint[] */
export function toInlayHints(res: any): monaco.languages.InlayHint[] {
  if (!Array.isArray(res)) return [];
  return res.map((h: any) => ({
    label: typeof h.label === "string" ? h.label : (h.label ?? []).map((p: any) => (typeof p === "string" ? p : p.value ?? "")).join(""),
    tooltip: toMarkup(h.tooltip),
    position: { lineNumber: (h.position?.line ?? 0) + 1, column: (h.position?.character ?? 0) + 1 },
    kind: h.kind === 2 ? monaco.languages.InlayHintKind.Parameter : monaco.languages.InlayHintKind.Type,
    paddingLeft: !!h.paddingLeft,
    paddingRight: !!h.paddingRight,
  }));
}

/** LSP CodeAction | Command → Monaco CodeAction. execCommand는 LSP 커맨드를 실행하는 monaco 커맨드 id */
export function toCodeAction(a: any, languageId: string, execCommandId: string): monaco.languages.CodeAction {
  // a가 Command(순수 command)인지 CodeAction인지 판별
  const isCommand = a.command && typeof a.command === "string";
  const title = a.title || (isCommand ? a.command : "");
  const lspCommand = isCommand ? a : a.command; // CodeAction.command은 객체
  const monacoCmd = lspCommand
    ? { id: execCommandId, title: lspCommand.title || title, arguments: [languageId, lspCommand.command, lspCommand.arguments ?? []] }
    : undefined;
  return {
    title,
    kind: a.kind,
    isPreferred: a.isPreferred,
    diagnostics: Array.isArray(a.diagnostics) ? a.diagnostics.map(toMarker) : undefined,
    edit: a.edit ? toWorkspaceEdit(a.edit) : undefined,
    command: monacoCmd,
    disabled: a.disabled?.reason,
  } as monaco.languages.CodeAction;
}

/** LSP WorkspaceSymbol[]/SymbolInformation[] → 평면 목록 {name, kind, uri, range} (Ctrl+T용) */
export function toWorkspaceSymbols(res: any): { name: string; container: string; kind: number; uri: string; range: monaco.IRange }[] {
  if (!Array.isArray(res)) return [];
  return res.map((s: any) => ({
    name: s.name || "?",
    container: s.containerName || "",
    kind: SYMBOL_KIND[s.kind] ?? SYMK.Variable,
    uri: s.location?.uri ?? "",
    range: toRange(s.location?.range),
  })).filter((s: any) => s.uri);
}

export function toSignatureHelp(sh: any): monaco.languages.SignatureHelpResult | null {
  if (!sh || !sh.signatures) return null;
  return {
    value: {
      signatures: sh.signatures.map((s: any) => ({
        label: s.label,
        documentation: toMarkup(s.documentation),
        parameters: (s.parameters ?? []).map((p: any) => ({ label: p.label, documentation: toMarkup(p.documentation) })),
      })),
      activeSignature: sh.activeSignature ?? 0,
      activeParameter: sh.activeParameter ?? 0,
    },
    dispose: () => { },
  };
}
