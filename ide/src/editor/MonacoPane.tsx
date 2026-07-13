import React, { useEffect, useRef, useState } from "react";
import monaco, { languageOf } from "./monacoSetup";
import { getThemeId, monacoThemeOf } from "../theme";

interface Props {
  root: string;
  rel: string;
  onDirtyChange?: (rel: string, dirty: boolean) => void;
  onStatus?: (info: { rel: string; lang: string; line: number; col: number }) => void;
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
export function MonacoPane({ root, rel, onDirtyChange, onStatus }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const savedRef = useRef<string>("");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (!hostRef.current || !window.schutz) return;

    const editor = monaco.editor.create(hostRef.current, {
      value: "",
      language: languageOf(rel),
      theme: monacoThemeOf(getThemeId()),
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 12,
      lineHeight: 20,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 10 },
      renderLineHighlight: "line",
      smoothScrolling: true,
    });
    editorRef.current = editor;

    const save = async () => {
      if (!window.schutz || !editorRef.current) return;
      const text = editorRef.current.getValue();
      try {
        await window.schutz.writeFile(root, rel, text);
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

    // 레지스트리 등록 + 포커스/커서 상태 보고
    const api: PaneApi = { rel, editor, save };
    paneRegistry.panes.set(rel, api);
    const lang = languageOf(rel);
    editor.onDidFocusEditorWidget(() => {
      paneRegistry.focused = api;
      const p = editor.getPosition();
      onStatusRef.current?.({ rel, lang, line: p?.lineNumber ?? 1, col: p?.column ?? 1 });
    });
    editor.onDidChangeCursorPosition(e => {
      onStatusRef.current?.({ rel, lang, line: e.position.lineNumber, col: e.position.column });
    });

    editor.onDidChangeModelContent(() => {
      const d = editor.getValue() !== savedRef.current;
      setDirty(prev => {
        if (prev !== d) onDirtyChange?.(rel, d);
        return d;
      });
    });

    window.schutz
      .readFile(root, rel)
      .then(text => {
        if (disposed) return;
        savedRef.current = text;
        editor.setValue(text);
        setState("ready");
      })
      .catch(e => {
        if (disposed) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      });

    return () => {
      disposed = true;
      paneRegistry.panes.delete(rel);
      if (paneRegistry.focused?.rel === rel) paneRegistry.focused = null;
      editor.dispose();
      editorRef.current = null;
    };
    // root/rel이 바뀌면 페인을 새로 만든다
  }, [root, rel]);

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      {state === "loading" && (
        <div style={overlay}>불러오는 중…</div>
      )}
      {state === "error" && (
        <div style={{ ...overlay, color: "#CE9A9A" }}>⚠️ {error}</div>
      )}
      {(dirty || flash) && state === "ready" && (
        <div style={{
          position: "absolute", right: 12, bottom: 10, zIndex: 5,
          fontSize: 10.5, fontFamily: "'SUIT Variable',sans-serif",
          color: flash && !dirty ? "#9DC4A3" : "#CCB491",
          background: "#181C1A", border: "1px solid #2A302C",
          borderRadius: 6, padding: "3px 9px",
        }}>
          {flash && !dirty ? "✓ 저장됨" : "● 수정됨 · Ctrl+S 저장"}
        </div>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 12, color: "#5A635C",
  background: "#0E100F", zIndex: 4,
};
