import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { App } from "./App";
import { Onboarding } from "./Onboarding";

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
