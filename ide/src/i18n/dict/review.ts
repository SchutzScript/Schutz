// 자동 리뷰 — 변경 diff 를 독립 패스로 적대적으로 점검한 결과.
// 발견(Finding)은 조언이라 닫을 수 있고, 편집 패치를 든 제안(Proposal)과 분리해 둔다.
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "review.button": { ko: "변경 리뷰", en: "Review changes", de: "Änderungen prüfen", ja: "変更をレビュー" },
  "review.title": { ko: "리뷰 결과", en: "Review findings", de: "Prüfungsbefunde", ja: "レビュー結果" },
  "review.running": { ko: "변경을 리뷰하는 중…", en: "Reviewing changes…", de: "Änderungen werden geprüft…", ja: "変更をレビュー中…" },
  "review.empty": { ko: "짚을 만한 것이 없습니다.", en: "Nothing to flag.", de: "Nichts zu beanstanden.", ja: "指摘事項はありません。" },
  "review.noDiff": { ko: "리뷰할 변경이 없습니다.", en: "No changes to review.", de: "Keine Änderungen zum Prüfen.", ja: "レビューする変更がありません。" },
  "review.parseFailed": { ko: "리뷰를 완료하지 못했습니다 — 그대로 진행합니다.", en: "Review could not complete — proceeding anyway.", de: "Prüfung nicht abgeschlossen — es wird fortgefahren.", ja: "レビューを完了できませんでした — そのまま進めます。" },
  "review.truncated": { ko: "변경이 커서 일부만 리뷰했습니다.", en: "Change was large — only part was reviewed.", de: "Änderung war groß — nur ein Teil wurde geprüft.", ja: "変更が大きいため一部のみレビューしました。" },
  "review.dismiss": { ko: "닫기", en: "Dismiss", de: "Verwerfen", ja: "閉じる" },
  "review.sevHigh": { ko: "높음", en: "High", de: "Hoch", ja: "高" },
  "review.sevMed": { ko: "보통", en: "Medium", de: "Mittel", ja: "中" },
  "review.sevLow": { ko: "낮음", en: "Low", de: "Niedrig", ja: "低" },
  "review.foundN": { ko: "짚은 것 {n}개", en: "{n} flagged", de: "{n} markiert", ja: "{n} 件指摘" },
  // 커밋 전 게이트
  "review.gateTitle": { ko: "커밋 전 리뷰에서 {n}개를 짚었습니다", en: "Pre-commit review flagged {n}", de: "Prüfung vor dem Commit markierte {n}", ja: "コミット前レビューで {n} 件指摘" },
  "review.proceedAnyway": { ko: "그대로 커밋", en: "Commit anyway", de: "Trotzdem committen", ja: "そのままコミット" },
  "review.cancelCommit": { ko: "커밋 취소", en: "Cancel commit", de: "Commit abbrechen", ja: "コミット中止" },
  "review.commitBlocked": { ko: "커밋을 취소했습니다.", en: "Commit cancelled.", de: "Commit abgebrochen.", ja: "コミットを中止しました。" },
  "review.onCommit": { ko: "커밋 전 자동 리뷰", en: "Review before commit", de: "Vor dem Commit prüfen", ja: "コミット前に自動レビュー" },
  "review.onCommitHint": { ko: "커밋할 때 변경을 먼저 리뷰해 문제를 짚어 줍니다. 끌 수 있습니다.", en: "Reviews staged changes before each commit and flags issues. Can be turned off.", de: "Prüft vorgemerkte Änderungen vor jedem Commit und meldet Probleme. Abschaltbar.", ja: "コミット時に変更を先にレビューして問題を指摘します。オフにできます。" },
};
