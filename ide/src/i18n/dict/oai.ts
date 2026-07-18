// oai 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "oai.chatgptTokenExpired": {
    ko: "ChatGPT 계정 토큰이 만료되었습니다. 설정에서 다시 로그인해주세요.",
    en: "Your ChatGPT account token has expired. Please sign in again in Settings.",
    de: "Das Token deines ChatGPT-Kontos ist abgelaufen. Bitte melde dich in den Einstellungen erneut an.",
    ja: "ChatGPTアカウントのトークンの有効期限が切れました。設定から再度ログインしてください。",
  },
  "oai.responseFailed": {
    ko: "응답 실패: {detail}",
    en: "Response failed: {detail}",
    de: "Antwort fehlgeschlagen: {detail}",
    ja: "応答に失敗しました: {detail}",
  },
  // 도구 인자 JSON 이 깨진 경우 — 조용히 빈 입력으로 넘기면 빈 경로 제안이 만들어진다
  "oai.badToolArgs": {
    ko: "도구 '{name}' 의 인자를 해석하지 못해 건너뛰었습니다.",
    en: "Skipped tool '{name}' — its arguments could not be parsed.",
    de: "Werkzeug '{name}' übersprungen — Argumente nicht lesbar.",
    ja: "ツール '{name}' の引数を解釈できずスキップしました。",
  },
  "oai.unknown": {
    ko: "알 수 없음",
    en: "Unknown",
    de: "Unbekannt",
    ja: "不明",
  },
  "oai.apiKeyNotSet": {
    ko: "{label} API 키가 설정되지 않았습니다.",
    en: "{label} API key is not set.",
    de: "{label}-API-Schlüssel ist nicht festgelegt.",
    ja: "{label} APIキーが設定されていません。",
  },
  "oai.networkError": {
    ko: "네트워크 오류: {detail}",
    en: "Network error: {detail}",
    de: "Netzwerkfehler: {detail}",
    ja: "ネットワークエラー: {detail}",
  },
  "oai.apiError": {
    ko: "{label} API 오류 ({status}): {detail}",
    en: "{label} API error ({status}): {detail}",
    de: "{label}-API-Fehler ({status}): {detail}",
    ja: "{label} APIエラー ({status}): {detail}",
  },
};
