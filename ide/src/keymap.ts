// 전역 단축키 표 — 눌린 키를 **행동 이름**으로 바꾸는 곳.
//
// 예전엔 _onGlobalKey 안에 if/else 사슬로 조건이 흩어져 있었다. 그래서 (1) 사용자가
// 바꿀 수 없었고, (2) 키바인딩 화면은 손으로 적은 치트시트라 실제와 어긋나도 아무도
// 몰랐고, (3) 메뉴가 광고하는 단축키에 핸들러가 없는 일이 반복됐다(Ctrl+Alt+숫자·⇧⌥F).
//
// 이제 표가 하나뿐이다. 화면도 이 표를 그리고, 재정의도 이 표를 덮고, 디스패치도
// 이 표를 본다 — 셋이 어긋날 자리가 없다.
//
// 코드(e.code) 기준인 이유: Alt 를 누르면 e.key 가 다른 문자로 바뀌고, 자판 배열에
// 따라서도 달라진다. 물리 키 위치로 보면 그 둘 다에 흔들리지 않는다.

export type ActionId =
  | "palette.command" | "palette.quick" | "palette.symbol"
  | "search.inFiles" | "editor.find" | "editor.replace" | "editor.outline"
  | "editor.gotoLine" | "editor.format"
  | "file.save" | "file.saveAll" | "file.new" | "window.new" | "project.open"
  | "tabs.mru" | "tabs.mruBack" | "settings.open" | "terminal.toggle" | "mode.toggle"
  | "split.one" | "split.two" | "split.four"
  | "debug.startOrContinue" | "debug.stop" | "debug.stepOver" | "debug.stepIn" | "debug.stepOut"
  | "find.next" | "find.prev"
  | "search.nextHit" | "search.prevHit";

/** i18n 키로 라벨을 만든다 — 표가 언어별 문자열을 들고 있지 않게. */
export interface Binding { id: ActionId; def: string; labelKey: string }

/** 기본 바인딩. def 는 정규화된 코드 문자열(아래 chordOf 와 같은 문법). */
export const BINDINGS: Binding[] = [
  { id: "palette.command", def: "Mod+Shift+P", labelKey: "key.paletteCommand" },
  { id: "palette.quick", def: "Mod+P", labelKey: "key.paletteQuick" },
  { id: "palette.symbol", def: "Mod+T", labelKey: "key.paletteSymbol" },
  { id: "search.inFiles", def: "Mod+Shift+F", labelKey: "key.searchInFiles" },
  // 전역 검색 결과 사이 이동. F3 은 에디터 안 찾기가 쓰므로 VS Code 와 같이 F4 를 쓴다.
  { id: "search.nextHit", def: "F4", labelKey: "key.searchNextHit" },
  { id: "search.prevHit", def: "Shift+F4", labelKey: "key.searchPrevHit" },
  { id: "editor.find", def: "Mod+F", labelKey: "key.find" },
  { id: "editor.replace", def: "Mod+H", labelKey: "key.replace" },
  { id: "find.next", def: "F3", labelKey: "key.findNext" },
  { id: "find.prev", def: "Shift+F3", labelKey: "key.findPrev" },
  { id: "editor.outline", def: "Mod+Shift+O", labelKey: "key.outline" },
  { id: "editor.gotoLine", def: "Mod+G", labelKey: "key.gotoLine" },
  { id: "editor.format", def: "Shift+Alt+F", labelKey: "key.format" },
  { id: "file.save", def: "Mod+S", labelKey: "key.save" },
  { id: "file.saveAll", def: "Mod+Shift+S", labelKey: "key.saveAll" },
  { id: "file.new", def: "Mod+N", labelKey: "key.newFile" },
  { id: "window.new", def: "Mod+Shift+N", labelKey: "key.newWindow" },
  { id: "project.open", def: "Mod+O", labelKey: "key.openProject" },
  { id: "tabs.mru", def: "Mod+Tab", labelKey: "key.cycleTabs" },
  { id: "tabs.mruBack", def: "Mod+Shift+Tab", labelKey: "key.cycleTabsBack" },
  { id: "settings.open", def: "Mod+,", labelKey: "key.settings" },
  { id: "terminal.toggle", def: "Mod+`", labelKey: "key.toggleTerminal" },
  { id: "mode.toggle", def: "Mod+Shift+M", labelKey: "key.toggleMode" },
  { id: "split.one", def: "Mod+Alt+1", labelKey: "key.split1" },
  { id: "split.two", def: "Mod+Alt+2", labelKey: "key.split2" },
  { id: "split.four", def: "Mod+Alt+4", labelKey: "key.split4" },
  { id: "debug.startOrContinue", def: "F5", labelKey: "key.debugStart" },
  { id: "debug.stop", def: "Shift+F5", labelKey: "key.debugStop" },
  { id: "debug.stepOver", def: "F10", labelKey: "key.stepOver" },
  { id: "debug.stepIn", def: "F11", labelKey: "key.stepIn" },
  { id: "debug.stepOut", def: "Shift+F11", labelKey: "key.stepOut" },
];

/** e.code → 화음에 쓸 이름. 모르는 코드는 그대로 둔다(표에 없으면 어차피 안 맞는다). */
export function keyName(code: string, key: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  switch (code) {
    case "Backquote": return "`";
    case "Comma": return ",";
    case "Period": return ".";
    case "Slash": return "/";
    case "Minus": return "-";
    case "Equal": return "=";
    case "Semicolon": return ";";
    case "Quote": return "'";
    case "BracketLeft": return "[";
    case "BracketRight": return "]";
    case "Backslash": return "\\";
    case "Tab": return "Tab";
    case "Space": return "Space";
    case "Enter": return "Enter";
    case "Escape": return "Escape";
    case "Backspace": return "Backspace";
    case "Delete": return "Delete";
    case "Home": return "Home";
    case "End": return "End";
    case "PageUp": return "PageUp";
    case "PageDown": return "PageDown";
    case "ArrowUp": return "Up";
    case "ArrowDown": return "Down";
    case "ArrowLeft": return "Left";
    case "ArrowRight": return "Right";
  }
  // code 를 못 읽는 환경(일부 IME·가상 키보드)에서는 key 로 떨어진다
  return key.length === 1 ? key.toUpperCase() : key;
}

/** 눌린 이벤트를 정규화된 화음 문자열로. 순서는 항상 Mod → Shift → Alt → 키.
 *  (사람이 적는 관례와 같다 — ⇧⌥F 는 "Shift+Alt+F", 뒤집으면 못 알아본다.) */
export function chordOf(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string; key: string }): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(keyName(e.code, e.key));
  return parts.join("+");
}

/** 화음만 누른 상태(모디파이어 키 자체)인지 — 재정의 입력 중에 무시해야 한다. */
export function isModifierOnly(code: string): boolean {
  return /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(code);
}

const KEY = "schutz.keymap";

/** 사용자 재정의만 담는다(기본과 같은 것은 저장하지 않는다 — 기본이 바뀌면 따라가야 하므로). */
export function getOverrides(): Partial<Record<ActionId, string>> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    const known = new Set(BINDINGS.map(b => b.id));
    const out: Partial<Record<ActionId, string>> = {};
    for (const [k, v] of Object.entries(o)) {
      if (known.has(k as ActionId) && typeof v === "string" && v) out[k as ActionId] = v;
    }
    return out;
  } catch { return {}; }
}

export function setOverride(id: ActionId, chord: string | null): void {
  try {
    const cur = getOverrides();
    const def = BINDINGS.find(b => b.id === id)?.def;
    if (chord === null || chord === def) delete cur[id];
    else cur[id] = chord;
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch { /* ignore */ }
}

export function resetOverrides(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** 지금 유효한 화음 (재정의 > 기본) */
export function chordFor(id: ActionId, ov = getOverrides()): string {
  return ov[id] ?? BINDINGS.find(b => b.id === id)?.def ?? "";
}

/** 화음 → 행동. 같은 화음에 둘이 걸리면 **표의 앞선 것**이 이긴다(재정의도 같은 규칙).
 *  충돌을 조용히 두지 않으려면 UI 가 conflictsOf 로 미리 알려 준다. */
export function buildMap(ov = getOverrides()): Map<string, ActionId> {
  const m = new Map<string, ActionId>();
  for (const b of BINDINGS) {
    const c = ov[b.id] ?? b.def;
    if (!m.has(c)) m.set(c, b.id);
  }
  return m;
}

/** 이 화음을 이미 쓰고 있는 다른 행동들 */
export function conflictsOf(chord: string, exclude: ActionId, ov = getOverrides()): ActionId[] {
  return BINDINGS.filter(b => b.id !== exclude && (ov[b.id] ?? b.def) === chord).map(b => b.id);
}

/** 표시용 — Mod 는 플랫폼 이름으로. */
export function displayChord(chord: string, isMac: boolean): string {
  return chord.split("+").map(p => (p === "Mod" ? (isMac ? "Cmd" : "Ctrl") : p)).join("+");
}
