import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { App } from "./App";
import { Onboarding } from "./Onboarding";
import { applyTheme, getThemeId } from "./theme";
import { applyUiFont } from "./settings";
import { applyLang } from "./i18n";
import { applyUiMode, getUiMode } from "./uiMode";

// 첫 페인트 전에 테마/폰트/언어를 적용 — 저장된 Paper(라이트) 등에서 다크 플래시 방지, <html lang> 동기화
// 첫 페인트 전에 모드까지 찍는다 — 없으면 에이전트 모드 사용자가 에디터 레이아웃을
// 한 프레임 보고 지나간다. 여기선 워크스페이스를 모르니 전역 기본값이고, App 이 프로젝트를
// 열면서 그 프로젝트 값으로 다시 맞춘다.
try { applyTheme(getThemeId()); applyUiFont(); applyLang(); applyUiMode(getUiMode()); } catch { /* ignore */ }

const DONE_KEY = "schutz.onboarded";     // 기존 설정 마법사 완료
const OPEN_KEY = "schutz.openingSeen";   // 신규 오프닝 시청 완료

/**
 * 오프닝을 보여줄지. 이미 앱을 써 온 사람에게 첫 실행 영화를 다시 트는 건 명백한
 * 퇴행이라, 온보딩을 마친 흔적이 있으면 본 것으로 친다(1회성 마이그레이션).
 */
function shouldPlayOpening(): boolean {
  try {
    if (localStorage.getItem(OPEN_KEY)) return false;
    if (localStorage.getItem(DONE_KEY)) {           // 기존 사용자 — 조용히 넘긴다
      localStorage.setItem(OPEN_KEY, "1");
      return false;
    }
    return true;
  } catch { return false; }   // localStorage 가 막혀 있으면 연출보다 앱이 뜨는 게 우선
}

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const forceOnboarding = hash.startsWith("#/onboarding");
  // 오프닝은 App 위에 오버레이로 뜬다. 예전엔 App **대신** 렌더했는데, 그러면
  // 데모가 움직일 진짜 UI 가 아직 없다 — 목업을 그릴 수밖에 없었던 이유다.
  const playOpening = hash.startsWith("#/opening") || shouldPlayOpening();

  if (forceOnboarding) {
    return (
      <Onboarding
        onFinish={() => {
          localStorage.setItem(DONE_KEY, "1");
          window.location.hash = "#/";
        }}
      />
    );
  }
  return <App playOpening={playOpening} />;
}

declare const __APP_VERSION__: string | undefined;

/** 렌더 예외 격리 — App 이 단일 대형 컴포넌트라 throw 하나로 창 전체가 백지가 되던 것을 막는다.
 *  창을 잃지 않는 게 목적이므로 UI 는 최소한으로 두되, 원인을 복사·전송할 수 있어야 신고가 가능하다. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null; info: string; sent: boolean }> {
  state: { err: Error | null; info: string; sent: boolean } = { err: null, info: "", sent: false };
  static getDerivedStateFromError(err: Error) { return { err, info: "", sent: false }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    this.setState({ err, info: info.componentStack ?? "" });
    try { console.error("[schutz] 렌더 오류", err, info.componentStack); } catch { /* ignore */ }
  }

  /** 오류를 GitHub 이슈로 전송 — 제목·본문(오류·버전·환경)을 자동으로 채워 브라우저로 연다.
   *  텔레메트리 서버가 없으므로 조용히 보내지 않는다: 사용자가 GitHub 에서 최종 제출한다. */
  private report(detail: string, err: Error) {
    const version = (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev") || "dev";
    const title = `[오류] ${err.name}: ${(err.message || "").slice(0, 120)}`;
    const body = [
      "## 무엇을 하다가 났는지", "<!-- 간단히 적어 주세요 -->", "",
      "## 오류", "```", detail.slice(0, 5000), "```", "",
      "## 환경",
      `- 버전: ${version}`,
      `- User-Agent: ${navigator.userAgent}`,
      `- 언어: ${navigator.language}`,
    ].join("\n");
    const url = "https://github.com/SchutzScript/Schutz/issues/new?labels=bug"
      + "&title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
    // Electron 에선 기본 브라우저로, 웹에선 새 탭으로.
    const schutz = (window as any).schutz;
    if (schutz && schutz.openExternal) void schutz.openExternal(url);
    else window.open(url, "_blank", "noopener");
    this.setState({ sent: true });
  }

  render() {
    const { err, info, sent } = this.state;
    if (!err) return this.props.children;
    const detail = `${err.name}: ${err.message}\n${err.stack ?? ""}\n${info}`;
    return (
      <div style={{ padding: 28, fontFamily: "system-ui, sans-serif", color: "#E4E8E3", background: "#0D100E", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 650 }}>화면을 그리는 중 오류가 발생했습니다</div>
        <div style={{ fontSize: 13, color: "#B4BEB5", lineHeight: 1.7, maxWidth: "70ch" }}>
          작업 내용은 디스크에 저장된 것까지 유지됩니다. 다시 시도해도 같은 오류가 나면 <b>오류 전송</b>을 눌러 신고해 주세요 — 오류 내용과 환경이 자동으로 채워집니다.
        </div>
        <pre style={{ fontSize: 11.5, lineHeight: 1.6, color: "#CE9A9A", background: "#151917", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: "40vh", margin: 0, whiteSpace: "pre-wrap" }}>{detail}</pre>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button onClick={() => this.report(detail, err)}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#0C0E0D", background: "#8FA893", border: "none" }}>{sent ? "다시 전송" : "오류 전송"}</button>
          <button onClick={() => this.setState({ err: null, info: "", sent: false })}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#D5DAD5", background: "transparent", border: "1px solid rgba(255,255,255,.14)" }}>다시 시도</button>
          <button onClick={() => { void navigator.clipboard.writeText(detail); }}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#D5DAD5", background: "transparent", border: "1px solid rgba(255,255,255,.14)" }}>오류 내용 복사</button>
          <button onClick={() => window.location.reload()}
            style={{ height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#D5DAD5", background: "transparent", border: "1px solid rgba(255,255,255,.14)" }}>새로고침</button>
        </div>
        {sent && <div style={{ fontSize: 12, color: "#8FA893" }}>브라우저에서 신고 페이지가 열렸습니다. 내용을 확인하고 제출해 주세요.</div>}
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
