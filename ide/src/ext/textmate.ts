// VS Code TextMate 문법(.tmLanguage.json)을 Monaco에 연결 — VS Code급 신택스 하이라이팅.
// monaco-textmate(해석기) + onigasm(정규식 WASM) + monaco-editor-textmate(글루) — 서로 매칭된 조합.
import { Registry } from "monaco-textmate";
import { loadWASM } from "onigasm";
import { wireTmGrammars } from "monaco-editor-textmate";
import monaco from "../editor/monacoSetup";
import onigasmWasmUrl from "onigasm/lib/onigasm.wasm?url";
import { getThemeId, isLightTheme } from "../theme";

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = fetch(onigasmWasmUrl).then(r => r.arrayBuffer()).then(buf => loadWASM(buf))
    .catch(e => { console.error("TextMate onigasm 로드 실패:", e && e.message); wasmReady = null; throw e; }); // 실패 캐시 금지 — 다음 시도 재시도
  return wasmReady;
}

const grammarByScope = new Map<string, { extId: string; path: string }>();
let wired = false;

/** TextMate 토큰 스코프까지 색을 입히는 테마 (deepest scope → 접두 매칭).
 *  다크/라이트 둘 다 정의한다 — 예전엔 다크만 있어 Paper 테마를 골라도
 *  에디터만 검게 남았다(TextMate 연결 시 무조건 tm-dark 로 가는 분기). */
type TmPalette = {
  base: "vs" | "vs-dark"; fg: string; comment: string; str: string; num: string;
  kw: string; type: string; fn: string; punct: string; param: string;
  bg: string; editorFg: string; lineNum: string; lineNumActive: string;
};

const TM_DARK: TmPalette = {
  base: "vs-dark", fg: "D8DFD8", comment: "72806F", str: "9DD3A6", num: "D8A9C8",
  kw: "E4B67E", type: "A6D6C8", fn: "E9E2AC", punct: "AEB9AF", param: "D6C6A6",
  bg: "#0F1211", editorFg: "#D8DFD8", lineNum: "#606A62", lineNumActive: "#B4BEB5",
};

// 라이트는 schutz-paper 팔레트와 같은 계열로 맞추되, 흰 배경에서 읽힐 만큼 어둡게.
const TM_LIGHT: TmPalette = {
  base: "vs", fg: "333632", comment: "8A8D86", str: "3E7D4E", num: "8A4A7A",
  kw: "9A6A2E", type: "2E6A7A", fn: "7A6320", punct: "5C6258", param: "6A5A38",
  bg: "#FFFFFF", editorFg: "#232823", lineNum: "#BEC3B6", lineNumActive: "#5C6258",
};

function tmRules(p: TmPalette): monaco.editor.ITokenThemeRule[] {
  return [
    { token: "", foreground: p.fg },
    { token: "comment", foreground: p.comment, fontStyle: "italic" },
    { token: "string", foreground: p.str },
    { token: "constant.numeric", foreground: p.num }, { token: "constant.language", foreground: p.num },
    { token: "constant.character", foreground: p.str }, { token: "constant.other", foreground: p.num },
    { token: "keyword", foreground: p.kw }, { token: "keyword.operator", foreground: p.punct },
    { token: "storage", foreground: p.kw }, { token: "storage.type", foreground: p.type },
    { token: "entity.name.function", foreground: p.fn }, { token: "support.function", foreground: p.fn },
    { token: "entity.name.type", foreground: p.type }, { token: "entity.name.class", foreground: p.type },
    { token: "support.type", foreground: p.type }, { token: "support.class", foreground: p.type },
    { token: "entity.name.tag", foreground: p.kw }, { token: "entity.other.attribute-name", foreground: p.type },
    { token: "variable", foreground: p.fg }, { token: "variable.parameter", foreground: p.param },
    { token: "punctuation", foreground: p.punct },
    { token: "number", foreground: p.num }, { token: "type", foreground: p.type },
    { token: "function", foreground: p.fn }, { token: "delimiter", foreground: p.punct },
  ];
}

function defineTmTheme() {
  for (const [id, p] of [["schutz-tm-dark", TM_DARK], ["schutz-tm-light", TM_LIGHT]] as [string, TmPalette][]) {
    monaco.editor.defineTheme(id, {
      base: p.base, inherit: true, rules: tmRules(p),
      colors: {
        "editor.background": p.bg, "editor.foreground": p.editorFg,
        "editorLineNumber.foreground": p.lineNum, "editorLineNumber.activeForeground": p.lineNumActive,
      },
    });
  }
}

/** 현재 선택 테마의 명암에 맞는 TextMate 테마 id */
export function tmThemeId(): string {
  return isLightTheme(getThemeId()) ? "schutz-tm-light" : "schutz-tm-dark";
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
