// flowtree 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "flowtree.emptyState": { ko: "요청을 보내면 계획과 실행 과정이 이곳에 기록됩니다.", en: "Send a request and the plan and execution steps will appear here.", de: "Senden Sie eine Anfrage, und der Plan sowie die Ausführungsschritte werden hier angezeigt.", ja: "リクエストを送信すると、計画と実行の過程がここに記録されます。" },
  "flowtree.planLabel": { ko: "계획", en: "Plan", de: "Plan", ja: "計画" },
  "flowtree.planAuthor": { ko: "Claude · 관리자", en: "Claude · Admin", de: "Claude · Administrator", ja: "Claude · 管理者" },
  "flowtree.done": { ko: "완료", en: "Done", de: "Fertig", ja: "完了" },
  "flowtree.noProject": { ko: "아직 열린 프로젝트가 없습니다.", en: "No project is open yet.", de: "Noch kein Projekt geöffnet.", ja: "まだ開いているプロジェクトはありません。" },
  "flowtree.openProject": { ko: "프로젝트 열기…", en: "Open project…", de: "Projekt öffnen…", ja: "プロジェクトを開く…" },
  "flowtree.truncated": { ko: "… 항목이 많아 일부만 표시합니다", en: "… too many items, showing only some", de: "… zu viele Einträge, es wird nur ein Teil angezeigt", ja: "… 項目が多いため一部のみ表示しています" },
};
