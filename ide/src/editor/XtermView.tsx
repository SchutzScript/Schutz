import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { codeFontStack } from "../settings";

interface Props { id: string; cwd?: string; codeFont: string; fontSize: number; themeId: string }

function termTheme(dark: boolean) {
  return dark
    ? { background: "#0A0C0B", foreground: "#C4CBC4", cursor: "#8FA893", selectionBackground: "rgba(143,168,147,.28)" }
    : { background: "#FAF8F2", foreground: "#2E332C", cursor: "#4E6A55", selectionBackground: "rgba(78,106,85,.2)" };
}

/** xterm.js 터미널 뷰 — 진짜 PTY 백엔드(raw I/O).
 *  PTY면 셸이 에코·라인편집·시그널을 처리하므로 프론트는 raw 바이트만 왕복한다.
 *  PTY 로드 실패(폴백 파이프 셸)면 로컬 라인 에디터로 전환한다.
 *  폰트/테마는 재생성 없이 옵션만 갱신해 라이브 반영한다(PTY 세션 유지). */
export function XtermView({ id, cwd, codeFont, fontSize, themeId }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current || !window.schutz) return;
    const term = new Terminal({
      fontFamily: codeFontStack(codeFont),
      fontSize: fontSize - 1,
      cursorBlink: true,
      convertEol: false,
      theme: termTheme(themeId !== "paper"),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try { fit.fit(); } catch { /* */ }
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

    // PTY 여부 확인 후 셸 시작 (초기 크기 전달)
    window.schutz.ptyReal().then((real) => {
      if (disposed) return;
      realPty = real;
      if (!real) term.writeln("\x1b[2m Schutz 터미널 · 파이프 셸(폴백, 입력은 라인 단위) \x1b[0m");
      window.schutz!.termStart(cwd, id, term.cols, term.rows);
      started = true;
      if (pending) { window.schutz!.termInput(pending, id); pending = ""; } // 조기 입력 flush
    });

    // 입력: PTY면 raw 그대로, 폴백이면 로컬 라인 편집
    const onData = term.onData((d: string) => { if (realPty) sendInput(d); else localLine(d); });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); if (realPty) window.schutz!.termResize(id, term.cols, term.rows); } catch { /* */ }
    });
    ro.observe(hostRef.current);

    return () => {
      disposed = true;
      ro.disconnect();
      onData.dispose();
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
    // fit 후 PTY 에도 새 cols/rows 통지 — 폰트 변경 시 그리드 크기 불일치 방지
    try { fitRef.current?.fit(); window.schutz?.termResize(id, term.cols, term.rows); } catch { /* */ }
  }, [codeFont, fontSize, themeId]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0, padding: "4px 8px" }} />;
}
