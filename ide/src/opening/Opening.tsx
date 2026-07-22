import React from "react";
import { t, LANGS, getLang, setLang, onLangChange } from "../i18n";
import type { Lang } from "../i18n";
import { THEME_TOKENS, applyTheme, setThemeId, getThemeId } from "../theme";
import { UI_MODES, getUiMode, setUiMode, applyUiMode, type UiMode } from "../uiMode";
import { ENGINE_CREDIT } from "../ide/data";
import { KEYMAPS, UI_FONTS, CODE_FONTS, getEditorPrefs, setEditorPrefs, applyUiFont, getAutonomy, setAutonomy } from "../settings";
import { PROVIDERS_MAP } from "../ai/registry";
import { getStoredKey, setStoredKey } from "../ai/provider";
import { TOTAL_MS, beatAt, clampToGate, gateAt, seg, ease } from "./beats";

/**
 * 첫 실행 오프닝.
 *
 * 스포트라이트로 기존 화면을 가리키는 대신 화면을 먼저 비우고, 사용자가 고른 테마로
 * 인터페이스가 조립되는 걸 보여준다. 그래서 조립이 연출이 아니라 **선택의 결과**가 된다.
 *
 * 여기서 보이는 에디터·패널은 전부 목업이다. 첫 실행 시점엔 워크스페이스도 없고 Monaco
 * 가 준비됐다는 보장도 없어서, 실물을 몰아붙이면 실패면만 늘고 얻는 게 없다. 이건 실연이
 * 아니라 영화다 — 사용자 파일을 건드리지 않고 API 호출도 하지 않는다.
 */


/** 세팅 각 쪽의 제목. 쪽마다 다른 것을 물으므로 제목도 달라야 한다 — 같으면 넘겼는데
 *  같은 화면이 다시 뜬 것처럼 보인다. 길이가 곧 쪽 수다. */
const STEP_TITLES = [
  "open.setup.title",     // 1 언어 · 테마 · 화면 모드 · 지난 대화
  "open.step.ai",         // 2 AI 연결
  "open.step.autonomy",   // 3 어디까지 맡길까요
  "open.step.keymap",     // 4 키맵
  "open.step.fonts",      // 5 글꼴
];

/** 세팅 퇴장 — 게이트(12300)를 지나자마자 시작해 800ms 만에 물러난다. */
const EXIT_FROM = 12300, EXIT_TO = 13100;
/** 무대를 진짜 UI 에 넘기기까지. 퇴장보다 조금 넉넉해야 마지막 프레임이 잘리지 않는다. */
const EXIT_MS = 950;

/** 고를 수 있는 테마 — 실제 THEME_TOKENS 에서 가져온다. 가짜 색이 아니라 진짜 테마다. */
const CHOICES = ["feldgrau", "graphite", "paper"] as const;


interface Props {
  /**
   * intro = 마크·선언·세팅(화면이 비어야 성립하는 구간).
   * outro = 데모가 끝난 뒤 마무리. 그 사이 조립·실연은 진짜 App 이 맡는다.
   */
  phase: "intro" | "outro";
  /** 세팅을 마쳤다 — 오버레이를 걷고 진짜 UI 로 데모를 시작한다. */
  onStartDemo: () => void;
  /** 지난 대화를 가져오겠다고 골랐다(또는 물렀다).
   *
   *  이 화면은 데모 동안 **언마운트된다**(intro → off → outro). 그래서 선택을 여기 state 에만
   *  두면 마무리 화면이 뜰 때 초기화되고, onDone 은 늘 false 를 들고 나간다. 테마·모드가
   *  고르는 즉시 setThemeId·setUiMode 를 부르는 것과 같은 이유다 — 고른 순간 밖에 알린다. */
  onWantsImport: (want: boolean) => void;
  /** 오프닝이 끝났다(또는 건너뛰었다). */
  onDone: (opts: { wantsTour: boolean }) => void;
}
interface State {
  t: number; passedGate: boolean; theme: string; mode: UiMode;
  /** 세팅은 여러 쪽이다. 한 쪽에 하나씩만 묻는다.
   *
   *  처음엔 두 쪽이었다 — 1쪽은 보는 것, 2쪽에 AI·자율성·키맵·글꼴을 몰아넣었다. 그러면
   *  2쪽이 목록이 되고, 목록은 훑고 지나가게 된다. 자율성처럼 **읽고 정해야 하는** 것이
   *  키맵 알약 옆에 나란히 놓이면 같은 무게로 보인다. 하나씩 물으면 각자 설명할 자리가
   *  생긴다. */
  page: number;
  keymap: string;
  uiFont: string; codeFont: string; fontSize: number;
  policy: string;
  /** 어느 제공자의 키 입력이 펼쳐져 있나. null 이면 접혀 있다. */
  keyOpen: string | null;
  keyDraft: string;
  /** 연결 상태를 다시 그리기 위한 값 — isConfigured() 는 localStorage 를 보므로 신호가 없다. */
  connTick: number;
  /** 이 컴퓨터에 남아 있는 Claude Code · Codex 대화 수. null = 아직 안 세봤다. */
  pastChats: number | null;
  wantsImport: boolean;
}

export class Opening extends React.Component<Props, State> {
  state: State = (() => {
    const ed = getEditorPrefs();
    return {
      t: 0, passedGate: false, theme: getThemeId(), mode: getUiMode(), pastChats: null, wantsImport: false,
      page: 1 as const, keymap: ed.keymap, uiFont: ed.uiFont, codeFont: ed.codeFont, fontSize: ed.fontSize,
      policy: getAutonomy().policy, keyOpen: null, keyDraft: "", connTick: 0,
    };
  })();
  private raf = 0;
  private last = 0;
  private reduced = false;
  private langOff: (() => void) | null = null;

  componentDidMount() {
    try { this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    // 모션 최소화를 켠 사람에게 자동 재생되는 영화는 정확히 그 설정이 끄고 싶어하는
    // 종류의 것이다. 연출을 건너뛰고 세팅만 보여준 뒤 넘긴다.
    if (this.reduced) this.setState({ t: gateAt() ?? 0 });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    window.addEventListener("keydown", this.onKey);
    this.langOff = onLangChange(() => this.forceUpdate());
    // 마무리 화면은 세팅을 다시 그리지 않는다 — 셀 이유가 없다.
    if (this.props.phase !== "intro") return;
    // 지난 대화가 **있을 때만** 물어본다. 처음 쓰는 사람에게 "가져올까요?" 는 아무 뜻이
    // 없고, 세팅 화면만 한 칸 길어진다. 파일 수만 세므로 1GB 를 읽지 않는다.
    void this.countPastChats();
  }

  /** 셋째 선택지를 띄울지 정한다. 실패하면 그냥 안 띄운다 — 첫 실행 화면에서 오류를
   *  보여줄 이유가 없고, 나중에 사이드바에서 언제든 할 수 있다. */
  private async countPastChats() {
    try {
      const r = await window.schutz?.cliChatCounts?.();
      const n = Object.values(r?.counts ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
      if (n > 0) this.setState({ pastChats: n });
    } catch { /* 안 띄운다 */ }
  }
  componentWillUnmount() {
    clearTimeout(this.handOff);
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    this.langOff?.();
    this.langOff = null;
  }

  /** 아무 키나 누르면 빠져나간다 — 붙잡아두는 게 아니라 보여주는 것이라 길이 늘 열려 있어야 한다. */
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { this.finish(false); return; }
    // 게이트에서는 Enter 로 진행
    if (e.key === "Enter" && !this.state.passedGate && this.state.t >= (gateAt() ?? Infinity)) {
      this.pass();
    }
  };

  private tick = (now: number) => {
    const dt = now - this.last; this.last = now;
    this.setState(s => {
      if (this.reduced) return null;                       // 정지 화면 — 게이트에서 대기
      const g = gateAt();
      if (!s.passedGate && g !== null && s.t >= g) return null;   // 게이트에서 멈춘다
      const nt = s.t + dt;
      if (nt >= TOTAL_MS) { this.finish(false); return { t: TOTAL_MS } as State; }
      return { t: nt } as State;
    });
    this.raf = requestAnimationFrame(this.tick);
  };

  /** 세팅에서 무대를 넘기기까지. 퇴장이 끝나는 시각(EXIT_END)에서 게이트를 뺀 값. */
  private handOff = 0;

  private pass = () => {
    // 세팅이 끝나면 오버레이를 걷고 진짜 UI 로 넘긴다. 모션 최소화를 켠 사람은
    // 연출을 건너뛰므로 데모도 돌리지 않고 바로 투어로 보낸다.
    if (this.reduced) { this.finish(true); return; }
    if (this.state.passedGate) return;   // 두 번 눌러도 한 번만 넘긴다

    // 예전엔 여기서 곧바로 onStartDemo 를 불렀다. 그래서 고르자마자 화면이 **툭**
    // 바뀌었고, 아래 퇴장 애니메이션(passedGate 를 보는 쪽)은 한 번도 실행된 적이
    // 없는 죽은 코드였다 — passedGate 를 true 로 만드는 곳이 어디에도 없었다.
    //
    // 이제 게이트를 풀어 시계를 다시 흘려보낸다. 세팅이 물러나는 걸 보고 나서 넘긴다.
    this.setState({ passedGate: true });
    // 시간이 아니라 타이머로 넘기는 이유: 창이 뒤로 가면 rAF 가 스로틀돼 시계가
    // 거의 멈춘다. 그러면 무대가 영영 안 넘어간다.
    this.handOff = window.setTimeout(() => this.props.onStartDemo(), EXIT_MS);
  };

  /** 언어를 바꾸면 이 화면의 글자도 바뀌어야 한다 — 클래스 컴포넌트라 구독해서 직접 리렌더.
   *  setLang 은 전환 연출 뒤에 커밋하므로 호출 직후에 그리면 아직 옛 언어가 나온다. */
  private pickLang = (l: Lang) => { setLang(l); };

  /** 모드는 클릭 시점에 저장하고 곧바로 적용한다. 오버레이가 걷히면 **고른 모양이 이미 서 있다** —
   *  세팅이 먼저고 조립은 그 결과라는 이 화면의 원칙이 테마와 똑같이 모드에도 적용된다.
   *  state 에도 두는 이유: 이 컴포넌트는 언어 변경 때만 다시 그려서, localStorage 만 쓰면
   *  방금 고른 카드에 하이라이트가 안 붙는다. */
  private pickMode = (m: UiMode) => {
    this.setState({ mode: m });
    setUiMode(m);
    applyUiMode(m);
  };

  private pick = (id: string) => {
    this.setState({ theme: id });
    setThemeId(id);
    applyTheme(id);          // 즉시 반영 — 고른 게 조립에 그대로 나와야 한다
  };

  private done = false;
  private finish(wantsTour: boolean) {
    if (this.done) return;   // rAF 와 키 입력이 겹쳐 두 번 불릴 수 있다
    this.done = true;
    this.props.onDone({ wantsTour });
  }


  /** 세팅 2쪽부터 — 한 쪽에 하나씩.
   *
   *  예전 설정 마법사(Onboarding.tsx)가 물어보던 것들이다. 오프닝이 마법사를 대체하면서
   *  AI 연결·자율성·키맵·글꼴이 첫 실행 흐름에서 통째로 빠졌다 — 설정 모달에는 남아
   *  있었지만 아무도 안내하지 않으니 없는 것과 같았다.
   *
   *  처음엔 이 넷을 한 쪽에 몰아넣었다. 그러면 그 쪽이 **목록**이 되고, 목록은 훑고
   *  지나가게 된다. 자율성처럼 읽고 정해야 하는 것이 키맵 알약 옆에 나란히 놓이면 같은
   *  무게로 보인다. 하나씩 물으면 각자 설명할 자리가 생긴다.
   *
   *  마법사의 화면을 그대로 옮기지는 않았다. 그쪽은 색이 다크에 박혀 있어(#151917)
   *  Paper 테마에서 읽을 수 없다. 여기서는 tk 로 칠한다. 저장 함수는 그대로 쓴다 —
   *  설정 모달과 같은 곳에 쓰므로 두 화면이 어긋날 일이 없다. */
  private renderStep(tk: typeof THEME_TOKENS[string]) {
    const s = this.state;
    const pill = (on: boolean): React.CSSProperties => ({
      fontFamily: "inherit", fontSize: 12.5, padding: "8px 15px", borderRadius: 9, cursor: "pointer",
      border: `1px solid ${on ? tk.accent : tk.w12}`,
      background: on ? tk.accent : "transparent",
      color: on ? tk.onAccent : tk.fgSub,
      fontWeight: on ? 650 : 400, whiteSpace: "nowrap",
      transition: "border-color .18s, background .18s",
    });
    // 쪽마다 한 줄 — 무엇을 왜 고르는지. 쪽이 하나씩이라 이걸 놓을 자리가 생겼다.
    const lede = (key: string) => (
      <p style={{ fontSize: 13, lineHeight: 1.7, color: tk.fgSub2, margin: "-12px 0 0",
        maxWidth: "min(600px, 82vw)", whiteSpace: "normal" }}>{t(key)}</p>
    );

    return (
      <>
        {s.page === 2 && this.stepAi(tk, pill, lede)}
        {s.page === 3 && this.stepAutonomy(tk, lede)}
        {s.page === 4 && this.stepKeymap(tk, pill, lede)}
        {s.page === 5 && this.stepFonts(tk, pill, lede)}
        {this.stepNav(tk)}
      </>
    );
  }

  /** 쪽 이동 + 진행 표시. 어느 쪽에서든 같은 자리에 있어야 손이 안 헤맨다. */
  private stepNav(tk: typeof THEME_TOKENS[string]) {
    const cur = this.state.page, last = STEP_TITLES.length;
    return (
      <div style={{ display: "grid", justifyItems: "center", gap: 13, marginTop: 2 }}>
        <div style={{ display: "flex", gap: 6 }} aria-hidden>
          {STEP_TITLES.map((_, i) => (
            <span key={i} style={{
              width: i + 1 === cur ? 22 : 6, height: 6, borderRadius: 3,
              background: i + 1 === cur ? tk.accent : (i + 1 < cur ? tk.accentSoft : tk.w10),
              transition: "width .3s var(--ease), background .3s",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {cur > 1 && (
            <button onClick={() => this.setState({ page: cur - 1 })} style={{
              fontFamily: "inherit", fontSize: 13, padding: "10px 18px", borderRadius: 10,
              border: `1px solid ${tk.w12}`, background: "transparent", color: tk.fgSub, cursor: "pointer",
            }}>{t("common.prev")}</button>
          )}
          <button onClick={() => (cur >= last ? this.pass() : this.setState({ page: cur + 1 }))} style={{
            fontFamily: "inherit", fontSize: 14.5, padding: "11px 30px", borderRadius: 10, border: "none",
            background: tk.accent, color: tk.onAccent, fontWeight: 650, cursor: "pointer",
          }}>{t(cur >= last ? "open.setup.go" : "open.setup.next")}</button>
        </div>
      </div>
    );
  }

  /** 2쪽 — AI 연결. 이게 없으면 앱이 아무것도 못 하지만, 첫 화면에서 로그인을 강요당하면
   *  사람은 그대로 닫는다. 그래서 "지금 넘어가도 된다" 를 분명히 적는다. */
  private stepAi(tk: typeof THEME_TOKENS[string], pill: (on: boolean) => React.CSSProperties, lede: (k: string) => React.ReactNode) {
    const s = this.state;
    void s.connTick;   // 저장소를 보고 판단하므로 다시 그릴 신호가 필요하다
    const PROV = [
      { id: "claude", name: "Claude", cli: "claude", role: "open.conn.roleClaude" },
      { id: "gpt", name: "GPT", cli: "codex", role: "open.conn.roleGpt" },
    ];
    return (
      <>
        {lede("open.step.ai.lede")}
        <div style={{ display: "grid", gap: 10, width: "min(600px, 82vw)" }}>
          {PROV.map(p => {
            const on = PROVIDERS_MAP[p.id]?.isConfigured?.() ?? false;
            const open = s.keyOpen === p.id;
            return (
              <div key={p.id} style={{
                background: tk.bgPanel, border: `1.5px solid ${on ? tk.accent : tk.w08}`,
                borderRadius: 13, padding: "14px 16px", textAlign: "left", transition: "border-color .2s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", flex: "none",
                    background: on ? tk.accent : tk.w14 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 650, color: tk.fg }}>{p.name}</span>
                      <span style={{ fontSize: 11.5, color: on ? tk.accent : tk.fgDim2 }}>
                        {on ? t("open.conn.on") : t("open.conn.off")}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: tk.fgDim2, marginTop: 2 }}>{t(p.role)}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { try { (window as any).schutz?.cliLogin?.(p.cli); } catch { /* */ } }}
                    style={{ ...pill(false), fontSize: 11.5, padding: "7px 12px" }}>{t("open.conn.sub")}</button>
                  <button onClick={() => this.setState({ keyOpen: open ? null : p.id, keyDraft: getStoredKey(p.id as any) })}
                    style={{ ...pill(open), fontSize: 11.5, padding: "7px 12px" }}>{t("open.conn.key")}</button>
                </div>
                {open && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <input type="password" value={s.keyDraft} autoFocus
                      onChange={e => this.setState({ keyDraft: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") this.saveKey(p.id); }}
                      placeholder={t("open.conn.keyPlaceholder")}
                      style={{ flex: 1, minWidth: 0, fontFamily: "inherit", fontSize: 12.5, padding: "8px 11px",
                        borderRadius: 9, border: `1px solid ${tk.w12}`, background: tk.bgRoot, color: tk.fg, outline: "none" }} />
                    <button onClick={() => this.saveKey(p.id)} style={{ ...pill(true), fontSize: 12 }}>{t("open.conn.save")}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: tk.fgDim2, margin: "-8px 0 0", maxWidth: "min(600px,82vw)", whiteSpace: "normal" }}>
          {t("open.conn.hint")}
        </p>
      </>
    );
  }

  /** 3쪽 — 자율성. 읽고 정해야 하는 것이라 카드를 크게 두고 설명을 붙인다. */
  private stepAutonomy(tk: typeof THEME_TOKENS[string], lede: (k: string) => React.ReactNode) {
    const s = this.state;
    return (
      <>
        {lede("open.step.autonomy.lede")}
        <div style={{ display: "flex", gap: 13, justifyContent: "center", flexWrap: "wrap" }}>
          {(["manual", "balanced", "auto"] as const).map(k => {
            const on = s.policy === k;
            return (
              <button key={k} aria-pressed={on}
                onClick={() => { this.setState({ policy: k }); setAutonomy({ policy: k }); }}
                style={{
                  width: 205, padding: "16px 16px 15px", borderRadius: 13, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left", whiteSpace: "normal", overflow: "hidden",
                  background: tk.bgPanel, color: tk.fg,
                  border: `2px solid ${on ? tk.accent : "transparent"}`,
                  boxShadow: on ? `0 0 24px ${tk.accentSoft}` : "none",
                  transform: on ? "scale(1.03)" : "none",
                  transition: "transform .25s cubic-bezier(.22,1.2,.36,1), border-color .2s, box-shadow .3s",
                  display: "grid", gap: 7,
                }}>
                <span style={{ fontSize: 13.5, fontWeight: 650 }}>{t("open.pol." + k)}</span>
                <span style={{ fontSize: 11.5, lineHeight: 1.6, color: tk.fgDim2 }}>{t("open.pol." + k + ".desc")}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  /** 4쪽 — 키맵. 손에 배인 단축키가 있으면 여기서 정하는 게 제일 편하다. */
  private stepKeymap(tk: typeof THEME_TOKENS[string], pill: (on: boolean) => React.CSSProperties, lede: (k: string) => React.ReactNode) {
    const s = this.state;
    return (
      <>
        {lede("open.step.keymap.lede")}
        <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
          {KEYMAPS.map(([k, name]) => (
            <button key={k} aria-pressed={s.keymap === k}
              onClick={() => { this.setState({ keymap: k }); setEditorPrefs({ keymap: k }); }}
              style={{ ...pill(s.keymap === k), fontSize: 13.5, padding: "11px 22px" }}>{name}</button>
          ))}
        </div>
      </>
    );
  }

  /** 5쪽 — 글꼴. 버튼을 그 글꼴로 그린다 — 이름만 보고 고르는 것보다 정확하다. */
  private stepFonts(tk: typeof THEME_TOKENS[string], pill: (on: boolean) => React.CSSProperties, lede: (k: string) => React.ReactNode) {
    const s = this.state;
    const row = (label: string, node: React.ReactNode) => (
      <div style={{ display: "grid", gap: 7, justifyItems: "center" }}>
        <span style={{ fontSize: 10, letterSpacing: ".14em", color: tk.fgDim, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>{node}</div>
      </div>
    );
    return (
      <>
        {lede("open.step.fonts.lede")}
        <div style={{ display: "grid", gap: 18 }}>
          {row(t("settings.uiFont"), Object.entries(UI_FONTS).map(([k, v]) => (
            <button key={k} aria-pressed={s.uiFont === k}
              onClick={() => { this.setState({ uiFont: k }); setEditorPrefs({ uiFont: k }); applyUiFont(); }}
              style={{ ...pill(s.uiFont === k), fontFamily: v.stack }}>{v.name}</button>
          )))}
          {row(t("settings.codeFont"), Object.entries(CODE_FONTS).map(([k, v]) => (
            <button key={k} aria-pressed={s.codeFont === k}
              onClick={() => { this.setState({ codeFont: k }); setEditorPrefs({ codeFont: k }); applyUiFont(); }}
              style={{ ...pill(s.codeFont === k), fontFamily: v.stack }}>{v.name}</button>
          )))}
          {row(t("settings.codeSize"), [12, 13, 14, 15].map(n => (
            <button key={n} aria-pressed={s.fontSize === n}
              onClick={() => { this.setState({ fontSize: n }); setEditorPrefs({ fontSize: n }); }}
              style={{ ...pill(s.fontSize === n), fontFamily: CODE_FONTS[s.codeFont]?.stack, fontSize: n + 1 }}>{n}</button>
          )))}
        </div>
      </>
    );
  }

  /** API 키 저장 — 넣자마자 연결 표시가 바뀌어야 하므로 다시 그린다. */
  private saveKey(id: string) {
    setStoredKey(id as any, this.state.keyDraft.trim());
    this.setState(st => ({ keyOpen: null, keyDraft: "", connTick: st.connTick + 1 }));
  }

  /** 데모가 끝난 뒤 마무리. 진짜 UI 를 뒤에 두고 그 위에 뜬다. */
  private renderOutro() {
    const tk = THEME_TOKENS[this.state.theme] ?? THEME_TOKENS.feldgrau;
    return (
      <div role="dialog" aria-modal="true" aria-label={t("open.aria")} className="sz-backdrop" style={{
        position: "fixed", inset: 0, zIndex: 500, display: "grid", placeItems: "center",
        alignContent: "center", gap: 22, padding: "0 10vw", textAlign: "center",
        background: "color-mix(in srgb, " + tk.bgRoot + " 88%, transparent)",
      }}>
        <Mark color={tk.accent} size={44} width={9} />
        <p style={{ fontSize: "clamp(24px,4vw,52px)", fontWeight: 300, letterSpacing: "-.03em", margin: 0, color: tk.fg }}>
          {t("open.done.title")}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => this.finish(true)} style={{
            fontFamily: "inherit", fontSize: 14, padding: "11px 26px", borderRadius: 10, border: "none",
            background: tk.accent, color: tk.onAccent, fontWeight: 650, cursor: "pointer",
          }}>{t("open.done.tour")}</button>
          <button onClick={() => this.finish(false)} style={{
            fontFamily: "inherit", fontSize: 14, padding: "11px 26px", borderRadius: 10,
            border: `1px solid ${tk.w14}`, background: "transparent", color: tk.fgSub, cursor: "pointer",
          }}>{t("open.done.skip")}</button>
        </div>
      </div>
    );
  }

  render() {
    if (this.props.phase === "outro") return this.renderOutro();
    const time = clampToGate(this.state.t, this.state.passedGate);
    const S = (a: number, b: number) => seg(time, a, b);
    const E = (a: number, b: number) => ease(seg(time, a, b));
    const beat = beatAt(time);
    const gate = gateAt() ?? 0;
    const holding = !this.state.passedGate && time >= gate;
    const tk = THEME_TOKENS[this.state.theme] ?? THEME_TOKENS.feldgrau;
    const light = !!tk.light;

    // 무대 색 — 고른 테마를 그대로 쓴다
    const stage: React.CSSProperties = {
      position: "fixed", inset: 0, zIndex: 500, overflow: "hidden",
      background: tk.bgRoot, color: tk.fg, fontFamily: "var(--font-ui, system-ui, sans-serif)",
      transition: "background .6s ease, color .6s ease",
    };

    return (
      <div style={stage} role="dialog" aria-modal="true" aria-label={t("open.aria")}>
        {/* 광원 — 테마 액센트를 색이 아니라 빛으로 쓴다 */}
        <div aria-hidden style={{
          position: "absolute", left: "20%", top: "8%", width: "60%", aspectRatio: "1",
          borderRadius: "50%", filter: "blur(70px)", background: tk.accent, pointerEvents: "none",
          opacity: (light ? 0.16 : 0.3) * E(300, 2500) * (time < 13800 ? 1 : 0.5),
          transition: "opacity .6s ease, background .6s ease",
        }} />

        {/* 1 마크 — 가운데에 획만. 글자를 밑에 붙이면 마크가 로고 조각이 되고, 이 장면이
            "이름표" 로 읽힌다. 무엇 위에 섰는지는 화면 맨 아래에 따로 둔다(바로 아래 블록). */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          opacity: Math.max(0, S(0, 400) - S(4800, 5400)),
          transform: `scale(${1 + E(4800, 5400) * 0.12})`,
        }}>
          <Mark color={tk.accent} size="13vw" dash={620 * (1 - E(400, 2400))} />
        </div>

        {/* 크레딧 — 화면 맨 아래. 가운데 마크와 겹치지 않는 자리라 서로를 방해하지 않고,
            "이 화면의 주인공은 마크" 라는 위계가 유지된다. 획이 닫힌 뒤에 든다. */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: "clamp(24px,4vh,54px)",
          textAlign: "center", padding: "0 6vw",
          fontSize: "clamp(9.5px,1vw,12px)", letterSpacing: ".14em", textTransform: "uppercase",
          color: tk.fgDim, fontWeight: 600,
          opacity: Math.max(0, E(2400, 3400) * 0.85 - S(4800, 5400)),
          transform: `translateY(${(1 - E(2400, 3400)) * 8}px)`,
        }}>
          {t("open.poweredBy", { engine: ENGINE_CREDIT })}
        </div>

        {/* 2 선언 */}
        <Say time={time} tk={tk} />

        {/* 3 세팅 — 여기서 멈춘다 */}
        {(() => {
          // 퇴장은 **누른 즉시** 시작한다. 예전 값(13800~14500)은 게이트에서 1.5초를
          // 아무 일 없이 흘려보낸 뒤에야 움직였다 — 눌렀는데 굳어 있는 것으로 보인다.
          const inP = E(11300, 12200), outP = this.state.passedGate ? E(EXIT_FROM, EXIT_TO) : 0;
          const op = inP * (1 - outP);
          if (op < 0.01) return null;
          return (
            <div style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center",
              gap: 26, padding: "0 8vw", textAlign: "center",
              opacity: op, transform: `translateY(${(1 - inP) * 16 - outP * 10}px)`,
              pointerEvents: op > 0.5 ? "auto" : "none",
            }}>
              {/* 제목만 덩그러니 있으면 허전하다. 방금 획이 그려진 그 마크를 작게 얹어
                  앞 장면과 이 화면을 잇는다 — 새 그림을 들이는 것보다 낫다. */}
              <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
                <Mark color={tk.accent} size={44} width={9} />
                <div style={{ width: 26, height: 1, background: tk.w14 }} />
                {/* 두 쪽의 제목이 같으면 넘겼는데 같은 화면이 다시 뜬 것처럼 보인다. */}
                <h2 style={{ fontSize: "clamp(22px,3.2vw,40px)", fontWeight: 350, letterSpacing: "-.02em", margin: 0 }}>
                  {t(STEP_TITLES[this.state.page - 1] ?? "open.setup.title")}
                </h2>
              </div>

              {this.state.page > 1 ? this.renderStep(tk) : <>
              {/* 언어가 먼저다 — 읽지 못하는 화면에서 테마를 고르게 할 수는 없다. */}
              <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                <div style={{ fontSize: 10, letterSpacing: ".16em", color: tk.fgDim, fontWeight: 700, textTransform: "uppercase" }}>
                  {t("open.setup.lang")}
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                  {LANGS.map(([id, label]) => {
                    const on = getLang() === id;
                    return (
                      <button key={id} onClick={() => this.pickLang(id)} aria-pressed={on}
                        style={{
                          fontFamily: "inherit", fontSize: 12.5, padding: "7px 15px", borderRadius: 8, cursor: "pointer",
                          background: on ? tk.accent : "transparent", color: on ? tk.onAccent : tk.fgSub,
                          border: `1px solid ${on ? "transparent" : tk.w14}`, fontWeight: on ? 650 : 400,
                          transition: "background .2s, color .2s",
                        }}>{label}</button>
                    );
                  })}
                </div>
              </div>

              <div style={{ fontSize: 10, letterSpacing: ".16em", color: tk.fgDim, fontWeight: 700, textTransform: "uppercase", marginTop: 4 }}>
                {t("open.setup.theme")}
              </div>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: -16 }}>
                {CHOICES.map(id => {
                  const c = THEME_TOKENS[id];
                  const on = this.state.theme === id;
                  return (
                    <button key={id} onClick={() => this.pick(id)} aria-pressed={on}
                      style={{
                        width: 132, padding: 12, borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                        background: c.bgPanel, color: c.fg,
                        border: `2px solid ${on ? c.accent : "transparent"}`,
                        boxShadow: on ? `0 0 26px ${c.accentSoft}` : "none",
                        transform: on ? "scale(1.05)" : "none",
                        transition: "transform .25s cubic-bezier(.22,1.2,.36,1), border-color .2s, box-shadow .3s",
                      }}>
                      <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 9 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 5, background: c.accent }} />
                        <span style={{ width: 22, height: 22, borderRadius: 5, background: c.bgEditor, border: `1px solid ${c.w12}` }} />
                        <span style={{ width: 22, height: 22, borderRadius: 5, background: c.ok }} />
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
                    </button>
                  );
                })}
              </div>
              {/* 세 번째 선택 — 언어·테마와 나란히. 이건 되돌릴 수 있는 취향이 아니라
                  **앱이 무엇인지**를 고르는 것이라 카드를 크게 두고 한 줄 설명을 붙인다. */}
              <div style={{ fontSize: 10, letterSpacing: ".16em", color: tk.fgDim, fontWeight: 700, textTransform: "uppercase", marginTop: 4 }}>
                {t("mode.settingsLabel")}
              </div>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: -16 }}>
                {UI_MODES.map(m => {
                  const on = this.state.mode === m;
                  return (
                    <button key={m} onClick={() => this.pickMode(m)} aria-pressed={on}
                      style={{
                        width: 196, padding: "13px 13px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                        // 버튼 안의 설명은 반드시 감싸야 한다 — 기본값이면 한 줄로 뻗어 카드를
                        // 뚫고 나가고, 두 카드의 설명이 서로 겹쳐 읽을 수 없게 된다.
                        textAlign: "center", whiteSpace: "normal", overflow: "hidden",
                        background: tk.bgPanel, color: tk.fg,
                        border: `2px solid ${on ? tk.accent : "transparent"}`,
                        boxShadow: on ? `0 0 26px ${tk.accentSoft}` : "none",
                        transform: on ? "scale(1.04)" : "none",
                        transition: "transform .25s cubic-bezier(.22,1.2,.36,1), border-color .2s, box-shadow .3s",
                      }}>
                      <ModeDiagram mode={m} tk={tk} />
                      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 9 }}>{t("mode." + m)}</div>
                      <div style={{ fontSize: 10.5, lineHeight: 1.5, color: tk.fgDim2, marginTop: 4 }}>{t("mode." + m + ".desc")}</div>
                    </button>
                  );
                })}
              </div>
              {/* 지난 대화 — **찾았을 때만** 나타난다.
                  처음 쓰는 사람에게는 이 블록이 아예 없어서 화면 길이가 그대로다.
                  여기서 고르는 건 "가져오겠다" 뿐이고, 무엇을 가져올지는 오프닝이 걷힌 뒤
                  고른다. 첫 실행 화면에 파일 목록을 띄우면 세팅이 아니라 작업이 된다. */}
              {this.state.pastChats !== null && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 13, marginTop: -8,
                  padding: "11px 14px", borderRadius: 11, textAlign: "left",
                  background: tk.bgPanel, border: `1px solid ${this.state.wantsImport ? tk.accent : tk.w08}`,
                  transition: "border-color .2s",
                }}>
                  <ImportGlyph color={tk.accent} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: tk.fg }}>{t("imp.found", { n: this.state.pastChats })}</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.5, color: tk.fgDim2, marginTop: 2, whiteSpace: "normal" }}>
                      {t("imp.foundHint")}
                    </div>
                  </div>
                  <div style={{ flex: "none", display: "flex", gap: 6 }}>
                    {([[false, "imp.later"], [true, "imp.now"]] as const).map(([want, key]) => {
                      const on = this.state.wantsImport === want;
                      return (
                        <button key={key} onClick={() => { this.setState({ wantsImport: want }); this.props.onWantsImport(want); }} aria-pressed={on}
                          style={{
                            fontFamily: "inherit", fontSize: 11.5, padding: "7px 13px", borderRadius: 8, cursor: "pointer",
                            whiteSpace: "nowrap",
                            border: `1px solid ${on ? tk.accent : tk.w12}`,
                            background: on && want ? tk.accent : "transparent",
                            color: on && want ? tk.onAccent : on ? tk.fg : tk.fgDim,
                            fontWeight: on ? 650 : 400,
                          }}>{t(key)}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              <p style={{ fontSize: 12, color: tk.fgDim2, margin: "-10px 0 0" }}>{t("open.setup.hint")}</p>
              {this.stepNav(tk)}
              </>}
            </div>
          );
        })()}

        {/* 항상 열려 있는 탈출구 */}
        {beat.id !== "settle" && (
          <button onClick={() => this.finish(false)} style={{
            position: "absolute", right: 18, top: 16, fontFamily: "inherit", fontSize: 12,
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${tk.w12}`,
            background: "transparent", color: tk.fgDim, cursor: "pointer", zIndex: 2,
          }}>{t("open.skip")}</button>
        )}

        {holding && (
          <div aria-live="polite" className="sr-only">{t("open.setup.hint")}</div>
        )}
      </div>
    );
  }
}

/** 지난 대화를 데려온다 — 대화 두 줄이 상자 안으로 들어간다.
 *
 *  예전엔 텍스트 글리프(⤓)를 썼다. 폰트가 그리는 것이라 획 굵기가 옆 글자에 끌려다니고,
 *  이 화면의 다른 그림(마크·모드 도안)과 굵기가 안 맞았다. 직접 그리면 그 둘이 맞는다.
 *
 *  "내려받기" 가 아니라 **대화가 들어온다** 는 그림이다 — 상자는 Schutz 고, 위에서
 *  내려오는 두 줄이 지난 대화다. 화살표 하나만 두면 파일 다운로드로 읽힌다. */
function ImportGlyph({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden
      style={{ flex: "none", display: "block" }}>
      {/* 들어오는 대화 두 줄 — 짧은 쪽이 앞이라 원근이 생긴다 */}
      <path d="M6.5 2.5h7" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
      <path d="M5 5.5h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".75" />
      {/* 화살촉 — 두 줄이 향하는 곳 */}
      <path d="M10 8v3.5M7.6 9.6 10 12l2.4-2.4" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* 받는 상자 — 위가 열려 있다 */}
      <path d="M3.5 13v3a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-3"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 선언 — 단어가 흐림에서 하나씩 풀린다.
 *
 *  시각이 beats.ts 와 **따로** 적혀 있다. 비트는 "언제 무엇이 무대에 있나" 를 정하고,
 *  여기 숫자는 그 안에서의 연출이라 성격이 다르다. 다만 비트를 밀 때 이쪽을 같이 안
 *  밀면 앞 장면 위에 겹쳐 뜬다 — 실제로 마크 구간을 늘렸을 때 이름 위로 선언이 올라왔다.
 *  비트를 건드리면 이 파일의 숫자도 함께 본다. */
function Say({ time, tk }: { time: number; tk: typeof THEME_TOKENS[string] }) {
  const words = t("open.say").split(/(\s+)/);
  const out = ease(seg(time, 10600, 11300));
  const gone = ease(seg(time, 10800, 11400));
  if (gone >= 1) return null;
  let wi = -1;
  return (
    <div aria-hidden={time < 3600} style={{
      position: "absolute", inset: 0, display: "grid", placeItems: "center",
      padding: "0 8vw", textAlign: "center", opacity: 1 - gone,
    }}>
      <div>
      <p style={{ fontSize: "clamp(24px,5.4vw,64px)", fontWeight: 300, letterSpacing: "-.03em", lineHeight: 1.22, margin: 0 }}>
        {words.map((w, i) => {
          if (!w.trim()) return w;
          wi++;
          const p = ease(seg(time, 5700 + wi * 90, 6400 + wi * 90));
          const em = w.startsWith("*") && w.endsWith("*");
          return (
            <span key={i} style={{
              display: "inline-block", opacity: p * (1 - out),
              transform: `translateY(${(1 - p) * 0.42 - out * 0.25}em)`,
              filter: `blur(${(1 - p) * 7}px)`,
              fontWeight: em ? 650 : undefined, color: em ? tk.accentHi : undefined,
            }}>{em ? w.slice(1, -1) : w}</span>
          );
        })}
      </p>
      {/* 명대사는 독일어로 두되 뜻은 준다 — 멋만 부리고 읽는 사람을 두고 가지 않는다 */}
      <p style={{
        fontSize: "clamp(12px,1.3vw,16px)", color: tk.fgDim, margin: "18px 0 0", letterSpacing: ".01em",
        opacity: ease(seg(time, 7400, 8300)) * (1 - out),
      }}>{t("open.saySub")}</p>
      </div>
    </div>
  );
}

/**
 * 브랜드 마크. 언제나 선으로 그린다 — 이 path 는 외곽선용이라 fill 을 주면 안쪽
 * 여백이 메워져 삼각형 두 개로 뭉개진다(로고로 안 읽힌다).
 * dash 를 주면 그려지는 중, 생략하면 다 그려진 상태.
 */
function Mark({ color, size, dash = 0, width = 7 }: {
  color: string; size: number | string; dash?: number; width?: number;
}) {
  return (
    <svg viewBox="0 0 120 130" style={{ width: size, display: "block" }} aria-hidden>
      <path d="M34 14 L86 46 L58 62 L86 78 L34 116 L34 76 L62 60 L34 44 Z"
        fill="none" stroke={color} strokeWidth={width}
        strokeDasharray={620} strokeDashoffset={dash} />
    </svg>
  );
}

/** 모드 카드의 그림 — 스크린샷도 로고도 아니고 **레이아웃의 뼈대**다.
 *  editor: 좁은 레일 + 트리 + 넓은 편집기 + 우측 패널. agent: 한 기둥과 그 아래 프롬프트. */
function ModeDiagram({ mode, tk }: { mode: string; tk: any }) {
  const line = (w: string, o = 1) => ({ height: 3, width: w, borderRadius: 2, background: tk.fgDim, opacity: o });
  return (
    <div style={{ height: 52, borderRadius: 7, background: tk.bgEditor, border: `1px solid ${tk.w12}`, padding: 6, display: "flex", gap: 4 }}>
      {mode === "editor" ? (
        <>
          <div style={{ width: 6, borderRadius: 3, background: tk.w12 }} />
          <div style={{ width: 20, borderRadius: 3, background: tk.w12 }} />
          <div style={{ flex: 1, borderRadius: 3, background: tk.accentSoft, display: "grid", alignContent: "center", gap: 4, padding: "0 5px" }}>
            <div style={line("80%", .7)} /><div style={line("55%", .5)} /><div style={line("68%", .4)} />
          </div>
          <div style={{ width: 16, borderRadius: 3, background: tk.w12 }} />
        </>
      ) : (
        <div style={{ flex: 1, display: "grid", alignContent: "space-between", padding: "1px 4px" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={line("70%", .7)} /><div style={line("46%", .5)} /><div style={line("58%", .4)} />
          </div>
          <div style={{ height: 11, borderRadius: 3, background: tk.accentSoft, border: `1px solid ${tk.w12}` }} />
        </div>
      )}
    </div>
  );
}
