import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { codeFontStack } from "../settings";
import { t } from "../i18n";

interface Props {
  id: string; cwd?: string; codeFont: string; fontSize: number; themeId: string;
  /** 터미널이 열리자마자 한 번 실행할 명령(작업 실행기). 셸이 등록된 뒤에 보내야
   *  유실되지 않으므로 사용자가 친 것과 같은 경로(sendInput)로 넣는다. */
  initialCommand?: string;
}

function termTheme(dark: boolean) {
  return dark
    ? { background: "#0A0C0B", foreground: "#C4CBC4", cursor: "#8FA893", selectionBackground: "rgba(143,168,147,.28)" }
    : { background: "#FAF8F2", foreground: "#2E332C", cursor: "#4E6A55", selectionBackground: "rgba(78,106,85,.2)" };
}

/** xterm.js 터미널 뷰 — 진짜 PTY 백엔드(raw I/O).
 *  PTY면 셸이 에코·라인편집·시그널을 처리하므로 프론트는 raw 바이트만 왕복한다.
 *  PTY 로드 실패(폴백 파이프 셸)면 로컬 라인 에디터로 전환한다.
 *  폰트/테마는 재생성 없이 옵션만 갱신해 라이브 반영한다(PTY 세션 유지). */
export function XtermView({ id, cwd, codeFont, fontSize, themeId, initialCommand }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current || !window.schutz) return;
    const host = hostRef.current;
    const term = new Terminal({
      fontFamily: codeFontStack(codeFont),
      fontSize: fontSize - 1,
      cursorBlink: true,
      convertEol: false,
      theme: termTheme(themeId !== "paper"),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    /** 붙일 자리가 **실제로 생긴 뒤에** 연다.
     *
     *  하단 도크는 열릴 때 0 에서 210 으로 펼쳐진다. 그 도중에 term.open() 을 하면
     *  xterm 이 글자 크기를 재지 못해 렌더 서비스의 치수가 안 만들어지고, 이후 첫
     *  스크롤 동기화가 `dimensions` 를 undefined 로 읽어 던진다. 화면은 멀쩡해
     *  보이는데 터미널을 열 때마다 콘솔에 예외가 하나씩 쌓였다.
     *
     *  "폭이 0인가" 로는 못 잡는다 — 펼쳐지는 중에는 0 이 아니라 **너무 작을** 뿐이다.
     *  그래서 여는 것 자체를 크기가 잡힐 때까지 미룬다. 그때까지 들어온 출력은 xterm
     *  코어가 들고 있다가 열리는 순간 그려 준다. */
    let opened = false;
    const bigEnough = () => {
      const h = hostRef.current;
      return !!h && h.offsetWidth > 24 && h.offsetHeight > 24;
    };
    const safeFit = (): boolean => {
      if (!opened || !bigEnough()) return false;
      try {
        const d = (fit as unknown as { proposeDimensions?: () => { cols: number; rows: number } | undefined }).proposeDimensions?.();
        if (!d || !Number.isFinite(d.cols) || !Number.isFinite(d.rows) || d.cols < 2 || d.rows < 2) return false;
        fit.fit();
        return true;
      } catch { return false; }
    };
    const ensureOpen = (): boolean => {
      if (opened) return true;
      const h = hostRef.current;
      if (!h || !bigEnough()) return false;
      term.open(h);
      opened = true;
      safeFit();
      return true;
    };
    ensureOpen();
    termRef.current = term;
    fitRef.current = fit;

    const off = window.schutz.onTermData((tid, data) => { if (tid === id) term.write(data); });
    let disposed = false;
    let realPty = true;
    // termStart 전송 전 입력은 셸이 아직 등록되지 않아 유실됨 → 버퍼링 후 flush (조기 키 입력·붙여넣기 보호)
    let started = false;
    let pending = "";
    const sendInput = (d: string) => { if (started) window.schutz!.termInput(d, id); else pending += d; };

    // 로컬 라인 에디터(폴백 전용)
    let buf = "";
    const localLine = (d: string) => {
      for (const ch of d) {
        const code = ch.charCodeAt(0);
        if (ch === "\r") { term.write("\r\n"); sendInput(buf); buf = ""; }
        else if (code === 127 || ch === "\b") { if (buf.length) { buf = buf.slice(0, -1); term.write("\b \b"); } }
        else if (ch === "\x03") { term.write("^C\r\n"); buf = ""; }
        else if (ch === "\x1b") { /* 방향키 무시 */ }
        else if (code >= 32) { buf += ch; term.write(ch); }
      }
    };

    /** 셸을 띄운다 — **크기가 잡힌 뒤에만.**
     *
     *  터미널 도크가 닫힌 상태에서 터미널을 만들면(작업 실행기가 그렇다) 도크가 0→210 으로
     *  펼쳐지는 동안 마운트돼 fit() 이 0 열 0 행을 낸다. 그 크기로 셸을 띄우면 PTY 가
     *  0×0 으로 떠서 프롬프트조차 못 찍는다 — 터미널이 열렸는데 영원히 빈 화면이었다.
     *  그래서 ptyReal 응답과 "0 이 아닌 크기" 둘 다 갖춰질 때까지 미룬다. */
    let ptyResolved = false;
    const tryStart = () => {
      if (disposed || started || !ptyResolved) return;
      if (!ensureOpen() || !safeFit()) return;    // 아직 레이아웃 전 — 다음 리사이즈에 다시 본다
      if (term.cols < 2 || term.rows < 2) return;
      window.schutz!.termStart(cwd, id, term.cols, term.rows);
      started = true;
      if (pending) { window.schutz!.termInput(pending, id); pending = ""; } // 조기 입력 flush
      // 작업 실행기가 준 명령을 사용자가 친 것처럼 넣는다. 셸이 stdin 을 버퍼링하므로
      // 프롬프트가 아직 안 떴어도 순서는 지켜진다.
      if (initialCommand) window.schutz!.termInput(initialCommand + "\r", id);
    };

    window.schutz.ptyReal().then((real) => {
      if (disposed) return;
      realPty = real;
      if (!real) term.writeln("\x1b[2m Schutz 터미널 · 파이프 셸(폴백, 입력은 라인 단위) \x1b[0m");
      ptyResolved = true;
      tryStart();
    });

    // 입력: PTY면 raw 그대로, 폴백이면 로컬 라인 편집
    const onData = term.onData((d: string) => { if (realPty) sendInput(d); else localLine(d); });

    // 복사·붙여넣기. 터미널에서 Ctrl+C 는 원래 SIGINT 라 복사에 쓸 수 없다 — 그래서
    // **고른 게 있을 때만** 복사로 가로채고, 없으면 그대로 셸에 넘긴다(VS Code 와 같다).
    // 이게 없으면 Ctrl+V 가 셸에 \x16 으로 들어가서, 경로 하나 붙여넣는 것도 못 한다.
    const paste = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        // 붙여넣은 줄바꿈이 그대로 실행되지 않게 CR 로 통일하지 않는다 — 셸의 괄호 붙여넣기
        // 모드가 처리하도록 원문 그대로 넘긴다.
        if (realPty) sendInput(text); else localLine(text);
      } catch { /* 클립보드 권한이 없으면 조용히 넘어간다 */ }
    };
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return true;
      const k = e.key.toLowerCase();
      if (k === "v" && !e.shiftKey) { void paste(); return false; }
      if (k === "c" && !e.shiftKey) {
        const sel = term.getSelection();
        if (!sel) return true;                       // 고른 게 없으면 SIGINT 그대로
        void navigator.clipboard.writeText(sel).catch(() => { /* */ });
        term.clearSelection();
        return false;
      }
      // Ctrl+Shift+C/V 는 터미널 관례상 항상 복사·붙여넣기다
      if (e.shiftKey && k === "c") {
        const sel = term.getSelection();
        if (sel) void navigator.clipboard.writeText(sel).catch(() => { /* */ });
        return false;
      }
      if (e.shiftKey && k === "v") { void paste(); return false; }
      return true;
    });
    // 우클릭 — 고른 게 있으면 복사, 없으면 붙여넣기(윈도 콘솔 관례)
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const sel = term.getSelection();
      if (sel) { void navigator.clipboard.writeText(sel).catch(() => { /* */ }); term.clearSelection(); }
      else void paste();
    };
    host.addEventListener("contextmenu", onCtx);

    const ro = new ResizeObserver(() => {
      // 아직 안 떴으면 이 리사이즈가 "이제 크기가 생겼다" 는 신호다.
      if (!started) { tryStart(); return; }
      if (!ensureOpen() || !safeFit()) return;
      if (realPty) { try { window.schutz!.termResize(id, term.cols, term.rows); } catch { /* */ } }
    });
    ro.observe(hostRef.current);

    return () => {
      disposed = true;
      opened = false;
      ro.disconnect();
      onData.dispose();
      host.removeEventListener("contextmenu", onCtx);
      off();
      try { window.schutz?.termKill(id); } catch { /* */ }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // cwd 는 의도적으로 deps 에서 제외 — 폴더 전환 시 PTY 를 죽이지 않기 위함(최초 spawn 의 cwd 만 사용).
    // 실행 중 셸/스크롤백을 보존하고, 새 cwd 는 새로 만든 터미널에만 적용(VS Code 동작).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 폰트·테마 라이브 적용 — 터미널을 재생성하지 않고 옵션만 갱신
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = codeFontStack(codeFont);
    term.options.fontSize = fontSize - 1;
    term.options.theme = termTheme(themeId !== "paper");
    // fit 후 PTY 에도 새 cols/rows 통지 — 폰트 변경 시 그리드 크기 불일치 방지.
    // 여기서도 잴 수 있을 때만 맞춘다(위 safeFit 과 같은 이유).
    const fitNow = fitRef.current, host = hostRef.current;
    if (!fitNow || !host || !host.offsetWidth || !host.offsetHeight) return;
    try {
      const d = (fitNow as unknown as { proposeDimensions?: () => { cols: number; rows: number } | undefined }).proposeDimensions?.();
      if (!d || !Number.isFinite(d.cols) || !Number.isFinite(d.rows) || d.cols < 2 || d.rows < 2) return;
      fitNow.fit();
      window.schutz?.termResize(id, term.cols, term.rows);
    } catch { /* */ }
  }, [codeFont, fontSize, themeId]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0, padding: "4px 8px" }} />;
}
