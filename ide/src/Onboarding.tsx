import React from "react";
import { setStoredKey } from "./ai/provider";

/** Schutz 온보딩 6단계 — 디자인 핸드오프 프로토타입 포팅 */

const MONO = "'IBM Plex Mono',monospace";

const THEMES: Record<string, any> = {
  feldgrau: { name: "Feldgrau", bg: "#0E100F", chrome: "#101312", line: "rgba(255,255,255,.06)", fg: "#D5DAD5", dim: "#5A635C", code: "#C4CBC4", num: "#3A403C", accent: "#8FA893", selBg: "rgba(143,168,147,.1)", badgeBg: "rgba(255,255,255,.05)", frameBd: "rgba(255,255,255,.1)", logoFilter: "none", kw: "#C4A882", str: "#8BB292", ty: "#9CB8B0", fn: "#8FA8C0", pendBg: "rgba(125,145,131,.07)", pendBar: "#8FA893", okFg: "#9DC4A3", okBg: "rgba(139,178,146,.1)", okBd: "rgba(139,178,146,.3)", noFg: "#CE9A9A", noBg: "rgba(201,123,123,.08)", noBd: "rgba(201,123,123,.28)" },
  graphite: { name: "Graphite", bg: "#121316", chrome: "#17181C", line: "rgba(255,255,255,.07)", fg: "#DADCE2", dim: "#63666E", code: "#C8CBD2", num: "#41434A", accent: "#9AA3B2", selBg: "rgba(154,163,178,.12)", badgeBg: "rgba(255,255,255,.05)", frameBd: "rgba(255,255,255,.1)", logoFilter: "none", kw: "#C0A470", str: "#93B79A", ty: "#98B4C4", fn: "#A08FC0", pendBg: "rgba(154,163,178,.08)", pendBar: "#9AA3B2", okFg: "#9DC4A3", okBg: "rgba(139,178,146,.1)", okBd: "rgba(139,178,146,.3)", noFg: "#CE9A9A", noBg: "rgba(201,123,123,.08)", noBd: "rgba(201,123,123,.28)" },
  paper: { name: "Paper", bg: "#FBFAF7", chrome: "#F2F0EA", line: "rgba(0,0,0,.08)", fg: "#2A2D2A", dim: "#8A8D86", code: "#333632", num: "#C0C2BA", accent: "#5F7565", selBg: "rgba(95,117,101,.12)", badgeBg: "rgba(0,0,0,.05)", frameBd: "rgba(0,0,0,.12)", logoFilter: "invert(.85)", kw: "#9A6A2E", str: "#3E7D4E", ty: "#3E6D7D", fn: "#5A4E9A", pendBg: "rgba(95,117,101,.08)", pendBar: "#5F7565", okFg: "#2E6B3E", okBg: "rgba(62,125,78,.1)", okBd: "rgba(62,125,78,.3)", noFg: "#9A4444", noBg: "rgba(154,68,68,.08)", noBd: "rgba(154,68,68,.25)" },
};
const UIFONTS: Record<string, { name: string; stack: string }> = {
  suit: { name: "SUIT", stack: "'SUIT Variable',sans-serif" },
  pretendard: { name: "Pretendard", stack: "'Pretendard Variable',Pretendard,sans-serif" },
};
const CODEFONTS: Record<string, { name: string; stack: string }> = {
  plex: { name: "IBM Plex Mono", stack: "'IBM Plex Mono',monospace" },
  jb: { name: "JetBrains Mono", stack: "'JetBrains Mono',monospace" },
};
const PROVIDERS = [
  { id: "claude", name: "Claude", model: "Opus 4.5", init: "C", hue: "#8FA893", role: "계획·구현·검토에 두루 강한 범용 에이전트", ph: "sk-ant-…" },
  { id: "gpt", name: "GPT", model: "5.2", init: "G", hue: "#8FA8C0", role: "타입·리팩터링 등 구조 작업에 특화", ph: "sk-…" },
  { id: "grok", name: "Grok", model: "4.1", init: "X", hue: "#C4A882", role: "문서·탐색 등 보조 작업 담당", ph: "xai-…" },
];
const IMPORTS = [
  { k: "vscode", name: "VS Code에서", badge: true, icon: "{}", iconBg: "rgba(143,168,192,.15)", iconFg: "#8FA8C0", desc: "설정 · 키바인딩에 더해 설치된 확장을 그대로 가져와 활성화합니다" },
  { k: "jetbrains", name: "JetBrains에서", badge: false, icon: "IJ", iconBg: "rgba(196,168,130,.15)", iconFg: "#C4A882", desc: "설정과 단축키를 가져옵니다 · 확장은 VS Code 호환 마켓에서 다시 설치" },
  { k: "fresh", name: "새로 시작", badge: false, icon: "＋", iconBg: "rgba(143,168,147,.15)", iconFg: "#8FA893", desc: "Schutz 기본 구성으로 깨끗하게 시작합니다" },
];
const KEYMAPS: [string, string][] = [["intellij", "IntelliJ"], ["vscode", "VS Code"], ["vim", "Vim"]];
const RULES: [string, string, string][] = [
  ["docs", "문서 · 주석 변경 자동 수락", "*.md, /** */"],
  ["tests", "테스트 파일 자동 수락", "*.test.ts"],
  ["deps", "의존성 변경 자동 수락", "package.json"],
];

interface ConnState { on: boolean; key: string; st: "idle" | "checking" | "ok"; auth: "none" | "pending" | "ok"; mode: "auth" | "key" }

interface S {
  step: number;
  importFrom: string;
  keymap: string;
  policy: string;
  rules: Record<string, boolean>;
  theme: string;
  uiFont: string;
  codeFont: string;
  fontSize: number;
  conn: Record<string, ConnState>;
  manager: string | null;
}

export class Onboarding extends React.Component<{ onFinish: () => void }, S> {
  private _timers: ReturnType<typeof setTimeout>[] = [];

  state: S = {
    step: 1,
    importFrom: "vscode", keymap: "intellij",
    policy: "manual", rules: { docs: true, tests: true, deps: false },
    theme: "feldgrau", uiFont: "suit", codeFont: "plex", fontSize: 13,
    conn: {
      claude: { on: true, key: "", st: "idle", auth: "none", mode: "auth" },
      gpt: { on: false, key: "", st: "idle", auth: "none", mode: "auth" },
      grok: { on: false, key: "", st: "idle", auth: "none", mode: "auth" },
    },
    manager: "claude",
  };

  qt(fn: () => void, ms: number) { this._timers.push(setTimeout(fn, ms)); }
  componentWillUnmount() { this._timers.forEach(clearTimeout); }

  go(step: number) { this.setState({ step: Math.max(1, Math.min(6, step)) }); }

  verify(id: string) {
    this.setState(s => ({ conn: { ...s.conn, [id]: { ...s.conn[id], st: "checking" as const } } }));
    // Claude 키는 실제 저장 → IDE 채팅이 mock 대신 실제 모델과 대화 (타 프로바이더 어댑터는 후속)
    if (id === "claude") setStoredKey("claude", this.state.conn.claude.key.trim());
    this.qt(() => this.setState(s => ({ conn: { ...s.conn, [id]: { ...s.conn[id], st: "ok" as const } } })), 900);
  }
  login(id: string) {
    this.setState(s => ({ conn: { ...s.conn, [id]: { ...s.conn[id], auth: "pending" as const } } }));
    this.qt(() => this.setState(s => s.conn[id].auth === "pending" ? { conn: { ...s.conn, [id]: { ...s.conn[id], auth: "ok" as const } } } as any : null), 1600);
  }

  render() {
    const s = this.state;
    const th = THEMES[s.theme];
    const uiStack = UIFONTS[s.uiFont].stack;
    const codeStack = CODEFONTS[s.codeFont].stack;
    const onCnt = PROVIDERS.filter(p => s.conn[p.id].on).length;
    const mgrName = s.manager ? PROVIDERS.find(p => p.id === s.manager)!.name : "—";
    const labels = ["환영", "가져오기", "외형", "AI 연결", "자율성", "완료"];

    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "radial-gradient(800px 500px at 50% -10%,rgba(125,145,131,.1),transparent 60%),#0C0E0D", color: "#D5DAD5", fontFamily: "'SUIT Variable',sans-serif", fontSize: 13, overflow: "hidden" }}>

        {/* top: logo + step dots + skip */}
        <div style={{ flex: "none", height: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, position: "relative" }}>
          <div style={{ position: "absolute", left: 24, display: "flex", alignItems: "center", gap: 9 }}>
            <img src="/assets/logo-t.png" alt="Schutz" style={{ width: 22, height: 22, display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: .5, color: "#8B948C" }}>Schutz</span>
          </div>
          {labels.map((_, i) => (
            <span key={i} onClick={() => this.go(i + 1)}
              style={{ width: s.step === i + 1 ? 26 : 10, height: 6, borderRadius: 3, background: s.step === i + 1 ? "#8FA893" : (s.step > i + 1 ? "rgba(143,168,147,.45)" : "rgba(255,255,255,.1)"), transition: "all .35s ease", cursor: "pointer" }} />
          ))}
          <div style={{ position: "absolute", right: 24 }}>
            {s.step < 6 && (
              <button className="obGhostTxt" onClick={() => this.setState({ step: 6, theme: "feldgrau", uiFont: "suit", codeFont: "plex", fontSize: 13, importFrom: "fresh", keymap: "intellij", policy: "manual" })}
                style={{ height: 26, padding: "0 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#5A635C", background: "transparent", border: "none" }}>기본값으로 건너뛰기</button>
            )}
          </div>
        </div>

        {s.step === 1 && this.renderWelcome()}
        {s.step === 2 && this.renderImport()}
        {s.step === 3 && this.renderAppearance(th, uiStack, codeStack)}
        {s.step === 4 && this.renderConnect(onCnt, mgrName)}
        {s.step === 5 && this.renderPolicy()}
        {s.step === 6 && this.renderDone(th, onCnt, mgrName)}
      </div>
    );
  }

  // ══ STEP 1 ══
  renderWelcome() {
    const values = [
      { icon: <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1.5 L13.5 3.5 V7.5 C13.5 11 11.2 13.6 8 14.5 C4.8 13.6 2.5 11 2.5 7.5 V3.5 Z" fill="none" stroke="#8FA893" strokeWidth="1.4" strokeLinejoin="round" /></svg>, title: "통제된 자율성", desc: <>모든 편집은 수락 전까지<br />확정되지 않습니다</> },
      { icon: <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3.5" cy="3.5" r="1.6" fill="none" stroke="#8FA893" strokeWidth="1.3" /><circle cx="3.5" cy="12.5" r="1.6" fill="none" stroke="#8FA893" strokeWidth="1.3" /><circle cx="12" cy="8" r="1.6" fill="none" stroke="#8FA893" strokeWidth="1.3" /><path d="M3.5 5.2 V10.8 M5.2 3.7 C9 4 10.4 5.4 10.6 7" fill="none" stroke="#8FA893" strokeWidth="1.2" /></svg>, title: "멀티 에이전트", desc: <>여러 AI가 파일 락으로 격리되어<br />충돌 없이 동시에 일합니다</> },
      { icon: <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="#8FA893" strokeWidth="1.3" /><path d="M5 6 L7 8 L5 10 M8.5 10 H11" fill="none" stroke="#8FA893" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>, title: "프로 개발 환경", desc: <>챗봇 장난감이 아니라<br />매일 쓰는 메인 IDE</> },
    ];
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "safe center" as any, padding: "20px 0", animation: "szFadeUp .5s ease both" }}>
        <img src="/assets/logo-t.png" alt="Schutz" style={{ width: 84, height: 84, display: "block", marginBottom: 26 }} />
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -.5 }}>Schutz에 오신 것을 환영합니다</div>
        <div style={{ fontSize: 14.5, color: "#8B948C", marginTop: 14, lineHeight: 1.8, textAlign: "center", maxWidth: 520 }}>
          AI가 코드를 쓰는 시대의 본격 IDE.<br />
          모든 변경은 당신의 눈앞에서 일어나고, 당신의 승인으로 완성됩니다.
        </div>
        <div style={{ display: "flex", gap: 26, marginTop: 38 }}>
          {values.map((v, i) => (
            <div key={i} style={{ width: 170, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(143,168,147,.1)", border: "1px solid rgba(143,168,147,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>{v.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v.title}</span>
              <span style={{ fontSize: 11.5, color: "#5A635C", lineHeight: 1.6 }}>{v.desc}</span>
            </div>
          ))}
        </div>
        <button className="hvAccent" onClick={() => this.go(2)} style={{ marginTop: 44, height: 40, padding: "0 34px", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", borderRadius: 10, color: "#0C0E0D", background: "#8FA893", border: "none" }}>시작하기</button>
        <span style={{ fontSize: 11, color: "#3A403C", marginTop: 12 }}>약 1분 · 언제든 설정에서 변경 가능</span>
      </div>
    );
  }

  // ══ STEP 2 ══
  renderImport() {
    const s = this.state;
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "safe center" as any, padding: "20px 0", animation: "szFadeUp .5s ease both" }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -.3 }}>쓰던 환경 그대로 가져오세요</div>
        <div style={{ fontSize: 12.5, color: "#8B948C", marginTop: 7, lineHeight: 1.7, textAlign: "center" }}>설정·키바인딩·확장을 가져와 바로 손에 익은 상태로 시작합니다.</div>
        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          {IMPORTS.map(im => {
            const sel = s.importFrom === im.k;
            return (
              <div key={im.k} className="obCard" onClick={() => this.setState({ importFrom: im.k })}
                style={{ width: 180, cursor: "pointer", borderRadius: 12, border: `1.5px solid ${sel ? "#8FA893" : "rgba(255,255,255,.08)"}`, background: sel ? "rgba(143,168,147,.07)" : "#151917", padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 9, position: "relative" }}>
                {im.badge && <span style={{ position: "absolute", top: -9, left: 14, fontSize: 9.5, fontWeight: 700, color: "#0C0E0D", background: "#8FA893", borderRadius: 4, padding: "2px 7px" }}>권장</span>}
                <span style={{ width: 30, height: 30, borderRadius: 8, background: im.iconBg, color: im.iconFg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{im.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sel ? "#D5DAD5" : "#9AA59C" }}>{im.name}</span>
                <span style={{ fontSize: 11, color: "#5A635C", lineHeight: 1.6 }}>{im.desc}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16, fontSize: 11, color: "#5A635C" }}>
          <svg width="12" height="12" viewBox="0 0 16 16"><path d="M6.5 2 H12 L14 4 V14 H6.5 Z M2 5.5 H6.5 M2 8 H6.5 M2 10.5 H6.5" fill="none" stroke="#8FA893" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          Schutz는 VS Code 확장 생태계와 호환됩니다 — 어떤 선택을 해도 쓰던 확장을 그대로 설치할 수 있습니다.
        </div>
        <div style={{ width: 560, maxWidth: "90%", display: "flex", flexDirection: "column", gap: 8, marginTop: 22 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#5A635C" }}>키맵</span>
          <div style={{ display: "flex", gap: 8 }}>
            {KEYMAPS.map(([k, name]) => {
              const sel = s.keymap === k;
              return (
                <button key={k} className="obCard" onClick={() => this.setState({ keymap: k })}
                  style={{ flex: 1, height: 34, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: sel ? "#D5DAD5" : "#8B948C", background: sel ? "rgba(143,168,147,.08)" : "#151917", border: `1.5px solid ${sel ? "#8FA893" : "rgba(255,255,255,.08)"}` }}>{name}</button>
              );
            })}
          </div>
        </div>
        {this.navRow(2)}
      </div>
    );
  }

  // ══ STEP 3 ══
  renderAppearance(th: any, uiStack: string, codeStack: string) {
    const s = this.state;
    const kw = (t: string) => <span style={{ color: th.kw }}>{t}</span>;
    const ty = (t: string) => <span style={{ color: th.ty }}>{t}</span>;
    const st = (t: string) => <span style={{ color: th.str }}>{t}</span>;
    const fn = (t: string) => <span style={{ color: th.fn }}>{t}</span>;
    const dim = (t: string) => <span style={{ color: th.dim, fontStyle: "italic" }}>{t}</span>;
    const raw: [string, React.ReactNode, boolean][] = [
      ["1", <>{kw("export class ")}{ty("TokenManager")}{" {"}</>, false],
      ["2", <>{"  "}{kw("private")}{" tokens: "}{ty("TokenPair")}{" | "}{kw("null")}{" = "}{kw("null")}{";"}</>, false],
      ["3", "", false],
      ["4", <>{"  "}{dim("/** 만료 전 자동 갱신을 예약합니다. */")}</>, true],
      ["5", <>{"  "}{kw("private")}{" "}{fn("scheduleRefresh")}{"(): "}{kw("void")}{" {"}</>, true],
      ["6", <>{"    "}{kw("const")}{" threshold = "}{kw("this")}{".options.refreshThreshold ?? "}{st("60_000")}{";"}</>, true],
      ["7", "  }", true],
      ["8", "", false],
      ["9", "}", false],
    ];
    const selStyle = (sel: boolean) => ({
      bg: sel ? "rgba(143,168,147,.08)" : "#151917",
      bd: sel ? "#8FA893" : "rgba(255,255,255,.08)",
      fg: sel ? "#D5DAD5" : "#8B948C",
    });
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 36, padding: "0 48px", animation: "szFadeUp .5s ease both" }}>
        {/* controls */}
        <div style={{ flex: "none", width: 320, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -.3 }}>작업 공간을 꾸며보세요</div>
            <div style={{ fontSize: 12.5, color: "#8B948C", marginTop: 7, lineHeight: 1.7 }}>선택하는 즉시 오른쪽 미리보기에 반영됩니다.<br />그대로 두면 기본값으로 시작합니다.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#5A635C" }}>테마</span>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(THEMES).map(([k, t]) => {
                const sel = s.theme === k;
                return (
                  <div key={k} className="obCard" onClick={() => this.setState({ theme: k })}
                    style={{ flex: 1, cursor: "pointer", borderRadius: 10, border: `1.5px solid ${sel ? "#8FA893" : "rgba(255,255,255,.08)"}`, background: sel ? "rgba(143,168,147,.08)" : "#151917", padding: "9px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 3 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: t.bg }} />
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: t.accent }} />
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: t.chrome }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: sel ? "#D5DAD5" : "#8B948C" }}>{t.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#5A635C" }}>UI 폰트</span>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(UIFONTS).map(([k, f]) => {
                const c = selStyle(s.uiFont === k);
                return <button key={k} className="obCard" onClick={() => this.setState({ uiFont: k })} style={{ flex: 1, height: 34, fontSize: 12.5, fontFamily: f.stack, fontWeight: 600, cursor: "pointer", borderRadius: 8, color: c.fg, background: c.bg, border: `1.5px solid ${c.bd}` }}>{f.name}</button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#5A635C" }}>코드 폰트</span>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(CODEFONTS).map(([k, f]) => {
                const c = selStyle(s.codeFont === k);
                return <button key={k} className="obCard" onClick={() => this.setState({ codeFont: k })} style={{ flex: 1, height: 34, fontSize: 12, fontFamily: f.stack, cursor: "pointer", borderRadius: 8, color: c.fg, background: c.bg, border: `1.5px solid ${c.bd}` }}>{f.name}</button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#5A635C" }}>코드 크기 <span style={{ fontWeight: 400, color: "#8B948C", fontFamily: MONO }}>{s.fontSize}px</span></span>
            <input type="range" min={11} max={16} step={1} value={s.fontSize}
              onChange={e => this.setState({ fontSize: +e.target.value })}
              style={{ width: "100%", accentColor: "#8FA893", background: "transparent" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
            <button className="hv05" onClick={() => this.go(2)} style={backBtn}>이전</button>
            <button className="hvAccent" onClick={() => this.go(4)} style={nextBtn}>다음</button>
            <button className="obGhostTxt" onClick={() => this.setState({ theme: "feldgrau", uiFont: "suit", codeFont: "plex", fontSize: 13 })}
              style={{ height: 36, padding: "0 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 9, color: "#5A635C", background: "transparent", border: "none" }}>기본값으로</button>
          </div>
        </div>
        {/* live preview */}
        <div style={{ flex: 1, maxWidth: 640, minWidth: 0, borderRadius: 14, overflow: "hidden", border: `1px solid ${th.frameBd}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)", background: th.bg, transition: "background .3s ease" }}>
          <div style={{ height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", background: th.chrome, borderBottom: `1px solid ${th.line}`, transition: "background .3s ease" }}>
            <img src="/assets/logo-t.png" alt="" style={{ width: 16, height: 16, filter: th.logoFilter }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: th.fg, fontFamily: uiStack }}>schutz-core</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: th.dim, fontFamily: codeStack, background: th.badgeBg, borderRadius: 4, padding: "1px 6px" }}>
              <svg width="9" height="9" viewBox="0 0 16 16"><circle cx="4.5" cy="3.5" r="1.8" fill="none" stroke={th.accent} strokeWidth="1.6" /><circle cx="4.5" cy="12.5" r="1.8" fill="none" stroke={th.accent} strokeWidth="1.6" /><circle cx="11.5" cy="6" r="1.8" fill="none" stroke={th.accent} strokeWidth="1.6" /><path d="M4.5 5.3 V10.7 M11.5 7.8 C11.5 10 8.5 10.8 6.4 11.4" fill="none" stroke={th.accent} strokeWidth="1.6" strokeLinecap="round" /></svg>
              feature/token-refresh
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: th.dim, fontFamily: uiStack }}>검토 대기</span>
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ flex: "none", width: 150, borderRight: `1px solid ${th.line}`, padding: "10px 0", background: th.chrome, transition: "background .3s ease" }}>
              <div style={{ padding: "0 12px 6px", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: th.dim, fontFamily: uiStack }}>프로젝트</div>
              <div style={{ padding: "3px 12px", fontSize: 11, color: th.dim, fontFamily: uiStack }}>▾ src / auth</div>
              <div style={{ padding: "3px 12px 3px 24px", fontSize: 11, color: th.fg, background: th.selBg, fontFamily: codeStack }}>token-manager.ts</div>
              <div style={{ padding: "3px 12px 3px 24px", fontSize: 11, color: th.dim, fontFamily: codeStack }}>types.ts</div>
              <div style={{ padding: "3px 12px", fontSize: 11, color: th.dim, fontFamily: uiStack }}>▾ docs</div>
              <div style={{ padding: "3px 12px 3px 24px", fontSize: 11, color: th.dim, fontFamily: codeStack }}>auth.md</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: "12px 0", fontFamily: codeStack, fontSize: s.fontSize, lineHeight: 1.75 }}>
              {raw.map(([n, parts, pend], i) => (
                <div key={i} style={{ display: "flex", background: pend ? th.pendBg : "transparent" }}>
                  <span style={{ flex: "none", width: 34, textAlign: "right", paddingRight: 10, color: th.num, fontSize: ".85em", userSelect: "none" }}>{n}</span>
                  <span style={{ flex: "none", width: 2.5, background: pend ? th.pendBar : "transparent", marginRight: 10 }} />
                  <span style={{ whiteSpace: "pre", color: th.code }}>{parts}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, padding: "8px 0 0 56px" }}>
                <span style={{ flex: "none", whiteSpace: "nowrap", height: 22, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 5, fontSize: 10.5, fontFamily: uiStack, color: th.okFg, background: th.okBg, border: `1px solid ${th.okBd}` }}>✓ 수락</span>
                <span style={{ flex: "none", whiteSpace: "nowrap", height: 22, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 5, fontSize: 10.5, fontFamily: uiStack, color: th.noFg, background: th.noBg, border: `1px solid ${th.noBd}` }}>✕ 거절</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══ STEP 4 ══
  renderConnect(onCnt: number, mgrName: string) {
    const s = this.state;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "szFadeUp .5s ease both" }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -.3 }}>에이전트 팀을 구성하세요</div>
        <div style={{ fontSize: 12.5, color: "#8B948C", marginTop: 7, lineHeight: 1.7, textAlign: "center" }}>각 AI 계정으로 로그인하면 계정 토큰으로 바로 사용합니다.<br />API 키 직접 입력도 가능하며, 언제든 설정에서 바꿀 수 있습니다.</div>
        <div style={{ width: 560, maxWidth: "90%", display: "flex", flexDirection: "column", gap: 10, marginTop: 30 }}>
          {PROVIDERS.map(p => {
            const c = s.conn[p.id];
            const isMgr = s.manager === p.id;
            const vMap: Record<string, [string, string, string, string]> = {
              idle: ["확인", "#9AA59C", "transparent", "rgba(255,255,255,.14)"],
              checking: ["확인 중…", "#9AA59C", "transparent", "rgba(255,255,255,.14)"],
              ok: ["✓ 연결됨", "#0C0E0D", "#8FA893", "#8FA893"],
            };
            const [vLabel, vFg, vBg, vBd] = vMap[c.st];
            return (
              <div key={p.id} style={{ background: "#151917", border: `1.5px solid ${c.on ? (isMgr ? "#8FA893" : p.hue + "55") : "rgba(255,255,255,.07)"}`, borderRadius: 12, padding: "13px 16px", transition: "border-color .25s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: p.hue, color: "#0C0E0D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{p.init}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</span>
                      <span style={{ fontSize: 10, color: "#8B948C", fontFamily: MONO, background: "rgba(255,255,255,.05)", borderRadius: 3, padding: "0 5px", lineHeight: "15px" }}>{p.model}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#5A635C", marginTop: 1 }}>{p.role}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {c.on && (
                    <button className="obMgrBtn" title="관리자로 지정" onClick={() => this.setState({ manager: p.id })}
                      style={{ height: 24, padding: "0 10px", fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: isMgr ? "#0C0E0D" : "#8B948C", background: isMgr ? "#8FA893" : "transparent", border: `1px solid ${isMgr ? "#8FA893" : "rgba(255,255,255,.14)"}` }}>
                      {isMgr ? "★ 관리자" : "관리자로"}
                    </button>
                  )}
                  <button onClick={() => this.setState(st2 => {
                    const on = !st2.conn[p.id].on;
                    const conn = { ...st2.conn, [p.id]: { ...st2.conn[p.id], on } };
                    let manager = st2.manager;
                    if (!on && manager === p.id) {
                      const alt = PROVIDERS.find(x => x.id !== p.id && conn[x.id].on);
                      manager = alt ? alt.id : null;
                    }
                    if (on && !manager) manager = p.id;
                    return { conn, manager };
                  })}
                    style={{ width: 40, height: 22, borderRadius: 11, cursor: "pointer", border: "none", background: c.on ? "#8FA893" : "rgba(255,255,255,.12)", position: "relative", transition: "background .25s ease" }}>
                    <span style={{ position: "absolute", top: 2.5, left: c.on ? 20.5 : 2.5, width: 17, height: 17, borderRadius: "50%", background: c.on ? "#0C0E0D" : "#8B948C", transition: "left .25s ease" }} />
                  </button>
                </div>
                {c.on && (
                  <div style={{ marginTop: 12 }}>
                    {c.mode === "auth" && c.auth === "none" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button className="obBright" onClick={() => this.login(p.id)}
                          style={{ height: 32, padding: "0 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "#0C0E0D", background: p.hue, border: "none" }}>
                          <svg width="12" height="12" viewBox="0 0 16 16"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="#0C0E0D" strokeWidth="1.5" /><path d="M2.8 13.5 C3.6 10.8 5.6 9.6 8 9.6 C10.4 9.6 12.4 10.8 13.2 13.5" fill="none" stroke="#0C0E0D" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          {p.name} 계정으로 로그인
                        </button>
                        <button className="obGhostTxt" onClick={() => this.setState(st2 => ({ conn: { ...st2.conn, [p.id]: { ...st2.conn[p.id], mode: "key" as const } } }))}
                          style={{ height: 32, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "#5A635C", background: "transparent", border: "none" }}>API 키로 연결</button>
                      </div>
                    )}
                    {c.mode === "auth" && c.auth === "pending" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 9, height: 32, padding: "0 12px", borderRadius: 7, background: "#0C0E0D", border: "1px solid rgba(255,255,255,.08)" }}>
                        <span style={{ width: 11, height: 11, borderRadius: "50%", border: "1.5px solid rgba(143,168,147,.25)", borderTopColor: "#8FA893", animation: "szSpin .9s linear infinite", flex: "none" }} />
                        <span style={{ fontSize: 11.5, color: "#8B948C" }}>브라우저에서 {p.name} 인증 대기 중…</span>
                      </div>
                    )}
                    {c.mode === "auth" && c.auth === "ok" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 9, height: 34, padding: "0 12px", borderRadius: 7, background: "rgba(143,168,147,.06)", border: "1px solid rgba(143,168,147,.3)" }}>
                        <span style={{ width: 18, height: 18, borderRadius: "50%", background: p.hue, color: "#0C0E0D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flex: "none" }}>{p.init}</span>
                        <span style={{ fontSize: 11.5, color: "#C4CBC4" }}>dev@schutz.io · {p.name} 계정</span>
                        <span style={{ fontSize: 10, color: "#8FA893", background: "rgba(143,168,147,.12)", borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap" }}>계정 토큰 사용</span>
                        <div style={{ flex: 1 }} />
                        <button className="obDanger" onClick={() => this.setState(st2 => ({ conn: { ...st2.conn, [p.id]: { ...st2.conn[p.id], auth: "none" as const } } }))}
                          style={{ height: 22, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#5A635C", background: "transparent", border: "none" }}>해제</button>
                      </div>
                    )}
                    {c.mode === "key" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={c.key} placeholder={p.ph}
                          onChange={e => { const v = e.target.value; this.setState(st2 => ({ conn: { ...st2.conn, [p.id]: { ...st2.conn[p.id], key: v, st: "idle" as const } } })); }}
                          style={{ flex: 1, minWidth: 0, background: "#0C0E0D", border: "1px solid rgba(255,255,255,.1)", borderRadius: 7, height: 32, padding: "0 12px", color: "#D5DAD5", fontSize: 11.5, fontFamily: MONO, outline: "none" }} />
                        <button className="obBright" onClick={() => this.verify(p.id)}
                          style={{ height: 32, padding: "0 14px", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: vFg, background: vBg, border: `1px solid ${vBd}` }}>{vLabel}</button>
                        <button className="obGhostTxt" onClick={() => this.setState(st2 => ({ conn: { ...st2.conn, [p.id]: { ...st2.conn[p.id], mode: "auth" as const } } }))}
                          style={{ height: 32, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "#5A635C", background: "transparent", border: "none" }}>계정 로그인으로</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28 }}>
          <button className="hv05" onClick={() => this.go(3)} style={backBtn}>이전</button>
          <button className="obBright" onClick={() => this.go(5)}
            style={{ ...nextBtn, color: onCnt > 0 ? "#0C0E0D" : "#9AA59C", background: onCnt > 0 ? "#8FA893" : "rgba(255,255,255,.1)" }}>
            {onCnt > 0 ? "다음" : "AI 없이 계속"}
          </button>
          <span style={{ fontSize: 11, color: "#5A635C" }}>{onCnt > 0 ? onCnt + "개 연결 · 관리자 " + mgrName : "나중에 설정에서 연결할 수 있습니다"}</span>
        </div>
      </div>
    );
  }

  // ══ STEP 5 ══
  renderPolicy() {
    const s = this.state;
    const sh = (d: string) => <svg width="15" height="15" viewBox="0 0 16 16"><path d={d} fill="none" stroke="#8FA893" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    const POLICIES = [
      { k: "manual", name: "수동 검토", badge: true, desc: "모든 변경을 직접 수락합니다. 라인 단위로 통제하는 기본 모드.", icon: sh("M8 1.5 L13.5 3.5 V7.5 C13.5 11 11.2 13.6 8 14.5 C4.8 13.6 2.5 11 2.5 7.5 V3.5 Z") },
      { k: "balanced", name: "균형", badge: false, desc: "문서·주석 같은 저위험 변경은 자동 수락, 로직 변경은 수동 검토.", icon: sh("M2.5 8 H13.5 M8 2.5 V13.5") },
      { k: "auto", name: "자율", badge: false, desc: "변경을 즉시 적용하고 사후에 검토합니다. 숙련 사용자용.", icon: sh("M3 8.5 L7 12 L13.5 4") },
    ];
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "safe center" as any, padding: "20px 0", animation: "szFadeUp .5s ease both" }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -.3 }}>AI에게 얼마나 맡길까요</div>
        <div style={{ fontSize: 12.5, color: "#8B948C", marginTop: 7, lineHeight: 1.7, textAlign: "center" }}>어느 쪽이든 모든 변경은 기록되고 되돌릴 수 있습니다.<br />파일·경로 단위 세부 규칙은 설정에서 조정합니다.</div>
        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          {POLICIES.map(po => {
            const sel = s.policy === po.k;
            return (
              <div key={po.k} className="obCard" onClick={() => this.setState({ policy: po.k })}
                style={{ width: 196, cursor: "pointer", borderRadius: 12, border: `1.5px solid ${sel ? "#8FA893" : "rgba(255,255,255,.08)"}`, background: sel ? "rgba(143,168,147,.07)" : "#151917", padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 9, position: "relative" }}>
                {po.badge && <span style={{ position: "absolute", top: -9, left: 14, fontSize: 9.5, fontWeight: 700, color: "#0C0E0D", background: "#8FA893", borderRadius: 4, padding: "2px 7px" }}>권장</span>}
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(143,168,147,.1)", border: "1px solid rgba(143,168,147,.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>{po.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sel ? "#D5DAD5" : "#9AA59C" }}>{po.name}</span>
                <span style={{ fontSize: 11, color: "#5A635C", lineHeight: 1.65 }}>{po.desc}</span>
              </div>
            );
          })}
        </div>
        {s.policy === "balanced" && (
          <div style={{ width: 600, maxWidth: "90%", background: "#151917", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "13px 16px", marginTop: 20, display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#5A635C" }}>자동 수락 규칙</span>
            {RULES.map(([k, label, hint]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#C4CBC4" }}>{label}</span>
                <span style={{ fontSize: 10.5, color: "#4B534D", fontFamily: MONO }}>{hint}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => this.setState(st2 => ({ rules: { ...st2.rules, [k]: !st2.rules[k] } }))}
                  style={{ width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none", background: s.rules[k] ? "#8FA893" : "rgba(255,255,255,.12)", position: "relative", transition: "background .25s ease" }}>
                  <span style={{ position: "absolute", top: 2.5, left: s.rules[k] ? 18.5 : 2.5, width: 15, height: 15, borderRadius: "50%", background: s.rules[k] ? "#0C0E0D" : "#8B948C", transition: "left .25s ease" }} />
                </button>
              </div>
            ))}
          </div>
        )}
        {this.navRow(5)}
      </div>
    );
  }

  // ══ STEP 6 ══
  renderDone(th: any, onCnt: number, mgrName: string) {
    const s = this.state;
    const rows: [string, React.ReactNode, boolean?][] = [
      ["가져오기", IMPORTS.find(i => i.k === s.importFrom)!.name.replace("에서", "") + (s.importFrom === "fresh" ? "" : " 설정")],
      ["키맵", KEYMAPS.find(k => k[0] === s.keymap)![1]],
      ["테마", th.name],
      ["폰트", UIFONTS[s.uiFont].name + " + " + CODEFONTS[s.codeFont].name + " " + s.fontSize + "px"],
      ["자율성", (s.policy === "manual" ? "수동 검토" : s.policy === "balanced" ? "균형 · 규칙 " + Object.values(s.rules).filter(Boolean).length + "개" : "자율")],
      ["에이전트", onCnt > 0 ? PROVIDERS.filter(p => s.conn[p.id].on).map(p => p.name).join(", ") : "없음"],
      ["관리자", mgrName, true],
    ];
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "szFadeUp .5s ease both" }}>
        <span style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(143,168,147,.12)", border: "1px solid rgba(143,168,147,.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 12.5 L10 17.5 L19 7.5" fill="none" stroke="#8FA893" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -.4 }}>준비가 끝났습니다</div>
        <div style={{ fontSize: 13, color: "#8B948C", marginTop: 10, lineHeight: 1.8, textAlign: "center" }}>설정 요약 — 언제든 <span style={{ color: "#9AA59C" }}>⌘,</span> 에서 바꿀 수 있습니다.</div>
        <div style={{ width: 430, maxWidth: "90%", background: "#151917", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "16px 18px", marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(([label, value, accent], i) => (
            <div key={i} style={{ display: "flex", fontSize: 12 }}>
              <span style={{ width: 90, color: "#5A635C" }}>{label}</span>
              <span style={accent ? { color: "#8FA893", fontWeight: 600 } : { color: "#C4CBC4" }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 30 }}>
          <button className="hv05" onClick={() => this.go(5)} style={{ ...backBtn, height: 38 }}>이전</button>
          <button className="hvAccent" onClick={this.props.onFinish}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 30px", fontSize: 13, fontWeight: 700, borderRadius: 9, color: "#0C0E0D", background: "#8FA893", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Schutz 시작 →</button>
        </div>
      </div>
    );
  }

  navRow(step: number) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: step === 5 ? 28 : 30 }}>
        <button className="hv05" onClick={() => this.go(step - 1)} style={backBtn}>이전</button>
        <button className="hvAccent" onClick={() => this.go(step + 1)} style={nextBtn}>다음</button>
      </div>
    );
  }
}

const backBtn: React.CSSProperties = { height: 36, padding: "0 18px", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 9, color: "#9AA59C", background: "transparent", border: "1px solid rgba(255,255,255,.14)" };
const nextBtn: React.CSSProperties = { height: 36, padding: "0 26px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", borderRadius: 9, color: "#0C0E0D", background: "#8FA893", border: "none" };
