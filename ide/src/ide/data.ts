/** Schutz IDE — 상태 모델과 정적 표(에이전트 정의·메뉴·프로젝트 목록). */

import { t } from "../i18n";

export interface AgentDef {
  id: string;
  name: string;
  model: string;
  mgr: boolean;
  color: string;
}

export const AGDEF: AgentDef[] = [
  { id: "claude", name: "Claude", model: "Opus 4.5", mgr: true, color: "#8FA893" },
  { id: "gpt", name: "GPT", model: "5.2", mgr: false, color: "#8FA8C0" },
  { id: "grok", name: "Grok", model: "4.1", mgr: false, color: "#C4A882" },
  { id: "glm", name: "GLM", model: "4.6", mgr: false, color: "#A99BC0" },
];

export interface AgentState {
  status: "idle" | "plan" | "edit" | "review" | "stop";
  file: string | null;
  tin: number;
  tout: number;
  cost: number;
}

export interface PlanItem {
  id: string;
  label: string;
  agent: string;
  st: "pending" | "active" | "done" | "stopped";
}

export interface ToolItem {
  id: string;
  agent: string;
  verb: string;
  path: string;
  st: "run" | "done" | "stopped";
  note: string;
  /** 실제 출력 — 에이전트 모드 트랜스크립트에서 도구 줄을 펼치면 나온다.
   *  화면용이라 8KB 에서 자르고 저장하지 않는다(세션은 대화만 담는다). */
  out?: string;
}

export interface ReviewFile {
  path: string;
  add: number;
  del: number;
  agent: string;
  status: "pending" | "accepted" | "rejected";
}

export interface ChatMsg {
  id: string;
  role: "user" | "ai";
  /** 표시용 이름 — 지역화된 문자열이라 판단 근거로 쓰면 안 된다 ("Claude · 관리자") */
  who?: string;
  /** 안정 에이전트 id (AGDEF.id 또는 "schutz"). 필터·색·컨텍스트 분리는 전부 이걸 기준으로.
   *  who 접두어로 역추론하지 말 것 — "Codex · 구독" 은 AGDEF 에 없고 언어가 바뀌면 깨진다.
   *  이 필드가 없는 메시지는 이 필드 도입 이전에 저장된 레거시다. */
  agent?: string;
  text: string;
  streaming?: boolean;
}

/** 무엇 위에 서 있는지. 정보 창과 오프닝이 **같은 문자열**을 쓴다 —
 *  두 군데에 적어두면 하나만 고치고 다른 하나가 옛말이 된다. */
export const ENGINE_CREDIT = "Electron · Monaco · React";

// [메뉴키, 항목[[액션키, 단축키] | null]] — 라벨은 i18n t("menu."+키)로 렌더, 디스패치는 안정 액션키로.
export const MENUS: [string, ([string, string] | null)[]][] = [
  ["file", [["file.new", "⌘N"], ["file.newWindow", "⇧⌘N"], ["file.openProject", "⌘O"], null, ["file.save", "⌘S"], ["file.saveAll", "⇧⌘S"], null, ["file.settings", "⌘,"]]],
  ["edit", [["edit.undo", "⌘Z"], ["edit.redo", "⇧⌘Z"], null, ["edit.cut", "⌘X"], ["edit.copy", "⌘C"], ["edit.paste", "⌘V"], null, ["edit.find", "⌘F"], ["edit.replace", "⌘H"], null, ["edit.findInFiles", "⇧⌘F"]]],
  ["view", [["view.mode", "⇧⌘M"], null, ["view.splitReset", "⌥⌘1"], ["view.split2", "⌥⌘2"], ["view.split4", "⌥⌘4"], null, ["view.format", "⇧⌥F"], ["view.wordWrap", ""], ["view.minimap", ""], null, ["view.problems", ""], ["view.terminal", "⌘`"]]],
  ["nav", [["nav.quickOpen", "⌘P"], ["nav.commandPalette", "⇧⌘P"], ["nav.symbol", "⇧⌘O"]]],
  // 앞 셋은 AI 를 **설정**하는 것이고 가져오기는 **데이터를 들여오는** 것이라 줄로 가른다.
  ["ai", [["ai.models", ""], ["ai.usage", ""], ["ai.mcp", ""], ["ai.plugins", ""], ["ai.engine", ""], ["ai.cloud", ""], null, ["ai.import", ""]]],
  ["help", [["help.replayOpening", ""], ["help.replayTutorial", ""], ["help.keys", ""], null, ["help.update", ""], ["help.about", ""]]],
];

export const PROJECTS = [
  { key: "p1", name: "schutz-core", path: "~/dev/schutz-core", current: true, hue: "#8FA893", init: "S" },
  { key: "p2", name: "prism-ui", path: "~/dev/prism-ui", current: false, hue: "#8FA8C0", init: "P" },
  { key: "p3", name: "vault-api", path: "~/dev/vault-api", current: false, hue: "#C4A882", init: "V" },
];
