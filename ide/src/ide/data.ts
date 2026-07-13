/** Schutz IDE — 상태 모델·데모 데이터 (디자인 핸드오프 프로토타입의 상태 모델을 그대로 포팅) */

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
  who?: string;
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
      chip: "Claude · 갱신 타이머 필드 추가",
    },
    C: {
      path: TM, agent: "claude", removeId: "tm14", afterId: "tm14",
      lines: [
        "      this.tokens = await this.client.refresh();",
        "      this.scheduleRefresh();",
      ],
      chip: "Claude · 갱신 예약 연결",
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
      chip: "Claude · 자동 갱신 스케줄러",
    },
    T: {
      path: TY, agent: "gpt", afterId: "ty7",
      lines: [
        "  /** Ms before expiry to trigger auto refresh. Default: 60_000. */",
        "  refreshThreshold?: number;",
        "  /** Invoked after every successful refresh. */",
        "  onRefresh?: (tokens: TokenPair) => void;",
      ],
      chip: "GPT · 옵션 타입 확장",
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
      chip: "Grok · 문서 갱신",
    },
  };
}

export const MENUS: [string, string, ([string, string] | null)[]][] = [
  ["file", "파일", [["새 파일", "⌘N"], ["프로젝트 열기…", "⌘O"], ["최근 프로젝트", "▸"], null, ["저장", "⌘S"], ["모두 저장", "⇧⌘S"], null, ["설정…", "⌘,"]]],
  ["edit", "편집", [["실행 취소", "⌘Z"], ["다시 실행", "⇧⌘Z"], null, ["잘라내기", "⌘X"], ["복사", "⌘C"], ["붙여넣기", "⌘V"], null, ["찾기", "⌘F"], ["바꾸기", "⌘R"]]],
  ["view", "보기", [["도구 창", "▸"], ["외형", "▸"], null, ["에디터 4분할", "⌥⌘4"], ["분할 해제", "⌥⌘1"], null, ["전체 화면", "⌃⌘F"]]],
  ["nav", "이동", [["파일로 이동", "⇧⌘O"], ["심볼로 이동", "⌥⌘O"], ["선언으로 이동", "⌘B"], null, ["마지막 편집 위치", "⇧⌘⌫"]]],
  ["run", "실행", [["실행", "⌃R"], ["디버그", "⌃D"], ["중지", "⌘F2"], null, ["구성 편집…", ""]]],
  ["ai", "AI", [["에이전트 팀 실행", "⌘⏎"], ["모두 일시정지", "⌥⌘."], null, ["모델 관리…", ""], ["사용량 대시보드", "⌘U"], null, ["자동 수락 규칙…", ""]]],
  ["tools", "도구", [["터미널", "⌥F12"], ["버전 관리", "⌘9"], ["HTTP 클라이언트", ""], null, ["플러그인…", ""]]],
  ["help", "도움말", [["단축키 목록", "⌘/"], ["문서", ""], null, ["Schutz 정보", ""]]],
];

export const PROJECTS = [
  { key: "p1", name: "schutz-core", path: "~/dev/schutz-core", current: true, hue: "#8FA893", init: "S" },
  { key: "p2", name: "prism-ui", path: "~/dev/prism-ui", current: false, hue: "#8FA8C0", init: "P" },
  { key: "p3", name: "vault-api", path: "~/dev/vault-api", current: false, hue: "#C4A882", init: "V" },
];
