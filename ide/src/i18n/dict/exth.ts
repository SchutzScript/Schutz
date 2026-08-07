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
