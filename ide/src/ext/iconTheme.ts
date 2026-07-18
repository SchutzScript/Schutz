// VS Code 아이콘 테마를 파일 아이콘으로 적용. 폰트형(fontCharacter) + SVG형(iconPath) 모두 지원.
// SVG는 렌더 중 동기 접근이 안 되므로 lazy 로드 후 onChange로 재렌더한다.
import { parseJsonc } from "./jsonc";

export interface IconRender {
  kind: "font" | "svg";
  char?: string; color?: string; family?: string; // font
  dataUri?: string;                                 // svg
}

interface ActiveTheme {
  extId: string;
  def: any;
  themeDir: string; // 테마 JSON이 있는 디렉터리 (아이콘 경로 해석 기준)
  fontFamily: Map<string, string>; // fontId → css family
  svgCache: Map<string, string | "loading" | "fail">; // defId → dataUri
}

let active: ActiveTheme | null = null;
let activeLabel = "";
let onChange: (() => void) | null = null;
export function setIconThemeChangeHandler(cb: () => void) { onChange = cb; }
export function isIconThemeActive(): boolean { return !!active; }
export function iconThemeLabel(): string { return activeLabel; }
export function clearIconTheme() { active = null; activeLabel = ""; onChange?.(); }

/** 아이콘 테마 활성화 — 폰트를 @font-face로 주입 */
export async function setIconTheme(extId: string, themePath: string, label: string): Promise<boolean> {
  if (!window.schutz) return false;
  const raw = await window.schutz.extReadFile(extId, themePath);
  if (typeof raw !== "string") return false;
  const def = parseJsonc(raw); // // · /* */ 주석 허용 (문자열 안전)
  if (!def) return false;
  const dir = themePath.replace(/[^/\\]+$/, ""); // 테마 파일 기준 상대경로 해석용
  const fontFamily = new Map<string, string>();
  for (const f of (def.fonts || [])) {
    const src = (f.src || [])[0];
    if (!src || !src.path) continue;
    const rel = joinRel(dir, src.path);
    const b64 = await window.schutz.extReadFileBase64(extId, rel);
    if (typeof b64 !== "string") continue;
    const fam = "vsxicon-" + extId.replace(/[^a-z0-9]+/gi, "-") + "-" + (f.id || "f");
    const fmt = /woff2/.test(src.path) ? "woff2" : /woff/.test(src.path) ? "woff" : "truetype";
    injectFontFace(fam, b64, fmt);
    fontFamily.set(f.id || "", fam);
  }
  active = { extId, def, themeDir: dir, fontFamily, svgCache: new Map() };
  activeLabel = label;
  onChange?.();
  return true;
}

function joinRel(dir: string, rel: string): string {
  return (dir + rel.replace(/^\.\//, "")).replace(/\\/g, "/").replace(/\/+/g, "/");
}
function injectFontFace(family: string, b64: string, fmt: string) {
  const styleId = "ifont-" + family;
  if (document.getElementById(styleId)) return;
  const st = document.createElement("style");
  st.id = styleId;
  st.textContent = `@font-face{font-family:'${family}';src:url(data:font/${fmt};base64,${b64}) format('${fmt}')}`;
  document.head.appendChild(st);
}

/** 파일명(+디렉터리 여부) → 렌더 스펙. 없으면 null(내장 아이콘 폴백) */
export function resolveIcon(name: string, isDir = false, isOpen = false): IconRender | null {
  if (!active) return null;
  const def = active.def;
  let defId: string | undefined;
  const lower = name.toLowerCase();
  if (isDir) {
    defId = (isOpen && def.folderNamesExpanded?.[lower]) || def.folderNames?.[lower] || (isOpen ? def.folderExpanded : def.folder);
  } else {
    // fileNames(정확) → fileExtensions(긴 접미사 우선) → 기본 file
    if (def.fileNames?.[lower]) defId = def.fileNames[lower];
    if (!defId) {
      const parts = lower.split(".");
      for (let i = 1; i < parts.length; i++) {
        const ext = parts.slice(i).join(".");
        if (def.fileExtensions?.[ext]) { defId = def.fileExtensions[ext]; break; }
      }
    }
    if (!defId) defId = def.file;
  }
  if (!defId) return null;
  const idef = def.iconDefinitions?.[defId];
  if (!idef) return null;

  if (idef.fontCharacter) {
    const fam = active.fontFamily.get(idef.fontId || "") || [...active.fontFamily.values()][0];
    if (!fam) return null;
    return { kind: "font", char: idef.fontCharacter, color: idef.fontColor, family: fam };
  }
  if (idef.iconPath) {
    const cached = active.svgCache.get(defId);
    if (cached === "loading" || cached === "fail") return null;
    if (cached) return { kind: "svg", dataUri: cached };
    // lazy 로드
    active.svgCache.set(defId, "loading");
    void loadSvg(active.extId, idef.iconPath, defId);
    return null;
  }
  return null;
}

async function loadSvg(extId: string, iconPath: string, defId: string) {
  const cap = active; // 진입 시점의 테마 캡처 — await 중 테마 전환 시 새 테마 캐시 오염 방지
  if (!window.schutz || !cap) return;
  const rel = joinRel(cap.themeDir, iconPath); // 테마 JSON 기준 상대경로
  const raw = await window.schutz.extReadFile(extId, rel);
  if (active !== cap) return; // 그 사이 테마 전환됨
  if (typeof raw !== "string") { cap.svgCache.set(defId, "fail"); return; }
  const dataUri = "data:image/svg+xml;utf8," + encodeURIComponent(raw);
  cap.svgCache.set(defId, dataUri);
  onChange?.();
}
