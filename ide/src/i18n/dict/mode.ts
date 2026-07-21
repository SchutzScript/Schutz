// UI 모드 문안.
//
// 이름은 **무엇이 화면의 주인공인지**로 지었다. "VS Code 모드 / CLI 모드" 처럼 남의 제품을
// 빌려 쓰면 그 제품을 모르는 사람에게 아무 뜻이 없고, 우리 것도 아닌 게 된다.
export const dict: Record<string, Record<string, string>> = {
  "mode.editor": { ko: "에디터", en: "Editor", de: "Editor", ja: "エディタ" },
  "mode.agent": { ko: "에이전트", en: "Agent", de: "Agent", ja: "エージェント" },

  "mode.switchTitle": {
    ko: "모드 전환 (Ctrl+Shift+M)",
    en: "Switch mode (Ctrl+Shift+M)",
    de: "Modus wechseln (Strg+Umschalt+M)",
    ja: "モード切り替え (Ctrl+Shift+M)",
  },
  "mode.command": { ko: "모드 전환", en: "Switch UI mode", de: "Modus wechseln", ja: "モード切り替え" },

  // 설정·첫 실행에서 카드 밑에 깔리는 한 줄. 기능 목록이 아니라 **무엇이 중심인지**를 말한다.
  "mode.editor.desc": {
    ko: "파일 트리와 탭이 있는 편집기가 중심입니다. 대화는 옆에 둡니다.",
    en: "The editor is the stage — file tree, tabs, panels. Chat sits beside it.",
    de: "Der Editor steht im Mittelpunkt — Dateibaum, Tabs, Panels. Der Chat sitzt daneben.",
    ja: "ファイルツリーとタブのあるエディタが中心です。チャットは横に置きます。",
  },
  "mode.agent.desc": {
    ko: "대화가 화면 전체입니다. 코드는 필요할 때만 떠오릅니다.",
    en: "The conversation is the whole screen. Code surfaces only when you need it.",
    de: "Das Gespräch ist der ganze Bildschirm. Code erscheint nur, wenn Sie ihn brauchen.",
    ja: "会話が画面全体です。コードは必要なときだけ現れます。",
  },

  "mode.settingsLabel": { ko: "화면 모드", en: "Layout", de: "Ansicht", ja: "画面モード" },
  // 프로젝트별 저장이라는 사실을 말해주지 않으면, 다른 저장소에서 다르게 뜨는 게 버그로 보인다.
  "mode.settingsHint": {
    ko: "이 프로젝트에만 적용됩니다.",
    en: "Applies to this project only.",
    de: "Gilt nur für dieses Projekt.",
    ja: "このプロジェクトにのみ適用されます。",
  },
  "mode.transcriptEmpty": {
    ko: "아래에 요청을 적으면 여기에 흐릅니다 — 무엇을 읽고 무엇을 고쳤는지 한 줄기로.",
    en: "Type a request below and it flows here — everything read and changed, in one thread.",
    de: "Schreiben Sie unten eine Anfrage — alles Gelesene und Geänderte erscheint hier in einem Strang.",
    ja: "下に依頼を書くとここに流れます — 何を読み何を変えたか、ひと続きで。",
  },
  "mode.approvalWaiting": {
    ko: "명령 실행을 기다리는 중",
    en: "Waiting to run a command",
    de: "Wartet auf Ausführung eines Befehls",
    ja: "コマンド実行の承認待ち",
  },
  "mode.sheetTitle": { ko: "코드", en: "Code", de: "Code", ja: "コード" },
  "mode.sheetClose": { ko: "닫기 (Esc)", en: "Close (Esc)", de: "Schließen (Esc)", ja: "閉じる (Esc)" },
  "mode.openInSheet": { ko: "열기", en: "Open", de: "Öffnen", ja: "開く" },
};
