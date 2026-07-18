// VS Code 확장의 선언형 기여를 Monaco에 적용 — 테마 · 스니펫 · 언어설정.
// 프로그램형(vscode.* API) 확장은 처리하지 않는다(미지원).
import monaco from "../editor/monacoSetup";
import { parseJsonc } from "./jsonc";

export interface ImportedTheme { id: string; label: string; base: "vs" | "vs-dark"; extId: string; }

let importedThemes: ImportedTheme[] = [];
export function getImportedThemes(): ImportedTheme[] { return importedThemes; }

function joinPath(dir: string, rel: string): string {
  return (dir.replace(/[\\/]+$/, "") + "/" + rel.replace(/^\.?[\\/]/, "")).replace(/\\/g, "/");
}

async function readJson(id: string, rel: string): Promise<any | null> {
  if (!window.schutz) return null;
  const raw = await window.schutz.extReadFile(id, rel);
  if (typeof raw !== "string") return null;
  return parseJsonc(raw);
}

/** VS Code TextMate scope → Monaco 토큰(coarse). 전체 grammar 없이 best-effort 매핑 */
function mapScope(scope: string): string[] {
  const s = scope.toLowerCase();
  const out: string[] = [];
  const add = (t: string) => out.push(t);
  if (s.includes("comment")) add("comment");
  if (s.includes("string")) add("string");
  if (s.includes("constant.numeric") || s.includes("number")) add("number");
  if (s.includes("keyword") || s.includes("storage")) add("keyword");
  if (s.includes("entity.name.function") || s.includes("support.function")) add("function");
  if (s.includes("entity.name.type") || s.includes("support.type") || s.includes("entity.name.class")) add("type");
  if (s.includes("variable")) add("variable");
  if (s.includes("constant.language")) add("constant");
  if (s.includes("entity.name.tag")) add("tag");
  if (s.includes("attribute")) add("attribute.name");
  return out;
}

/** #RRGGBB[AA] → 6자리 hex(알파 제거). 유효하지 않으면 null */
function hex6(c?: string): string | null {
  if (!c || typeof c !== "string") return null;
  let h = c.replace("#", "").trim();
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map(x => x + x).join(""); // #abc → #aabbcc
  if (/^[0-9a-fA-F]{8}$/.test(h)) h = h.slice(0, 6); // 알파 제거 (rule foreground는 6자리만)
  return /^[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null;
}
/** colors 값은 Monaco가 #RRGGBB / #RRGGBBAA 허용 → 형식 검증만 */
function colorOk(c?: string): string | null {
  if (!c || typeof c !== "string") return null;
  return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c.trim()) ? c.trim() : null;
}

/** VS Code 컬러 테마 → monaco.editor.defineTheme */
function applyTheme(extId: string, id: string, label: string, theme: any): ImportedTheme | null {
  const type = (theme.type || "dark").toLowerCase();
  const base: "vs" | "vs-dark" = type === "light" || type === "hc-light" ? "vs" : "vs-dark";
  const rules: monaco.editor.ITokenThemeRule[] = [];
  // VS Code 는 last-wins(뒤 규칙이 앞을 덮음) — dedup 하지 않고 Monaco 의 네이티브 last-wins 에 맡긴다
  const pushRule = (tok: string, fg: string | null, fontStyle?: string) => {
    if (!tok) return;
    const rule: monaco.editor.ITokenThemeRule = { token: tok };
    if (fg) rule.foreground = fg;
    if (fontStyle && /italic|bold|underline/.test(fontStyle)) rule.fontStyle = fontStyle.match(/italic|bold|underline/g)!.join(" ");
    rules.push(rule);
  };
  for (const tc of (theme.tokenColors || [])) {
    const settings = tc.settings || {};
    const fg = hex6(settings.foreground);
    if (!fg && !settings.fontStyle) continue;
    const scopes = Array.isArray(tc.scope) ? tc.scope : (typeof tc.scope === "string" ? tc.scope.split(",").map((x: string) => x.trim()) : []);
    for (const sc of scopes) {
      // 원본 TextMate 스코프 그대로 — TextMate 토큰화 시 접두 매칭(충실한 색)
      pushRule(sc, fg, settings.fontStyle);
      // Monaco 내장 토크나이저(TS/JS 등)용 coarse 토큰 매핑
      for (const tok of mapScope(sc)) pushRule(tok, fg, settings.fontStyle);
    }
  }
  // 워크벤치 색 — Monaco가 렌더하는 편집기 관련 키를 폭넓게 반영 (위젯/거터/괄호/찾기/선택/스크롤바 등)
  const colors: Record<string, string> = {};
  const c = theme.colors || {};
  const COLOR_KEYS = [
    "editor.background", "editor.foreground",
    "editorLineNumber.foreground", "editorLineNumber.activeForeground",
    "editorCursor.foreground", "editorCursor.background",
    "editor.selectionBackground", "editor.selectionHighlightBackground",
    "editor.inactiveSelectionBackground", "editor.lineHighlightBackground", "editor.lineHighlightBorder",
    "editor.wordHighlightBackground", "editor.wordHighlightStrongBackground",
    "editor.findMatchBackground", "editor.findMatchHighlightBackground", "editor.rangeHighlightBackground",
    "editorWhitespace.foreground", "editorIndentGuide.background", "editorIndentGuide.activeBackground",
    "editorLineNumber.dimmedForeground",
    "editorBracketMatch.background", "editorBracketMatch.border",
    "editorGutter.background", "editorGutter.modifiedBackground", "editorGutter.addedBackground", "editorGutter.deletedBackground",
    "editorError.foreground", "editorWarning.foreground", "editorInfo.foreground",
    "editorHoverWidget.background", "editorHoverWidget.border",
    "editorSuggestWidget.background", "editorSuggestWidget.border", "editorSuggestWidget.foreground",
    "editorSuggestWidget.selectedBackground", "editorSuggestWidget.highlightForeground",
    "editorWidget.background", "editorWidget.border", "editorWidget.foreground",
    "input.background", "input.foreground", "input.border",
    "list.hoverBackground", "list.activeSelectionBackground", "list.focusBackground", "list.highlightForeground",
    "scrollbarSlider.background", "scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground",
    "minimap.background", "editorOverviewRuler.border",
  ];
  for (const k of COLOR_KEYS) {
    const v = colorOk(c[k]); if (v) colors[k] = v;
  }
  // semanticTokenColors — 토큰 규칙으로 추가 반영 (best-effort)
  const sem = theme.semanticTokenColors || {};
  for (const [tok, val] of Object.entries(sem)) {
    const fg = hex6(typeof val === "string" ? val : (val as any)?.foreground);
    const style = typeof val === "object" ? (val as any)?.fontStyle : undefined;
    if (fg || style) pushRule(tok.replace(/[:.]/g, "."), fg, style);
  }
  // Monaco 테마명은 ^[a-z0-9-]+$ 만 허용 → 안전하게 정규화
  const themeId = ("vsx-" + id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  try {
    monaco.editor.defineTheme(themeId, { base, inherit: true, rules, colors });
    return { id: themeId, label, base, extId };
  } catch (e) { console.log("[vsx] defineTheme throw", label, e instanceof Error ? e.message : e); return null; }
}

/** VS Code 스니펫 → Monaco completion provider */
const snippetProviders = new Map<string, monaco.IDisposable>();
function registerSnippets(langId: string, snippets: any) {
  const items = Object.entries(snippets || {}).map(([name, def]: [string, any]) => {
    const body = Array.isArray(def.body) ? def.body.join("\n") : String(def.body ?? "");
    return { name, prefix: def.prefix || name, body, description: def.description || "" };
  }).filter(s => s.prefix);
  if (!items.length) return;
  // 재로드 시 같은 언어의 이전 provider 를 폐기해 중복 제안 방지
  snippetProviders.get(langId)?.dispose();
  const disp = monaco.languages.registerCompletionItemProvider(langId, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, startColumn: word.startColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn };
      return {
        suggestions: items.map(s => ({
          label: Array.isArray(s.prefix) ? s.prefix[0] : s.prefix,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: s.description, detail: s.name, range,
        })),
      };
    },
  });
  snippetProviders.set(langId, disp);
}

/** 활성 VS Code 확장의 선언형 기여를 적용. 반환: 적용된 테마 목록 */
export async function loadVscodeExtensions(): Promise<{ themes: ImportedTheme[]; errors: string[] }> {
  importedThemes = [];
  const errors: string[] = [];
  if (!window.schutz) return { themes: [], errors };
  let list: any[] = [];
  try { list = await window.schutz.extList(); } catch { return { themes: [], errors: ["목록 실패"] }; }
  for (const ext of list) {
    if (ext.kind !== "vscode" || !ext.enabled) continue;
    const con = ext.contributes || {};
    // 테마
    for (const t of (con.themes || [])) {
      const theme = await readJson(ext.id, t.path);
      if (!theme) { errors.push(ext.id + ": 테마 파싱 실패"); continue; }
      const label = t.label || ext.name;
      const res = applyTheme(ext.id, ext.id + ":" + label, label, theme);
      if (res) importedThemes.push(res);
    }
    // 언어 설정
    for (const l of (con.languages || [])) {
      if (l.id && (l.extensions || l.aliases)) {
        // 재로드 시 이미 등록된 언어는 건너뛴다 (중복 등록 방지)
        const already = monaco.languages.getLanguages().some(x => x.id === l.id);
        if (!already) { try { monaco.languages.register({ id: l.id, extensions: l.extensions, aliases: l.aliases, filenames: l.filenames }); } catch { /* */ } }
      }
      if (l.id && l.configuration) {
        const cfg = await readJson(ext.id, l.configuration);
        if (cfg) {
          try {
            monaco.languages.setLanguageConfiguration(l.id, {
              comments: cfg.comments,
              brackets: cfg.brackets,
              autoClosingPairs: cfg.autoClosingPairs,
              surroundingPairs: cfg.surroundingPairs,
              wordPattern: cfg.wordPattern ? new RegExp(cfg.wordPattern) : undefined,
            } as any);
          } catch { /* */ }
        }
      }
    }
    // 스니펫
    for (const sn of (con.snippets || [])) {
      if (!sn.language || !sn.path) continue;
      const snippets = await readJson(ext.id, sn.path);
      if (snippets) registerSnippets(sn.language, snippets);
    }
  }
  return { themes: importedThemes, errors };
}
