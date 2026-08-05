// enc 도메인 — UTF-8 이 아닌 파일을 열려고 했을 때.
//
// 예전엔 무조건 UTF-8 로 디코딩해서 깨진 글자로 열렸고, 저장하는 순간 원본이
// 파괴됐다. 이제 열지 않고 이유를 말한다 — 왜 안 되는지 모르면 고장으로 보인다.
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "enc.notUtf8": { ko: "이 파일은 UTF-8 이 아닙니다. 열면 글자가 깨지고 저장하면 원본이 사라지므로 열지 않았습니다. UTF-8 로 변환한 뒤 다시 열어 주세요.", en: "This file is not UTF-8. Opening it would garble the text and saving would destroy the original, so it was not opened. Convert it to UTF-8 and try again.", de: "Diese Datei ist nicht UTF-8. Das Öffnen würde den Text zerstören und das Speichern das Original vernichten — sie wurde nicht geöffnet. Bitte in UTF-8 konvertieren.", ja: "このファイルは UTF-8 ではありません。開くと文字化けし、保存すると原本が失われるため開きませんでした。UTF-8 に変換してから開いてください。" },
  "enc.utf16": { ko: "이 파일은 UTF-16 입니다. 아직 UTF-8 만 다룰 수 있어 열지 않았습니다 — 열었다면 저장하는 순간 원본이 사라졌을 것입니다.", en: "This file is UTF-16. Only UTF-8 is supported, so it was not opened — saving it would have destroyed the original.", de: "Diese Datei ist UTF-16. Es wird nur UTF-8 unterstützt, daher wurde sie nicht geöffnet — beim Speichern wäre das Original verloren gegangen.", ja: "このファイルは UTF-16 です。現在 UTF-8 のみ対応のため開きませんでした — 保存していれば原本が失われていました。" },
  "enc.binary": { ko: "텍스트 파일이 아닙니다(NUL 바이트가 있습니다). 편집기로 열면 내용이 망가집니다.", en: "This is not a text file (it contains NUL bytes). Opening it in the editor would corrupt it.", de: "Das ist keine Textdatei (sie enthält NUL-Bytes). Im Editor zu öffnen würde sie beschädigen.", ja: "テキストファイルではありません（NUL バイトがあります）。エディターで開くと壊れます。" },
};
