// exth 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "exth.commandError": {
    ko: "{source} 오류: {msg}",
    en: "{source} error: {msg}",
    de: "{source}-Fehler: {msg}",
    ja: "{source} エラー: {msg}",
  },
  // WorkspaceEdit 의 파일 조작을 거절했을 때. 조용히 false 만 돌려주면 확장도
  // 사용자도 왜 리팩터가 안 됐는지 알 수 없다.
  "exth.fileOpRefused": {
    ko: "확장의 파일 작업을 하지 않았습니다 — {why}",
    en: "The extension's file operation was refused — {why}",
    de: "Die Dateioperation der Erweiterung wurde abgelehnt — {why}",
    ja: "拡張機能のファイル操作を実行しませんでした — {why}",
  },
  "exth.fileOpFailed": {
    ko: "확장의 파일 작업이 도중에 실패했습니다: {rel}",
    en: "The extension's file operation failed partway: {rel}",
    de: "Die Dateioperation der Erweiterung schlug unterwegs fehl: {rel}",
    ja: "拡張機能のファイル操作が途中で失敗しました: {rel}",
  },
  "exth.customEditorLoading": { ko: "확장 편집기를 준비하는 중…", en: "Preparing the extension's editor…", de: "Editor der Erweiterung wird vorbereitet…", ja: "拡張機能のエディターを準備中…" },
  "exth.customEditorGone": {
    ko: "이 파일을 여는 확장 편집기({viewType})가 더는 등록돼 있지 않습니다. 확장을 켜거나 다시 읽어 주세요.",
    en: "The extension editor for this file ({viewType}) is no longer registered. Enable or reload the extension.",
    de: "Der Erweiterungs-Editor für diese Datei ({viewType}) ist nicht mehr registriert. Erweiterung aktivieren oder neu laden.",
    ja: "このファイルを開く拡張エディター({viewType})が登録されていません。拡張機能を有効化するか再読み込みしてください。",
  },
  "exth.customEditorNoDoc": {
    ko: "{rel} 을(를) 읽지 못해 확장 편집기를 열 수 없습니다.",
    en: "Could not read {rel}, so the extension editor cannot open.",
    de: "{rel} konnte nicht gelesen werden — der Erweiterungs-Editor öffnet nicht.",
    ja: "{rel} を読めなかったため拡張エディターを開けません。",
  },
  "exth.moduleNotSupported": {
    ko: "'{m}' 모듈은 Schutz 경량 확장 호스트에서 지원되지 않습니다",
    en: "The '{m}' module is not supported by the Schutz lightweight extension host",
    de: "Das Modul '{m}' wird vom Schutz-Lightweight-Erweiterungshost nicht unterstützt",
    ja: "'{m}' モジュールは Schutz の軽量拡張ホストではサポートされていません",
  },
  "exth.extListLoadFailed": {
    ko: "확장 목록 로드 실패",
    en: "Failed to load extension list",
    de: "Laden der Erweiterungsliste fehlgeschlagen",
    ja: "拡張機能リストの読み込みに失敗しました",
  },
  "exth.entryFileNotFound": {
    ko: "엔트리 파일을 찾을 수 없음 ({main})",
    en: "Entry file not found ({main})",
    de: "Einstiegsdatei nicht gefunden ({main})",
    ja: "エントリファイルが見つかりません ({main})",
  },
  "exth.entryReadFailed": {
    ko: "엔트리 읽기 실패",
    en: "Failed to read entry",
    de: "Lesen des Einstiegspunkts fehlgeschlagen",
    ja: "エントリの読み込みに失敗しました",
  },
  "exth.entryMissing": {
    ko: "엔트리 없음",
    en: "No entry",
    de: "Kein Einstiegspunkt",
    ja: "エントリがありません",
  },
};
