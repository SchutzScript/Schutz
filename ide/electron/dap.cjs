// 디버그 어댑터 호스트 — DAP 어댑터를 spawn하고 stdio(Content-Length 프레임)를 렌더러 IPC로 브리지.
// lsp.cjs 구조 미러. DAP 메시지는 seq/type(request|response|event) 기반.
const crypto = require("crypto");
const { registry } = require("./dapRegistry.cjs");
const { makeParser, frame } = require("./jsonrpcFraming.cjs");

const adapters = new Map(); // sessionId → { child, senderId }

function init(ipcMain) {
  ipcMain.handle("schutz:dapLanguages", () => {
    const reg = registry();
    return Object.keys(reg).map(k => ({ languageId: k, available: reg[k].available, reason: reg[k].reason || "" }));
  });

  ipcMain.handle("schutz:dapStart", (e, { languageId }) => {
    const reg = registry();
    const desc = reg[languageId];
    if (!desc) return { ok: false, reason: "지원하지 않는 언어: " + languageId };
    if (!desc.available) return { ok: false, reason: desc.reason || "어댑터 사용 불가" };
    let child;
    try { child = desc.run(); } catch (err) { return { ok: false, reason: String(err && err.message || err) }; }
    const sessionId = "dap_" + crypto.randomBytes(6).toString("hex");
    const parser = makeParser((msg) => { if (!e.sender.isDestroyed()) e.sender.send("schutz:dapMessage", sessionId, msg); });
    child.stdout.on("data", parser);
    child.stderr.on("data", (d) => { if (!e.sender.isDestroyed()) e.sender.send("schutz:dapLog", sessionId, d.toString()); });
    child.on("exit", (code) => { adapters.delete(sessionId); if (!e.sender.isDestroyed()) e.sender.send("schutz:dapExit", sessionId, code); });
    child.on("error", () => { adapters.delete(sessionId); });
    adapters.set(sessionId, { child, senderId: e.sender.id });
    return { ok: true, sessionId };
  });

  ipcMain.on("schutz:dapSend", (_e, sessionId, message) => {
    const a = adapters.get(sessionId);
    if (a && a.child.stdin.writable) { try { a.child.stdin.write(frame(message)); } catch { /* 종료됨 */ } }
  });

  ipcMain.on("schutz:dapStop", (_e, sessionId) => {
    const a = adapters.get(sessionId);
    if (a) { try { a.child.kill(); } catch { /* */ } adapters.delete(sessionId); }
  });

  const { app } = require("electron");
  app.on("web-contents-created", (_e, wc) => {
    wc.on("destroyed", () => {
      for (const [sid, a] of [...adapters.entries()]) {
        if (a.senderId === wc.id) { try { a.child.kill(); } catch { /* */ } adapters.delete(sid); }
      }
    });
  });
}

module.exports = { init };
