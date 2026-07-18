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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
