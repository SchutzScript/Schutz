// VS Code JSON(JSONC) — 주석(//, /* */)과 trailing comma 허용. 문자열 안의 //·/* 는 보존한다.
// 순진한 정규식(예: "a // b")이 문자열 값을 잘라버리는 버그를 피하기 위한 상태 머신 구현.
export function stripJsonComments(s: string): string {
  let out = "";
  let inStr = false, inBlock = false, inLine = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (inLine) { if (c === "\n") { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1"); // trailing comma 제거
}

/** JSONC 파싱 — 실패 시 null */
export function parseJsonc(raw: string): any | null {
  try { return JSON.parse(stripJsonComments(raw)); } catch { return null; }
}
