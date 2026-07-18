import React, { useEffect, useRef, useState } from "react";
import monaco, { languageOf } from "./monacoSetup";
import { activeMonacoTheme } from "../ext/activeTheme";
import { getEditorPrefs, codeFontStack } from "../settings";

interface Props {
  root: string;
  rel: string;     // 실제 파일 경로
  staged: boolean; // 스테이지 diff 여부
  untracked?: boolean;
}

/** Git diff 뷰 — HEAD(원본) vs 워킹트리(수정본) 좌우 비교 (Electron 전용) */
export function DiffPane({ root, rel, staged, untracked }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    if (!hostRef.current || !window.schutz) return;
    const prefs = getEditorPrefs();

    const diff = monaco.editor.createDiffEditor(hostRef.current, {
      theme: activeMonacoTheme(),
      fontFamily: codeFontStack(prefs.codeFont),
      fontSize: prefs.fontSize,
      lineHeight: Math.round(prefs.fontSize * 1.6),
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      ignoreTrimWhitespace: false,
    });

    (async () => {
      try {
        // 원본 = HEAD 버전(미추적이 아니면), 수정본 = staged면 인덱스(git show :path), 아니면 워킹트리
        const headP = untracked ? Promise.resolve({ content: "" }) : window.schutz!.git(root, "headFile", { path: rel });
        const modP = staged
          ? window.schutz!.git(root, "stagedFile", { path: rel }).then((r: any) => r?.content ?? "").catch(() => "")
          : window.schutz!.readFile(root, rel).catch(() => "");
        const [head, mod] = await Promise.all([headP, modP]);
        if (disposed) return;
        const lang = languageOf(rel);
        const original = monaco.editor.createModel(head?.content ?? "", lang);
        const modified = monaco.editor.createModel(typeof mod === "string" ? mod : "", lang);
        diff.setModel({ original, modified });
        setState("ready");
      } catch (e) {
        if (disposed) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();

    return () => {
      disposed = true;
      const m = diff.getModel();
      m?.original?.dispose();
      m?.modified?.dispose();
      diff.dispose();
    };
  }, [root, rel, staged, untracked]);

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      {state === "loading" && <div style={overlay}>diff 불러오는 중…</div>}
      {state === "error" && <div style={{ ...overlay, color: "#CE9A9A" }}>⚠️ {error}</div>}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 12, color: "var(--fg-dim)",
  background: "var(--bg-editor)", zIndex: 4,
};
