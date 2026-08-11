// 확장이 만든 편집기 — 어떤 파일을 누가 열 것인가.
//
// `contributes.customEditors` 는 viewType 과 파일 패턴을 짝지어 선언하고,
// `window.registerCustomEditorProvider` 가 그 viewType 에 실제 구현을 붙인다.
// 둘이 다 있어야 그 파일이 그 편집기로 열린다 — 선언만 있고 구현이 없으면
// 파일이 안 열리는 것처럼 보이고, 구현만 있고 선언이 없으면 아무도 안 부른다.
//
// 여기는 그 짝짓기만 한다. 화면에 그리는 일은 App 이, 등록은 셰임이 맡는다.

export interface CustomEditorDecl {
  viewType: string;
  /** 확장 id — 같은 viewType 을 두 확장이 선언해도 갈라 두기 위해. */
  extId: string;
  /** 파일 이름 패턴들(glob). 하나라도 맞으면 이 편집기가 후보다. */
  patterns: string[];
  /** 사용자가 기본 편집기 대신 이걸 쓰길 원하는가. vscode 의 priority. */
  optional: boolean;
}

/** manifest 의 contributes.customEditors 를 읽는다. 모양이 어긋나면 그 항목만 버린다. */
export function parseCustomEditors(contributes: any, extId: string): CustomEditorDecl[] {
  const raw = contributes?.customEditors;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: CustomEditorDecl[] = [];
  for (const it of list) {
    const viewType = String(it?.viewType ?? "").trim();
    if (!viewType) continue;
    const sel = Array.isArray(it?.selector) ? it.selector : it?.selector ? [it.selector] : [];
    const patterns = sel.map((s: any) => String(s?.filenamePattern ?? "").trim()).filter(Boolean);
    if (!patterns.length) continue;
    out.push({
      viewType,
      extId,
      patterns,
      // vscode 의 기본값은 "default"(이 편집기로 연다). "option" 이면 사용자가 골라야 한다.
      optional: String(it?.priority ?? "default") === "option",
    });
  }
  return out;
}

/** 아주 작은 glob → 정규식. `*` 는 구분자를 안 넘고 `**` 는 넘는다.
 *
 *  순서대로 replace 하면 안 된다 — `**\/` 를 `(?:.*\/)?` 로 바꾼 뒤 다시 `*` 를
 *  치환하면 **방금 넣은 그 결과 안의 `*`** 까지 바뀐다. 실제로 그렇게 만들었다가
 *  `src/**\/*.draw` 가 아무것도 못 잡았다. 한 번에 훑는다. */
export function globToRe(pattern: string): RegExp {
  const p = String(pattern ?? "").replace(/\\/g, "/");
  let body = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "*") {
      if (p[i + 1] === "*") {
        // `**/` 는 폴더 0개 이상, 그냥 `**` 는 구분자까지 넘는 아무거나.
        if (p[i + 2] === "/") { body += "(?:[^/]*/)*"; i += 2; }
        else { body += ".*"; i += 1; }
      } else {
        body += "[^/]*";
      }
      continue;
    }
    if (c === "?") { body += "[^/]"; continue; }
    body += /[.+^${}()|[\]\\]/.test(c) ? "\\" + c : c;
  }
  // 경로가 없는 패턴(`*.draw`)은 어느 폴더에 있어도 맞아야 한다.
  const anywhere = !p.includes("/");
  return new RegExp(anywhere ? "^(?:.*/)?" + body + "$" : "^" + body + "$", "i");
}

export function matchesPattern(rel: string, pattern: string): boolean {
  try { return globToRe(pattern).test(String(rel ?? "").replace(/\\/g, "/")); } catch { return false; }
}

/**
 * 이 파일을 열 편집기. 없으면 null 이고, 그때는 평소대로 텍스트 편집기가 연다.
 *
 * **구현이 등록된 것만** 고른다. 선언은 있는데 확장이 아직 activate 되지 않았으면
 * 그 파일은 텍스트로 열려야 한다 — 빈 화면을 띄우는 것보다 낫다.
 */
export function editorFor(
  rel: string,
  decls: readonly CustomEditorDecl[],
  registered: ReadonlySet<string>,
): CustomEditorDecl | null {
  for (const d of decls) {
    if (d.optional) continue;                 // 사용자가 고르는 것 — 자동으로 안 연다
    if (!registered.has(d.viewType)) continue;
    if (d.patterns.some(p => matchesPattern(rel, p))) return d;
  }
  return null;
}
