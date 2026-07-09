(function () {
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById("messages");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const cancel = document.getElementById("cancel");
  const status = document.getElementById("status");

  let streamingEl = null;

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    addMessage("user", text);
    input.value = "";
    streamingEl = addMessage("assistant", "");
    streamingEl.classList.add("streaming");
    vscode.postMessage({ type: "submit", text });
  }

  send.addEventListener("click", submit);
  cancel.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "assistant_text":
        if (!streamingEl) {
          streamingEl = addMessage("assistant", "");
          streamingEl.classList.add("streaming");
        }
        streamingEl.textContent = m.full;
        messages.scrollTop = messages.scrollHeight;
        break;
      case "status":
        status.textContent = m.text;
        break;
      case "turn_start":
        cancel.hidden = false;
        send.disabled = true;
        break;
      case "turn_end":
        cancel.hidden = true;
        send.disabled = false;
        if (streamingEl) streamingEl.classList.remove("streaming");
        streamingEl = null;
        break;
      case "error":
        addMessage("assistant", "⚠️ " + m.message);
        break;
    }
  });
})();
