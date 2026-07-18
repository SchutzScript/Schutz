// exth 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "exth.commandError": {
    ko: "{source} 오류: {msg}",
    en: "{source} error: {msg}",
    de: "{source}-Fehler: {msg}",
    ja: "{source} エラー: {msg}",
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
