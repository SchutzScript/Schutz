import React, { useEffect, useRef, useState } from "react";
import monaco, { languageOf } from "./monacoSetup";
import { activeMonacoTheme } from "../ext/activeTheme";
import { getEditorPrefs, codeFontStack } from "../settings";
import * as projectModels from "./projectModels";
import { t } from "../i18n";
// @ts-ignore — monaco-vim 타입 미제공
import { initVimMode } from "monaco-vim";

interface Props {
  root: string;
  rel: string;
  onDirtyChange?: (rel: string, dirty: boolean) => void;
  onStatus?: (info: { rel: string; lang: string; line: number; col: number }) => void;
  /** Ctrl+K 인라인 편집 — 선택 영역과 지시를 App으로 전달 */
  onInlineEdit?: (rel: string, selection: string, instruction: string, range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => void;
  /** 디버그 브레이크포인트(1-based 라인 목록) */
  breakpoints?: number[];
  /** 디버거가 정지한 라인(현재 파일일 때만) */
  stoppedLine?: number | null;
  /** 거터 클릭으로 브레이크포인트 토글 */
  onToggleBreakpoint?: (rel: string, line: number) => void;
}

/** IntelliJ 키맵 — 체감되는 핵심 바인딩만 재현 (완전 1:1 아님) */
function applyIntellijKeymap(editor: monaco.editor.IStandaloneCodeEditor) {
  const M = monaco.KeyMod, K = monaco.KeyCode;
  // Ctrl+D: 라인 복제 (VS Code 기본은 '다음 항목 선택' → IntelliJ식으로 덮어씀)
  editor.addCommand(M.CtrlCmd | K.KeyD, () => editor.trigger("keymap", "editor.action.copyLinesDownAction", null));
  // Ctrl+Y: 라인 삭제
  editor.addCommand(M.CtrlCmd | K.KeyY, () => editor.trigger("keymap", "editor.action.deleteLines", null));
  // Ctrl+/: 주석 토글 (Monaco 기본과 동일하나 명시)
  editor.addCommand(M.CtrlCmd | K.Slash, () => editor.trigger("keymap", "editor.action.commentLine", null));
  // Shift+Ctrl+Up/Down: 라인 이동
  editor.addCommand(M.CtrlCmd | M.Shift | K.UpArrow, () => editor.trigger("keymap", "editor.action.moveLinesUpAction", null));
  editor.addCommand(M.CtrlCmd | M.Shift | K.DownArrow, () => editor.trigger("keymap", "editor.action.moveLinesDownAction", null));
  // Ctrl+W: 선택 확장 (IntelliJ 시그니처)
  editor.addCommand(M.CtrlCmd | K.KeyW, () => editor.trigger("keymap", "editor.action.smartSelect.expand", null));
}

/** 열린 페인 레지스트리 — 전역 저장/편집 액션 라우팅용 */
export interface PaneApi {
  rel: string;
  editor: monaco.editor.IStandaloneCodeEditor;
  save: () => Promise<void>;
}
export const paneRegistry: { panes: Map<string, PaneApi>; focused: PaneApi | null } = {
  panes: new Map(),
  focused: null,
};

type LoadState = "loading" | "ready" | "error";

/** 실제 파일을 여는 Monaco 편집 페인 (Electron 전용 — window.schutz 필요) */
function MonacoPaneImpl({ root, rel, onDirtyChange, onStatus, onInlineEdit, breakpoints, stoppedLine, onToggleBreakpoint }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onInlineRef = useRef(onInlineEdit);
  onInlineRef.current = onInlineEdit;
  const onBpRef = useRef(onToggleBreakpoint);
  onBpRef.current = onToggleBreakpoint;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const bpDecoRef = useRef<string[]>([]);
  const [inlineSel, setInlineSel] = useState<string | null>(null);
  const inlineRangeRef = useRef<{ startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null>(null); // Ctrl+K 선택 범위 — 텍스트가 아닌 정확 범위로 적용(non-unique 선택 대응)
  const [inlineVal, setInlineVal] = useState("");
  const savedRef = useRef<string>("");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState(false);

  const vimStatusRef = useRef<HTMLDivElement | null>(null);
  const isVim = getEditorPrefs().keymap === "vim";

  useEffect(() => {
    let disposed = false;
    if (!hostRef.current || !window.schutz) return;

    const prefs = getEditorPrefs();
    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    let vim: { dispose(): void } | null = null;
    let decoIds: string[] = [];
    const lang = languageOf(rel);

    // 공유 모델에 에디터를 붙인다 (모델은 projectModels 스토어 소유 — 파일간 인텔리전스 유지)
    const setup = (model: monaco.editor.ITextModel) => {
      if (disposed || !hostRef.current) return;
      // 대용량 파일 가드 — 미니맵·줄바꿈·폴딩·괄호색 등 무거운 기능을 꺼서 프리즈 방지
      const big = model.getValueLength() > 1_500_000 || model.getLineCount() > 50_000;
      editor = monaco.editor.create(hostRef.current, {
        model,
        theme: activeMonacoTheme(),
        fontFamily: codeFontStack(prefs.codeFont),
        fontSize: prefs.fontSize,
        lineHeight: Math.round(prefs.fontSize * 1.6),
        minimap: { enabled: !!prefs.minimap && !big },
        wordWrap: big ? "off" : (prefs.wordWrap ? "on" : "off"),
        tabSize: prefs.tabSize,
        lineNumbers: prefs.lineNumbers ? "on" : "off",
        cursorStyle: prefs.cursorStyle,
        renderWhitespace: (prefs.renderWhitespace && !big) ? "all" : "none",
        folding: !big,
        bracketPairColorization: { enabled: !big },
        occurrencesHighlight: big ? "off" : "singleFile",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 10 },
        renderLineHighlight: "line",
        smoothScrolling: true,
        fixedOverflowWidgets: true,
        glyphMargin: true,
      });
      // 거터(글리프 마진) 클릭 → 브레이크포인트 토글
      editor.onMouseDown((e) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
          onBpRef.current?.(rel, e.target.position.lineNumber);
        }
      });
      editorRef.current = editor;
      savedRef.current = model.getValue();
      setState("ready");

      if (prefs.keymap === "vim" && vimStatusRef.current) {
        try { vim = initVimMode(editor, vimStatusRef.current); } catch { /* 기본 폴백 */ }
      } else if (prefs.keymap === "intellij") {
        applyIntellijKeymap(editor);
      }

      const save = async () => {
        if (!window.schutz || !editorRef.current) return;
        if (prefs.formatOnSave) { try { await editorRef.current.getAction("editor.action.formatDocument")?.run(); } catch { /* 포매터 없음 */ } }
        const text = editorRef.current.getValue();
        try {
          await window.schutz.writeFile(root, rel, text);
          projectModels.markSaved(root, rel, text);
          savedRef.current = text;
          setDirty(false);
          onDirtyChange?.(rel, false);
          setFlash(true);
          setTimeout(() => setFlash(false), 900);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      };
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
        const sel = editor!.getSelection();
        if (!sel || sel.isEmpty()) return;
        inlineRangeRef.current = { startLineNumber: sel.startLineNumber, startColumn: sel.startColumn, endLineNumber: sel.endLineNumber, endColumn: sel.endColumn };
        setInlineSel(model.getValueInRange(sel));
        setInlineVal("");
      });

      const api: PaneApi = { rel, editor, save };
      paneRegistry.panes.set(rel, api);
      editor.onDidFocusEditorWidget(() => {
        paneRegistry.focused = api;
        const p = editor!.getPosition();
        onStatusRef.current?.({ rel, lang, line: p?.lineNumber ?? 1, col: p?.column ?? 1 });
      });
      editor.onDidChangeCursorPosition(e => {
        onStatusRef.current?.({ rel, lang, line: e.position.lineNumber, col: e.position.column });
      });
      let autoTimer: ReturnType<typeof setTimeout> | null = null;
      editor.onDidChangeModelContent(() => {
        // 외부 디스크 리로드(projectModels.reload → setValue)가 baseline 을 갱신하므로 그것을 우선 기준으로.
        const baseline = projectModels.getSaved(root, rel);
        if (baseline !== undefined) savedRef.current = baseline;
        const d = editor!.getValue() !== savedRef.current;
        setDirty(prev => { if (prev !== d) onDirtyChange?.(rel, d); return d; });
        if (d && prefs.autoSave === "afterDelay") {
          if (autoTimer) clearTimeout(autoTimer);
          autoTimer = setTimeout(() => void save(), 1000);
        }
      });
      if (prefs.autoSave === "onFocusChange") {
        editor.onDidBlurEditorText(() => { if (editorRef.current && editorRef.current.getValue() !== savedRef.current) void save(); });
      }

      // Git 거터 변경 표시
      void (async () => {
        if (!window.schutz) return;
        try {
          const r = await window.schutz.git(root, "diffLines", { path: rel });
          if (disposed || !r?.ok || !editor) return;
          const decos: monaco.editor.IModelDeltaDecoration[] = [];
          for (const [a, b, isMod] of (r.added ?? [])) {
            decos.push({ range: new monaco.Range(a, 1, b, 1), options: { isWholeLine: true, linesDecorationsClassName: isMod ? "sz-gd-mod" : "sz-gd-add" } });
          }
          for (const ln of (r.removed ?? [])) {
            const line = Math.max(1, ln);
            decos.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, linesDecorationsClassName: "sz-gd-del" } });
          }
          decoIds = editor.deltaDecorations(decoIds, decos);
        } catch { /* git 없음 무시 */ }
      })();
    };

    const existing = projectModels.getByRel(rel);
    if (existing) {
      setup(existing);
    } else {
      window.schutz.readFile(root, rel)
        .then(text => {
          if (disposed) return;
          setup(projectModels.ensure(root, rel, text, lang));
        })
        .catch(e => {
          if (disposed) return;
          setError(e instanceof Error ? e.message : String(e));
          setState("error");
        });
    }

    return () => {
      disposed = true;
      try { vim?.dispose(); } catch { /* ignore */ }
      paneRegistry.panes.delete(rel);
      if (paneRegistry.focused?.rel === rel) paneRegistry.focused = null;
      editor?.dispose(); // 에디터만 파기 — 모델은 스토어가 소유
      editorRef.current = null;
    };
  }, [root, rel]);

  // 브레이크포인트·정지라인 데코레이션 (props 변경 시 갱신)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || state !== "ready") return;
    const decos: monaco.editor.IModelDeltaDecoration[] = [];
    for (const line of (breakpoints ?? [])) {
      decos.push({ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: "sz-bp", glyphMarginHoverMessage: { value: t("mono.breakpoint") }, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } });
    }
    if (stoppedLine) {
      decos.push({ range: new monaco.Range(stoppedLine, 1, stoppedLine, 1), options: { isWholeLine: true, className: "sz-bp-stopline", glyphMarginClassName: "sz-bp-arrow" } });
    }
    bpDecoRef.current = editor.deltaDecorations(bpDecoRef.current, decos);
    if (stoppedLine) editor.revealLineInCenter(stoppedLine);
  }, [breakpoints, stoppedLine, state]);

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0, bottom: isVim ? 20 : 0 }} />
      {/* Ctrl+K 인라인 편집 바 */}
      {inlineSel !== null && (
        <div style={{ position: "absolute", top: 8, left: 12, right: 12, zIndex: 12, display: "flex", flexDirection: "column", gap: 6, background: "var(--bg-popup)", border: "1px solid var(--accent)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 10 }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim)", fontFamily: "var(--font-code, 'IBM Plex Mono', monospace)" }}>{t("mono.inlineEditLines", { n: inlineSel.split("\n").length })}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input autoFocus value={inlineVal}
              onChange={e => setInlineVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setInlineSel(null); editorRef.current?.focus(); }
                else if (e.key === "Enter" && inlineVal.trim()) {
                  onInlineRef.current?.(rel, inlineSel, inlineVal.trim(), inlineRangeRef.current!);
                  setInlineSel(null);
                }
              }}
              placeholder={t("mono.inlinePlaceholder")}
              style={{ flex: 1, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 7, height: 32, padding: "0 11px", color: "var(--fg)", fontSize: 12.5, fontFamily: "var(--font-ui, 'SUIT Variable', sans-serif)", outline: "none" }} />
            <button onMouseDown={e => { e.preventDefault(); if (inlineVal.trim()) { onInlineRef.current?.(rel, inlineSel, inlineVal.trim(), inlineRangeRef.current!); setInlineSel(null); } }}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("mono.edit")}</button>
            <button onMouseDown={e => { e.preventDefault(); setInlineSel(null); editorRef.current?.focus(); }}
              style={{ height: 32, padding: "0 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("mono.cancel")}</button>
          </div>
        </div>
      )}
      {/* Vim 모드 상태줄 (vim 키맵일 때만) */}
      <div ref={vimStatusRef} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 20, display: isVim ? "flex" : "none", alignItems: "center", padding: "0 12px", fontFamily: "var(--font-code, 'IBM Plex Mono', monospace)", fontSize: 11, color: "var(--fg-sub2)", background: "var(--bg-panel)", borderTop: "1px solid var(--w05)", zIndex: 6 }} />
      {state === "loading" && (
        <div style={overlay}>{t("mono.loading")}</div>
      )}
      {state === "error" && (
        <div style={{ ...overlay, color: "#CE9A9A" }}>⚠️ {error}</div>
      )}
      {(dirty || flash) && state === "ready" && (
        <div style={{
          position: "absolute", right: 12, bottom: 10, zIndex: 5,
          fontSize: 10.5, fontFamily: "var(--font-ui, 'SUIT Variable', sans-serif)",
          color: flash && !dirty ? "var(--ok-hi)" : "#CCB491",
          background: "var(--bg-popup)", border: "1px solid var(--bd-popup)",
          borderRadius: 6, padding: "3px 9px",
        }}>
          {flash && !dirty ? t("mono.saved") : t("mono.modified")}
        </div>
      )}
    </div>
  );
}

// React.memo — 안정 참조 props 와 함께 쓰면 부모(App)의 무관한 리렌더(입력 타이핑 등)에서 에디터 리렌더를 차단
export const MonacoPane = React.memo(MonacoPaneImpl);

const overlay: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 12, color: "var(--fg-dim)",
  background: "var(--bg-editor)", zIndex: 4,
};
