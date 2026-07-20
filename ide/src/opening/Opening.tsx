import React from "react";
import { t, LANGS, getLang, setLang } from "../i18n";
import type { Lang } from "../i18n";
import { THEME_TOKENS, applyTheme, setThemeId, getThemeId } from "../theme";
import {
  BEATS, TOTAL_MS, PANEL_ENTRIES, PANEL_DUR,
  beatAt, clampToGate, gateAt, seg, ease,
} from "./beats";

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

const MOCK_CODE: Array<[string, string?]> = [
  ["function ", "k"], ["Footer", "t"], ["() {\n"],
  ["  return (\n"],
  ["    <footer className="], ["\"footer\"", "s"], [">\n"],
  ["      <p>© "], ["@SWAP@"], [" SCHUTZ STUDIO.</p>\n"],
  ["    </footer>\n"],
  ["  );\n}"],
];
const SWAP_TO = "{new Date().getFullYear()}";

/** 고를 수 있는 테마 — 실제 THEME_TOKENS 에서 가져온다. 가짜 색이 아니라 진짜 테마다. */
const CHOICES = ["feldgrau", "graphite", "paper"] as const;

/** 목업 트리 — 막대만 그리면 조립이 끝나도 빈 상자로 보인다. depth 는 들여쓰기. */
const MOCK_TREE: Array<{ name: string; depth: number; dir?: boolean; on?: boolean }> = [
  { name: "src", depth: 0, dir: true },
  { name: "components", depth: 1, dir: true },
  { name: "Footer.jsx", depth: 2, on: true },
  { name: "Header.jsx", depth: 2 },
  { name: "styles", depth: 1, dir: true },
  { name: "global.css", depth: 2 },
  { name: "package.json", depth: 0 },
];

interface Props {
  /** 오프닝이 끝났다(또는 건너뛰었다). 다음 단계로. */
  onDone: (opts: { wantsTour: boolean }) => void;
}
interface State { t: number; passedGate: boolean; theme: string; }

export class Opening extends React.Component<Props, State> {
  state: State = { t: 0, passedGate: false, theme: getThemeId() };
  private raf = 0;
  private last = 0;
  private reduced = false;

  componentDidMount() {
    try { this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    // 모션 최소화를 켠 사람에게 자동 재생되는 영화는 정확히 그 설정이 끄고 싶어하는
    // 종류의 것이다. 연출을 건너뛰고 세팅만 보여준 뒤 넘긴다.
    if (this.reduced) this.setState({ t: gateAt() ?? 0 });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    window.addEventListener("keydown", this.onKey);
  }
  componentWillUnmount() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
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

  private pass = () => {
    this.last = performance.now();
    this.setState({ passedGate: true });
    if (this.reduced) this.finish(true);   // 연출을 건너뛰므로 바로 투어로 넘긴다
  };

  /** 언어를 바꾸면 이 화면의 글자도 즉시 바뀌어야 한다 — 클래스 컴포넌트라 직접 리렌더. */
  private pickLang = (l: Lang) => { setLang(l); this.forceUpdate(); };

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

  render() {
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

    const swapChars = time < BEATS[5].at ? null
      : Math.round(E(26500, 35500) * SWAP_TO.length);
    const hotSwap = time >= BEATS[5].at && time < 37500;

    return (
      <div style={stage} role="dialog" aria-modal="true" aria-label={t("open.aria")}>
        {/* 광원 — 테마 액센트를 색이 아니라 빛으로 쓴다 */}
        <div aria-hidden style={{
          position: "absolute", left: "20%", top: "8%", width: "60%", aspectRatio: "1",
          borderRadius: "50%", filter: "blur(70px)", background: tk.accent, pointerEvents: "none",
          opacity: (light ? 0.16 : 0.3) * E(300, 2500) * (time < 12000 ? 1 : 0.5),
          transition: "opacity .6s ease, background .6s ease",
        }} />

        {/* 1 마크 */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          opacity: Math.max(0, S(0, 400) - S(3200, 3800)),
          transform: `scale(${1 + E(3200, 3800) * 0.12})`,
        }}>
          <svg viewBox="0 0 120 130" style={{ width: "13vw", minWidth: 90 }}>
            <path d="M34 14 L86 46 L58 62 L86 78 L34 116 L34 76 L62 60 L34 44 Z"
              fill="none" stroke={tk.accent} strokeWidth={7}
              strokeDasharray={620} strokeDashoffset={620 * (1 - E(400, 2400))} />
          </svg>
        </div>

        {/* 2 선언 */}
        <Say time={time} tk={tk} />

        {/* 3 세팅 — 여기서 멈춘다 */}
        {(() => {
          const inP = E(9500, 10400), outP = this.state.passedGate ? E(12000, 12700) : 0;
          const op = inP * (1 - outP);
          if (op < 0.01) return null;
          return (
            <div style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center",
              gap: 26, padding: "0 8vw", textAlign: "center",
              opacity: op, transform: `translateY(${(1 - inP) * 16 - outP * 10}px)`,
              pointerEvents: op > 0.5 ? "auto" : "none",
            }}>
              <h2 style={{ fontSize: "clamp(22px,3.2vw,40px)", fontWeight: 350, letterSpacing: "-.02em", margin: 0 }}>
                {t("open.setup.title")}
              </h2>

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
              <p style={{ fontSize: 12, color: tk.fgDim2, margin: "-10px 0 0" }}>{t("open.setup.hint")}</p>
              <button onClick={this.pass} style={{
                fontFamily: "inherit", fontSize: 14.5, padding: "11px 30px", borderRadius: 10, border: "none",
                background: tk.accent, color: tk.onAccent, fontWeight: 650, cursor: "pointer",
              }}>{t("open.setup.go")}</button>
            </div>
          );
        })()}

        {/* 4~7 조립 + 실연 */}
        <Assembled
          time={time} tk={tk} E={E} S={S}
          swapChars={swapChars} hotSwap={hotSwap}
        />

        {/* 8 마무리 */}
        {(() => {
          const op = E(48200, 49600);
          if (op < 0.01) return null;
          return (
            <div style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center",
              gap: 22, padding: "0 10vw", textAlign: "center", opacity: op,
            }}>
              <p style={{
                fontSize: "clamp(24px,4vw,52px)", fontWeight: 300, letterSpacing: "-.03em", margin: 0,
                transform: `translateY(${(1 - E(48200, 50000)) * 14}px)`,
              }}>{t("open.done.title")}</p>
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

/** 선언 — 단어가 흐림에서 하나씩 풀린다 */
function Say({ time, tk }: { time: number; tk: typeof THEME_TOKENS[string] }) {
  const words = t("open.say").split(/(\s+)/);
  const out = ease(seg(time, 8800, 9500));
  const gone = ease(seg(time, 9000, 9600));
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
          const p = ease(seg(time, 3900 + wi * 90, 4600 + wi * 90));
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
        opacity: ease(seg(time, 5600, 6500)) * (1 - out),
      }}>{t("open.saySub")}</p>
      </div>
    </div>
  );
}

/** 조립되는 인터페이스 + 실연 */
function Assembled({ time, tk, E, S, swapChars, hotSwap }: {
  time: number; tk: typeof THEME_TOKENS[string];
  E: (a: number, b: number) => number; S: (a: number, b: number) => number;
  swapChars: number | null; hotSwap: boolean;
}) {
  const op = E(12200, 12600) * (1 - E(47500, 49500));
  if (op < 0.01) return null;
  const box = (k: string): React.CSSProperties => {
    const e = PANEL_ENTRIES.find(p => p.key === k)!;
    const p = E(e.at, e.at + PANEL_DUR);
    return { opacity: p, transform: `translate(${e.dx * (1 - p)}px, ${e.dy * (1 - p)}px)` };
  };
  const tag = (k: string): React.CSSProperties => {
    const e = PANEL_ENTRIES.find(p => p.key === k)!;
    const p = E(e.at + 700, e.at + 1300) * (1 - E(18600, 19700));
    return { opacity: p, transform: `translateY(${(1 - p) * 8}px)` };
  };
  const panel: React.CSSProperties = {
    position: "absolute", background: tk.bgPanel, border: `1px solid ${tk.w07}`, borderRadius: 8,
  };
  const tagS: React.CSSProperties = {
    position: "absolute", fontSize: 10.5, letterSpacing: ".16em", color: tk.accent,
    textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap", top: "88%",
  };
  const ask = t("open.ask");
  const askN = Math.round(E(20000, 25500) * ask.length);

  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, opacity: op,
      transform: `scale(${1 - E(46000, 49000) * 0.06})`,
    }}>
      {/* 창 프레임 — 위아래가 열려 있으면 패널이 허공에 뜬 상자로 보인다.
          조립이 끝난 뒤 조용히 들어와 화면을 닫아준다. */}
      {(() => {
        const fr = E(15800, 16900);
        if (fr < 0.01) return null;
        const menus = ["파일", "편집", "보기", "이동", "AI"];
        return (
          <>
            <div style={{
              position: "absolute", left: "6%", right: "6%", top: "5.5%", height: "5%",
              background: tk.bgPanel, border: `1px solid ${tk.w07}`, borderRadius: "8px 8px 0 0",
              display: "flex", alignItems: "center", gap: 12, padding: "0 12px",
              opacity: fr, transform: `translateY(${(1 - fr) * -8}px)`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: tk.accent }} />
              {menus.map(m => (
                <span key={m} style={{ fontSize: 9.5, color: tk.fgDim }}>{m}</span>
              ))}
            </div>
            <div style={{
              position: "absolute", left: "6%", right: "6%", top: "86.5%", height: "3.6%",
              background: tk.bgPanel, border: `1px solid ${tk.w07}`, borderRadius: "0 0 8px 8px",
              display: "flex", alignItems: "center", padding: "0 12px", gap: 10,
              opacity: fr, transform: `translateY(${(1 - fr) * 8}px)`,
            }}>
              <span style={{ fontSize: 9, color: time >= 43500 ? tk.ok : tk.fgDim }}>
                {time >= 43500 ? t("open.status.changed") : t("open.status.clean")}
              </span>
            </div>
          </>
        );
      })()}

      {/* 레일 */}
      <div style={{ ...panel, left: "6%", top: "12%", width: "3.2%", height: "74%", ...box("rail") }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: "56%", margin: "8% auto", aspectRatio: "1", borderRadius: 3,
            background: i === 0 ? tk.accent : tk.fgDim, opacity: i === 0 ? 1 : .3,
          }} />
        ))}
      </div>
      <div style={{ ...tagS, left: "6%", ...tag("rail") }}>{t("open.tag.rail")}</div>

      {/* 프로젝트 + 대화 */}
      <div style={{ ...panel, left: "10.2%", top: "12%", width: "19%", height: "74%", ...box("left") }}>
        <div style={{ padding: "10px 8px 0", fontSize: 9.5, letterSpacing: ".14em", color: tk.fgDim, fontWeight: 700 }}>
          {t("open.tag.project")}
        </div>
        <div style={{ padding: "6px 4px" }}>
          {MOCK_TREE.map((n, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, lineHeight: 1.9,
              padding: `0 6px 0 ${6 + n.depth * 11}px`, borderRadius: 4,
              background: n.on ? tk.accentSoft : "transparent",
              color: n.on ? tk.fg : n.dir ? tk.fgSub : tk.fgSub2,
              fontWeight: n.on ? 600 : 400,
            }}>
              <span style={{ opacity: .55, fontSize: 8 }}>{n.dir ? "▾" : "·"}</span>
              {n.name}
            </div>
          ))}
        </div>
        {/* 답변 — 코드가 다시 쓰인 뒤에 온다 */}
        <div style={{
          position: "absolute", left: "6%", right: "6%", bottom: "26%",
          fontSize: 10, lineHeight: 1.55, color: tk.fgSub,
          opacity: E(35800, 36800),
        }}>
          <span style={{ color: tk.accent, fontSize: 9, letterSpacing: ".1em", display: "block", marginBottom: 3 }}>
            Claude
          </span>
          {t("open.reply")}
        </div>
        <div style={{ position: "absolute", left: "6%", right: "6%", bottom: "5%" }}>
          <div style={{
            fontSize: 11.5, lineHeight: 1.5, background: tk.bgEditor, borderRadius: 7, padding: "8px 10px",
            minHeight: "2.6em", color: tk.fg,
            border: `1px solid ${time >= 20000 && time < 27000 ? tk.accent : tk.w07}`, transition: "border-color .4s",
          }}>
            <span style={{ color: tk.accent, fontSize: 9.5, letterSpacing: ".1em", display: "block", marginBottom: 4 }}>
              {t("open.tag.ask")}
            </span>
            {ask.slice(0, askN)}
            {time >= 20000 && time < 26500 && <Caret c={tk.accentHi} />}
          </div>
        </div>
      </div>
      <div style={{ ...tagS, left: "10.2%", ...tag("left") }}>{t("open.tag.left")}</div>

      {/* 에디터 */}
      <div style={{ ...panel, left: "30%", top: "12%", width: "41%", height: "74%", background: tk.bgEditor, ...box("editor") }}>
        {/* 탭 스트립 — 이게 없으면 코드 상자가 떠 있는 것처럼 보인다 */}
        <div style={{
          display: "flex", alignItems: "stretch", height: 26,
          borderBottom: `1px solid ${tk.w07}`, background: tk.bgPanel,
          borderRadius: "7px 7px 0 0", overflow: "hidden",
        }}>
          {["Footer.jsx", "App.jsx"].map((n, i) => (
            <div key={n} style={{
              display: "flex", alignItems: "center", padding: "0 11px",
              fontFamily: "var(--font-mono, monospace)", fontSize: 9.5,
              borderRight: `1px solid ${tk.w07}`,
              background: i === 0 ? tk.bgEditor : "transparent",
              color: i === 0 ? tk.fg : tk.fgDim,
            }}>{n}</div>
          ))}
        </div>
        <pre style={{
          position: "absolute", inset: "34px 5% 6%", fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontSize: "clamp(9px,1.05vw,15px)", lineHeight: 2, margin: 0, whiteSpace: "pre",
          overflow: "hidden", color: tk.fgCode,
        }}>
          {MOCK_CODE.map(([txt, cls], i) => {
            if (txt === "@SWAP@") {
              const shown = swapChars === null ? "2024" : SWAP_TO.slice(0, swapChars);
              return (
                <span key={i}>
                  <span style={{
                    borderRadius: 3, padding: "0 2px",
                    background: hotSwap ? tk.accentSoft : "transparent",
                    boxShadow: hotSwap ? `0 0 22px ${tk.accentSoft}` : "none",
                  }}>{shown}</span>
                  {swapChars !== null && swapChars < SWAP_TO.length && <Caret c={tk.accentHi} />}
                </span>
              );
            }
            const color = cls === "k" ? tk.accentHi : cls === "s" ? tk.ok : cls === "t" ? tk.fgSub : undefined;
            return <span key={i} style={color ? { color } : undefined}>{txt}</span>;
          })}
        </pre>
      </div>
      <div style={{ ...tagS, left: "30%", ...tag("editor") }}>{t("open.tag.editor")}</div>

      {/* 검토 */}
      <div style={{ ...panel, left: "71.5%", top: "12%", width: "22.5%", height: "74%", ...box("right") }}>
        <div style={{ padding: "10px 9px 0", fontSize: 9.5, letterSpacing: ".14em", color: tk.fgDim, fontWeight: 700 }}>
          {t("open.tag.agents")}
        </div>
        {(() => {
          const busy = time >= 20000 && time < 37500;
          const st = time < 20000 ? "idle" : time < 26000 ? "read" : time < 36000 ? "edit" : "review";
          return (
            <div style={{
              margin: "7px 9px", padding: "8px 9px", borderRadius: 7, background: tk.bgEditor,
              border: `1px solid ${busy ? tk.accent : tk.w07}`, transition: "border-color .4s",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11 }}>
                <span style={{ fontWeight: 650 }}>Claude</span>
                <span style={{ marginLeft: "auto", fontSize: 9.5, color: busy ? tk.accent : tk.fgDim }}>
                  {t("open.st." + st)}
                </span>
              </div>
              <div style={{
                fontFamily: "var(--font-mono, monospace)", fontSize: 9, color: tk.fgDim, marginTop: 3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{time >= 20000 ? "src/components/Footer.jsx" : "—"}</div>
              <div style={{ height: 2, borderRadius: 1, background: tk.w12, marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", background: tk.accent, width: `${E(20000, 36000) * 100}%` }} />
              </div>
            </div>
          );
        })()}
        <div style={{ padding: "6px 9px 0", fontSize: 9.5, letterSpacing: ".14em", color: tk.fgDim, fontWeight: 700 }}>
          {t("open.tag.review")}
        </div>
        {(() => {
          const shown = time >= 37500 && time < 44000;
          const stamped = time >= 43500 && time < 47000;
          if (stamped) return (
            <div style={{
              position: "absolute", left: "6%", right: "6%", top: "38%", display: "grid", placeItems: "center",
              fontSize: 15, fontWeight: 650, color: tk.ok,
            }}>{t("open.applied")}</div>
          );
          return (
            <div style={{
              position: "absolute", left: "6%", right: "6%", top: "38%", background: tk.bgEditor,
              border: `1px solid ${tk.w12}`, borderRadius: 8, padding: 11,
              opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(14px) scale(.97)",
              transition: "opacity .5s, transform .6s cubic-bezier(.22,1.2,.36,1)",
            }}>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9.5, color: tk.fgDim }}>
                src/components/Footer.jsx
              </div>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, lineHeight: 1.7, margin: "6px 0" }}>
                <div style={{ color: "#C98A8A" }}>− © 2024 SCHUTZ STUDIO</div>
                <div style={{ color: tk.ok }}>+ © {"{new Date().getFullYear()}"} SCHUTZ STUDIO</div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <span style={{
                  fontSize: 10.5, padding: "3px 11px", borderRadius: 5, background: tk.accent, color: tk.onAccent,
                  fontWeight: 650,
                  transform: time >= 42700 && time < 43400 ? "scale(.9)" : "none",
                  boxShadow: time >= 42700 && time < 43400 ? `0 0 30px ${tk.accent}` : "none",
                  transition: "transform .18s cubic-bezier(.22,1.2,.36,1), box-shadow .3s",
                }}>{t("open.accept")}</span>
                <span style={{ fontSize: 10.5, padding: "3px 11px", borderRadius: 5, border: `1px solid ${tk.w12}`, color: tk.fgSub }}>
                  {t("open.reject")}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
      <div style={{ ...tagS, left: "71.5%", ...tag("right") }}>{t("open.tag.right")}</div>
    </div>
  );
}

function Caret({ c }: { c: string }) {
  return <span style={{ display: "inline-block", width: 2, height: "1.05em", background: c, verticalAlign: -3 }} />;
}
