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
};
