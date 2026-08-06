// 확장이 요구한 데코레이션을 Monaco 가 그릴 수 있는 모양으로 옮긴다.
//
// 여기가 0.2.0 이 한 판을 통째로 들여 없앤 그 모양이 마지막으로 남아 있던 자리다.
// `createTextEditorDecorationType` 은 멀쩡해 보이는 핸들을 돌려주고 `setDecorations` 는
// 범위를 받아 놓고, 아무것도 그리지 않았다. 인라인 blame 이나 커버리지 표시를 하는
// 확장은 성공을 답으로 받고 화면에는 아무것도 못 얻었다.
//
// 두 API 의 모양이 다르다. VS Code 는 CSS 를 그대로 받는다(backgroundColor, border,
// textDecoration…). Monaco 는 클래스 이름만 받고 그 클래스가 어딘가 정의돼 있기를
// 기대한다. 그래서 타입 하나당 규칙을 만들어 스타일시트에 넣고, Monaco 에는 그 이름을
// 준다. 이 파일은 그 변환만 한다 — DOM 도 monaco 도 건드리지 않아 그대로 시험할 수 있다.

import { toMonacoRange, type MonacoRange } from "./shimLang";

/** CSS 값으로 쓸 수 있는 색인가. ThemeColor({id}) 는 우리 토큰과 이름이 달라 못 쓴다. */
export function cssColor(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  // vscode.ThemeColor — VS Code 의 색 이름 체계라 우리 테마에 대응이 없다.
  // 억지로 매핑하면 엉뚱한 색이 나오므로 그 속성만 뺀다(그린다는 사실은 유지된다).
  return null;
}

/** VS Code 데코레이션 옵션 → CSS 선언 목록. 알아듣는 것만 옮긴다. */
export function cssDecls(opts: any): string[] {
  const out: string[] = [];
  const put = (prop: string, v: unknown) => { const c = typeof v === "string" ? v.trim() : cssColor(v); if (c) out.push(`${prop}:${c}`); };
  put("background", opts?.backgroundColor);
  put("color", opts?.color);
  put("border", opts?.border);
  put("border-color", opts?.borderColor);
  put("border-style", opts?.borderStyle);
  put("border-width", opts?.borderWidth);
  put("border-radius", opts?.borderRadius);
  put("outline", opts?.outline);
  put("text-decoration", opts?.textDecoration);
  put("font-style", opts?.fontStyle);
  put("font-weight", opts?.fontWeight);
  put("letter-spacing", opts?.letterSpacing);
  put("opacity", opts?.opacity);
  return out;
}

/** before/after 는 가짜 요소로 그린다. contentText 가 없으면 만들 이유가 없다. */
export function pseudoDecls(side: any): string[] | null {
  if (!side || typeof side !== "object") return null;
  const text = side.contentText;
  if (typeof text !== "string" || text === "") return null;
  // 따옴표와 역슬래시를 막지 않으면 확장이 준 문자열이 CSS 규칙을 깨고 나온다.
  const safe = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
  return [`content:"${safe}"`, ...cssDecls(side), ...(side.margin ? [`margin:${String(side.margin)}`] : [])];
}

/** 타입 하나가 쓸 클래스 이름들. id 는 부르는 쪽이 붙인 일련번호다. */
export function classNames(id: string) {
  return { base: `szdeco-${id}`, before: `szdeco-${id}-b`, after: `szdeco-${id}-a` };
}

/** 스타일시트에 넣을 규칙 전문. 넣을 것이 없으면 빈 문자열. */
export function styleSheetFor(id: string, opts: any): string {
  const n = classNames(id);
  const rules: string[] = [];
  const main = cssDecls(opts);
  if (main.length) rules.push(`.${n.base}{${main.join(";")}}`);
  const before = pseudoDecls(opts?.before);
  if (before) rules.push(`.${n.before}::before{${before.join(";")}}`);
  const after = pseudoDecls(opts?.after);
  if (after) rules.push(`.${n.after}::after{${after.join(";")}}`);
  return rules.join("\n");
}

export interface MonacoDecoOptions {
  className?: string;
  inlineClassName?: string;
  beforeContentClassName?: string;
  afterContentClassName?: string;
  isWholeLine?: boolean;
  stickiness?: number;
  overviewRuler?: { color: string; position: number };
  minimap?: { color: string; position: number };
}

/** Monaco 가 받는 옵션. 클래스가 하나도 안 붙으면 그릴 것이 없다는 뜻이다. */
export function monacoOptions(id: string, opts: any): MonacoDecoOptions {
  const n = classNames(id);
  const o: MonacoDecoOptions = {};
  const whole = opts?.isWholeLine === true;
  if (cssDecls(opts).length) {
    // 줄 전체는 className(줄 배경), 글자 범위는 inlineClassName 이 맞는 자리다.
    if (whole) o.className = n.base; else o.inlineClassName = n.base;
  }
  if (whole) o.isWholeLine = true;
  if (pseudoDecls(opts?.before)) o.beforeContentClassName = n.before;
  if (pseudoDecls(opts?.after)) o.afterContentClassName = n.after;
  const ruler = cssColor(opts?.overviewRulerColor);
  // 1 = Left. VS Code 의 overviewRulerLane 과 숫자가 다르지만, 레인 선택까지 옮기면
  // 대응이 없는 값에서 아무것도 안 그리게 된다 — 보이는 쪽을 택한다.
  if (ruler) o.overviewRuler = { color: ruler, position: 1 };
  // 어느 줄이 늘어날 때 데코레이션이 따라 늘지 — VS Code 기본과 같은 쪽으로.
  o.stickiness = 1;
  return o;
}

/** 그릴 것이 하나도 없는 타입인가. 있으면 확장에게 알려 줄 수 있다. */
export function drawsNothing(opts: any): boolean {
  const o = monacoOptions("x", opts);
  return !o.className && !o.inlineClassName && !o.beforeContentClassName && !o.afterContentClassName && !o.overviewRuler;
}

export interface NormDeco { range: MonacoRange; hover?: string }

/** setDecorations 는 Range[] 도 DecorationOptions[] 도 받는다. 둘 다 받아 준다. */
export function normalizeDecos(list: any): NormDeco[] {
  if (!Array.isArray(list)) return [];
  const out: NormDeco[] = [];
  for (const it of list) {
    if (!it) continue;
    // DecorationOptions 면 range 를 품고 있고, 아니면 그 자체가 Range 다.
    const r = it.range ?? it;
    if (!r || (r.start === undefined && !Array.isArray(r))) continue;
    const hover = hoverText(it.hoverMessage);
    out.push(hover ? { range: toMonacoRange(r), hover } : { range: toMonacoRange(r) });
  }
  return out;
}

/** hoverMessage 는 문자열·MarkdownString·그 배열 중 아무거나로 온다. */
export function hoverText(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v || undefined;
  if (Array.isArray(v)) {
    const parts = v.map(hoverText).filter(Boolean);
    return parts.length ? parts.join("\n\n") : undefined;
  }
  const s = typeof v.value === "string" ? v.value : "";
  return s || undefined;
}
