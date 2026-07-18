// LSP 서버 호스트 — 언어 서버를 spawn하고 stdio JSON-RPC(Content-Length 프레임)를 렌더러 IPC로 브리지.
const crypto = require("crypto");
const { registry } = require("./lspRegistry.cjs");

const servers = new Map(); // serverId → { child, buffer, senderId }

/** Content-Length 헤더 프레이밍 파서 — stdout 청크를 재조립해 완전한 JSON 메시지를 뽑는다 */
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
      if (buf.length < start + len) return; // 아직 본문 미완성
      const body = buf.slice(start, start + len).toString("utf8");
      buf = buf.slice(start + len);
      try { onMessage(JSON.parse(body)); } catch { /* 손상 프레임 무시 */ }
    }
  };
}

function frame(message) {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, "utf8"), json]);
}

function init(ipcMain) {
  ipcMain.handle("schutz:lspLanguages", () => {
    const reg = registry();
    return Object.keys(reg).filter(k => reg[k].available);
  });

  ipcMain.handle("schutz:lspStart", (e, { languageId, root }) => {
    const reg = registry();
    const desc = reg[languageId];
    if (!desc || !desc.available) return { ok: false, reason: "binary-absent" };
    let child;
    try { child = desc.run(root); } catch (err) { return { ok: false, reason: String(err && err.message || err) }; }
    const serverId = "lsp_" + crypto.randomBytes(6).toString("hex");
    const senderId = e.sender.id;
    const parser = makeParser((msg) => {
      if (!e.sender.isDestroyed()) e.sender.send("schutz:lspMessage", serverId, msg);
    });
    child.stdout.on("data", parser);
    child.stderr.on("data", (d) => { if (!e.sender.isDestroyed()) e.sender.send("schutz:lspLog", serverId, d.toString()); });
    child.on("exit", (code) => {
      servers.delete(serverId);
      if (!e.sender.isDestroyed()) e.sender.send("schutz:lspExit", serverId, code);
    });
    child.on("error", () => { servers.delete(serverId); });
    servers.set(serverId, { child, senderId, languageId });
    return { ok: true, serverId };
  });

  ipcMain.on("schutz:lspSend", (_e, serverId, message) => {
    const s = servers.get(serverId);
    if (s && s.child.stdin.writable) { try { s.child.stdin.write(frame(message)); } catch { /* 종료됨 */ } }
  });

  ipcMain.on("schutz:lspStop", (_e, serverId) => {
    const s = servers.get(serverId);
    if (s) { try { s.child.kill(); } catch { /* */ } servers.delete(serverId); }
  });

  // 창 파기 시 해당 창의 서버 정리
  const { app } = require("electron");
  app.on("web-contents-created", (_e, wc) => {
    wc.on("destroyed", () => {
      for (const [id, s] of [...servers.entries()]) {
        if (s.senderId === wc.id) { try { s.child.kill(); } catch { /* */ } servers.delete(id); }
      }
    });
  });
}

module.exports = { init };
