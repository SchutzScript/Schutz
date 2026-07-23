import React from "react";
import { t, LANGS, getLang, setLang, onLangChange } from "../i18n";
import type { Lang } from "../i18n";
import { THEME_TOKENS, applyTheme, setThemeId, getThemeId } from "../theme";
import { UI_MODES, getUiMode, setUiMode, applyUiMode, type UiMode } from "../uiMode";
import { KEYMAPS, UI_FONTS, CODE_FONTS, getEditorPrefs, setEditorPrefs, applyUiFont, getAutonomy, setAutonomy } from "../settings";
import { PROVIDERS_MAP, getManagerId } from "../ai/registry";
import { getStoredKey, setStoredKey } from "../ai/provider";
import * as mcp from "../mcp/mcpClient";
import * as engines from "../gameEngine/adapters";
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
/** 세팅이 걷힌 뒤 "이제 시연" 을 알리고 넘어가기까지. 안내 없이 넘기면 IDE 가 툭 뜬다. */
const ANNOUNCE_MS = 1900;
/** 마무리 화면이 물러나는 시간. 짧게 — 여기서 기다리게 하면 시작이 늦어진 것으로 느낀다. */
const LEAVE_MS = 340;

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
  /** 마무리 화면이 물러나는 중. 이때 onDone 을 아직 부르지 않아 오버레이가 살아 있다. */
  leaving: boolean;
  /** 마지막으로 움직인 방향. 앞으로 갈 땐 오른쪽에서, 뒤로 갈 땐 왼쪽에서 들어온다 —
   *  방향이 없으면 다섯 쪽이 같은 자리에서 깜빡이기만 해서 "넘어갔다" 로 안 읽힌다. */
  pageDir: 1 | -1;
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
  /** 세팅이 걷힌 뒤 "이제 시연" 안내를 띄우는 중. 이게 있어야 IDE 가 툭 뜨지 않는다. */
  announcing: boolean;
  /** 이번 세션에 연결한 엔진 어댑터 id 들. */
  engineConnected: string[];
  /** 어댑터 id → 이미 설치·발견돼 바로 연결 가능한가(설치 버튼 대신 연결 버튼을 보인다). */
  engineAvail: Record<string, boolean>;
  /** 연결이 진행 중인 어댑터 id("" = 없음). 그 카드 버튼을 잠근다. */
  engineBusy: string;
  /** 설치 안내(제작자) 패널이 펼쳐진 어댑터 id("" = 접힘). */
  engineExpand: string;
  /** GitHub 설치(clone→build)가 도는 중. */
  engineInstalling: boolean;
  /** 설치 진행 문구(내려받는 중·설치 중·빌드 중). */
  enginePhase: string;
  /** 설치 실패 메시지. 있으면 패널에 붉게 보여준다. */
  engineErr: string;
}

export class Opening extends React.Component<Props, State> {
  state: State = (() => {
    const ed = getEditorPrefs();
    return {
      t: 0, passedGate: false, theme: getThemeId(), mode: getUiMode(), pastChats: null, wantsImport: false,
      page: 1 as const, pageDir: 1 as const, leaving: false, keymap: ed.keymap, uiFont: ed.uiFont, codeFont: ed.codeFont, fontSize: ed.fontSize,
      policy: getAutonomy().policy, keyOpen: null, keyDraft: "", connTick: 0, announcing: false,
      engineConnected: engines.ADAPTERS.filter(a => mcp.getMcpTools().some(tl => tl.server === a.serverName)).map(a => a.id),
      engineAvail: {}, engineBusy: "", engineExpand: "", engineInstalling: false, enginePhase: "", engineErr: "",
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
    // 각 엔진이 이미 쓸 수 있으면(발견된 설정이 있거나 GitHub 설치본이 있으면) '설치' 대신 '연결'만
    // 보여준다. 둘 다 없는 처음 쓰는 사용자에게만(그리고 install 스펙이 있는 엔진만) 설치를 권한다.
    if (window.schutz) {
      void mcp.discover(null).then(async disc => {
        const avail: Record<string, boolean> = {};
        for (const a of engines.ADAPTERS) {
          let ok = (disc || []).some(d => d.name === a.serverName);
          if (!ok && a.install) { try { ok = !!(await window.schutz!.engineInstalledPath({ id: a.id, entry: a.install.entry })); } catch { /* */ } }
          avail[a.id] = ok;
        }
        this.setState({ engineAvail: avail });
      }).catch(() => { /* 못 물어봐도 그냥 버튼을 보여준다 */ });
    }
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
    clearTimeout(this.announceT);
    clearTimeout(this.leaveT);
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    this.langOff?.();
    this.langOff = null;
  }

  /** 키보드 단축. Esc 는 어느 국면에서든 빠져나간다(붙잡아두는 게 아니라 보여주는 것이라
   *  길이 늘 열려 있어야 한다). Enter 는 **세팅에서만** 진행 키다 — 화면의 Next 버튼과
   *  똑같은 규칙으로 다음 쪽으로 넘기고, 마지막 쪽에서만 무대를 넘긴다.
   *
   *  예전엔 국면·페이지와 무관하게 곧장 pass() 를 불렀다. 세팅이 한 장이던 시절의 코드라,
   *  다섯 장으로 나뉜 뒤로는 (1) 첫 쪽에서 Enter → 자율성·키맵·글꼴을 건너뛰고 데모로 튀고,
   *  (2) 마무리 화면에서 Enter → 데모가 통째로 재실행됐다(마무리에서도 tick 이 시계를
   *  게이트까지 밀어두므로 조건이 참이 된다). */
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { this.finish(false); return; }
    if (e.key !== "Enter") return;
    if (this.props.phase !== "intro") return;                       // 마무리 화면은 버튼만 받는다
    if (this.state.passedGate || this.state.t < (gateAt() ?? Infinity)) return;
    if (this.state.page >= STEP_TITLES.length) this.pass();
    else this.goStep(this.state.page + 1);
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
  /** 세팅이 걷힌 뒤 "이제 시연" 안내를 띄우는 타이머. */
  private announceT = 0;

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
    // 세팅이 걷힌 뒤 "이제 시연을 보여드릴게요" 를 잠깐 띄우고 넘어간다 — 안 그러면 IDE 가
    // 툭 뜬다. 시간이 아니라 타이머로 넘기는 이유: 창이 뒤로 가면 rAF 가 스로틀돼 시계가
    // 거의 멈춘다. 그러면 무대가 영영 안 넘어간다.
    this.announceT = window.setTimeout(() => this.setState({ announcing: true }), EXIT_MS);
    this.handOff = window.setTimeout(() => this.props.onStartDemo(), EXIT_MS + ANNOUNCE_MS);
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
    // 눌렀는데 화면이 **툭** 사라지면 투어가 시작된 게 아니라 창이 닫힌 것처럼 보인다.
    // 물러나는 걸 보여준 뒤에 넘긴다. 모션 최소화면 기다릴 이유가 없다.
    if (this.reduced) { this.props.onDone({ wantsTour }); return; }
    this.setState({ leaving: true });
    this.leaveT = window.setTimeout(() => this.props.onDone({ wantsTour }), LEAVE_MS);
  }
  private leaveT = 0;


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

    // key 를 쪽 번호로 두면 넘길 때마다 노드가 갈리므로 애니메이션이 다시 재생된다.
    // 내비게이션은 이 밖에 둔다 — 버튼이 같이 미끄러지면 누른 것이 도망가는 것처럼 보인다.
    // 위쪽 공용 그림은 AI 쪽만. 자율성·키맵은 옵션 카드가, 글꼴은 실제 코드 미리보기가
    // 각각 예시라 따로 붙이지 않는다.
    const topic = ({ 2: "ai" } as Record<number, "ai">)[s.page];
    return (
      <>
        <div key={s.page} className={s.pageDir > 0 ? "sz-step-fwd" : "sz-step-back"}
          style={{ display: "grid", justifyItems: "center", gap: "clamp(14px,1.8vw,26px)", width: "100%" }}>
          {topic && <StepFigure topic={topic} tk={tk} />}
          {s.page === 2 && this.stepAi(tk, pill, lede)}
          {s.page === 3 && this.stepAutonomy(tk, lede)}
          {s.page === 4 && this.stepKeymap(tk, pill, lede)}
          {s.page === 5 && this.stepFonts(tk, pill, lede)}
        </div>
      </>
    );
  }

  /** 쪽 이동. 방향을 함께 기록해야 들어오는 쪽이 어디서 올지 정해진다. */
  private goStep = (next: number) => {
    const cur = this.state.page;
    if (next === cur) return;
    this.setState({ page: next, pageDir: next > cur ? 1 : -1 });
  };

  /** 쪽 이동 + 진행 표시. 어느 쪽에서든 같은 자리에 있어야 손이 안 헤맨다. */
  private stepNav(tk: typeof THEME_TOKENS[string]) {
    const cur = this.state.page, last = STEP_TITLES.length;
    return (
      <div style={{ flex: "none", display: "grid", justifyItems: "center", gap: 13,
        paddingBottom: "clamp(52px,9vh,96px)" }}>
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
            <button onClick={() => this.goStep(cur - 1)} style={{
              fontFamily: "inherit", fontSize: 13, padding: "10px 18px", borderRadius: 10,
              border: `1px solid ${tk.w12}`, background: "transparent", color: tk.fgSub, cursor: "pointer",
            }}>{t("common.prev")}</button>
          )}
          <button onClick={() => (cur >= last ? this.pass() : this.goStep(cur + 1))} style={{
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
    // 실제 관리자 지정. 미설정이면 Claude 가 기본 관리자다(App 의 관리자 선택과 같은 규칙).
    const managerId = getManagerId() || "claude";
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
                      {p.id === managerId && (
                        <span style={{ fontSize: 9.5, letterSpacing: ".04em", color: tk.accent,
                          background: tk.accentSoft, borderRadius: 4, padding: "1px 6px" }}>{t("open.conn.managerBadge")}</span>
                      )}
                      <span style={{ fontSize: 11.5, color: on ? tk.accent : tk.fgDim2 }}>
                        {on ? t("open.conn.on") : t("open.conn.off")}
                      </span>
                    </div>
                    {/* 이름 아래 한 줄은 "무엇을 하는지" — 관리자면 계획·위임, 아니면 편집·명령 실행 */}
                    <div style={{ fontSize: 11.5, color: tk.fgDim2, marginTop: 2 }}>
                      {t(p.id === managerId ? "open.conn.roleManager" : "open.conn.roleAgent")}
                    </div>
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
                      /* 이 입력 안의 키는 창 레벨 onKey 로 새지 않게 막는다 — 그렇지 않으면
                         Enter 가 키를 저장하면서 세팅까지 넘겨버리고, Esc 가 오프닝 전체를
                         닫아버린다. stopPropagation 이 네이티브 이벤트 전파도 멈춘다. */
                      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") this.saveKey(p.id); }}
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
        {/* 게임·3D 엔진(선택) — 코더가 아닌 사람도 여기서 바로 붙일 수 있게, MCP 패널이 아니라
            첫 화면에 둔다. 어댑터마다 한 장씩. 폴더가 있는 엔진은 폴더를, 설치가 필요하면 제작자를
            띄운 뒤 GitHub 에서 가져온다. */}
        {engines.ADAPTERS.map(a => {
          const on = s.engineConnected.includes(a.id) || mcp.getMcpTools().some(tl => tl.server === a.serverName);
          const available = !!s.engineAvail[a.id];
          // 발견·설치돼 있으면 연결. 설치 스펙이 없는 엔진(Blender)은 preset 으로 늘 연결 가능하다.
          // 설치 스펙이 있는 엔진(OVERDARE)은 preset(npm)이 미덥지 않으니 없을 때 설치를 권한다.
          const connectable = available || (!!a.preset && !a.install);
          const busy = s.engineBusy === a.id;
          const expanded = s.engineExpand === a.id;
          return (
            <div key={a.id} style={{ background: tk.bgPanel, border: `1.5px solid ${on ? tk.accent : tk.w08}`,
              borderRadius: 13, padding: "14px 16px", textAlign: "left", width: "min(600px,82vw)", transition: "border-color .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: on ? tk.accent : tk.w14 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 650, color: tk.fg }}>{a.label}</span>
                    <span style={{ fontSize: 9.5, letterSpacing: ".04em", color: tk.fgDim2, background: tk.w08, borderRadius: 4, padding: "1px 6px" }}>{t("open.engine.badge")}</span>
                    <span style={{ fontSize: 11.5, color: on ? tk.accent : tk.fgDim2 }}>{on ? t("open.engine.connected") : t("open.engine.off")}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: tk.fgDim2, marginTop: 2 }}>{t(a.descKey)}</div>
                </div>
                <div style={{ flex: 1 }} />
                {!on && (connectable
                  ? <button onClick={() => void this.connectEngine(a)} disabled={busy}
                      style={{ ...pill(false), fontSize: 11.5, padding: "7px 12px", opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>
                      {busy ? t("open.engine.connecting") : t(a.projectEnv ? "open.engine.connect" : "open.engine.connectPlain")}
                    </button>
                  : a.install && <button onClick={() => this.setState({ engineExpand: expanded ? "" : a.id, engineErr: "" })}
                      style={{ ...pill(expanded), fontSize: 11.5, padding: "7px 12px" }}>{t("open.engine.install")}</button>
                )}
              </div>
              {/* 설치 안내 — MCP 를 제작자의 GitHub 에서 가져온다. 설치 화면에 제작자를 띄운다. */}
              {!on && !connectable && expanded && a.install && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${tk.w08}` }}>
                  <div style={{ fontSize: 11.5, color: tk.fgDim2, lineHeight: 1.55 }}>{t("open.engine.installDesc")}</div>
                  <div style={{ fontSize: 11.5, color: tk.fgSub, marginTop: 7 }}>
                    {t("open.engine.creator")} · <a href={a.install.creator.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: tk.accent, textDecoration: "none", fontWeight: 600 }}>{a.install.creator.name}</a>
                  </div>
                  {s.engineErr && <div style={{ fontSize: 11, color: "#CE9A9A", marginTop: 7, whiteSpace: "pre-wrap", maxHeight: 66, overflow: "auto" }}>{s.engineErr}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 11, alignItems: "center" }}>
                    <button onClick={() => void this.installEngine(a)} disabled={s.engineInstalling}
                      style={{ ...pill(true), fontSize: 12, opacity: s.engineInstalling ? 0.7 : 1, cursor: s.engineInstalling ? "default" : "pointer" }}>
                      {s.engineInstalling ? (s.enginePhase || t("open.engine.installing")) : t("open.engine.doInstall")}
                    </button>
                    {!s.engineInstalling && <button onClick={() => this.setState({ engineExpand: "" })}
                      style={{ ...pill(false), fontSize: 12 }}>{t("common.cancel")}</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <p style={{ fontSize: 12, color: tk.fgDim2, margin: "-8px 0 0", maxWidth: "min(600px,82vw)", whiteSpace: "normal" }}>
          {t("open.conn.hint")}
        </p>
      </>
    );
  }

  /** 3쪽 — 자율성. 셋을 예시 카드로 둔다. 각 카드가 **같은 파일들이 이 정책에서 어떻게
   *  판정되는지**를 실제 규칙(settings.ts autoAcceptFor)대로 보여준다 — 문서·테스트·의존성은
   *  balanced 에서 자동, 로직은 검토, auto 는 전부 자동, manual 은 전부 검토. */
  private stepAutonomy(tk: typeof THEME_TOKENS[string], lede: (k: string) => React.ReactNode) {
    const s = this.state;
    const codeStack = CODE_FONTS[s.codeFont]?.stack;
    // autoAcceptFor 를 그대로 따른 예시 — 지어낸 게 아니라 진짜 판정이다.
    const EX: Record<string, { name: string; auto: boolean }[]> = {
      manual:   [{ name: "main.ts", auto: false }, { name: "README.md", auto: false }],
      balanced: [{ name: "README.md", auto: true }, { name: "utils.test.ts", auto: true }, { name: "main.ts", auto: false }],
      auto:     [{ name: "main.ts", auto: true }, { name: "styles.css", auto: true }],
    };
    return (
      <>
        {lede("open.step.autonomy.lede")}
        <div style={{ display: "flex", gap: 13, justifyContent: "center", flexWrap: "wrap", alignItems: "stretch" }}>
          {(["manual", "balanced", "auto"] as const).map(k => {
            const on = s.policy === k;
            return (
              <button key={k} aria-pressed={on}
                onClick={() => { this.setState({ policy: k }); setAutonomy({ policy: k }); }}
                style={{
                  width: 214, padding: "15px 15px 14px", borderRadius: 13, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left", whiteSpace: "normal", overflow: "hidden",
                  background: tk.bgPanel, color: tk.fg,
                  border: `2px solid ${on ? tk.accent : "transparent"}`,
                  boxShadow: on ? `0 0 24px ${tk.accentSoft}` : "none",
                  transform: on ? "scale(1.03)" : "none",
                  transition: "transform .25s cubic-bezier(.22,1.2,.36,1), border-color .2s, box-shadow .3s",
                  display: "grid", gap: 9, alignContent: "start",
                }}>
                <span style={{ fontSize: 13.5, fontWeight: 650 }}>{t("open.pol." + k)}</span>
                <span style={{ fontSize: 11.5, lineHeight: 1.55, color: tk.fgDim2 }}>{t("open.pol." + k + ".desc")}</span>
                {/* 실제 판정 예시 — 같은 파일들이 이 정책에서 자동/검토로 갈린다 */}
                <div style={{ display: "grid", gap: 5, marginTop: 2, paddingTop: 9, borderTop: `1px solid ${tk.w08}` }}>
                  {EX[k].map(ex => (
                    <div key={ex.name} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ flex: "none", width: 13, textAlign: "center", fontSize: 11,
                        color: ex.auto ? tk.accent : tk.fgDim }}>{ex.auto ? "✓" : "✎"}</span>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: codeStack, fontSize: 10.5, color: tk.fgSub,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.name}</span>
                      <span style={{ flex: "none", fontSize: 9.5, letterSpacing: ".04em",
                        color: ex.auto ? tk.accent : tk.fgDim2 }}>{t(ex.auto ? "open.pol.markAuto" : "open.pol.markReview")}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  /** 4쪽 — 키맵. 셋을 나란한 **예시 카드**로 둔다. 각 카드가 그 키맵의 시그니처 단축키를
   *  실제로 보여준다(MonacoPane 이 거는 바인딩 그대로) — 이름만 고르는 것보다, 무엇이
   *  달라지는지 보고 고른다. */
  private stepKeymap(tk: typeof THEME_TOKENS[string], _pill: (on: boolean) => React.CSSProperties, lede: (k: string) => React.ReactNode) {
    const s = this.state;
    // [키 표기, 동작 이름키]. IntelliJ 는 applyIntellijKeymap, VS Code 는 Monaco 기본,
    // Vim 은 monaco-vim 의 모달 편집 — 각 키맵이 정말로 하는 것을 적는다.
    const SHORTCUTS: Record<string, { keys: string[]; label: string }[]> = {
      intellij: [
        { keys: ["Ctrl", "D"], label: "open.km.dupLine" },
        { keys: ["Ctrl", "W"], label: "open.km.expandSel" },
        { keys: ["Ctrl", "/"], label: "open.km.comment" },
      ],
      vscode: [
        { keys: ["Ctrl", "D"], label: "open.km.nextOccur" },
        { keys: ["Alt", "↑"], label: "open.km.moveLine" },
        { keys: ["Ctrl", "/"], label: "open.km.comment" },
      ],
      vim: [
        { keys: ["d", "d"], label: "open.km.delLine" },
        { keys: ["y", "y"], label: "open.km.yank" },
        { keys: [":", "w"], label: "open.km.save" },
      ],
    };
    const cap = (label: string) => (
      <kbd key={label} style={{
        minWidth: 20, height: 22, padding: "0 6px", borderRadius: 5, fontFamily: "inherit",
        border: `1px solid ${tk.w14}`, background: tk.bgRoot, color: tk.fgSub,
        display: "inline-grid", placeItems: "center", fontSize: 11, fontWeight: 600,
      }}>{label}</kbd>
    );
    return (
      <>
        {lede("open.step.keymap.lede")}
        <div style={{ display: "flex", gap: 13, justifyContent: "center", flexWrap: "wrap" }}>
          {KEYMAPS.map(([k, name]) => {
            const on = s.keymap === k;
            const vim = k === "vim";
            return (
              <button key={k} aria-pressed={on}
                onClick={() => { this.setState({ keymap: k }); setEditorPrefs({ keymap: k }); }}
                style={{
                  width: 210, padding: "14px 15px 15px", borderRadius: 13, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                  background: tk.bgPanel, color: tk.fg,
                  border: `2px solid ${on ? tk.accent : "transparent"}`,
                  boxShadow: on ? `0 0 24px ${tk.accentSoft}` : "none",
                  transform: on ? "scale(1.03)" : "none",
                  transition: "transform .25s cubic-bezier(.22,1.2,.36,1), border-color .2s, box-shadow .3s",
                  display: "grid", gap: 11,
                }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 650 }}>{name}</span>
                  {vim && <span style={{ fontSize: 9.5, letterSpacing: ".08em", color: tk.accent,
                    background: tk.accentSoft, borderRadius: 4, padding: "1px 6px" }}>{t("open.km.modal")}</span>}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {SHORTCUTS[k].map(sc => (
                    <div key={sc.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ display: "flex", gap: 3, flex: "none" }}>
                        {vim ? cap(sc.keys.join("")) : sc.keys.map(cap)}
                      </div>
                      <span style={{ fontSize: 11.5, color: tk.fgDim2, minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(sc.label)}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
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
    const uiStack = UI_FONTS[s.uiFont]?.stack;
    const codeStack = CODE_FONTS[s.codeFont]?.stack;
    return (
      <>
        {lede("open.step.fonts.lede")}
        {/* 실제 미리보기 — 고른 UI 글꼴로 한 줄, 고른 코드 글꼴·크기로 진짜 코드 한 조각.
            이름만 고르는 대신, 바꾸는 즉시 이 조각이 그 글꼴·크기로 다시 그려진다. */}
        <div style={{ width: "min(440px,84vw)", borderRadius: 12, background: tk.bgEditor,
          border: `1px solid ${tk.w12}`, overflow: "hidden", textAlign: "left" }}>
          <div style={{ padding: "9px 14px", borderBottom: `1px solid ${tk.w08}`,
            fontFamily: uiStack, fontSize: 13, color: tk.fgSub }}>{t("open.fonts.pvUi")}</div>
          <pre style={{ margin: 0, padding: "12px 14px", fontFamily: codeStack, fontSize: s.fontSize,
            lineHeight: 1.65, color: tk.fg, whiteSpace: "pre", overflowX: "auto" }}>
            <span style={{ color: tk.fgDim }}>{t("open.fonts.pvComment")}</span>{"\n"}
            <span style={{ color: tk.accent }}>const</span>{" year "}<span style={{ color: tk.fgDim2 }}>=</span>{" new Date().getFullYear();"}
          </pre>
        </div>
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

  /** 게임 엔진 연결 — 폴더 하나만 고르면 나머지는 앱이 채운다. 이미 설치된(GitHub 설치본)
   *  진입 파일이 있으면 그걸, 없으면 발견된 설정을, 그것도 없으면 프리셋을 쓴다. 실패는 조용히
   *  넘긴다(첫 화면에서 오류를 들이밀 이유가 없다 — 나중에 MCP 패널에서 다시 할 수 있다). */
  private async connectEngine(a: engines.EngineAdapter) {
    if (this.state.engineBusy || !window.schutz) return;
    this.setState({ engineBusy: a.id });
    try {
      // 폴더가 필요한 엔진(OVERDARE)만 폴더를 묻는다. Blender 처럼 폴더가 없으면 바로 연결한다.
      let folder: string | null = null;
      if (a.projectEnv) { folder = await window.schutz.openFolder(); if (!folder) return; }
      const entry = a.install ? await window.schutz.engineInstalledPath({ id: a.id, entry: a.install.entry }) : null;
      const disc = (await mcp.discover(null)).find(d => d.name === a.serverName);
      const cfg = entry ? engines.installedConnectConfig(a, entry, folder) : engines.connectConfig(a, disc, folder);
      const added = await mcp.addServer(cfg.name, { command: cfg.command, args: cfg.args, env: cfg.env, overwrite: true });
      if (!added.ok) return;
      const started = await mcp.startServer(cfg.name);   // 도구 캐시까지 갱신된다
      if (started.ok) this.setState(st => ({ engineConnected: [...st.engineConnected, a.id], engineExpand: "" }));
    } catch { /* 조용히 — 나중에 설정에서 */ } finally {
      this.setState({ engineBusy: "" });
    }
  }

  /** 설치 단계 라벨. */
  private enginePhaseLabel(phase: string): string {
    return t(phase === "clone" ? "open.engine.phaseClone"
      : phase === "install" ? "open.engine.phaseInstall"
      : phase === "build" ? "open.engine.phaseBuild"
      : "open.engine.installing");
  }

  /** 게임 엔진 MCP 를 제작자의 GitHub 에서 가져와 설치(clone→build)하고, 곧바로 폴더를 골라
   *  등록·시작까지 한다. 진행 로그는 enginePhase 로 흘려 보여준다. git·npm 이 없으면 실패 메시지. */
  private async installEngine(a: engines.EngineAdapter) {
    if (this.state.engineInstalling || !a.install || !window.schutz) return;
    this.setState({ engineInstalling: true, engineErr: "", enginePhase: this.enginePhaseLabel("clone") });
    const off = window.schutz.onEngineInstallProgress(d => {
      if (d.id === a.id) this.setState({ enginePhase: this.enginePhaseLabel(d.phase) });
    });
    try {
      const r = await window.schutz.engineInstall({ id: a.id, repo: a.install.repo, build: a.install.build, entry: a.install.entry });
      if (!r.ok || !r.entryPath) { this.setState({ engineErr: r.error || t("open.engine.installFail") }); return; }
      this.setState(st => ({ engineAvail: { ...st.engineAvail, [a.id]: true } }));
      // 설치가 끝났으면(폴더가 필요한 엔진만) 폴더를 골라 바로 등록한다.
      let folder: string | null = null;
      if (a.projectEnv) { folder = await window.schutz.openFolder(); if (!folder) { this.setState({ engineExpand: "" }); return; } }
      const cfg = engines.installedConnectConfig(a, r.entryPath, folder);
      const added = await mcp.addServer(cfg.name, { command: cfg.command, args: cfg.args, env: cfg.env, overwrite: true });
      if (added.ok) { const s = await mcp.startServer(cfg.name); if (s.ok) this.setState(st => ({ engineConnected: [...st.engineConnected, a.id], engineExpand: "" })); }
    } catch (e) {
      this.setState({ engineErr: e instanceof Error ? e.message : String(e) });
    } finally {
      off();
      this.setState({ engineInstalling: false, enginePhase: "" });
    }
  }

  /** 데모가 끝난 뒤 마무리. 진짜 UI 를 뒤에 두고 그 위에 뜬다. */
  private renderOutro() {
    const tk = THEME_TOKENS[this.state.theme] ?? THEME_TOKENS.feldgrau;
    return (
      <div role="dialog" aria-modal="true" aria-label={t("open.aria")}
        className={this.state.leaving ? "sz-backdrop-out" : "sz-backdrop"} style={{
        position: "fixed", inset: 0, zIndex: 500, display: "grid", placeItems: "center",
        alignContent: "center", gap: 22, padding: "0 10vw", textAlign: "center",
        background: "color-mix(in srgb, " + tk.bgRoot + " 88%, transparent)",
        // 물러날 때는 살짝 커지며 사라진다 — 뒤에 있던 앱으로 시선이 넘어간다.
        opacity: this.state.leaving ? 0 : 1,
        transform: this.state.leaving ? "scale(1.03)" : "none",
        transition: `opacity ${LEAVE_MS}ms var(--ease), transform ${LEAVE_MS}ms var(--ease)`,
        pointerEvents: this.state.leaving ? "none" : "auto",
      }}>
        {/* 마무리는 **도착해야** 한다. 예전엔 마크·제목·버튼이 배경이 걷히는 순간 한꺼번에
            떠서, 시연이 끝나기도 전에 다음 화면이 툭 얹힌 것처럼 읽혔다. 차례로(마크 →
            제목 → 버튼) 떠오르게 하면 "일이 정리되고, 이제 준비됐다" 로 읽힌다.
            leaving 중에는 트랜지션으로 빠지므로 이 등장은 처음 뜰 때만 돈다. */}
        <div style={{ animation: "szFadeUp .5s var(--ease) both", animationDelay: "60ms" }}>
          <Mark color={tk.accent} size={44} width={9} />
        </div>
        <p style={{ fontSize: "clamp(24px,4vw,52px)", fontWeight: 300, letterSpacing: "-.03em", margin: 0, color: tk.fg,
          animation: "szFadeUp .5s var(--ease) both", animationDelay: "200ms" }}>
          {t("open.done.title")}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap",
          animation: "szFadeUp .5s var(--ease) both", animationDelay: "360ms" }}>
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
          {/* 첫 화면은 스택 목록이 아니라 한 줄의 크레딧이다 — 세 이름을 늘어놓으면 마크
              밑에서 시끄럽다. 앱을 담고 있는 껍데기(Electron)만, **언어와 무관하게** 고정으로
              적는다(uppercase 변환으로 화면엔 POWERED BY ELECTRON). 스택 전체
              (Electron · Monaco · React)는 정보 창이 그대로 크레딧한다. */}
          Powered by Electron
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
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              padding: "0 8vw", textAlign: "center",
              opacity: op, transform: `translateY(${(1 - inP) * 16 - outP * 10}px)`,
              pointerEvents: op > 0.5 ? "auto" : "none",
            }}>
              {/* 헤더(마크·제목)는 **중앙 정렬 콘텐츠 밖**에 둔다. 예전엔 콘텐츠와 같은
                  grid 안(alignContent:center)에 있어, 쪽마다 콘텐츠 높이가 다르면 전체가
                  다시 가운데로 맞춰지며 로고·제목이 위아래로 튀었다. 여기 고정하면 로고·제목은
                  어느 쪽에서도 같은 자리다 — 밑의 콘텐츠만 바뀐다.
                  방금 획이 그려진 그 마크를 작게 얹어 앞 장면과 이 화면을 잇는다. */}
              <div style={{ flex: "none", display: "grid", justifyItems: "center", gap: 14,
                paddingTop: "clamp(26px,6vh,72px)", paddingBottom: "clamp(12px,2.4vh,26px)" }}>
                <Mark color={tk.accent} size={44} width={9} />
                <div style={{ width: 26, height: 1, background: tk.w14 }} />
                {/* 두 쪽의 제목이 같으면 넘겼는데 같은 화면이 다시 뜬 것처럼 보인다. */}
                <h2 style={{ fontSize: "clamp(22px,3.2vw,40px)", fontWeight: 350, letterSpacing: "-.02em", margin: 0 }}>
                  {t(STEP_TITLES[this.state.page - 1] ?? "open.setup.title")}
                </h2>
              </div>

              {/* 콘텐츠만 가운데 정렬. 내비는 이 밖(아래)에 고정. */}
              <div style={{
                flex: 1, minHeight: 0,
                // 넘칠 때만 세로로 구른다. 가로는 **잘라낸다** — 쪽 전환이 translateX 로
                // 미끄러져 들어오는데, 그게 스크롤 가능 영역으로 잡혀 전환 때마다 가로
                // 스크롤바가 떴다 사라졌다(실측 최대 14px). 그 바가 자리를 먹었다 돌려주니
                // 내용이 같이 흔들렸다.
                overflowY: "auto", overflowX: "hidden",
                // 세로 바가 생기고 없어질 때 폭이 튀지 않게 자리를 늘 비워둔다.
                scrollbarGutter: "stable",
                display: "grid", placeItems: "center", alignContent: "center",
                gap: 26, paddingBottom: 18,
              }}>
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
              </>}
              </div>
              {this.stepNav(tk)}
            </div>
          );
        })()}

        {/* "이제 시연" 안내 — 세팅이 걷힌 뒤, IDE 가 뜨기 전에 잠깐. 데모가 너무 갑자기
            나오지 않게 한 박자 둔다. 게이트를 지난 뒤 announceT 가 이걸 켜고, handOff 가
            곧 onStartDemo 로 넘긴다. */}
        {this.state.announcing && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 6, display: "grid", placeItems: "center",
            padding: "0 10vw", textAlign: "center", background: tk.bgRoot,
            animation: "szFadeIn 420ms var(--ease) both",
          }}>
            <div style={{ display: "grid", justifyItems: "center", gap: 18 }}>
              <div style={{ animation: "szFadeUp .5s var(--ease) both", animationDelay: "80ms" }}>
                <Mark color={tk.accent} size={44} width={9} />
              </div>
              <p style={{ fontSize: "clamp(22px,3.2vw,40px)", fontWeight: 350, letterSpacing: "-.02em", margin: 0, color: tk.fg,
                animation: "szFadeUp .5s var(--ease) both", animationDelay: "200ms" }}>
                {t("open.demoIntro.title")}
              </p>
              <p style={{ fontSize: "clamp(13px,1.4vw,16px)", color: tk.fgSub, margin: 0, maxWidth: "56ch", lineHeight: 1.6,
                animation: "szFadeUp .5s var(--ease) both", animationDelay: "340ms" }}>
                {t("open.demoIntro.sub")}
              </p>
            </div>
          </div>
        )}

        {/* 항상 열려 있는 탈출구 */}
        {beat.id !== "settle" && !this.state.announcing && (
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

/**
 * 세팅 쪽마다 붙는 작은 예시 그림. 1쪽의 모드 카드(ModeDiagram)와 같은 어법 — 스크린샷도
 * 아이콘도 아니고 **뼈대 한 조각**으로 그 쪽이 무엇을 정하는지 한눈에 보여준다.
 * 글꼴은 고른 값을 그대로 그려(진짜 미리보기), 나머지는 개념을 그린다.
 */
function StepFigure({ topic, tk }: { topic: "ai"; tk: any }) {
  const box: React.CSSProperties = {
    width: 176, height: 60, borderRadius: 10, background: tk.bgEditor,
    border: `1px solid ${tk.w12}`, padding: 9, display: "flex", alignItems: "center",
    gap: 9, overflow: "hidden",
  };
  const bar = (w: string | number, o = 1, c?: string): React.CSSProperties =>
    ({ height: 3, width: w, borderRadius: 2, background: c ?? tk.fgDim, opacity: o });
  void topic;   // 지금은 AI 한 종류뿐 — 훗날 다른 쪽이 공용 그림을 다시 쓰면 분기한다.
  // AI 가 쓴다 — 편집기 한 줄이 액센트로 차오르고(방금 쓴 줄), 커서 한 조각. 오른쪽에
  // 연결된 두 에이전트 점.
  return (
    <div style={box} aria-hidden>
      <div style={{ width: 7, alignSelf: "stretch", borderRadius: 3, background: tk.w12 }} />
      <div style={{ flex: 1, display: "grid", gap: 6 }}>
        <div style={bar("64%", .5)} />
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={bar("46%", 1, tk.accent)} />
          <div style={{ width: 2, height: 10, background: tk.accent, borderRadius: 1 }} />
        </div>
        <div style={bar("54%", .35)} />
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tk.accent }} />
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tk.w14 }} />
      </div>
    </div>
  );
}
