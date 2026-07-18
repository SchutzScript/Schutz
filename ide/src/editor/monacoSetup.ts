import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

/** TS/JS 언어 서비스 설정 — 프로젝트 파일 모델과 함께 파일간 인텔리전스·진단 활성화.
 *  (monaco.languages.typescript 는 런타임엔 존재하나 기본 타입이 deprecated 스텁이라 any 캐스트) */
function configureTypescript() {
  const ts: any = (monaco.languages as any).typescript;
  if (!ts) return;
  const opts = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.React,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: ".",
    allowSyntheticDefaultImports: true,
  };
  for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    d.setCompilerOptions(opts);
    d.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, noSuggestionDiagnostics: false });
    d.setEagerModelSync(true); // 열지 않은 파일도 워커에 동기화 — 파일간 해석·진단의 핵심
  }
}
configureTypescript();

/** Feldgrau 테마 — 디자인 토큰의 신택스 팔레트를 Monaco에 등록 */
monaco.editor.defineTheme("feldgrau", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "D8DFD8" },
    { token: "keyword", foreground: "E4B67E" },
    { token: "string", foreground: "9DD3A6" },
    { token: "number", foreground: "D8A9C8" },
    { token: "regexp", foreground: "9DD3A6" },
    { token: "type", foreground: "A6D6C8" },
    { token: "class", foreground: "A6D6C8" },
    { token: "function", foreground: "E9E2AC" },
    { token: "variable", foreground: "D8DFD8" },
    { token: "constant", foreground: "D8A9C8" },
    { token: "identifier", foreground: "D8DFD8" },
    { token: "tag", foreground: "E4B67E" },
    { token: "attribute.name", foreground: "A6D6C8" },
    { token: "comment", foreground: "72806F", fontStyle: "italic" },
    { token: "delimiter", foreground: "AEB9AF" },
  ],
  colors: {
    "editor.background": "#0F1211",
    "editor.foreground": "#D8DFD8",
    "editorLineNumber.foreground": "#606A62",
    "editorLineNumber.activeForeground": "#B4BEB5",
    "editorCursor.foreground": "#A9C4AD",
    "editor.selectionBackground": "#7D918355",
    "editor.lineHighlightBackground": "#181D1B99",
    "editorIndentGuide.background1": "#232826",
    "editorWidget.background": "#181C1A",
    "editorWidget.border": "#2A302C",
    "scrollbarSlider.background": "#FFFFFF16",
    "scrollbarSlider.hoverBackground": "#FFFFFF2A",
  },
});

monaco.editor.defineTheme("schutz-paper", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "333632" },
    { token: "keyword", foreground: "9A6A2E" },
    { token: "string", foreground: "3E7D4E" },
    { token: "number", foreground: "3E7D4E" },
    { token: "type", foreground: "3E6D7D" },
    { token: "comment", foreground: "8A8D86", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#232823",
    "editorLineNumber.foreground": "#BEC3B6",
    "editorLineNumber.activeForeground": "#5C6258",
    "editorCursor.foreground": "#3F6B4E",
    "editor.selectionBackground": "#3F6B4E2E",
    "editor.lineHighlightBackground": "#F1F3EF",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#D3D7CD",
    "editorIndentGuide.background1": "#ECEEEA",
  },
});

export function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", md: "markdown", css: "css", scss: "scss", less: "less",
    html: "html", htm: "html", xml: "xml", svg: "xml",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
    sh: "shell", bash: "shell", ps1: "powershell", bat: "bat",
    yml: "yaml", yaml: "yaml", ini: "ini", sql: "sql",
  };
  if (map[ext]) return map[ext];
  // 확장이 기여한 언어(VS Code 문법 등) 포함 — Monaco 등록 언어에서 확장자 매칭
  const dot = "." + ext;
  const reg = monaco.languages.getLanguages().find(l => (l.extensions ?? []).includes(dot));
  return reg ? reg.id : "plaintext";
}

export default monaco;
