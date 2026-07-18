// Content-Length 헤더 프레이밍 (LSP·DAP 공용). stdout 청크 재조립 + 메시지 프레임 생성.
function makeParser(onMessage) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buf.slice(0, headerEnd).toString("utf8");
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) { buf = buf.slice(headerEnd + 4); continue; }
      const len = parseInt(m[1], 10);
      const start = headerEnd + 4;
      if (buf.length < start + len) return; // 본문 미완성
      const body = buf.slice(start, start + len).toString("utf8");
      buf = buf.slice(start + len);
      try { onMessage(JSON.parse(body)); } catch { /* 손상 프레임 무시 */ }
    }
  };
}

function frame(message) {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from("Content-Length: " + json.length + "\r\n\r\n", "utf8"), json]);
}

module.exports = { makeParser, frame };
