// mono 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "mono.breakpoint": { ko: "브레이크포인트", en: "Breakpoint", de: "Haltepunkt", ja: "ブレークポイント" },
  "mono.inlineEditLines": { ko: "인라인 편집 · {n}줄 선택됨", en: "Inline edit · {n} lines selected", de: "Inline-Bearbeitung · {n} Zeilen ausgewählt", ja: "インライン編集 · {n}行選択中" },
  "mono.inlinePlaceholder": { ko: "이 코드를 어떻게 바꿀까요? (예: 에러 처리 추가)", en: "How should this code change? (e.g. add error handling)", de: "Wie soll dieser Code geändert werden? (z. B. Fehlerbehandlung hinzufügen)", ja: "このコードをどう変更しますか？（例: エラー処理を追加）" },
  "mono.edit": { ko: "편집", en: "Edit", de: "Bearbeiten", ja: "編集" },
  "mono.cancel": { ko: "취소", en: "Cancel", de: "Abbrechen", ja: "キャンセル" },
  "mono.loading": { ko: "불러오는 중…", en: "Loading…", de: "Wird geladen…", ja: "読み込み中…" },
  // diff 페인·터미널 — 화면에 뜨는데 한국어로 굳어 있던 것들.
  "mono.diffLoading": { ko: "diff 불러오는 중…", en: "Loading diff…", de: "Diff wird geladen…", ja: "diff を読み込み中…" },
  "mono.headReadFailed": { ko: "HEAD 버전을 읽지 못했습니다", en: "Could not read the HEAD version", de: "Die HEAD-Version konnte nicht gelesen werden", ja: "HEAD 版を読み込めませんでした" },
  "mono.modifiedReadFailed": { ko: "수정본을 읽지 못했습니다", en: "Could not read the modified version", de: "Die geänderte Fassung konnte nicht gelesen werden", ja: "変更後の内容を読み込めませんでした" },
  "mono.pipeShell": { ko: " Schutz 터미널 · 파이프 셸(폴백, 입력은 라인 단위) ", en: " Schutz terminal · pipe shell (fallback, line-by-line input) ", de: " Schutz-Terminal · Pipe-Shell (Fallback, zeilenweise Eingabe) ", ja: " Schutz ターミナル · パイプシェル（フォールバック、入力は行単位） " },
  "mono.saved": { ko: "✓ 저장됨", en: "✓ Saved", de: "✓ Gespeichert", ja: "✓ 保存済み" },
  "mono.modified": { ko: "● 수정됨 · Ctrl+S 저장", en: "● Modified · Ctrl+S to save", de: "● Geändert · Ctrl+S zum Speichern", ja: "● 変更あり · Ctrl+Sで保存" },
};
