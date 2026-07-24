// 플러그인 창작마당 — Claude Code 플러그인 카탈로그를 고르고 켜는 화면.
//
// "MCP 를 손으로 등록하는 것"과 여기서 켜는 것의 차이를 문장으로도 분명히 한다:
// 플러그인 하나가 스킬·명령·MCP 서버를 함께 들고 오는, 카탈로그에 실린 묶음이다.
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "plug.title": { ko: "플러그인 창작마당", en: "Plugin marketplace", de: "Plugin-Marktplatz", ja: "プラグイン マーケット" },
  "plug.intro": {
    ko: "플러그인 하나가 스킬·명령·MCP 서버를 함께 들고 옵니다. 켜면 그 스킬이 바로 AI에게 보이고, Claude와 GPT 모두에서 똑같이 동작합니다.",
    en: "A plugin brings its skills, commands and MCP server together. Turn one on and its skills are immediately visible to the AI — the same for both Claude and GPT.",
    de: "Ein Plugin bringt Skills, Befehle und MCP-Server zusammen. Aktiviere eines, und seine Skills stehen der KI sofort zur Verfügung — gleich für Claude und GPT.",
    ja: "プラグイン一つがスキル・コマンド・MCP サーバーをまとめて持ってきます。有効にするとそのスキルがすぐ AI に見え、Claude でも GPT でも同じように動きます。",
  },
  "plug.searchPlaceholder": { ko: "이름·설명·제작자로 검색", en: "Search by name, description or author", de: "Nach Name, Beschreibung oder Autor suchen", ja: "名前・説明・作者で検索" },
  "plug.catAll": { ko: "전체", en: "All", de: "Alle", ja: "すべて" },
  "plug.count": { ko: "{shown}개 표시 · 검색 결과 {total}개 · 받아진 것 {installed}개", en: "showing {shown} · {total} matched · {installed} fetched", de: "{shown} angezeigt · {total} Treffer · {installed} geladen", ja: "{shown} 件表示 · 一致 {total} 件 · 取得済み {installed} 件" },
  "plug.on": { ko: "켜짐", en: "On", de: "An", ja: "オン" },
  "plug.off": { ko: "켜기", en: "Turn on", de: "Aktivieren", ja: "オンにする" },
  "plug.install": { ko: "설치", en: "Install", de: "Installieren", ja: "導入" },
  "plug.installing": { ko: "받는 중…", en: "Fetching…", de: "Wird geladen…", ja: "取得中…" },
  "plug.installed": { ko: "{name} 설치하고 켰습니다", en: "{name} installed and turned on", de: "{name} installiert und aktiviert", ja: "{name} を導入して有効にしました" },
  "plug.installFail": { ko: "설치 실패 — git 이 설치돼 있는지 확인하세요", en: "Install failed — check that git is installed", de: "Installation fehlgeschlagen — ist git installiert?", ja: "導入に失敗 — git が入っているか確認してください" },
  "plug.notFetched": { ko: "아직 안 받음", en: "not fetched", de: "nicht geladen", ja: "未取得" },
  "plug.nSkills": { ko: "스킬 {n}", en: "{n} skills", de: "{n} Skills", ja: "スキル {n}" },
  "plug.nCommands": { ko: "명령 {n}", en: "{n} commands", de: "{n} Befehle", ja: "コマンド {n}" },
  "plug.none": { ko: "조건에 맞는 플러그인이 없습니다.", en: "No plugins match.", de: "Keine passenden Plugins.", ja: "条件に合うプラグインがありません。" },
  "plug.enabled": { ko: "{name} 켰습니다", en: "{name} turned on", de: "{name} aktiviert", ja: "{name} をオンにしました" },
  "plug.disabled": { ko: "{name} 껐습니다", en: "{name} turned off", de: "{name} deaktiviert", ja: "{name} をオフにしました" },
};
