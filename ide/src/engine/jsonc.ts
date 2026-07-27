// 주석과 뒤따르는 쉼표가 섞인 JSON(JSONC) 읽기 — tsconfig.json 이 거의 늘 그렇다.
//
// 정규식으로 대충 벗기려다 실패했다. `/\/\*[\s\S]*?\*\//` 는 문자열 안을 못 보는데,
// 경로 별칭은 하필 **"@/*"** 처럼 생겼다. 그래서 별칭 설정을 읽을 때마다 `/*` 를
// 주석 시작으로 알고 파일 절반을 지워 버렸다 — 별칭이 있는 프로젝트에서만, 조용히.
//
// 그래서 글자를 하나씩 훑는다. 느리지만 tsconfig 는 몇 KB 다.

/** 주석·뒤따르는 쉼표를 걷어낸다. 문자열 안의 `//` `/*` 는 건드리지 않는다. */
export function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      // 문자열은 통째로 옮긴다 — 이 안에서는 주석이 없다.
      out += c; i++;
      while (i < n) {
        const d = text[i];
        out += d; i++;
        if (d === "\\") { if (i < n) { out += text[i]; i++; } continue; }
        if (d === '"') break;
      }
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;                       // 줄바꿈은 남긴다(다음 반복에서 그대로 복사)
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      out += " ";                     // 토큰이 붙어 버리지 않게 한 칸
      continue;
    }
    out += c; i++;
  }
  return dropTrailingCommas(out);
}

/** `,` 다음에 닫는 괄호만 오면 그 쉼표를 지운다. 여기서도 문자열 안은 건너뛴다. */
function dropTrailingCommas(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      out += c; i++;
      while (i < n) {
        const d = text[i];
        out += d; i++;
        if (d === "\\") { if (i < n) { out += text[i]; i++; } continue; }
        if (d === '"') break;
      }
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") { i++; continue; }  // 버린다
    }
    out += c; i++;
  }
  return out;
}

/** 못 읽으면 null. 부르는 쪽이 기본값으로 조용히 넘어갈 수 있어야 한다. */
export function parseJsonc(text: string): any {
  try { return JSON.parse(stripJsonc(text)); } catch { return null; }
}
