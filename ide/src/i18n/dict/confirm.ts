// confirm 도메인 — 인앱 확인 모달의 공통 문구
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "confirm.cancel": { ko: "취소", en: "Cancel", de: "Abbrechen", ja: "キャンセル" },
  "confirm.deleteTitle": { ko: "삭제할까요?", en: "Delete?", de: "Löschen?", ja: "削除しますか？" },
  "confirm.deleteOk": { ko: "삭제", en: "Delete", de: "Löschen", ja: "削除" },
  "confirm.discardTitle": { ko: "변경을 버릴까요?", en: "Discard changes?", de: "Änderungen verwerfen?", ja: "変更を破棄しますか？" },
  "confirm.discardOk": { ko: "버리기", en: "Discard", de: "Verwerfen", ja: "破棄" },
  "confirm.stashDropTitle": { ko: "감춰둔 변경을 버릴까요?", en: "Drop this stash?", de: "Stash verwerfen?", ja: "スタッシュを破棄しますか？" },
  "confirm.stashDropOk": { ko: "버리기", en: "Drop", de: "Verwerfen", ja: "破棄" },
  "confirm.amendTitle": { ko: "이미 올라간 커밋을 고칩니다", en: "Amending a pushed commit", de: "Bereits gepushten Commit ändern", ja: "プッシュ済みのコミットを修正します" },
  "confirm.amendOk": { ko: "계속", en: "Continue", de: "Fortfahren", ja: "続行" },
  "confirm.replaceTitle": { ko: "전체 치환할까요?", en: "Replace across all files?", de: "In allen Dateien ersetzen?", ja: "すべて置換しますか？" },
  "confirm.replaceOk": { ko: "치환", en: "Replace", de: "Ersetzen", ja: "置換" },
  "confirm.overwriteTitle": { ko: "디스크가 그 사이 바뀌었습니다", en: "The file changed on disk", de: "Die Datei wurde auf der Festplatte geändert", ja: "ディスク上でファイルが変更されました" },
  "confirm.overwriteOk": { ko: "덮어쓰기", en: "Overwrite", de: "Überschreiben", ja: "上書き" },
};
