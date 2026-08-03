// runfile 도메인 번역 사전 — "이 파일 실행"
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "runfile.cmdRun": { ko: "이 파일 실행", en: "Run this file", de: "Diese Datei ausführen", ja: "このファイルを実行" },
  "runfile.noFile": { ko: "실행할 파일이 열려 있지 않습니다.", en: "No file is open to run.", de: "Keine Datei zum Ausführen geöffnet.", ja: "実行するファイルが開かれていません。" },
  "runfile.unsupported": { ko: "'.{ext}' 는 실행할 방법을 모릅니다. 설정에서 명령을 지정할 수 있습니다.", en: "Don't know how to run '.{ext}'. You can set a command in Settings.", de: "Für '.{ext}' ist kein Ausführungsbefehl bekannt. In den Einstellungen festlegbar.", ja: "'.{ext}' の実行方法が不明です。設定でコマンドを指定できます。" },
  "runfile.missingTool": { ko: "{tool} 을(를) 찾지 못했습니다. 설치하거나 PATH 에 추가한 뒤 다시 시도해 주세요.", en: "Could not find {tool}. Install it or add it to PATH, then try again.", de: "{tool} wurde nicht gefunden. Installieren oder zu PATH hinzufügen.", ja: "{tool} が見つかりません。インストールするか PATH に追加してください。" },
  "runfile.settingsTitle": { ko: "실행 명령", en: "Run commands", de: "Ausführungsbefehle", ja: "実行コマンド" },
  "runfile.settingsNote": { ko: "${file} 은 파일 경로, ${out} 은 빌드 산출물로 바뀝니다. 비워 두면 기본값을 씁니다.", en: "${file} becomes the file path, ${out} the build artifact. Leave empty to use the default.", de: "${file} wird zum Dateipfad, ${out} zum Build-Artefakt. Leer lassen für den Standard.", ja: "${file} はファイルパス、${out} はビルド成果物に置き換わります。空なら既定値。" },
  "runfile.saveFirst": { ko: "저장한 뒤 실행합니다.", en: "Saving before running.", de: "Wird vor dem Ausführen gespeichert.", ja: "保存してから実行します。" },
};
