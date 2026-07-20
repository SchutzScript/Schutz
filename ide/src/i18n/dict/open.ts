// 첫 실행 오프닝 문안.
//
// 이 화면은 사람이 이 앱을 처음 보는 자리라 문장이 곧 첫인상이다. 기능을 설명하지
// 않고 약속을 말한다 — 무엇이 어디 있는지는 그 다음(15단계 투어)이 한다.
//
// open.say 는 **언어와 무관하게 독일어**로 둔다. Schutz·Feldgrau 가 이미 독일어라
// 브랜드의 목소리이고, 짧고 대구가 맞아 뜻을 몰라도 리듬이 읽힌다. 대신 바로 아래에
// open.saySub 로 사용자 언어 번역을 작게 깐다 — 멋만 부리고 뜻을 안 주면 안 된다.
// *별표* 로 감싼 낱말은 강조로 렌더된다.
export const dict: Record<string, Record<string, string>> = {
  "open.aria": {
    ko: "Schutz 시작 안내", en: "Schutz opening", de: "Schutz-Einführung", ja: "Schutz のはじめに",
  },
  "open.skip": { ko: "건너뛰기", en: "Skip", de: "Überspringen", ja: "スキップ" },

  // 전 언어 동일 — 이건 번역 대상이 아니라 상표에 가깝다.
  "open.say": {
    ko: "Die *KI* schreibt. *Du* entscheidest.",
    en: "Die *KI* schreibt. *Du* entscheidest.",
    de: "Die *KI* schreibt. *Du* entscheidest.",
    ja: "Die *KI* schreibt. *Du* entscheidest.",
  },
  "open.saySub": {
    ko: "AI 가 씁니다. 당신이 정합니다.",
    en: "The AI writes. You decide.",
    de: "Die KI schreibt den Code — Sie entscheiden, was davon bleibt.",
    ja: "AI が書きます。あなたが決めます。",
  },

  // ── 세팅 (오프닝에서 유일하게 멈추는 지점) ─────────────────────────
  "open.setup.title": {
    ko: "시작하기 전에", en: "Before we start", de: "Bevor es losgeht", ja: "はじめる前に",
  },
  "open.setup.hint": {
    ko: "설정에서 언제든 바꿀 수 있어요.",
    en: "You can change both anytime in settings.",
    de: "Beides lässt sich jederzeit in den Einstellungen ändern.",
    ja: "どちらも設定からいつでも変更できます。",
  },
  "open.setup.lang":  { ko: "언어", en: "Language", de: "Sprache", ja: "言語" },
  "open.setup.theme": { ko: "테마", en: "Theme", de: "Theme", ja: "テーマ" },
  "open.setup.go": { ko: "이걸로 시작", en: "Start with this", de: "Damit starten", ja: "これで始める" },

  // ── 조립되는 패널 라벨 ─────────────────────────────────────────────
  "open.tag.rail":   { ko: "탐색", en: "Navigate", de: "Navigation", ja: "移動" },
  "open.tag.left":   { ko: "프로젝트 · 대화", en: "Project · Chat", de: "Projekt · Chat", ja: "プロジェクト · チャット" },
  "open.tag.editor": { ko: "편집", en: "Edit", de: "Bearbeiten", ja: "編集" },
  "open.tag.right":  { ko: "검토 · 승인", en: "Review · Approve", de: "Prüfen · Freigeben", ja: "レビュー · 承認" },
  "open.tag.ask":    { ko: "요청", en: "Request", de: "Anfrage", ja: "リクエスト" },

  // ── 실연 ───────────────────────────────────────────────────────────
  "open.ask": {
    ko: "Footer 저작권 연도를 매년 자동으로 바뀌게 해줘",
    en: "Make the footer copyright year update itself every year",
    de: "Lass das Copyright-Jahr im Footer sich jedes Jahr selbst aktualisieren",
    ja: "フッターの著作権年を毎年自動で変わるようにして",
  },
  "open.tag.project": { ko: "프로젝트", en: "Project", de: "Projekt", ja: "プロジェクト" },
  "open.tag.agents":  { ko: "에이전트", en: "Agents", de: "Agenten", ja: "エージェント" },
  "open.tag.review":  { ko: "변경 검토", en: "Review", de: "Änderungen", ja: "変更レビュー" },

  "open.st.idle":   { ko: "대기", en: "Idle", de: "Bereit", ja: "待機" },
  "open.st.read":   { ko: "읽는 중", en: "Reading", de: "Liest", ja: "読み取り中" },
  "open.st.edit":   { ko: "편집 중", en: "Editing", de: "Bearbeitet", ja: "編集中" },
  "open.st.review": { ko: "검토 대기", en: "Awaiting review", de: "Wartet auf Prüfung", ja: "レビュー待ち" },

  "open.reply": {
    ko: "연도를 현재 연도로 계산하도록 바꿨습니다. 검토에서 확인하세요.",
    en: "Changed the year to compute from the current date. Check the review panel.",
    de: "Das Jahr wird jetzt aus dem aktuellen Datum berechnet. Prüfen Sie das Änderungs-Panel.",
    ja: "年を現在の日付から計算するように変更しました。変更レビューで確認してください。",
  },
  "open.status.clean":   { ko: "변경 없음", en: "No changes", de: "Keine Änderungen", ja: "変更なし" },
  "open.status.changed": { ko: "1개 파일 변경됨", en: "1 file changed", de: "1 Datei geändert", ja: "1ファイル変更" },

  "open.accept":  { ko: "수락", en: "Accept", de: "Annehmen", ja: "承認" },
  "open.reject":  { ko: "거절", en: "Reject", de: "Ablehnen", ja: "却下" },
  "open.applied": { ko: "✓ 반영됨", en: "✓ Applied", de: "✓ Übernommen", ja: "✓ 反映済み" },

  // ── 마무리 ─────────────────────────────────────────────────────────
  "open.done.title": {
    ko: "준비됐습니다", en: "You're ready", de: "Alles bereit", ja: "準備できました",
  },
  "open.done.tour": {
    ko: "천천히 둘러보기 →", en: "Take the tour →", de: "Rundgang starten →", ja: "ゆっくり見て回る →",
  },
  "open.done.skip": {
    ko: "바로 시작", en: "Jump right in", de: "Direkt loslegen", ja: "すぐ始める",
  },
};
