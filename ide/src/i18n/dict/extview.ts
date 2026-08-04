// extview 도메인 — 확장이 사이드바에 붙인 뷰(트리·웹뷰)
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "extview.panel": { ko: "확장 뷰", en: "EXTENSION VIEWS", de: "ERWEITERUNGSANSICHTEN", ja: "拡張ビュー" },
  "extview.rail": { ko: "확장 뷰", en: "Extension views", de: "Erweiterungsansichten", ja: "拡張ビュー" },
  // 확장이 하나도 안 붙였을 때. "비어 있다" 만 적으면 고장인지 원래 그런지 알 수 없다.
  "extview.none": { ko: "확장이 붙인 뷰가 없습니다", en: "No extension has contributed a view", de: "Keine Erweiterung hat eine Ansicht beigesteuert", ja: "ビューを提供した拡張機能はありません" },
  "extview.noneHint": { ko: "뷰를 기여하는 확장을 설치하면 여기에 나타납니다", en: "Install an extension that contributes a view and it appears here", de: "Installieren Sie eine Erweiterung mit Ansichten — sie erscheint hier", ja: "ビューを提供する拡張機能を入れるとここに表示されます" },
  "extview.empty": { ko: "항목 없음", en: "Nothing to show", de: "Nichts anzuzeigen", ja: "表示する項目がありません" },
  "extview.failed": { ko: "이 뷰를 그리지 못했습니다", en: "This view could not be drawn", de: "Diese Ansicht konnte nicht gezeichnet werden", ja: "このビューを描画できませんでした" },
  "extview.loading": { ko: "읽는 중…", en: "Loading…", de: "Wird geladen…", ja: "読み込み中…" },
};
