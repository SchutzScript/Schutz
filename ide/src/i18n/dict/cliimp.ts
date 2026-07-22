// 지난 대화 가져오기 — Claude Code · Codex 문안.
//
// 이 화면의 규칙 하나: **자른 것은 잘랐다고 말한다.** 218MB 짜리 대화를 통째로 못 들고
// 오는 건 어쩔 수 없지만, 조용히 버리면 사용자에게는 "예전 대화가 사라졌다" 로 보인다.
export const dict: Record<string, Record<string, string>> = {
  "imp.title": { ko: "지난 대화 가져오기", en: "Bring your past chats", de: "Frühere Unterhaltungen holen", ja: "過去の会話を取り込む" },

  // 오프닝 한 줄 — 몇 개를 찾았는지 숫자로 말한다. "기록을 발견했습니다" 는 아무것도 아니다.
  "imp.found": {
    ko: "이 컴퓨터에서 지난 대화 {n}개를 찾았습니다.",
    en: "Found {n} past conversations on this computer.",
    de: "{n} frühere Unterhaltungen auf diesem Computer gefunden.",
    ja: "このコンピュータで過去の会話を{n}件見つけました。",
  },
  "imp.foundHint": {
    ko: "Schutz 로 데려오면 이어서 대화할 수 있습니다. 나중에 사이드바에서도 됩니다.",
    en: "Bring them over and pick up where you left off. You can also do this later from the sidebar.",
    de: "Holen Sie sie herüber und machen Sie dort weiter, wo Sie aufgehört haben. Geht später auch über die Seitenleiste.",
    ja: "取り込めば続きから会話できます。あとでサイドバーからでもできます。",
  },
  "imp.now": { ko: "골라서 가져오기", en: "Choose and import", de: "Auswählen und holen", ja: "選んで取り込む" },
  "imp.later": { ko: "나중에", en: "Later", de: "Später", ja: "あとで" },

  // 목록
  "imp.command": {
    ko: "지난 대화 가져오기 (Claude Code · Codex)",
    en: "Import past chats (Claude Code · Codex)",
    de: "Frühere Unterhaltungen holen (Claude Code · Codex)",
    ja: "過去の会話を取り込む (Claude Code · Codex)",
  },
  "imp.aside": { ko: "가져오기", en: "Import", de: "Importieren", ja: "取り込む" },
  "imp.thisProject": { ko: "이 프로젝트만", en: "This project only", de: "Nur dieses Projekt", ja: "このプロジェクトのみ" },
  "imp.scanning": { ko: "찾는 중…", en: "Looking…", de: "Suche…", ja: "検索中…" },
  "imp.none": {
    ko: "Claude Code 나 Codex 로 나눈 대화가 없습니다.",
    en: "No Claude Code or Codex conversations here.",
    de: "Keine Claude-Code- oder Codex-Unterhaltungen gefunden.",
    ja: "Claude Code や Codex の会話が見つかりません。",
  },
  "imp.noneHere": {
    ko: "이 프로젝트에서 나눈 대화는 없습니다. 위 체크를 풀면 전부 봅니다.",
    en: "None from this project. Uncheck above to see all of them.",
    de: "Keine aus diesem Projekt. Haken oben entfernen, um alle zu sehen.",
    ja: "このプロジェクトのものはありません。上のチェックを外すと全部表示されます。",
  },
  "imp.turns": { ko: "{n}마디", en: "{n} messages", de: "{n} Nachrichten", ja: "{n}件" },
  "imp.import": { ko: "가져오기", en: "Import", de: "Holen", ja: "取り込む" },
  "imp.cancel": { ko: "취소", en: "Cancel", de: "Abbrechen", ja: "キャンセル" },
  "imp.close": { ko: "닫기 (Esc)", en: "Close (Esc)", de: "Schließen (Esc)", ja: "閉じる (Esc)" },
  "imp.reading": { ko: "읽는 중…", en: "Reading…", de: "Lese…", ja: "読み込み中…" },

  // 자르기 — 전부 다 못 가져온다는 사실을 미리, 그리고 끝나고 다시 말한다.
  "imp.capNote": {
    ko: "긴 대화는 마지막 {n}마디만 가져옵니다.",
    en: "For long conversations, only the last {n} messages come over.",
    de: "Bei langen Unterhaltungen kommen nur die letzten {n} Nachrichten mit.",
    ja: "長い会話は最後の{n}件だけを取り込みます。",
  },
  // 파일을 통째로 읽지 못한 경우. droppedMsgs 로는 이걸 말할 수 없다 — 안 읽은 부분에
  // 몇 마디가 있었는지는 셀 방법이 없다. 숫자를 지어내느니 범위를 말한다.
  "imp.tailOnly": {
    ko: "원본이 커서 마지막 부분만 가져왔습니다. 원본은 그대로 있습니다.",
    en: "The original was large, so only the latest stretch came over. The file itself is untouched.",
    de: "Das Original war groß, daher kam nur der letzte Abschnitt mit. Die Datei selbst ist unberührt.",
    ja: "元が大きいため最後の部分だけを取り込みました。元のファイルはそのままです。",
  },
  "imp.clipped": {
    ko: "이 앞의 {n}마디는 가져오지 않았습니다. 원본은 그대로 있습니다.",
    en: "{n} earlier messages were left behind. The original file is untouched.",
    de: "{n} frühere Nachrichten blieben zurück. Die Originaldatei ist unberührt.",
    ja: "これより前の{n}件は取り込んでいません。元のファイルはそのままです。",
  },
  "imp.done": { ko: "{title} 을(를) 가져왔습니다.", en: "Imported “{title}”.", de: "„{title}“ geholt.", ja: "「{title}」を取り込みました。" },
  "imp.empty": {
    ko: "읽을 만한 말이 없는 대화입니다.",
    en: "That conversation has nothing readable in it.",
    de: "In dieser Unterhaltung ist nichts Lesbares.",
    ja: "読み取れる発言がない会話です。",
  },
  "imp.failed": { ko: "가져오지 못했습니다 — {err}", en: "Could not import — {err}", de: "Konnte nicht geholt werden — {err}", ja: "取り込めませんでした — {err}" },

  // 출처 배지 — 목록에서 이게 어디서 온 대화인지 남긴다.
  "imp.fromClaude": { ko: "Claude Code 에서 가져옴", en: "From Claude Code", de: "Aus Claude Code", ja: "Claude Code から" },
  "imp.fromCodex": { ko: "Codex 에서 가져옴", en: "From Codex", de: "Aus Codex", ja: "Codex から" },
};
