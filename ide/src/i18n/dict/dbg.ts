// dbg 도메인 번역 사전
export const dict: Record<string, { ko: string; en: string; de: string; ja: string }> = {
  "dbg.run": { ko: "▶ 실행 (F5)", en: "▶ Run (F5)", de: "▶ Ausführen (F5)", ja: "▶ 実行 (F5)" },
  "dbg.continue": { ko: "계속 (F5)", en: "Continue (F5)", de: "Fortsetzen (F5)", ja: "続行 (F5)" },
  "dbg.stepOver": { ko: "스텝오버 (F10)", en: "Step Over (F10)", de: "Überspringen (F10)", ja: "ステップオーバー (F10)" },
  "dbg.stepInto": { ko: "인투 (F11)", en: "Step Into (F11)", de: "Hineinspringen (F11)", ja: "ステップイン (F11)" },
  "dbg.stepOut": { ko: "아웃", en: "Step Out", de: "Herausspringen", ja: "ステップアウト" },
  "dbg.stop": { ko: "■ 정지", en: "■ Stop", de: "■ Stopp", ja: "■ 停止" },
  "dbg.statusStarting": { ko: "시작 중…", en: "Starting…", de: "Wird gestartet…", ja: "開始中…" },
  "dbg.statusRunning": { ko: "실행 중…", en: "Running…", de: "Läuft…", ja: "実行中…" },
  "dbg.statusStopped": { ko: "정지됨 · line {line}", en: "Stopped · line {line}", de: "Angehalten · Zeile {line}", ja: "停止 · 行 {line}" },
  "dbg.callStack": { ko: "콜스택", en: "Call Stack", de: "Aufrufliste", ja: "コールスタック" },
  "dbg.variables": { ko: "변수", en: "Variables", de: "Variablen", ja: "変数" },
  "dbg.breakpoints": { ko: "브레이크포인트", en: "Breakpoints", de: "Haltepunkte", ja: "ブレークポイント" },
  "dbg.breakpointsEmpty": { ko: "거터를 클릭해 추가하세요.", en: "Click the gutter to add one.", de: "Klicken Sie auf die Leiste, um einen hinzuzufügen.", ja: "ガターをクリックして追加してください。" },
  // 조사식 — 멈춘 프레임에서 임의 식의 값을 본다
  "dbg.watch": { ko: "조사식", en: "Watch", de: "Überwachung", ja: "ウォッチ" },
  "dbg.watchAdd": { ko: "식을 입력하고 Enter", en: "Type an expression, press Enter", de: "Ausdruck eingeben, Enter drücken", ja: "式を入力して Enter" },
  "dbg.watchEmpty": { ko: "값을 계속 지켜볼 식을 추가하세요.", en: "Add an expression to keep an eye on.", de: "Fügen Sie einen Ausdruck hinzu, den Sie beobachten möchten.", ja: "値を見張りたい式を追加してください。" },
  "dbg.watchIdle": { ko: "멈춰야 값이 보입니다", en: "value shown when paused", de: "Wert wird beim Anhalten angezeigt", ja: "停止時に値が表示されます" },
  "dbg.console": { ko: "디버그 콘솔", en: "Debug Console", de: "Debug-Konsole", ja: "デバッグコンソール" },
};
