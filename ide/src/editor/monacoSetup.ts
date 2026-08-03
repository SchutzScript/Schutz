import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { parseJsonc } from "../engine/jsonc";
import { THEME_TOKENS } from "../theme";
import { monacoWidgetColors } from "./monacoColors";

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

/** 마지막으로 적용한 기본 옵션 — 프로젝트를 바꿀 때 이전 프로젝트의 별칭이 남지 않게. */
const BASE_TS_OPTS = {
  target: 99, module: 99, moduleResolution: 2, jsx: 2,
  allowJs: true, allowNonTsExtensions: true, esModuleInterop: true,
  noEmit: true, skipLibCheck: true, baseUrl: ".", allowSyntheticDefaultImports: true,
};

/**
 * 프로젝트 tsconfig 의 `paths` 를 Monaco 에 물린다.
 *
 * 안 하면 `@/utils` 같은 별칭 import 가 전부 "모듈을 찾을 수 없음" 으로 뜬다 — 문제 패널이
 * 유령 오류로 가득 차고, 진짜 오류가 그 안에 묻힌다. 별칭을 쓰는 프로젝트에서는 TS 지원이
 * 사실상 없는 것과 같았다.
 *
 * 경로는 **모델 URI 기준**이어야 한다. 워커는 파일을 `file:///c%3A/...` 로 보므로
 * baseUrl 도 같은 형태로 준다 — 디스크 경로를 그대로 주면 아무것도 안 맞는다.
 *
 * tsconfig 는 거의 늘 JSONC 라 engine/jsonc.ts 로 벗긴다. 못 읽으면 조용히 기본값이다
 * — 별칭이 없는 프로젝트가 대다수고, 여기서 시끄러우면 그쪽이 손해다.
 */
export async function applyTsPaths(root: string, readFile: (rel: string) => Promise<string>): Promise<boolean> {
  const ts: any = (monaco.languages as any).typescript;
  if (!ts) return false;
  let paths: Record<string, string[]> | null = null;
  let baseRel = ".";
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const co = parseJsonc(await readFile(name))?.compilerOptions;
      if (!co) continue;
      if (co.baseUrl) baseRel = String(co.baseUrl);
      if (co.paths && typeof co.paths === "object") paths = co.paths;
      break;
    } catch { /* 없으면 다음 후보 */ }
  }
  const baseUri = monaco.Uri.file(
    root.replace(/\\/g, "/").replace(/\/+$/, "") + "/" + baseRel.replace(/^\.\/?/, ""),
  ).toString().replace(/\/$/, "");
  lastTsOpts = { ...BASE_TS_OPTS, baseUrl: baseUri, ...(paths ? { paths } : {}) };
  for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) d.setCompilerOptions(lastTsOpts);
  return !!paths;
}

let lastTsOpts: any = null;

/**
 * 진단을 한 번 더 확정한다.
 *
 * 옵션을 바꾸면 Monaco 가 열린 모델을 전부 다시 검사하지만(DiagnosticsAdapter 의
 * recomputeDiagostics), 그와 동시에 TS 워커가 재시작된다. 먼저 날아갔던 검사가 **늦게**
 * 도착하면 방금 지운 마커를 도로 써 버린다 — 별칭이 세 번에 한 번씩 안 먹던 게 이거였다.
 * 모델이 다 앉은 뒤 같은 옵션을 한 번 더 넣어 마지막 검사가 우리 것이 되게 한다.
 */
export function revalidateTs(): void {
  const ts: any = (monaco.languages as any).typescript;
  if (!ts || !lastTsOpts) return;
  for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) d.setCompilerOptions(lastTsOpts);
}


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
    // 위젯 색을 먼저 깐다 — 아래 본문 색이 그 위를 덮으므로 지금까지의 에디터 모습은 그대로다.
    ...monacoWidgetColors(THEME_TOKENS.feldgrau!),
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

/** Graphite — 신택스는 Feldgrau 와 같고 위젯 색만 자기 토큰을 쓴다.
 *  예전엔 monaco 테마를 feldgrau 와 공유해서, 팝업 바탕이 한 톤 어긋났다. */
monaco.editor.defineTheme("graphite", {
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
    // 위젯 색을 먼저 깐다 — 아래 본문 색이 그 위를 덮으므로 지금까지의 에디터 모습은 그대로다.
    ...monacoWidgetColors(THEME_TOKENS.graphite!),
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
    ...monacoWidgetColors(THEME_TOKENS.paper!),
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
