import React from "react";
import { t, LANGS, getLang, setLang } from "../i18n";
import type { Lang } from "../i18n";
import { THEME_TOKENS, applyTheme, setThemeId, getThemeId } from "../theme";
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


/** 고를 수 있는 테마 — 실제 THEME_TOKENS 에서 가져온다. 가짜 색이 아니라 진짜 테마다. */
const CHOICES = ["feldgrau", "graphite", "paper"] as const;


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
          <Mark color={tk.accent} size="13vw" dash={620 * (1 - E(400, 2400))} />
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
              {/* 제목만 덩그러니 있으면 허전하다. 방금 획이 그려진 그 마크를 작게 얹어
                  앞 장면과 이 화면을 잇는다 — 새 그림을 들이는 것보다 낫다. */}
              <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
                <Mark color={tk.accent} size={44} width={9} />
                <div style={{ width: 26, height: 1, background: tk.w14 }} />
                <h2 style={{ fontSize: "clamp(22px,3.2vw,40px)", fontWeight: 350, letterSpacing: "-.02em", margin: 0 }}>
                  {t("open.setup.title")}
                </h2>
              </div>

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

