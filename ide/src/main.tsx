import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { App } from "./App";
import { Onboarding } from "./Onboarding";
import { applyTheme, getThemeId } from "./theme";
import { applyUiFont } from "./settings";
import { applyLang } from "./i18n";

// 첫 페인트 전에 테마/폰트/언어를 적용 — 저장된 Paper(라이트) 등에서 다크 플래시 방지, <html lang> 동기화
try { applyTheme(getThemeId()); applyUiFont(); applyLang(); } catch { /* ignore */ }

const DONE_KEY = "schutz.onboarded";

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const forceOnboarding = hash.startsWith("#/onboarding");
  const firstRun = !localStorage.getItem(DONE_KEY);

  if (forceOnboarding || firstRun) {
    return (
      <Onboarding
        onFinish={() => {
          localStorage.setItem(DONE_KEY, "1");
          window.location.hash = "#/";
        }}
      />
    );
  }
  return <App />;
}

/** 렌더 예외 격리 — App 이 단일 대형 컴포넌트라 throw 하나로 창 전체가 백지가 되던 것을 막는다.
 *  창을 잃지 않는 게 목적이므로 UI 는 최소한으로 두되, 원인을 복사할 수 있어야 신고가 가능하다. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null; info: string }> {
  state: { err: Error | null; info: string } = { err: null, info: "" };
  static getDerivedStateFromError(err: Error) { return { err, info: "" }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    this.setState({ err, info: info.componentStack ?? "" });
    try { console.error("[schutz] 렌더 오류", err, info.componentStack); } catch { /* ignore */ }
  }
  render() {
    const { err, info } = this.state;
    if (!err) return this.props.children;
    const detail = `${err.name}: ${err.message}\n${err.stack ?? ""}\n${info}`;
    return (
      <div style={{ padding: 28, fontFamily: "system-ui, sans-serif", color: "#E4E8E3", background: "#0D100E", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 650 }}>화면을 그리는 중 오류가 발생했습니다</div>
        <div style={{ fontSize: 13, color: "#B4BEB5", lineHeight: 1.7, maxWidth: "70ch" }}>
          작업 내용은 디스크에 저장된 것까지 유지됩니다. 다시 시도해도 같은 오류가 나면 아래 내용을 복사해 신고해 주세요.
        </div>
        <pre style={{ fontSize: 11.5, lineHeight: 1.6, color: "#CE9A9A", background: "#151917", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: "40vh", margin: 0, whiteSpace: "pre-wrap" }}>{detail}</pre>
        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={() => this.setState({ err: null, info: "" })}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#0C0E0D", background: "#8FA893", border: "none" }}>다시 시도</button>
          <button onClick={() => { void navigator.clipboard.writeText(detail); }}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#D5DAD5", background: "transparent", border: "1px solid rgba(255,255,255,.14)" }}>오류 내용 복사</button>
          <button onClick={() => window.location.reload()}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#D5DAD5", background: "transparent", border: "1px solid rgba(255,255,255,.14)" }}>새로고침</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
