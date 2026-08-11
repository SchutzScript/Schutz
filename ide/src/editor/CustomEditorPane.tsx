import React, { useEffect, useRef, useState } from "react";
import * as extHost from "../ext/extHost";
import { webviewDoc } from "../ext/views";
import { t } from "../i18n";

/** 확장이 만든 편집기 한 장.
 *
 *  vscode 의 CustomTextEditorProvider 는 웹뷰 하나에 문서 하나를 묶어 준다. 문서는
 *  평범한 TextDocument 라, 확장이 고칠 때는 WorkspaceEdit 을 쓴다 — 그러면 모델을
 *  거치므로 Ctrl+Z 도 되고 저장 기준선도 어긋나지 않는다.
 *
 *  iframe 은 사이드바 웹뷰와 같은 규칙으로 가둔다(sandbox, 같은 출처 아님). */
export function CustomEditorPane({ viewType, rel }: { viewType: string; rel: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let dead = false;
    const ed = extHost.extEditorFor(viewType);
    if (!ed) { setErr(t("exth.customEditorGone", { viewType })); return; }
    // 문서를 먼저 세운다 — 이 파일에는 모델이 없을 수 있고, 그러면 확장이
    // document.getText() 첫 줄에서 던진다.
    extHost.openDocFor(rel)
      .then(doc => {
        if (dead) return null;
        if (!doc) throw new Error(t("exth.customEditorNoDoc", { rel }));
        return ed.resolve(rel, doc);
      })
      .then(h => { if (!dead && h != null) setHtml(String(h)); })
      // 확장이 던지면 빈 화면 대신 이유를 띄운다 — 안 그러면 파일이 안 열린 것처럼 보인다.
      .catch(e => { if (!dead) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [viewType, rel]);

  // 웹뷰가 보낸 말을 확장에게 넘긴다. 사이드바 웹뷰와 같은 봉투를 쓴다.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d: any = e.data;
      if (!d || d.__schutzView !== "editor:" + rel) return;
      extHost.extEditorFor(viewType)?.post(d.data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [viewType, rel]);

  if (err) {
    return <div style={{ padding: 16, fontSize: 12.5, color: "#CE9A9A" }}>⚠️ {err}</div>;
  }
  if (html == null) {
    return <div style={{ padding: 16, fontSize: 12, color: "var(--fg-dim2)" }}>{t("exth.customEditorLoading")}</div>;
  }
  return (
    <iframe
      ref={frameRef}
      title={rel}
      sandbox="allow-scripts"
      // 사이드바 웹뷰와 같은 다리를 넣는다. 안 넣으면 확장이 쓴 스크립트의
      // acquireVsCodeApi() 가 없어서 첫 줄에서 죽고, 웹뷰가 아무 말도 못 한다.
      srcDoc={webviewDoc(html, "editor:" + rel)}
      style={{ flex: 1, minHeight: 0, border: "none", background: "var(--bg-editor)" }}
    />
  );
}
