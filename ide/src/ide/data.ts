/** Schutz IDE — 상태 모델·데모 데이터 (디자인 핸드오프 프로토타입의 상태 모델을 그대로 포팅) */

import { t } from "../i18n";

export const TM = "src/auth/token-manager.ts";
export const TY = "src/auth/types.ts";
export const MD = "docs/auth.md";

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

export type LineKind = "base" | "typing" | "fresh" | "pending" | "removed" | "accepted";

export interface DocLine {
  id: string;
  text: string;
  full?: string;
  kind: LineKind;
  hunk: string | null;
}

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

export interface HunkDef {
  path: string;
  agent: string;
  afterId: string;
  removeId?: string;
  lines: string[];
  chip: string;
}

const mk = (pref: string, arr: string[]): DocLine[] =>
  arr.map((t, i) => ({ id: pref + i, text: t, kind: "base", hunk: null }));

export function freshDocs(): Record<string, DocLine[]> {
  return {
    [TM]: mk("tm", [
      'import { AuthClient } from "./client";',
      'import type { TokenPair, TokenManagerOptions } from "./types";',
      "",
      "/** Manages access/refresh token lifecycle. */",
      "export class TokenManager {",
      "  private tokens: TokenPair | null = null;",
      "",
      "  constructor(",
      "    private readonly client: AuthClient,",
      "    private readonly options: TokenManagerOptions = {},",
      "  ) {}",
      "",
      "  async getAccessToken(): Promise<string> {",
      "    if (!this.tokens || this.isExpired()) {",
      "      this.tokens = await this.client.refresh();",
      "    }",
      "    return this.tokens.accessToken;",
      "  }",
      "",
      "  private isExpired(): boolean {",
      "    return this.tokens !== null && Date.now() >= this.tokens.expiresAt;",
      "  }",
      "}",
    ]),
    [TY]: mk("ty", [
      "export interface TokenPair {",
      "  accessToken: string;",
      "  refreshToken: string;",
      "  expiresAt: number;",
      "}",
      "",
      "export interface TokenManagerOptions {",
      "  storage?: TokenStorage;",
      "}",
    ]),
    [MD]: mk("md", [
      "# Auth",
      "",
      "## TokenManager",
      "",
      "액세스/리프레시 토큰의 수명 주기를 관리합니다.",
      "",
      "### Options",
      "",
      "| Option | Description |",
      "| ------ | ----------- |",
      "| `storage` | 커스텀 토큰 저장소 백엔드 |",
    ]),
  };
}

export function hunkDefs(): Record<string, HunkDef> {
  return {
    A: {
      path: TM, agent: "claude", afterId: "tm5",
      lines: ["  private refreshTimer: ReturnType<typeof setTimeout> | null = null;"],
      chip: t("data.chipAddRefreshTimer"),
    },
    C: {
      path: TM, agent: "claude", removeId: "tm14", afterId: "tm14",
      lines: [
        "      this.tokens = await this.client.refresh();",
        "      this.scheduleRefresh();",
      ],
      chip: t("data.chipWireRefreshSchedule"),
    },
    B: {
      path: TM, agent: "claude", afterId: "tm17",
      lines: [
        "",
        "  /**",
        "   * Schedules a token refresh shortly before expiry.",
        "   * Threshold: `options.refreshThreshold` (default 60_000 ms).",
        "   */",
        "  private scheduleRefresh(): void {",
        "    const threshold = this.options.refreshThreshold ?? 60_000;",
        "    const delay = this.tokens!.expiresAt - Date.now() - threshold;",
        "    this.refreshTimer = setTimeout(() => void this.getAccessToken(), Math.max(delay, 0));",
        "  }",
      ],
      chip: t("data.chipAutoRefreshScheduler"),
    },
    T: {
      path: TY, agent: "gpt", afterId: "ty7",
      lines: [
        "  /** Ms before expiry to trigger auto refresh. Default: 60_000. */",
        "  refreshThreshold?: number;",
        "  /** Invoked after every successful refresh. */",
        "  onRefresh?: (tokens: TokenPair) => void;",
      ],
      chip: t("data.chipExtendOptionsType"),
    },
    D: {
      path: MD, agent: "grok", afterId: "md10",
      lines: [
        "| `refreshThreshold` | 만료 전 자동 갱신 시점(ms), 기본 60초 |",
        "| `onRefresh` | 갱신 성공 시 호출되는 콜백 |",
        "",
        "### Auto refresh",
        "",
        "토큰은 만료 60초 전에 자동으로 갱신됩니다.",
      ],
      chip: t("data.chipUpdateDocs"),
    },
  };
}

// [메뉴키, 항목[[액션키, 단축키] | null]] — 라벨은 i18n t("menu."+키)로 렌더, 디스패치는 안정 액션키로.
export const MENUS: [string, ([string, string] | null)[]][] = [
  ["file", [["file.new", "⌘N"], ["file.newWindow", "⇧⌘N"], ["file.openProject", "⌘O"], null, ["file.save", "⌘S"], ["file.saveAll", "⇧⌘S"], null, ["file.settings", "⌘,"]]],
  ["edit", [["edit.undo", "⌘Z"], ["edit.redo", "⇧⌘Z"], null, ["edit.cut", "⌘X"], ["edit.copy", "⌘C"], ["edit.paste", "⌘V"], null, ["edit.find", "⌘F"], ["edit.replace", "⌘H"], null, ["edit.findInFiles", "⇧⌘F"]]],
  ["view", [["view.splitReset", "⌥⌘1"], ["view.split2", "⌥⌘2"], ["view.split4", "⌥⌘4"], null, ["view.format", "⇧⌥F"], ["view.wordWrap", ""], ["view.minimap", ""], null, ["view.problems", ""], ["view.terminal", "⌘`"]]],
  ["nav", [["nav.quickOpen", "⌘P"], ["nav.commandPalette", "⇧⌘P"], ["nav.symbol", "⇧⌘O"]]],
  ["ai", [["ai.models", ""], ["ai.usage", ""], ["ai.mcp", ""]]],
  ["help", [["help.replayOpening", ""], ["help.replayTutorial", ""], ["help.keys", ""], ["help.about", ""]]],
];

export const PROJECTS = [
  { key: "p1", name: "schutz-core", path: "~/dev/schutz-core", current: true, hue: "#8FA893", init: "S" },
  { key: "p2", name: "prism-ui", path: "~/dev/prism-ui", current: false, hue: "#8FA8C0", init: "P" },
  { key: "p3", name: "vault-api", path: "~/dev/vault-api", current: false, hue: "#C4A882", init: "V" },
];
