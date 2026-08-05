// 이 바이트들을 텍스트 편집기에 실어도 되는가 — **순수한 판정**.
//
// readFile 이 무조건 fs.readFile(abs, "utf8") 이었다. UTF-8 이 아닌 파일은 디코딩에서
// 깨진 글자(U+FFFD)로 바뀌고, 그 상태로 저장하면 **원본이 파괴된다.** 되돌릴 방법이
// 없다.
//
// 실제로 재현했다. UTF-16 파일은 열고 Ctrl+S 만 눌러도 16바이트가 20바이트가 됐다.
// CP949 로 저장된 한글 파일은 화면에 `// �ȳ� ����` 로 뜨고, 거기서 한 글자만 고쳐
// 저장하면 파일 전체가 사라진다. 윈도우에서 아주 흔한 인코딩이다.
//
// 다른 인코딩을 **읽어 주는 것**은 기능이고, 조용히 부수지 않는 것은 그 전에 지켜야
// 할 일이다. 그래서 지금은 판정만 하고, 아니면 열지 않고 이유를 말한다.

/**
 * @returns null 이면 UTF-8 텍스트로 안전하다. 아니면 왜 아닌지.
 *   "utf16le" | "utf16be" — 바이트 순서 표식이 붙은 UTF-16
 *   "binary"   — NUL 바이트가 있다(텍스트가 아니다)
 *   "not-utf8" — UTF-8 로 해석되지 않는 바이트가 있다(CP949·Shift-JIS·Latin-1 …)
 */
function detect(buf) {
  if (!buf || typeof buf.length !== "number") return null;
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return "utf16le";
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return "utf16be";
  // NUL 은 텍스트 파일에 있을 이유가 없다. UTF-16 은 위에서 걸렀으므로 여기 오는
  // NUL 은 진짜 바이너리다(확장자만 텍스트인 파일이 흔하다).
  if (buf.indexOf(0) >= 0) return "binary";
  // 왕복시켜 본다 — 디코딩이 손실 없이 됐다면 다시 인코딩한 바이트가 같아야 한다.
  // 깨진 바이트는 U+FFFD 로 바뀌므로 길이부터 달라진다.
  const round = Buffer.from(buf.toString("utf8"), "utf8");
  return round.equals(buf) ? null : "not-utf8";
}

/** IPC 로 넘길 오류 메시지. 렌더러가 앞부분을 보고 안내 문구를 고른다. */
const PREFIX = "SCHUTZ_ENCODING:";
function errorFor(kind) { return PREFIX + kind; }
function kindOf(message) {
  const s = String(message || "");
  const i = s.indexOf(PREFIX);
  return i < 0 ? null : s.slice(i + PREFIX.length).trim().split(/\s/)[0];
}

module.exports = { detect, errorFor, kindOf, PREFIX };
