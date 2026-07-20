import React, { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

/**
 * 실행 중인 개발 서버 화면을 편집 그룹 안에 띄운다.
 * 에이전트가 `npm run dev` 같은 서버를 백그라운드로 올리면 그 주소를 여기로 연결한다.
 *
 * iframe 을 쓴다 — <webview> 는 webviewTag 를 켜야 하고 보안 면적이 넓어진다.
 * 로컬 dev 서버는 보통 X-Frame-Options 를 걸지 않아 iframe 으로 잘 뜬다.
 * 못 뜨는 서버를 위해 "브라우저로 열기" 를 항상 함께 둔다.
 */
export function PreviewPane({ url }: { url: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [key, setKey] = useState(0);      // 새로고침용 — src 재대입은 히스토리를 더럽힌다
  const [addr, setAddr] = useState(url);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => { setAddr(url); setKey(k => k + 1); }, [url]);

  // 서버가 아직 안 떴을 수 있다 — 일정 시간 안에 load 가 없으면 안내를 띄운다
  useEffect(() => {
    setSlow(false);
    const h = setTimeout(() => { if (loadedAt === null) setSlow(true); }, 6000);
    return () => clearTimeout(h);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next: string) => { setAddr(next); setKey(k => k + 1); setLoadedAt(null); };

  const btn: React.CSSProperties = {
    height: 22, padding: "0 9px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer",
    borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w10)",
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-editor)" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--w06)" }}>
        <button className="hv05" style={btn} onClick={() => { setKey(k => k + 1); setLoadedAt(null); }}>↻</button>
        <input
          value={addr}
          onChange={e => setAddr(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") go((e.target as HTMLInputElement).value); }}
          spellCheck={false}
          style={{ flex: 1, minWidth: 0, height: 22, fontSize: 11, fontFamily: "var(--font-code, monospace)", color: "var(--fg)", background: "var(--bg-root)", border: "1px solid var(--w08)", borderRadius: 6, padding: "0 8px", outline: "none" }}
        />
        <button className="hv05" style={btn} onClick={() => { try { window.open(addr, "_blank"); } catch { /* */ } }}>{t("preview.openExternal")}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <iframe
          key={key}
          ref={frameRef}
          src={addr}
          onLoad={() => { setLoadedAt(Date.now()); setSlow(false); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#fff" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
        {slow && loadedAt === null && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 14px", fontSize: 11, lineHeight: 1.7, color: "var(--fg-sub2)", background: "var(--bg-card)", borderTop: "1px solid var(--w07)" }}>
            {t("preview.slowHint")}
          </div>
        )}
      </div>
    </div>
  );
}
