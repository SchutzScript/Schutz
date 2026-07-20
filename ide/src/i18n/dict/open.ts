// 첫 실행 오프닝 문안.
//
// 이 화면은 사람이 이 앱을 처음 보는 자리라 문장이 곧 첫인상이다. 기능을 설명하지
// 않고 약속을 말한다 — 무엇이 어디 있는지는 그 다음(15단계 투어)이 한다.
//
// open.say 의 *별표* 로 감싼 낱말은 강조로 렌더된다. 언어마다 강조할 자리가 다르니
// 번역할 때 위치를 그대로 옮기지 말고 그 언어에서 힘이 실리는 낱말에 붙인다.
export const dict: Record<string, Record<string, string>> = {
  "open.aria": {
    ko: "Schutz 시작 안내", en: "Schutz opening", de: "Schutz-Einführung", ja: "Schutz のはじめに",
  },
  "open.skip": { ko: "건너뛰기", en: "Skip", de: "Überspringen", ja: "スキップ" },

  "open.say": {
    ko: "코드를 고치는 건 *AI* 지만, 반영할지는 *당신이* 정합니다.",
    en: "The *AI* rewrites the code. *You* decide what lands.",
    de: "Die *KI* schreibt den Code um. *Sie* entscheiden, was bleibt.",
    ja: "コードを直すのは *AI* ですが、反映するかは *あなた* が決めます。",
  },

  // ── 세팅 (오프닝에서 유일하게 멈추는 지점) ─────────────────────────
  "open.setup.title": {
    ko: "먼저, 어떤 모습으로 쓸까요",
    en: "First — how should it look?",
    de: "Zuerst: Wie soll es aussehen?",
    ja: "はじめに、どんな見た目にしますか",
  },
  "open.setup.hint": {
    ko: "고른 테마로 편집기가 만들어집니다. 나중에 설정에서 언제든 바꿀 수 있어요.",
    en: "Your editor gets built in the theme you pick. You can change it anytime in settings.",
    de: "Ihr Editor wird im gewählten Theme aufgebaut. Sie können es jederzeit in den Einstellungen ändern.",
    ja: "選んだテーマでエディタが組み上がります。設定からいつでも変更できます。",
  },
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
