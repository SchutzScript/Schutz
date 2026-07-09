(function () {
  const vscode = acquireVsCodeApi();
  const grid = document.getElementById("grid");

  document.getElementById("acceptAll").addEventListener("click", () =>
    vscode.postMessage({ type: "acceptAll" }),
  );
  document.getElementById("rejectAll").addEventListener("click", () =>
    vscode.postMessage({ type: "rejectAll" }),
  );

  function render(cards) {
    grid.innerHTML = "";
    if (!cards || cards.length === 0) {
      grid.innerHTML = '<div class="empty">대기 중인 변경이 없어요.</div>';
      return;
    }
    for (const c of cards) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<span class="badge">' + c.status + "</span>" +
        '<div class="file"></div>' +
        '<div class="counts"><span class="add">+' + c.added +
        '</span><span class="rem">-' + c.removed + "</span></div>" +
        '<div class="row">' +
        '<button class="btn primary" data-accept>수락</button>' +
        '<button class="btn ghost" data-reject>거절</button></div>';
      card.querySelector(".file").textContent = c.file;

      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        vscode.postMessage({ type: "open", file: c.file });
      });
      card.querySelector("[data-accept]").addEventListener("click", () =>
        vscode.postMessage({ type: "accept", txId: c.txId }),
      );
      card.querySelector("[data-reject]").addEventListener("click", () =>
        vscode.postMessage({ type: "reject", txId: c.txId }),
      );
      grid.appendChild(card);
    }
  }

  window.addEventListener("message", (event) => {
    const m = event.data;
    if (m.type === "render") render(m.cards);
  });
})();
