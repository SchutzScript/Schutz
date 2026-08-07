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
  // 도구를 못 쓰는 모델이면 에이전트가 말만 하고 끝난다 — 앱이 고장 난 것처럼 보인다.
  "oai.noToolCalls": {
    ko: "{agent} 이(가) 도구를 한 번도 쓰지 않았습니다. 이 모델은 도구 호출(tool use)을 지원하지 않을 수 있습니다 — 그러면 파일을 고치지 못하고 말로만 답합니다.",
    en: "{agent} has not used a tool once. This model may not support tool calling — if so it can only talk, not change files.",
    de: "{agent} hat kein einziges Werkzeug benutzt. Dieses Modell unterstützt möglicherweise keine Tool-Aufrufe — dann kann es nur reden, keine Dateien ändern.",
    ja: "{agent} が一度もツールを使いませんでした。このモデルはツール呼び出しに対応していない可能性があります — その場合、ファイルは変更できず会話だけになります。",
  },
  // 로컬 모델은 키가 아니라 주소가 설정이다 — 없을 때 "API 키" 를 말하면 엉뚱한 데를 찾게 한다.
  "oai.localNoEndpoint": {
    ko: "로컬 서버 주소가 설정돼 있지 않습니다. 설정에서 주소를 적어 주세요(예: http://localhost:11434).",
    en: "No local server address is set. Add one in settings (e.g. http://localhost:11434).",
    de: "Keine lokale Serveradresse gesetzt. Bitte in den Einstellungen eintragen (z. B. http://localhost:11434).",
    ja: "ローカルサーバーのアドレスが設定されていません。設定で指定してください（例: http://localhost:11434）。",
  },
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
