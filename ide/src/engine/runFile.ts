/**
 * "지금 이 파일 한 번 돌려봐" — 확장자에서 실행 명령을 만든다.
 *
 * 프로젝트 단위 실행(package.json 스크립트)과 파이썬 디버그는 이미 있는데, 파일 하나를
 * 그냥 돌려보는 길만 없었다. `.c` 하나를 확인하려고 터미널을 열어 gcc 를 직접 쳐야 했다.
 *
 * 여기서 조용히 틀리는 것은 늘 같은 셋이다: 공백 있는 경로, 산출물 이름, 그리고
 * 셸마다 다른 연결자. 그래서 문자열 조립만 떼어 테스트를 붙인다. 실행은 하지 않는다 —
 * 이 모듈은 무엇을 칠지만 정한다.
 */

export type Platform = "win32" | "posix";

export interface RunSpec {
  /** 이 언어를 부르는 이름(UI 표시용). */
  label: string;
  /** 있어야 실행되는 실행 파일. 없으면 "gcc 를 못 찾았다" 고 말해 줄 수 있다. */
  requires: string;
  /** 컴파일이 필요한가 — 산출물을 만들고 지운다. */
  compiled: boolean;
}

export interface RunPlan {
  /** 셸에 그대로 넣을 한 줄. */
  command: string;
  spec: RunSpec;
  /** 컴파일 산출물의 경로(있으면). 정리 대상이자 실행 대상이다. */
  artifact: string | null;
}

/** 확장자 → 어떻게 돌리나. 사용자가 설정에서 덮어쓸 수 있게 명령을 템플릿으로 둔다.
 *  `${file}` 은 파일 절대경로, `${out}` 은 산출물 경로로 바뀐다(둘 다 따옴표가 붙는다). */
export interface LangDef {
  ext: string[];
  label: string;
  requires: string;
  /** 컴파일 언어면 [빌드, 실행] 두 단계. 스크립트 언어면 한 단계. */
  template: string;
  compiled: boolean;
}

export const LANGS: LangDef[] = [
  { ext: ["py"], label: "Python", requires: "python", template: "python ${file}", compiled: false },
  { ext: ["js", "mjs", "cjs"], label: "Node", requires: "node", template: "node ${file}", compiled: false },
  { ext: ["ts"], label: "TypeScript", requires: "npx", template: "npx tsx ${file}", compiled: false },
  { ext: ["sh"], label: "Shell", requires: "bash", template: "bash ${file}", compiled: false },
  { ext: ["rb"], label: "Ruby", requires: "ruby", template: "ruby ${file}", compiled: false },
  { ext: ["go"], label: "Go", requires: "go", template: "go run ${file}", compiled: false },
  { ext: ["rs"], label: "Rust", requires: "rustc", template: "rustc ${file} -o ${out} && ${out}", compiled: true },
  { ext: ["c"], label: "C", requires: "gcc", template: "gcc ${file} -o ${out} && ${out}", compiled: true },
  { ext: ["cc", "cpp", "cxx"], label: "C++", requires: "g++", template: "g++ ${file} -o ${out} && ${out}", compiled: true },
  { ext: ["java"], label: "Java", requires: "java", template: "java ${file}", compiled: false },
];

export function extOf(rel: string): string {
  const base = rel.replace(/\\/g, "/").split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function langFor(rel: string): LangDef | null {
  const e = extOf(rel);
  return LANGS.find(l => l.ext.includes(e)) ?? null;
}

/** 셸에 넣을 수 있게 감싼다.
 *  Windows(cmd)는 작은따옴표를 모르고, POSIX 는 작은따옴표 안이 가장 안전하다. */
export function quote(p: string, platform: Platform): string {
  if (platform === "win32") return '"' + p.replace(/"/g, '""') + '"';
  return "'" + p.replace(/'/g, "'\\''") + "'";
}

/** 컴파일 산출물 경로. 같은 폴더에 두면 프로젝트가 지저분해지고 트리에도 뜬다 —
 *  임시 폴더에 파일명을 살려 넣는다(오류 메시지에서 무엇을 돌렸는지 읽히게). */
export function artifactPath(absFile: string, tmpDir: string, platform: Platform): string {
  const base = (absFile.replace(/\\/g, "/").split("/").pop() ?? "out").replace(/\.[^.]*$/, "");
  const safe = base.replace(/[^A-Za-z0-9_.-]/g, "_") || "out";
  const sep = platform === "win32" ? "\\" : "/";
  return tmpDir.replace(/[\\/]+$/, "") + sep + "schutz-run-" + safe + (platform === "win32" ? ".exe" : "");
}

export interface PlanInput {
  /** 파일 절대 경로. */
  absFile: string;
  platform: Platform;
  tmpDir: string;
  /** 설정에서 덮어쓴 템플릿(확장자별). 없으면 기본표. */
  override?: string | null;
}

export type PlanResult =
  | { ok: true; plan: RunPlan }
  | { ok: false; reason: "unsupported"; ext: string };

export function planRun(i: PlanInput): PlanResult {
  const lang = langFor(i.absFile);
  if (!lang) return { ok: false, reason: "unsupported", ext: extOf(i.absFile) };

  const artifact = lang.compiled ? artifactPath(i.absFile, i.tmpDir, i.platform) : null;
  const tpl = (i.override && i.override.trim()) || lang.template;
  const command = tpl
    .replace(/\$\{file\}/g, quote(i.absFile, i.platform))
    .replace(/\$\{out\}/g, artifact ? quote(artifact, i.platform) : "");

  return {
    ok: true,
    plan: { command, artifact, spec: { label: lang.label, requires: lang.requires, compiled: lang.compiled } },
  };
}
