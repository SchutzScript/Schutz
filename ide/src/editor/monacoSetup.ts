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

/** Feldgrau 테마 — 디자인 토큰의 신택스 팔레트를 Monaco에 등록 */
monaco.editor.defineTheme("feldgrau", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "C4CBC4" },
    { token: "keyword", foreground: "C4A882" },
    { token: "string", foreground: "8BB292" },
    { token: "number", foreground: "8BB292" },
    { token: "type", foreground: "9CB8B0" },
    { token: "identifier", foreground: "C4CBC4" },
    { token: "comment", foreground: "535B55", fontStyle: "italic" },
    { token: "delimiter", foreground: "9AA59C" },
  ],
  colors: {
    "editor.background": "#0E100F",
    "editor.foreground": "#C4CBC4",
    "editorLineNumber.foreground": "#3A403C",
    "editorLineNumber.activeForeground": "#8B948C",
    "editorCursor.foreground": "#8FA893",
    "editor.selectionBackground": "#7D918347",
    "editor.lineHighlightBackground": "#15191780",
    "editorIndentGuide.background1": "#1E2321",
    "editorWidget.background": "#181C1A",
    "editorWidget.border": "#2A302C",
    "scrollbarSlider.background": "#FFFFFF14",
    "scrollbarSlider.hoverBackground": "#FFFFFF26",
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
    "editor.background": "#FAF8F2",
    "editor.foreground": "#333632",
    "editorLineNumber.foreground": "#C0C2BA",
    "editorLineNumber.activeForeground": "#6B706A",
    "editorCursor.foreground": "#4E6A55",
    "editor.selectionBackground": "#4E6A5533",
    "editor.lineHighlightBackground": "#EAE7DE80",
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
    yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

export default monaco;
