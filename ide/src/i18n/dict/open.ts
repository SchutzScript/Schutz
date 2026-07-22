// 첫 실행 오프닝 문안.
//
// 이 화면은 사람이 이 앱을 처음 보는 자리라 문장이 곧 첫인상이다. 기능을 설명하지
// 않고 약속을 말한다 — 무엇이 어디 있는지는 그 다음(15단계 투어)이 한다.
//
// open.say 는 **언어와 무관하게 독일어**로 둔다. Schutz·Feldgrau 가 이미 독일어라
// 브랜드의 목소리이고, 짧고 대구가 맞아 뜻을 몰라도 리듬이 읽힌다. 대신 바로 아래에
// open.saySub 로 사용자 언어 번역을 작게 깐다 — 멋만 부리고 뜻을 안 주면 안 된다.
// *별표* 로 감싼 낱말은 강조로 렌더된다.
export const dict: Record<string, Record<string, string>> = {
  "open.aria": {
    ko: "Schutz 시작 안내", en: "Schutz opening", de: "Schutz-Einführung", ja: "Schutz のはじめに",
  },
  "open.skip": { ko: "건너뛰기", en: "Skip", de: "Überspringen", ja: "スキップ" },

  // 전 언어 동일 — 이건 번역 대상이 아니라 상표에 가깝다.
  "open.say": {
    ko: "Die *KI* schreibt. *Du* entscheidest.",
    en: "Die *KI* schreibt. *Du* entscheidest.",
    de: "Die *KI* schreibt. *Du* entscheidest.",
    ja: "Die *KI* schreibt. *Du* entscheidest.",
  },
  "open.saySub": {
    ko: "AI 가 씁니다. 당신이 정합니다.",
    en: "The AI writes. You decide.",
    de: "Die KI schreibt den Code — Sie entscheiden, was davon bleibt.",
    ja: "AI が書きます。あなたが決めます。",
  },

  // ── 세팅 (오프닝에서 유일하게 멈추는 지점) ─────────────────────────
  "open.setup.title": {
    ko: "시작하기 전에", en: "Before we start", de: "Bevor es losgeht", ja: "はじめる前に",
  },
  // 예전엔 "둘 다" 라고 썼다. 선택지가 셋이 됐으므로 개수를 세지 않는 문장으로 바꾼다.
  "open.setup.hint": {
    ko: "전부 설정에서 언제든 바꿀 수 있어요.",
    en: "All of these can be changed anytime in settings.",
    de: "Alles davon lässt sich jederzeit in den Einstellungen ändern.",
    ja: "いずれも設定からいつでも変更できます。",
  },
  "open.setup.lang":  { ko: "언어", en: "Language", de: "Sprache", ja: "言語" },
  "open.setup.theme": { ko: "테마", en: "Theme", de: "Theme", ja: "テーマ" },
  "open.setup.go": { ko: "이걸로 시작", en: "Start with this", de: "Damit starten", ja: "これで始める" },

  // ── 조립되는 패널 라벨 ─────────────────────────────────────────────
  "open.tag.rail":   { ko: "탐색", en: "Navigate", de: "Navigation", ja: "移動" },
  "open.tag.left":   { ko: "프로젝트 · 대화", en: "Project · Chat", de: "Projekt · Chat", ja: "プロジェクト · チャット" },
  "open.tag.editor": { ko: "편집", en: "Edit", de: "Bearbeiten", ja: "編集" },
  "open.tag.right":  { ko: "검토 · 승인", en: "Review · Approve", de: "Prüfen · Freigeben", ja: "レビュー · 承認" },
  "open.tag.ask":    { ko: "요청", en: "Request", de: "Anfrage", ja: "リクエスト" },

  // ── 실연 ───────────────────────────────────────────────────────────
  "open.ask": {
    ko: "Footer 저작권 연도를 매년 자동으로 바뀌게 해줘",
    en: "Make the footer copyright year update itself every year",
    de: "Lass das Copyright-Jahr im Footer sich jedes Jahr selbst aktualisieren",
    ja: "フッターの著作権年を毎年自動で変わるようにして",
  },
  "open.tag.project": { ko: "프로젝트", en: "Project", de: "Projekt", ja: "プロジェクト" },
  "open.tag.agents":  { ko: "에이전트", en: "Agents", de: "Agenten", ja: "エージェント" },
  "open.tag.review":  { ko: "변경 검토", en: "Review", de: "Änderungen", ja: "変更レビュー" },

  "open.st.idle":   { ko: "대기", en: "Idle", de: "Bereit", ja: "待機" },
  "open.st.read":   { ko: "읽는 중", en: "Reading", de: "Liest", ja: "読み取り中" },
  "open.st.edit":   { ko: "편집 중", en: "Editing", de: "Bearbeitet", ja: "編集中" },
  "open.st.review": { ko: "검토 대기", en: "Awaiting review", de: "Wartet auf Prüfung", ja: "レビュー待ち" },

  "open.reply": {
    ko: "연도를 현재 연도로 계산하도록 바꿨습니다. 검토에서 확인하세요.",
    en: "Changed the year to compute from the current date. Check the review panel.",
    de: "Das Jahr wird jetzt aus dem aktuellen Datum berechnet. Prüfen Sie das Änderungs-Panel.",
    ja: "年を現在の日付から計算するように変更しました。変更レビューで確認してください。",
  },
  "open.status.clean":   { ko: "변경 없음", en: "No changes", de: "Keine Änderungen", ja: "変更なし" },
  "open.status.changed": { ko: "1개 파일 변경됨", en: "1 file changed", de: "1 Datei geändert", ja: "1ファイル変更" },

  "open.accept":  { ko: "수락", en: "Accept", de: "Annehmen", ja: "承認" },
  "open.reject":  { ko: "거절", en: "Reject", de: "Ablehnen", ja: "却下" },
  "open.applied": { ko: "✓ 반영됨", en: "✓ Applied", de: "✓ Übernommen", ja: "✓ 反映済み" },

  // ── 진행 중 자막 ───────────────────────────────────────────────────
  // 조립 뒤엔 화면이 알아서 움직이는데 왜 그러는지 설명이 없으면 그냥 구경만 하게 된다.
  // 각 장면마다 제목 한 줄 + 설명 한 줄. 영화 자막처럼 하단에 고정한다.
  // 첫 화면의 크레딧. 뒤에 붙는 건 실제로 우리가 올라선 것들이다(ide/data.ts).
  // AI 제공자를 여기 적지 않는 이유: Schutz 는 사용자의 Claude·Codex 를 그대로 쓸 뿐,
  // 그쪽이 우리를 보증하지 않는다. 확인할 수 있는 것만 적는다.
  // 줄 전체가 번역 대상이다. 앞에 붙이는 라벨로 만들었더니 한국어가 "구동 ELECTRON ·
  // MONACO · REACT" 가 됐다 — 영어는 앞, 한국어·일본어는 뒤에 붙는 말이라 어순이 다르다.
  "open.poweredBy": {
    ko: "{engine} 기반",
    en: "Powered by {engine}",
    de: "Basiert auf {engine}",
    ja: "{engine} で動作",
  },

  "open.cap.assemble.t": { ko: "화면은 네 부분입니다", en: "Four parts to the screen", de: "Vier Bereiche", ja: "画面は4つの領域です" },
  "open.cap.assemble.b": {
    ko: "왼쪽에 파일과 대화, 가운데에 편집기, 오른쪽에 에이전트와 변경 검토.",
    en: "Files and chat on the left, the editor in the middle, agents and change review on the right.",
    de: "Links Dateien und Chat, in der Mitte der Editor, rechts Agenten und Änderungsprüfung.",
    ja: "左にファイルとチャット、中央にエディタ、右にエージェントと変更レビュー。",
  },

  "open.cap.ask.t": { ko: "그냥 말하면 됩니다", en: "Just say it", de: "Einfach sagen", ja: "そのまま言うだけ" },
  "open.cap.ask.b": {
    ko: "명령어를 외울 필요가 없습니다. 하고 싶은 일을 적으면 에이전트가 파일을 찾아갑니다.",
    en: "No commands to memorise. Describe what you want and the agent goes and finds the file.",
    de: "Keine Befehle zu lernen. Beschreiben Sie, was Sie wollen — der Agent findet die Datei.",
    ja: "コマンドを覚える必要はありません。やりたいことを書けば、エージェントがファイルを探します。",
  },

  "open.cap.rewrite.t": { ko: "고쳐지는 과정이 보입니다", en: "You watch it happen", de: "Sie sehen es geschehen", ja: "直る過程が見えます" },
  "open.cap.rewrite.b": {
    ko: "완성된 diff 만 던져주지 않습니다. 어느 줄이 어떻게 바뀌는지 그대로 흘러갑니다.",
    en: "You don't get handed a finished diff. Each line changes in front of you, as it happens.",
    de: "Sie bekommen kein fertiges Diff vorgesetzt. Jede Zeile ändert sich vor Ihren Augen.",
    ja: "完成したdiffを渡されるのではありません。どの行がどう変わるかがそのまま流れます。",
  },

  "open.cap.approve.t": { ko: "반영은 당신이 정합니다", en: "You decide what lands", de: "Sie entscheiden, was bleibt", ja: "反映はあなたが決めます" },
  "open.cap.approve.b": {
    ko: "수정안은 파일에 바로 들어가지 않고 검토에 쌓입니다. 수락해야 반영됩니다.",
    en: "Edits never land straight in your files — they queue in review. Nothing applies until you accept.",
    de: "Änderungen landen nie direkt in Ihren Dateien — sie sammeln sich in der Prüfung. Erst Ihre Freigabe übernimmt sie.",
    ja: "修正案がファイルに直接入ることはなく、レビューに溜まります。承認して初めて反映されます。",
  },

  // ── 마무리 ─────────────────────────────────────────────────────────
  "open.done.title": {
    ko: "준비됐습니다", en: "You're ready", de: "Alles bereit", ja: "準備できました",
  },
  "open.done.tour": {
    ko: "천천히 둘러보기 →", en: "Take the tour →", de: "Rundgang starten →", ja: "ゆっくり見て回る →",
  },
  "open.done.skip": {
    ko: "바로 시작", en: "Jump right in", de: "Direkt loslegen", ja: "すぐ始める",
  },
};
