// modal 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "modal.aboutTitle": { ko: "Schutz 정보", en: "About Schutz", de: "Über Schutz", ja: "Schutz について" },
  "modal.aboutTagline": { ko: "v{version} · AI 네이티브 IDE", en: "v{version} · AI-native IDE", de: "v{version} · KI-natives IDE", ja: "v{version} · AI ネイティブ IDE" },
  "modal.aboutLicense": { ko: "라이선스", en: "License", de: "Lizenz", ja: "ライセンス" },
  "modal.aboutEnv": { ko: "환경", en: "Environment", de: "Umgebung", ja: "環境" },
  "modal.aboutEngine": { ko: "엔진", en: "Engine", de: "Engine", ja: "エンジン" },
  "modal.envDesktop": { ko: "데스크톱 (Electron)", en: "Desktop (Electron)", de: "Desktop (Electron)", ja: "デスクトップ (Electron)" },
  "modal.envWebPreview": { ko: "웹 프리뷰", en: "Web preview", de: "Web-Vorschau", ja: "ウェブプレビュー" },
  "modal.usageTitle": { ko: "사용량 대시보드", en: "Usage dashboard", de: "Nutzungs-Dashboard", ja: "使用量ダッシュボード" },
  "modal.usageInputTokens": { ko: "입력 토큰", en: "Input tokens", de: "Eingabe-Tokens", ja: "入力トークン" },
  "modal.usageOutputTokens": { ko: "출력 토큰", en: "Output tokens", de: "Ausgabe-Tokens", ja: "出力トークン" },
  // 비용은 CLI 가 청구액을 알려줄 때만 뜬다 — 토큰 수로 추정하지 않는다(요금표는 자주 바뀐다).
  "modal.usageCost": { ko: "비용", en: "Cost", de: "Kosten", ja: "コスト" },
  "modal.usageCostNote": { ko: "CLI 가 보고한 실제 청구액입니다. 보고하지 않는 연결은 빠져 있습니다.", en: "Actual amount reported by the CLI. Connections that don't report it are not included.", de: "Tatsächlich vom CLI gemeldeter Betrag. Verbindungen ohne Meldung fehlen.", ja: "CLI が報告した実際の請求額です。報告しない接続は含まれません。" },
  "modal.usageSessionCost": { ko: "세션 비용", en: "Session cost", de: "Sitzungskosten", ja: "セッション費用" },
  "modal.usageByAgent": { ko: "에이전트별", en: "By agent", de: "Nach Agent", ja: "エージェント別" },
  "modal.usageNoAgents": { ko: "연결된 에이전트가 없습니다. 설정에서 로그인하세요.", en: "No connected agents. Sign in from settings.", de: "Keine verbundenen Agenten. Melde dich in den Einstellungen an.", ja: "接続されたエージェントがありません。設定からログインしてください。" },
  "modal.usageAgentTokens": { ko: "입력 {tin} · 출력 {tout} · {price}", en: "In {tin} · Out {tout} · {price}", de: "Eingabe {tin} · Ausgabe {tout} · {price}", ja: "入力 {tin} · 出力 {tout} · {price}" },
  "modal.usageFootnote": { ko: "* 구독(OAuth/CLI) 경로는 개별 과금 없이 구독에 포함됩니다.", en: "* Subscription (OAuth/CLI) paths are included in the subscription with no separate billing.", de: "* Abo-Pfade (OAuth/CLI) sind ohne separate Abrechnung im Abo enthalten.", ja: "* サブスクリプション (OAuth/CLI) 経路は個別課金なしでサブスクリプションに含まれます。" },
  "modal.subscription": { ko: "구독", en: "Subscription", de: "Abo", ja: "サブスク" },
  "modal.subscriptionIncluded": { ko: "구독 포함", en: "Included in subscription", de: "Im Abo enthalten", ja: "サブスクに含む" },
  // 단가를 모르는 모델 — 추정값으로 금액을 지어내지 않는다
  "modal.quotaResets": { ko: "{when} 후 리셋", en: "resets in {when}", de: "Reset in {when}", ja: "{when} 後にリセット" },
  "modal.keysTitle": { ko: "키보드 단축키", en: "Keyboard shortcuts", de: "Tastenkürzel", ja: "キーボードショートカット" },
};
