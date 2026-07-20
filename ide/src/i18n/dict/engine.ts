// 위임 엔진이 내보내는 문자열.
//
// 여기 있는 대부분은 UI 가 아니라 **모델에게 돌아가는 도구 결과**다. 엔진은 태그
// (RejectReason / DelegationOutcome)만 돌려주고 산문은 만들지 않는다 — 그래야 4개
// 언어를 지원하면서도 엔진이 순수하게 남는다.
//
// 거절문에는 반드시 "그래서 뭘 하라"가 들어간다. 이유만 알려주고 지시를 안 하면
// 모델이 같은 위임을 그대로 다시 시도한다.
export const dict: Record<string, Record<string, string>> = {
  // ── 위임 프롬프트 씨앗 ───────────────────────────────────────────────
  // 하위 에이전트에게 건너가는 건 이 문자열뿐이다(대화 기록은 안 넘어간다).
  // 조사 결과 하위 에이전트의 컨텍스트 손실은 구조적이고, 여기가 유일한 통로다.
  "engine.seed": {
    ko: "{manager}이(가) 위임한 작업입니다.\n\n{task}",
    en: "This task was delegated to you by {manager}.\n\n{task}",
    de: "Diese Aufgabe wurde Ihnen von {manager} übertragen.\n\n{task}",
    ja: "{manager}から委任された作業です。\n\n{task}",
  },
  "engine.seedContext": {
    ko: "\n\n--- 위임한 에이전트가 지금까지 다룬 것 ---\n{context}",
    en: "\n\n--- What the delegating agent has worked on so far ---\n{context}",
    de: "\n\n--- Woran der delegierende Agent bisher gearbeitet hat ---\n{context}",
    ja: "\n\n--- 委任元エージェントがこれまで扱った内容 ---\n{context}",
  },

  // ── 위임 결과 (라운드 안에서 수집해 모델에게 돌려준다) ────────────────
  "engine.result": {
    ko: "{name}의 작업 결과:\n\n{text}",
    en: "Result from {name}:\n\n{text}",
    de: "Ergebnis von {name}:\n\n{text}",
    ja: "{name}の作業結果:\n\n{text}",
  },
  "engine.resultEmpty": {
    ko: "{name}이(가) 작업을 마쳤지만 텍스트 응답을 내지 않았습니다. 변경 검토에 제안이 있는지 확인하고, 없으면 직접 처리하세요.",
    en: "{name} finished but produced no text response. Check the review panel for proposals; if there are none, handle it yourself.",
    de: "{name} ist fertig, hat aber keine Textantwort geliefert. Prüfen Sie das Änderungs-Panel auf Vorschläge; falls keine vorhanden sind, erledigen Sie es selbst.",
    ja: "{name}は作業を終えましたが、テキスト応答がありませんでした。変更レビューに提案があるか確認し、なければ自分で対応してください。",
  },
  "engine.resultFailed": {
    ko: "{name} 실행이 실패했습니다: {message}\n직접 처리하거나 다른 에이전트에게 맡기세요.",
    en: "{name} failed: {message}\nHandle it yourself or delegate to another agent.",
    de: "{name} ist fehlgeschlagen: {message}\nErledigen Sie es selbst oder delegieren Sie an einen anderen Agenten.",
    ja: "{name}の実行が失敗しました: {message}\n自分で対応するか、別のエージェントに任せてください。",
  },
  // 만료돼도 자식은 계속 돈다 — 제안은 여전히 검토 패널에 도착한다. 그걸 명시한다.
  "engine.resultTimeout": {
    ko: "{name}이(가) {sec}초 안에 끝나지 않았습니다. 작업은 계속 진행 중이며 결과는 변경 검토에 나타납니다. 이 결과를 기다리지 말고 진행하세요.",
    en: "{name} did not finish within {sec}s. The work is still running and its results will appear in the review panel. Continue without waiting for it.",
    de: "{name} wurde nicht innerhalb von {sec}s fertig. Die Arbeit läuft weiter und die Ergebnisse erscheinen im Änderungs-Panel. Fahren Sie fort, ohne darauf zu warten.",
    ja: "{name}は{sec}秒以内に終わりませんでした。作業は継続中で、結果は変更レビューに表示されます。これを待たずに進めてください。",
  },
  "engine.resultAborted": {
    ko: "{name} 실행이 중지되었습니다.",
    en: "{name} was stopped.",
    de: "{name} wurde gestoppt.",
    ja: "{name}の実行は停止されました。",
  },

  // ── 거절 사유 ────────────────────────────────────────────────────────
  "engine.reject.unknown-agent": {
    ko: "위임 거절: '{target}'은(는) 알 수 없는 에이전트입니다. 위임 가능한 에이전트: {roster}. 이 중에서 고르거나 직접 처리하세요.",
    en: "Delegation rejected: '{target}' is not a known agent. Available agents: {roster}. Pick one of those or handle it yourself.",
    de: "Delegation abgelehnt: „{target}“ ist kein bekannter Agent. Verfügbare Agenten: {roster}. Wählen Sie einen davon oder erledigen Sie es selbst.",
    ja: "委任は拒否されました: 「{target}」は不明なエージェントです。委任可能なエージェント: {roster}。この中から選ぶか、自分で対応してください。",
  },
  "engine.reject.self-delegation": {
    ko: "위임 거절: 자기 자신에게는 위임할 수 없습니다. 이 작업은 직접 처리하세요.",
    en: "Delegation rejected: you cannot delegate to yourself. Handle this task directly.",
    de: "Delegation abgelehnt: Sie können nicht an sich selbst delegieren. Erledigen Sie diese Aufgabe direkt.",
    ja: "委任は拒否されました: 自分自身には委任できません。この作業は自分で対応してください。",
  },
  "engine.reject.not-configured": {
    ko: "위임 거절: {name}이(가) 연결되어 있지 않습니다(API 키 없음). 이 작업은 직접 처리하세요.",
    en: "Delegation rejected: {name} is not connected (no API key). Handle this task directly.",
    de: "Delegation abgelehnt: {name} ist nicht verbunden (kein API-Schlüssel). Erledigen Sie diese Aufgabe direkt.",
    ja: "委任は拒否されました: {name}は接続されていません(APIキーなし)。この作業は自分で対応してください。",
  },
  "engine.reject.agent-busy": {
    ko: "위임 거절: {name}이(가) 이미 다른 작업을 진행 중입니다. 이 작업은 직접 처리하세요.",
    en: "Delegation rejected: {name} is already working on another task. Handle this task directly.",
    de: "Delegation abgelehnt: {name} arbeitet bereits an einer anderen Aufgabe. Erledigen Sie diese Aufgabe direkt.",
    ja: "委任は拒否されました: {name}はすでに別の作業を進めています。この作業は自分で対応してください。",
  },
  "engine.reject.depth-exceeded": {
    ko: "위임 거절: 위임받은 작업은 다시 위임할 수 없습니다. 직접 처리하세요.",
    en: "Delegation rejected: a delegated task cannot be delegated onward. Handle it yourself.",
    de: "Delegation abgelehnt: Eine delegierte Aufgabe kann nicht weiterdelegiert werden. Erledigen Sie sie selbst.",
    ja: "委任は拒否されました: 委任された作業をさらに委任することはできません。自分で対応してください。",
  },
  "engine.reject.per-turn-cap": {
    ko: "위임 거절: 한 번에 위임할 수 있는 최대 개수({max})에 도달했습니다. 지금 맡긴 작업들의 결과를 받은 뒤 다시 시도하세요.",
    en: "Delegation rejected: you have reached the limit of {max} delegations at once. Wait for the current ones to return, then try again.",
    de: "Delegation abgelehnt: Das Limit von {max} gleichzeitigen Delegationen ist erreicht. Warten Sie auf die laufenden Ergebnisse und versuchen Sie es erneut.",
    ja: "委任は拒否されました: 一度に委任できる上限({max}件)に達しました。現在の作業の結果を受け取ってから再試行してください。",
  },
  "engine.reject.concurrency-cap": {
    ko: "위임 거절: 동시에 진행할 수 있는 위임 개수({max})에 도달했습니다. 진행 중인 작업이 끝난 뒤 다시 시도하세요.",
    en: "Delegation rejected: the limit of {max} concurrent delegations is reached. Try again once the running ones finish.",
    de: "Delegation abgelehnt: Das Limit von {max} gleichzeitigen Delegationen ist erreicht. Versuchen Sie es erneut, wenn die laufenden beendet sind.",
    ja: "委任は拒否されました: 同時に進行できる委任数の上限({max}件)に達しました。進行中の作業が終わってから再試行してください。",
  },
  "engine.reject.duplicate-target": {
    ko: "위임 거절: 이번 턴에 {name}에게 이미 위임했습니다. 한 에이전트에게는 한 번에 하나씩 맡기세요.",
    en: "Delegation rejected: you already delegated to {name} this turn. Give one agent one task at a time.",
    de: "Delegation abgelehnt: Sie haben in diesem Zug bereits an {name} delegiert. Geben Sie einem Agenten jeweils nur eine Aufgabe.",
    ja: "委任は拒否されました: 今回のターンですでに{name}へ委任しています。1エージェントにつき1件ずつ任せてください。",
  },
  "engine.reject.cycle": {
    ko: "위임 거절: {name}은(는) 이 작업을 맡긴 상위 에이전트입니다. 되돌려 위임할 수 없습니다.",
    en: "Delegation rejected: {name} is the agent that delegated this task to you. You cannot delegate back to it.",
    de: "Delegation abgelehnt: {name} ist der Agent, der Ihnen diese Aufgabe übertragen hat. Eine Rückdelegation ist nicht möglich.",
    ja: "委任は拒否されました: {name}はこの作業を委任した上位エージェントです。差し戻す形での委任はできません。",
  },

  // ── 도구 칩 표시 ─────────────────────────────────────────────────────
  "engine.noteRejected": {
    ko: "거절됨",
    en: "Rejected",
    de: "Abgelehnt",
    ja: "拒否",
  },
  "engine.noteTimeout": {
    ko: "시간 초과",
    en: "Timed out",
    de: "Zeitüberschreitung",
    ja: "タイムアウト",
  },
  "engine.noteFailed": {
    ko: "실패",
    en: "Failed",
    de: "Fehlgeschlagen",
    ja: "失敗",
  },
  // 중지로 도구 결과가 비면 벤더 규약(tool_use 1개당 tool_result 1개)이 깨진다.
  // 빈 칸을 이 문자열로 채운다.
  "engine.notRun": {
    ko: "중지되어 실행되지 않았습니다.",
    en: "Not executed — the run was stopped.",
    de: "Nicht ausgeführt — der Lauf wurde gestoppt.",
    ja: "停止されたため実行されませんでした。",
  },
};
