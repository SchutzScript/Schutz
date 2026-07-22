// 사용법 스포트라이트 투어 문안.
//
// messages.ts 에서 옮겨왔다 — 단계가 6개에서 14개로 늘면서 루트 파일에 두기엔 커졌고,
// 다른 도메인 문자열은 이미 dict/*.ts 로 갈라져 있다.
//
// 문안 원칙: 한 단계에 한 가지만. "어디에 무엇이 있다" 로 끝내지 않고 "그래서 뭘 할 수
// 있다" 까지 쓴다 — 위치만 알려주면 투어가 끝난 뒤 아무것도 남지 않는다.
export const dict: Record<string, Record<string, string>> = {
  "tour.progress": { ko: "{cur} / {total}", en: "{cur} / {total}", de: "{cur} / {total}", ja: "{cur} / {total}" },
  // 보여줄 수 있는 단계가 하나도 없었을 때. 조용히 닫으면 아무 일도 안 일어난 것처럼 보인다.
  "tour.noSteps": {
    ko: "지금 화면에서는 안내할 수 있는 단계가 없습니다.",
    en: "There are no tour steps available on this screen.",
    de: "Auf diesem Bildschirm gibt es keine Rundgang-Schritte.",
    ja: "この画面で案内できるステップがありません。",
  },

  "tour.welcome.title": { ko: "Schutz에 오신 것을 환영합니다", en: "Welcome to Schutz", de: "Willkommen bei Schutz", ja: "Schutzへようこそ" },
  "tour.welcome.body": {
    ko: "AI가 코드를 고치는 과정을 눈으로 보고, 반영할지는 직접 정하는 편집기입니다. 어디에 무엇이 있는지 차례로 짚어드릴게요. 언제든 건너뛸 수 있습니다.",
    en: "An editor where you watch the AI change your code, and decide what actually lands. Here's a walk through where everything is. Skip anytime.",
    de: "Ein Editor, in dem Sie der KI beim Ändern Ihres Codes zusehen und selbst entscheiden, was übernommen wird. Hier eine Führung durch die Oberfläche. Jederzeit überspringbar.",
    ja: "AIがコードを変更する過程を見ながら、何を反映するかは自分で決めるエディタです。どこに何があるかを順に案内します。いつでもスキップできます。",
  },

  // ── 둘러보기 ─────────────────────────────────────────────────────────
  "tour.rail.title": { ko: "왼쪽 레일", en: "The Left Rail", de: "Die linke Leiste", ja: "左のレール" },
  "tour.rail.body": {
    ko: "탐색기·소스 컨트롤·디버그·확장을 오가는 곳입니다. 아이콘의 배지는 변경된 파일 수나 디버그 상태를 알려줍니다. 맨 아래는 터미널과 설정이에요.",
    en: "Switch between the explorer, source control, debugging, and extensions. Badges show changed-file counts and debugger state. Terminal and settings sit at the bottom.",
    de: "Wechseln Sie zwischen Explorer, Versionskontrolle, Debugging und Erweiterungen. Abzeichen zeigen geänderte Dateien und Debugger-Status. Terminal und Einstellungen unten.",
    ja: "エクスプローラー・ソース管理・デバッグ・拡張機能を切り替えます。バッジは変更ファイル数やデバッガの状態を示します。一番下がターミナルと設定です。",
  },

  "tour.tree.title": { ko: "프로젝트 탐색기", en: "Project Explorer", de: "Projekt-Explorer", ja: "プロジェクトエクスプローラー" },
  "tour.tree.body": {
    ko: "파일을 열고, 이름을 바꾸고, 새로 만듭니다. 파일을 AI 대화에 첨부하려면 입력창의 @ 버튼을 쓰세요.",
    en: "Open, rename, and create files. To attach a file to the AI conversation, use the @ button in the chat input.",
    de: "Dateien öffnen, umbenennen und anlegen. Zum Anhängen an die KI-Unterhaltung die @-Schaltfläche im Eingabefeld verwenden.",
    ja: "ファイルを開く・名前を変更する・新規作成します。AIとの会話にファイルを添付するには入力欄の@ボタンを使います。",
  },

  "tour.editor.title": { ko: "에디터", en: "Editor", de: "Editor", ja: "エディタ" },
  // Ctrl+K 는 이 앱의 간판이라 편집기 단계 안에 같이 넣는다 — 같은 곳을 두 번
  // 가리키는 단계로 나누면 진도가 안 나가는 느낌이 든다.
  "tour.editor.body": {
    ko: "탭을 드래그해 순서를 바꾸고, 보기 메뉴에서 2·4분할할 수 있습니다. 그리고 여기서 코드를 고르고 Ctrl+K 를 누르면 **그 부분만** 고쳐달라고 시킬 수 있어요 — 바뀐 줄이 제자리에서 타이핑되며 나타납니다.",
    en: "Drag tabs to reorder, split into 2 or 4 panes from the View menu. And select code here, press Ctrl+K, and ask for a change to **just that part** — the new lines type themselves in place.",
    de: "Tabs per Drag umsortieren, im Ansichtsmenü 2- oder 4-fach teilen. Und: Code markieren, Strg+K drücken und **nur diesen Teil** ändern lassen — die neuen Zeilen tippen sich an Ort und Stelle.",
    ja: "タブはドラッグで並べ替え、表示メニューから2・4分割できます。さらにコードを選んで Ctrl+K を押せば、**その部分だけ**の修正を頼めます — 変わる行がその場でタイピングされて現れます。",
  },

  // ── 핵심 ─────────────────────────────────────────────────────────────
  "tour.inlineEdit.title": { ko: "Ctrl+K — 선택 영역 편집", en: "Ctrl+K — Edit a Selection", de: "Ctrl+K — Auswahl bearbeiten", ja: "Ctrl+K — 選択範囲を編集" },
  "tour.inlineEdit.body": {
    ko: "코드를 선택하고 Ctrl+K를 누른 뒤 원하는 변경을 말하면, 그 범위에만 적용되는 수정안이 diff로 나옵니다. 파일 전체를 맡기기 전에 좁게 시켜보기 좋아요.",
    en: "Select code, press Ctrl+K, and describe the change. You get a proposal as a diff limited to that range — a good way to start small before handing over a whole file.",
    de: "Code markieren, Ctrl+K drücken und die Änderung beschreiben. Sie erhalten einen Vorschlag als Diff, begrenzt auf diesen Bereich — ideal, um klein anzufangen.",
    ja: "コードを選択してCtrl+Kを押し、変更内容を伝えると、その範囲だけに適用される修正案がdiffで表示されます。ファイル全体を任せる前に小さく試すのに向いています。",
  },

  "tour.chat.title": { ko: "대화", en: "Chat", de: "Chat", ja: "チャット" },
  "tour.chat.body": {
    ko: "하고 싶은 일을 그대로 적으면 됩니다. @로 파일을, ✂로 선택 영역을 붙일 수 있고, /로 시작하면 로그인·설정 같은 명령이 나옵니다. 위 화살표로 보낸 말을 다시 꺼낼 수 있어요.",
    en: "Just say what you want done. Attach files with @ and your selection with ✂; type / for commands like login and settings. Press ↑ to recall what you sent before.",
    de: "Beschreiben Sie einfach, was zu tun ist. Dateien mit @ anhängen, die Auswahl mit ✂; / öffnet Befehle wie Anmeldung und Einstellungen. Mit ↑ frühere Eingaben abrufen.",
    ja: "やりたいことをそのまま書けば大丈夫です。@でファイル、✂で選択範囲を添付でき、/でログインや設定などのコマンドが出ます。↑キーで前に送った内容を呼び出せます。",
  },

  "tour.agents.title": { ko: "에이전트", en: "Agents", de: "Agenten", ja: "エージェント" },
  "tour.agents.body": {
    ko: "연결한 AI들이 여기 뜹니다. 지금 무슨 파일을 보고 있는지, 토큰을 얼마나 썼는지가 실시간으로 보이고, 하나만 따로 멈출 수도 있어요. 관리자로 지정한 에이전트는 다른 에이전트에게 일을 넘길 수 있습니다.",
    en: "Your connected AIs appear here — which file each is working on and how many tokens it has used, live. You can stop just one. An agent marked as manager can hand work to the others.",
    de: "Ihre verbundenen KIs erscheinen hier — woran jede arbeitet und wie viele Token sie verbraucht hat, in Echtzeit. Sie können einzeln stoppen. Ein als Manager markierter Agent kann Arbeit weitergeben.",
    ja: "接続したAIがここに表示されます。どのファイルを扱っているか、トークンをどれだけ使ったかがリアルタイムで見え、1つだけ止めることもできます。管理者に指定したエージェントは他のエージェントに作業を任せられます。",
  },

  "tour.review.title": { ko: "변경 검토 — 여기서 정합니다", en: "Review Changes — You Decide Here", de: "Änderungen prüfen — Sie entscheiden", ja: "変更レビュー — ここで決めます" },
  "tour.review.body": {
    ko: "AI의 수정안은 곧바로 파일에 들어가지 않고 전부 이 패널에 쌓입니다. diff를 보고 하나씩 수락하거나 거절하세요. 자율성 설정을 올리면 위험이 낮은 변경은 자동으로 수락되고, 그 경우 '자동' 배지가 붙습니다.",
    en: "The AI's edits never land straight in your files — they queue up here. Read the diff and accept or reject each one. Raise the autonomy setting and low-risk changes are accepted for you, marked with an \"auto\" badge.",
    de: "Die Änderungen der KI landen nie direkt in Ihren Dateien — sie sammeln sich hier. Diff lesen und einzeln annehmen oder ablehnen. Bei höherer Autonomie werden risikoarme Änderungen automatisch übernommen und mit „auto“ markiert.",
    ja: "AIの修正案がファイルに直接入ることはなく、すべてこのパネルに溜まります。diffを見て1件ずつ承認または却下してください。自律性の設定を上げると低リスクの変更は自動承認され、「自動」バッジが付きます。",
  },

  "tour.runCommand.title": { ko: "명령 실행과 개발 서버", en: "Running Commands & Dev Servers", de: "Befehle & Dev-Server", ja: "コマンド実行と開発サーバー" },
  "tour.runCommand.body": {
    ko: "테스트나 빌드를 시켜보세요. 수동 모드에서는 실행 전에 무슨 명령인지 확인 창이 뜹니다. 개발 서버를 띄우면 주소를 알아채서 편집기 안에 미리보기 탭으로 열어줍니다.",
    en: "Ask it to run tests or a build. In manual mode you're shown the command for approval first. Start a dev server and Schutz picks up the URL and opens a preview tab inside the editor.",
    de: "Lassen Sie Tests oder einen Build laufen. Im manuellen Modus wird der Befehl vorab zur Bestätigung gezeigt. Bei einem Dev-Server erkennt Schutz die URL und öffnet eine Vorschau im Editor.",
    ja: "テストやビルドを実行させてみてください。手動モードでは実行前にコマンドの確認画面が出ます。開発サーバーを起動するとURLを検出し、エディタ内にプレビュータブとして開きます。",
  },

  // ── 개발 환경 ────────────────────────────────────────────────────────
  "tour.terminal.title": { ko: "터미널과 문제", en: "Terminal & Problems", de: "Terminal & Probleme", ja: "ターミナルと問題" },
  // 명령 실행(승인)도 여기서 말한다. 따로 단계를 두면 터미널 바로 옆에서 같은
  // 이야기를 두 번 하게 된다.
  "tour.terminal.body": {
    ko: "진짜 셸입니다 — 대화형 프로그램도 그대로 돌아갑니다. AI 탭에는 에이전트가 지금 무엇을 하는지, 문제 탭에는 언어 서버가 찾은 오류가 모입니다. 에이전트가 명령을 돌리려 하면 **무엇을 돌릴지 먼저 보여주고 물어봅니다** — 승인하기 전에는 아무것도 실행되지 않습니다.",
    en: "A real shell — interactive programs work as they should. The AI tab streams what the agents are doing; Problems collects what the language servers found. When an agent wants to run a command it **shows you the command first and asks** — nothing runs before you approve.",
    de: "Eine echte Shell — interaktive Programme funktionieren wie erwartet. Der KI-Tab zeigt live, was die Agenten tun; Probleme sammelt Funde der Sprachserver. Will ein Agent einen Befehl ausführen, **zeigt er ihn erst und fragt** — vor Ihrer Zustimmung läuft nichts.",
    ja: "本物のシェルです — 対話型プログラムもそのまま動きます。AIタブにはエージェントの動きが、問題タブには言語サーバーが見つけたエラーが集まります。エージェントがコマンドを実行しようとすると、**何を実行するかを先に見せて尋ねます** — 承認するまで何も実行されません。",
  },

  "tour.git.title": { ko: "소스 컨트롤", en: "Source Control", de: "Versionskontrolle", ja: "ソース管理" },
  "tour.git.body": {
    ko: "변경된 파일을 스테이지하고 커밋·푸시합니다. 파일을 클릭하면 HEAD와 나란히 비교되고, 에디터 여백에는 어느 줄이 바뀌었는지 표시됩니다.",
    en: "Stage, commit, and push. Click a changed file to diff it against HEAD side by side; the editor gutter marks which lines changed.",
    de: "Änderungen stagen, committen und pushen. Ein Klick auf eine Datei zeigt den Vergleich mit HEAD; der Editor-Rand markiert geänderte Zeilen.",
    ja: "変更をステージしてコミット・プッシュします。ファイルをクリックするとHEADと並べて比較でき、エディタの余白に変更行が表示されます。",
  },

  "tour.ext.title": { ko: "확장", en: "Extensions", de: "Erweiterungen", ja: "拡張機能" },
  "tour.ext.body": {
    ko: "Open VSX에서 VS Code 확장을 설치할 수 있습니다. 테마와 아이콘 테마, 언어 지원이 그대로 적용됩니다.",
    en: "Install VS Code extensions from Open VSX. Themes, icon themes, and language support all carry over.",
    de: "VS-Code-Erweiterungen aus Open VSX installieren. Themes, Icon-Themes und Sprachunterstützung werden übernommen.",
    ja: "Open VSXからVS Code拡張機能をインストールできます。テーマやアイコンテーマ、言語サポートがそのまま適用されます。",
  },

  "tour.navigate.title": { ko: "빠르게 이동하기", en: "Getting Around Fast", de: "Schnell navigieren", ja: "すばやく移動する" },
  "tour.navigate.body": {
    ko: "Ctrl+P는 파일 열기, Ctrl+Shift+P는 명령 팔레트, Ctrl+T는 심볼 찾기, Ctrl+Shift+F는 프로젝트 전체 검색입니다. 파일 안에서 찾기는 Ctrl+F, 바꾸기는 Ctrl+H예요.",
    en: "Ctrl+P opens files, Ctrl+Shift+P the command palette, Ctrl+T finds symbols, Ctrl+Shift+F searches the whole project. Within a file, Ctrl+F finds and Ctrl+H replaces.",
    de: "Ctrl+P öffnet Dateien, Ctrl+Shift+P die Befehlspalette, Ctrl+T findet Symbole, Ctrl+Shift+F durchsucht das Projekt. In einer Datei: Ctrl+F suchen, Ctrl+H ersetzen.",
    ja: "Ctrl+Pでファイルを開き、Ctrl+Shift+Pでコマンドパレット、Ctrl+Tでシンボル検索、Ctrl+Shift+Fでプロジェクト全体を検索します。ファイル内はCtrl+Fで検索、Ctrl+Hで置換です。",
  },

  "tour.mcp.title": { ko: "MCP 서버", en: "MCP Servers", de: "MCP-Server", ja: "MCPサーバー" },
  "tour.mcp.body": {
    ko: "MCP 도구 서버를 연결하면 AI가 알아서 씁니다. 이미 쓰던 서버를 가져올 수도 있고, 프로젝트를 분석해 새 서버를 만들어낼 수도 있어요.",
    en: "Connect MCP tool servers and the AI uses them on its own. Import ones you already run, or have Schutz analyse a program and generate a new server from it.",
    de: "MCP-Tool-Server verbinden — die KI nutzt sie selbstständig. Vorhandene importieren oder Schutz ein Programm analysieren und daraus einen Server erzeugen lassen.",
    ja: "MCPツールサーバーを接続するとAIが自動的に使います。既に使っているサーバーを取り込むことも、プログラムを解析して新しいサーバーを生成することもできます。",
  },

  "tour.done.title": { ko: "준비됐습니다", en: "You're Set", de: "Alles bereit", ja: "準備完了です" },
  "tour.done.body": {
    ko: "이 안내는 도움말 메뉴의 '튜토리얼 다시 보기'에서 언제든 다시 볼 수 있습니다. 단축키 전체 목록도 같은 메뉴에 있어요.",
    en: "You can replay this walkthrough anytime from Help → Replay Tutorial. The full keyboard shortcut list lives in the same menu.",
    de: "Sie können diese Führung jederzeit über Hilfe → Tutorial wiederholen erneut ansehen. Die vollständige Tastenkürzelliste findet sich im selben Menü.",
    ja: "この案内はヘルプメニューの「チュートリアルをもう一度」からいつでも見返せます。ショートカット一覧も同じメニューにあります。",
  },

  // ── 에이전트 모드 트랙 ──────────────────────────────────────────────
  // 이 모드에 예전엔 단계가 7개뿐이었고 그나마 절반이 공용 크롬이었다.
  "tour.agChat.title": { ko: "대화가 화면 전체입니다", en: "The conversation is the screen", de: "Das Gespräch ist der Bildschirm", ja: "会話が画面全体です" },
  "tour.agChat.body": {
    ko: "파일 트리도 탭도 없습니다. 요청하면 무엇을 읽고 무엇을 고쳤는지가 이 한 줄기로 흐르고, 코드는 필요할 때만 옆에 떠오릅니다.",
    en: "No file tree, no tabs. Ask for something and everything read and changed flows here in one thread — code surfaces beside it only when you need it.",
    de: "Kein Dateibaum, keine Tabs. Stellen Sie eine Anfrage: Gelesenes und Geändertes läuft hier in einem Strang — Code erscheint nur bei Bedarf daneben.",
    ja: "ファイルツリーもタブもありません。依頼すると、何を読み何を変えたかがひと続きで流れ、コードは必要なときだけ横に現れます。",
  },
  "tour.agComposer.title": { ko: "도구는 입력 상자 안에", en: "The tools live in the box", de: "Die Werkzeuge sitzen im Feld", ja: "ツールは入力欄の中に" },
  "tour.agComposer.body": {
    ko: "파일을 붙이고, 편집기에서 고른 부분을 넘기고, 어느 에이전트에게 시킬지 고르는 걸 전부 여기서 합니다. 실행 중에는 보내기 자리가 중지로 바뀝니다.",
    en: "Attach a file, hand over the selection from the editor, pick which agent takes it — all from here. While a run is in flight, send becomes stop.",
    de: "Datei anhängen, die Auswahl aus dem Editor übergeben, den zuständigen Agenten wählen — alles von hier. Während eines Laufs wird aus Senden ein Stopp.",
    ja: "ファイルを添え、エディタで選んだ範囲を渡し、どのエージェントに任せるかを選ぶ — すべてここで行います。実行中は送信が停止に変わります。",
  },
  "tour.agAside.title": { ko: "왼쪽에 늘 있는 것들", en: "Always on the left", de: "Immer links", ja: "左に常にあるもの" },
  "tour.agAside.body": {
    ko: "새 대화를 열고, 이 대화가 만든 변경을 보고, 설정으로 갑니다. 지난 대화는 그 아래에 쌓입니다.",
    en: "Start a new conversation, see what this one changed, jump to settings. Past conversations stack up below.",
    de: "Neue Unterhaltung beginnen, sehen was diese geändert hat, zu den Einstellungen springen. Frühere Unterhaltungen sammeln sich darunter.",
    ja: "新しい会話を始め、この会話が加えた変更を見て、設定へ移ります。過去の会話はその下にたまります。",
  },
  "tour.agRecents.title": { ko: "대화는 지워지지 않습니다", en: "Conversations don't vanish", de: "Unterhaltungen verschwinden nicht", ja: "会話は消えません" },
  "tour.agRecents.body": {
    ko: "새 대화를 열어도 앞의 것은 남습니다. 오늘·어제·이전으로 묶여 있고, 눌러서 언제든 이어갈 수 있습니다.",
    en: "Starting a new one keeps the old ones. They group by today, yesterday, and earlier — click any of them to pick it back up.",
    de: "Eine neue zu beginnen behält die alten. Sie gruppieren sich nach heute, gestern und früher — klicken Sie eine an, um weiterzumachen.",
    ja: "新しく始めても前のものは残ります。今日・昨日・それ以前でまとまり、押せばいつでも続けられます。",
  },
  "tour.agArtifacts.title": { ko: "이 대화가 만든 것", en: "What this conversation made", de: "Was diese Unterhaltung erzeugt hat", ja: "この会話が作ったもの" },
  "tour.agArtifacts.body": {
    ko: "여기 모이는 건 프로젝트 전체 파일이 아니라 **이 대화에서 손댄 것**뿐입니다. 눌러서 오른쪽에 펼쳐 볼 수 있습니다.",
    en: "This collects only what this conversation touched — not every file in the project. Click one to open it on the right.",
    de: "Hier sammelt sich nur, was diese Unterhaltung angefasst hat — nicht jede Datei im Projekt. Klicken Sie eine an, um sie rechts zu öffnen.",
    ja: "ここに集まるのはプロジェクト全体ではなく、**この会話で触れたもの**だけです。押すと右側に開きます。",
  },
  "tour.agSide.title": { ko: "코드는 옆에 뜹니다", en: "Code opens beside you", de: "Code öffnet sich daneben", ja: "コードは横に開きます" },
  "tour.agSide.body": {
    ko: "대화를 덮지 않습니다 — 왼쪽에서 계속 말하면서 오른쪽에서 코드를 볼 수 있어요. 가장자리를 끌어 폭을 바꾸고, Esc 로 닫습니다.",
    en: "It never covers the conversation — keep talking on the left while you read on the right. Drag the edge to resize, Esc to close.",
    de: "Es verdeckt nie das Gespräch — links weiterreden, rechts mitlesen. Ziehen Sie die Kante zum Anpassen, Esc schließt.",
    ja: "会話を覆いません — 左で話しながら右でコードを読めます。端をドラッグして幅を変え、Escで閉じます。",
  },
  "tour.agImport.title": { ko: "쓰던 대화를 데려오기", en: "Bring your old chats", de: "Frühere Chats mitbringen", ja: "使っていた会話を連れてくる" },
  "tour.agImport.body": {
    ko: "Claude Code 나 Codex 로 나눈 대화를 가져와 여기서 이어갈 수 있습니다. 사이드바의 가져오기, 또는 AI 메뉴에서요. 원본 파일은 건드리지 않습니다.",
    en: "Pull in conversations you had in Claude Code or Codex and continue them here — from Import in the sidebar, or the AI menu. The original files are left untouched.",
    de: "Holen Sie Unterhaltungen aus Claude Code oder Codex herüber und führen Sie sie hier fort — über Importieren in der Seitenleiste oder das KI-Menü. Die Originaldateien bleiben unberührt.",
    ja: "Claude Code や Codex での会話を取り込んで、ここで続けられます。サイドバーの取り込む、またはAIメニューから。元のファイルは触りません。",
  },
  "tour.agReview.title": { ko: "반영은 당신이 정합니다", en: "You decide what lands", de: "Sie entscheiden, was bleibt", ja: "反映はあなたが決めます" },
  "tour.agReview.body": {
    ko: "고칠 것이 생기면 흐름 안에 카드로 올라옵니다. 바뀐 줄을 그 자리에서 보고 수락하거나 거절하세요 — 수락하기 전에는 파일이 바뀌지 않습니다.",
    en: "When there's an edit, it arrives as a card in the flow. Read the changed lines right there and accept or reject — nothing touches the file until you accept.",
    de: "Steht eine Änderung an, erscheint sie als Karte im Verlauf. Lesen Sie die geänderten Zeilen dort und nehmen Sie an oder lehnen Sie ab — vor der Annahme ändert sich keine Datei.",
    ja: "直すものがあると流れの中にカードで現れます。変わる行をその場で見て、受け入れるか拒否してください — 受け入れるまでファイルは変わりません。",
  },

  // ── 모드 전환 — 두 트랙을 잇는 다리 ─────────────────────────────────
  "tour.mode.title": { ko: "다른 모양도 있습니다", en: "There's another shape", de: "Es gibt noch eine Form", ja: "もう一つの形もあります" },
  "tour.mode.body": {
    ko: "에디터는 파일과 탭이 중심, 에이전트는 대화가 화면 전체입니다. 여기서 언제든 오갈 수 있고 — 열어둔 파일도 대화도 그대로 남습니다. 프로젝트마다 따로 기억합니다. Ctrl+Shift+M.",
    en: "Editor puts files and tabs at the centre; Agent gives the whole screen to the conversation. Switch anytime here — open files and the conversation both survive. Remembered per project. Ctrl+Shift+M.",
    de: "Editor stellt Dateien und Tabs in den Mittelpunkt; Agent gibt dem Gespräch den ganzen Bildschirm. Jederzeit hier wechseln — offene Dateien und das Gespräch bleiben. Pro Projekt gemerkt. Strg+Umschalt+M.",
    ja: "エディタはファイルとタブが中心、エージェントは会話が画面全体です。ここでいつでも行き来でき、開いたファイルも会話もそのまま残ります。プロジェクトごとに記憶します。Ctrl+Shift+M。",
  },
};
