import monaco from "./monacoSetup";
import { request, isLspLanguage, executeCommand } from "./lspClient";
import * as conv from "./lspConverters";

/** LSP 프로바이더를 Monaco에 등록 (앱 진입 시 1회). 세션 없으면 각 프로바이더가 no-op.
 *  monaco 언어 id 기준(shell=bash, cpp/c=clangd). 서버 부재 언어는 provider가 no-op. */
const LSP_LANGS = ["python", "rust", "go", "c", "cpp", "shell", "lua", "java"];
const EXEC_CMD_ID = "schutz.lsp.execCommand";
let registered = false;

function docId(model: monaco.editor.ITextModel) {
  return { textDocument: { uri: model.uri.toString() }, };
}

export function registerLspProviders() {
  if (registered) return;
  registered = true;

  // 코드액션의 LSP 커맨드를 실행하는 monaco 커맨드(전역 1회). args = [lang, command, cmdArgs]
  try {
    (monaco.editor as any).addCommand({
      id: EXEC_CMD_ID,
      handler: (_accessor: any, lang: string, command: string, args: any[]) => { void executeCommand(lang, command, args); },
    });
  } catch { /* 이미 등록됨 무시 */ }

  for (const lang of LSP_LANGS) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [".", "(", "[", '"', "'", "/"],
      async provideCompletionItems(model, position) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/completion", { ...docId(model), position: conv.fromPosition(position) });
        if (!res) return undefined;
        const items = Array.isArray(res) ? res : (res.items ?? []);
        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = { startLineNumber: position.lineNumber, startColumn: word.startColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn };
        return { suggestions: items.map((it: any) => conv.toCompletion(it, range)) };
      },
      async resolveCompletionItem(item: any) {
        const orig = (item as any)._lsp;
        if (!orig || !isLspLanguage(lang)) return item;
        // 이 프로바이더가 등록된 언어(lang)의 서버로 보낸다 — 다국어 워크스페이스에서 엉뚱한 서버 라우팅 방지
        const res = await request(lang, "completionItem/resolve", orig);
        if (res) {
          if (res.detail) item.detail = res.detail;
          const md = conv.toMarkup(res.documentation);
          if (md) item.documentation = md;
          // 서버가 resolve 로 지연 제공하는 자동 import 등 부가 편집 반영
          if (Array.isArray(res.additionalTextEdits)) (item as any).additionalTextEdits = res.additionalTextEdits.map((e: any) => ({ range: conv.toRange(e.range), text: e.newText ?? "" }));
        }
        return item;
      },
    });

    monaco.languages.registerHoverProvider(lang, {
      async provideHover(model, position) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/hover", { ...docId(model), position: conv.fromPosition(position) });
        return conv.toHover(res) ?? undefined;
      },
    });

    monaco.languages.registerDefinitionProvider(lang, {
      async provideDefinition(model, position) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/definition", { ...docId(model), position: conv.fromPosition(position) });
        return conv.toLocations(res);
      },
    });

    monaco.languages.registerReferenceProvider(lang, {
      async provideReferences(model, position, context) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/references", { ...docId(model), position: conv.fromPosition(position), context: { includeDeclaration: context.includeDeclaration } });
        return conv.toLocations(res);
      },
    });

    monaco.languages.registerRenameProvider(lang, {
      async provideRenameEdits(model, position, newName) {
        if (!isLspLanguage(lang)) return { edits: [] };
        const res = await request(lang, "textDocument/rename", { ...docId(model), position: conv.fromPosition(position), newName });
        return res ? conv.toWorkspaceEdit(res) : { edits: [] };
      },
      async resolveRenameLocation(model, position) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/prepareRename", { ...docId(model), position: conv.fromPosition(position) });
        if (!res) return undefined;
        const range = res.range ? conv.toRange(res.range) : (res.start ? conv.toRange(res) : null);
        if (!range) return undefined;
        const text = model.getValueInRange(range);
        return { range, text };
      },
    });

    monaco.languages.registerSignatureHelpProvider(lang, {
      signatureHelpTriggerCharacters: ["(", ","],
      async provideSignatureHelp(model, position) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/signatureHelp", { ...docId(model), position: conv.fromPosition(position) });
        return conv.toSignatureHelp(res) ?? undefined;
      },
    });

    // 문서 심볼(아웃라인·브레드크럼·Ctrl+Shift+O)
    monaco.languages.registerDocumentSymbolProvider(lang, {
      async provideDocumentSymbols(model) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/documentSymbol", { ...docId(model) });
        return conv.toDocumentSymbols(res);
      },
    });

    // 폴딩
    monaco.languages.registerFoldingRangeProvider(lang, {
      async provideFoldingRanges(model) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/foldingRange", { ...docId(model) });
        return conv.toFoldingRanges(res);
      },
    });

    // 커서 심볼 하이라이트
    monaco.languages.registerDocumentHighlightProvider(lang, {
      async provideDocumentHighlights(model, position) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/documentHighlight", { ...docId(model), position: conv.fromPosition(position) });
        return conv.toDocumentHighlights(res);
      },
    });

    // 인레이 힌트(타입/파라미터)
    monaco.languages.registerInlayHintsProvider(lang, {
      async provideInlayHints(model, range) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/inlayHint", { ...docId(model), range: { start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } } });
        const hints = conv.toInlayHints(res);
        return { hints, dispose() { } };
      },
    });

    // 포맷(서버 지원 언어만 실동작 — pyright는 미지원, no-op)
    monaco.languages.registerDocumentFormattingEditProvider(lang, {
      async provideDocumentFormattingEdits(model, options) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/formatting", { ...docId(model), options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } });
        return conv.toTextEdits(res);
      },
    });
    monaco.languages.registerDocumentRangeFormattingEditProvider(lang, {
      async provideDocumentRangeFormattingEdits(model, range, options) {
        if (!isLspLanguage(lang)) return undefined;
        const res = await request(lang, "textDocument/rangeFormatting", { ...docId(model), range: { start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } }, options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } });
        return conv.toTextEdits(res);
      },
    });

    // 코드액션(퀵픽스·자동 임포트·organize imports)
    monaco.languages.registerCodeActionProvider(lang, {
      async provideCodeActions(model, range, context) {
        if (!isLspLanguage(lang)) return undefined;
        const diagnostics = (context.markers ?? []).map((m) => ({
          range: { start: { line: m.startLineNumber - 1, character: m.startColumn - 1 }, end: { line: m.endLineNumber - 1, character: m.endColumn - 1 } },
          message: m.message, severity: m.severity === 8 ? 1 : m.severity === 4 ? 2 : m.severity === 2 ? 3 : 4,
          code: m.code, source: m.source,
        }));
        const res = await request(lang, "textDocument/codeAction", {
          ...docId(model),
          range: { start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } },
          context: { diagnostics, triggerKind: context.trigger === 1 ? 1 : 2 },
        });
        if (!Array.isArray(res)) return { actions: [], dispose() { } };
        const actions = res.map((a: any) => conv.toCodeAction(a, lang, EXEC_CMD_ID));
        return { actions, dispose() { } };
      },
    });
  }
}
