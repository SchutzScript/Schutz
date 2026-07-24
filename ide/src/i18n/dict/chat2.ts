// chat2 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "chat.busyHint": { ko: "아직 작업 중입니다. 끝나길 기다리거나 중지를 눌러주세요.", en: "Still working. Wait for it to finish, or press stop.", de: "Noch beschäftigt. Warte auf den Abschluss oder drücke Stopp.", ja: "まだ作業中です。完了を待つか、停止を押してください。" },
  "aside.resize": { ko: "목록 너비 조절 — 좌우로 끄세요", en: "Resize the list — drag sideways", de: "Listenbreite ziehen", ja: "一覧の幅を調整 — 左右にドラッグ" },
  // 실제 파일·사진 첨부 (붙여넣기·끌어다 놓기도 같은 길)
  "chat.attachUpload": { ko: "＋ 파일", en: "+ File", de: "+ Datei", ja: "＋ ファイル" },
  "chat.attachUploadTitle": {
    ko: "사진·파일 첨부 — 붙여넣기(Ctrl+V)나 끌어다 놓기도 됩니다",
    en: "Attach an image or file — you can also paste (Ctrl+V) or drag and drop",
    de: "Bild oder Datei anhängen — auch Einfügen (Strg+V) oder Ziehen und Ablegen",
    ja: "画像・ファイルを添付 — 貼り付け（Ctrl+V）やドラッグ＆ドロップも使えます",
  },
  "chat.attachTooBig": { ko: "{name}은(는) 너무 큽니다 (8MB 이하)", en: "{name} is too large (8MB max)", de: "{name} ist zu groß (max. 8 MB)", ja: "{name} は大きすぎます（8MB まで）" },
  "chat.attachReadFail": { ko: "{name}을(를) 읽지 못했습니다", en: "Could not read {name}", de: "{name} konnte nicht gelesen werden", ja: "{name} を読み込めませんでした" },
  "chat.jumpLatest": { ko: "최신으로", en: "Jump to latest", de: "Zum Neuesten", ja: "最新へ" },
  "chat.copyMsg": { ko: "메시지 복사", en: "Copy message", de: "Nachricht kopieren", ja: "メッセージをコピー" },
  "chat.copied": { ko: "복사했습니다", en: "Copied", de: "Kopiert", ja: "コピーしました" },
  "chat2.fileNamePlaceholder": { ko: "파일 이름…", en: "File name…", de: "Dateiname…", ja: "ファイル名…" },
  "chat2.noMatchingFiles": { ko: "일치하는 파일이 없습니다.", en: "No matching files.", de: "Keine passenden Dateien.", ja: "一致するファイルがありません。" },
};
