// extask 도메인 — 확장이 사용자에게 묻는 물음(빠른 선택·입력·버튼)
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  // 누가 묻는지 늘 밝힌다. 확장이 띄운 창을 앱이 띄운 것으로 오해하면 안 된다.
  "extask.from": { ko: "{name} 확장", en: "{name} extension", de: "Erweiterung {name}", ja: "{name} 拡張機能" },
  "extask.pickPlaceholder": { ko: "항목 선택", en: "Select an item", de: "Element auswählen", ja: "項目を選択" },
  "extask.filter": { ko: "걸러내기", en: "Filter", de: "Filtern", ja: "絞り込み" },
  "extask.none": { ko: "맞는 항목이 없습니다", en: "No matching items", de: "Keine passenden Einträge", ja: "一致する項目がありません" },
  "extask.pickMany": { ko: "여러 개를 고를 수 있습니다 — Space 로 선택", en: "Pick several — Space to toggle", de: "Mehrfachauswahl — Leertaste zum Umschalten", ja: "複数選択できます — Space で切り替え" },
  "extask.ok": { ko: "확인", en: "OK", de: "OK", ja: "OK" },
  "extask.cancel": { ko: "취소", en: "Cancel", de: "Abbrechen", ja: "キャンセル" },
  "extask.selected": { ko: "{n}개 선택함", en: "{n} selected", de: "{n} ausgewählt", ja: "{n} 件選択" },
};
