// cmds 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "cmds.title": { ko: "명령어", en: "Commands", de: "Befehle", ja: "コマンド" },
  "cmds.customCommand": { ko: "커스텀 명령", en: "Custom command", de: "Benutzerdefinierter Befehl", ja: "カスタムコマンド" },
  "cmds.customPrompt": { ko: "커스텀 프롬프트", en: "Custom prompt", de: "Benutzerdefinierter Prompt", ja: "カスタムプロンプト" },
  "cmds.scopeProject": { ko: "프로젝트", en: "Project", de: "Projekt", ja: "プロジェクト" },
  "cmds.scopeUser": { ko: "사용자", en: "User", de: "Benutzer", ja: "ユーザー" },
  "cmds.hintBefore": { ko: "채팅 입력창에 ", en: "Type ", de: "Geben Sie ", ja: "チャット入力欄に " },
  "cmds.hintAfter": { ko: " 를 입력하면 자동완성됩니다. Claude Code · Codex 명령은 해당 CLI가 로그인되어 있어야 나타납니다.", en: " in the chat input for autocomplete. Claude Code · Codex commands appear only when the respective CLI is logged in.", de: " im Chat-Eingabefeld ein, um die Autovervollständigung zu nutzen. Claude Code · Codex Befehle erscheinen nur, wenn die jeweilige CLI angemeldet ist.", ja: " を入力すると自動補完されます。Claude Code · Codex コマンドは該当 CLI にログインしている場合にのみ表示されます。" },
};
