// orch 도메인 — 작업 그래프(delegate_graph) 가 모델에게 돌려주는 말.
//
// 여기 문구는 전부 **모델이 읽는다**. 그래서 화면 문구보다 더 곧이곧대로 써야 한다:
// 무엇이 안 됐고 왜 안 됐는지가 빠지면 모델이 성공한 것만 요약하고, 사용자는
// 나머지가 됐는지 안 됐는지 모른 채로 남는다.
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  // 패널 — 이쪽은 사람이 읽는다.
  "orch.panelLabel": { ko: "작업 그래프", en: "TASK GRAPH", de: "AUFGABENGRAPH", ja: "タスクグラフ" },
  "orch.panelCount": { ko: "{done}/{total}", en: "{done}/{total}", de: "{done}/{total}", ja: "{done}/{total}" },
  "orch.panelThen": { ko: "앞이 끝나면", en: "then", de: "danach", ja: "その後" },
  "orch.panelBlocked": { ko: "'{dep}' 에 막힘", en: "blocked by '{dep}'", de: "durch '{dep}' blockiert", ja: "'{dep}' で止まった" },
  "orch.panelNoResult": { ko: "결과 없음", en: "no result", de: "kein Ergebnis", ja: "結果なし" },

  "orch.noTasks": {
    ko: "작업 목록이 비어 있어 아무것도 맡기지 않았습니다. tasks 에 최소 한 개를 넣으세요.",
    en: "The task list was empty, so nothing was delegated. Put at least one entry in tasks.",
    de: "Die Aufgabenliste war leer — es wurde nichts delegiert. Mindestens ein Eintrag in tasks ist nötig.",
    ja: "タスク一覧が空だったため何も委任していません。tasks に最低 1 件入れてください。",
  },
  "orch.tooMany": {
    ko: "작업이 {n}개라 한 번에 맡기지 않았습니다. 한 판에 최대 {max}개까지입니다 — 나눠서 올리세요.",
    en: "{n} tasks is too many to run at once; the limit is {max} per graph. Split them across calls.",
    de: "{n} Aufgaben sind zu viele für einen Durchlauf; das Limit liegt bei {max}. Auf mehrere Aufrufe aufteilen.",
    ja: "タスクが {n} 件で一度に実行できません。1 回あたり最大 {max} 件です — 分けて送ってください。",
  },
  "orch.badGraph": {
    ko: "작업 그래프가 성립하지 않아 아무것도 시작하지 않았습니다 — {why}",
    en: "The task graph does not hold together, so nothing was started — {why}",
    de: "Der Aufgabengraph ist nicht schlüssig — es wurde nichts gestartet: {why}",
    ja: "タスクグラフが成立しないため何も開始していません — {why}",
  },
  "orch.errCycle": {
    ko: "의존이 서로를 물고 돕니다: {ids}. 이 중 하나에서 needs 를 끊으세요.",
    en: "the dependencies form a loop: {ids}. Break needs on one of them.",
    de: "die Abhängigkeiten bilden einen Zyklus: {ids}. needs bei einer davon auflösen.",
    ja: "依存が循環しています: {ids}。どれか 1 つの needs を外してください。",
  },
  "orch.errUnknownDep": {
    ko: "'{id}' 이(가) '{dep}' 을(를) 기다리는데 그런 작업이 목록에 없습니다.",
    en: "'{id}' waits on '{dep}', but there is no such task in the list.",
    de: "'{id}' wartet auf '{dep}', doch diese Aufgabe steht nicht in der Liste.",
    ja: "'{id}' が '{dep}' を待っていますが、そのタスクは一覧にありません。",
  },
  "orch.errSelfDep": { ko: "'{id}' 이(가) 자기 자신을 기다립니다.", en: "'{id}' waits on itself.", de: "'{id}' wartet auf sich selbst.", ja: "'{id}' が自分自身を待っています。" },
  "orch.errDupId": { ko: "id '{id}' 이(가) 두 번 나옵니다. 서로 다른 이름을 쓰세요.", en: "the id '{id}' appears twice. Use distinct names.", de: "die id '{id}' kommt zweimal vor. Eindeutige Namen verwenden.", ja: "id '{id}' が 2 回あります。別々の名前にしてください。" },
  "orch.errEmptyId": { ko: "{at}번째 작업에 id 가 없습니다.", en: "task number {at} has no id.", de: "Aufgabe Nr. {at} hat keine id.", ja: "{at} 番目のタスクに id がありません。" },

  // 앞선 작업의 답을 하위에게 넘길 때.
  "orch.priorBlock": {
    ko: "\n\n먼저 끝난 작업들의 결과입니다. 이것을 전제로 삼으세요:\n\n{prior}",
    en: "\n\nResults from the tasks that ran before this one. Treat them as given:\n\n{prior}",
    de: "\n\nErgebnisse der zuvor gelaufenen Aufgaben. Als gegeben behandeln:\n\n{prior}",
    ja: "\n\n先に終わったタスクの結果です。これを前提にしてください:\n\n{prior}",
  },
  "orch.priorOne": { ko: "[{id}]\n{text}", en: "[{id}]\n{text}", de: "[{id}]\n{text}", ja: "[{id}]\n{text}" },
  "orch.priorEmpty": {
    ko: "(이 작업은 끝났지만 아무 결과도 내지 않았습니다. 결과가 있는 것처럼 짐작하지 마세요.)",
    en: "(This task finished but produced no result. Do not assume one.)",
    de: "(Diese Aufgabe endete ohne Ergebnis. Kein Ergebnis annehmen.)",
    ja: "(このタスクは終了しましたが結果を出していません。あるものとして推測しないでください。)",
  },

  // 한 판의 결과.
  "orch.head": {
    ko: "작업 그래프 {total}개 중 {done}개가 결과를 냈습니다. 아래에 전부 적습니다 — 안 된 것을 빼고 요약하지 마세요.",
    en: "Of {total} tasks in the graph, {done} produced a result. Everything is listed below — do not summarize away the ones that did not.",
    de: "Von {total} Aufgaben im Graphen lieferten {done} ein Ergebnis. Alles ist unten aufgeführt — die gescheiterten nicht weglassen.",
    ja: "グラフの {total} 件のうち {done} 件が結果を出しました。以下に全件記します — できなかったものを省いて要約しないでください。",
  },
  "orch.lineDone": { ko: "[{id}] {agent} — 완료\n{text}", en: "[{id}] {agent} — done\n{text}", de: "[{id}] {agent} — fertig\n{text}", ja: "[{id}] {agent} — 完了\n{text}" },
  "orch.lineEmpty": {
    ko: "[{id}] {agent} — 돌았지만 결과가 없습니다. 완료로 세지 마세요.",
    en: "[{id}] {agent} — ran but returned nothing. Do not count it as done.",
    de: "[{id}] {agent} — lief, lieferte aber nichts. Nicht als erledigt zählen.",
    ja: "[{id}] {agent} — 実行しましたが結果はありません。完了に数えないでください。",
  },
  "orch.lineFailed": { ko: "[{id}] {agent} — 실패: {why}", en: "[{id}] {agent} — failed: {why}", de: "[{id}] {agent} — fehlgeschlagen: {why}", ja: "[{id}] {agent} — 失敗: {why}" },
  "orch.lineAborted": { ko: "[{id}] {agent} — 중단됨", en: "[{id}] {agent} — stopped", de: "[{id}] {agent} — abgebrochen", ja: "[{id}] {agent} — 中断されました" },
  "orch.lineSkipFailed": {
    ko: "[{id}] {agent} — 시작 못 함: 기다리던 '{dep}' 이(가) 실패했습니다.",
    en: "[{id}] {agent} — never started: '{dep}', which it waited on, failed.",
    de: "[{id}] {agent} — nie gestartet: '{dep}', worauf es wartete, schlug fehl.",
    ja: "[{id}] {agent} — 開始できず: 待っていた '{dep}' が失敗しました。",
  },
  "orch.lineSkipAborted": {
    ko: "[{id}] {agent} — 시작 못 함: 기다리던 '{dep}' 이(가) 중단됐습니다.",
    en: "[{id}] {agent} — never started: '{dep}', which it waited on, was stopped.",
    de: "[{id}] {agent} — nie gestartet: '{dep}', worauf es wartete, wurde abgebrochen.",
    ja: "[{id}] {agent} — 開始できず: 待っていた '{dep}' が中断されました。",
  },
  "orch.lineSkipBlocked": {
    ko: "[{id}] {agent} — 시작 못 함: 기다리던 '{dep}' 이(가) 앞의 실패에 막혔습니다.",
    en: "[{id}] {agent} — never started: '{dep}', which it waited on, was itself blocked.",
    de: "[{id}] {agent} — nie gestartet: '{dep}', worauf es wartete, war selbst blockiert.",
    ja: "[{id}] {agent} — 開始できず: 待っていた '{dep}' 自体が前の失敗で止まりました。",
  },
  "orch.lineOpen": {
    ko: "[{id}] {agent} — 끝내 돌지 못했습니다. 그 에이전트가 이 그래프 밖의 일로 계속 바빴습니다.",
    en: "[{id}] {agent} — never got to run: that agent stayed busy with work outside this graph.",
    de: "[{id}] {agent} — kam nie zum Laufen: dieser Agent war mit Arbeit außerhalb dieses Graphen belegt.",
    ja: "[{id}] {agent} — 実行できませんでした: そのエージェントがこのグラフ外の作業で塞がっていました。",
  },
};
