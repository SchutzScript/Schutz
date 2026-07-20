// 사용법 스포트라이트 투어 문안.
//
// messages.ts 에서 옮겨왔다 — 단계가 6개에서 14개로 늘면서 루트 파일에 두기엔 커졌고,
// 다른 도메인 문자열은 이미 dict/*.ts 로 갈라져 있다.
//
// 문안 원칙: 한 단계에 한 가지만. "어디에 무엇이 있다" 로 끝내지 않고 "그래서 뭘 할 수
// 있다" 까지 쓴다 — 위치만 알려주면 투어가 끝난 뒤 아무것도 남지 않는다.
export const dict: Record<string, Record<string, string>> = {
  "tour.progress": { ko: "{cur} / {total}", en: "{cur} / {total}", de: "{cur} / {total}", ja: "{cur} / {total}" },

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
  "tour.editor.body": {
    ko: "탭을 드래그해 순서를 바꾸고, 보기 메뉴에서 화면을 2·4분할할 수 있습니다. 파일이 많으면 탭 줄을 휠로 굴리세요.",
    en: "Drag tabs to reorder them, and split the view into 2 or 4 panes from the View menu. With many files open, scroll the tab strip with the wheel.",
    de: "Tabs per Drag umsortieren; im Ansichtsmenü lässt sich die Fläche 2- oder 4-fach teilen. Bei vielen Dateien die Tab-Leiste mit dem Mausrad scrollen.",
    ja: "タブはドラッグで並べ替えでき、表示メニューから画面を2分割・4分割できます。ファイルが多いときはタブ列をホイールでスクロールします。",
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
  "tour.terminal.body": {
    ko: "진짜 셸입니다 — 대화형 프로그램도 그대로 돌아갑니다. 탭을 여러 개 열 수 있고, AI 탭에는 에이전트가 지금 무엇을 하는지 흘러갑니다. 문제 탭에는 언어 서버가 찾은 오류와 경고가 모입니다.",
    en: "A real shell — interactive programs work as they should. Open multiple tabs; the AI tab streams what the agents are doing right now. The Problems tab collects errors and warnings from the language servers.",
    de: "Eine echte Shell — interaktive Programme funktionieren wie erwartet. Mehrere Tabs möglich; der KI-Tab zeigt live, was die Agenten tun. Der Probleme-Tab sammelt Fehler und Warnungen der Sprachserver.",
    ja: "本物のシェルです — 対話型プログラムもそのまま動きます。タブを複数開けて、AIタブにはエージェントの動きが流れます。問題タブには言語サーバーが見つけたエラーと警告が集まります。",
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
};
