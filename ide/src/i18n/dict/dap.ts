// dap 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "dap.commandFailed": { ko: "{command} 실패", en: "{command} failed", de: "{command} fehlgeschlagen", ja: "{command} 失敗" },
  "dap.noSession": { ko: "세션 없음", en: "No session", de: "Keine Sitzung", ja: "セッションがありません" },
  "dap.commandTimeout": { ko: "{command} 타임아웃", en: "{command} timed out", de: "{command} Zeitüberschreitung", ja: "{command} タイムアウト" },
  "dap.desktopOnly": { ko: "데스크톱 전용", en: "Desktop only", de: "Nur Desktop", ja: "デスクトップ専用" },
};
