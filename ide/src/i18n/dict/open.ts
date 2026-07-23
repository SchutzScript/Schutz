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
  // 첫 화면의 크레딧은 언어와 무관하게 "Powered by Electron" 으로 고정한다
  // (Opening.tsx 에 리터럴로 박혀 있다). 예전엔 스택 전체를 어순 맞춰 번역했었다.

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

  // ── 시연: 두 번째 턴 ────────────────────────────────────────────────
  "open.ask2": {
    ko: "테스트 한 번 돌려서 확인해줘",
    en: "Run the tests and check it",
    de: "Führ die Tests aus und prüf es",
    ja: "テストを実行して確認して",
  },
  "open.runWhy": {
    ko: "바꾼 연도 계산이 실제로 통과하는지 확인합니다.",
    en: "To confirm the new year calculation actually passes.",
    de: "Um zu prüfen, ob die neue Jahresberechnung wirklich durchläuft.",
    ja: "変更した年の計算が実際に通るか確認します。",
  },
  "open.runDone": {
    ko: "통과했습니다. 연도는 이제 매년 알아서 바뀝니다.",
    en: "Passed. The year now updates itself every year.",
    de: "Bestanden. Das Jahr aktualisiert sich jetzt von selbst.",
    ja: "通りました。年はこれから毎年自動で変わります。",
  },
  // 도구 줄에 붙는 동사. 짧아야 한다 — 알약 한 줄이다.
  "open.tool.search": { ko: "찾기", en: "Search", de: "Suchen", ja: "検索" },
  "open.tool.read": { ko: "읽기", en: "Read", de: "Lesen", ja: "読み取り" },
  "open.tool.run": { ko: "실행", en: "Run", de: "Ausführen", ja: "実行" },

  // ── 시연 자막 3개 ───────────────────────────────────────────────────
  "open.cap.look.t": { ko: "찾는 것부터 보입니다", en: "You see it looking", de: "Sie sehen das Suchen", ja: "探すところから見えます" },
  "open.cap.look.b": {
    ko: "무엇을 검색하고 어떤 파일을 열었는지 한 줄씩 남습니다. 눌러서 그 안을 펼쳐 볼 수도 있어요.",
    en: "Every search and every file it opens leaves a line. Click one to unfold what it saw.",
    de: "Jede Suche und jede geöffnete Datei hinterlässt eine Zeile. Klicken Sie eine an, um zu sehen, was sie enthielt.",
    ja: "何を検索し、どのファイルを開いたかが一行ずつ残ります。押せば中身も開けます。",
  },
  "open.cap.again.t": { ko: "대화는 이어집니다", en: "The conversation continues", de: "Das Gespräch geht weiter", ja: "会話は続きます" },
  "open.cap.again.b": {
    ko: "한 번 고치고 끝이 아닙니다. 방금 한 일을 기억한 채로 다음 걸 시킬 수 있어요.",
    en: "It doesn't stop after one fix. Ask for the next thing — it still remembers what it just did.",
    de: "Nach einer Korrektur ist nicht Schluss. Fragen Sie nach dem Nächsten — es weiß noch, was es gerade tat.",
    ja: "一度直して終わりではありません。今やったことを覚えたまま、次を頼めます。",
  },
  "open.cap.runAsk.t": { ko: "명령은 물어보고 돌립니다", en: "Commands are asked, not assumed", de: "Befehle werden erfragt, nicht angenommen", ja: "コマンドは尋ねてから実行します" },
  "open.cap.runAsk.b": {
    ko: "무엇을 돌릴지 먼저 보여주고 기다립니다. 승인하기 전에는 아무것도 실행되지 않아요.",
    en: "It shows you the exact command and waits. Nothing runs until you approve it.",
    de: "Es zeigt Ihnen den genauen Befehl und wartet. Nichts läuft, bevor Sie zustimmen.",
    ja: "何を実行するかを先に見せて待ちます。承認するまで何も実行されません。",
  },

  // ── 세팅 2쪽 ────────────────────────────────────────────────────────
  // 1쪽은 무엇을 보는가(언어·테마·모양), 2쪽은 무엇으로 일하는가(AI·자율성·키맵·글꼴).
  // 시연 도중의 탈출구. "건너뛰기" 만으로는 무엇을 건너뛰는지 애매해서 대상을 밝힌다.
  "open.demoSkip": { ko: "시연 건너뛰기", en: "Skip the demo", de: "Demo überspringen", ja: "デモをスキップ" },
  "open.setup.next": { ko: "다음", en: "Next", de: "Weiter", ja: "次へ" },
  "open.setup.ai": { ko: "AI 연결", en: "Connect AI", de: "KI verbinden", ja: "AI 接続" },
  "open.setup.autonomy": { ko: "어디까지 맡길까요", en: "How much to hand over", de: "Wie viel übergeben", ja: "どこまで任せますか" },
  "open.setup.fonts": { ko: "글꼴", en: "Type", de: "Schrift", ja: "書体" },

  "open.conn.on": { ko: "연결됨", en: "Connected", de: "Verbunden", ja: "接続済み" },
  "open.conn.off": { ko: "아직", en: "Not yet", de: "Noch nicht", ja: "まだ" },
  "open.conn.sub": { ko: "구독으로", en: "Subscription", de: "Abo", ja: "サブスクで" },
  "open.conn.key": { ko: "API 키", en: "API key", de: "API-Schlüssel", ja: "APIキー" },
  "open.conn.save": { ko: "저장", en: "Save", de: "Speichern", ja: "保存" },
  "open.conn.keyPlaceholder": { ko: "키를 붙여넣으세요", en: "Paste your key", de: "Schlüssel einfügen", ja: "キーを貼り付け" },
  // 지금 안 해도 된다고 분명히 말한다 — 첫 화면에서 로그인을 강요당하면 그대로 닫는다.
  "open.conn.hint": {
    ko: "지금 넘어가도 됩니다. 나중에 설정에서 언제든 연결할 수 있어요. 구독으로 로그인하면 창이 하나 열립니다.",
    en: "You can skip this. Connect anytime from settings later. Signing in with a subscription opens a separate window.",
    de: "Sie können das überspringen. Später jederzeit in den Einstellungen verbinden. Die Abo-Anmeldung öffnet ein eigenes Fenster.",
    ja: "今は飛ばしても大丈夫です。あとで設定からいつでも接続できます。サブスクでのログインは別ウィンドウが開きます。",
  },

  // 자율성 — 무엇을 물어보고 무엇을 알아서 할지. 안전 설정이라 기본값을 모르면 곤란하다.
  "open.pol.manual": { ko: "다 물어보기", en: "Ask me everything", de: "Alles fragen", ja: "すべて確認" },
  "open.pol.manual.desc": {
    ko: "파일도 명령도 확인 후에",
    en: "Files and commands, after you approve",
    de: "Dateien und Befehle erst nach Zustimmung",
    ja: "ファイルもコマンドも確認後に",
  },
  "open.pol.balanced": { ko: "중요한 것만", en: "Only what matters", de: "Nur Wichtiges", ja: "重要なものだけ" },
  "open.pol.balanced.desc": {
    ko: "작은 편집은 알아서, 명령은 확인",
    en: "Small edits on its own, commands still asked",
    de: "Kleine Änderungen selbst, Befehle weiterhin gefragt",
    ja: "小さな編集は自動、コマンドは確認",
  },
  "open.pol.auto": { ko: "알아서 하기", en: "Just do it", de: "Einfach machen", ja: "任せる" },
  "open.pol.auto.desc": {
    ko: "멈추지 않고 진행합니다",
    en: "Keeps going without stopping",
    de: "Läuft ohne Unterbrechung durch",
    ja: "止まらずに進めます",
  },
  // 정책 카드의 파일 예시에 붙는 표시 — autoAcceptFor 의 실제 판정 그대로.
  "open.pol.markAuto":   { ko: "자동", en: "auto", de: "auto", ja: "自動" },
  "open.pol.markReview": { ko: "검토", en: "review", de: "prüfen", ja: "確認" },

  // ── 세팅 쪽 제목 — 한 쪽에 하나씩 묻는다 ─────────────────────────────
  "open.step.ai": { ko: "무엇과 함께 일할까요", en: "Who will you work with", de: "Mit wem arbeiten Sie", ja: "誰と一緒に働きますか" },
  "open.step.ai.lede": {
    ko: "Schutz 는 모델을 직접 만들지 않습니다. 당신의 구독이나 키를 그대로 씁니다 — 대화도 코드도 당신 계정에서 오갑니다.",
    en: "Schutz doesn't ship a model. It uses your own subscription or key — everything runs through your account.",
    de: "Schutz bringt kein eigenes Modell mit. Es nutzt Ihr Abo oder Ihren Schlüssel — alles läuft über Ihr Konto.",
    ja: "Schutz はモデルを持ちません。あなたのサブスクやキーをそのまま使います — すべてあなたのアカウントを通ります。",
  },
  "open.conn.roleClaude": { ko: "구독 또는 API 키", en: "Subscription or API key", de: "Abo oder API-Schlüssel", ja: "サブスクまたはAPIキー" },
  "open.conn.roleGpt": { ko: "구독 또는 API 키", en: "Subscription or API key", de: "Abo oder API-Schlüssel", ja: "サブスクまたはAPIキー" },

  "open.step.autonomy": { ko: "어디까지 맡길까요", en: "How much do you hand over", de: "Wie viel übergeben Sie", ja: "どこまで任せますか" },
  "open.step.autonomy.lede": {
    ko: "언제든 설정에서 바꿀 수 있고, 어떤 설정이든 파일이 바뀌면 검토에 남습니다. 되돌릴 수 없는 건 셸 명령뿐입니다.",
    en: "Changeable anytime in settings — and whatever you pick, every file change still lands in review. Only shell commands can't be undone.",
    de: "Jederzeit in den Einstellungen änderbar — und jede Dateiänderung landet weiterhin in der Überprüfung. Nur Shell-Befehle sind unwiderruflich.",
    ja: "設定でいつでも変えられます。どれを選んでもファイルの変更は検討に残ります。取り消せないのはシェルコマンドだけです。",
  },

  "open.step.keymap": { ko: "손에 익은 단축키가 있나요", en: "Any shortcuts already in your hands", de: "Gewohnte Tastenkürzel", ja: "手に馴染んだショートカットは" },
  "open.step.keymap.lede": {
    ko: "쓰던 편집기의 단축키를 그대로 씁니다. 지금 안 정해도 설정에서 바꿀 수 있어요.",
    en: "Keep the shortcuts from the editor you already use. You can switch later in settings.",
    de: "Behalten Sie die Kürzel Ihres bisherigen Editors. Später in den Einstellungen änderbar.",
    ja: "使っていたエディタのショートカットをそのまま使えます。あとで設定から変えられます。",
  },
  // 키맵별 예시에 쓰는 동작 이름 — MonacoPane 이 실제로 거는 바인딩 그대로다.
  "open.km.dupLine":   { ko: "라인 복제", en: "Duplicate line", de: "Zeile duplizieren", ja: "行を複製" },
  "open.km.expandSel": { ko: "선택 확장", en: "Expand selection", de: "Auswahl erweitern", ja: "選択を拡張" },
  "open.km.comment":   { ko: "주석 토글", en: "Toggle comment", de: "Kommentar umschalten", ja: "コメント切替" },
  "open.km.nextOccur": { ko: "다음 항목 선택", en: "Select next occurrence", de: "Nächstes Vorkommen", ja: "次の候補を選択" },
  "open.km.moveLine":  { ko: "라인 이동", en: "Move line", de: "Zeile verschieben", ja: "行を移動" },
  "open.km.delLine":   { ko: "라인 삭제", en: "Delete line", de: "Zeile löschen", ja: "行を削除" },
  "open.km.yank":      { ko: "복사(yank)", en: "Yank (copy)", de: "Yank (kopieren)", ja: "ヤンク(コピー)" },
  "open.km.save":      { ko: "저장", en: "Save", de: "Speichern", ja: "保存" },
  "open.km.modal":     { ko: "모드 전환 편집", en: "Modal editing", de: "Modales Editieren", ja: "モーダル編集" },

  "open.step.fonts": { ko: "어떤 글씨가 편한가요", en: "What reads best for you", de: "Was liest sich für Sie am besten", ja: "どの書体が読みやすいですか" },
  "open.step.fonts.lede": {
    ko: "버튼이 그 글꼴로 쓰여 있습니다 — 이름만 보고 고르는 것보다 정확합니다.",
    en: "Each button is set in its own typeface — truer than picking by name.",
    de: "Jede Schaltfläche ist in ihrer eigenen Schrift gesetzt — genauer als nach Namen zu wählen.",
    ja: "ボタンはその書体で書かれています — 名前だけで選ぶより確かです。",
  },
};
