// VS Code TextMate 문법(.tmLanguage.json)을 Monaco에 연결 — VS Code급 신택스 하이라이팅.
// monaco-textmate(해석기) + onigasm(정규식 WASM) + monaco-editor-textmate(글루) — 서로 매칭된 조합.
import { Registry } from "monaco-textmate";
import { loadWASM } from "onigasm";
import { wireTmGrammars } from "monaco-editor-textmate";
import monaco from "../editor/monacoSetup";
import onigasmWasmUrl from "onigasm/lib/onigasm.wasm?url";

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = fetch(onigasmWasmUrl).then(r => r.arrayBuffer()).then(buf => loadWASM(buf))
    .catch(e => { console.error("TextMate onigasm 로드 실패:", e && e.message); wasmReady = null; throw e; }); // 실패 캐시 금지 — 다음 시도 재시도
  return wasmReady;
}

const grammarByScope = new Map<string, { extId: string; path: string }>();
let wired = false;

/** TextMate 토큰 스코프까지 색을 입히는 테마 (deepest scope → 접두 매칭) */
function defineTmTheme() {
  const rules: monaco.editor.ITokenThemeRule[] = [
    { token: "", foreground: "D8DFD8" },
    { token: "comment", foreground: "72806F", fontStyle: "italic" },
    { token: "string", foreground: "9DD3A6" },
    { token: "constant.numeric", foreground: "D8A9C8" }, { token: "constant.language", foreground: "D8A9C8" }, { token: "constant.character", foreground: "9DD3A6" }, { token: "constant.other", foreground: "D8A9C8" },
    { token: "keyword", foreground: "E4B67E" }, { token: "keyword.operator", foreground: "AEB9AF" },
    { token: "storage", foreground: "E4B67E" }, { token: "storage.type", foreground: "A6D6C8" },
    { token: "entity.name.function", foreground: "E9E2AC" }, { token: "support.function", foreground: "E9E2AC" },
    { token: "entity.name.type", foreground: "A6D6C8" }, { token: "entity.name.class", foreground: "A6D6C8" }, { token: "support.type", foreground: "A6D6C8" }, { token: "support.class", foreground: "A6D6C8" },
    { token: "entity.name.tag", foreground: "E4B67E" }, { token: "entity.other.attribute-name", foreground: "A6D6C8" },
    { token: "variable", foreground: "D8DFD8" }, { token: "variable.parameter", foreground: "D6C6A6" },
    { token: "punctuation", foreground: "AEB9AF" },
    { token: "number", foreground: "D8A9C8" }, { token: "type", foreground: "A6D6C8" }, { token: "function", foreground: "E9E2AC" }, { token: "delimiter", foreground: "AEB9AF" },
  ];
  monaco.editor.defineTheme("schutz-tm-dark", {
    base: "vs-dark", inherit: true, rules,
    colors: { "editor.background": "#0F1211", "editor.foreground": "#D8DFD8", "editorLineNumber.foreground": "#606A62", "editorLineNumber.activeForeground": "#B4BEB5" },
  });
}

/** 활성 VS Code 확장의 grammars 를 수집·연결. 반환: 연결된 언어 수 */
export async function loadTextMateGrammars(): Promise<number> {
  if (!window.schutz) return 0;
  let list: any[] = [];
  try { list = await window.schutz.extList(); } catch { return 0; }
  const languages = new Map<string, string>(); // languageId → scopeName
  grammarByScope.clear();
  for (const ext of list) {
    if (ext.kind !== "vscode" || !ext.enabled) continue;
    for (const g of (ext.contributes?.grammars || [])) {
      if (!g.scopeName || !g.path) continue;
      grammarByScope.set(g.scopeName, { extId: ext.id, path: g.path });
      if (g.language) languages.set(g.language, g.scopeName);
    }
  }
  if (languages.size === 0) return 0;

  try { await ensureWasm(); } catch { return 0; }
  const registry = new Registry({
    getGrammarDefinition: async (scopeName: string) => {
      const info = grammarByScope.get(scopeName);
      if (!info || !window.schutz) throw new Error("no grammar " + scopeName);
      const raw = await window.schutz.extReadFile(info.extId, info.path.replace(/^\.\//, ""));
      if (typeof raw !== "string") throw new Error("read fail " + scopeName);
      return { format: /\.json$/i.test(info.path) ? "json" : "plist", content: raw } as any;
    },
  });

  for (const [lang] of languages) {
    if (!monaco.languages.getLanguages().some(l => l.id === lang)) monaco.languages.register({ id: lang });
  }
  defineTmTheme();
  try {
    await wireTmGrammars(monaco as any, registry as any, languages);
    wired = true;
    // 테마 적용은 호출측(reloadExtensions → applyEditorTheme)이 조율한다.
    // 여기서 setTheme 을 강제하면 사용자가 고른 테마를 덮어써버림.
  } catch (e) { console.error("wireTmGrammars 실패:", (e as any).message); return 0; }
  return languages.size;
}

export function isTextMateWired(): boolean { return wired; }
