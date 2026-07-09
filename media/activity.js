(function () {
  const planEl = document.getElementById("plan");
  const timelineEl = document.getElementById("timeline");
  const usageEl = document.getElementById("usage");
  const tools = new Map();

  function renderPlan(steps) {
    planEl.innerHTML = "";
    if (!steps || steps.length === 0) {
      planEl.innerHTML = '<li class="empty">아직 진행 중인 작업이 없어요.</li>';
      return;
    }
    for (const s of steps) {
      const li = document.createElement("li");
      li.className = s.status;
      const dot = document.createElement("span");
      dot.className = "dot " + s.status;
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = s.title;
      li.appendChild(dot);
      li.appendChild(title);
      planEl.appendChild(li);
    }
  }

  function upsertTool(id, name, meta) {
    let li = tools.get(id);
    if (!li) {
      li = document.createElement("li");
      tools.set(id, li);
      timelineEl.appendChild(li);
    }
    li.innerHTML = "";
    const dot = document.createElement("span");
    dot.className = "dot " + (meta === "result" ? "done" : "active");
    const nm = document.createElement("span");
    nm.className = "name";
    nm.textContent = name || id;
    const mt = document.createElement("span");
    mt.className = "meta";
    mt.textContent = meta === "result" ? "완료" : "실행 중…";
    li.appendChild(dot);
    li.appendChild(nm);
    li.appendChild(mt);
    timelineEl.scrollTop = timelineEl.scrollHeight;
  }

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "plan":
        renderPlan(m.steps);
        break;
      case "tool":
        upsertTool(m.id, m.name, m.phase);
        break;
      case "usage":
        usageEl.textContent =
          `입력 ${m.inputTokens.toLocaleString()} · 출력 ${m.outputTokens.toLocaleString()} 토큰`;
        break;
      case "turn_start":
        tools.clear();
        timelineEl.innerHTML = "";
        break;
    }
  });
})();
