// 다국어 사전 — { "area.item": { ko, en, de, ja } }. 4개 번역을 나란히 두어 동기화한다.
// Phase C 에서 전 UI 문자열을 이곳으로 이관한다. 코드 주석(한국어)은 번역 대상 아님.
// 도메인별 사전(dict/*.ts)은 파일 단위로 분리해 병합한다.
import { dict as d_dap } from "./dict/dap";
import { dict as d_data } from "./dict/data";
import { dict as d_exth } from "./dict/exth";
import { dict as d_mcpc } from "./dict/mcpc";
import { dict as d_media } from "./dict/media";
import { dict as d_model } from "./dict/model";
import { dict as d_mono } from "./dict/mono";
import { dict as d_oai } from "./dict/oai";
import { dict as d_ob } from "./dict/ob";
import { dict as d_reg } from "./dict/reg";
import { dict as d_gitp } from "./dict/gitp";
import { dict as d_flowtree } from "./dict/flowtree";
import { dict as d_dbg } from "./dict/dbg";
import { dict as d_mcpui } from "./dict/mcpui";
import { dict as d_modal } from "./dict/modal";
import { dict as d_cmds } from "./dict/cmds";
import { dict as d_palette } from "./dict/palette";
import { dict as d_extd } from "./dict/extd";
import { dict as d_misc } from "./dict/misc";
import { dict as d_engine } from "./dict/engine";
import { dict as d_tour } from "./dict/tour";
import { dict as d_mode } from "./dict/mode";
import { dict as d_cliimp } from "./dict/cliimp";
import { dict as d_open } from "./dict/open";
import { dict as d_chat2 } from "./dict/chat2";
import { dict as d_sc1 } from "./dict/sc1";
import { dict as d_sc2 } from "./dict/sc2";
import { dict as d_sc3 } from "./dict/sc3";
import { dict as d_sc4 } from "./dict/sc4";
import { dict as d_sc5 } from "./dict/sc5";
import { dict as d_eng } from "./dict/eng";
import { dict as d_plug } from "./dict/plug";

export type Msg = { ko: string; en: string; de: string; ja: string };

export const MESSAGES: Record<string, Msg> = {
  ...d_dap, ...d_data, ...d_exth, ...d_mcpc, ...d_media, ...d_model, ...d_mono, ...d_oai, ...d_ob, ...d_reg,
  ...d_gitp, ...d_flowtree, ...d_dbg, ...d_mcpui, ...d_modal, ...d_cmds, ...d_palette, ...d_extd, ...d_misc, ...d_chat2, ...d_engine, ...d_tour, ...d_open, ...d_mode, ...d_cliimp,
  ...d_sc1, ...d_sc2, ...d_sc3, ...d_sc4, ...d_sc5, ...d_eng, ...d_plug,
  // ── 공통 ────────────────────────────────────────────────
  "common.next": { ko: "다음", en: "Next", de: "Weiter", ja: "次へ" },
  "common.prev": { ko: "이전", en: "Back", de: "Zurück", ja: "戻る" },
  "common.skip": { ko: "건너뛰기", en: "Skip", de: "Überspringen", ja: "スキップ" },
  "common.done": { ko: "완료", en: "Done", de: "Fertig", ja: "完了" },
  "common.close": { ko: "닫기", en: "Close", de: "Schließen", ja: "閉じる" },
  "common.cancel": { ko: "취소", en: "Cancel", de: "Abbrechen", ja: "キャンセル" },
  "common.start": { ko: "시작", en: "Start", de: "Starten", ja: "開始" },
  "common.refresh": { ko: "새로고침", en: "Refresh", de: "Aktualisieren", ja: "更新" },
  "common.folder": { ko: "폴더", en: "Folder", de: "Ordner", ja: "フォルダ" },

  // ── 확장 패널 (UI) ──────────────────────────────────────
  "extui.searchPlaceholder": { ko: "확장 검색 (Open VSX 마켓플레이스)", en: "Search extensions (Open VSX marketplace)", de: "Erweiterungen suchen (Open-VSX-Marktplatz)", ja: "拡張機能を検索(Open VSXマーケットプレイス)" },
  "extui.installed": { ko: "✓ 설치됨", en: "✓ Installed", de: "✓ Installiert", ja: "✓ インストール済み" },
  "extui.install": { ko: "설치", en: "Install", de: "Installieren", ja: "インストール" },
  "extui.installing": { ko: "설치 중…", en: "Installing…", de: "Installiere…", ja: "インストール中…" },
  "extui.noResults1": { ko: "'{q}'에 대한 결과가 없습니다.", en: "No results for '{q}'.", de: "Keine Ergebnisse für '{q}'.", ja: "'{q}' の結果がありません。" },
  "extui.noResults2": { ko: "다른 검색어를 입력해 보세요.", en: "Try a different search term.", de: "Versuchen Sie einen anderen Suchbegriff.", ja: "別の検索語をお試しください。" },
  "extui.installedHdr": { ko: "설치된 확장", en: "Installed Extensions", de: "Installierte Erweiterungen", ja: "インストール済み拡張機能" },
  "extui.none": { ko: "설치된 확장이 없습니다.", en: "No extensions installed.", de: "Keine Erweiterungen installiert.", ja: "インストール済みの拡張機能はありません。" },
  "extui.programmatic": { ko: "· 프로그램형", en: "· programmatic", de: "· programmatisch", ja: "· プログラム型" },
  "extui.enabled": { ko: "활성", en: "Enabled", de: "Aktiviert", ja: "有効" },
  "extui.disabled": { ko: "비활성", en: "Disabled", de: "Deaktiviert", ja: "無効" },

  // ── 좌측 패널 헤더 · 공통 UI ────────────────────────────
  "panel.tree": { ko: "프로젝트", en: "Project", de: "Projekt", ja: "プロジェクト" },
  "panel.flow": { ko: "작업 흐름", en: "Workflow", de: "Arbeitsablauf", ja: "ワークフロー" },
  "panel.git": { ko: "소스 컨트롤", en: "Source Control", de: "Versionskontrolle", ja: "ソース管理" },
  "panel.debug": { ko: "실행 · 디버그", en: "Run · Debug", de: "Ausführen · Debug", ja: "実行・デバッグ" },
  "panel.ext": { ko: "확장", en: "Extensions", de: "Erweiterungen", ja: "拡張機能" },
  "editor.preview": { ko: "미리보기", en: "Preview", de: "Vorschau", ja: "プレビュー" },
  "editor.code": { ko: "코드", en: "Code", de: "Code", ja: "コード" },
  "editor.previewTitle": { ko: "마크다운 미리보기 전환", en: "Toggle Markdown preview", de: "Markdown-Vorschau umschalten", ja: "Markdownプレビュー切替" },
  "topstatus.idle": { ko: "대기 중", en: "Idle", de: "Bereit", ja: "待機中" },
  "topstatus.thinking": { ko: "계획 수립 중…", en: "Planning…", de: "Plant…", ja: "計画中…" },
  "topstatus.tool": { ko: "동시 작업 중…", en: "Working…", de: "Arbeitet…", ja: "作業中…" },
  "topstatus.review": { ko: "검토 대기", en: "Pending review", de: "Prüfung ausstehend", ja: "レビュー待ち" },
  "topstatus.stopped": { ko: "중지됨", en: "Stopped", de: "Gestoppt", ja: "停止済み" },
  "term.close": { ko: "터미널 닫기", en: "Close terminal", de: "Terminal schließen", ja: "ターミナルを閉じる" },
  "term.toolDone": { ko: "완료", en: "Done", de: "Fertig", ja: "完了" },
  "sc1.editorTheme": { ko: "에디터 테마: {label}", en: "Editor theme: {label}", de: "Editor-Design: {label}", ja: "エディタテーマ: {label}" },
  "sc3.builtinIconUse": { ko: "내장 파일 아이콘 사용", en: "Using built-in file icons", de: "Integrierte Datei-Icons aktiv", ja: "内蔵ファイルアイコンを使用" },
  "sc3.iconThemeSet": { ko: "아이콘 테마: {label}", en: "Icon theme: {label}", de: "Icon-Design: {label}", ja: "アイコンテーマ: {label}" },
  "sc3.iconThemeFail": { ko: "아이콘 테마 적용 실패", en: "Failed to apply icon theme", de: "Icon-Design konnte nicht angewendet werden", ja: "アイコンテーマの適用に失敗" },
  "proposal.fileExists": { ko: "이미 존재하는 파일입니다 (덮어쓰기 방지)", en: "File already exists (overwrite prevented)", de: "Datei existiert bereits (Überschreiben verhindert)", ja: "既に存在するファイルです(上書き防止)" },

  // ── 슬래시 명령 설명 (SLASH_COMMANDS.desc) ──────────────
  "slash.help": { ko: "명령어 레퍼런스 열기", en: "Open command reference", de: "Befehlsreferenz öffnen", ja: "コマンドリファレンスを開く" },
  "slash.model": { ko: "모델 확인 · 변경", en: "View · change model", de: "Modell anzeigen · ändern", ja: "モデルの確認・変更" },
  "slash.argAgentModel": { ko: "<에이전트> <모델>", en: "<agent> <model>", de: "<Agent> <Modell>", ja: "<エージェント> <モデル>" },
  "slash.usage": { ko: "세션 토큰 · 비용 대시보드", en: "Session token · cost dashboard", de: "Sitzungs-Token · Kosten-Dashboard", ja: "セッショントークン・コストダッシュボード" },
  "slash.agents": { ko: "에이전트 연결 상태", en: "Agent connection status", de: "Agenten-Verbindungsstatus", ja: "エージェント接続状態" },
  "slash.clear": { ko: "대화 초기화", en: "Clear conversation", de: "Unterhaltung leeren", ja: "会話をクリア" },
  "slash.new": { ko: "새 대화 시작", en: "Start new conversation", de: "Neue Unterhaltung", ja: "新しい会話を開始" },
  "slash.settings": { ko: "설정 열기", en: "Open settings", de: "Einstellungen öffnen", ja: "設定を開く" },
  "slash.keys": { ko: "키보드 단축키", en: "Keyboard shortcuts", de: "Tastenkürzel", ja: "キーボードショートカット" },
  "slash.vim": { ko: "Vim 키맵 토글", en: "Toggle Vim keymap", de: "Vim-Tastenzuordnung umschalten", ja: "Vimキーマップ切替" },
  "slash.theme": { ko: "테마 순환", en: "Cycle theme", de: "Design wechseln", ja: "テーマを循環" },
  "slash.preview": { ko: "실행 중인 서버 화면 열기", en: "Open a running server's screen", de: "Bildschirm eines laufenden Servers öffnen", ja: "実行中のサーバー画面を開く" },
  "slash.argUrl": { ko: "[주소]", en: "[url]", de: "[URL]", ja: "[アドレス]" },
  "slash.terminal": { ko: "터미널 토글", en: "Toggle terminal", de: "Terminal umschalten", ja: "ターミナル切替" },
  "slash.diff": { ko: "소스 컨트롤(변경) 패널", en: "Source control (changes) panel", de: "Versionskontroll-Panel (Änderungen)", ja: "ソース管理(変更)パネル" },
  "slash.git": { ko: "소스 컨트롤 패널", en: "Source control panel", de: "Versionskontroll-Panel", ja: "ソース管理パネル" },
  "slash.resume": { ko: "마지막 세션 이어가기", en: "Resume last session", de: "Letzte Sitzung fortsetzen", ja: "最後のセッションを再開" },
  "slash.doctor": { ko: "CLI · 연결 상태 점검", en: "Check CLI · connection status", de: "CLI · Verbindungsstatus prüfen", ja: "CLI・接続状態を点検" },
  "slash.status": { ko: "연결 · 세션 상태", en: "Connection · session status", de: "Verbindungs- · Sitzungsstatus", ja: "接続・セッション状態" },
  "slash.login": { ko: "구독 계정 로그인", en: "Subscription login", de: "Abo-Anmeldung", ja: "サブスクリプションでログイン" },
  "slash.logout": { ko: "로그아웃", en: "Log out", de: "Abmelden", ja: "ログアウト" },
  "slash.memory": { ko: "메모리 파일 열기 (CLAUDE.md)", en: "Open memory file (CLAUDE.md)", de: "Memory-Datei öffnen (CLAUDE.md)", ja: "メモリファイルを開く (CLAUDE.md)" },
  "slash.initClaude": { ko: "프로젝트 분석 후 CLAUDE.md 생성", en: "Analyze project, generate CLAUDE.md", de: "Projekt analysieren, CLAUDE.md erstellen", ja: "プロジェクトを分析してCLAUDE.md生成" },
  "slash.review": { ko: "변경사항 코드 리뷰", en: "Code-review changes", de: "Änderungen per Code-Review", ja: "変更のコードレビュー" },
  "slash.securityReview": { ko: "보안 관점 리뷰", en: "Security review", de: "Sicherheitsprüfung", ja: "セキュリティレビュー" },
  "slash.prComments": { ko: "PR 코멘트 가져오기", en: "Fetch PR comments", de: "PR-Kommentare abrufen", ja: "PRコメントを取得" },
  "slash.compact": { ko: "세션 컨텍스트 압축 (이어가기)", en: "Compact session context (continue)", de: "Sitzungskontext komprimieren (fortsetzen)", ja: "セッションコンテキストを圧縮(継続)" },
  "slash.initCodex": { ko: "프로젝트 분석 후 AGENTS.md 생성", en: "Analyze project, generate AGENTS.md", de: "Projekt analysieren, AGENTS.md erstellen", ja: "プロジェクトを分析してAGENTS.md生成" },
  "slash.reviewCodex": { ko: "변경사항 리뷰", en: "Review changes", de: "Änderungen prüfen", ja: "変更をレビュー" },

  // ── 상단 메뉴 (라벨) ────────────────────────────────────
  "menu.file": { ko: "파일", en: "File", de: "Datei", ja: "ファイル" },
  "menu.edit": { ko: "편집", en: "Edit", de: "Bearbeiten", ja: "編集" },
  "menu.view": { ko: "보기", en: "View", de: "Ansicht", ja: "表示" },
  "menu.nav": { ko: "이동", en: "Go", de: "Gehe zu", ja: "移動" },
  "menu.ai": { ko: "AI", en: "AI", de: "AI", ja: "AI" },
  "menu.help": { ko: "도움말", en: "Help", de: "Hilfe", ja: "ヘルプ" },

  // ── 메뉴 항목 (actionKey) ───────────────────────────────
  "menu.file.new": { ko: "새 파일", en: "New File", de: "Neue Datei", ja: "新規ファイル" },
  "menu.file.newWindow": { ko: "새 창", en: "New Window", de: "Neues Fenster", ja: "新規ウィンドウ" },
  "menu.file.openProject": { ko: "프로젝트 열기…", en: "Open Project…", de: "Projekt öffnen…", ja: "プロジェクトを開く…" },
  "menu.file.save": { ko: "저장", en: "Save", de: "Speichern", ja: "保存" },
  "menu.file.saveAll": { ko: "모두 저장", en: "Save All", de: "Alle speichern", ja: "すべて保存" },
  "menu.file.settings": { ko: "설정…", en: "Settings…", de: "Einstellungen…", ja: "設定…" },
  "menu.edit.undo": { ko: "실행 취소", en: "Undo", de: "Rückgängig", ja: "元に戻す" },
  "menu.edit.redo": { ko: "다시 실행", en: "Redo", de: "Wiederholen", ja: "やり直し" },
  "menu.edit.cut": { ko: "잘라내기", en: "Cut", de: "Ausschneiden", ja: "切り取り" },
  "menu.edit.copy": { ko: "복사", en: "Copy", de: "Kopieren", ja: "コピー" },
  "menu.edit.paste": { ko: "붙여넣기", en: "Paste", de: "Einfügen", ja: "貼り付け" },
  "menu.edit.replace": { ko: "바꾸기", en: "Replace", de: "Ersetzen", ja: "置換" },
  "menu.edit.findInFiles": { ko: "파일에서 찾기", en: "Find in Files", de: "In Dateien suchen", ja: "ファイル内を検索" },
  "menu.edit.find": { ko: "찾기", en: "Find", de: "Suchen", ja: "検索" },
  "menu.view.splitReset": { ko: "분할 해제", en: "Single Layout", de: "Teilung aufheben", ja: "分割解除" },
  "menu.view.mode": { ko: "모드 전환", en: "Switch Mode", de: "Modus wechseln", ja: "モード切り替え" },
  "menu.view.split2": { ko: "에디터 2분할", en: "Split Editor: 2", de: "Editor 2-fach teilen", ja: "エディタ2分割" },
  "menu.view.split4": { ko: "에디터 4분할", en: "Split Editor: 4", de: "Editor 4-fach teilen", ja: "エディタ4分割" },
  "menu.view.format": { ko: "문서 포맷", en: "Format Document", de: "Dokument formatieren", ja: "ドキュメント整形" },
  "menu.view.wordWrap": { ko: "줄 바꿈", en: "Word Wrap", de: "Zeilenumbruch", ja: "折り返し" },
  "menu.view.minimap": { ko: "미니맵", en: "Minimap", de: "Minimap", ja: "ミニマップ" },
  "menu.view.problems": { ko: "문제", en: "Problems", de: "Probleme", ja: "問題" },
  "menu.view.terminal": { ko: "터미널", en: "Terminal", de: "Terminal", ja: "ターミナル" },
  "menu.nav.quickOpen": { ko: "파일로 이동", en: "Go to File", de: "Gehe zu Datei", ja: "ファイルへ移動" },
  "menu.nav.commandPalette": { ko: "명령 팔레트", en: "Command Palette", de: "Befehlspalette", ja: "コマンドパレット" },
  "menu.nav.symbol": { ko: "심볼로 이동", en: "Go to Symbol", de: "Gehe zu Symbol", ja: "シンボルへ移動" },
  "menu.ai.models": { ko: "모델 관리…", en: "Manage Models…", de: "Modelle verwalten…", ja: "モデル管理…" },
  "menu.ai.usage": { ko: "사용량 대시보드", en: "Usage Dashboard", de: "Nutzungs-Dashboard", ja: "使用量ダッシュボード" },
  "menu.ai.mcp": { ko: "MCP 서버…", en: "MCP Servers…", de: "MCP-Server…", ja: "MCPサーバー…" },
  "menu.editorOnly": { ko: "{item}은(는) 에디터 모드에서만 됩니다. 오른쪽 위에서 에디터로 바꿔 보세요.", en: "{item} only works in editor mode. Switch at the top right.", de: "{item} funktioniert nur im Editor-Modus. Oben rechts umschalten.", ja: "{item} はエディタモードでのみ使えます。右上で切り替えてください。" },
  "menu.ai.plugins": { ko: "플러그인 창작마당…", en: "Plugin Marketplace…", de: "Plugin-Marktplatz…", ja: "プラグイン マーケット…" },
  "menu.ai.engine": { ko: "게임 엔진…", en: "Game Engine…", de: "Game-Engine…", ja: "ゲームエンジン…" },
  // 메뉴는 좁다 — 팔레트 쪽(imp.command)은 어느 도구인지까지 밝히지만 여기선 줄인다.
  "menu.ai.import": { ko: "지난 대화 가져오기…", en: "Import Past Chats…", de: "Frühere Unterhaltungen holen…", ja: "過去の会話を取り込む…" },
  "menu.help.keys": { ko: "단축키 목록", en: "Keyboard Shortcuts", de: "Tastenkürzel", ja: "キーボードショートカット" },
  "menu.help.about": { ko: "Schutz 정보", en: "About Schutz", de: "Über Schutz", ja: "Schutzについて" },
  "menu.help.replayOpening": { ko: "오프닝 다시 보기", en: "Replay Opening", de: "Einführung wiederholen", ja: "オープニングをもう一度" },
  "menu.help.replayTutorial": { ko: "튜토리얼 다시 보기", en: "Replay Tutorial", de: "Tutorial wiederholen", ja: "チュートリアルを再生" },

  // ── 타이틀바 ────────────────────────────────────────────
  "title.goToFile": { ko: "파일로 이동 (Ctrl+P)", en: "Go to File (Ctrl+P)", de: "Gehe zu Datei (Ctrl+P)", ja: "ファイルへ移動 (Ctrl+P)" },
  "title.mcp": { ko: "MCP 서버", en: "MCP Servers", de: "MCP-Server", ja: "MCPサーバー" },

  // ── 설정: 언어 ──────────────────────────────────────────
  "settings.language": { ko: "언어", en: "Language", de: "Sprache", ja: "言語" },

  // ── 설정 모달 ───────────────────────────────────────────
  "settings.title": { ko: "설정", en: "Settings", de: "Einstellungen", ja: "設定" },
  "settings.subLogin": { ko: "구독 계정 로그인 (권장 · API 키 불필요)", en: "Subscription Login (recommended · no API key)", de: "Abo-Anmeldung (empfohlen · kein API-Schlüssel)", ja: "サブスクリプションでログイン(推奨・APIキー不要)" },
  "settings.planClaude": { ko: "Claude (Pro/Max 구독)", en: "Claude (Pro/Max plan)", de: "Claude (Pro/Max-Abo)", ja: "Claude (Pro/Maxプラン)" },
  "settings.planCodex": { ko: "ChatGPT (Plus/Pro 구독)", en: "ChatGPT (Plus/Pro plan)", de: "ChatGPT (Plus/Pro-Abo)", ja: "ChatGPT (Plus/Proプラン)" },
  "settings.connectedTag": { ko: "· 연결됨", en: "· connected", de: "· verbunden", ja: "· 接続済み" },
  "settings.disconnectedTag": { ko: "· 미연결", en: "· not connected", de: "· nicht verbunden", ja: "· 未接続" },
  "settings.disconnect": { ko: "해제", en: "Disconnect", de: "Trennen", ja: "解除" },
  "settings.login": { ko: "로그인", en: "Log in", de: "Anmelden", ja: "ログイン" },
  "settings.oauthPaste": { ko: "브라우저 승인 후 코드를 붙여넣으세요", en: "Paste the code after approving in the browser", de: "Code nach der Browser-Freigabe einfügen", ja: "ブラウザで承認後、コードを貼り付けてください" },
  "settings.connect": { ko: "연결", en: "Connect", de: "Verbinden", ja: "接続" },
  "settings.oauthWaitMsg": { ko: "브라우저에서 승인하면 자동으로 연결됩니다…", en: "It connects automatically once you approve in the browser…", de: "Verbindet automatisch nach der Freigabe im Browser…", ja: "ブラウザで承認すると自動的に接続されます…" },
  "settings.noSubNote": { ko: "Grok·GLM은 구독 로그인 미제공 — API 키 방식만 지원됩니다.", en: "Grok·GLM have no subscription login — API key only.", de: "Grok·GLM bieten keine Abo-Anmeldung — nur API-Schlüssel.", ja: "Grok・GLMはサブスクリプションログイン非対応 — APIキーのみ対応。" },
  "settings.apiKeysTitle": { ko: "AI 프로바이더 API 키", en: "AI Provider API Keys", de: "API-Schlüssel der KI-Anbieter", ja: "AIプロバイダー APIキー" },
  "settings.apiKeysOptional": { ko: "(선택 — 구독 인증이 우선)", en: "(optional — subscription auth takes priority)", de: "(optional — Abo-Anmeldung hat Vorrang)", ja: "(任意 — サブスク認証が優先)" },
  "settings.apiKeyPlaceholder": { ko: "API 키 (비우면 미사용)", en: "API key (leave empty to disable)", de: "API-Schlüssel (leer = deaktiviert)", ja: "APIキー(空欄で未使用)" },
  "settings.test": { ko: "테스트", en: "Test", de: "Testen", ja: "テスト" },
  "settings.keysNote": { ko: "키는 이 기기(localStorage)에만 저장됩니다. [테스트]는 실제 API를 1회 호출해 연결을 검증합니다.", en: "Keys are stored only on this device (localStorage). [Test] makes one real API call to verify the connection.", de: "Schlüssel werden nur auf diesem Gerät (localStorage) gespeichert. [Test] ruft die API einmal auf, um die Verbindung zu prüfen.", ja: "キーはこの端末(localStorage)にのみ保存されます。[テスト]は実際にAPIを1回呼び出して接続を確認します。" },
  "settings.editor": { ko: "에디터", en: "Editor", de: "Editor", ja: "エディタ" },
  "settings.codeFont": { ko: "코드 폰트", en: "Code font", de: "Code-Schrift", ja: "コードフォント" },
  "settings.uiFont": { ko: "UI 폰트", en: "UI font", de: "UI-Schrift", ja: "UIフォント" },
  "settings.codeSize": { ko: "코드 크기", en: "Code size", de: "Code-Größe", ja: "コードサイズ" },
  "settings.keymap": { ko: "키맵", en: "Keymap", de: "Tastenzuordnung", ja: "キーマップ" },
  "settings.wordWrap": { ko: "줄 바꿈", en: "Word wrap", de: "Zeilenumbruch", ja: "折り返し" },
  "settings.minimap": { ko: "미니맵", en: "Minimap", de: "Minimap", ja: "ミニマップ" },
  "settings.formatOnSave": { ko: "저장 시 포맷", en: "Format on save", de: "Beim Speichern formatieren", ja: "保存時に整形" },
  "settings.lineNumbers": { ko: "줄 번호", en: "Line numbers", de: "Zeilennummern", ja: "行番号" },
  "settings.renderWhitespace": { ko: "공백 표시", en: "Show whitespace", de: "Leerzeichen anzeigen", ja: "空白を表示" },
  "settings.autoSave": { ko: "자동 저장", en: "Auto save", de: "Autom. Speichern", ja: "自動保存" },
  "settings.autoSaveOff": { ko: "끔", en: "Off", de: "Aus", ja: "オフ" },
  "settings.autoSaveDelay": { ko: "지연 후", en: "After delay", de: "Nach Verzögerung", ja: "遅延後" },
  "settings.autoSaveFocus": { ko: "포커스 이동 시", en: "On focus change", de: "Bei Fokuswechsel", ja: "フォーカス移動時" },
  "settings.tabSize": { ko: "탭 크기", en: "Tab size", de: "Tab-Breite", ja: "タブ幅" },
  "settings.cursor": { ko: "커서", en: "Cursor", de: "Cursor", ja: "カーソル" },
  "settings.cursorLine": { ko: "라인", en: "Line", de: "Linie", ja: "ライン" },
  "settings.cursorBlock": { ko: "블록", en: "Block", de: "Block", ja: "ブロック" },
  "settings.cursorUnderline": { ko: "밑줄", en: "Underline", de: "Unterstrich", ja: "下線" },
  "settings.editorNote": { ko: "변경은 열려 있는 편집기에 즉시 적용됩니다. Vim은 상태줄에 모드가 표시됩니다.", en: "Changes apply instantly to open editors. Vim shows the mode in the status bar.", de: "Änderungen gelten sofort für offene Editoren. Vim zeigt den Modus in der Statusleiste.", ja: "変更は開いているエディタに即時反映されます。Vimはステータスバーにモードを表示します。" },
  "settings.theme": { ko: "테마", en: "Theme", de: "Design", ja: "テーマ" },
  "settings.importedThemes": { ko: "가져온 VS Code 테마 (에디터)", en: "Imported VS Code themes (editor)", de: "Importierte VS-Code-Designs (Editor)", ja: "インポートしたVS Codeテーマ(エディタ)" },
  "settings.iconThemes": { ko: "파일 아이콘 테마 (VS Code)", en: "File icon themes (VS Code)", de: "Datei-Icon-Designs (VS Code)", ja: "ファイルアイコンテーマ(VS Code)" },
  "settings.builtinIcon": { ko: "내장(Schutz)", en: "Built-in (Schutz)", de: "Integriert (Schutz)", ja: "内蔵(Schutz)" },
  "settings.shortcuts": { ko: "단축키", en: "Shortcuts", de: "Tastenkürzel", ja: "ショートカット" },
  "settings.viewAllKeys": { ko: "키보드 단축키 전체 보기 →", en: "View all keyboard shortcuts →", de: "Alle Tastenkürzel anzeigen →", ja: "すべてのショートカットを表示 →" },
  "settings.autonomy": { ko: "자율성 · 자동 수락", en: "Autonomy · Auto-accept", de: "Autonomie · Auto-Annahme", ja: "自律性・自動承認" },
  "settings.autoManual": { ko: "수동 검토", en: "Manual review", de: "Manuelle Prüfung", ja: "手動レビュー" },
  "settings.autoBalanced": { ko: "균형", en: "Balanced", de: "Ausgewogen", ja: "バランス" },
  "settings.autoAuto": { ko: "자율", en: "Autonomous", de: "Autonom", ja: "自律" },
  "settings.autoManualDesc": { ko: "모든 제안을 직접 수락합니다.", en: "You accept every proposal yourself.", de: "Sie nehmen jeden Vorschlag selbst an.", ja: "すべての提案を自分で承認します。" },
  "settings.autoBalancedDesc": { ko: "아래 규칙에 맞는 저위험 변경만 자동 수락하고 나머지는 검토합니다.", en: "Auto-accepts only low-risk changes matching the rules below; the rest are reviewed.", de: "Akzeptiert automatisch nur risikoarme Änderungen gemäß den Regeln unten; der Rest wird geprüft.", ja: "以下のルールに合う低リスクの変更のみ自動承認し、残りはレビューします。" },
  "settings.autoAutoDesc": { ko: "모든 변경을 즉시 적용하고 사후에 검토합니다. (변경 검토 패널에 기록)", en: "Applies all changes immediately and reviews afterward. (logged in the review panel)", de: "Wendet alle Änderungen sofort an und prüft danach. (im Prüf-Panel protokolliert)", ja: "すべての変更を即時適用し、後でレビューします。(変更レビューパネルに記録)" },
  "settings.ruleDocs": { ko: "문서 · 주석", en: "Docs · comments", de: "Doku · Kommentare", ja: "ドキュメント・コメント" },
  "settings.ruleTests": { ko: "테스트 파일", en: "Test files", de: "Testdateien", ja: "テストファイル" },
  "settings.ruleDeps": { ko: "의존성", en: "Dependencies", de: "Abhängigkeiten", ja: "依存関係" },

  // ── 상태 바 ─────────────────────────────────────────────
  "status.changes": { ko: "변경 {n}개", en: "{n} changes", de: "{n} Änderungen", ja: "変更 {n}件" },
  "status.pendingReview": { ko: "검토 대기 {n}개 파일", en: "{n} files pending review", de: "{n} Dateien zur Prüfung", ja: "レビュー待ち {n}ファイル" },
  "status.noChanges": { ko: "변경 없음", en: "No changes", de: "Keine Änderungen", ja: "変更なし" },
  "status.agentsActive": { ko: "에이전트 {active}/{total} 활성", en: "{active}/{total} agents active", de: "{active}/{total} Agenten aktiv", ja: "エージェント {active}/{total} 稼働" },
  "status.terminal": { ko: "터미널", en: "Terminal", de: "Terminal", ja: "ターミナル" },

  // ── 채팅 ────────────────────────────────────────────────
  "chat.title": { ko: "대화", en: "Chat", de: "Chat", ja: "チャット" },
  // 에이전트별 채팅 탭 — 여러 에이전트가 한 스트림에 섞여 누가 한 말인지 헷갈리던 문제
  // 셸 명령 실행 승인 — window.confirm 은 렌더러를 얼려서 인앱 모달로 대체
  "run.askTitle": { ko: "명령을 실행할까요?", en: "Run this command?", de: "Diesen Befehl ausführen?", ja: "このコマンドを実行しますか？" },
  "run.askHint": { ko: "셸 명령은 되돌릴 수 없습니다. 설정에서 자율성을 '자율'로 두면 묻지 않습니다.", en: "Shell commands cannot be undone. Set autonomy to 'auto' in settings to stop asking.", de: "Shell-Befehle sind nicht umkehrbar. Autonomie in den Einstellungen auf 'auto' setzen, um nicht mehr zu fragen.", ja: "シェルコマンドは元に戻せません。設定で自律性を「自律」にすると確認しません。" },
  "run.approve": { ko: "실행", en: "Run", de: "Ausführen", ja: "実行" },
  "run.reject": { ko: "거절", en: "Reject", de: "Ablehnen", ja: "拒否" },
  // 개발 서버 미리보기 — 에이전트가 background 로 띄운 서버 화면을 편집 그룹에 연다
  "preview.openExternal": { ko: "브라우저로 열기", en: "Open in browser", de: "Im Browser öffnen", ja: "ブラウザで開く" },
  "preview.slowHint": { ko: "화면이 아직 안 뜹니다. 서버가 준비 중이거나, 이 주소가 프레임 안에서 열리는 것을 막고 있을 수 있습니다 — [브라우저로 열기]를 눌러보세요.", en: "Nothing yet. The server may still be starting, or this address may refuse to load in a frame — try [Open in browser].", de: "Noch nichts. Der Server startet möglicherweise noch, oder diese Adresse verweigert das Laden im Frame — versuche [Im Browser öffnen].", ja: "まだ表示されません。サーバーが起動中か、このアドレスがフレーム内での表示を拒否している可能性があります — [ブラウザで開く]をお試しください。" },
  "chat.tabAll": { ko: "전체", en: "All", de: "Alle", ja: "すべて" },
  "chat.continueTitle": { ko: "이 폴더의 최근 Claude 세션을 이어서 진행", en: "Continue the latest Claude session for this folder", de: "Letzte Claude-Sitzung für diesen Ordner fortsetzen", ja: "このフォルダの最新のClaudeセッションを継続" },
  "chat.continuePrompt": { ko: "직전 작업을 이어서 계속 진행해줘.", en: "Continue from where the previous work left off.", de: "Setze die vorherige Arbeit dort fort, wo sie aufgehört hat.", ja: "直前の作業を続けて進めてください。" },
  "chat.continue": { ko: "이어가기", en: "Continue", de: "Fortsetzen", ja: "続ける" },
  "chat.stop": { ko: "중지", en: "Stop", de: "Stopp", ja: "停止" },
  "chat.attachFile": { ko: "＠ 파일", en: "＠ File", de: "＠ Datei", ja: "＠ ファイル" },
  "chat.attachSelection": { ko: "✂ 선택", en: "✂ Selection", de: "✂ Auswahl", ja: "✂ 選択" },
  "chat.attachFileTitle": { ko: "파일 첨부 (@)", en: "Attach file (@)", de: "Datei anhängen (@)", ja: "ファイルを添付 (@)" },
  "chat.attachSelTitle": { ko: "포커스된 에디터의 선택 영역 첨부", en: "Attach the selection from the focused editor", de: "Auswahl aus dem fokussierten Editor anhängen", ja: "フォーカス中のエディタの選択範囲を添付" },
  "chat.inputPlaceholder": { ko: "요청 입력 · /명령 (Enter)", en: "Type a request · /command (Enter)", de: "Anfrage eingeben · /Befehl (Enter)", ja: "リクエストを入力 · /コマンド (Enter)" },
  "chat.sending": { ko: "실행 중…", en: "Running…", de: "Läuft…", ja: "実行中…" },
  "chat.send": { ko: "보내기", en: "Send", de: "Senden", ja: "送信" },

  // ── 에이전트 · 변경 검토 패널 ──────────────────────────
  "agent.title": { ko: "에이전트", en: "Agents", de: "Agenten", ja: "エージェント" },
  "agent.subtitle": { ko: "동시 작업 · 파일 락 격리", en: "Concurrent · file-lock isolated", de: "Gleichzeitig · Datei-Lock-isoliert", ja: "同時作業・ファイルロック分離" },
  "agent.statusIdle": { ko: "대기", en: "Idle", de: "Bereit", ja: "待機" },
  "agent.statusPlan": { ko: "계획 수립 중", en: "Planning", de: "Plant", ja: "計画中" },
  "agent.statusEdit": { ko: "작업 중", en: "Working", de: "Arbeitet", ja: "作業中" },
  "agent.statusReview": { ko: "완료 · 검토 대기", en: "Done · pending review", de: "Fertig · Prüfung ausstehend", ja: "完了・レビュー待ち" },
  "agent.statusStop": { ko: "중지됨", en: "Stopped", de: "Gestoppt", ja: "停止済み" },
  "agent.noneConnected": { ko: "연결된 에이전트가 없습니다. 설정(⚙) 또는 메뉴 AI → 모델 관리…에서 로그인하세요.", en: "No agents connected. Log in via Settings (⚙) or menu AI → Manage Models…", de: "Keine Agenten verbunden. Melden Sie sich über Einstellungen (⚙) oder Menü AI → Modelle verwalten… an.", ja: "接続中のエージェントがありません。設定(⚙)またはメニュー AI → モデル管理… からログインしてください。" },
  "agent.notConnected": { ko: "미연결", en: "Not connected", de: "Nicht verbunden", ja: "未接続" },
  "agent.manager": { ko: "관리자", en: "Manager", de: "Manager", ja: "管理者" },
  "agent.setManagerTitle": { ko: "이 AI를 관리자로 지정", en: "Set this AI as manager", de: "Diese KI als Manager festlegen", ja: "このAIを管理者に設定" },
  "agent.setManager": { ko: "관리자로", en: "Set as manager", de: "Als Manager", ja: "管理者に" },
  "agent.stopAgentTitle": { ko: "이 에이전트 중지", en: "Stop this agent", de: "Diesen Agenten stoppen", ja: "このエージェントを停止" },
  "agent.subscription": { ko: "구독", en: "Subscription", de: "Abo", ja: "サブスク" },
  "agent.review": { ko: "변경 검토", en: "Review Changes", de: "Änderungen prüfen", ja: "変更レビュー" },
  "agent.reviewEmpty": { ko: "Claude에게 작업을 요청하면 편집 제안이 여기에 표시됩니다.", en: "Ask Claude to do something and edit proposals will appear here.", de: "Bitte Claude um eine Aufgabe — Änderungsvorschläge erscheinen hier.", ja: "Claudeに作業を依頼すると、編集提案がここに表示されます。" },
};
