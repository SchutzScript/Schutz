// 게임 엔진 연동(OVERDARE 등) 도메인 번역 사전.
// MCP 패널의 "게임 엔진" 섹션 라벨과, 엔진 도구 승인 게이트가 모델·사용자에게 보이는 문구.
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "eng.section": { ko: "게임 엔진", en: "Game engines", de: "Game-Engines", ja: "ゲームエンジン" },
  "eng.connect": { ko: "연결", en: "Connect", de: "Verbinden", ja: "接続" },
  "eng.reconnect": { ko: "재접속", en: "Reconnect", de: "Neu verbinden", ja: "再接続" },
  "eng.checkStatus": { ko: "상태 확인", en: "Check status", de: "Status prüfen", ja: "状態を確認" },
  "eng.notConnected": { ko: "연결 안 됨 — 연결하면 AI가 조종할 수 있어요", en: "Not connected — connect to let the AI drive it", de: "Nicht verbunden — verbinden, damit die KI es steuern kann", ja: "未接続 — 接続すると AI が操作できます" },
  "eng.stopped": { ko: "중지됨", en: "Stopped", de: "Gestoppt", ja: "停止中" },
  "eng.checking": { ko: "상태 확인 중…", en: "Checking…", de: "Wird geprüft…", ja: "確認中…" },
  "eng.reachable": { ko: "Studio 연결됨", en: "Studio reachable", de: "Studio erreichbar", ja: "Studio に接続" },
  "eng.unreachable": { ko: "Studio에 닿지 않음 — Studio를 켜고 프로젝트를 여세요", en: "Cannot reach Studio — open Studio with a project", de: "Studio nicht erreichbar — Studio mit einem Projekt öffnen", ja: "Studio に到達できません — Studio でプロジェクトを開いてください" },

  // 승인 게이트 사유(승인 카드에 표시). {engine}=엔진 이름, {id}=asset id
  "eng.whyEngineAction": { ko: "{engine}에 대한 되돌리기 어려운 작업입니다. 실행할까요?", en: "This is a hard-to-undo action on {engine}. Run it?", de: "Dies ist eine schwer rückgängig zu machende Aktion in {engine}. Ausführen?", ja: "{engine} に対する取り消しにくい操作です。実行しますか？" },
  "eng.whyUnverifiedAsset": { ko: "카탈로그에 없는 asset id({id})입니다. 잘못된 id는 Studio를 영구 정지시킬 수 있어요. 정말 임포트할까요?", en: "This asset id ({id}) was not found in the catalog. A bad id can permanently hang Studio. Import anyway?", de: "Diese Asset-ID ({id}) wurde nicht im Katalog gefunden. Eine falsche ID kann Studio dauerhaft einfrieren. Trotzdem importieren?", ja: "カタログにない asset id（{id}）です。誤った id は Studio を永久に停止させることがあります。それでもインポートしますか？" },

  // 도구 행 배지
  "eng.notePlaying": { ko: "재생 중 차단", en: "Blocked (playing)", de: "Blockiert (läuft)", ja: "再生中のためブロック" },

  // 스킬(Claude Code 생태계) — 도구 행에 뜨는 동사
  "skill.verb": { ko: "스킬", en: "Skill", de: "Skill", ja: "スキル" },

  "eng.autoConnected": { ko: "{engine}에 연결됐습니다", en: "Connected to {engine}", de: "Mit {engine} verbunden", ja: "{engine} に接続しました" },

  // 엔진 뷰(전용 화면)
  "eng.viewTitle": { ko: "게임 엔진", en: "Game engine", de: "Game-Engine", ja: "ゲームエンジン" },
  "eng.viewNone": {
    ko: "연결된 게임 엔진이 없습니다. MCP 패널에서 엔진을 연결하면 여기서 화면과 씬을 볼 수 있어요.",
    en: "No game engine is connected. Connect one from the MCP panel and its viewport and scene will show up here.",
    de: "Keine Game-Engine verbunden. Verbinde eine im MCP-Panel, dann erscheinen Viewport und Szene hier.",
    ja: "接続中のゲームエンジンがありません。MCP パネルから接続すると、ここにビューポートとシーンが表示されます。",
  },
  "eng.viewConnect": { ko: "MCP 패널 열기", en: "Open MCP panel", de: "MCP-Panel öffnen", ja: "MCP パネルを開く" },
  "eng.viewport": { ko: "뷰포트", en: "Viewport", de: "Viewport", ja: "ビューポート" },
  "eng.viewportEmpty": {
    ko: "아직 화면을 못 가져왔습니다. Studio가 켜져 있는지 확인하고 새로고침하세요. (3D 화면만 찍히고 엔진 UI는 안 나옵니다)",
    en: "No frame yet. Check that Studio is running, then refresh. (Only the 3D view is captured — engine UI does not appear.)",
    de: "Noch kein Bild. Prüfe, ob Studio läuft, und aktualisiere. (Nur die 3D-Ansicht wird erfasst — die Engine-UI nicht.)",
    ja: "まだ画面を取得できていません。Studio が起動しているか確認して更新してください。（3D ビューのみで、エンジンの UI は写りません）",
  },
  "eng.tree": { ko: "씬 트리", en: "Scene tree", de: "Szenenbaum", ja: "シーンツリー" },
  "eng.treeEmpty": { ko: "새로고침을 눌러 씬을 읽어 오세요.", en: "Press refresh to read the scene.", de: "Zum Laden der Szene aktualisieren.", ja: "更新を押してシーンを読み込んでください。" },
  "eng.play": { ko: "재생", en: "Play", de: "Start", ja: "再生" },
  "eng.stop": { ko: "정지", en: "Stop", de: "Stopp", ja: "停止" },
  "eng.save": { ko: "저장", en: "Save", de: "Speichern", ja: "保存" },
};
