import React from "react";
import {
  AGDEF, MENUS, TM, TY, MD, ENGINE_CREDIT,
  freshDocs, hunkDefs,
  DocLine, AgentState, PlanItem, ToolItem, ReviewFile, ChatMsg,
} from "./ide/data";
import {
  GitBranchIcon, SearchIcon,
  FolderIcon, FlowIcon, TermIcon, GearIcon, TermStatusIcon, DebugIcon, McpIcon, Logo, ModeGlyph,
} from "./icons";
import { FileIcon } from "./fileIcons";
import {
  schutzSystemPrompt, MANAGER_SYSTEM_EXTRA,
  WORKSPACE_TOOLS, DELEGATE_TOOL,
} from "./ai/claude";
import { PROVIDERS_MAP, testProvider, getManagerId, setManagerId } from "./ai/registry";
import { CLAUDE_MODELS, CODEX_MODELS, OPENAI_MODELS, GROK_MODELS, GLM_MODELS, ModelOpt } from "./ai/models";
import { Message, ToolCall, ToolDef, NeutralMsg, AgentProvider, getStoredKey, setStoredKey, getOAuth, setOAuth, getModelOverride, setModelOverride } from "./ai/provider";
import { MonacoPane, paneRegistry } from "./editor/MonacoPane";
import { DiffPane } from "./editor/DiffPane";
import { PreviewPane } from "./editor/PreviewPane";
import { createEngine, DEFAULT_POLICY } from "./engine";
import type { DelegationOutcome, RejectReason, RunRecord, StopCause } from "./engine";
import { XtermView } from "./editor/XtermView";
import { ImagePane, MarkdownPane, isImage, mdToHtml } from "./editor/MediaPane";
import monaco from "./editor/monacoSetup";
import * as projectModels from "./editor/projectModels";
import { typeEdit, reducedMotion } from "./editor/editAnimator";
import * as lspClient from "./editor/lspClient";
import * as lspConv from "./editor/lspConverters";
import * as dap from "./debug/dapClient";
import * as extHost from "./ext/extHost";
import * as vscodeExt from "./ext/vscodeExt";
import * as iconTheme from "./ext/iconTheme";
import * as textmate from "./ext/textmate";
import * as mcp from "./mcp/mcpClient";
import * as mcpGen from "./mcp/generator";
import { registerLspProviders } from "./editor/lspProviders";
import { setThemeId, THEME_TOKENS, monacoThemeOf } from "./theme";
import { applyTheme, getThemeId } from "./theme";
// (setThemeId, THEME_TOKENS, monacoThemeOf 는 아래 editor import 라인에서 가져옴)
import {
  getEditorPrefs, setEditorPrefs, getAutonomy, setAutonomy, applyUiFont, autoAcceptFor,
  CODE_FONTS, UI_FONTS, KEYMAPS, EditorPrefs,
  getActiveVsxTheme, setActiveVsxTheme, getActiveIconTheme, setActiveIconTheme,
} from "./settings";
import { t, t as t2, getLang, setLang, LANGS, onLangChange } from "./i18n";
import { flushSync } from "react-dom";
import { buildTimeline } from "./agentTimeline";
import { carryOver, groupByDay, parseIndex, prune, titleFrom, upsert, type ConvMeta } from "./conversations";
import { CLI_HEAD_BYTES, CLI_MSG_CAP, CLI_TAIL_BYTES, parseBody, parseHead, type CliAgent } from "./cliChats";

/** 렌더 메서드 밖에서 모드를 묻는 자리 — render() 의 지역 변수 ag 를 쓸 수 없다. */
const ag2 = (s: { uiMode: UiMode }) => s.uiMode === "agent";
import { getUiMode, setUiMode, applyUiMode, switchUiMode, UI_MODES, type UiMode } from "./uiMode";
import { TOUR_STEPS, anchorRect, cardPos, visibleSteps, visiblePos } from "./tour";
import { TourFigure, type FigureRegion } from "./tourFigure";
import { Opening } from "./opening/Opening";
import {
  DEMO_STEPS, DEMO_FILE, DEMO_FIND, DEMO_REPLACE, TYPE_INTERVAL_MS,
  DEMO_TYPE_SLOWDOWN, DEMO_ZOOM_FONT, DEMO_ZOOM_MS, DEMO_CMD, DEMO_CMD_OUT,
} from "./opening/demoScript";
import type { TourHost } from "./tour";

/** 에이전트가 제안한 실파일 편집 (수락 전까지 디스크 미반영) */
interface InlineRange { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
/** 가져오기 목록 한 줄. 파일 **앞부분**만 읽어 채운 것이라 본문은 아직 없다. */
interface ImpRow {
  agent: CliAgent;
  /** 절대 경로. 열 때 그대로 돌려주고, 메인이 알려진 디렉터리 안인지 다시 검사한다. */
  file: string;
  title: string;
  /** 그 대화가 돌던 폴더. 지금 워크스페이스와 맞춰 "이 프로젝트만" 을 거른다. */
  cwd: string;
  bytes: number;
  updatedAt: number;
}

interface Proposal {
  id: string;
  rel: string;
  find: string;
  replace: string;
  rationale: string;
  agent: string;
  status: "pending" | "accepted" | "rejected" | "failed";
  error?: string;
  /** 자율성 정책으로 자동 수락됨 */
  auto?: boolean;
  /** 인라인 편집(Ctrl+K) 선택 범위 — 있으면 텍스트 검색 대신 이 정확 범위로 적용(non-unique 선택 대응) */
  range?: InlineRange;
}

// 설정 폰트가 전 UI에 전파되도록 CSS 변수를 참조(applyUiFont가 --font-ui/--font-code 설정).
// 심볼·이모지 폴백 포함(장식 글리프 tofu 방지).
const MONO = "var(--font-code,'IBM Plex Mono','Yu Gothic UI','Meiryo','Segoe UI Symbol','Segoe UI Emoji',monospace)";
const SUIT = "var(--font-ui,'SUIT Variable','Yu Gothic UI','Meiryo','Segoe UI Symbol','Segoe UI Emoji',sans-serif)";

const APP_VERSION = "0.0.3";
// 좌측 컬럼 세로 분할의 하한. 대화는 제목·탭·입력창만 130px 가량 먹어서
// 이보다 낮추면 메시지가 한 줄도 안 남는다.
const CHAT_MIN_H = 180;
const TREE_MIN_H = 120;

/** 맥 단축키 글리프(⌘⇧⌥)를 플랫폼에 맞게 표기 — Windows/Linux에서는 Ctrl/Shift/Alt 텍스트로 */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
function accel(s: string): string {
  if (!s || IS_MAC) return s;
  const hasCtrl = s.includes("⌘") || s.includes("⌃");
  const hasAlt = s.includes("⌥");
  const hasShift = s.includes("⇧");
  const key = s.replace(/[⌘⌃⇧⌥]/g, "");
  return [hasCtrl && "Ctrl", hasAlt && "Alt", hasShift && "Shift", key].filter(Boolean).join("+");
}

interface S {
  statusKey: "idle" | "thinking" | "tool" | "review" | "stopped";
  running: boolean;
  /** 실행 진행도 0..1 — 진행 빔이 읽는다. plan 이 비어도(실제 실행) 라운드로 채운다. */
  runProgress: number;
  messages: ChatMsg[];
  input: string;
  plan: PlanItem[];
  tools: ToolItem[];
  files: ReviewFile[];
  docs: Record<string, DocLine[]>;
  chips: Record<string, { text: string; op: number }>;
  /** 슬롯별 열린 탭 (rel 목록). 길이 = layout */
  tabs: string[][];
  /** 닫히는 중인 탭 (`slot:rel` 키) — szTabOut 재생 후 제거 */
  closingTabs: string[];
  /** 슬롯별 활성 rel ("" = 빈 슬롯). 길이 = layout */
  active: string[];
  leftTab: "flow" | "tree" | "git" | "debug" | "ext";
  /** 확장: 로드된 커맨드 · 관리 목록 · 기여 패널 */
  extCommands: import("./ext/extHost").ExtCommand[];
  extList: import("./ext/extHost").ExtInfo[];
  /** 마지막 확장 로드의 하드 오류 ("확장이름: 메시지") — 확장이 아무 기여도 못한 경우 */
  extErrors: string[];
  /** activate 는 실패했지만 선언형 기여(테마/아이콘/문법)는 정상인 "기능 제한" 확장 */
  extLimited: { id: string; name: string; reason: string }[];
  extPanel: { title: string; html: string } | null;
  /** VS Code 확장 — 가져온 테마 · 아이콘테마 · Open VSX 마켓 검색 */
  extThemes: import("./ext/vscodeExt").ImportedTheme[];
  extIconThemes: { extId: string; label: string; path: string }[];
  iconVer: number;
  extSearch: string;
  extResults: { namespace: string; name: string; version: string; displayName: string; description: string; downloadCount: number; rating: number; icon: string }[];
  extBusy: boolean;
  extInstalling: string[];
  /** 확장 상세(정보) 뷰 */
  extDetail: any | null;
  extDetailBusy: boolean;
  /** 디버그: 파일별 브레이크포인트(1-based 라인) */
  breakpoints: Record<string, number[]>;
  /** 디버그 세션 상태 */
  debug: DebugState | null;
  /** 디버그 콘솔 출력 라인 */
  debugConsole: string[];
  /** Git 상태 (소스 컨트롤 패널) */
  git: GitStatus | null;
  gitMsg: string;
  gitBusy: boolean;
  gitError: string;
  /** Git 브랜치·로그 */
  gitBranches: string[];
  gitLog: { hash: string; author: string; date: string; subject: string }[];
  branchOpen: boolean;
  newBranch: string;
  /** 채팅 컨텍스트 첨부 (@파일 / 현재 선택) */
  attach: AttachRef[];
  attachPickerOpen: boolean;
  attachQuery: string;
  expanded: string | null;
  openMenu: string | null;
  projOpen: boolean;
  agentsOpen: boolean;
  reviewOpen: boolean;
  termOpen: boolean;
  /** 도크가 마운트된 다음 프레임에 true — 첫 열기도 0→210 으로 움직이게 하는 래치 */
  termReady: boolean;
  /** 활성 터미널 탭 id, 또는 "ai"(AI 로그) */
  termTab: string;
  /** 채팅 탭 — "all" 또는 에이전트 id */
  chatTab: string;
  /** 사용자가 위로 올려 읽는 중 — "최신으로" 버튼을 띄운다 */
  chatAway: boolean;
  /** 에이전트별 잔여 할당량 (구독 경로에서 금액 대신 보여주는 값) */
  quota: Record<string, QuotaInfo>;
  /** 실행 승인 대기 중인 명령 (수동 정책일 때) */
  askRun: { command: string; rationale: string; agent: string } | null;
  /** 제안 카드에서 diff 를 펼친 것 (id → true) */
  openDiffs: Record<string, boolean>;
  /** 트랜스크립트에서 펼친 도구 줄 */
  openTools: Record<string, boolean>;
  /** 에이전트 모드에서 코드를 잠깐 띄운 상태 — "필요할 때만 떠오름" */
  sheetOpen: boolean;
  /** 지금 보고 있는 대화 id. 워크스페이스를 열 때 정해진다. */
  convId: string | null;
  /** 사이드바 아래쪽에 무엇을 보이는지 — 최근 항목이 기본. */
  asideTab: "recents" | "artifacts";
  /** 지난 대화 가져오기 화면. 목록은 열 때 읽고 닫으면 버린다 — 839개 줄을 계속 들고 있을 이유가 없다. */
  impOpen: boolean;
  impRows: ImpRow[] | null;
  impThisOnly: boolean;
  /** 어느 도구에서 온 것만 볼지. "all" = 전부. */
  impAgent: "all" | CliAgent;
  /** 지금 가져오는 중인 파일. 두 번 누르는 걸 막고 그 줄에만 표시를 낸다. */
  impBusy: string | null;
  /** 에이전트 모드 오른쪽 산출물 패널 폭(px). 드래그로 바뀌고 저장된다. */
  agentSideW: number;
  /** 열린 터미널 탭들 (멀티 터미널) */
  // 번호만 들고 있고 제목은 렌더에서 만든다. 예전엔 만들 때 t() 로 굳혀서, 언어를 바꿔도
  // 탭 이름만 옛말로 남았다 — 이 배열은 어디에도 저장되지 않으니 모양을 바꿔도 안전하다.
  terms: { id: string; n: number }[];
  agents: Record<string, AgentState>;
  /** 실제로 연 프로젝트 폴더 (Electron 전용). null이면 데모 모드 */
  workspace: SchutzWorkspaceTree | null;
  paneDirty: Record<string, boolean>;
  /** Claude의 실파일 편집 제안 */
  proposals: Proposal[];
  /** 수락 후 Monaco 페인 강제 리로드용 버전 */
  paneVer: Record<string, number>;
  /** 간이 터미널 출력 (Electron) */
  termReal: string;
  termInput: string;
  settingsOpen: boolean;
  /** 설정 모달 활성 섹션 탭 */
  /** UI 대시보드/모달 (채팅 대신) */
  aboutOpen: boolean;
  usageOpen: boolean;
  keysOpen: boolean;
  commandsOpen: boolean;
  /** Claude Code · Codex 에서 발견한 커스텀 명령 */
  agentCommands: DiscoveredCmd[];
  /** MCP 관리 패널 */
  mcpOpen: boolean;
  mcpServers: mcp.McpServerInfo[];
  mcpDiscovered: { name: string; source: string; command: string; args: string[]; env: Record<string, string>; url: string | null; added: boolean }[];
  mcpBusy: string;               // 진행 중 작업 라벨 (서버명 등)
  mcpJson: string;               // JSON 붙여넣기 추가
  mcpGen: null | { mode: "cli" | "project" | "openapi" | "generic"; input: string; status: string; };
  /** 사용법 스포트라이트 투어 */
  tourOpen: boolean;
  /** 오프닝 오버레이 국면. off=안 뜸, intro=마크·선언·세팅, outro=마무리 */
  openingPhase: "off" | "intro" | "outro";
  /** 데모 진행 중 하단 자막 키. null 이면 자막 없음 */
  demoCaption: string | null;
  /** 시연이 도는 중. 자막과 **수명이 다르다** — 자막은 박자마다 갈리지만 건너뛰기 버튼은
   *  시연 내내 같은 노드로 살아 있어야 한다(아래 렌더 주석 참고). */
  demoRunning: boolean;
  tourStep: number;
  /** 닫히는 중인 오버레이 키(나가는 애니메이션 후 언마운트) */
  closing: string[];
  /** 설정 모달의 프로바이더별 연결 테스트 결과 */
  testMsg: Record<string, string>;
  /** 에디터 분할 수 (1 | 2 | 4) */
  layout: number;
  oauthPasteFor: string | null;
  oauthPasteVal: string;
  oauthWait: boolean;
  oauthMsg: string;
  oauthTick: number;
  slashSel: number;
  /** Ctrl+P 퀵오픈 */
  quickOpen: boolean;
  quickQuery: string;
  quickSel: number;
  /** Ctrl+T 워크스페이스 심볼 이동 */
  symOpen: boolean;
  symQuery: string;
  symSel: number;
  symLoading: boolean;
  symResults: { name: string; container: string; kind: number; uri: string; range: import("monaco-editor").IRange }[];
  /** Ctrl+Shift+F 전역 텍스트 검색 */
  searchOpen: boolean;
  searchQuery: string;
  searchResults: SearchHit[];
  searchSel: number;
  searchBusy: boolean;
  searchTruncated: boolean;
  /** 미저장 탭 닫기 확인 */
  askClose: { rel: string; slot: number } | null;
  /** 진단(문제 패널) */
  problems: ProblemItem[];
  tsLargeProject: boolean;
  /** Ctrl+Shift+P 커맨드 팔레트 */
  cmdOpen: boolean;
  cmdQuery: string;
  cmdSel: number;
  /** 모델 피커가 열린 에이전트 id (null=닫힘) */
  modelPickFor: string | null;
  /** 비차단 토스트 */
  toasts: ToastItem[];
  /** 좌·우 패널 폭 (드래그 리사이즈) */
  leftW: number;
  rightW: number;
  chatH: number;
  /** 이 창이 어떤 모양으로 서 있는지. getUiMode() 를 렌더에서 매번 읽지 않고 state 로 드는 이유는
   *  componentDidUpdate 가 모드 변화를 보고 Monaco 를 다시 레이아웃해야 하기 때문이다. */
  uiMode: UiMode;
  /** 마크다운 미리보기 중인 rel 집합 */
  mdPreview: Record<string, boolean>;
  /** 찾기·바꾸기 모드(검색 오버레이) */
  replaceOpen: boolean;
  replaceVal: string;
  searchOpts: { regex: boolean; caseSensitive: boolean; wholeWord: boolean; include: string; exclude: string };
  /** Ctrl+Tab MRU 오버레이 */
  mruOpen: boolean;
  mruSel: number;
  /** 접힌 트리 디렉터리 */
  collapsed: Record<string, boolean>;
  /** 상태바 실정보 (포커스된 에디터) */
  statusInfo: { rel: string; lang: string; line: number; col: number } | null;
  /** 트리 우클릭 메뉴 */
  ctxMenu: { x: number; y: number; rel: string; isDir: boolean } | null;
  /** 구독 CLI 에이전트 감지 결과 (claude/codex) */
  cliAgents: Record<string, { ok: boolean; version: string; hasConfig: boolean }>;
  cliBusy: boolean;
  /** CLI(stream-json init)가 보고한 실제 모델 */
  cliModel: string;
}

/** 전역 텍스트 검색 히트 */
interface SearchHit { rel: string; line: number; col: number; preview: string }

/** 진단(문제 패널) 항목 */
interface ProblemItem { rel: string; line: number; col: number; message: string; severity: number }

/** 커맨드 팔레트 액션 */
interface Command { id: string; label: string; hint?: string; run: () => void }

/** 비차단 토스트 알림 */
interface ToastItem { id: string; kind: "info" | "error" | "ok"; text: string; leaving?: boolean }

/** 채팅에 첨부하는 컨텍스트 참조 */
interface AttachRef { kind: "file" | "selection"; rel: string; text?: string; label: string }

/** Git 변경 항목 */
interface GitEntry { path: string; code: string }
interface GitStatus {
  branch: string | null; ahead: number; behind: number; upstream: boolean; notRepo?: boolean;
  staged: GitEntry[]; unstaged: GitEntry[]; untracked: GitEntry[];
}

/** 디버그 세션 상태 */
interface DebugScope { name: string; ref: number; vars: { name: string; value: string; type?: string; ref: number }[]; expanded: boolean }
interface DebugState {
  status: "starting" | "running" | "stopped";
  threadId: number | null;
  frames: { id: number; name: string; line: number; path: string }[];
  frameId: number | null;
  scopes: DebugScope[];
  stoppedRel: string | null;
  stoppedLine: number | null;
}

/** 슬래시 명령 레지스트리 — origin별로 실행 경로가 다르다 */
interface SlashCmd { cmd: string; origin: "schutz" | "claude" | "codex"; desc: string; kind?: "local" | "forward"; argHint?: string }
interface DiscoveredCmd { name: string; origin: "claude" | "codex"; scope: "user" | "project"; description: string; argHint: string; body: string }
const SLASH_COMMANDS: SlashCmd[] = [
  // ── Schutz 로컬 (기존 기능에 매핑) — desc/argHint 는 i18n 키(렌더 시 t()) ──
  { cmd: "/help", origin: "schutz", kind: "local", desc: "slash.help" },
  { cmd: "/model", origin: "schutz", kind: "local", desc: "slash.model", argHint: "slash.argAgentModel" },
  { cmd: "/usage", origin: "schutz", kind: "local", desc: "slash.usage" },
  { cmd: "/cost", origin: "schutz", kind: "local", desc: "slash.usage" },
  { cmd: "/agents", origin: "schutz", kind: "local", desc: "slash.agents" },
  { cmd: "/clear", origin: "schutz", kind: "local", desc: "slash.clear" },
  { cmd: "/new", origin: "schutz", kind: "local", desc: "slash.new" },
  { cmd: "/settings", origin: "schutz", kind: "local", desc: "slash.settings" },
  { cmd: "/config", origin: "schutz", kind: "local", desc: "slash.settings" },
  { cmd: "/keys", origin: "schutz", kind: "local", desc: "slash.keys" },
  { cmd: "/vim", origin: "schutz", kind: "local", desc: "slash.vim" },
  { cmd: "/theme", origin: "schutz", kind: "local", desc: "slash.theme" },
  { cmd: "/preview", origin: "schutz", kind: "local", desc: "slash.preview", argHint: "slash.argUrl" },
  { cmd: "/terminal", origin: "schutz", kind: "local", desc: "slash.terminal" },
  { cmd: "/diff", origin: "schutz", kind: "local", desc: "slash.diff" },
  { cmd: "/git", origin: "schutz", kind: "local", desc: "slash.git" },
  { cmd: "/resume", origin: "schutz", kind: "local", desc: "slash.resume" },
  { cmd: "/continue", origin: "schutz", kind: "local", desc: "slash.resume" },
  { cmd: "/doctor", origin: "schutz", kind: "local", desc: "slash.doctor" },
  { cmd: "/status", origin: "schutz", kind: "local", desc: "slash.status" },
  { cmd: "/login", origin: "schutz", kind: "local", desc: "slash.login", argHint: "<claude|codex>" },
  { cmd: "/logout", origin: "schutz", kind: "local", desc: "slash.logout", argHint: "<claude|codex>" },
  { cmd: "/memory", origin: "schutz", kind: "local", desc: "slash.memory" },
  // (/mcp 는 상단 AI 메뉴·타이틀바 버튼으로 이동 — 슬래시 팔레트에는 노출하지 않되 핸들러는 alias 로 유지)
  // ── CLI 포워딩 (콘텐츠 생성) ──
  { cmd: "/init", origin: "claude", kind: "forward", desc: "slash.initClaude" },
  { cmd: "/review", origin: "claude", kind: "forward", desc: "slash.review" },
  { cmd: "/security-review", origin: "claude", kind: "forward", desc: "slash.securityReview" },
  { cmd: "/pr-comments", origin: "claude", kind: "forward", desc: "slash.prComments" },
  { cmd: "/compact", origin: "claude", kind: "forward", desc: "slash.compact" },
  { cmd: "/init", origin: "codex", kind: "forward", desc: "slash.initCodex" },
  { cmd: "/review", origin: "codex", kind: "forward", desc: "slash.reviewCodex" },
  { cmd: "/compact", origin: "codex", kind: "forward", desc: "slash.compact" },
];
const ORIGIN_LABEL: Record<string, string> = { schutz: "Schutz", claude: "Claude Code", codex: "Codex" };
const ORIGIN_COLOR: Record<string, string> = { schutz: "var(--accent)", claude: "#C4A882", codex: "#8FA8C0" };

const TYPING_SPEED = 1;
const SHOW_REASONS = true;
const AUTOPLAY = true;

/** playOpening: 첫 실행(또는 #/opening) — 오프닝 오버레이를 띄우고 데모를 돈다 */
export class App extends React.Component<{ playOpening?: boolean }, S> {
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _uid = 0;
  private _paneRefs: Record<string, HTMLDivElement | null> = {};
  private _chat: HTMLDivElement | null = null;
  private _chatSig = "";
  /** 에이전트 id → 프로바이더 (Claude/GPT/Grok/GLM) */
  private providers: Record<string, AgentProvider> = PROVIDERS_MAP;
  private history: Message[] = [];
  /**
   * 위임 엔진 — 실행 레지스트리 + 위임 원장 + 정책.
   * 순수 모듈이라 여기서 상태만 얹어 쓴다 (src/engine, 테스트는 npm test).
   */
  private engine = createEngine();
  /**
   * 진행 중 턴 취소 컨트롤러 — **runId 로 키잉**한다.
   * 예전엔 agentId 키였고 그게 중지→재위임 레이스의 뿌리였다: stopAgent 가
   * 컨트롤러를 먼저 지우면 죽어가는 루프의 finally 가 같은 agentId 로 새로 시작된
   * 실행을 정리해 버렸다(락 해제·상태 덮어쓰기). 이제 실행마다 고유 키를 갖는다.
   */
  private abortCtls = new Map<string, AbortController>();
  /**
   * 파일 락: rel → 잡고 있는 **runId**.
   * agentId 로 잡으면 낡은 실행의 정리가 같은 에이전트의 새 실행 락을 풀어 버린다.
   */
  private fileLocks = new Map<string, string>();

  state: S = {
    statusKey: "idle", running: false, runProgress: 0, messages: [], input: "",
    plan: [], tools: [], files: [], docs: window.schutz ? {} : freshDocs(), chips: {}, // 데스크톱엔 데모 문서를 심지 않는다(실제 파일을 가림)
    tabs: [[TM]], active: [TM], leftTab: "flow", expanded: null,
    breakpoints: {}, debug: null, debugConsole: [],
    extCommands: [], extList: [], extErrors: [], extLimited: [], extPanel: null, extThemes: [], extIconThemes: [], iconVer: 0, extSearch: "", extResults: [], extBusy: false, extInstalling: [], extDetail: null, extDetailBusy: false,
    git: null, gitMsg: "", gitBusy: false, gitError: "",
    gitBranches: [], gitLog: [], branchOpen: false, newBranch: "",
    attach: [], attachPickerOpen: false, attachQuery: "",
    openMenu: null, projOpen: false,
    agentsOpen: true, reviewOpen: true,
    termOpen: false, termReady: false, termTab: "t1", chatTab: "all", chatAway: false, openDiffs: {}, openTools: {}, sheetOpen: false, convId: null, asideTab: "recents",
    impOpen: false, impRows: null, impThisOnly: true, impBusy: null, impAgent: "all",
    agentSideW: (() => { try { return Math.max(360, Math.min(1100, +(localStorage.getItem("schutz.agentSideW") || 620))); } catch { return 620; } })(), quota: {}, askRun: null, terms: [{ id: "t1", n: 1 }],
    agents: this.freshAgents(),
    workspace: null, paneDirty: {},
    proposals: [], paneVer: {},
    termReal: "", termInput: "", settingsOpen: false, aboutOpen: false, usageOpen: false, keysOpen: false, commandsOpen: false, agentCommands: [], mcpOpen: false, mcpServers: [], mcpDiscovered: [], mcpBusy: "", mcpJson: "", mcpGen: null, tourOpen: false, tourStep: 0, openingPhase: "off", demoCaption: null, demoRunning: false, closing: [], closingTabs: [], testMsg: {},
    layout: (() => {
      const m = /[?&]layout=(\d)/.exec(window.location.search);
      if (m) { const v = parseInt(m[1], 10); return v === 2 ? 2 : v === 4 ? 4 : 1; }
      // 데스크톱은 단일 그룹(탭 스택)으로 시작, 웹 데모는 4분할 시각화
      return window.schutz ? 1 : 4;
    })(),
    cliAgents: {}, cliBusy: false, cliModel: "",
    oauthPasteFor: null, oauthPasteVal: "", oauthWait: false, oauthMsg: "", oauthTick: 0,
    slashSel: 0,
    quickOpen: false, quickQuery: "", quickSel: 0,
    symOpen: false, symQuery: "", symSel: 0, symLoading: false, symResults: [],
    searchOpen: false, searchQuery: "", searchResults: [], searchSel: 0, searchBusy: false, searchTruncated: false,
    askClose: null,
    problems: [], tsLargeProject: false,
    cmdOpen: false, cmdQuery: "", cmdSel: 0, modelPickFor: null,
    toasts: [],
    leftW: (() => { try { return Math.max(200, Math.min(520, +(localStorage.getItem("schutz.leftW") || 272))); } catch { return 272; } })(),
    uiMode: getUiMode(),   // 워크스페이스는 아직 없다 — 전역 기본값. 열릴 때 프로젝트 값으로 다시 맞춘다
    rightW: (() => { try { return Math.max(240, Math.min(600, +(localStorage.getItem("schutz.rightW") || 336))); } catch { return 336; } })(),
    // 대화 높이. 예전엔 트리와 대화가 둘 다 flex:1 이라 50/50 으로 고정이었다.
    chatH: (() => { try { return Math.max(CHAT_MIN_H, +(localStorage.getItem("schutz.chatH") || 360)); } catch { return 360; } })(),
    mdPreview: {}, replaceOpen: false, replaceVal: "",
    searchOpts: { regex: false, caseSensitive: false, wholeWord: false, include: "", exclude: "" },
    mruOpen: false, mruSel: 0,
    collapsed: {}, statusInfo: null, ctxMenu: null,
  };

  /** 새 파일이 열릴 슬롯 (포커스 추종) */
  private _focusSlot = 0;
  /** 탭 접근 순서 (MRU, 최근 우선) */
  private _tabMRU: string[] = [];
  private _touchMru(rel: string) {
    if (!rel || this.parseDiffKey(rel)) return;
    this._tabMRU = [rel, ...this._tabMRU.filter(r => r !== rel)].slice(0, 30);
  }

  /** 모든 슬롯에 열린 rel의 합집합 (하이라이트·리로드용) */
  private allOpen(s: S = this.state): string[] {
    const set = new Set<string>();
    s.tabs.forEach(t => t.forEach(r => set.add(r)));
    return [...set];
  }
  private isOpen(rel: string, s: S = this.state): boolean {
    return s.tabs.some(t => t.includes(rel));
  }
  /** tabs/active를 layout 길이에 맞게 정규화 (축소 시 넘치는 탭은 마지막 슬롯으로 병합) */
  private normSlots(tabs: string[][], active: string[], layout: number): { tabs: string[][]; active: string[] } {
    let t = tabs.map(x => [...x]);
    let a = [...active];
    if (t.length > layout) {
      const dropped = t.slice(layout).flat();
      t = t.slice(0, layout);
      a = a.slice(0, layout);
      const last = Math.max(0, layout - 1);
      for (const r of dropped) if (!t[last].includes(r)) t[last].push(r);
    }
    while (t.length < layout) { t.push([]); a.push(""); }
    a = a.map((x, i) => (t[i].includes(x) ? x : (t[i][t[i].length - 1] ?? "")));
    return { tabs: t, active: a };
  }

  // ── 파일 작업 (트리 우클릭·메뉴) ──
  async saveAll() {
    for (const p of paneRegistry.panes.values()) await p.save();
    // 열려있지 않은 모델(크로스파일 리네임 등)도 디스크에 반영
    await this.saveAllDirtyModels(true);
  }

  /** Ctrl+S — 포커스된 팬이 있으면 그것만, 없으면 미저장 모델 전부.
   *
   *  paneRegistry.focused 는 사용자가 팬 안을 **실제로 클릭했을 때만** 세팅된다
   *  (onDidFocusEditorWidget). 그래서 `paneRegistry.focused?.save()` 하나만 두면,
   *  트리에서 파일을 골라 열기만 한 상태나 크로스파일 이름 바꾸기 직후처럼 팬이
   *  포커스를 받은 적 없는 흔한 상황에서 Ctrl+S 가 아무 일도 안 하고 아무 말도 안 했다. */
  async saveActive() {
    const p = paneRegistry.focused;
    if (p) { await p.save(); return; }
    const n = await this.saveAllDirtyModels(true);
    if (n > 0) this.toast("ok", t("sc1.savedN", { n }));
  }

  /** projectModels의 미저장 모델(열린 파일 포함) 전부 디스크 저장 — 크로스파일 리네임 반영 */
  async saveAllDirtyModels(silent = false): Promise<number> {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return 0;
    const rels = projectModels.dirtyRels();
    let n = 0;
    const failed: string[] = [];
    for (const rel of rels) {
      const m = projectModels.getByRel(rel);
      if (!m) continue;
      const content = m.getValue();
      // 외부에서 바뀐 파일은 모두 저장에서 조용히 덮어쓰지 않는다
      const ext = projectModels.externalChangeOf(rel);
      if (ext !== null && ext !== content) {
        if (silent || !window.confirm(t("sc1.externalChangedOverwrite", { rel }))) { failed.push(rel + " (" + t("sc1.externalChangedSkipped") + ")"); continue; }
      }
      try {
        await window.schutz.writeFile(ws.root, rel, content);
        projectModels.markSaved(ws.root, rel, content);
        this.setState(st => ({ paneDirty: { ...st.paneDirty, [rel]: false } }));
        n++;
      } catch (e) {
        // 저장 실패를 삼키면 "N개 저장" 이 그냥 작은 N 이 되어 사용자가 유실을 눈치채지 못한다
        failed.push(rel + (e instanceof Error ? ` (${e.message})` : ""));
      }
    }
    if (n > 0) { await this.refreshWorkspace(); if (!silent) this.toast("ok", t("sc1.n_files_saved", { n })); }
    if (failed.length) this.toast("error", t("sc1.save_failed_files", { n: failed.length, files: failed.join(", ") }));
    return n;
  }

  /** 심볼 이름 바꾸기 (F2) — 완료 후 크로스파일 변경까지 자동 저장 */
  triggerRename() {
    const ed = paneRegistry.focused?.editor;
    if (!ed) { this.toast("info", t("sc1.put_cursor_on_symbol")); return; }
    ed.focus();
    const before = projectModels.dirtyRels().length;
    void ed.getAction("editor.action.rename")?.run();
    // 리네임 편집이 적용되면(dirty 증가) 잠시 후 자동 저장
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const now = projectModels.dirtyRels().length;
      if (now > before) { clearInterval(iv); setTimeout(() => void this.saveAllDirtyModels(), 500); }
      else if (tries > 60) clearInterval(iv); // ~30s 타임아웃
    }, 500);
  }
  /** 정의로 이동 (F12) / 참조 찾기 (Shift+F12) */
  private triggerEditorAction(actionId: string) {
    const ed = paneRegistry.focused?.editor;
    if (!ed) return;
    ed.focus();
    void ed.getAction(actionId)?.run();
  }

  // ── 토스트 ──
  /** 토스트 전용 타이머. 탭 닫기와 같은 이유로 _timers 풀 밖에 둔다 —
   *  clearTimers()(startRun/stopRun)가 이 타이머를 지우면 토스트가 제거되지 않고
   *  좀비로 남는다(leaving 상태로 opacity 0 인 채 마운트된 유령). */
  private _toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  toast(kind: ToastItem["kind"], text: string) {
    const id = "to" + (this._uid++);
    this.setState(s => ({ toasts: [...s.toasts, { id, kind, text }] }));
    this._toastTimers.set(id, setTimeout(() => this.dismissToast(id), 3600));
  }
  /** 나가는 애니메이션 후 제거. exit 애니메이션(280ms)이 끝난 뒤 언마운트해야
   *  페이드가 중간에 잘리지 않는다(예전 220ms 는 애니메이션보다 짧아 툭 사라졌다). */
  dismissToast(id: string) {
    clearTimeout(this._toastTimers.get(id));
    this.setState(s => ({ toasts: s.toasts.map(t => t.id === id ? { ...t, leaving: true } : t) }));
    this._toastTimers.set(id, setTimeout(() => {
      this._toastTimers.delete(id);
      this.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 300));
  }

  async newFileAt(dirRel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const name = window.prompt(t("sc1.new_file_name"), "untitled.md");
    if (!name) return;
    const rel = dirRel ? dirRel + "/" + name : name;
    try {
      await window.schutz.writeFile(ws.root, rel, "");
      await this.refreshWorkspace();
      this.openFile(rel);
      this.toast("ok", t("sc1.file_created") + name);
    } catch (e) { this.toast("error", t("sc1.create_failed") + (e instanceof Error ? e.message : String(e))); }
  }

  async newFolderAt(dirRel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const name = window.prompt(t("sc1.new_folder_name"), "new-folder");
    if (!name) return;
    const rel = dirRel ? dirRel + "/" + name : name;
    try {
      await window.schutz.mkdir(ws.root, rel);
      await this.refreshWorkspace();
      this.toast("ok", t("sc1.folder_created") + name);
    } catch (e) { this.toast("error", t("sc1.folder_create_failed") + (e instanceof Error ? e.message : String(e))); }
  }

  async revealAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    await window.schutz.reveal(ws.root, rel);
  }

  /** 좌·우 패널 드래그 리사이즈 */
  /** 대화 ↔ 산출물 패널 폭. 오른쪽으로 끌면 패널이 좁아진다(대화가 넓어진다). */
  private startAgentSideResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = this.state.agentSideW;
    const onMove = (ev: MouseEvent) => {
      // 대화 쪽에도 최소 폭을 남긴다 — 패널을 끝까지 끌어 대화를 0 으로 만들 수 있으면 안 된다.
      const maxW = Math.max(360, window.innerWidth - 216 - 420);
      this.setState({ agentSideW: Math.max(360, Math.min(maxW, startW - (ev.clientX - startX))) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      try { localStorage.setItem("schutz.agentSideW", String(this.state.agentSideW)); } catch { /* ignore */ }
      // 패널 폭이 바뀌면 Monaco 를 다시 재어준다 — automaticLayout 은 한 프레임 늦다.
      requestAnimationFrame(() => { for (const p of paneRegistry.panes.values()) { try { p.editor.layout(); } catch { /* */ } } });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  }

  private startResize(side: "left" | "right", e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === "left" ? this.state.leftW : this.state.rightW;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (side === "left") this.setState({ leftW: Math.max(200, Math.min(520, startW + dx)) });
      else this.setState({ rightW: Math.max(240, Math.min(600, startW - dx)) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      try { localStorage.setItem("schutz.leftW", String(this.state.leftW)); localStorage.setItem("schutz.rightW", String(this.state.rightW)); } catch { /* */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  }

  /** 좌측 컬럼 안 트리↔대화 세로 리사이즈 */
  private startChatResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = this.state.chatH;
    // 마지막 값을 따로 들고 있는다 — onUp 에서 this.state 를 읽으면 직전 mousemove 의
    // setState 가 아직 반영 안 됐을 수 있어 한 프레임 낡은 값이 저장된다.
    let last = startH;
    const onMove = (ev: MouseEvent) => {
      // 위로 끌면 대화가 커진다. 컨테이너 높이를 매번 다시 재는 이유 — 드래그 중에
      // 터미널이 열리거나 창이 바뀌면 상한이 달라진다.
      const avail = this._leftCol?.clientHeight ?? window.innerHeight;
      last = this.clampChatH(startH - (ev.clientY - startY), avail);
      this.setState({ chatH: last });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      try { localStorage.setItem("schutz.chatH", String(last)); } catch { /* */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
  }

  /** 트리·대화 양쪽의 최소 높이를 보장한다. 창이 짧으면 상한이 하한보다 작아질 수
   *  있어서(음수 폭) 그때는 하한을 우선한다 — 안 그러면 대화가 0 이 된다. */
  private clampChatH(h: number, avail: number): number {
    const hi = Math.max(CHAT_MIN_H, avail - TREE_MIN_H);
    return Math.round(Math.max(CHAT_MIN_H, Math.min(hi, h)));
  }

  async renameAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const parts = rel.split("/");
    const base = parts.pop()!;
    const nn = window.prompt(t("sc1.new_name"), base);
    if (!nn || nn === base) return;
    const relTo = [...parts, nn].join("/");
    try {
      await window.schutz.renameEntry(ws.root, rel, relTo);
      const remap = (p: string) => p === rel ? relTo : p.startsWith(rel + "/") ? relTo + p.slice(rel.length) : p;
      projectModels.rekeyUnder(ws.root, rel, relTo); // 하위 모델을 새 경로로 재생성(미저장 버퍼·dirty 보존, 옛 경로 잔존 없음)
      await this.refreshWorkspace();
      this.setState(s => {
        const collapsed: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(s.collapsed)) collapsed[remap(k)] = v; // 접힘 상태 이동
        const paneDirty: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(s.paneDirty)) paneDirty[remap(k)] = v; // dirty 도 새 경로로 이동(버퍼 보존됨)
        return {
          tabs: s.tabs.map(t => t.map(remap)),
          active: s.active.map(remap),
          collapsed, paneDirty,
        };
      });
    } catch (e) { this.toast("error", t("sc1.rename_failed") + (e instanceof Error ? e.message : String(e))); }
  }

  async deleteAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    if (!window.confirm(t("sc1.confirm_delete", { rel }))) return;
    try {
      const del = await window.schutz.deleteEntry(ws.root, rel);
      projectModels.dropUnder(ws.root, rel); // 하위 파일 모델까지 dispose(옛 dirty 모델 잔존→Save All 이 삭제 파일 재생성하는 버그 방지)
      // 휴지통이 안 되는 환경에선 영구 삭제됐다는 사실을 반드시 알린다 — 되돌릴 방법이 없다
      if (del && del.trashed === false) this.toast("info", t("sc1.deleted_permanently", { rel }));
      await this.refreshWorkspace();
      const gone = (p: string) => p !== rel && !p.startsWith(rel + "/");
      this.setState(s => {
        const tabs = s.tabs.map(t => t.filter(gone));
        const active = s.active.map((a, i) => (gone(a) ? a : (tabs[i][tabs[i].length - 1] ?? "")));
        const collapsed: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(s.collapsed)) if (gone(k)) collapsed[k] = v; // 삭제 경로 접힘키 제거
        const paneDirty: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(s.paneDirty)) if (gone(k)) paneDirty[k] = v;
        return { tabs, active, collapsed, paneDirty };
      });
    } catch (e) { this.toast("error", t("sc1.delete_failed") + (e instanceof Error ? e.message : String(e))); }
  }

  /** 편집 메뉴 → 포커스된 Monaco 액션 */
  /**
   * 지금 활성 탭의 Monaco 페인. paneRegistry.focused 만 보면 안 된다 —
   * 그 값은 사용자가 에디터 안을 **직접 클릭**해야만 채워지는데, openFile 과
   * 워크스페이스 복원은 포커스를 주지 않는다. 그래서 "앱 켜고 → 트리에서 파일
   * 클릭 → 편집 메뉴" 라는 가장 흔한 흐름에서 null 이었고, 찾기·되돌리기·저장·
   * 서식이 모두 조용히 아무 일도 안 했다. 활성 탭을 먼저 보고 focused 는 폴백.
   */
  private activePane() {
    const rel = this.state.active[Math.min(Math.max(0, this._focusSlot), this.state.active.length - 1)];
    return (rel ? paneRegistry.panes.get(rel) : undefined) ?? paneRegistry.focused ?? null;
  }

  /** 이벤트가 Monaco 안에서 났는가. 안이면 Monaco 키바인딩을 그대로 두어야 한다 —
   *  가로채면 찾기 위젯 안에서 Ctrl+F 를 다시 눌러도 아무 일이 안 난다. */
  private inEditorDom(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest(".monaco-editor");
  }

  editorAction(kind: string) {
    const pane = this.activePane();
    if (!pane) { this.toast("info", t("sc1.noEditorForAction")); return; } // 조용히 삼키지 않는다
    const ed = pane.editor;
    ed.focus();
    if (kind === "paste") {
      void navigator.clipboard.readText().then(text => {
        const sel = ed.getSelection();
        if (sel && text) ed.executeEdits("paste", [{ range: sel, text, forceMoveMarkers: true }]);
      }).catch(() => { /* 클립보드 권한 없음 */ });
      return;
    }
    const ID: Record<string, string> = {
      undo: "undo", redo: "redo",
      cut: "editor.action.clipboardCutAction", copy: "editor.action.clipboardCopyAction",
      find: "actions.find", replace: "editor.action.startFindReplaceAction",
      findNext: "editor.action.nextMatchFindAction", findPrev: "editor.action.previousMatchFindAction",
    };
    const id = ID[kind];
    if (id) this.runEditorAction(ed, id);
  }

  /**
   * Monaco 액션을 한 틱 뒤에 돌린다. actions.find 류는 editorFocus 컨텍스트 키를
   * 전제조건으로 갖고, 전제조건이 안 맞으면 **예외 없이 조용히 no-op** 이다.
   * 바로 앞의 focus() 는 모델이 아직 로딩 중이면(readFile 이 비동기) 먹지 않아서,
   * 프레임을 하나 넘겨 포커스가 실제로 자리잡은 뒤에 실행한다.
   */
  private runEditorAction(ed: import("monaco-editor").editor.IStandaloneCodeEditor, id: string) {
    requestAnimationFrame(() => {
      try {
        ed.focus();
        const act = ed.getAction(id);
        if (act) void act.run();
        else ed.trigger("menu", id, null);   // undo/redo 는 액션이 아니라 핸들러다
      } catch { /* 페인이 그 사이 언마운트 */ }
    });
  }

  // ── 최근 프로젝트 ──
  private recents(): { root: string; name: string }[] {
    try { return JSON.parse(localStorage.getItem("schutz.recents") ?? "[]"); } catch { return []; }
  }
  private pushRecent(root: string, name: string) {
    try {
      const list = this.recents().filter(r => r.root !== root);
      list.unshift({ root, name });
      localStorage.setItem("schutz.recents", JSON.stringify(list.slice(0, 6)));
      localStorage.setItem("schutz.lastRoot", root);
    } catch { /* ignore */ }
  }

  /** 경로로 워크스페이스 열기 (다이얼로그 없이 — 복원/최근용) */
  async openWorkspacePath(root: string) {
    if (!window.schutz) return;
    try {
      const tree = await window.schutz.readTree(root);
      this.clearTimers();
      this.pushRecent(root, tree.name);
      document.title = tree.name + " — Schutz";
      this._focusSlot = 0;
      this.history = [];
      this.engine.reset(); // 실행·원장이 프로젝트를 넘어 새지 않게
      lspClient.shutdownAll();
      projectModels.disposeAll();
      lspClient.setRoot(tree.root);
      const restored = this.restoredLayout(tree, this.state.layout); // 재시작 전 열려 있던 탭/레이아웃 복원
      // 복원 직후 첫 componentDidUpdate 의 자동 persist 스킵 — 복원본(prune 포함)을 그대로 되쓰지 않게
      // (일시적 미가용·오판 prune 이 저장 레이아웃을 영구 덮어쓰는 것 방지). componentDidUpdate 는 setState 콜백보다 먼저 실행되므로 여기서 시드.
      this._lastTabsRef = restored.tabs; this._lastActiveRef = restored.active;
      this.setState(s => ({
        workspace: tree, leftTab: "tree", tabs: restored.tabs, active: restored.active, layout: restored.layout, messages: [],
        docs: window.schutz ? {} : freshDocs(), files: [], plan: [], tools: [], chips: {},
        expanded: null, paneDirty: {}, statusKey: "idle", running: false,
        // 프로젝트마다 모드를 따로 기억한다 — 설정이 없으면 전역 기본값으로 떨어진다
        uiMode: getUiMode(tree.root),
        // 어느 대화를 열지 여기서 정한다 — 이어보던 것 → 레거시 이관분 → 가장 최근 → 새것.
        convId: this.pickConv(tree.root),
        agents: this.freshAgents(), proposals: [], paneVer: {}, collapsed: {},
        git: null, gitMsg: "", gitError: "", attach: [], problems: [], tsLargeProject: false,
      } as any), () => {
        this._focusSlot = 0;
        this._chatScroll = {};                 // 픽셀 위치가 다른 프로젝트로 새는 것 방지
        this._chatSeen = {};
        this._recallIdx = -1;
        this.setState({ input: "", chatTab: "all", chatAway: false }, () => {
          // 이 창이 무엇을 보고 있는지 기록 — 다음에 이 프로젝트를 열면 그 대화로 돌아온다
          try { const k = this.curConvKey(); if (k && this.state.convId) localStorage.setItem(k, this.state.convId); } catch { /* ignore */ }
          this.restoreSession();               // 안에서 seedChatSeen + 하단 스크롤
          this.restoreDraft();                 // 쓰다 만 글 되살리기 (프로젝트별)
        });
      });
      void this.loadGit();
      void this.loadAgentCommands(); // 프로젝트 .claude/commands 반영
      window.schutz.watchStart(tree.root); // 외부 변경 감지 시작
      // TS/JS 프로젝트 모델 프리로드 (파일간 인텔리전스) — UI 논블로킹
      setTimeout(() => {
        void projectModels.preload(tree.root, tree.entries, (r, rel) => window.schutz!.readFile(r, rel), this.isDirtyRel)
          .then(res => { if (res.skipped) this.setState({ tsLargeProject: true }); });
      }, 0);
    } catch (e) {
      this.setState(s => ({
        messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", agent: "schutz", text: t("sc1.cannot_open_folder") + (e instanceof Error ? e.message : String(e)) }],
      }));
    }
  }

  /** 퀵오픈 후보 (간단 퍼지: 부분 문자열 우선, 이어서 서브시퀀스) */
  quickList(): SchutzTreeEntry[] {
    const ws = this.state.workspace;
    if (!ws) return [];
    const q = this.state.quickQuery.toLowerCase();
    const files = ws.entries.filter(e => !e.dir);
    if (!q) return files.slice(0, 12);
    const scored = files
      .map(f => {
        const p = f.rel.toLowerCase();
        let score = -1;
        const idx = p.indexOf(q);
        if (idx >= 0) score = 1000 - idx - (p.length - q.length) * 0.1;
        else {
          let i = 0;
          for (const ch of p) if (ch === q[i]) i++;
          if (i === q.length) score = 100 - p.length * 0.1;
        }
        return { f, score };
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 12).map(x => x.f);
  }

  /** 커맨드 팔레트 액션 레지스트리 (Ctrl+Shift+P) */
  commands(): Command[] {
    const cmds: Command[] = [
      { id: "newFile", label: t("sc1.cmd_new_file"), hint: "Ctrl+N", run: () => void this.newFileAt("") },
      { id: "save", label: t("sc1.cmd_save"), hint: "Ctrl+S", run: () => void this.saveActive() },
      { id: "saveAll", label: t("sc1.cmd_save_all"), hint: "Ctrl+Shift+S", run: () => void this.saveAll() },
      { id: "settings", label: t("sc1.cmd_open_settings"), hint: "Ctrl+,", run: () => this.openO({ settingsOpen: true }) },
      { id: "term", label: t("sc1.cmd_toggle_terminal"), hint: "Ctrl+`", run: () => this.toggleTerm() },
      { id: "uiMode", label: t("mode.command"), hint: "Ctrl+Shift+M", run: () => this.toggleUiMode(this.state.uiMode === "agent" ? "editor" : "agent") },
      // 사이드바는 에이전트 모드에만 있다. 명령으로도 열어두지 않으면 에디터 모드를 고른
      // 사람에게는 첫 실행 화면이 유일한 입구이고, 거기서 "나중에" 를 누르면 길이 없어진다.
      { id: "importChats", label: t("imp.command"), run: () => this.openImport() },
      { id: "split1", label: t("sc1.cmd_split1"), run: () => this.setLayout(1) },
      { id: "split2", label: t("sc1.cmd_split2"), run: () => this.setLayout(2) },
      { id: "split4", label: t("sc1.cmd_split4"), run: () => this.setLayout(4) },
      { id: "quickOpen", label: t("sc1.cmd_goto_file"), hint: "Ctrl+P", run: () => this.openO({ quickOpen: true, quickQuery: "", quickSel: 0 }) },
      { id: "symOpen", label: t("sc1.cmd_goto_ws_symbol"), hint: "Ctrl+T", run: () => this.openSymbolPalette() },
      { id: "search", label: t("sc1.cmd_global_search"), hint: "Ctrl+Shift+F", run: () => this.openO({ searchOpen: true, searchSel: 0 }) },
      { id: "outline", label: t("sc1.cmd_goto_symbol_outline"), hint: "Ctrl+Shift+O", run: () => this.triggerOutline() },
      { id: "gotoDef", label: t("sc1.cmd_goto_def"), hint: "F12", run: () => this.triggerEditorAction("editor.action.revealDefinition") },
      { id: "findRefs", label: t("sc1.cmd_find_refs"), hint: "Shift+F12", run: () => this.triggerEditorAction("editor.action.goToReferences") },
      { id: "rename", label: t("sc1.cmd_rename_symbol"), hint: "F2", run: () => this.triggerRename() },
      { id: "gotoLine", label: t("sc1.cmd_goto_line"), hint: "Ctrl+G", run: () => this.triggerEditorAction("editor.action.gotoLine") },
      { id: "format", label: t("sc1.cmd_format_doc"), run: () => void paneRegistry.focused?.editor.getAction("editor.action.formatDocument")?.run() },
      { id: "wrap", label: t("sc1.cmd_toggle_wrap"), run: () => this.applyEditorPref({ wordWrap: !getEditorPrefs().wordWrap }) },
      { id: "minimap", label: t("sc1.cmd_toggle_minimap"), run: () => this.applyEditorPref({ minimap: !getEditorPrefs().minimap }) },
      { id: "problems", label: t("sc1.cmd_open_problems"), run: () => this.setState({ termOpen: true, termTab: "problems" }) },
      { id: "newWindow", label: t("sc1.cmd_new_window"), hint: "Ctrl+Shift+N", run: () => window.schutz?.newWindow() },
      { id: "theme", label: t("sc1.cmd_cycle_theme"), run: () => this.cycleTheme() },
    ];
    if (this.state.workspace) {
      cmds.push({ id: "openProject", label: t("sc1.cmd_open_project"), hint: "Ctrl+O", run: () => void this.openProject() });
      cmds.push({ id: "gitPanel", label: t("sc1.cmd_open_scm"), run: () => { this.setState({ leftTab: "git" }); void this.loadGit(); } });
      cmds.push({ id: "gitRefresh", label: t("sc1.cmd_git_refresh"), run: () => void this.loadGit() });
      cmds.push({ id: "debugStart", label: t("sc1.cmd_debug_start"), run: () => void this.startDebug() });
      cmds.push({ id: "debugStop", label: t("sc1.cmd_debug_stop"), run: () => void this.stopDebug() });
      cmds.push({ id: "debugView", label: t("sc1.cmd_debug_panel"), run: () => this.setState({ leftTab: "debug" }) });
      cmds.push({ id: "gitBlame", label: t("sc1.cmd_git_blame"), run: () => void this.gitBlameLine() });
      cmds.push({ id: "gitStash", label: t("sc1.cmd_git_stash"), run: () => void this.gitSimple("stash", t("sc1.toast_stash_saved")) });
      cmds.push({ id: "gitStashPop", label: t("sc1.cmd_git_stash_pop"), run: () => void this.gitSimple("stashPop", t("sc1.toast_stash_popped")) });
      cmds.push({ id: "gitPull", label: t("sc1.cmd_git_pull"), run: () => void this.gitSimple("pull", t("sc1.toast_pull_done")) });
      cmds.push({ id: "gitFetch", label: t("sc1.cmd_git_fetch"), run: () => void this.gitSimple("fetch", t("sc1.toast_fetch_done")) });
    }
    cmds.push({ id: "extView", label: t("sc1.cmd_ext_manage"), run: () => this.setState({ leftTab: "ext" }) });
    // ── AI 슬래시 명령 (Claude Code · Codex) — 커맨드 팔레트에도 노출 ──
    const gate = (o: string) => o === "schutz" || (o === "claude" && !!this.state.cliAgents.claude?.ok) || (o === "codex" && !!this.state.cliAgents.codex?.ok);
    for (const c of SLASH_COMMANDS) {
      if (!gate(c.origin)) continue;
      cmds.push({ id: "ai:" + c.origin + c.cmd, label: `AI: ${c.cmd} — ${t(c.desc)}${c.origin !== "schutz" ? " [" + ORIGIN_LABEL[c.origin] + "]" : ""}`, run: () => this.dispatchSlash(c.cmd, c.origin) });
    }
    const builtinNames = new Set(SLASH_COMMANDS.map(c => c.cmd));
    for (const c of this.state.agentCommands) {
      if (!gate(c.origin) || builtinNames.has("/" + c.name)) continue;
      cmds.push({ id: "aic:" + c.origin + ":" + c.name, label: `AI: /${c.name} — ${c.description || t("sc1.custom_cmd")} [${ORIGIN_LABEL[c.origin]}·${c.scope === "project" ? t("sc1.project") : t("sc1.user")}]`, run: () => this.dispatchSlash("/" + c.name, c.origin) });
    }
    // 확장 기여 커맨드
    for (const ec of this.state.extCommands) cmds.push({ id: ec.id, label: ec.title + "  (" + ec.source + ")", run: ec.run });
    // id 중복 제거(먼저 것 유지) — 팔레트 렌더 key={c.id} 충돌 방지:
    //  · 커스텀 명령이 user/project 양쪽에 동명(aic:origin:name 동일) → user 유지(findAgentCommand/slashList 와 일관)
    //  · 확장 명령 id 가 빌트인(save/format 등)과 충돌 → 빌트인 유지
    const seenId = new Set<string>();
    return cmds.filter(c => { if (seenId.has(c.id)) return false; seenId.add(c.id); return true; });
  }

  /** 커맨드 팔레트에서 슬래시 명령 실행 — 인자 필요한 명령은 채팅 입력에 프리필 */
  private dispatchSlash(cmd: string, origin: string) {
    const spec = SLASH_COMMANDS.find(c => c.cmd === cmd && c.origin === origin);
    // 발견된 커스텀 명령은 SLASH_COMMANDS 에 없으므로 argHint 를 별도 조회(빈 인자 즉시 실행 방지)
    const name = cmd.replace(/^\//, "");
    const custom = this.state.agentCommands.find(c => c.name === name && c.origin === origin);
    // 인자 힌트가 있는 명령(/model, /login, 인자 받는 커스텀 명령)은 바로 실행하지 않고 입력창에 프리필
    if (spec?.argHint || custom?.argHint) { this.setState({ input: cmd + " " }); return; }
    this.setState({ input: cmd }, () => { void this.send(); });
  }

  /** 아웃라인 (심볼 퀵픽) — Monaco 내장 */
  triggerOutline() {
    const ed = paneRegistry.focused?.editor;
    if (!ed) return;
    ed.focus();
    ed.getAction("editor.action.quickOutline")?.run();
  }

  /** 테마 순환 (feldgrau → graphite → paper) — Monaco 테마도 즉시 전환 */
  cycleTheme() {
    const order = ["feldgrau", "graphite", "paper"];
    const cur = getThemeId();
    this.setTheme(order[(order.indexOf(cur) + 1) % order.length]);
  }
  setTheme(id: string) {
    setThemeId(id);
    setActiveVsxTheme("");           // 내장 테마 선택 → 가져온 테마 해제
    applyTheme(id);                  // CSS 변수(UI 크롬)
    this.applyEditorTheme();         // Monaco 에디터 테마 조율
    this.forceUpdate();
  }
  /** 에디터(Monaco) 테마를 영속 선택에 맞춰 적용 — 가져온 테마 > (TextMate ? TM테마 : 내장) */
  applyEditorTheme(themes: vscodeExt.ImportedTheme[] = this.state.extThemes) {
    const vsx = getActiveVsxTheme();
    if (vsx && themes.some(t => t.id === vsx)) { monaco.editor.setTheme(vsx); return; }
    if (textmate.isTextMateWired()) monaco.editor.setTheme(textmate.tmThemeId());
    else monaco.editor.setTheme(monacoThemeOf(getThemeId()));
  }
  /** 가져온 VS Code 에디터 테마 선택 + 영속화 */
  selectVsxTheme(th: vscodeExt.ImportedTheme) {
    setActiveVsxTheme(th.id);
    monaco.editor.setTheme(th.id);
    this.toast("ok", t("sc1.editorTheme", { label: th.label }));
    this.forceUpdate();
  }

  /** 현재 입력 기준 팔레트 후보 (사용 가능 origin만) — 내장 + 발견된 커스텀 명령 */
  slashList(): SlashCmd[] {
    const v = this.state.input;
    // /model 입력 중에는 모델 팔레트가 대신 뜬다
    if (/^\/model(\s|$)/.test(v)) return [];
    if (!v.startsWith("/") || v.includes(" ")) return [];
    const gate = (o: string) => o === "schutz" || (o === "claude" && !!this.state.cliAgents.claude?.ok) || (o === "codex" && !!this.state.cliAgents.codex?.ok);
    const builtin = SLASH_COMMANDS.filter(c => c.cmd.startsWith(v) && gate(c.origin));
    // 발견된 커스텀 명령 (내장과 이름 겹치면 내장 우선)
    const builtinNames = new Set(SLASH_COMMANDS.map(c => c.cmd));
    const custom: SlashCmd[] = this.state.agentCommands
      .filter(c => gate(c.origin) && ("/" + c.name).startsWith(v) && !builtinNames.has("/" + c.name))
      .map(c => ({ cmd: "/" + c.name, origin: c.origin, desc: c.description || (c.scope === "project" ? t("sc1.project_cmd") : t("sc1.user_cmd")), kind: "forward" as const, argHint: c.argHint }));
    // 이름 중복 제거 (여러 오리진/스코프에 동일 커스텀명)
    const seen = new Set<string>();
    return [...builtin, ...custom].filter(c => { const k = c.cmd + c.origin; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /** /model 입력 시 뜨는 모델 팔레트 — 각 모델을 출처(Claude Code/Codex/…) 배지와 함께 */
  modelPalette(): { agent: string; modelId: string; label: string; badge: string; color: string; current: boolean }[] {
    const v = this.state.input;
    if (!/^\/model(\s|$)/.test(v)) return [];
    const q = v.replace(/^\/model\s*/, "").toLowerCase().trim();
    const out: { agent: string; modelId: string; label: string; badge: string; color: string; current: boolean }[] = [];
    for (const d of AGDEF) {
      const ch = this.modelChannel(d.id);
      if (!ch) continue;
      const badge = d.id === "claude" ? "Claude Code" : (ch.overrideKey === "codex" ? "Codex" : d.name);
      const color = d.id === "claude" ? ORIGIN_COLOR.claude : (ch.overrideKey === "codex" ? ORIGIN_COLOR.codex : d.color);
      // 실시간 조회된 목록이 있으면 그걸 사용(실값), 없으면 큐레이트 폴백. 라벨은 알려진 것만 표기.
      const fetched = this._modelCache[d.id];
      let merged: { id: string; label: string }[];
      if (fetched && fetched.length) {
        const known = new Map(ch.options.map(o => [o.id, o.label]));
        merged = fetched.map(id => ({ id, label: known.get(id) ?? "" }));
      } else {
        merged = ch.options;
      }
      for (const o of merged) {
        if (q && !(o.id.toLowerCase().includes(q) || o.label.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))) continue;
        out.push({ agent: d.id, modelId: o.id, label: o.label, badge, color, current: o.id === ch.current });
      }
    }
    // 직접 입력: 쿼리가 어느 목록에도 없고 공백이 없으면 "그대로 적용" 후보. id 접두어로 대상 에이전트 추론
    if (q && !q.includes(" ") && !out.some(o => o.modelId.toLowerCase() === q)) {
      const connectedId = (id: string) => (this.modelChannel(id) ? id : null);
      const guess =
        (q.startsWith("claude") && connectedId("claude")) ||
        ((/^(gpt-|o\d|chatgpt)/.test(q)) && connectedId("gpt")) ||
        (q.startsWith("grok") && connectedId("grok")) ||
        (q.startsWith("glm") && connectedId("glm")) ||
        AGDEF.find(d => this.modelChannel(d.id))?.id;
      if (guess) {
        const ch = this.modelChannel(guess)!;
        const badge = guess === "claude" ? "Claude Code" : (ch.overrideKey === "codex" ? "Codex" : this.agDef(guess).name);
        const color = guess === "claude" ? ORIGIN_COLOR.claude : (ch.overrideKey === "codex" ? ORIGIN_COLOR.codex : this.agDef(guess).color);
        out.push({ agent: guess, modelId: v.replace(/^\/model\s*/, "").trim(), label: t("sc1.apply_id_directly"), badge, color, current: false });
      }
    }
    return out;
  }

  /** 모델 팔레트에서 선택 → 적용 + 확인 메시지 */
  applyModelFromPalette(agent: string, modelId: string) {
    this.setModelFor(agent, modelId);
    this.setState(s => ({
      input: "",
      messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", agent: "schutz", text: t("sc1.model_changed", { name: this.agDef(agent).name, modelId }) }],
    }));
  }

  private _oauthOff: (() => void) | null = null;

  async startOauth(id: string) {
    if (!window.schutz) return;
    this.setState({ oauthMsg: "", oauthPasteFor: null, oauthWait: id === "codex" });
    try {
      const r = await window.schutz.oauthStart(id);
      if (!r.ok) { this.setState({ oauthMsg: r.message ?? t("sc1.login_start_failed"), oauthWait: false }); return; }
      if (r.mode === "paste") this.setState({ oauthPasteFor: id, oauthPasteVal: "", oauthWait: false });
    } catch (e) {
      // 예외 시에도 스피너를 반드시 해제 (무한 대기 방지)
      this.setState({ oauthMsg: t("sc1.login_start_error") + (e instanceof Error ? e.message : String(e)), oauthWait: false });
    }
  }

  async submitOauthPaste() {
    const id = this.state.oauthPasteFor;
    if (!id || !window.schutz) return;
    this.setState({ oauthMsg: t("sc1.checking") });
    try {
      const r = await window.schutz.oauthExchange(id, this.state.oauthPasteVal);
      if (r.ok && r.access) {
        setOAuth(id, { access: r.access, refresh: r.refresh ?? null, exp: r.exp ?? Date.now() + 3600_000, accountId: (r as any).accountId ?? null });
        this.setState(st => ({ oauthPasteFor: null, oauthPasteVal: "", oauthMsg: "", oauthTick: st.oauthTick + 1 }));
      } else {
        this.setState({ oauthMsg: r.message ?? t("sc1.code_exchange_failed") });
      }
    } catch (e) {
      this.setState({ oauthMsg: t("sc1.code_exchange_error") + (e instanceof Error ? e.message : String(e)) });
    }
  }

  /** 구독 CLI 재감지 */
  async detectCli() {
    if (!window.schutz) return;
    const r = await window.schutz.cliCheck();
    this.setState({ cliAgents: r.agents ?? {} });
    void this.loadAgentCommands();
  }

  /** Claude Code · Codex 커스텀 명령 발견 (홈 + 현재 프로젝트) */
  async loadAgentCommands() {
    if (!window.schutz) return;
    try {
      const r = await window.schutz.agentCommands(this.state.workspace?.root ?? null);
      this.setState({ agentCommands: r.commands ?? [] });
    } catch { /* 무시 */ }
  }
  /** 발견된 커스텀 명령 찾기 (오리진 게이트) */
  private findAgentCommand(name: string): DiscoveredCmd | null {
    const ca = this.state.cliAgents;
    const cands = this.state.agentCommands.filter(c => c.name === name);
    return cands.find(c => c.origin === "claude" && ca.claude?.ok)
      ?? cands.find(c => c.origin === "codex" && ca.codex?.ok)
      ?? null;
  }

  async testConn(id: string) {
    this.setState(st => ({ testMsg: { ...st.testMsg, [id]: t("sc1.checking") } }));
    const r = await testProvider(id);
    this.setState(st => ({ testMsg: { ...st.testMsg, [id]: r.ok ? t("sc1.connected_ok") : "⚠️ " + r.message.slice(0, 120) } }));
  }

  private _cliOff: (() => void) | null = null;
  /** CLI 세션 id (멀티턴 --resume) */
  private _cliSession: string | null = null;
  private _codexSession: string | null = null;
  private _cliMsgId: string | null = null;
  private _cliAgentKey = "claude";
  private _termSeq = 1;

  /** 새 터미널 탭 추가 */
  addTerm() {
    this._termSeq++;
    const id = "t" + this._termSeq + "_" + (this._uid++);
    this.setState(s => ({ terms: [...s.terms, { id, n: s.terms.length + 1 }], termTab: id, termOpen: true } as any));
  }
  /** 터미널 탭 닫기 (셸은 XtermView 언마운트 시 kill) */
  closeTerm(id: string) {
    this.setState(s => {
      const terms = s.terms.filter(t => t.id !== id);
      const termTab = s.termTab === id ? (terms[terms.length - 1]?.id ?? "ai") : s.termTab;
      return { terms, termTab } as any;
    });
  }

  /** 실제 프로젝트 폴더 열기 (Electron에서만 동작) */
  async openProject() {
    this.setState({ openMenu: null, projOpen: false });
    if (!window.schutz) {
      this.setState(s => ({
        messages: [...s.messages, {
          id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", agent: "schutz",
          text: t("sc1.desktop_only_project"),
        }],
      }));
      return;
    }
    const root = await window.schutz.openFolder();
    if (!root) return;
    await this.openWorkspacePath(root);
  }

  /** 제안 수락 — 전역 큐로 직렬화(같은 파일 동시 수락 시 read-modify-write 유실 방지) */
  private _termMounted = false; // 터미널 도크가 한 번이라도 열렸는지(래치) — 접어도 XtermView 언마운트 방지
  private _acceptQueue: Promise<void> = Promise.resolve();
  private _acceptRequested = new Set<string>(); // 요청 시점 동기 디둡(‘모두 수락’+개별클릭 중복 → accepted가 failed로 뒤집힘 방지)
  private _proposalsById = new Map<string, Proposal>(); // 제안 동기 등록 — 자동수락은 setState(macrotask) 커밋 전 microtask 로 실행돼 state.find 가 못 찾음
  acceptProposal(id: string): Promise<void> {
    if (this._acceptRequested.has(id)) return this._acceptQueue; // 이미 수락 요청됨 → 무시
    this._acceptRequested.add(id);
    this._acceptQueue = this._acceptQueue.then(() => this._acceptProposal(id)).catch(() => { /* 개별 실패는 상태로 반영됨 */ });
    return this._acceptQueue;
  }
  /** 제안 수락: find→replace를 실제 파일에 적용 */
  private async _acceptProposal(id: string) {
    // 동기 등록본 우선 — 자동수락 시 아직 state 에 커밋 안 됐어도 조회 가능(파일 미기록인데 성공 보고되는 버그 방지)
    const p = this._proposalsById.get(id) ?? this.state.proposals.find(x => x.id === id);
    const ws = this.state.workspace;
    if (!p || !ws || !window.schutz || p.status !== "pending") return;
    try {
      let newContent: string;
      let editStart = -1, editEnd = -1; // 애니메이션 대상 범위
      if (p.find === "") {
        // 새 파일 생성 — 기존 파일 덮어쓰기 방지
        const exists = await window.schutz.readFile(ws.root, p.rel).then(() => true, () => false);
        if (exists) throw new Error(t("proposal.fileExists"));
        newContent = p.replace;
        await window.schutz.writeFile(ws.root, p.rel, newContent);
        const tree = await window.schutz.readTree(ws.root);
        this.setState({ workspace: tree });
        // 빈 파일 → 전체 내용. 파일이 열리며 코드가 타이핑되는 장면이 여기서 나온다
        editStart = 0; editEnd = 0;
      } else {
        const cur = await window.schutz.readFile(ws.root, p.rel);
        let start = -1, end = -1;
        if (p.range) {
          // 인라인 편집: 정확 범위로 적용(흔한/중복 라인 선택도 정상). 단 범위의 현재 내용이 선택과 동일할 때만(파일 변경 스테일 방지).
          const off = (line: number, col: number) => { const ls = cur.split("\n"); let o = 0; for (let i = 0; i < line - 1 && i < ls.length; i++) o += ls[i].length + 1; return o + (col - 1); };
          const s0 = off(p.range.startLineNumber, p.range.startColumn), e0 = off(p.range.endLineNumber, p.range.endColumn);
          if (s0 >= 0 && e0 >= s0 && e0 <= cur.length && cur.slice(s0, e0) === p.find) { start = s0; end = e0; }
        }
        if (start >= 0) {
          newContent = cur.slice(0, start) + p.replace + cur.slice(end);
        } else {
          // 범위 없음 또는 스테일 → 텍스트 유일성 매칭 폴백
          const idx = cur.indexOf(p.find);
          if (idx < 0) throw new Error(t("sc1.orig_not_found"));
          if (cur.indexOf(p.find, idx + 1) >= 0) throw new Error(t("sc1.orig_multiple"));
          // 함수 replacer — 교체 내용의 $ 시퀀스($&, $1 등)가 오해석되어 파일이 손상되는 것 방지
          newContent = cur.replace(p.find, () => p.replace);
        }
        await window.schutz.writeFile(ws.root, p.rel, newContent);
        editStart = start >= 0 ? start : cur.indexOf(p.find);
        editEnd = editStart + p.find.length;
      }
      this._proposalsById.set(id, { ...p, status: "accepted" }); // 동기 레지스트리도 갱신 — 자동수락 호출측이 결과를 즉시 읽는다
      this.setState(s => ({
        proposals: s.proposals.map(x => x.id === id ? { ...x, status: "accepted" as const } : x),
      }));
      // 파일을 먼저 열어야 애니메이터가 붙일 에디터가 생긴다
      this.openFile(p.rel);
      // 모델에 애니메이션으로 반영. setValue + paneVer 리마운트를 쓰던 자리 —
      // 그건 코드를 한 프레임에 갈아끼우고 에디터를 깜빡이게 하며 스크롤을 날렸다.
      await this.animateEditIntoModel(ws.root, p.rel, newContent, editStart, editEnd, p.find, p.replace);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this._proposalsById.set(id, { ...p, status: "failed", error: msg });
      this.setState(s => ({
        proposals: s.proposals.map(x => x.id === id ? { ...x, status: "failed" as const, error: msg } : x),
      }));
    }
  }

  /** 수락된 편집을 열린 모델에 애니메이션으로 반영한다.
   *  파일은 이미 디스크에 쓰인 뒤이므로, 여기서 실패해도 데이터는 안전하다 —
   *  최악의 경우 모델을 최종 내용으로 맞추기만 하면 된다. */
  private async animateEditIntoModel(root: string, rel: string, finalText: string, start: number, end: number, find: string, replacement: string) {
    // 이 파일을 띄우고 있는 팬이 없으면 애니메이션은 아무도 못 본다. 조용히 내용만 맞춘다.
    //
    // 없으면 "전부 수락" 이 파일마다 25×40ms 폴링 + 최대 2200ms 타이핑을 **보이지 않는 곳에서**
    // 돌려, 8개 파일이면 8초를 얼어붙은 채 기다리게 된다. propose_create 는 openFile 을 부르지
    // 않고(2144~), preload 는 팬 없는 모델을 최대 500개 만든다 — 흔한 경우다.
    const hosted = this.allOpen().includes(rel);
    if (!hosted) { projectModels.reload(root, rel, finalText, false); return; }
    // openFile 직후엔 페인이 아직 마운트 전이라 모델이 없다(특히 새 파일) — 잠깐 기다린다
    let m = projectModels.getByRel(rel);
    for (let i = 0; !m && i < 25; i++) {
      await new Promise<void>(r => setTimeout(r, 40));
      m = projectModels.getByRel(rel);
    }
    if (!m) { projectModels.reload(root, rel, finalText, false); return; }
    // 디스크 기준선을 먼저 최종본으로 — 애니메이션 도중 잠깐 dirty 로 보이지만 끝나면 맞는다
    projectModels.markSaved(root, rel, finalText);
    try {
      // 모델의 그 범위가 정말 바꾸려던 텍스트인지 확인한다. 외부 편집 등으로 어긋나 있으면
      // 범위를 믿을 수 없으므로 애니메이션 없이 최종본으로 맞춘다.
      const canAnimate = start >= 0 && end >= start && m.getValueLength() >= end
        && m.getValue().slice(start, end) === find;
      if (!canAnimate) { if (m.getValue() !== finalText) m.setValue(finalText); return; }
      await typeEdit(m, start, end, replacement, { reveal: true, slow: this._demoTyping ? DEMO_TYPE_SLOWDOWN : 1 });
      // 애니메이션 중 다른 편집이 끼어들었을 수 있다 — 최종본과 다르면 맞춘다
      if (m.getValue() !== finalText) m.setValue(finalText);
    } catch {
      if (!m.isDisposed() && m.getValue() !== finalText) m.setValue(finalText);
    }
  }

  /** 자동 수락 결과를 도구 반환 문자열로 — 실패를 성공으로 보고하지 않기 위해 호출측이 반드시 이걸 쓴다 */
  private autoAcceptResult(id: string, okMsg: string): string {
    const done = this._proposalsById.get(id);
    if (done && done.status === "failed") {
      // 모델이 적용되지 않은 변경 위에 다음 편집을 쌓지 않도록, 실패 사유를 그대로 돌려준다
      return `오류: 자동 수락이 실패해 파일이 변경되지 않았습니다 — ${done.error ?? "알 수 없는 오류"}`;
    }
    return okMsg;
  }

  rejectProposal(id: string) {
    this.setState(s => ({
      proposals: s.proposals.map(x => x.id === id && x.status === "pending" ? { ...x, status: "rejected" as const } : x),
    }));
  }

  freshAgents(): Record<string, AgentState> {
    const o: Record<string, AgentState> = {};
    AGDEF.forEach(a => { o[a.id] = { status: "idle", file: null, tin: 0, tout: 0, cost: 0 }; });
    return o;
  }

  /** 에이전트 정의 조회 — AGDEF 에 없는 id(레거시 세션, "schutz" 같은 예약 id, 삭제된 에이전트)여도
   *  undefined 를 돌려주지 않는다. 예전엔 논널 단언이라 그런 id 하나로 플로우 패널 렌더가 통째로 죽었다. */
  agDef(id: string) {
    return AGDEF.find(a => a.id === id)
      ?? { id, name: id || "?", model: "", mgr: false, color: "var(--fg-dim)" };
  }

  private _quotaOff: (() => void) | null = null;
  /** 실행 중인 셸 명령 id — 중지 시 함께 종료한다 */
  private _runIds = new Set<string>();
  /** 백그라운드 서버 — 프리뷰 탭 rel → runId. 에이전트 중지와 수명을 분리한다. */
  private _bgRuns = new Map<string, string>();
  private _askRunResolve: ((ok: boolean) => void) | null = null;

  /** 실행 승인 대기 — window.confirm 은 렌더러를 통째로 얼려서 인앱 모달로 바꿨다 */
  private askRunApproval(command: string, rationale: string, agent: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this._askRunResolve = resolve;
      this.setState({ askRun: { command, rationale, agent } });
    });
  }
  private answerRun(ok: boolean) {
    const r = this._askRunResolve;
    this._askRunResolve = null;
    this.setState({ askRun: null }, () => r?.(ok));
  }

  /** 켤 때 잔여 할당량 조회 — 헤더는 요청을 보내야 오므로 1토큰짜리 최소 요청을 한 번 던진다.
   *  실패해도 조용히 넘어간다(대화에는 영향 없음). */
  private async probeQuotas() {
    if (!window.schutz?.quotaProbe) return;
    for (const id of ["claude", "gpt"]) {
      const tok = getOAuth(id === "gpt" ? "codex" : id);
      if (!tok?.access) continue;
      try {
        const r = await window.schutz.quotaProbe({ provider: id, access: tok.access, accountId: tok.accountId ?? null });
        if (r.ok && r.quota) this.setState(st => ({ quota: { ...st.quota, [id]: r.quota! } }));
      } catch { /* 무시 */ }
    }
  }

  /** "5h 82% · 7d 35%" — 남은 비율. 모르면 null */
  quotaText(agentId: string): string | null {
    const q = this.state.quota[agentId];
    if (!q?.windows?.length) return null;
    return q.windows.map(w => `${w.label} ${Math.max(0, Math.round(100 - w.usedPercent))}%`).join(" · ");
  }

  /** 가장 가까운 리셋까지 남은 시간 ("3시간 12분") */
  quotaResetText(agentId: string): string {
    const q = this.state.quota[agentId];
    const times = (q?.windows ?? []).map(w => w.resetAt).filter((x): x is number => !!x);
    if (!times.length) return "—";
    const secs = Math.max(0, Math.min(...times) - Math.floor(Date.now() / 1000));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /** 가장 빠듯한 창의 남은 비율 — 색 경고용 */
  quotaTightest(agentId: string): number | null {
    const q = this.state.quota[agentId];
    if (!q?.windows?.length) return null;
    return Math.max(0, Math.round(100 - Math.max(...q.windows.map(w => w.usedPercent))));
  }

  /** 채팅 라벨 색 — 시스템 노트는 눈에 덜 띄게, 레거시(agent 없음)는 종전 그대로 */
  private chatAgentColor(agent?: string): string {
    if (!agent) return "var(--accent)";
    if (agent === "schutz") return "var(--fg-dim)";
    return this.agDef(agent).color;
  }



  /** 구독 경로 여부 — 토큰 비용이 구독에 포함되어 $ 표시가 무의미 */
  isSubscription(id: string): boolean {
    if (!window.schutz) return false;
    if (id === "claude") {
      if (getStoredKey("claude").trim()) return false;
      return !!getOAuth("claude") || !!this.state.cliAgents.claude?.ok;
    }
    if (id === "gpt") {
      if (getStoredKey("gpt").trim()) return false;
      return !!getOAuth("codex") || !!this.state.cliAgents.codex?.ok;
    }
    return false;
  }

  /** 에이전트가 실제로 사용할 모델 라벨 (미연결이면 null) */
  modelOf(id: string): string | null {
    // 웹 프리뷰(데모)는 디자인 라벨 유지
    if (!window.schutz) return this.agDef(id).model;
    if (id === "claude") {
      if (getOAuth("claude") || getStoredKey("claude").trim()) return getModelOverride("claude") || "claude-sonnet-5";
      if (this.state.cliAgents.claude?.ok) return this.state.cliModel || "Claude Code";
      return null;
    }
    if (id === "gpt") {
      if (getStoredKey("gpt").trim()) return getModelOverride("gpt") || "gpt-5.2";
      if (getOAuth("codex")) return getModelOverride("codex") || "gpt-5.6-terra";
      if (this.state.cliAgents.codex?.ok) return "Codex CLI";
      return null;
    }
    if (id === "grok") return getStoredKey("grok").trim() ? "grok-4" : null;
    if (id === "glm") return getStoredKey("glm").trim() ? "glm-4.6" : null;
    return null;
  }

  /** 에이전트의 현재 인증 경로에 맞는 모델 채널 (오버라이드 키 + 선택지). 미연결이면 null */
  modelChannel(id: string): { overrideKey: string; options: ModelOpt[]; current: string } | null {
    if (!window.schutz) return null;
    if (id === "claude") {
      if (getOAuth("claude") || getStoredKey("claude").trim())
        return { overrideKey: "claude", options: CLAUDE_MODELS, current: getModelOverride("claude") || "claude-sonnet-5" };
      return null; // CLI 폴백은 CLI가 모델 관리
    }
    if (id === "gpt") {
      if (getStoredKey("gpt").trim())
        return { overrideKey: "gpt", options: OPENAI_MODELS, current: getModelOverride("gpt") || "gpt-5.2" };
      if (getOAuth("codex"))
        return { overrideKey: "codex", options: CODEX_MODELS, current: getModelOverride("codex") || "gpt-5.6-terra" };
      return null;
    }
    if (id === "grok") return getStoredKey("grok").trim() ? { overrideKey: "grok", options: GROK_MODELS, current: getModelOverride("grok") || "grok-4" } : null;
    if (id === "glm") return getStoredKey("glm").trim() ? { overrideKey: "glm", options: GLM_MODELS, current: getModelOverride("glm") || "glm-4.6" } : null;
    return null;
  }

  /** 백엔드가 모델을 거부하면(지원 안 함/무효) 기본 모델로 자동 복구 */
  private maybeRevertModel(agentId: string, message: string) {
    if (!/not supported|지원하지 않|not a valid|invalid model|does not exist|model_not_found|unknown model|not.*available/i.test(message)) return;
    const ch = this.modelChannel(agentId);
    if (!ch) return;
    setModelOverride(ch.overrideKey, ""); // 오버라이드 제거 → 채널 기본 모델로 복귀
    this._modelFetched[agentId] = false; // 다음 조회 시 재확인
    this.toast("error", t("sc2.modelReverted", { name: this.agDef(agentId).name }));
    this.forceUpdate();
  }

  /** 모델 선택 적용 (목록에 없는 임의 ID도 허용 — 최신 모델 대응) */
  setModelFor(agentId: string, modelId: string) {
    const ch = this.modelChannel(agentId);
    if (!ch) return;
    setModelOverride(ch.overrideKey, modelId);
    this.setState({ modelPickFor: null });
    this.forceUpdate();
  }

  /** 프로바이더에서 받아온 실제 모델 목록 (에이전트별 id 배열) */
  private _modelCache: Record<string, string[]> = {};
  private _modelFetched: Record<string, boolean> = {};

  /** /model 입력 시 실제 사용 가능한 모델을 프로바이더 API에서 1회 조회 (하드코딩 목록 보완) */
  ensureModelsFetched() {
    if (!window.schutz) return;
    for (const d of AGDEF) if (this.modelChannel(d.id)) void this.fetchModels(d.id);
  }
  private async fetchModels(agent: string) {
    if (!window.schutz || this._modelFetched[agent]) return;
    this._modelFetched[agent] = true;
    let url = "", headers: Record<string, string> = {}, keep: (id: string) => boolean = () => true;
    if (agent === "claude") {
      const key = getStoredKey("claude").trim();
      const oauth = getOAuth("claude");
      url = "https://api.anthropic.com/v1/models?limit=1000";
      headers = { "anthropic-version": "2023-06-01" };
      if (key) headers["x-api-key"] = key;
      else if (oauth) { headers["authorization"] = "Bearer " + oauth.access; headers["anthropic-beta"] = "oauth-2025-04-20"; }
      else return;
      keep = id => id.startsWith("claude");
    } else if (agent === "gpt") {
      const key = getStoredKey("gpt").trim();
      if (!key) return; // ChatGPT 구독(Codex)은 공개 목록 API 없음 — 큐레이트 유지
      url = "https://api.openai.com/v1/models";
      headers = { authorization: "Bearer " + key };
      keep = id => /^(gpt-|o\d|chatgpt)/.test(id);
    } else if (agent === "grok") {
      const key = getStoredKey("grok").trim();
      if (!key) return;
      url = "https://api.x.ai/v1/models";
      headers = { authorization: "Bearer " + key };
      keep = id => id.startsWith("grok");
    } else return; // glm: 목록 API 미지원 — 큐레이트 유지
    try {
      const r = await window.schutz.httpGet(url, headers);
      if (!r.ok || !r.json) { this._modelFetched[agent] = false; return; } // 실패 시 재시도 허용
      const arr = r.json.data || r.json.models || [];
      const ids = arr.map((m: any) => m.id || m.name).filter((x: any): x is string => typeof x === "string" && keep(x));
      // 목록이 큐레이트→실측으로 바뀌면 선택 인덱스가 다른 모델을 가리키므로 slashSel 을 0 으로 리셋(하이라이트 점프 방지)
      if (ids.length) { this._modelCache[agent] = ids; this.setState({ slashSel: 0 }); }
      else this._modelFetched[agent] = false;
    } catch { this._modelFetched[agent] = false; /* 큐레이트 폴백 유지 */ }
  }

  qt(fn: () => void, at: number) { this._timers.push(setTimeout(fn, at)); }
  clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; }

  updDoc(path: string, fn: (arr: DocLine[]) => DocLine[]) {
    this.setState(s => ({ docs: { ...s.docs, [path]: fn(s.docs[path].slice()) } }));
  }
  insertAfter(path: string, afterId: string, ln: DocLine) {
    this.updDoc(path, arr => { const i = arr.findIndex(l => l.id === afterId); arr.splice(i + 1, 0, ln); return arr; });
  }
  patchLine(path: string, id: string, patch: Partial<DocLine>) {
    this.updDoc(path, arr => arr.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  setMsg(id: string, patch: Partial<ChatMsg>) {
    this.setState(s => ({ messages: s.messages.map(m => m.id === id ? { ...m, ...patch } : m) }));
  }
  setPlan(i: number, st: PlanItem["st"]) {
    this.setState(s => ({ plan: s.plan.map((p, j) => j === i ? { ...p, st } : p) }));
  }
  addTool(id: string, agent: string, verb: string, path: string) {
    this.setState(s => ({ tools: [...s.tools, { id, agent, verb, path, st: "run", note: "" }] }));
  }
  setTool(id: string, patch: Partial<ToolItem>) {
    this.setState(s => ({ tools: s.tools.map(t => t.id === id ? { ...t, ...patch } : t) }));
  }
  setAgent(id: string, patch: Partial<AgentState>) {
    this.setState(s => ({ agents: { ...s.agents, [id]: { ...s.agents[id], ...patch } } }));
  }
  /** 토큰 사용량 누적. 금액 계산은 제거됐다 — 구독 경로에서 늘 $0 이라 의미가 없었고,
   *  대신 벤더 헤더의 잔여 할당량을 보여준다(quotaText / quotaTightest). */
  bumpAgent(id: string, tin: number, tout: number) {
    this.setState(s => {
      const a = s.agents[id];
      return { agents: { ...s.agents, [id]: { ...a, tin: a.tin + tin, tout: a.tout + tout } } };
    });
  }
  addFile(path: string, add: number, del: number, agent: string) {
    this.setState(s => ({ files: [...s.files, { path, add, del, agent, status: "pending" }] }));
  }

  startRun(text: string) {
    this.clearTimers();
    const speed = Math.max(0.2, TYPING_SPEED);
    this.setState(s => ({
      running: true, statusKey: "thinking",
      plan: [], tools: [], files: [], chips: {},
      // 현재 레이아웃 슬롯 수에 맞춰 구성 (4 하드코딩 제거)
      docs: freshDocs(),
      tabs: Array.from({ length: s.layout || 1 }, (_, i) => (i === 0 ? [TM] : [])),
      active: Array.from({ length: s.layout || 1 }, (_, i) => (i === 0 ? TM : "")),
      expanded: null,
      agents: this.freshAgents(),
      messages: [...s.messages, { id: "u" + (this._uid++), role: "user" as const, text }],
      input: "",
    }));
    let at = 400;
    const q = (d: number, fn: () => void) => { at += d; this.qt(fn, at); };

    q(0, () => this.setAgent("claude", { status: "plan" }));
    const aiId = "a" + (this._uid++);
    const reply = "요청을 분석해 작업을 분배합니다. 제가 token-manager.ts의 스케줄러 구현을 맡고, GPT에 타입 정의를, Grok에 문서 갱신을 위임합니다. 세 파일은 락으로 격리되어 동시에 진행돼도 충돌하지 않습니다.";
    q(500, () => this.setState(s => ({ messages: [...s.messages, { id: aiId, role: "ai" as const, who: "Claude · 관리자", text: "", streaming: true }] })));
    for (let i = 3; i <= reply.length + 2; i += 3) {
      const cut = Math.min(i, reply.length);
      q(22, () => this.setMsg(aiId, { text: reply.slice(0, cut) }));
    }
    q(50, () => { this.setMsg(aiId, { streaming: false }); this.bumpAgent("claude", 2140, 96); });

    const planItems = [
      { label: "TokenManager 구조 파악", agent: "claude" },
      { label: "자동 갱신 스케줄러 구현", agent: "claude" },
      { label: "옵션 타입 정의 반영", agent: "gpt" },
      { label: "문서 갱신", agent: "grok" },
    ];
    q(250, () => this.setState({ plan: planItems.map((p, i) => ({ id: "p" + i, ...p, st: i === 0 ? "active" as const : "pending" as const })) }));

    q(350, () => { this.setState({ statusKey: "tool" }); this.setAgent("claude", { status: "edit", file: TM }); this.addTool("t1", "claude", "읽기", TM); });
    q(600, () => { this.setTool("t1", { st: "done", note: "2.1 KB" }); this.bumpAgent("claude", 5240, 0); });
    q(250, () => this.addTool("t2", "claude", "읽기", TY));
    q(450, () => { this.setTool("t2", { st: "done", note: "0.6 KB" }); this.bumpAgent("claude", 1830, 0); this.setPlan(0, "done"); });

    // 위임: 페인 분할·락·동시 타이핑 체인
    q(400, () => {
      this.setState({ tabs: [[TM], [TY], [MD], []], active: [TM, TY, MD, ""] });
      this.setPlan(1, "active"); this.setPlan(2, "active"); this.setPlan(3, "active");
      this.setAgent("gpt", { status: "edit", file: TY });
      this.setAgent("grok", { status: "edit", file: MD });
      this.addTool("t3", "claude", "편집", TM);
      this.addTool("t4", "gpt", "편집", TY);
      this.addTool("t5", "grok", "편집", MD);
    });

    const defs = hunkDefs();
    const typeChain = (cur: { at: number }, hk: string) => {
      const def = defs[hk];
      const cq = (d: number, fn: () => void) => { cur.at += d; this.qt(fn, cur.at); };
      const cqa = (d: number, fn: () => void) => { this.qt(fn, cur.at + d); };
      if (def.removeId) cq(140, () => this.patchLine(def.path, def.removeId!, { kind: "removed", hunk: hk }));
      let prev = def.afterId;
      const ids: string[] = [];
      def.lines.forEach((full, li) => {
        const id = hk + "n" + li;
        ids.push(id);
        const pid = prev;
        cq(70, () => this.insertAfter(def.path, pid, { id, text: "", full, kind: "typing", hunk: hk }));
        for (let c = 2; c < full.length + 2; c += 3) {
          const cut = Math.min(c, full.length);
          cq(Math.round(26 / speed), () => this.patchLine(def.path, id, { text: full.slice(0, cut) }));
          if (c % 12 === 2) cqa(0, () => this.bumpAgent(def.agent, 0, 9));
        }
        cq(20, () => this.patchLine(def.path, id, { text: full, kind: "fresh" }));
        prev = id;
      });
      if (def.chip && SHOW_REASONS) {
        cq(150, () => this.setState(s => ({ chips: { ...s.chips, [hk]: { text: def.chip, op: 1 } } })));
        cqa(3200, () => this.setState(s => s.chips[hk] ? { chips: { ...s.chips, [hk]: { ...s.chips[hk], op: 0 } } } as any : null));
        cqa(4400, () => this.setState(s => { const c = { ...s.chips }; delete c[hk]; return { chips: c }; }));
      }
      cq(600, () => this.updDoc(def.path, arr => arr.map(l => ids.includes(l.id) && l.kind === "fresh" ? { ...l, kind: "pending" } : l)));
    };

    const t0 = at + 500;
    const curC = { at: t0 }, curG = { at: t0 + 900 }, curK = { at: t0 + 1600 };
    typeChain(curC, "A"); typeChain(curC, "C"); typeChain(curC, "B");
    this.qt(() => { this.setTool("t3", { st: "done", note: "+13 −1" }); this.addFile(TM, 13, 1, "claude"); this.setPlan(1, "done"); this.setAgent("claude", { status: "review", file: null }); this.bumpAgent("claude", 0, 262); }, curC.at += 250);
    typeChain(curG, "T");
    this.qt(() => { this.setTool("t4", { st: "done", note: "+4 −0" }); this.addFile(TY, 4, 0, "gpt"); this.setPlan(2, "done"); this.setAgent("gpt", { status: "review", file: null }); this.bumpAgent("gpt", 1620, 96); }, curG.at += 250);
    typeChain(curK, "D");
    this.qt(() => { this.setTool("t5", { st: "done", note: "+6 −0" }); this.addFile(MD, 6, 0, "grok"); this.setPlan(3, "done"); this.setAgent("grok", { status: "review", file: null }); this.bumpAgent("grok", 980, 118); }, curK.at += 250);

    const endAt = Math.max(curC.at, curG.at, curK.at) + 500;
    const doneId = "a" + (this._uid++);
    this.qt(() => this.setState(s => ({
      running: false, statusKey: "review",
      messages: [...s.messages, { id: doneId, role: "ai" as const, who: "Claude · 관리자", text: "세 에이전트의 작업이 모두 끝났습니다. 3개 파일 +23 −1, 충돌 없음. 변경 검토에서 파일별 diff를 확인하고 처리해 주세요." }],
    })), endAt);
  }

  /** 특정 에이전트만 중지 */
  stopAgent(id: string) {
    // 레지스트리가 agentId → 현재 runId 를 풀어 취소 훅을 부른다.
    // 컨트롤러를 여기서 지우지 않는 게 요점 — 레코드가 남아 있어야 그 실행의 finally 가
    // "내가 아직 현재인가" 를 물어볼 수 있다(밀려났으면 정리를 건너뛴다).
    const runId = this.engine.runs.cancelAgent(id);
    if (!runId) return;
    // 승인 대기는 abort 로 안 깨진다(answerRun 만 resolve 한다). 중지가 그걸 거절로 풀어주지
    // 않으면 그 실행의 finally 가 영영 안 오고, running 이 모달을 답할 때까지 잡힌다.
    if (this.state.askRun?.agent === id) this.answerRun(false);
    for (const [rel, holder] of [...this.fileLocks.entries()]) if (holder === runId) this.fileLocks.delete(rel);
    this.setAgent(id, { status: "stop", file: null });
    // 인라인 편집·MCP 생성은 세지 않는다 — 예전엔 abortCtls.size 라 그것들까지 셌고,
    // 루프 쪽 판정(아래 finally)과 서로 달랐다. 두 곳을 같은 기준으로 맞춘다.
    if (!this.engine.runs.hasActiveAgentRuns()) this.setState({ running: false, statusKey: "stopped" });
  }

  stopRun() {
    for (const id of this._runIds) { try { window.schutz?.runStop(id); } catch { /* */ } }
    this._runIds.clear();
    // cliBusy 도 반드시 내린다 — 종료 IPC 를 놓치면 이 값이 true 로 굳어
    // 이후 모든 Enter 가 조용히 무시되고 재시작 말곤 복구가 없었다
    this.setState({ cliBusy: false });
    if (this.state.cliBusy && window.schutz) window.schutz.cliStop();
    // 전역 중지 — 역할을 가리지 않고 전부(인라인 편집·MCP 생성 포함).
    // 레코드는 남긴다: 각 루프의 finally 가 finish() 로 자기 정리를 마무리한다.
    this.engine.runs.cancelAll();
    if (this._askRunResolve) this.answerRun(false);
    this.abortCtls.clear();
    this.fileLocks.clear();
    this.clearTimers();
    this.setState(s => ({
      running: false, statusKey: "stopped",
      plan: s.plan.map(p => p.st === "active" ? { ...p, st: "stopped" as const } : p),
      tools: s.tools.map(t => t.st === "run" ? { ...t, st: "stopped" as const, note: "중지" } : t),
      docs: Object.fromEntries(Object.entries(s.docs).map(([k, arr]) => [k, arr.map(l => (l.kind === "typing" || l.kind === "fresh") ? { ...l, kind: "pending" as const } : l)])),
      messages: s.messages.map(m => m.streaming ? { ...m, streaming: false } : m),
      agents: Object.fromEntries(Object.entries(s.agents).map(([k, a]) => [k, (a.status === "edit" || a.status === "plan") ? { ...a, status: "stop" as const, file: null } : a])),
    }));
    this.qt(() => this.setState(s => {
      if (s.statusKey !== "stopped") return null;
      const any = Object.values(s.docs).some(arr => arr.some(l => l.kind === "pending" || l.kind === "removed"));
      return { statusKey: any ? "review" : "idle" } as any;
    }), 1800);
  }

  resolveHunk(path: string, hk: string, accept: boolean) {
    this.updDoc(path, arr => {
      const out: DocLine[] = [];
      for (const l of arr) {
        if (l.hunk !== hk) { out.push(l); continue; }
        if (l.kind === "removed") {
          if (accept) continue;
          out.push({ ...l, kind: "base", hunk: null });
          continue;
        }
        if (accept) out.push({ ...l, kind: "accepted" });
      }
      return out;
    });
    if (accept) this.qt(() => this.updDoc(path, arr => arr.map(l => l.hunk === hk ? { ...l, kind: "base", hunk: null } : l)), 900);
    this.qt(() => this.setState(s => {
      const doc = s.docs[path] || [];
      const open = doc.some(l => l.hunk && (l.kind === "pending" || l.kind === "removed" || l.kind === "typing" || l.kind === "fresh"));
      if (open) return null;
      return { files: s.files.map(f => f.path === path && f.status === "pending" ? { ...f, status: (accept ? "accepted" : "rejected") as ReviewFile["status"] } : f) } as any;
    }), 40);
  }

  openHunks(path: string): string[] {
    const doc = this.state.docs[path] || [];
    const set = new Set<string>();
    doc.forEach(l => { if (l.hunk && (l.kind === "pending" || l.kind === "removed")) set.add(l.hunk); });
    return [...set];
  }
  resolveFile(path: string, accept: boolean) { this.openHunks(path).forEach(hk => this.resolveHunk(path, hk, accept)); }
  resolveAll(accept: boolean) { this.state.files.filter(f => f.status === "pending").forEach(f => this.resolveFile(f.path, accept)); }

  /** 파일을 포커스된 슬롯의 탭으로 연다 (이미 어느 슬롯에 열려 있으면 그 슬롯을 활성화) */
  openFile(path: string) {
    this._touchMru(path);
    this._cancelPendingClose(path); // 닫힘 애니 중 재오픈 시 뒤늦은 제거 취소
    this.setState(s => {
      const existing = s.tabs.findIndex(t => t.includes(path));
      if (existing >= 0) {
        this._focusSlot = existing;
        return { active: s.active.map((a, i) => (i === existing ? path : a)) } as any;
      }
      const slot = Math.min(Math.max(0, this._focusSlot), s.layout - 1);
      const tabs = s.tabs.map((t, i) => (i === slot ? [...t, path] : t));
      const active = s.active.map((a, i) => (i === slot ? path : a));
      return { tabs, active } as any;
    }, () => {
      // selectTab 과 같은 이유로 포커스를 준다 — 이게 없어서 트리에서 연 파일은
      // paneRegistry.focused 가 null 인 채였다. 새 페인은 마운트가 한 박자 늦어
      // 다음 프레임에 다시 시도한다.
      const focus = () => { try { paneRegistry.panes.get(path)?.editor.focus(); } catch { /* */ } };
      focus();
      requestAnimationFrame(focus);
    });
  }

  // ── 채팅 컨텍스트 첨부 ──
  addFileAttach(rel: string) {
    this.setState(s => {
      if (s.attach.some(a => a.kind === "file" && a.rel === rel)) return { attachPickerOpen: false, attachQuery: "" } as any;
      return { attach: [...s.attach, { kind: "file", rel, label: rel.split("/").pop() ?? rel }], attachPickerOpen: false, attachQuery: "" } as any;
    });
  }
  /** 포커스된 에디터의 선택 영역을 첨부 */
  attachSelection() {
    const api = paneRegistry.focused;
    if (!api) { this.setState({ gitError: "" }); return; }
    const sel = api.editor.getSelection();
    const model = api.editor.getModel();
    if (!sel || !model || sel.isEmpty()) return;
    const text = model.getValueInRange(sel);
    const label = api.rel.split("/").pop() + ` ${sel.startLineNumber}–${sel.endLineNumber}`;
    this.setState(s => ({ attach: [...s.attach, { kind: "selection", rel: api.rel, text, label }] }));
  }
  removeAttach(i: number) {
    this.setState(s => ({ attach: s.attach.filter((_, idx) => idx !== i) }));
  }
  /** 첨부를 소비해 AI 컨텍스트 블록 + 표시용 요약을 만든다 */
  private async consumeAttachments(): Promise<{ block: string; summary: string }> {
    const items = this.state.attach;
    if (!items.length) return { block: "", summary: "" };
    const ws = this.state.workspace;
    const parts: string[] = [];
    for (const a of items) {
      if (a.kind === "selection") {
        parts.push(`# 선택 영역 (${a.label})\n\`\`\`\n${(a.text ?? "").slice(0, 12_000)}\n\`\`\``);
      } else if (ws && window.schutz) {
        try {
          const content = await window.schutz.readFile(ws.root, a.rel);
          parts.push(`# 파일 ${a.rel}\n\`\`\`\n${content.slice(0, 20_000)}\n\`\`\``);
        } catch { /* 무시 */ }
      }
    }
    const summary = items.map(a => (a.kind === "selection" ? "✂ " : "@") + a.label).join(", ");
    this.setState({ attach: [] });
    return { block: parts.length ? "\n\n--- 첨부 컨텍스트 ---\n" + parts.join("\n\n") : "", summary };
  }

  /** 슬롯에서 특정 탭 활성화 */
  selectTab(slot: number, rel: string) {
    this._focusSlot = slot;
    this._touchMru(rel);
    this._cancelPendingClose(rel); // 닫힘 애니 중 재선택 시 뒤늦은 제거 취소
    // 탭 전환 후 에디터에 포커스 → paneRegistry.focused 세팅(그 전엔 null 이라 save/format 이 no-op 되던 문제)
    this.setState(s => ({ active: s.active.map((a, i) => (i === slot ? rel : a)) } as any),
      () => { try { paneRegistry.panes.get(rel)?.editor.focus(); } catch { /* */ } });
  }

  private _leftCol: HTMLDivElement | null = null;
  private _dragTab: { slot: number; rel: string } | null = null;
  /** 탭 드래그 재정렬 (같은 슬롯 내) */
  reorderTab(slot: number, targetRel: string) {
    const d = this._dragTab;
    this._dragTab = null;
    if (!d || d.slot !== slot || d.rel === targetRel) return;
    this.setState(s => {
      const arr = [...(s.tabs[slot] ?? [])];
      const from = arr.indexOf(d.rel);
      if (from < 0) return null;
      arr.splice(from, 1);
      // 제거 후 타깃 위치를 다시 계산 — left→right 드래그 시 한 칸 밀리는 off-by-one 방지
      const to = arr.indexOf(targetRel);
      if (to < 0) return null;
      arr.splice(to, 0, d.rel);
      return { tabs: s.tabs.map((t, i) => (i === slot ? arr : t)) } as any;
    });
  }

  setLayout(n: number) {
    this.setState(s => {
      const { tabs, active } = this.normSlots(s.tabs, s.active, n);
      if (this._focusSlot >= n) this._focusSlot = n - 1;
      return { layout: n, tabs, active, openMenu: null } as any;
    });
  }

  /** 탭 닫기 (미저장이면 확인 후) */
  closeTab(slot: number, rel: string) {
    if (this.isDirtyRel(rel) && this.isOpen(rel)) {
      // 같은 파일이 다른 슬롯에도 열려 있지 않을 때만 데이터 유실 → 확인
      const openCount = this.state.tabs.reduce((n, t) => n + (t.includes(rel) ? 1 : 0), 0);
      if (openCount <= 1) { this.openO({ askClose: { rel, slot } }); return; }
    }
    this._removeTab(slot, rel);
  }

  private _closeTabTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 대기 중인 닫기 애니메이션 취소 — 재오픈/선택 시 뒤늦게 탭이 제거되는 것 방지 */
  private _cancelPendingClose(rel: string) {
    let changed = false;
    for (const [key, tid] of this._closeTabTimers) {
      if (key.endsWith(":" + rel)) { clearTimeout(tid); this._closeTabTimers.delete(key); changed = true; }
    }
    if (changed) this.setState(s => ({ closingTabs: s.closingTabs.filter(k => !k.endsWith(":" + rel)) }));
  }
  private _removeTab(slot: number, rel: string) {
    const key = slot + ":" + rel;
    if (this.state.closingTabs.includes(key)) return;
    // 탭을 곧바로 제거하지 않고 szTabOut 재생 후 언마운트.
    // 전용 타이머 — clearTimers()(startRun/stopRun) 가 이 닫기 타이머를 지워 좀비탭(닫힘 상태 영구 고착)이 되지 않도록 _timers 풀 밖에 둔다.
    this.setState(s => ({ closingTabs: [...s.closingTabs, key] }));
    const tid = setTimeout(() => {
      this._closeTabTimers.delete(key);
      this.setState(s => ({ closingTabs: s.closingTabs.filter(k => k !== key) }));
      this._doRemoveTab(slot, rel);
    }, 200);
    this._closeTabTimers.set(key, tid);
  }

  /** 프리뷰 탭이 닫히면 그 탭이 띄운 서버도 함께 내린다 — 안 그러면 포트가 계속 잡혀 있다 */
  private _stopBgFor(rel: string) {
    const id = this._bgRuns.get(rel);
    if (!id) return;
    this._bgRuns.delete(rel);
    try { window.schutz?.runStop(id); } catch { /* 이미 죽음 */ }
  }

  private _doRemoveTab(slot: number, rel: string) {
    this.setState(s => {
      // 지연 제거 중 레이아웃이 바뀌어 slot 인덱스가 무효해졌으면, rel 을 가진 슬롯을 찾아 대상 보정
      if (slot >= s.tabs.length || !(s.tabs[slot] ?? []).includes(rel)) {
        const alt = s.tabs.findIndex(t => t.includes(rel));
        if (alt >= 0) slot = alt;
      }
      const closedIdx = (s.tabs[slot] ?? []).indexOf(rel);
      const tabs = s.tabs.map((t, i) => (i === slot ? t.filter(x => x !== rel) : t));
      // 활성 탭을 닫으면 마지막이 아니라 이웃(제거 위치로 밀려온 탭, 없으면 이전 탭)을 활성화
      const active = s.active.map((a, i) => (i === slot && a === rel ? (tabs[i][Math.min(closedIdx, tabs[i].length - 1)] ?? "") : a));
      // 이 슬롯에서 완전히 닫혔고 다른 슬롯에도 없으면 dirty 상태도 정리
      const stillOpen = tabs.some(t => t.includes(rel));
      const paneDirty = stillOpen ? s.paneDirty : (() => { const d = { ...s.paneDirty }; delete d[rel]; return d; })();
      return { tabs, active, paneDirty } as any;
    // 리듀서는 순수하게 두고, 커밋 후에 서버를 내린다 (StrictMode 이중 호출 방지)
    }, () => { if (!this.allOpen().includes(rel)) this._stopBgFor(rel); });
  }

  /** 미저장 확인 모달의 세 선택지 */
  private async confirmCloseSave() {
    const a = this.state.askClose; if (!a) return;
    await paneRegistry.panes.get(a.rel)?.save();
    this._removeTab(a.slot, a.rel);
    this.setState({ askClose: null });
  }
  private confirmCloseDiscard() {
    const a = this.state.askClose; if (!a) return;
    // 공유 모델을 디스크 원본으로 되돌린다 — 안 하면 버려진 편집이 dirtyRels 에 남아
    // 이후 saveAll(Ctrl+Shift+S)/F2 리네임 시 디스크에 써지거나 재열람 시 다시 나타남
    const ws = this.state.workspace;
    if (ws) {
      const m = projectModels.getByRel(a.rel);
      const saved = projectModels.getSaved(ws.root, a.rel);
      if (m && saved !== undefined && m.getValue() !== saved) m.setValue(saved);
    }
    this._removeTab(a.slot, a.rel);
    this.setState({ askClose: null });
  }
  toggleTerm() {
    this.setState(st => ({ termOpen: !st.termOpen, termTab: (st.termTab === "ai" || st.termTab === "problems") ? (st.terms[0]?.id ?? st.termTab) : st.termTab }));
  }

  /** 로컬 슬래시 명령 — AI로 보내지 않고 Schutz가 직접 처리 */
  private schutzSay(userText: string, reply: string) {
    this.setState(s => ({
      input: "",
      messages: [...s.messages,
        { id: "u" + (this._uid++), role: "user" as const, text: userText },
        { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", agent: "schutz", text: reply }],
    }));
  }

  handleSlash(raw: string): boolean {
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const connected = AGDEF.map(d => d.id).filter(id => this.modelOf(id) !== null);
    switch (cmd) {
      case "/help":
        this.openO({ commandsOpen: true, input: "" }); // 채팅 덤프 대신 레퍼런스 모달 (UI)
        return true;
      case "/model": {
        // /model <agent> <model> — 변경
        if (rest.length >= 2) {
          const [ag, model] = rest;
          const ch = this.modelChannel(ag);
          if (!ch) { this.schutzSay(raw, t("sc2.agentNotConnectedOrNoSwitch", { ag })); return true; }
          // 임의 모델 ID 허용 — 최신 모델(목록에 없어도) 그대로 적용
          const known = ch.options.some(o => o.id === model) || (this._modelCache[ag] ?? []).includes(model);
          this.setModelFor(ag, model);
          this.schutzSay(raw, t("sc2.modelChanged", { name: this.agDef(ag).name, model }) + (known ? "" : t("sc2.modelNotInList")) + t("sc2.appliesNextTurn"));
          return true;
        }
        // /model <agent> — 해당 에이전트의 선택지 나열
        if (rest.length === 1) {
          const ag = rest[0];
          const ch = this.modelChannel(ag);
          if (!ch) { this.schutzSay(raw, t("sc2.agentNotConnected", { ag })); return true; }
          const opts = ch.options.map(o => `${o.id === ch.current ? "● " : "○ "}\`${o.id}\` — ${o.label}`).join("\n");
          this.schutzSay(raw, t("sc2.modelListForAgent", { name: this.agDef(ag).name, opts, ag }));
          return true;
        }
        // /model — 전체 현황 + 선택지
        if (!connected.length) { this.schutzSay(raw, t("sc2.noConnectedAgents")); return true; }
        const blocks = connected.map(id => {
          const m = this.modelOf(id) ?? "?";
          const ch = this.modelChannel(id);
          const price = this.isSubscription(id) ? t("sc2.subscriptionIncluded") : "";
          const head = `${this.agDef(id).name}: \`${m}\` (${price})`;
          if (!ch) return head;
          const alts = ch.options.filter(o => o.id !== ch.current).map(o => o.id).join(", ");
          return alts ? t("sc2.switchable", { head, alts }) : head;
        }).join("\n");
        this.schutzSay(raw, t("sc2.modelStatusHeader") + blocks + t("sc2.modelChangeHint"));
        return true;
      }
      case "/usage":
      case "/cost": {
        this.openO({ usageOpen: true, input: "" }); // 채팅 대신 대시보드 UI
        return true;
      }
      case "/agents": {
        const lines = AGDEF.map(d => {
          const m = this.modelOf(d.id);
          return `${d.name}: ${m ? t("sc2.connectedWith", { model: m }) : t("sc2.notConnected")}`;
        }).join("\n");
        this.schutzSay(raw, lines + t("sc2.connectionMgmtHint"));
        return true;
      }
      case "/new":
        // 지우는 게 아니라 닫고 새로 연다 — 최근 항목에 남는다.
        this.newConversation();
        return true;
      case "/clear":
        // 이건 말 그대로 "지우기" 다. 지금 대화를 비우고 저장분도 없앤다.
        this.history = [];
        this.engine.reset();
        this._cliSession = null;
        this._codexSession = null;
        this.clearSession();
        this.setState({ messages: [], tools: [], proposals: [], input: "" });
        return true;
      case "/settings":
      case "/config":
        this.openO({ settingsOpen: true, input: "" });
        return true;
      case "/keys":
      case "/shortcuts":
        this.openO({ keysOpen: true, input: "" });
        return true;
      case "/vim": {
        const ed = getEditorPrefs();
        const next = ed.keymap === "vim" ? "intellij" : "vim";
        setEditorPrefs({ keymap: next });
        this.forceUpdate();
        this.schutzSay(raw, next === "vim" ? t("sc2.vimOn") : t("sc2.vimOff"));
        return true;
      }
      case "/theme":
        this.cycleTheme();
        this.setState({ input: "" });
        return true;
      case "/terminal":
        this.toggleTerm();
        this.setState({ input: "" });
        return true;
      case "/diff":
      case "/git":
        this.setState({ leftTab: "git", input: "" });
        void this.loadGit();
        return true;
      case "/resume":
      case "/continue": {
        const ca = this.state.cliAgents;
        const who = ca.claude?.ok ? "claude" : ca.codex?.ok ? "codex" : null;
        if (!window.schutz || !who) { this.schutzSay(raw, t("sc2.resumeNeedsCli")); return true; }
        if (!this.state.workspace) { this.schutzSay(raw, t("sc2.resumeOpenProject")); return true; }
        this.runCliTurn(who, "직전 작업을 이어서 계속 진행해줘.", true);
        return true;
      }
      case "/doctor":
      case "/status": {
        this.setState({ input: "" });
        void (async () => {
          if (window.schutz) { try { const r = await window.schutz.cliCheck(); this.setState({ cliAgents: r.agents ?? {} }); } catch { /* */ } }
          const cli = this.state.cliAgents;
          const lines: string[] = [];
          lines.push(t("sc2.connectionStatus"));
          for (const d of AGDEF) { const m = this.modelOf(d.id); lines.push(`  ${d.name}: ${m ? t("sc2.connectedDot", { model: m }) : t("sc2.notConnected")}`); }
          lines.push("\nCLI");
          lines.push(`  Claude Code: ${cli.claude?.ok ? t("sc2.installedWith", { version: cli.claude.version || "" }) : t("sc2.notInstalled")}`);
          lines.push(`  Codex: ${cli.codex?.ok ? t("sc2.installedWith", { version: cli.codex.version || "" }) : t("sc2.notInstalled")}`);
          lines.push(t("sc2.workspaceLabel") + (this.state.workspace ? this.state.workspace.name : t("sc2.none")));
          lines.push(t("sc2.sessionClaude") + (this._cliSession ? t("sc2.resumed") + "(" + this._cliSession.slice(0, 8) + "…)" : t("sc2.newSession")) + t("sc2.sessionCodex") + (this._codexSession ? t("sc2.resumed") : t("sc2.newSession")));
          this.schutzSay(raw, lines.join("\n"));
        })();
        return true;
      }
      case "/login": {
        const id = rest[0] === "codex" ? "codex" : "claude";
        this.openO({ settingsOpen: true, input: "" });
        void this.startOauth(id);
        return true;
      }
      case "/logout": {
        const id = rest[0] === "codex" ? "codex" : "claude";
        // 토큰은 "codex" 키로 저장된다(main.cjs 가 provider:"codex" 로 내려줌).
        // 예전엔 "gpt" 를 지워서 /logout codex 후에도 연결된 것처럼 남았다.
        setOAuth(id, null);
        this.setState(st => ({ oauthTick: st.oauthTick + 1, input: "" }));
        this.schutzSay(raw, t("sc2.loggedOut", { provider: id === "codex" ? "Codex/ChatGPT" : "Claude" }));
        return true;
      }
      case "/memory": {
        this.setState({ input: "" });
        const isCodex = rest[0] === "codex";
        const file = isCodex ? "AGENTS.md" : "CLAUDE.md";
        if (!this.state.workspace) { this.schutzSay(raw, t("sc2.openFileNeedsProject", { file })); return true; }
        const exists = this.state.workspace.entries.some(e => !e.dir && e.rel === file);
        if (exists) this.openFile(file);
        else this.schutzSay(raw, t("sc2.fileMissing", { file }));
        return true;
      }
      case "/preview": {
        // 인자를 생략하면 마지막으로 띄운 서버 주소를 다시 연다
        const raw2 = rest.join(" ").trim() || this._lastPreviewUrl || "";
        if (!raw2) { this.schutzSay(raw, t("sc2.previewNeedsUrl")); return true; }
        const url = /^https?:\/\//i.test(raw2) ? raw2 : "http://" + raw2;
        this.openPreview(url);
        this.setState({ input: "" });
        return true;
      }
      case "/mcp":
        this.openMcp();
        this.setState({ input: "" });
        return true;
      default:
        if (cmd.startsWith("/")) {
          this.schutzSay(raw, t("sc2.unknownCommand") + cmd + t("sc2.helpHint"));
          return true;
        }
        return false;
    }
  }

  /** Claude Code/Codex 명령 포워딩 — 해당 CLI 세션에서 실제 실행 */
  private forwardSlash(raw: string): boolean {
    const token = raw.split(/\s+/)[0];
    const cand = SLASH_COMMANDS.filter(c => c.cmd === token && c.origin !== "schutz");
    if (!cand.length || !window.schutz) return false;
    const pick = cand.find(c => c.origin === "claude" && this.state.cliAgents.claude?.ok)
      ?? cand.find(c => c.origin === "codex" && this.state.cliAgents.codex?.ok);
    if (!pick) {
      this.schutzSay(raw, t("sc2.thisCommandIs") + cand.map(c => ORIGIN_LABEL[c.origin]).join("/") + t("sc2.commandNeedsCli"));
      return true;
    }
    if (!this.state.workspace) {
      this.schutzSay(raw, "`" + token + t("sc2.needsProjectContext"));
      return true;
    }
    this.runCliTurn(pick.origin, raw, token === "/compact");
    return true;
  }

  /** 발견된 커스텀 명령 실행 — claude는 원문 포워딩(자체 확장), codex는 body 치환 후 전달 */
  private handleDiscoveredSlash(raw: string): boolean {
    const parts = raw.trim().split(/\s+/);
    const name = parts[0].replace(/^\//, "");
    const args = parts.slice(1).join(" ");
    const cmd = this.findAgentCommand(name);
    if (!cmd || !window.schutz) return false;
    if (!this.state.workspace) { this.schutzSay(raw, "`/" + name + t("sc2.needsProjectContext2")); return true; }
    if (cmd.origin === "claude") {
      this.runCliTurn("claude", raw, false); // Claude Code가 커스텀 명령을 자체 확장
    } else {
      const expanded = this.expandCommandBody(cmd.body, args); // codex exec는 확장 안 함 → body 치환
      this.runCliTurn("codex", expanded, false);
    }
    return true;
  }
  private expandCommandBody(body: string, args: string): string {
    const argv = args.length ? args.split(/\s+/) : [];
    return body.replace(/\$ARGUMENTS/g, args).replace(/\$(\d+)/g, (_m, n) => argv[Number(n) - 1] ?? "");
  }

  async send() {
    const rawIn = this.state.input.trim();
    this._recallIdx = -1;                                    // 소환 위치 초기화
    if (rawIn) this.clearDraft();
    if (rawIn.startsWith("/")) {
      if (this.forwardSlash(rawIn)) return;
      if (this.handleDiscoveredSlash(rawIn)) return;
      if (this.handleSlash(rawIn)) return;
    }
    // 실행 중에는 여기서 막는다 — 예전엔 아래 consumeAttachments 가 첨부를 비운 뒤에야
    // runReal/runCliTurn 이 조용히 return 해서, 사용자가 모아둔 첨부가 통째로 날아갔다.
    if (this.state.running || this.state.cliBusy) { this.toast("info", t2("chat.busyHint")); return; }
    const hasAttach = this.state.attach.length > 0;
    // 데스크톱: 빈 입력 + 첨부 없음이면 아무것도 보내지 않는다 (데모 프롬프트가 실제 AI로 나가는 것 방지).
    // 데모 문자열은 웹 프리뷰 자동재생 전용.
    if (!rawIn && !hasAttach && window.schutz) return;
    const t = rawIn || (hasAttach ? "첨부한 컨텍스트를 참고해서 진행해줘." : "TokenManager에 자동 갱신을 추가하고, 타입과 문서도 같이 맞춰줘");
    const { block, summary } = await this.consumeAttachments();
    const display = summary ? t + "\n📎 " + summary : t;
    // 1순위: 앱 내 연결된 계정(OAuth) 또는 API 키 — Schutz 통합 에이전트 루프
    if (this.configuredAgents().length > 0) { void this.runReal(t + block, display); return; }
    // 2순위(폴백): 로컬에 설치된 구독 CLI
    if (window.schutz) {
      const ca = this.state.cliAgents;
      if (ca.claude?.ok) { this.runCliTurn("claude", t + block); return; }
      if (ca.codex?.ok) { this.runCliTurn("codex", t + block); return; }
    }
    // 데스크톱 앱: 데모 대신 연결 안내 (데모는 웹 프리뷰 전용)
    if (window.schutz) {
      this.setState(s => ({
        input: "",
        messages: [...s.messages,
          { id: "u" + (this._uid++), role: "user" as const, text: t },
          { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", text: "아직 연결된 AI가 없습니다.\n\n설정(⚙)을 열고 [로그인]을 눌러 Claude 또는 ChatGPT 계정으로 연결하세요 (구독 사용, API 키 불필요). API 키 방식도 지원합니다." }],
      }), () => this.saveSession());
      return;
    }
    this.startRun(t);
  }

  /** 설정된 프로바이더 id 목록 */
  private configuredAgents(): string[] {
    return Object.keys(this.providers).filter(id => this.providers[id].isConfigured());
  }

  /** 도구 실행 (워크스페이스 모드, 에이전트별) */
  /** 실행 중 MCP 서버의 도구를 provider ToolDef 로 변환 (mcp__server__tool) */
  private mcpToolDefs(): ToolDef[] {
    return mcp.getMcpTools().map(t => ({
      name: mcp.mcpToolName(t.server, t.name),
      description: (t.description ? t.description + " " : "") + `[MCP: ${t.server}]`,
      input_schema: (t.inputSchema && typeof t.inputSchema === "object") ? t.inputSchema : { type: "object", properties: {} },
    }));
  }

  /**
   * 사이드플로(인라인 편집·MCP 생성) 실행 종료. 에이전트 루프와 달리 락·상태 정리가 없어서
   * 컨트롤러 해제와 레코드 종료만 하면 된다. runId 가 비어 있으면(시작 전 실패) 무시한다.
   */
  private endInlineRun(runId: string, status: "done" | "aborted") {
    if (!runId) return;
    this.abortCtls.delete(runId);
    this.engine.runs.finish(runId, status);
  }

  /** 락 소유 runId → 표시용 에이전트 이름. 레코드가 사라졌으면 id 를 그대로 보여준다. */
  private lockHolderName(holderRunId: string): string {
    const rec = this.engine.runs.get(holderRunId);
    return rec ? this.agDef(rec.agentId).name : holderRunId;
  }

  /** runId 는 파일 락 소유자로 기록된다 — 낡은 실행이 새 실행의 락을 풀지 않게. */
  private async execTool(agentId: string, call: ToolCall, runId: string): Promise<string> {
    // MCP 도구 — 워크스페이스와 무관하게 실행
    if (mcp.isMcpToolName(call.name)) {
      const r = mcp.resolveMcpTool(call.name);
      if (!r) return "오류: 알 수 없는 MCP 도구 " + call.name;
      const mid = "rt" + (this._uid++);
      this.addTool(mid, agentId, "MCP", r.server + "·" + r.tool);
      try {
        const out = await mcp.callTool(r.server, r.tool, call.input ?? {});
        this.setTool(mid, { st: "done", note: r.tool });
        return out;
      } catch (e) {
        this.setTool(mid, { st: "done", note: t("sc2.noteError") });
        return "MCP 오류: " + (e instanceof Error ? e.message : String(e));
      }
    }
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return "오류: 워크스페이스가 열려 있지 않습니다.";
    const toolId = "rt" + (this._uid++);
    try {
      if (call.name === "list_files") {
        this.addTool(toolId, agentId, t("sc2.verbList"), ws.name);
        const list = ws.entries.filter(e => !e.dir).map(e => e.rel).join("\n");
        this.setTool(toolId, { st: "done", note: t("sc2.noteCount", { n: ws.entries.filter(e => !e.dir).length }) });
        return list || "(빈 워크스페이스)";
      }
      if (call.name === "read_file") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, t("sc2.verbRead"), rel);
        const text = await window.schutz.readFile(ws.root, rel);
        this.setTool(toolId, { st: "done", note: (text.length / 1024).toFixed(1) + " KB" });
        return text;
      }
      if (call.name === "propose_create") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, t("sc2.verbCreate"), rel);
        const holder = this.fileLocks.get(rel);
        if (holder && holder !== runId) {
          this.setTool(toolId, { st: "done", note: t("sc2.noteLockConflict") });
          return `오류: ${rel} 은(는) ${this.lockHolderName(holder)}이(가) 작업 중입니다 (파일 락).`;
        }
        this.fileLocks.set(rel, runId);
        this.setAgent(agentId, { file: rel });
        const auto = autoAcceptFor(rel, getAutonomy());
        const p: Proposal = {
          id: "pp" + (this._uid++),
          rel,
          find: "",
          replace: String(call.input?.content ?? ""),
          rationale: String(call.input?.rationale ?? t("sc2.rationaleCreate")),
          agent: agentId,
          status: "pending",
          auto,
        };
        this._proposalsById.set(p.id, p); this.setState(s => ({ proposals: [...s.proposals, p] }));
        this.setTool(toolId, { st: "done", note: auto ? t("sc2.noteAutoAccept") : t("sc2.noteProposed") });
        // await — 쓰기가 끝나기 전에 성공을 보고하면 모델이 없는 파일 위에 작업을 쌓는다
        if (auto) { await this.acceptProposal(p.id); return this.autoAcceptResult(p.id, "파일이 자동 수락 정책에 따라 생성되었습니다."); }
        return "파일 생성 제안이 등록되었습니다. 사용자가 수락하면 생성됩니다.";
      }
      if (call.name === "propose_edit") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, t("sc2.verbEdit"), rel);
        // find 빈 값 거부 — 빈 find 는 create 분기로 오라우팅되어 파일 전체를 덮어씀
        if (!String(call.input?.find ?? "")) {
          this.setTool(toolId, { st: "done", note: t("sc2.noteError") });
          return "오류: propose_edit의 find는 비어 있을 수 없습니다. 새 파일은 propose_create 를 사용하세요.";
        }
        // 파일 락: 다른 에이전트가 잡고 있으면 거부
        const holder = this.fileLocks.get(rel);
        if (holder && holder !== runId) {
          this.setTool(toolId, { st: "done", note: t("sc2.noteLockConflict") });
          return `오류: ${rel} 은(는) ${this.lockHolderName(holder)}이(가) 작업 중입니다 (파일 락). 다른 파일을 작업하세요.`;
        }
        this.fileLocks.set(rel, runId);
        this.setAgent(agentId, { file: rel });
        const autoE = autoAcceptFor(rel, getAutonomy());
        const p: Proposal = {
          id: "pp" + (this._uid++),
          rel,
          find: String(call.input?.find ?? ""),
          replace: String(call.input?.replace ?? ""),
          rationale: String(call.input?.rationale ?? t("sc2.rationaleEdit")),
          agent: agentId,
          status: "pending",
          auto: autoE,
        };
        this._proposalsById.set(p.id, p); this.setState(s => ({ proposals: [...s.proposals, p] }));
        this.setTool(toolId, { st: "done", note: autoE ? t("sc2.noteAutoAccept") : t("sc2.noteProposed") });
        this.openFile(rel);
        // await — find 중복/부재로 실패해도 성공을 보고하던 자리. 실패는 실패로 돌려줘야 모델이 자가 수정한다
        if (autoE) { await this.acceptProposal(p.id); return this.autoAcceptResult(p.id, "편집이 자동 수락 정책에 따라 적용되었습니다."); }
        return "편집 제안이 등록되었습니다. 사용자가 변경 검토 패널에서 수락/거절합니다.";
      }
      if (call.name === "run_command") {
        const command = String(call.input?.command ?? "").trim();
        this.addTool(toolId, agentId, t("sc2.verbRun"), command.slice(0, 60));
        if (!command) { this.setTool(toolId, { st: "done", note: t("sc2.noteError") }); return "오류: 빈 명령입니다."; }
        if (!ws || !window.schutz?.runCommand) { this.setTool(toolId, { st: "done", note: t("sc2.noteError") }); return "오류: 워크스페이스가 열려 있지 않습니다."; }

        // 셸 명령은 되돌릴 수 없다 — 자율 정책이 '자율' 이 아니면 사용자에게 묻는다.
        if (getAutonomy().policy !== "auto") {
          const okToRun = await this.askRunApproval(command, String(call.input?.rationale ?? ""), agentId);
          if (!okToRun) {
            this.setTool(toolId, { st: "done", note: t("sc2.noteRejected") });
            return "사용자가 이 명령의 실행을 거절했습니다. 다른 방법을 제안하거나 실행 방법을 안내하세요.";
          }
        }

        const runId = "rc" + (this._uid++);
        this._runIds.add(runId);
        try {
          const bg = !!call.input?.background;
          const r = await window.schutz.runCommand({ id: runId, command, cwd: ws.root, background: bg });
          this._runIds.delete(runId); // 에이전트 중지가 dev 서버까지 죽이면 안 된다 — 아래에서 따로 관리
          if (!r.ok) { this.setTool(toolId, { st: "done", note: t("sc2.noteError") }); return "명령 실행 실패: " + (r.error ?? "알 수 없는 오류"); }
          if (bg) {
            if (r.exitedEarly) {
              this.setTool(toolId, { st: "done", note: t("sc2.noteError") });
              return `서버가 바로 종료됐습니다 (종료 코드 ${r.exitCode}).
--- 출력 ---
${(r.output || "").trim() || "(없음)"}`;
            }
            this.setTool(toolId, { st: "done", note: r.url ? t("sc2.noteServing") : t("sc2.noteRunning") });
            if (r.url) { this._bgRuns.set("preview:" + r.url, runId); this.openPreview(r.url); }
            else this._bgRuns.set("run:" + runId, runId); // 주소를 못 찾아도 앱 종료 때 정리되도록 추적
            return r.url
              ? `서버를 백그라운드로 실행했습니다. 주소: ${r.url}
화면을 편집 그룹에 열었습니다. 프리뷰 탭을 닫으면 서버도 함께 종료됩니다.`
              : `서버를 백그라운드로 실행했지만 주소를 찾지 못했습니다. 출력:
${(r.output || "").slice(0, 2000)}`;
          }
          const code = r.timedOut ? "timeout" : String(r.exitCode);
          this.setTool(toolId, { st: "done", note: r.timedOut ? t("sc2.noteTimeout") : t("sc2.noteExit", { code }) });
          const body = (r.output || "").trim() || "(출력 없음)";
          return [
            `종료 코드: ${code}${r.truncated ? " (출력이 잘렸습니다)" : ""}`,
            "--- 출력 ---",
            body,
          ].join("\n");
        } catch (e) {
          this._runIds.delete(runId);
          this.setTool(toolId, { st: "done", note: t("sc2.noteError") });
          return "명령 실행 실패: " + (e instanceof Error ? e.message : String(e));
        }
      }
      // delegate_task 는 여기 없다 — startDelegation 으로 들어냈다. execTool 은
      // "항상 문자열, 항상 순차" 계약을 지키고, 위임만 라운드 안에서 병렬로 뜬다.
      return "알 수 없는 도구: " + call.name;
    } catch (e) {
      this.setTool(toolId, { st: "done", note: t("sc2.noteError") });
      return "오류: " + (e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 범용 에이전트 루프 — 어떤 프로바이더든 도구를 돌며 작업.
   * 관리자(첫 진입)는 delegate_task로 다른 에이전트를 병렬 가동할 수 있다.
   */
  async runAgentLoop(
    agentId: string,
    seed: NeutralMsg[],
    opts: {
      isManager: boolean; parentRunId?: string; delegationId?: string;
      /** 위임 경로에서는 엔진이 이미 하위 실행 레코드를 만들어 뒀다 — 두 번 만들지 않는다. */
      run?: RunRecord;
      /** 그 레코드의 cancel 훅은 AbortController 보다 먼저 등록돼서, 뒤늦게 연결한다. */
      onCancel?: (fn: () => void) => void;
    },
  ): Promise<DelegationOutcome> {
    const provider = this.providers[agentId];
    const d = this.agDef(agentId);
    const who = d.name + (opts.isManager ? t("sc2.managerSuffix") : "");
    const abort = new AbortController();
    // 실행 레코드를 만들고 그 runId 로 키잉한다. 이 id 가 아래 finally 의 "내가 아직
    // 현재 실행인가" 판정 기준이 된다.
    const run = opts.run ?? this.engine.runs.start({
      agentId,
      role: opts.isManager ? "manager" : "sub",
      parentRunId: opts.parentRunId ?? null,
      delegationId: opts.delegationId ?? null,
      cancel: () => abort.abort(),
    });
    opts.onCancel?.(() => abort.abort());
    this.abortCtls.set(run.runId, abort);
    this.setAgent(agentId, { status: opts.isManager ? "plan" : "edit" });

    const useTools = !!(this.state.workspace && window.schutz);
    const others = this.configuredAgents().filter(id => id !== agentId);
    const tools = useTools
      ? [...(opts.isManager && others.length ? [...WORKSPACE_TOOLS, DELEGATE_TOOL] : WORKSPACE_TOOLS), ...this.mcpToolDefs()]
      : undefined;
    const system =
      schutzSystemPrompt() +
      // 위임 안내는 delegate_task 를 실제로 줄 때만 붙인다 — 도구 조건(others.length)과
      // 반드시 같아야 한다. 예전엔 여기만 조건이 없어서, 프로바이더가 하나뿐일 때
      // "delegate_task 로 위임하세요, 이번 턴에 도구를 부르세요" + 빈 로스터를 주고
      // 정작 그 도구는 안 줬다. 앱이 환각을 만들어 놓고 아래 가드로 모델을 나무라던 셈.
      (opts.isManager && others.length ? MANAGER_SYSTEM_EXTRA + "\n연결된 에이전트: " + others.join(", ") : "") +
      (useTools ? "\n현재 워크스페이스: " + this.state.workspace!.name : "");

    const transcript: NeutralMsg[] = [...seed];
    let finalText = "";
    // 결과를 구조체로 돌려준다 — 부모가 이걸 t() 로 렌더한다(엔진은 산문을 만들지 않는다).
    let rounds = 0;
    let stopCause: StopCause = "end";
    let failMsg = "";

    try {
      for (let round = 0; round < DEFAULT_POLICY.maxRoundsPerRun; round++) {
        rounds = round + 1;
        // 라운드가 진행될수록 빔을 채운다. 몇 라운드 만에 끝날지 미리 알 수 없으므로
        // 남은 거리의 일부씩 좁혀 96% 에 수렴시킨다(끝날 때 finally 가 100% 로 만든다).
        if (opts.isManager) this.setState(s => ({ runProgress: s.runProgress + (0.92 - s.runProgress) * 0.4 }));
        const aiId = "a" + (this._uid++);
        this.setState(s => ({
          messages: [...s.messages, { id: aiId, role: "ai" as const, who, agent: agentId, text: "", streaming: true }],
        }));

        let turnText = "";
        const calls: ToolCall[] = [];
        let stopReason: string = "end";

        for await (const ev of provider.streamAgentTurn({ transcript, system, tools, signal: abort.signal })) {
          if (ev.type === "text") {
            turnText += ev.delta;
            this.setMsg(aiId, { text: turnText });
          } else if (ev.type === "tool_call") {
            calls.push(ev.call);
            this.setState({ statusKey: "tool" });
            if (!opts.isManager) this.setAgent(agentId, { status: "edit" });
          } else if (ev.type === "usage") {
            this.bumpAgent(agentId, ev.inputTokens, ev.outputTokens);
          } else if (ev.type === "stop") {
            stopReason = ev.reason;
          } else if (ev.type === "error") {
            turnText = turnText ? turnText + "\n\n⚠️ " + ev.message : "⚠️ " + ev.message;
            this.setMsg(aiId, { text: turnText });
            stopReason = "error";
            this.maybeRevertModel(agentId, ev.message);
          }
        }
        this.setMsg(aiId, { streaming: false });
        if (!turnText) {
          this.setState(s => ({ messages: s.messages.filter(m => m.id !== aiId) }));
        }
        finalText = turnText || finalText;

        if (stopReason !== "tool_use" || calls.length === 0) break;

        transcript.push({ role: "assistant", text: turnText || undefined, calls });
        // 라운드 안에서 산개 → 수집. 위임을 먼저 전부 띄우고(비차단), 나머지 도구는
        // 예전처럼 순차 실행한 뒤, 결과를 **원래 호출 순서대로** 합친다.
        // 조인 라운드로 미루지 않는 이유: tool_use 하나당 tool_result 하나가 같은 요청
        // 안에 있어야 벤더 규약이 지켜지고, 라운드 상한도 건드리지 않는다.
        const slots: (string | undefined)[] = new Array(calls.length);
        const flying: Promise<unknown>[] = [];
        calls.forEach((c, i) => {
          if (c.name !== "delegate_task") return;
          flying.push(this.startDelegation(run.runId, agentId, c).then(out => { slots[i] = out; }));
        });
        for (let i = 0; i < calls.length; i++) {
          if (calls[i].name === "delegate_task") continue;
          if (abort.signal.aborted) break; // 중지 시 남은 도구 실행/파일쓰기 중단
          slots[i] = await this.execTool(agentId, calls[i], run.runId);
        }
        await Promise.allSettled(flying);
        // 빈 칸을 남기면 tool_use 1:1 tool_result 규약이 깨져 다음 요청이 400 이 된다.
        transcript.push({
          role: "user",
          results: calls.map((c, i) => ({ id: c.id, content: (slots[i] ?? t("engine.notRun")).slice(0, 40_000) })),
        });
        // 여기까지 왔는데 마지막 라운드면 할 일이 남은 채 상한에 걸린 것이다. 자연 종료는
        // 위쪽 break 로 빠지므로 여기 도달하지 않는다 — 예전엔 이 구분이 아예 없었다.
        if (rounds === DEFAULT_POLICY.maxRoundsPerRun) stopCause = "cap";
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        stopCause = "abort";
      } else {
        stopCause = "error";
        failMsg = e instanceof Error ? e.message : String(e);
        this.setState(s => ({
          messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who, agent: agentId, text: "⚠️ " + failMsg }],
        }));
      }
    } finally {
      // 관리자가 위임했다고 말만 하고 실제로는 하위 실행이 안 뜬 경우를 경고한다.
      // 판정 입력이 바뀌었다: 예전엔 execTool 호출 **전에** 켜지는 지역 플래그라
      // 알 수 없는 에이전트·미연결·이미 작업 중 — 거절 셋 다 "위임함"으로 셌다.
      // 사용자가 가장 방치되기 쉬운 경우가 정확히 거기였다. 이제 원장에 물어본다:
      // didDelegate 는 하위 실행이 실제로 떴을 때만 참이다.
      //
      // 정규식은 아직 남긴다. 위임 결과가 정직해졌으니 이 경고는 이제 거의 안 떠야
      // 정상이고, 그 빈도가 Stage 5 에서 이걸 지울 근거가 된다.
      // 한국어일 때만 켜는 이유는 그대로 — 두 정규식이 비대칭이라 다른 언어에선
      // "I am not delegating this" 가 부정 표현을 못 만나 오탐이 된다.
      const claimsDelegation = /(위임(했|하겠|할게|합니다)|맡겼|맡기겠|시켰)/.test(finalText);
      const hasNegation = /(없습니다|없어요|없습니다만|불가능|할 수 없|못 하|못합니다|뿐(이라|입니다)|지원하지 않)/.test(finalText);
      const reallyDelegated = this.engine.ledger.didDelegate(run.runId);
      if (getLang() === "ko" && opts.isManager && !reallyDelegated && claimsDelegation && !hasNegation) {
        this.setState(s => ({
          messages: [...s.messages, {
            id: "a" + (this._uid++), role: "ai" as const, who: t("sc2.systemNote"), agent: "schutz",
            text: t("sc2.delegateClaimedButNotDone"),
          }],
        }));
      }
      this.abortCtls.delete(run.runId);
      // 이 실행이 아직 이 에이전트의 현재 실행일 때만 정리한다.
      // 중지 직후 같은 에이전트로 새 실행이 시작됐다면 여기 도착한 시점엔 밀려나 있고,
      // 그대로 진행하면 남의 락을 풀고 남의 상태를 덮어쓴다. 그게 그 레이스였다.
      if (this.engine.runs.finish(run.runId, abort.signal.aborted ? "aborted" : "done")) {
        // 이 **실행**의 파일 락 해제 (에이전트 기준이 아니다)
        for (const [rel, holder] of [...this.fileLocks.entries()]) {
          if (holder === run.runId) this.fileLocks.delete(rel);
        }
        const mine = this.state.proposals.some(p => p.agent === agentId && p.status === "pending");
        this.setAgent(agentId, { status: mine ? "review" : "idle", file: null });
        if (opts.isManager && finalText) this.history.push({ role: "assistant", content: finalText });
        // 모든 에이전트 루프가 끝났을 때만 running 해제 (인라인/mcp생성 사이드플로는 세지 않는다)
        if (!this.engine.runs.hasActiveAgentRuns()) {
          // 빔을 100% 로 채운 채 멈춘다(transition 이 끝까지 달린다). running=false 가 되면
          // beamW 가 "100%" 를 쓰므로 runProgress 는 다음 실행 시작 때 다시 0 으로 초기화된다.
          this.setState(s => ({
            running: false, runProgress: 1,
            statusKey: s.proposals.some(p => p.status === "pending") ? "review" : "idle",
          }), () => this.saveSession());
        }
      }
    }

    // 부모(또는 위임 호출자)에게 돌려주는 구조체. 산문은 여기서 만들지 않는다.
    if (stopCause === "abort") return { status: "aborted" };
    if (stopCause === "error") return { status: "failed", message: failMsg };
    return finalText.trim()
      ? { status: "completed", text: finalText, rounds, stopCause }
      : { status: "empty", rounds, stopCause };
  }

  /**
   * 하위 에이전트에게 건너가는 건 위임 프롬프트 문자열뿐이다 — 부모의 대화 기록은
   * 넘어가지 않는다(구조적 한계). 최소한 부모가 지금까지 손댄 파일이라도 실어보낸다.
   */
  private delegationContext(fromAgent: string): string {
    const rels: string[] = [];
    for (const p of this.state.proposals) {
      if (p.agent === fromAgent && !rels.includes(p.rel)) rels.push(p.rel);
    }
    return rels.length ? rels.slice(-8).join("\n") : "";
  }

  /** 거절 태그를 사용자 언어의 문장으로. 엔진은 태그만 알고 문장은 여기서 만든다. */
  private rejectText(reason: RejectReason, target: string): string {
    return t("engine.reject." + reason, {
      target,
      name: this.agDef(target).name,
      roster: this.configuredAgents().map(a => this.agDef(a).name).join(", "),
      max: reason === "per-turn-cap"
        ? DEFAULT_POLICY.maxDelegationsPerTurn
        : DEFAULT_POLICY.maxConcurrentDelegations,
    });
  }

  /**
   * 위임 하나를 시작하고 **실제 결과**를 기다린다.
   *
   * execTool 에서 들어낸 이유: execTool 은 "항상 문자열, 항상 순차" 계약이고 위임은
   * 라운드 안에서 병렬로 떠 있어야 한다.
   *
   * 예전엔 하위가 토큰 하나 내기도 전에 상수 성공 문자열을 동기로 돌려줬다. 모델은
   * 그걸 성공으로 읽고 사실대로 요약했고, 그 요약이 거짓말 취급을 받았다. 채널이
   * 정직하지 않았던 것이지 모델이 거짓말한 게 아니다.
   */
  private startDelegation(parentRunId: string, fromAgent: string, call: ToolCall): Promise<string> {
    const toolId = "t" + (this._uid++);
    const target = String(call.input?.agent ?? "");
    const task = String(call.input?.task ?? "");
    this.addTool(toolId, fromAgent, t("sc2.verbDelegate"), target);

    // cancel 훅은 하위 루프의 AbortController 보다 먼저 등록돼야 해서 상자로 전달한다.
    const box: { cancel: () => void } = { cancel: () => { /* 아직 안 떴다 */ } };
    const res = this.engine.requestDelegation(
      { parentRunId, fromAgent, toAgent: target, task },
      {
        knownAgents: Object.keys(this.providers),
        configuredAgents: this.configuredAgents(),
        busyAgents: this.engine.runs.activeRuns(["manager", "sub"]).map(r => r.agentId),
      },
      () => box.cancel(),
    );

    // 거절도 원장에 남는다. 모델에는 이유와 "그래서 뭘 하라"를 돌려준다 —
    // 조용히 실패하면 같은 위임을 그대로 다시 시도한다.
    if (res.kind === "rejected") {
      this.setTool(toolId, { st: "done", note: t("engine.noteRejected") });
      return Promise.resolve(this.rejectText(res.reason, target));
    }

    const name = this.agDef(target).name;
    this.setTool(toolId, { st: "done", note: t("sc2.noteDelegated") });

    const ctx = this.delegationContext(fromAgent);
    const seedText =
      t("engine.seed", { manager: this.agDef(fromAgent).name, task }) +
      (ctx ? t("engine.seedContext", { context: ctx }) : "");

    const child = this.runAgentLoop(target, [{ role: "user", text: seedText }], {
      isManager: false,
      parentRunId,
      delegationId: res.delegationId,
      run: res.childRun,
      onCancel: fn => { box.cancel = fn; },
    });

    const ms = DEFAULT_POLICY.delegationTimeoutMs;
    let timer = 0;
    const timeout = new Promise<DelegationOutcome>(resolve => {
      timer = window.setTimeout(() => resolve({ status: "timeout", afterMs: ms }), ms);
    });

    return Promise.race([child, timeout]).then(outcome => {
      window.clearTimeout(timer);
      this.engine.ledger.settle(res.delegationId, outcome);
      switch (outcome.status) {
        case "timeout":
          // 만료돼도 자식은 계속 둔다 — 제안은 여전히 검토 패널에 도착한다.
          this.setTool(toolId, { st: "done", note: t("engine.noteTimeout") });
          return t("engine.resultTimeout", { name, sec: Math.round(ms / 1000) });
        case "failed":
          this.setTool(toolId, { st: "done", note: t("engine.noteFailed") });
          return t("engine.resultFailed", { name, message: outcome.message });
        case "aborted":
          return t("engine.resultAborted", { name });
        case "empty":
          return t("engine.resultEmpty", { name });
        default:
          return t("engine.result", { name, text: outcome.text });
      }
    });
  }

  /** Claude Code CLI(구독 인증) 턴 — 편집은 CLI가 직접 수행(acceptEdits), 종료 후 트리·페인 갱신 */
  runCliTurn(agent: string, text: string, cont = false) {
    if (this.state.cliBusy || !window.schutz) return;
    const aiId = "a" + (this._uid++);
    this._cliMsgId = aiId;
    const agentKey = agent === "codex" ? "gpt" : "claude";
    const who = agent === "codex" ? t("sc3.whoCodex") : t("sc3.whoClaude");
    this._cliAgentKey = agentKey;
    this.setState(s => ({
      running: true, cliBusy: true, statusKey: "tool", input: "",
      agents: { ...s.agents, [agentKey]: { ...s.agents[agentKey], status: "edit" } },
      messages: [...s.messages,
        { id: "u" + (this._uid++), role: "user" as const, agent: agentKey, text },
        { id: aiId, role: "ai" as const, who, agent: agentKey, text: "", streaming: true }],
    }));
    if (agent === "codex") this._codexSession = "last"; // 이후 이어가기(--last) 가능 표시
    window.schutz.cliRun({
      agent,
      cwd: this.state.workspace?.root,
      prompt: text,
      resume: cont ? undefined : this._cliSession ?? undefined,
      continue: cont,
    });
  }

  private handleCliEvent(line: string) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { return; }
    const aiId = this._cliMsgId;
    const append = (t: string) => {
      if (!aiId) return;
      // 함수형 업데이트 — 한 이벤트에 여러 블록이 있어도 최신 state 기준으로 누적(유실 방지)
      this.setState(s => ({ messages: s.messages.map(m => m.id === aiId ? { ...m, text: m.text ? m.text + "\n\n" + t : t } : m) }));
    };
    if (ev.type === "system" && ev.subtype === "init") {
      if (ev.session_id) this._cliSession = ev.session_id;
      if (ev.model) this.setState({ cliModel: String(ev.model) });
      return;
    }
    if (ev.type === "assistant" && ev.message?.content) {
      for (const b of ev.message.content) {
        if (b.type === "text" && b.text) append(b.text);
        else if (b.type === "tool_use") {
          const file = b.input?.file_path ?? b.input?.path ?? b.input?.pattern ?? b.input?.command ?? "";
          const verb = /edit|write/i.test(b.name) ? t("sc3.verbEdit") : /read|glob|grep|ls/i.test(b.name) ? t("sc3.verbRead") : t("sc3.verbTool");
          const tid = "cli" + (this._uid++);
          // 어떤 CLI 든 자기 에이전트에 귀속시킨다 — "claude" 하드코딩은 오귀속
          this.addTool(tid, this._cliAgentKey, verb, String(file).split(/[\/]/).slice(-2).join("/") || b.name);
          this.setTool(tid, { st: "done", note: b.name });
        }
      }
      return;
    }
    if (ev.type === "result") {
      if (ev.session_id) this._cliSession = ev.session_id;
      if (ev.result && aiId) {
        // 빈 여부 판정을 updater 안에서 — 직전 assistant append 가 아직 커밋 안 됐어도 정확(중복/누락 방지)
        const res = String(ev.result);
        this.setState(s => { const m = s.messages.find(x => x.id === aiId); if (!m || m.text) return null; return { messages: s.messages.map(x => x.id === aiId ? { ...x, text: res } : x) } as any; });
      }
      if (typeof ev.total_cost_usd === "number") {
        this.setState(s => ({ agents: { ...s.agents, claude: { ...s.agents.claude, cost: s.agents.claude.cost + ev.total_cost_usd } } }));
      }
      return;
    }
    if (ev.type === "schutz_raw") {
      // codex 등 비-claude CLI: ANSI 제거한 원문 스트림
      const clean = String(ev.text ?? "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
      if (clean.trim() && aiId) {
        // 함수형 업데이트 — 빠른 IPC 버스트에서 stale this.state 로 청크 유실되지 않게(append 헬퍼와 동일 패턴)
        this.setState(s => ({ messages: s.messages.map(m => m.id === aiId ? { ...m, text: m.text ? m.text + "\n" + clean : clean } : m) }));
      }
      return;
    }
    if (ev.type === "schutz_stderr") return; // 진행 로그는 무시
    if (ev.type === "schutz_error") { append("⚠️ " + ev.message); }
    if (ev.type === "schutz_exit" || ev.type === "schutz_error") {
      if (aiId) this.setMsg(aiId, { streaming: false });
      this._cliMsgId = null;
      const ak = this._cliAgentKey;
      this.setState(s => ({
        running: false, cliBusy: false, statusKey: "idle",
        agents: { ...s.agents, [ak]: { ...s.agents[ak], status: "idle" } },
      }), () => this.saveSession());
      // CLI가 파일을 직접 수정했을 수 있음 → 트리·열린 페인 리로드
      void this.refreshWorkspace();
    }
  }

  // ── 대화 세션 영속 (워크스페이스별 localStorage) ──
  // 창 인덱스(win) — 0번(주 창)은 재시작 복원용 안정 키, 그 외 보조 창은 격리 키(동시 창 clobber 방지)
  private _winId: number = (() => { try { return Number(new URLSearchParams(location.search).get("win")) || 0; } catch { return 0; } })();
  // ── 대화 저장 ─────────────────────────────────────────────────────────────
  // 예전엔 워크스페이스당 대화가 **하나**였다(schutz.session:<root>). 목록에 띄울 과거
  // 대화가 애초에 없었던 이유다. 이제 색인 하나와 본문 여러 개로 나눈다.
  //
  //   schutz.convs:<root>          색인 [{id,title,updatedAt,msgCount}]  — 워크스페이스 공유
  //   schutz.conv:<root>:<id>      본문 {messages,history,tools,proposals}
  //   schutz.curConv:<root>[::wN]  이 창이 지금 보고 있는 대화 — **창마다** 다르다
  //
  // 색인과 본문을 공유하고 "지금 보는 것" 만 창별로 두는 게 핵심이다. 예전 ::wN 접미사는
  // 두 창이 단일 세션을 서로 덮어쓰는 걸 막으려던 장치인데, id 가 생기면 그냥 서로 다른
  // id 를 들면 된다.
  private convIndexKey(root?: string): string | null {
    const r = root ?? this.state.workspace?.root;
    return r ? `schutz.convs:${r}` : null;
  }
  private convBodyKey(id: string, root?: string): string | null {
    const r = root ?? this.state.workspace?.root;
    return r ? `schutz.conv:${r}:${id}` : null;
  }
  private curConvKey(root?: string): string | null {
    const r = root ?? this.state.workspace?.root;
    if (!r) return null;
    return this._winId > 0 ? `schutz.curConv:${r}::w${this._winId}` : `schutz.curConv:${r}`;
  }
  /** 이 창이 지금 쓰고 있는 대화 본문 키. */
  private sessionKey(): string | null {
    const id = this.state.convId;
    return id ? this.convBodyKey(id) : null;
  }

  private convIndex(root?: string): ConvMeta[] {
    try { return parseIndex(localStorage.getItem(this.convIndexKey(root) ?? "")); } catch { return []; }
  }
  private writeConvIndex(index: ConvMeta[], root?: string) {
    const k = this.convIndexKey(root);
    if (!k) return;
    const { kept, dropped } = prune(index);
    // 떨어진 대화의 **본문도** 지운다 — 안 하면 목록에 없는 고아 키가 영영 쌓인다.
    for (const d of dropped) {
      const bk = this.convBodyKey(d.id, root);
      if (bk) { try { localStorage.removeItem(bk); } catch { /* ignore */ } }
    }
    try { localStorage.setItem(k, JSON.stringify(kept)); } catch { /* ignore */ }
  }

  /** 레거시(단일 세션) → 대화 하나로 이관. 한 번만 돌고, 원본은 한 릴리스 남겨둔다. */
  private migrateLegacySession(root: string): string | null {
    if (this.convIndex(root).length) return null;   // 이미 색인이 있으면 이관 대상이 아니다
    const legacyKeys = [`schutz.session:${root}`, ...(this._winId > 0 ? [`schutz.session:${root}::w${this._winId}`] : [])];
    for (const lk of legacyKeys) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(lk); } catch { /* ignore */ }
      if (!raw) continue;
      let d: any = null;
      try { d = JSON.parse(raw); } catch { continue; }
      if (!d || !Array.isArray(d.messages) || !d.messages.length) continue;
      const id = "c" + Date.now().toString(36);
      const bk = this.convBodyKey(id, root);
      if (!bk) return null;
      try { localStorage.setItem(bk, raw); } catch { return null; }
      this.writeConvIndex([{
        id, title: titleFrom(d.messages, t("conv.untitled")),
        updatedAt: Date.now(), msgCount: d.messages.length,
      }], root);
      return id;
    }
    return null;
  }

  /** 이 창이 열 대화를 정한다 — 이어보던 것 → 이관분 → 가장 최근 → 새것. */
  private pickConv(root: string): string {
    const idx = this.convIndex(root);
    let saved: string | null = null;
    try { saved = localStorage.getItem(this.curConvKey(root) ?? ""); } catch { /* ignore */ }
    if (saved && idx.some(c => c.id === saved)) return saved;
    const migrated = this.migrateLegacySession(root);
    if (migrated) return migrated;
    if (idx.length) return idx[0].id;
    return "c" + Date.now().toString(36);
  }
  private layoutKey(root?: string): string | null {
    const r = root ?? this.state.workspace?.root;
    if (!r) return null;
    return this._winId > 0 ? `schutz.layout:${r}::w${this._winId}` : `schutz.layout:${r}`;
  }
  /** 재시작 전 열려 있던 탭/활성/레이아웃 복원 (존재하는 실제 파일만). 없으면 빈 슬롯 */
  private restoredLayout(tree: SchutzWorkspaceTree, fallbackLayout: number): { tabs: string[][]; active: string[]; layout: number } {
    const k = this.layoutKey(tree.root);
    let d: any = null;
    try { const raw = k && localStorage.getItem(k); if (raw) d = JSON.parse(raw); } catch { /* */ }
    const layout = d && [1, 2, 4].includes(d.layout) ? d.layout : fallbackLayout;
    if (!d || !Array.isArray(d.tabs)) { const ns = this.normSlots([], [], layout); return { tabs: ns.tabs, active: ns.active, layout }; }
    // 트리가 capped(truncated)면 tree.entries 를 존재 오라클로 신뢰 불가(>4000파일·깊은 경로 파일 누락) →
    // 필터하지 않고 보존해 실제 존재하는 탭이 시작 시 사라지지 않게. 진짜 삭제 파일은 pane 오류 오버레이가 처리.
    const truncated = !!(tree as any).truncated;
    const exists = new Set(tree.entries.filter(e => !e.dir).map(e => e.rel));
    const keep = (rel: string) => typeof rel === "string" && (truncated || exists.has(rel));
    const tabs: string[][] = [];
    for (let i = 0; i < layout; i++) tabs.push((Array.isArray(d.tabs[i]) ? d.tabs[i] : []).filter(keep));
    const active = tabs.map((slot, i) => (Array.isArray(d.active) && slot.includes(d.active[i])) ? d.active[i] : (slot[slot.length - 1] ?? ""));
    return { tabs, active, layout };
  }
  private _layoutT: ReturnType<typeof setTimeout> | null = null;
  /** 현재 탭/활성/레이아웃을 워크스페이스별로 저장 (디바운스) */
  private persistLayout() {
    if (this._layoutT) clearTimeout(this._layoutT);
    this._layoutT = setTimeout(() => {
      const k = this.layoutKey();
      if (!k) return;
      try {
        const { tabs, active, layout } = this.state;
        const clean = tabs.map(slot => slot.filter(rel => !this.parseDiffKey(rel) && !this.parsePreviewKey(rel))); // diff 등 특수 탭 제외
        localStorage.setItem(k, JSON.stringify({ tabs: clean, active, layout }));
      } catch { /* ignore */ }
    }, 400);
  }
  private saveSession() {
    const k = this.sessionKey();
    if (!k) return;
    const s = this.state;
    // 도구와 제안도 함께 저장한다. 안 하면 에이전트 모드로 오후 내내 일하고 다시 열었을 때
    // 도구 줄·diff·명령 출력이 전부 사라지고 **없어진 파일을 가리키는 산문만** 남는다.
    // 그 순간 에이전트 모드는 좌측 패널 위에 씌운 의상으로 드러난다 — 트랜스크립트가
    // "한 곳에서 다 본다" 를 약속하는 이상 이건 폴리시가 아니라 기능이다.
    //
    // 다만 무엇을 버리는지는 분명히 한다:
    //  - 도구 출력(out)은 저장하지 않는다. 항목당 8KB 라 몇십 개면 localStorage 5MB 를 먹는다.
    //    화면용 캐시이고, 세션이 끝나면 사라지는 게 맞다.
    //  - 끝난 제안의 diff 본문도 버린다. find/replace 는 파일 하나가 통째로 들어올 수 있다.
    //    대기 중인 것만 온전히 남긴다 — 그건 아직 사용자가 결정해야 하는 것이라서.
    const msgs = s.messages.filter(m => !m.streaming).slice(-200);
    const tools = s.tools.slice(-200).map(({ out, ...rest }) => rest);
    const proposals = s.proposals.slice(-100).map(p =>
      p.status === "pending" ? p : { ...p, find: "", replace: "" });
    if (!msgs.length && !this.history.length) return;   // 쓸 게 없으면 키를 만들지 않는다
    const payload = JSON.stringify({ messages: msgs, history: this.history.slice(-120), tools, proposals });
    try {
      localStorage.setItem(k, payload);
      this.touchConvIndex(msgs);
    } catch {
      // 용량 초과 — 조용히 삼키면 다음에 열었을 때 오후치가 통째로 사라진 것으로 보인다.
      // 대화만이라도 남긴다(예전 저장 형태와 같다).
      try {
        localStorage.setItem(k, JSON.stringify({ messages: msgs, history: this.history.slice(-120) }));
        this.toast("error", t("mode.sessionTrimmed"));
      } catch { /* 그것마저 안 되면 포기 */ }
    }
  }
  private restoreSession() {
    const k = this.sessionKey();
    if (!k) return;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.messages)) {
        this.setState({ messages: d.messages }, () => {
          this.seedChatSeen();                                  // 복원분은 "이미 읽음"
          if (this._chat) this._chat.scrollTop = this._chat.scrollHeight; // 최신 대화부터 보이게
          this._chatSig = null;                                 // 첫 갱신이 다시 하단으로 잡아당기지 않게
        });
        // _uid 를 복원된 id 뒤로 시드 — 새 메시지가 복원 id와 충돌해 엉뚱한 메시지를 덮어쓰는 것 방지
        this._uid = d.messages.reduce((mx: number, m: any) => Math.max(mx, +((String(m.id).match(/\d+$/) || [])[0] ?? 0) + 1), this._uid);
      }
      if (Array.isArray(d.history)) this.history = d.history;
      // 도구·제안 복원. _uid 시드는 위에서 메시지 기준으로만 잡혔으므로 여기서 함께 민다 —
      // 안 그러면 새 도구 id 가 복원된 제안 id 와 겹쳐 트랜스크립트 순서가 뒤엉킨다.
      const seedFrom = (arr: any[]) => {
        this._uid = arr.reduce((mx: number, x: any) => Math.max(mx, +((String(x?.id).match(/\d+$/) || [])[0] ?? 0) + 1), this._uid);
      };
      if (Array.isArray(d.tools)) { this.setState({ tools: d.tools }); seedFrom(d.tools); }
      if (Array.isArray(d.proposals)) { this.setState({ proposals: d.proposals }); seedFrom(d.proposals); }
    } catch { /* ignore */ }
  }
  private clearSession() {
    const k = this.sessionKey();
    if (k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  }

  /** 저장할 때마다 색인 한 줄을 최신으로 밀어 올린다. 제목은 첫 사용자 메시지에서 나온다. */
  private touchConvIndex(msgs: ChatMsg[]) {
    const id = this.state.convId;
    if (!id) return;
    // 빈 대화는 목록에 올리지 않는다. /new 를 누르고 아무 말도 안 하면 "새 대화" 한 줄이
    // 최근 항목에 남아, 다음 /new 마다 빈 줄이 쌓인다.
    if (!msgs.length) return;
    const idx = this.convIndex();
    this.writeConvIndex(upsert(idx, {
      id, title: titleFrom(msgs, t("conv.untitled")),
      updatedAt: Date.now(), msgCount: msgs.length,
      // 출처는 계산해서 나오지 않는다 — 흘려 넣지 않으면 가져온 대화에 한 마디만 더 해도
      // 배지가 사라진다. carryOver 의 주석에 이유가 있다.
      ...carryOver(idx, id),
    }));
  }

  /** 새 대화 — 지금 것을 **지우지 않고** 닫은 뒤 빈 대화를 연다.
   *  예전 /new 는 clearSession() 으로 통째로 삭제했다. 그래서 최근 항목이 없었다. */
  newConversation() {
    this.saveSession();                       // 지금까지를 확정해 두고
    const id = "c" + Date.now().toString(36);
    this.history = [];
    this.engine.reset();
    this._cliSession = null;
    this._codexSession = null;
    this.setState({ convId: id, messages: [], tools: [], proposals: [], input: "" }, () => {
      try { const k = this.curConvKey(); if (k) localStorage.setItem(k, id); } catch { /* ignore */ }
    });
  }

  /** 최근 항목에서 하나를 연다. */
  openConversation(id: string) {
    if (id === this.state.convId) return;
    this.saveSession();
    this.history = [];
    this.engine.reset();
    this._cliSession = null;
    this._codexSession = null;
    this.setState({ convId: id, messages: [], tools: [], proposals: [], input: "" }, () => {
      try { const k = this.curConvKey(); if (k) localStorage.setItem(k, id); } catch { /* ignore */ }
      this.restoreSession();
    });
  }

  // ── 지난 대화 가져오기 ─────────────────────────────────────────────────────
  //
  // 형식 해석은 cliChats.ts 가, 파일 읽기는 메인이 한다. 여기 있는 건 그 둘을 잇고
  // 결과를 Schutz 대화로 앉히는 일뿐이다.

  /** 오프닝에서 투어까지 골랐는데 가져오기가 먼저 뜬 경우. 가져오기가 닫히면 이어서 연다. */
  private _tourAfterImport = false;
  /** 오프닝 세팅에서 고른 값. Opening 은 데모 중 언마운트되므로 여기 둔다. */
  private _wantsImport = false;

  /** 가져오기 화면을 닫는다 — 가져와서 닫히든 취소로 닫히든 여기 한 곳을 지난다.
   *  두 경로가 갈리면 미뤄둔 투어가 한쪽에서만 시작된다. */
  private closeImport() {
    this.setState({ impOpen: false, impRows: null });
    if (this._tourAfterImport) {
      this._tourAfterImport = false;
      this.qt(() => this.startTour(), 500);
    }
  }

  /** 가져오기 화면을 연다. 목록은 열 때마다 새로 읽는다 — 다른 창에서 나눈 대화가
   *  그 사이에 늘었을 수 있고, 캐시를 무효화할 신호가 우리에겐 없다. */
  openImport() {
    this.setState({ impOpen: true, impRows: null, impAgent: "all" });
    void this.loadImportRows();
  }

  /** 목록을 채운다. 각 파일의 **앞부분만** 읽어 제목을 뽑는다(파일 하나가 218MB 다). */
  private async loadImportRows() {
    if (!window.schutz?.cliChatList) { this.setState({ impRows: [] }); return; }
    const rows: ImpRow[] = [];
    for (const agent of ["claude", "codex"] as CliAgent[]) {
      let res;
      try { res = await window.schutz.cliChatList(agent, CLI_HEAD_BYTES[agent]); } catch { continue; }
      for (const r of res?.rows ?? []) {
        const h = parseHead(agent, r.head, t("conv.untitled"));
        rows.push({ agent, file: r.file, bytes: r.bytes, updatedAt: r.updatedAt, title: h.title, cwd: h.cwd });
      }
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    this.setState({ impRows: rows });
  }

  /** 한 줄을 Schutz 대화로 데려온다.
   *
   *  원본 파일은 **읽기만** 한다. 지우지도 옮기지도 않는다 — 가져오기가 잘못돼도 Claude Code
   *  쪽에서 그 대화는 그대로 열린다. */
  private async importCliChat(row: ImpRow) {
    if (this.state.impBusy) return;
    this.setState({ impBusy: row.file });
    try {
      const res = await window.schutz!.cliChatRead(row.agent, row.file, CLI_TAIL_BYTES);
      if (!res || res.error || typeof res.text !== "string") {
        this.toast("error", t("imp.failed", { err: res?.error ?? "?" }));
        return;
      }
      const body = parseBody(row.agent, res.text, CLI_MSG_CAP);
      const messages: ChatMsg[] = [];
      const tools: ToolItem[] = [];
      // 말과 도구가 한 배열로 오는 덕에 순서가 남아 있다. _uid 를 번갈아 매기면
      // 트랜스크립트(agentTimeline)가 원래 순서대로 다시 엮는다.
      for (const it of body.items) {
        if (it.kind === "msg") {
          // agent 는 "schutz" 로 둔다. 이 대화를 이어받는 건 우리 에이전트이고, 남의
          // 에이전트 id 를 심으면 색·필터·컨텍스트 분리가 없는 에이전트를 가리키게 된다.
          messages.push({
            id: (it.role === "user" ? "u" : "a") + (this._uid++),
            role: it.role, agent: "schutz", text: it.text,
            ...(it.role === "ai" ? { who: row.agent === "claude" ? "Claude Code" : "Codex" } : {}),
          });
        } else {
          tools.push({ id: "t" + (this._uid++), agent: "schutz", verb: it.name, path: it.detail, st: "done", note: "" });
        }
      }
      if (!messages.length) { this.toast("error", t("imp.empty")); return; }

      const id = "c" + Date.now().toString(36);
      const bk = this.convBodyKey(id);
      if (!bk) return;
      // 지금 대화를 확정하고 자리를 비운 다음에 앉힌다 — 순서가 바뀌면 지금 것이 덮인다.
      this.saveSession();
      try {
        localStorage.setItem(bk, JSON.stringify({ messages, history: [], tools, proposals: [] }));
      } catch {
        this.toast("error", t("mode.sessionTrimmed"));
        return;
      }
      this.writeConvIndex(upsert(this.convIndex(), {
        id, title: row.title, updatedAt: row.updatedAt || Date.now(),
        msgCount: messages.length, source: row.agent,
      }));
      this.history = [];
      this.engine.reset();
      this._cliSession = null;
      this._codexSession = null;
      this.setState({ convId: id, messages: [], tools: [], proposals: [], input: "" }, () => {
        try { const k = this.curConvKey(); if (k) localStorage.setItem(k, id); } catch { /* ignore */ }
        this.restoreSession();
        this.closeImport();
        this.toast("ok", t("imp.done", { title: row.title }));
        // 자른 것은 잘랐다고 말한다. 조용히 버리면 "예전 대화가 사라졌다" 가 된다.
        //
        // 두 가지 잘림을 구분해야 한다. droppedMsgs 는 **파서가 본 것 중** 버린 수라서,
        // 파일을 통째로 읽지 못했으면 그 숫자가 거짓말이 된다 — 218MB 짜리에서 마지막
        // 24MB 만 읽고 "이 앞의 1마디는 가져오지 않았습니다" 라고 말한 적이 있다. 안 읽은
        // 194MB 에 몇 마디가 있었는지는 셀 방법이 없으니, 셀 수 있는 척하지 않는다.
        if (res.partial) this.toast("info", t("imp.tailOnly"));
        else if (body.clipped) this.toast("info", t("imp.clipped", { n: body.droppedMsgs }));
      });
    } finally {
      this.setState({ impBusy: null });
    }
  }

  async refreshWorkspace() {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const tree = await window.schutz.readTree(ws.root);
    this.setState(s => {
      const paneVer: Record<string, number> = { ...s.paneVer };
      for (const p of this.allOpen(s)) {
        paneVer[p] = (paneVer[p] ?? 0) + 1;
        const dm = this.parseDiffKey(p); // diff 탭은 실제 경로 키도 함께 bump
        if (dm) paneVer[dm.path] = (paneVer[dm.path] ?? 0) + 1;
      }
      return { workspace: tree, paneVer } as any;
    });
    void this.loadGit();
    // 열린 TS/JS 파일의 공유 모델을 디스크와 동기화 (dirty 아니면)
    for (const rel of this.allOpen()) {
      if (!projectModels.isTsLike(rel)) continue;
      window.schutz.readFile(ws.root, rel)
        .then(text => projectModels.reload(ws.root, rel, text, this.isDirtyRel(rel)))
        .catch(() => { /* 삭제됨 등 무시 */ });
    }
  }

  private _fsTimer: ReturnType<typeof setTimeout> | null = null;
  /** 파일 워처 트리거 — 트리·모델·git을 디스크와 가볍게 동기화 (페인 리마운트 없이 커서 보존) */
  private onFsChange = () => {
    if (this._fsTimer) clearTimeout(this._fsTimer);
    this._fsTimer = setTimeout(() => void this.syncFromDisk(), 250);
  };
  async syncFromDisk(opts?: { bulk?: boolean }) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    let tree: SchutzWorkspaceTree | null = null;
    try {
      tree = await window.schutz.readTree(ws.root);
      if (this.state.workspace !== ws) return; // 그 사이 워크스페이스 전환 → 스테일 트리로 새 repo를 덮지 않음
      this.setState({ workspace: tree });
    } catch { /* */ }
    // 사라진 파일(외부 삭제·브랜치 전환)의 stale 모델·진단·문제패널 항목 정리 — 트리 완전할 때만(truncated 면 실존 파일 오삭제 위험)
    if (tree && !(tree as any).truncated) {
      const present = new Set(tree.entries.filter(e => !e.dir).map(e => e.rel));
      projectModels.dropMissing(ws.root, present);
    }
    // 대량 변경(브랜치 전환/pull/stash pop): 열지 않은 preload 모델도 디스크로 재로드해 stale 진단 방지
    if (opts?.bulk) void projectModels.reloadAll(ws.root, (r, rel) => window.schutz!.readFile(r, rel), this.isDirtyRel);
    // 열린 파일: dirty 아니면 모델 내용을 디스크와 맞춤 (공유 모델 setValue → 라이브 반영, 리마운트 없음)
    for (const rel of this.allOpen()) {
      // 편집 중(dirty)인 파일도 '읽기는' 한다 — 건너뛰면 외부 변경을 감지할 기회 자체가 없어
      // 다음 저장이 조용히 덮어쓴다. 버퍼 보호는 reload 가 isDirty 로 판단한다.
      if (this.parseDiffKey(rel)) continue;    // diff 뷰는 별도
      if (!projectModels.getByRel(rel)) continue; // 모델 없는 탭(이미지 등) 건너뜀
      window.schutz.readFile(ws.root, rel)
        // 비동기 readFile 사이 워크스페이스 전환 또는 편집 시작 가능 → 재확인해 사용자 편집/새 repo 클로버 방지
        // 워크스페이스 '전환' 만 걸러야 한다. 객체 동일성으로 비교하면 이 함수가 위에서 setState(workspace: tree) 로
        // 교체한 새 객체와 항상 달라져 가드가 매번 걸리고, 결과적으로 외부 변경이 열린 에디터에 반영되지 않았다.
        .then(text => { if (this.state.workspace?.root !== ws.root) return; projectModels.reload(ws.root, rel, text, this.isDirtyRel(rel)); })
        .catch(() => { /* 삭제됨 등 */ });
    }
    void this.loadGit();
  }

  // ── Git 소스 컨트롤 ──
  private _gitLoadSeq = 0; // 동시/순서역전 loadGit 응답이 최신 상태를 스테일로 덮지 않게 하는 시퀀스
  /** 팔레트 선택 행 콜백 ref — 키보드 네비 시 선택행을 항상 뷰 안으로 스크롤(안 보이는 항목이 Enter 되던 문제) */
  private _selRowRef = (el: HTMLElement | null) => { try { el?.scrollIntoView({ block: "nearest" }); } catch { /* */ } };
  async loadGit() {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) { this.setState({ git: null }); return; }
    const seq = ++this._gitLoadSeq;
    const stale = () => this.state.workspace !== ws || seq !== this._gitLoadSeq; // 워크스페이스 전환 or 더 최근 loadGit 시작됨
    try {
      const r = await window.schutz.git(ws.root, "status");
      if (stale()) return; // 스테일 응답 드롭(순서 역전 시 옛 status 로 클로버 방지)
      if (!r.ok) { this.setState({ git: { branch: ws.branch ?? null, ahead: 0, behind: 0, upstream: false, notRepo: !!r.notRepo, staged: [], unstaged: [], untracked: [] } }); return; }
      this.setState({ git: { branch: r.branch, ahead: r.ahead, behind: r.behind, upstream: r.upstream, staged: r.staged, unstaged: r.unstaged, untracked: r.untracked } });
      // 브랜치·로그도 함께 (실패 무시, 스테일 시 무시)
      window.schutz.git(ws.root, "branches").then(b => { if (!stale() && b?.ok) this.setState({ gitBranches: b.branches }); }).catch(() => { });
      window.schutz.git(ws.root, "log", { n: 40 }).then(l => { if (!stale() && l?.ok) this.setState({ gitLog: l.commits }); }).catch(() => { });
    } catch { if (!stale()) this.setState({ git: null }); }
  }

  /** 브랜치 전환 */
  async gitCheckout(branch: string) {
    if (this.anyDirty()) { this.toast("error", t("sc3.unsavedChanges")); return; }
    const ok = await this.gitDo("checkout", { branch });
    this.setState({ branchOpen: false });
    if (ok) { this.toast("ok", t("sc3.branchSwitched", { branch })); await this.syncFromDisk({ bulk: true }); }
    else this.toast("error", t("sc3.switchFailed") + (this.state.gitError || ""));
  }
  /** 새 브랜치 생성+전환 */
  async gitCreateBranch() {
    const name = this.state.newBranch.trim();
    if (!name) return;
    const ok = await this.gitDo("createBranch", { branch: name });
    this.setState({ branchOpen: false, newBranch: "" });
    if (ok) { this.toast("ok", t("sc3.newBranchCreated", { name })); await this.syncFromDisk({ bulk: true }); }
    else this.toast("error", t("sc3.branchCreateFailed") + (this.state.gitError || ""));
  }

  /** 단순 git 액션(스태시/풀/페치) + 토스트 */
  async gitSimple(action: string, okMsg: string) {
    const ok = await this.gitDo(action, action === "stash" ? { includeUntracked: true } : undefined);
    if (ok) { this.toast("ok", okMsg); if (action === "pull" || action === "stashPop") await this.syncFromDisk({ bulk: true }); }
    else this.toast("error", (this.state.gitError || t("sc3.failed")));
  }
  /** 현재 포커스 파일·라인의 blame을 토스트로 */
  async gitBlameLine() {
    const ws = this.state.workspace;
    const rel = this.state.active[this._focusSlot];
    const api = rel ? paneRegistry.panes.get(rel) : null;
    if (!ws || !window.schutz || !rel || !api) { this.toast("info", t("sc3.noEditingFile")); return; }
    const line = api.editor.getPosition()?.lineNumber ?? 1;
    try {
      const r = await window.schutz.git(ws.root, "blame", { path: rel });
      if (!r.ok || !r.lines) { this.toast("error", t("sc3.blameFailed") + (r.error || "")); return; }
      const info = r.lines[line - 1];
      if (info) this.toast("info", `${info.hash} · ${info.author} — ${info.summary}`);
      else this.toast("info", t("sc3.noBlameLine"));
    } catch (e) { this.toast("error", t("sc3.blameFailed") + (e instanceof Error ? e.message : String(e))); }
  }

  /** git 액션 실행 후 상태 갱신 (+ 열린 diff/페인 리로드) */
  private _gitOpInFlight = false; // 동기 재진입 가드 — setState 는 async 라 state.gitBusy 만으론 rapid double-fire(이중 커밋/index.lock) 못 막음
  private async gitDo(action: string, payload?: any): Promise<boolean> {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return false;
    if (this._gitOpInFlight) return false; // 진행 중이면 동시 git 변경 차단
    this._gitOpInFlight = true;
    this.setState({ gitBusy: true, gitError: "" });
    try {
      const r = await window.schutz.git(ws.root, action, payload);
      if (!r.ok) { this.setState({ gitBusy: false, gitError: r.error || t("sc3.gitError") }); return false; }
      this.setState({ gitBusy: false });
      await this.loadGit();
      return true;
    } catch (e) {
      this.setState({ gitBusy: false, gitError: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      this._gitOpInFlight = false;
    }
  }

  async gitCommit() {
    const msg = this.state.gitMsg.trim();
    if (!msg) { this.setState({ gitError: t("sc3.enterCommitMsg") }); return; }
    if (!(this.state.git?.staged.length)) { this.setState({ gitError: t("sc3.noStagedChanges") }); return; }
    const ok = await this.gitDo("commit", { message: msg });
    if (ok) { this.setState({ gitMsg: "" }); void this.refreshWorkspace(); }
  }

  /** diff 뷰 열기 — 합성 rel `git-diff:<s|w>:<path>` 를 탭으로 */
  openDiff(path: string, staged: boolean, untracked = false) {
    const key = "git-diff:" + (untracked ? "u" : staged ? "s" : "w") + ":" + path;
    this.openFile(key);
  }
  /** 합성 diff rel 파싱 */
  /** 프리뷰 탭 키 — "preview:<url>". 실제 파일이 아니므로 레이아웃 저장에서 제외된다(parseDiffKey 와 같은 취급). */
  private parsePreviewKey(rel: string): string | null {
    return rel.startsWith("preview:") ? rel.slice("preview:".length) : null;
  }

  /** 프리뷰 탭 라벨 — "localhost:5173" 처럼 짧게. 파싱 실패하면 URL 그대로. */
  private previewLabel(url: string): string {
    try { const u = new URL(url); return u.host || url; } catch { return url; }
  }
  private _lastPreviewUrl = "";
  /** 개발 서버 화면을 편집 그룹에 띄운다 */
  openPreview(url: string) {
    this._lastPreviewUrl = url;
    const key = "preview:" + url;
    // 서버를 다시 띄우면 포트가 바뀌곤 한다 — 같은 호스트의 낡은 프리뷰 탭은 치우고 연다.
    // (그대로 두면 죽은 주소를 가리키는 탭이 계속 쌓인다)
    const host = this.previewLabel(url);
    for (const rel of this.allOpen()) {
      const pv = this.parsePreviewKey(rel);
      if (!pv || rel === key) continue;
      if (this.previewLabel(pv).split(":")[0] === host.split(":")[0]) {
        this.state.tabs.forEach((slot, si) => { if (slot.includes(rel)) this._removeTab(si, rel); });
      }
    }
    this.openFile(key);
  }

  private parseDiffKey(rel: string): { path: string; staged: boolean; untracked: boolean } | null {
    if (!rel.startsWith("git-diff:")) return null;
    const rest = rel.slice("git-diff:".length);
    const kind = rest[0];
    return { path: rest.slice(2), staged: kind === "s", untracked: kind === "u" };
  }

  private _fsOff: (() => void) | null = null;
  private _sessionT: ReturnType<typeof setTimeout> | undefined;
  private _langOff: (() => void) | null = null;

  // ── 진단(문제 패널) ──
  private _markersOff: monaco.IDisposable | null = null;
  private _markerTimer: ReturnType<typeof setTimeout> | null = null;
  private _scheduleMarkerScan() {
    if (this._markerTimer) clearTimeout(this._markerTimer);
    this._markerTimer = setTimeout(() => this._scanMarkers(), 180);
  }
  private _scanMarkers() {
    const all = monaco.editor.getModelMarkers({});
    const rows: ProblemItem[] = [];
    for (const m of all) {
      if (m.severity < 4) continue; // 4=Warning, 8=Error (Hint/Info 제외)
      const rel = projectModels.relFor(m.resource.toString());
      if (!rel) continue;
      rows.push({ rel, line: m.startLineNumber, col: m.startColumn, message: m.message, severity: m.severity });
    }
    rows.sort((a, b) => (b.severity - a.severity) || a.rel.localeCompare(b.rel) || (a.line - b.line));
    this.setState({ problems: rows });
  }
  /** 문제 항목 클릭 → 파일 열고 라인으로 이동 */
  /** 파일을 연 뒤 위치로 스크롤/커서 — 페인이 아직 마운트 안 됐으면 폴링 재시도(고정 지연 no-op 방지), 라인은 모델 길이로 클램프 */
  private revealInPane(rel: string, line: number, col: number, tries = 0) {
    const api = paneRegistry.panes.get(rel);
    if (api) {
      try {
        const max = Math.max(1, api.editor.getModel()?.getLineCount() ?? line);
        const ln = Math.min(Math.max(1, line), max); // 치환·외부변경으로 라인이 시프트해도 범위 밖으로 안 감
        api.editor.revealLineInCenter(ln);
        api.editor.setPosition({ lineNumber: ln, column: Math.max(1, col) });
        api.editor.focus();
      } catch { /* disposed 등 무시 */ }
      return;
    }
    if (tries < 25) setTimeout(() => this.revealInPane(rel, line, col, tries + 1), 40); // 최대 ~1s 폴링(대용량/느린 첫 마운트 대비)
  }
  openProblem(p: ProblemItem) {
    this.openFile(p.rel);
    this.revealInPane(p.rel, p.line, p.col);
  }

  /** 실제 모델 턴 시작 — 관리자(Claude 우선, 없으면 연결된 첫 에이전트)가 진입점 */
  async runReal(text: string, display: string = text) {
    if (this.state.running) return;
    const configured = this.configuredAgents();
    const pref = getManagerId();
    const managerId = configured.includes(pref) ? pref : (configured.includes("claude") ? "claude" : configured[0]);
    if (!managerId) return;
    this.history.push({ role: "user", content: text });
    this.setState(s => ({
      running: true, runProgress: 0.06, statusKey: "thinking", input: "",
      messages: [...s.messages, { id: "u" + (this._uid++), role: "user" as const, agent: managerId, text: display }],
    }));
    const seed: NeutralMsg[] = this.history.map(m => ({ role: m.role as "user" | "assistant", text: m.content }));
    await this.runAgentLoop(managerId, seed, { isManager: true });
  }

  /** Ctrl+K 인라인 편집 — 선택 코드를 지시대로 바꾼 제안을 만든다 (도구 없이 단발 완성) */
  async inlineEdit(rel: string, selection: string, instruction: string, range?: InlineRange) {
    const configured = this.configuredAgents();
    const pref = getManagerId();
    const managerId = configured.includes(pref) ? pref : (configured.includes("claude") ? "claude" : configured[0]);
    if (!managerId) {
      this.schutzSay(t("sc3.inlineEdit"), t("sc3.noConnectedAi"));
      return;
    }
    const provider = this.providers[managerId];
    const aiId = "a" + (this._uid++);
    this.setState(s => ({ messages: [...s.messages, { id: aiId, role: "ai" as const, who: this.agDef(managerId).name + t("sc3.inlineEditWhoSuffix"), agent: managerId, text: t("sc3.editingSelection"), streaming: true }] }));
    const system = "당신은 코드 편집기입니다. 사용자가 파일에서 코드 조각을 선택했습니다. 지시에 따라 그 조각을 수정하고, 그 조각을 대체할 코드만 출력하세요. 설명·주석·마크다운 코드펜스 없이 순수 코드만 반환합니다. 들여쓰기는 원본 문맥을 유지하세요.";
    const transcript: NeutralMsg[] = [{ role: "user", text: `파일: ${rel}\n\n선택된 코드:\n${selection}\n\n지시: ${instruction}\n\n이 코드를 대체할 코드만 반환하세요.` }];
    const abort = new AbortController();
    // role "inline" 으로 등록 — 예전의 "__inline:" 키 접두어를 대체한다.
    // agentId 를 aiId 로 두는 이유: 동시 인라인 편집이 서로의 실행을 밀어내지 않아야 한다
    // (레지스트리는 agentId 당 현재 실행 하나만 들고 있으므로 요청별로 달라야 한다).
    const inlineRun = this.engine.runs.start({
      agentId: "__inline:" + aiId,
      role: "inline",
      cancel: () => abort.abort(),
    });
    const inlineKey = inlineRun.runId;
    this.abortCtls.set(inlineKey, abort);
    let out = "";
    try {
      for await (const ev of provider.streamAgentTurn({ transcript, system, tools: undefined, signal: abort.signal })) {
        if (ev.type === "text") out += ev.delta;
        else if (ev.type === "usage") this.bumpAgent(managerId, ev.inputTokens, ev.outputTokens);
        else if (ev.type === "error") out = out || "⚠️ " + ev.message;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") { this.setMsg(aiId, { text: t("sc3.inlineEditCancelled"), streaming: false }); this.endInlineRun(inlineKey, "aborted"); return; }
      this.setMsg(aiId, { text: "⚠️ " + (e instanceof Error ? e.message : String(e)), streaming: false }); this.endInlineRun(inlineKey, "aborted"); return;
    }
    this.endInlineRun(inlineKey, "done");
    let code = out.trim();
    // 코드펜스 제거
    if (code.startsWith("```")) code = code.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "").trim();
    this.setMsg(aiId, { streaming: false });
    if (!code) { this.setMsg(aiId, { text: t("sc3.emptyEditResult") }); return; }
    if (code === selection.trim()) { this.setMsg(aiId, { text: t("sc3.noChanges") }); return; }
    const p: Proposal = {
      id: "pp" + (this._uid++), rel, find: selection, replace: code, range,
      rationale: t("sc3.inlineEditRationale") + instruction, agent: managerId, status: "pending",
    };
    this.setState(s => ({ proposals: [...s.proposals, p] }));
    this.setMsg(aiId, { text: t("sc3.inlineEditProposalMade") });
    this.openFile(rel);
    void this.saveSession();
  }

  componentDidMount() {
    window.addEventListener("resize", this._clampChatOnResize);
    applyTheme(getThemeId());
    applyUiFont(); // 저장된 UI 폰트를 전역 적용
    this._langOff = onLangChange(() => this.forceUpdate()); // 언어 변경 시 전체 리렌더 (연출은 i18n 이 건다)
    // 데스크톱 앱: 데모 없이 빈 상태에서 시작 + Claude Code CLI(구독 인증) 감지
    if (window.schutz) {
      this.setState(s => ({ ...this.normSlots([], [], s.layout), leftTab: "tree" } as any));
      window.addEventListener("beforeunload", this._onBeforeUnload);
      this._markersOff = monaco.editor.onDidChangeMarkers(() => this._scheduleMarkerScan());
      this._fsOff = window.schutz.onFsChange(this.onFsChange);
      // 잔여 할당량: 실제 요청이 나갈 때마다 헤더로 갱신되고, 켤 때는 아래에서 한 번 조회한다
      this._quotaOff = window.schutz.onQuota(line => {
        try {
          const q = JSON.parse(line) as QuotaInfo;
          this.setState(st => ({ quota: { ...st.quota, [q.provider]: q } }));
        } catch { /* 부가 정보 — 실패해도 무시 */ }
      });
      void this.probeQuotas();
      // 재로드 후 고아 PTY 정리 — 이 렌더러의 현재 터미널 탭에 없는 셸을 메인이 종료(리로드 시 누수 방지)
      try { window.schutz.termReconcile?.(this.state.terms.map(t => t.id)); } catch { /* */ }
      // LSP 초기화 + Monaco 프로바이더 등록 (Python 등)
      void lspClient.initLsp().then(() => { registerLspProviders(); return lspClient.syncOpenModels(); });
      // 확장 로드 (커맨드 기여 → 팔레트)
      void this.reloadExtensions();
      // MCP 서버 시작 (Schutz 호스트) → 도구를 에이전트 루프에 노출
      mcp.setMcpChangeHandler(() => this.forceUpdate());
      void mcp.startAll();
      // 모델 목록 미리 조회 → /model 팔레트가 즉시 실시간 목록을 보여줌
      setTimeout(() => this.ensureModelsFetched(), 1500);
      // 온보딩 완료 후(또는 튜토리얼 미완료 시) 사용법 스포트라이트 투어 자동 시작 — 1회만.
      // this.qt 사용(언마운트 시 clearTimers 로 취소) — 고아 타이머가 죽은 인스턴스에서 startTour 호출하는 것 방지
      try {
        // 오프닝은 App 위 오버레이다. 여기서 띄우면 뒤에 진짜 UI 가 이미 마운트돼 있어
        // 데모가 목업 대신 실물을 움직일 수 있다.
        if (this.props.playOpening) this.setState({ openingPhase: "intro" });
        else if (!localStorage.getItem("schutz.tutorialDone")) {
          this.qt(() => { if (!this.state.tourOpen && !this.state.settingsOpen) this.startTour(); }, 1400);
        }
      } catch { /* ignore */ }
      document.title = "Schutz";
      // 마지막 프로젝트 자동 복원
      try {
        const last = localStorage.getItem("schutz.lastRoot");
        if (last) void this.openWorkspacePath(last);
      } catch { /* ignore */ }
      // 전역 단축키
      window.addEventListener("keydown", this._onGlobalKey);
      void this.detectCli();
      this._cliOff = window.schutz.onCliEvent(line => this.handleCliEvent(line));
      this._oauthOff = window.schutz.onOauthResult(line => {
        try {
          const r = JSON.parse(line);
          if (r.provider && r.ok && r.access) {
            setOAuth(r.provider, { access: r.access, refresh: r.refresh ?? null, exp: r.exp ?? Date.now() + 3600_000, accountId: r.accountId ?? null });
            this.setState(st => ({ oauthWait: false, oauthMsg: "", oauthTick: st.oauthTick + 1 }));
          } else if (r.provider) {
            this.setState({ oauthWait: false, oauthMsg: r.message ?? t("sc3.loginFailed") });
          }
        } catch { /* ignore */ }
      });
      return;
    }
    // 웹 프리뷰: 데모 오토플레이 (StrictMode 재마운트에도 안전)
    if (AUTOPLAY) {
      this.qt(() => { if (this.state.messages.length === 0) this.send(); }, 800);
    }
  }
  componentWillUnmount() {
    this.clearTimers();
    // 디바운스 타이머들(clearTimers 관리 밖) — 언마운트 후 setState 방지
    if (this._fsTimer) { clearTimeout(this._fsTimer); this._fsTimer = null; }
    if (this._extSearchT) { clearTimeout(this._extSearchT); this._extSearchT = null; }
    if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
    if (this._layoutT) { clearTimeout(this._layoutT); this._layoutT = null; }
    if (this._markerTimer) { clearTimeout(this._markerTimer); this._markerTimer = null; }
    if (this._sessionT) { clearTimeout(this._sessionT); this._sessionT = undefined; } // 언마운트 후 _scanMarkers setState 방지(_timers 풀 밖)
    for (const k of Object.keys(this._closeTimers)) clearTimeout(this._closeTimers[k]);
    this._toastTimers.forEach(clearTimeout); this._toastTimers.clear(); // 토스트 전용 타이머(_timers 풀 밖)
    this._cliOff?.();
    this._cliOff = null;
    this._oauthOff?.();
    this._oauthOff = null;
    window.removeEventListener("keydown", this._onGlobalKey);
    window.removeEventListener("beforeunload", this._onBeforeUnload);
    this._markersOff?.dispose();
    this._fsOff?.();
    this._langOff?.();
    window.removeEventListener("resize", this._tourResize);
    window.removeEventListener("resize", this._clampChatOnResize);
    this._mruCommit?.();
    try { window.schutz?.watchStop(); } catch { /* */ }
    lspClient.shutdownAll();
    void dap.shutdown();
    projectModels.disposeAll();
  }

  /** 앱 종료 가드 — 미저장 변경이 있으면 네이티브 확인 */
  private _onBeforeUnload = (e: BeforeUnloadEvent) => {
    // 대화는 턴이 끝날 때만 저장돼서, 스트리밍 중에 끄면 그 주고받음이 통째로 사라졌다.
    // 슬래시 명령 응답처럼 턴 밖에서 생긴 메시지도 마찬가지 — 나가기 직전에 한 번 더 저장한다.
    try { this.saveSession(); } catch { /* 저장 실패가 종료를 막으면 안 된다 */ }
    if (this.anyDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  /** 전역 단축키 (데스크톱) */
  private _onGlobalKey = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    // Escape — 열린 오버레이/모달을 닫는다 (웹/데모 모드에서도 동작)
    if (!mod && e.key === "Escape") {
      const s = this.state;
      if (s.tourOpen) { this.endTour(); return; }
      // 가져오기는 시트보다 위에 뜬다 — 열려 있으면 Esc 는 이걸 먼저 닫아야 한다.
      if (s.impOpen) { this.closeImport(); return; }
      if (s.sheetOpen) { this.closeSheet(); return; }
      if (s.cmdOpen) this.closeOverlay("cmd", { cmdOpen: false });
      else if (s.quickOpen) this.closeOverlay("quick", { quickOpen: false });
      else if (s.symOpen) this.closeOverlay("sym", { symOpen: false });
      else if (s.searchOpen) this.closeOverlay("search", { searchOpen: false });
      else if (s.aboutOpen) this.closeOverlay("about", { aboutOpen: false });
      else if (s.commandsOpen) this.closeOverlay("commands", { commandsOpen: false });
      else if (s.mcpOpen) this.closeOverlay("mcp", { mcpOpen: false });
      else if (s.usageOpen) this.closeOverlay("usage", { usageOpen: false });
      else if (s.keysOpen) this.closeOverlay("keys", { keysOpen: false });
      else if (s.settingsOpen) this.closeOverlay("settings", { settingsOpen: false });
      else if (s.extDetail) this.closeOverlay("extDetail", { extDetail: null });
      else if (s.extPanel) this.closeOverlay("extPanel", { extPanel: null });
      else if (s.askClose) this.closeOverlay("askClose", { askClose: null });
      else if (s.openMenu || s.projOpen) this.setState({ openMenu: null, projOpen: false });
      else if (this.engine.runs.activeRuns(["inline"]).length > 0) {
        // 진행 중 인라인 편집(Ctrl+K)을 Escape 로 취소 — 도달 가능한 유일한 트리거.
        // 예전엔 abortCtls 키의 "__inline" 접두어를 스니핑했다.
        this.engine.runs.cancelAll(["inline"]);
      }
      else return; // 닫을 오버레이 없음 → 다른 핸들러에 위임
      return;
    }
    if (!window.schutz) return;
    // 디버그 F키 (모디파이어 없음)
    if (!mod) {
      if (e.key === "F5") { e.preventDefault(); if (this.state.debug) { if (this.state.debug.status === "stopped") this.dbgContinue(); } else void this.startDebug(); return; }
      if (e.key === "F10" && this.state.debug?.status === "stopped") { e.preventDefault(); this.dbgStepOver(); return; }
      if (e.key === "F11" && this.state.debug?.status === "stopped") { e.preventDefault(); if (e.shiftKey) this.dbgStepOut(); else this.dbgStepIn(); return; }
      // F3 / Shift+F3 — 다음/이전 찾기 (VS Code 와 동일). 에디터 안이면 Monaco 가
      // 자체 키바인딩으로 처리하므로 밖에서 눌렀을 때만 넘긴다.
      if (e.key === "F3" && !this.inEditorDom(e.target)) {
        if (!this.activePane()) return;
        e.preventDefault();
        this.editorAction(e.shiftKey ? "findPrev" : "findNext");
        return;
      }
    }
    if (e.key === "F5" && e.shiftKey && this.state.debug) { e.preventDefault(); void this.stopDebug(); return; }
    if (!mod) return; // Escape 는 위에서 처리됨
    const k = e.key.toLowerCase();
    if (k === "p" && e.shiftKey) { e.preventDefault(); this.cancelClose("cmd"); this.setState(s => ({ cmdOpen: !s.cmdOpen, cmdQuery: "", cmdSel: 0 })); }
    else if (k === "p" && !e.shiftKey) { e.preventDefault(); this.cancelClose("quick"); this.setState(s => ({ quickOpen: !s.quickOpen, quickQuery: "", quickSel: 0 })); }
    else if (k === "t" && !e.shiftKey) { e.preventDefault(); this.cancelClose("sym"); this.openSymbolPalette(); }
    else if (k === "f" && e.shiftKey) { e.preventDefault(); this.cancelClose("search"); this.setState(s => ({ searchOpen: !s.searchOpen, searchSel: 0 })); }
    // 에디터 밖(트리·대화·터미널)에서 누른 Ctrl+F / Ctrl+H 를 활성 에디터로 보낸다.
    // VS Code 는 editorIsOpen 컨텍스트로 이걸 처리하는데 standalone Monaco 엔 그 키가
    // 없어서, 예전엔 에디터에 DOM 포커스가 이미 있을 때만 동작했다.
    // 에디터 안이면 건드리지 않는다 — 가로채면 찾기 위젯 안의 Ctrl+F 가 깨진다.
    else if ((k === "f" || k === "h") && !e.shiftKey && !this.inEditorDom(e.target)) {
      if (!this.activePane()) return;              // 열린 파일이 없으면 브라우저 기본 동작
      e.preventDefault();
      this.editorAction(k === "f" ? "find" : "replace");
    }
    else if (k === "o" && e.shiftKey) { e.preventDefault(); this.triggerOutline(); }
    else if (k === "s" && e.shiftKey) { e.preventDefault(); void this.saveAll(); }
    else if (k === "n" && !e.shiftKey) { e.preventDefault(); void this.newFileAt(""); }
    else if (k === "n" && e.shiftKey) { e.preventDefault(); window.schutz.newWindow(); }
    else if (k === "o" && !e.shiftKey) { e.preventDefault(); void this.openProject(); }
    else if (k === "g") { e.preventDefault(); this.triggerEditorAction("editor.action.gotoLine"); }
    else if (k === "tab") { e.preventDefault(); this.cycleMru(e.shiftKey ? -1 : 1); }
    else if (k === ",") { e.preventDefault(); this.openO({ settingsOpen: true }); }
    else if (k === "`") { e.preventDefault(); this.toggleTerm(); }
    else if (k === "m" && e.shiftKey) { e.preventDefault(); this.toggleUiMode(this.state.uiMode === "agent" ? "editor" : "agent"); }
  };

  /** Ctrl+Tab MRU 탭 순환 */
  private _mruCommit: (() => void) | null = null;
  cycleMru(dir: number) {
    const mru = this._tabMRU.filter(r => this.isOpen(r));
    if (mru.length < 2) return;
    if (!this.state.mruOpen) {
      this.setState({ mruOpen: true, mruSel: 1 });
      // Ctrl 떼면 확정
      const onUp = (ev: KeyboardEvent) => {
        if (ev.key === "Control" || ev.key === "Meta") {
          window.removeEventListener("keyup", onUp);
          this._mruCommit = null;
          const list = this._tabMRU.filter(r => this.isOpen(r));
          const rel = list[this.state.mruSel % Math.max(1, list.length)];
          this.setState({ mruOpen: false });
          if (rel) this.openFile(rel);
        }
      };
      this._mruCommit = () => window.removeEventListener("keyup", onUp);
      window.addEventListener("keyup", onUp);
    } else {
      this.setState(st => ({ mruSel: (st.mruSel + dir + mru.length) % mru.length }));
    }
  }

  /** 전역 텍스트 검색 실행 (디바운스는 호출측에서) */
  private _searchSeq = 0;
  private _shownQuery = ""; private _shownOpts = ""; // 표시된 결과가 어떤 query/opts 로 나온 것인지 — replace 표시-실행 불일치 방지
  async runSearch(query: string) {
    const ws = this.state.workspace;
    const seq = ++this._searchSeq;
    if (!ws || !window.schutz || query.trim().length < 2) {
      this._shownQuery = ""; this._shownOpts = "";
      this.setState({ searchResults: [], searchBusy: false, searchTruncated: false });
      return;
    }
    this.setState({ searchBusy: true });
    const opts = { ...this.state.searchOpts }; // 이 검색이 쓴 옵션 캡처
    try {
      const r = await window.schutz.searchFiles(ws.root, query, { max: 500, ...opts });
      if (seq !== this._searchSeq) return; // 최신 쿼리만 반영
      this._shownQuery = query; this._shownOpts = JSON.stringify(opts);
      this.setState({ searchResults: r.hits ?? [], searchBusy: false, searchTruncated: !!r.truncated, searchSel: 0 });
    } catch {
      if (seq !== this._searchSeq) return;
      this.setState({ searchResults: [], searchBusy: false, searchTruncated: false });
    }
  }

  /** 파일 전체에서 찾아 바꾸기 */
  async doReplaceAll() {
    const ws = this.state.workspace;
    const q = this.state.searchQuery;
    if (!ws || !window.schutz || q.trim().length < 2) return;
    // #9: 표시된 결과가 현재 query/opts 와 일치하고 검색이 끝났을 때만 — 아니면 치환 대상과 화면이 달라짐
    if (this.state.searchBusy || this._shownQuery !== q || this._shownOpts !== JSON.stringify(this.state.searchOpts)) {
      this.toast("error", t("sc3.replaceResultsStale")); return;
    }
    // #7: 열린 파일에 미저장 편집이 있으면 디스크 치환과 충돌(Save All 이 치환을 클로버 → 데이터 손실) → 먼저 저장 요구
    const dirtyOpen = Array.from(new Set([...this.allOpen(), ...projectModels.dirtyRels()]))
      .filter(rel => this.isDirtyRel(rel) && !this.parseDiffKey(rel));
    if (dirtyOpen.length) { this.toast("error", t("sc3.replaceSaveFirst", { files: dirtyOpen.slice(0, 6).join(", ") })); return; }
    if (!window.confirm(t("sc3.replaceAllConfirm", { q, rep: this.state.replaceVal }))) return;
    try {
      const r = await window.schutz.replaceInFiles(ws.root, q, this.state.replaceVal, this.state.searchOpts);
      // r.error 를 안 읽어서, 정규식이 거부돼도 "0개 파일 · 0곳 변경" 이 성공 토스트로 나가던 자리
      if (r.error) { this.toast("error", t("sc3.replaceFailed") + r.error); return; }
      if (r.partial) this.toast("error", t("sc3.replacePartial", { files: r.files, changed: r.changed }));
      else this.toast("ok", t("sc3.replaceResult", { files: r.files, changed: r.changed }));
      // 모든 non-dirty owned 모델 재로드 — 열린 탭뿐 아니라 preload(닫힌) 모델도 디스크 반영(#8: 나중에 열면 stale 방지). dirty 는 위에서 차단됨.
      void projectModels.reloadAll(ws.root, (r, rel) => window.schutz!.readFile(r, rel), this.isDirtyRel);
      this.setState(st => { const pv = { ...st.paneVer }; for (const p of this.allOpen(st)) pv[p] = (pv[p] ?? 0) + 1; return { paneVer: pv }; });
      void this.runSearch(q);
    } catch (e) { this.toast("error", t("sc3.replaceFailed") + (e instanceof Error ? e.message : String(e))); }
  }

  /** 검색 히트로 이동 — 파일 열고 해당 라인으로 스크롤 */
  jumpToHit(h: SearchHit) {
    this.openFile(h.rel);
    this.closeOverlay("search", { searchOpen: false });
    this.revealInPane(h.rel, h.line, h.col);
  }

  // ── Ctrl+T 워크스페이스 심볼 이동 (LSP workspace/symbol) ──────────────────
  private _symTimer: ReturnType<typeof setTimeout> | null = null;
  private _extSearchT: ReturnType<typeof setTimeout> | null = null;
  openSymbolPalette() {
    if (!this.state.workspace) { this.toast("info", t("sc3.openProjectFirst")); return; }
    this.openO({ symOpen: true, symQuery: "", symSel: 0, symResults: [], symLoading: false });
  }
  private runSymbolSearch(query: string) {
    this.setState({ symQuery: query, symSel: 0 });
    if (this._symTimer) clearTimeout(this._symTimer);
    const q = query.trim();
    if (!q) { this.setState({ symResults: [], symLoading: false }); return; }
    this.setState({ symLoading: true });
    this._symTimer = setTimeout(async () => {
      try {
        const raw = await lspClient.workspaceSymbols(q);
        const results = lspConv.toWorkspaceSymbols(raw).slice(0, 200);
        // 현재 쿼리와 여전히 일치할 때만 반영
        if (this.state.symQuery.trim() === q) this.setState({ symResults: results, symLoading: false });
      } catch { this.setState({ symResults: [], symLoading: false }); }
    }, 180);
  }
  /** LSP file uri → 워크스페이스 상대경로 */
  private uriToRel(uri: string): string | null {
    const ws = this.state.workspace;
    if (!ws) return null;
    let p: string;
    try { p = monaco.Uri.parse(uri).fsPath; } catch { return null; }
    const root = ws.root.replace(/\\/g, "/").replace(/\/+$/, "");
    const norm = p.replace(/\\/g, "/");
    if (norm.toLowerCase().startsWith(root.toLowerCase() + "/")) return norm.slice(root.length + 1);
    return norm.split("/").pop() || null;
  }
  jumpToSymbol(sym: { uri: string; range: import("monaco-editor").IRange }) {
    const rel = this.uriToRel(sym.uri);
    this.closeOverlay("sym", { symOpen: false });
    if (!rel) return;
    this.openFile(rel);
    this.revealInPane(rel, sym.range.startLineNumber, sym.range.startColumn);
  }

  // ── 디버그 (DAP) ───────────────────────────────────────────────────────────
  private dbgRelToAbs(rel: string): string {
    const root = (this.state.workspace?.root ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    return root + "/" + rel.replace(/\\/g, "/");
  }
  private dbgAbsToRel(abs: string): string | null {
    const root = (this.state.workspace?.root ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    const p = (abs ?? "").replace(/\\/g, "/");
    if (root && p.toLowerCase().startsWith(root.toLowerCase() + "/")) return p.slice(root.length + 1);
    return null;
  }
  /** 거터 클릭 → 브레이크포인트 토글 (실행 중이면 어댑터에도 반영) */
  toggleBreakpoint = (rel: string, line: number) => {
    // 갱신은 순수 updater 에서, IPC 부수효과는 완료 콜백에서 1회만 (StrictMode 이중 호출 대비)
    let next: number[] = [];
    this.setState(s => {
      const cur = s.breakpoints[rel] ?? [];
      next = cur.includes(line) ? cur.filter(l => l !== line) : [...cur, line].sort((a, b) => a - b);
      return { breakpoints: { ...s.breakpoints, [rel]: next } };
    }, () => { if (dap.isActive()) void dap.updateBreakpoints(this.dbgRelToAbs(rel), next); });
  };
  /** 에이전트 모드에서 파일을 잠깐 띄운다.
   *
   *  팬을 새로 만들거나 재부모화하지 않는다 — 에디터 그리드는 계속 마운트돼 있고
   *  display:none 으로 숨어 있을 뿐이라, 그걸 트랜스크립트 위로 올리기만 하면 된다.
   *  그래서 Ctrl+K·찾기·정의로 가기·문제 패널이 시트 안에서 전부 그대로 동작한다. */
  openSheet(rel: string) {
    void this.openFile(rel);
    this.setState({ sheetOpen: true });
  }
  /** 사용자가 "이 파일 좀 보자" 라고 한 경우 — 모드에 맞는 자리에 띄운다. */
  revealFile(rel: string) {
    if (this.state.uiMode === "agent") this.openSheet(rel);
    else void this.openFile(rel);
  }
  closeSheet() { this.setState({ sheetOpen: false }); }

  /** 모드 전환. 지금은 그냥 setState — 연출은 다음 단계에서 이 자리에 들어온다.
   *  워크스페이스가 열려 있으면 그 프로젝트에만 저장한다(대화만 하는 저장소와 손으로
   *  고치는 저장소를 따로 둘 수 있게). 아직 안 열렸으면 전역 기본값이 된다. */
  toggleUiMode(m: UiMode) {
    if (m === this.state.uiMode) return;
    setUiMode(m, this.state.workspace?.root);
    // flushSync 를 주입한다 — uiMode.ts 는 React 를 몰라야 하고(테스트가 node 로 가볍게
    // 돌아야 한다), 그렇다고 비동기로 그리면 브라우저가 옛 화면을 "새 화면" 으로 잡는다.
    switchUiMode(m, () => {
      applyUiMode(m);
      this.setState({ uiMode: m, openMenu: null, projOpen: false });
    }, flushSync);
  }

  /** 이 파일이 미저장인가 — **팬이 열려 있지 않아도** 참일 수 있다.
   *
   *  paneDirty 는 마운트된 MonacoPane 이 알려주는 것뿐이다. 크로스파일 이름 바꾸기
   *  (applyLspWorkspaceEdit)는 모델을 직접 고치고 paneDirty 는 건드리지 않으므로, 팬이
   *  없는 파일의 편집은 paneDirty 만 보면 "깨끗함" 으로 읽힌다. 그 상태로 syncFromDisk 가
   *  projectModels.reload 를 isDirty=false 로 부르면 setValue 로 통째로 덮어써서
   *  **편집이 조용히 사라진다.** 미저장 여부를 묻는 자리는 전부 이 술어를 쓴다. */
  private isDirtyRel = (rel: string): boolean => !!this.state.paneDirty[rel] || projectModels.isDirty(rel);
  /** 어디든 미저장이 있는가 (종료·브랜치 전환 가드용) */
  private anyDirty(): boolean {
    return Object.values(this.state.paneDirty).some(Boolean) || projectModels.dirtyRels().length > 0;
  }
  // MonacoPane 콜백 — 안정 참조(arrow property)로 두어 React.memo 가 불필요한 리렌더를 차단하게 한다
  private handleDirtyChange = (rel: string, d: boolean) => this.setState(st => ({ paneDirty: { ...st.paneDirty, [rel]: d } }));
  private handleStatus = (info: any) => this.setState({ statusInfo: info });
  private handleInlineEdit = (rel: string, selection: string, instruction: string, range?: InlineRange) => void this.inlineEdit(rel, selection, instruction, range);

  /** 현재 활성 파일(.py)을 디버그 실행 */
  async startDebug() {
    const ws = this.state.workspace;
    const rel = this.state.active[this._focusSlot];
    if (!ws || !rel) { this.toast("info", t("sc3.openDebugFile")); return; }
    if (!rel.endsWith(".py")) { this.toast("info", t("sc3.pythonOnlyDebug")); return; }
    if (dap.isActive()) await this.stopDebug();
    const bpByPath: Record<string, number[]> = {};
    for (const [r, lines] of Object.entries(this.state.breakpoints)) if (lines.length) bpByPath[this.dbgRelToAbs(r)] = lines;
    this.setState({ debug: { status: "starting", threadId: null, frames: [], frameId: null, scopes: [], stoppedRel: null, stoppedLine: null }, debugConsole: [], leftTab: "debug" });
    const res = await dap.launch("python", { program: this.dbgRelToAbs(rel), cwd: ws.root }, bpByPath, {
      onStopped: (b) => void this.onDebugStopped(b),
      onContinued: () => this.setState(s => ({ debug: s.debug ? { ...s.debug, status: "running", stoppedLine: null, stoppedRel: null } : null })),
      onOutput: (cat, text) => this.setState(s => ({ debugConsole: [...s.debugConsole, (cat === "stderr" ? "⚠ " : "") + text].slice(-500) })),
      onTerminated: () => { this.setState({ debug: null }); this.toast("info", t("sc3.debugSessionEnded")); },
      onExited: (code) => this.setState(s => ({ debugConsole: [...s.debugConsole, t("sc3.processExited", { code })] })),
    });
    if (!res.ok) { this.setState({ debug: null }); this.toast("error", t("sc3.debugStartFailed") + (res.reason || "")); }
    else this.setState(s => ({ debug: s.debug ? { ...s.debug, status: "running" } : null }));
  }

  private async onDebugStopped(body: dap.StoppedBody) {
    const threadId = body.threadId ?? 1;
    const raw = await dap.stackTrace(threadId);
    const frames = raw.map((f: any) => ({ id: f.id, name: f.name, line: f.line, path: f.source?.path ?? "" }));
    const top = frames[0];
    const scopes = top ? await this.dbgLoadScopes(top.id) : [];
    const stoppedRel = top ? this.dbgAbsToRel(top.path) : null;
    const stoppedLine = top?.line ?? null;
    if (stoppedRel) this.openFile(stoppedRel);
    this.setState({ debug: { status: "stopped", threadId, frames, frameId: top?.id ?? null, scopes, stoppedRel, stoppedLine }, leftTab: "debug" });
  }

  private async dbgLoadScopes(frameId: number): Promise<DebugScope[]> {
    const scopes = await dap.scopes(frameId);
    const out: DebugScope[] = [];
    for (const sc of scopes) {
      const isLocal = /local/i.test(sc.name);
      const vars = isLocal ? await dap.variables(sc.variablesReference) : [];
      out.push({ name: sc.name, ref: sc.variablesReference, vars: vars.map((v: any) => ({ name: v.name, value: v.value, type: v.type, ref: v.variablesReference })), expanded: isLocal });
    }
    return out;
  }

  /** 콜스택 프레임 선택 → 해당 변수·위치로 */
  async selectFrame(frameId: number) {
    const s = this.state;
    if (!s.debug) return;
    const fr = s.debug.frames.find(f => f.id === frameId);
    const scopes = await this.dbgLoadScopes(frameId);
    const stoppedRel = fr ? this.dbgAbsToRel(fr.path) : s.debug.stoppedRel;
    if (stoppedRel) this.openFile(stoppedRel);
    this.setState(st => ({ debug: st.debug ? { ...st.debug, frameId, scopes, stoppedRel, stoppedLine: fr?.line ?? st.debug.stoppedLine } : null }));
  }
  async toggleScope(idx: number) {
    const s = this.state;
    if (!s.debug) return;
    const scope = s.debug.scopes[idx];
    if (!scope) return;
    let vars = scope.vars;
    if (!scope.expanded && vars.length === 0) { const v = await dap.variables(scope.ref); vars = v.map((x: any) => ({ name: x.name, value: x.value, type: x.type, ref: x.variablesReference })); }
    this.setState(st => ({ debug: st.debug ? { ...st.debug, scopes: st.debug.scopes.map((sc, i) => i === idx ? { ...sc, expanded: !sc.expanded, vars } : sc) } : null }));
  }

  // ── 확장 ─────────────────────────────────────────────────────────────────
  async reloadExtensions() {
    if (!window.schutz) return;
    const res = await extHost.loadExtensions({
      toast: (k, m) => this.toast(k, m),
      showPanel: (title, html) => this.openO({ extPanel: { title, html } }),
      getActiveFile: () => this.state.active[this._focusSlot] || null,
    });
    // VS Code 확장(선언형) — 테마·스니펫·언어설정 적용
    const vres = await vscodeExt.loadVscodeExtensions();
    // 아이콘 테마 목록 수집
    const raw = await window.schutz.extList();
    const iconThemes: { extId: string; label: string; path: string }[] = [];
    for (const e of raw) { if (e.kind === "vscode" && e.enabled) for (const it of (e.contributes?.iconThemes || [])) iconThemes.push({ extId: e.id, label: it.label || e.name, path: it.path }); }
    iconTheme.setIconThemeChangeHandler(() => this.setState(s => ({ iconVer: s.iconVer + 1 })));
    const list = await extHost.listExtensions();
    this.setState({ extCommands: extHost.getExtCommands(), extList: list, extErrors: res.errors, extLimited: res.limited, extThemes: vres.themes, extIconThemes: iconThemes });
    // TextMate 문법 연결 (있으면 VS Code급 하이라이팅) — 완료 후 테마 조율
    await textmate.loadTextMateGrammars().catch(() => 0);
    // 영속 선택 복원/조율: 가져온 에디터 테마 + 아이콘 테마 (재시작·재로드 후에도 유지)
    this.applyEditorTheme(vres.themes);
    const savedIcon = getActiveIconTheme();
    if (savedIcon && !iconTheme.isIconThemeActive() && iconThemes.some(it => it.extId === savedIcon.extId && it.path === savedIcon.path)) {
      const ok = await iconTheme.setIconTheme(savedIcon.extId, savedIcon.path, savedIcon.label);
      if (ok) this.setState(s => ({ iconVer: s.iconVer + 1 }));
    }
    // 하드 오류(아무 기여도 못한 확장)만 빨간 토스트로. 선언형 기여가 살아있는 "기능 제한"은
    // 확장 관리 패널에서만 차분히 안내(정상 동작하는 확장을 오류로 오인시키지 않음).
    if (res.errors.length) {
      console.error("[Schutz] 확장 오류:", res.errors);
      this.toast("error", t("sc3.extErrorCount", { n: res.errors.length }) + res.errors.map(e => e.split(":")[0]).join(", "));
    }
  }
  async applyIconTheme(th: { extId: string; label: string; path: string } | null) {
    if (!th) { iconTheme.clearIconTheme(); setActiveIconTheme(null); this.toast("info", t("sc3.builtinIconUse")); this.forceUpdate(); return; }
    const ok = await iconTheme.setIconTheme(th.extId, th.path, th.label);
    if (ok) setActiveIconTheme({ extId: th.extId, path: th.path, label: th.label });
    this.toast(ok ? "ok" : "error", ok ? t("sc3.iconThemeSet", { label: th.label }) : t("sc3.iconThemeFail"));
    this.forceUpdate();
  }
  /** Open VSX 마켓플레이스 검색 (빈 쿼리면 인기 확장) */
  async extMarketSearch(q: string) {
    this.setState({ extSearch: q });
    if (this._extSearchT) clearTimeout(this._extSearchT);
    if (!window.schutz) return;
    this.setState({ extBusy: true });
    this._extSearchT = setTimeout(async () => {
      try {
        const r = await window.schutz!.openVsxSearch(q.trim());
        if (this.state.extSearch.trim() !== q.trim()) return; // 쿼리 변경됨 → 무시
        if (!r.ok) this.toast("error", t("sc3.marketSearchFailed") + (r.error || t("sc3.networkError")));
        this.setState({ extResults: r.ok ? (r.extensions || []) : [], extBusy: false });
      } catch (e) {
        if (this.state.extSearch.trim() !== q.trim()) return;
        this.toast("error", t("sc3.marketSearchFailed") + (e instanceof Error ? e.message : String(e)));
        this.setState({ extResults: [], extBusy: false });
      }
    }, q.trim() ? 320 : 0);
  }
  /** 확장 상세(정보) 열기 — Open VSX 메타 + README */
  async openExtDetail(namespace: string, name: string) {
    if (!window.schutz) return;
    this.openO({ extDetail: { namespace, name, displayName: name, loading: true }, extDetailBusy: true });
    const r = await window.schutz.openVsxDetail(namespace, name);
    if (r.ok) this.setState({ extDetail: r.detail, extDetailBusy: false });
    else { this.setState({ extDetail: null, extDetailBusy: false }); this.toast("error", t("sc3.infoLoadFailed") + (r.error || "")); }
  }
  fmtCount(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n || 0);
  }
  async extInstall(namespace: string, name: string) {
    if (!window.schutz) return;
    const key = namespace + "." + name;
    this.setState(s => ({ extInstalling: [...s.extInstalling, key] }));
    const r = await window.schutz.vsixInstallOpenVsx(namespace, name);
    this.setState(s => ({ extInstalling: s.extInstalling.filter(k => k !== key) }));
    if (r.ok) { this.toast("ok", t("sc3.extInstalled", { name: r.name })); await this.reloadExtensions(); this.autoApplyInstalled(r.id || key); }
    else this.toast("error", t("sc3.installFailed") + (r.error || ""));
  }
  /** 설치 직후 확장의 선언형 기여를 즉시 적용 — 테마·아이콘테마는 자동 활성화.
   *  reloadExtensions 가 채운 extThemes/extIconThemes(둘 다 extId 보유)로 판정 — 확실한 신호. */
  private async autoApplyInstalled(id: string) {
    const th = this.state.extThemes.find(x => x.extId === id);
    if (th) this.selectVsxTheme(th);
    const it = this.state.extIconThemes.find(x => x.extId === id);
    if (it) await this.applyIconTheme(it);
    // 테마/아이콘이 아니면 문법 기여 여부만 원본 목록으로 확인해 안내
    if (!th && !it && window.schutz) {
      try {
        const raw = await window.schutz.extList();
        const ext = raw.find(e => e.id === id);
        const grammars = (ext?.contributes as any)?.grammars;
        if (Array.isArray(grammars) && grammars.length) this.toast("info", t("sc3.grammarApplied"));
      } catch { /* ignore */ }
    }
  }
  async toggleExtEnabled(id: string, enabled: boolean) {
    if (!window.schutz) return;
    await window.schutz.extSetEnabled(id, enabled);
    await this.reloadExtensions();
    this.toast("info", t("sc3.extToggled", { state: enabled ? t("sc3.enabled") : t("sc3.disabled") }));
  }

  private dbgTid(): number { return this.state.debug?.threadId ?? 1; }
  dbgContinue = () => { this.setState(s => ({ debug: s.debug ? { ...s.debug, status: "running", stoppedLine: null, stoppedRel: null } : null })); void dap.cont(this.dbgTid()); };
  dbgStepOver = () => void dap.next(this.dbgTid());
  dbgStepIn = () => void dap.stepIn(this.dbgTid());
  dbgStepOut = () => void dap.stepOut(this.dbgTid());
  async stopDebug() { await dap.shutdown(); this.setState({ debug: null }); }

  private _lastTabsRef: string[][] | null = null;
  private _lastActiveRef: string[] | null = null;
  /** 렌더 커밋 직전의 채팅 스크롤 상태 — 하단 추적 판정은 반드시 갱신 전 값으로 해야 한다 */
  getSnapshotBeforeUpdate(): { chatAtBottom: boolean } | null {
    const el = this._chat;
    if (!el) return null;
    return { chatAtBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 60 };
  }

  componentDidUpdate(_pp?: any, _ps?: any, snap?: { chatAtBottom: boolean } | null) {
    // 도움말 → 오프닝 다시 보기는 해시만 바꾼다. App 은 재마운트되지 않으므로
    // componentDidMount 가 다시 돌지 않는다 — prop 이 켜지는 순간을 여기서 잡는다.
    if (this.props.playOpening && !_pp?.playOpening && this.state.openingPhase === "off") {
      this.setState({ openingPhase: "intro" });
    }
    // 모드가 바뀌면 Monaco 를 다시 재어준다. automaticLayout 은 display:none 안에서
    // 0×0 으로 측정하고, 다시 보일 때 ResizeObserver 가 뒤늦게 따라오면서 한 프레임
    // 어긋난 크기가 보인다. 명시적으로 한 번 재면 그 깜빡임이 없어진다.
    if (_ps && _ps.uiMode !== this.state.uiMode) {
      applyUiMode(this.state.uiMode);
      requestAnimationFrame(() => {
        for (const p of paneRegistry.panes.values()) { try { p.editor.layout(); } catch { /* 이미 dispose */ } }
      });
    }
    // 대화가 바뀌면 저장한다. 예전엔 **턴이 끝나야** 저장했는데, 응답이 실패하거나 아직
    // 도는 중이면 그 대화는 색인에 영영 안 올라왔다 — 최근 항목에는 말을 건 순간부터
    // 있어야 한다. 전송 경로마다 손으로 다는 건 하나를 빠뜨렸고(실제로 그랬다) 새 경로가
    // 생기면 또 빠진다. 참조 비교라 O(1) 이고, persistLayout 과 같은 디바운스 관용구다.
    if (_ps && _ps.messages !== this.state.messages) {
      clearTimeout(this._sessionT);
      this._sessionT = setTimeout(() => this.saveSession(), 400);
    }
    // 탭/활성/레이아웃이 바뀌면(참조 비교 O(1)) 레이아웃 영속 (디바운스)
    if (this.state.workspace && (this.state.tabs !== this._lastTabsRef || this.state.active !== this._lastActiveRef)) {
      this._lastTabsRef = this.state.tabs; this._lastActiveRef = this.state.active;
      this.persistLayout();
    }
    if (this._chat) {
      // 지금 탭에 보이는 것만 기준으로 — 안 보이는 탭이 자라도 끌어내리지 않는다.
      // 그리고 사용자가 위로 올려 읽는 중이면 건드리지 않는다(예전엔 매 토큰 하단으로 잡아당겼다).
      const el = this._chat;
      // text 가 없는 손상된 항목이 하나라도 있으면 여기서 터져 화면 전체가 하얘졌다 — 방어
      const sig = this.state.chatTab + "|" + this.visibleMessages().map(m => (m.text ?? "").length).join(",");
      if (sig !== this._chatSig) {
        this._chatSig = sig;
        if (snap ? snap.chatAtBottom : true) el.scrollTop = el.scrollHeight;
      }
      this.onChatScroll(); // 버튼 노출은 스크롤 위치 하나로 판단 (도착·스크롤 공통)
    }
    this.allOpen().forEach(path => {
      const el = this._paneRefs[path];
      if (!el) return;
      const doc = this.state.docs[path] || [];
      const i = doc.findIndex(l => l.kind === "typing");
      if (i >= 0) {
        const y = Math.max(0, i * 20 - el.clientHeight * 0.55);
        if (Math.abs(el.scrollTop - y) > 10) el.scrollTop = y;
      }
    });
  }

  /** 신택스 하이라이트 (프로토타입 hl 포팅) */
  hl(text: string, md: boolean): React.ReactNode {
    if (!text) return "";
    if (md) {
      if (/^#/.test(text)) return <span style={{ color: "#93A896", fontWeight: 600 }}>{text}</span>;
      const base = /^\|/.test(text) ? "var(--fg-sub)" : "var(--fg-code)";
      const parts = text.split(/(`[^`]+`)/g);
      return parts.map((p, i) => <span key={i} style={{ color: p.startsWith("`") ? "#8BB292" : base }}>{p}</span>);
    }
    const tr = text.trim();
    if (tr.startsWith("//") || tr.startsWith("/*") || tr.startsWith("*")) {
      return <span style={{ color: "#535B55", fontStyle: "italic" }}>{text}</span>;
    }
    const re = /("[^"]*"|'[^']*'|`[^`]*`)|\b(import|from|export|class|interface|type|private|readonly|constructor|async|await|return|if|new|const|null|void|this|typeof)\b|\b(\d[\d_]*)\b|\b([A-Z][A-Za-z0-9_]*)\b|([a-zA-Z_$][\w$]*)(?=\()/g;
    const out: React.ReactNode[] = [];
    let last = 0, m: RegExpExecArray | null, k = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(<span key={k++}>{text.slice(last, m.index)}</span>);
      const c = m[1] ? "#8BB292" : m[2] ? "#C4A882" : m[3] ? "#9CB8B0" : m[4] ? "#AEBFAE" : "#8FA8C0";
      out.push(<span key={k++} style={{ color: c }}>{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(<span key={k++}>{text.slice(last)}</span>);
    return out;
  }

  agentColorFor(path: string): string | null {
    const s = this.state;
    for (const a of AGDEF) { if (s.agents[a.id].file === path) return a.color; }
    const f = s.files.find(x => x.path === path);
    return f ? this.agDef(f.agent).color : null;
  }

  diffRows(path: string) {
    const doc = this.state.docs[path] || [];
    const marked = doc.map(l => !!(l.hunk && ["pending", "removed", "typing", "fresh", "accepted"].includes(l.kind)));
    if (!marked.some(Boolean)) return [];
    const include = doc.map((_, i) => {
      for (let j = Math.max(0, i - 2); j <= Math.min(doc.length - 1, i + 2); j++) if (marked[j]) return true;
      return false;
    });
    const rows: any[] = [];
    let oldN = 0, newN = 0, prevIncluded = true;
    doc.forEach((l, i) => {
      const isOld = l.kind === "base" || l.kind === "removed";
      const isNew = l.kind !== "removed";
      if (isOld) oldN++;
      if (isNew) newN++;
      if (!include[i]) { prevIncluded = false; return; }
      if (!prevIncluded && rows.length) rows.push({ key: "sep" + i, sep: true });
      prevIncluded = true;
      let sign = " ", bg = "transparent", color = "var(--fg-sub2)", signColor = "transparent";
      if (l.kind === "removed") { sign = "−"; bg = "rgba(201,123,123,.1)"; color = "#C99A9A"; signColor = "#C97B7B"; }
      else if (marked[i]) { sign = "+"; bg = "color-mix(in srgb, var(--ok) 9%, transparent)"; color = "#B7CBBA"; signColor = "var(--ok)"; }
      rows.push({
        key: "d" + i, sep: false,
        oldN: isOld ? String(oldN) : "", newN: isNew ? String(newN) : "",
        sign, signColor, bg, color, text: l.text || " ",
      });
    });
    return rows;
  }

  render() {
    const s = this.state;
    const stMap = { idle: t("topstatus.idle"), thinking: t("topstatus.thinking"), tool: t("topstatus.tool"), review: t("topstatus.review"), stopped: t("topstatus.stopped") };
    const statusLabel = stMap[s.statusKey];
    const totIn = AGDEF.reduce((n, d) => n + s.agents[d.id].tin, 0);
    const totOut = AGDEF.reduce((n, d) => n + s.agents[d.id].tout, 0);
    // 금액 표기 제거 — 구독 경로에서는 늘 $0 이라 의미가 없었다. 대신 잔여 할당량.
    const quotaSummary = this.quotaText(getManagerId()) ?? this.quotaText("claude") ?? this.quotaText("gpt");
    const pendingFiles = s.files.filter(f => f.status === "pending").length;
    const doneCount = s.plan.filter(p => p.st === "done").length;
    // plan 이 있으면(데모) 항목 완료율, 없으면(실제 실행) 라운드 진행도를 쓴다.
    // 예전엔 plan 이 없으면 무조건 "8%" 라, 실제 AI 실행 내내 빔이 8% 에 굳어 있었다.
    const beamPct = s.plan.length
      ? Math.round((doneCount / s.plan.length) * 100)
      : Math.round(s.runProgress * 100);
    const beamW = s.running ? Math.max(6, Math.min(96, beamPct)) + "%" : "100%";
    const beamOp = s.running ? 1 : (pendingFiles > 0 ? 0.55 : 0.2);
    const flow = s.leftTab === "flow";
    // 에이전트 모드는 **아무것도 언마운트하지 않는다.** 메인 행의 다섯 자식을 display:none 으로
    // 감추고 좌측 열만 넓힌다. Monaco·PTY·LSP 가 그대로 살아 있어 저장·종료 가드·파일 락이
    // 손대지 않아도 동일하게 동작하고, display:none 서브트리는 뷰 트랜지션 캡처에서도 빠져
    // 다음 단계의 변신에서 같은 이름이 두 번 잡히는 문제도 같이 없어진다.
    const ag = s.uiMode === "agent";
    const gone = ag ? { display: "none" as const } : null;
    // 시트: 에이전트 모드에서 코드를 잠깐 띄운 상태. 에디터 그리드를 새로 만들지 않고
    // 이미 마운트된 그것을 트랜스크립트 위로 덮는다 — 그래서 그 안의 기능이 전부 살아 있다.
    const sheet = ag && s.sheetOpen;
    const editorGone = sheet ? null : gone;
    const anyMenuOpen = !!s.openMenu || s.projOpen;
    const closeMenus = () => this.setState({ openMenu: null, projOpen: false });

    return (
      <div style={{ height: "100vh", minWidth: 1400, display: "flex", flexDirection: "column", background: "var(--bg-root)", color: "var(--fg)", fontFamily: `var(--font-ui, ${SUIT})`, fontSize: 13, overflow: "hidden" }}>
        {anyMenuOpen && <div onClick={closeMenus} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}
        {this.renderSettings()}
        {this.renderQuickOpen()}
        {this.renderSymbolPalette()}
        {this.renderExtPanel()}
        {this.renderExtDetail()}
        {this.renderAbout()}
        {this.renderCommands()}
        {this.renderMcp()}
        {this.renderTour()}
        {/* 첫 실행 오프닝 — App 위 오버레이. 뒤에 진짜 UI 가 이미 떠 있어서
            세팅이 끝나면 오버레이만 걷고 그 UI 를 데모가 직접 움직인다. */}
        {this.state.openingPhase !== "off" && (
          <Opening
            phase={this.state.openingPhase}
            onWantsImport={w => { this._wantsImport = w; }}
            onDone={({ wantsTour }) => this.finishDemo(wantsTour, this._wantsImport)}
            onStartDemo={() => { this.setState({ openingPhase: "off" }); void this.runDemo(); }}
          />
        )}
        {/* 데모 진행 중 자막 — 화면이 알아서 움직이는데 설명이 없으면 구경만 하게 된다.
            자막은 pointerEvents: none 이라야 그 아래 UI 를 가로막지 않는데, 건너뛰기는
            눌려야 하므로 그 버튼에서만 다시 켠다. */}
        {this.state.demoCaption && (
          <div key={this.state.demoCaption} className="sz-in" style={{
            position: "fixed", left: 0, right: 0, bottom: 34, zIndex: 480,
            display: "grid", justifyItems: "center", gap: 6, padding: "0 8vw",
            textAlign: "center", pointerEvents: "none",
          }}>
            <div style={{ fontSize: 17, fontWeight: 650, color: "var(--fg)", textShadow: "0 2px 18px var(--bg-root)" }}>
              {t(`open.cap.${this.state.demoCaption}.t`)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-sub)", maxWidth: "62ch", lineHeight: 1.6, textShadow: "0 2px 18px var(--bg-root)" }}>
              {t(`open.cap.${this.state.demoCaption}.b`)}
            </div>
          </div>
        )}
        {/* 시연 도중의 탈출구.
            자막 블록 **밖**에 산다. 안에 두면 자막이 바뀔 때마다(시연 중 7번) key 가 갈려
            React 가 이 노드를 버리고 새로 만든다 — 사용자의 mousedown 과 mouseup 사이에
            그 일이 벌어지면 두 이벤트가 서로 다른 노드에 떨어져 **click 이 아예 발생하지
            않는다.** 그래서 "한 번 눌렀는데 아무 일도 안 일어나고, 두 번째에야 된다" 가 됐다.
            (프로그램으로 .click() 을 부르면 늘 성공해서 오래 안 보였다.)
            이제 시연이 도는 동안 같은 노드로 살아 있고, 처음 한 번만 떠오른다. */}
        {this.state.demoRunning && (
          <button onClick={() => this.skipDemo()} className="hv08"
            style={{
              position: "fixed", right: 18, bottom: 12, zIndex: 481,
              fontFamily: SUIT, fontSize: 12, padding: "7px 16px", borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--w12)", background: "var(--w04)", color: "var(--fg-sub)",
              backdropFilter: "blur(6px)",
              animation: "szFadeUp var(--dur) var(--ease) both", animationDelay: "900ms",
            }}>{t("open.demoSkip")}</button>
        )}
        {this.renderUsage()}
        {this.renderKeybindings()}
        {this.renderCommandPalette()}
        {this.renderSearch()}
        {this.renderAskClose()}
        {this.renderAskRun()}
        {this.renderImport()}
        {this.renderToasts()}
        {this.renderMru()}
        {s.ctxMenu && (
          <div onClick={() => this.setState({ ctxMenu: null })} onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: null }); }}
            style={{ position: "fixed", inset: 0, zIndex: 190 }}>
            <div className="sz-drop" onClick={e => e.stopPropagation()}
              style={{ position: "fixed", left: s.ctxMenu.x, top: s.ctxMenu.y, minWidth: 160, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 8, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 191 }}>
              {s.ctxMenu.isDir && (
                <>
                  <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.newFileAt(r); }}
                    style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--fg-code)" }}>{t("sc4.ctxNewFile")}</div>
                  <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.newFolderAt(r); }}
                    style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--fg-code)" }}>{t("sc4.ctxNewFolder")}</div>
                </>
              )}
              <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.renameAt(r); }}
                style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--fg-code)" }}>{t("sc4.ctxRename")}</div>
              <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.revealAt(r); }}
                style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--fg-code)" }}>{t("sc4.ctxReveal")}</div>
              <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.deleteAt(r); }}
                style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "#CE9A9A" }}>{t("sc4.ctxDelete")}</div>
            </div>
          </div>
        )}

        {/* ══ Header ══ */}
        <div className="titlebar vtTopbar" style={{ flex: "none", height: 54, display: "flex", alignItems: "center", gap: 10, padding: window.schutz ? "2px 150px 0 14px" : "0 14px", background: "var(--bg-panel)", borderBottom: "1px solid var(--w06)", position: "relative", zIndex: 50 }}>
          <Logo size={24} />

          {/* project switcher */}
          <div style={{ position: "relative" }}>
            <button className="hv06" onClick={() => this.setState(st => ({ projOpen: !st.projOpen, openMenu: null }))}
              style={{ height: 28, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--fg)", background: s.projOpen ? "var(--w07)" : "var(--w03)", border: "1px solid var(--w08)", borderRadius: 7, cursor: "pointer" }}>
              {s.workspace ? s.workspace.name : (window.schutz ? t("sc4.projSwitcherOpen") : "schutz-core")}
              {s.workspace?.branch && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--fg-sub2)", fontWeight: 400, fontFamily: MONO, background: "var(--w05)", borderRadius: 4, padding: "2px 7px 2px 5px" }}>
                  <GitBranchIcon />{s.workspace.branch}
                </span>
              )}
              <span style={{ fontSize: 8, color: "var(--fg-dim)" }}>▾</span>
            </button>
            {s.projOpen && (
              <div className="sz-drop" style={{ position: "absolute", top: 33, left: 0, width: 250, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 6, zIndex: 100 }}>
                <div style={{ padding: "4px 8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("sc4.projHeader")}</div>
                {s.workspace ? (
                  <div className="hv05" onClick={closeMenus} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}>
                    <span style={{ flex: "none", width: 20, height: 20, borderRadius: 5, background: "var(--accent)", color: "var(--bg-root)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{s.workspace.name.slice(0, 1).toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--fg)" }}>{s.workspace.name}</div>
                      <div style={{ fontSize: 10, color: "var(--fg-dim)", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{s.workspace.root}</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: "var(--accent)" }}>✓</span>
                  </div>
                ) : (
                  <div style={{ padding: "4px 8px 8px", fontSize: 11, color: "var(--fg-dim2)" }}>{t("sc4.noOpenProject")}</div>
                )}
                {window.schutz && this.recents().filter(r => r.root !== s.workspace?.root).slice(0, 5).map(r => (
                  <div key={r.root} className="hv05" onClick={() => { this.setState({ projOpen: false }); void this.openWorkspacePath(r.root); }}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 8px", borderRadius: 6, cursor: "pointer" }}>
                    <span style={{ flex: "none", width: 20, height: 20, borderRadius: 5, background: "var(--w06)", color: "var(--fg-sub)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{r.name.slice(0, 1).toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--fg-sub)" }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: "var(--fg-dim)", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{r.root}</div>
                    </div>
                  </div>
                ))}
                <div style={{ height: 1, background: "var(--w07)", margin: "5px 6px" }} />
                <div className="hv05" onClick={() => void this.openProject()} style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--fg-sub)" }}>
                  {t("sc4.openProjectMenu")}<div style={{ flex: 1 }} /><span style={{ fontSize: 10.5, color: "var(--fg-dim)", fontFamily: MONO }}>{accel("⌘O")}</span>
                </div>
              </div>
            )}
          </div>

          <span style={{ width: 1, height: 16, background: "var(--w07)" }} />

          {/* menu bar */}
          <div data-tour="menubar" style={{ display: "flex", gap: 1 }}>
            {MENUS.map(([k, items]) => {
              const open = s.openMenu === k;
              return (
                <div key={k} style={{ position: "relative" }}>
                  <button
                    className="hvMenuBtn"
                    onClick={() => this.setState(st => ({ openMenu: st.openMenu === k ? null : k, projOpen: false }))}
                    onMouseEnter={() => this.setState(st => (st.openMenu && st.openMenu !== k) ? { openMenu: k } as any : null)}
                    style={{ height: 26, padding: "0 10px", fontFamily: "inherit", fontSize: 12, color: open ? "var(--fg)" : "var(--fg-sub2)", background: open ? "var(--w07)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer" }}>
                    {t("menu." + k)}
                  </button>
                  {open && (
                    <div className="sz-drop" style={{ position: "absolute", top: 29, left: 0, minWidth: 215, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 5, zIndex: 100 }}>
                      {items.map((it, i) => it === null
                        ? <div key={"s" + i} style={{ height: 1, background: "var(--w07)", margin: "4px 6px" }} />
                        : (
                          <div key={"i" + i} className="hvMenuItem"
                            onClick={() => {
                              switch (it[0]) {
                                case "file.openProject": void this.openProject(); return;
                                case "file.settings": this.openO({ openMenu: null, settingsOpen: true }); return;
                                case "file.newWindow": window.schutz?.newWindow(); this.setState({ openMenu: null }); return;
                                case "file.new": this.setState({ openMenu: null }); void this.newFileAt(""); return;
                                case "file.save": this.setState({ openMenu: null }); void this.saveActive(); return;
                                case "file.saveAll": this.setState({ openMenu: null }); void this.saveAll(); return;
                                case "ai.models": this.openO({ openMenu: null, settingsOpen: true }); return;
                                case "ai.usage": this.openO({ openMenu: null, usageOpen: true }); return;
                                case "ai.mcp": this.setState({ openMenu: null }); this.openMcp(); return;
                                case "ai.import": this.setState({ openMenu: null }); this.openImport(); return;
                                case "view.mode": this.setState({ openMenu: null }); this.toggleUiMode(this.state.uiMode === "agent" ? "editor" : "agent"); return;
                                case "view.terminal": this.setState({ openMenu: null }); this.toggleTerm(); return;
                                case "view.split4": this.setLayout(4); return;
                                case "view.split2": this.setLayout(2); return;
                                case "view.splitReset": this.setLayout(1); return;
                                case "view.format": this.setState({ openMenu: null }); void paneRegistry.focused?.editor.getAction("editor.action.formatDocument")?.run(); return;
                                case "view.wordWrap": this.setState({ openMenu: null }); this.applyEditorPref({ wordWrap: !getEditorPrefs().wordWrap }); return;
                                case "view.minimap": this.setState({ openMenu: null }); this.applyEditorPref({ minimap: !getEditorPrefs().minimap }); return;
                                case "view.problems": this.setState({ openMenu: null, termOpen: true, termTab: "problems" }); return;
                                case "nav.quickOpen": this.openO({ openMenu: null, quickOpen: true, quickQuery: "", quickSel: 0 }); return;
                                case "nav.commandPalette": this.openO({ openMenu: null, cmdOpen: true, cmdQuery: "", cmdSel: 0 }); return;
                                case "nav.symbol": this.setState({ openMenu: null }); this.triggerOutline(); return;
                                case "edit.undo": this.setState({ openMenu: null }); this.editorAction("undo"); return;
                                case "edit.redo": this.setState({ openMenu: null }); this.editorAction("redo"); return;
                                case "edit.cut": this.setState({ openMenu: null }); this.editorAction("cut"); return;
                                case "edit.copy": this.setState({ openMenu: null }); this.editorAction("copy"); return;
                                case "edit.paste": this.setState({ openMenu: null }); this.editorAction("paste"); return;
                                case "edit.find": this.setState({ openMenu: null }); this.editorAction("find"); return;
                                case "edit.replace": this.setState({ openMenu: null }); this.editorAction("replace"); return;
                                case "edit.findInFiles": this.setState({ openMenu: null }); this.cancelClose("search"); this.setState({ searchOpen: true, searchSel: 0 }); return;
                                case "help.replayOpening":
                                  // 여기서 바로 켠다. 예전엔 해시(#/opening)로 넘겨 Root 가 다시
                                  // 마운트하게 했는데, **두 번째부터 아무 일도 안 일어났다** —
                                  // 해시가 이미 #/opening 이면 hashchange 가 안 나기 때문이다.
                                  // 오프닝은 App 을 대신하지 않고 그 위에 덮는 오버레이라,
                                  // 상태 하나면 충분하다(해시 왕복이 사던 게 없었다).
                                  this.setState({ openMenu: null, openingPhase: "intro" });
                                  return;
                                case "help.replayTutorial": this.setState({ openMenu: null }); this.startTour(); return;
                                case "help.keys": this.openO({ openMenu: null, keysOpen: true }); return;
                                case "help.about": this.openO({ openMenu: null, aboutOpen: true }); return;
                                default: this.setState({ openMenu: null });
                              }
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 18, padding: "5px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--fg-code)" }}>{t("menu." + it[0])}</span>
                            <div style={{ flex: 1 }} />
                            <span style={{ color: "var(--fg-dim)", fontSize: 10.5, fontFamily: MONO }}>{accel(it[1])}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* 모드 알약 — 반드시 <button> 이어야 한다. global.css 가 .titlebar 를
              -webkit-app-region: drag 로 만들고 button/input/[data-nodrag] 만 예외라,
              styled <div> 로 두면 창 끌기 영역에 먹혀 클릭 자체가 안 된다. */}
          <div data-tour="mode" style={{ display: "flex", gap: 2, padding: 2, borderRadius: 8, background: "var(--w03)", border: "1px solid var(--w08)" }}>
            {UI_MODES.map(m => {
              const on = s.uiMode === m;
              return (
                <button key={m} title={t("mode.switchTitle")} aria-pressed={on} onClick={() => this.toggleUiMode(m)}
                  style={{
                    height: 22, display: "flex", alignItems: "center", gap: 5, padding: "0 9px",
                    fontFamily: "inherit", fontSize: 11.5, fontWeight: on ? 650 : 500, cursor: "pointer",
                    borderRadius: 6, border: "none", whiteSpace: "nowrap",
                    color: on ? "var(--accent-hi)" : "var(--fg-dim)",
                    background: on ? "rgba(143,168,147,.16)" : "transparent",
                    transition: "background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)",
                  }}>
                  <ModeGlyph mode={m} color={on ? "var(--accent-hi)" : "#6E776F"} />
                  {t("mode." + m)}
                </button>
              );
            })}
          </div>
          <span style={{ width: 1, height: 16, background: "var(--w08)", margin: "0 2px" }} />

          {(() => { const mcpRunning = s.mcpServers.filter(x => x.running).length; return (
            <button data-tour="mcp" className="hv07" title={t("title.mcp")} onClick={() => this.openMcp()} style={{ ...iconBtn, position: "relative" }}>
              <McpIcon size={14} color={mcpRunning > 0 ? "var(--accent-hi)" : "#6E776F"} />
              {mcpRunning > 0 && (
                <span style={{ position: "absolute", top: -2, right: -2, minWidth: 13, height: 13, padding: "0 3px", borderRadius: 7, background: "var(--accent)", color: "var(--on-accent)", fontSize: 8.5, fontWeight: 800, lineHeight: "13px", textAlign: "center" }}>{mcpRunning}</span>
              )}
            </button>
          ); })()}
          <button className="hv07" title={t("title.goToFile")} onClick={() => this.openO({ quickOpen: true, quickQuery: "", quickSel: 0 })} style={iconBtn}><SearchIcon /></button>
          <span style={{ width: 1, height: 16, background: "var(--w08)" }} />
          <span style={{ fontSize: 12, color: "var(--fg-sub2)", whiteSpace: "nowrap" }}>{statusLabel}</span>
          <span style={{ width: 1, height: 16, background: "var(--w08)" }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-dim)", whiteSpace: "nowrap" }}>{t("sc4.tokenSummary", { in: totIn.toLocaleString(), out: totOut.toLocaleString() })}</span>
        </div>

        {/* progress beam */}
        <div style={{ flex: "none", height: 2.5, background: "#141715" }}>
          <div className="szMoving" style={{ height: "100%", width: beamW, opacity: beamOp, background: "linear-gradient(90deg,#4D5D53,#7D9183,var(--accent-hi))", transition: "width .5s ease,opacity .8s ease" }} />
        </div>

        {/* ══ Main ══ */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>

          {/* tool rail */}
          {this.renderAgentAside()}
          <div data-tour="rail" className="vtRail" style={{ flex: "none", width: 42, background: "var(--bg-panel)", borderRight: "1px solid var(--w06)", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 4, ...gone }}>
            <button data-tour="rail-tree" className="hv07" title={t("sc4.railProject")} onClick={() => this.setState({ leftTab: "tree" })} style={{ ...railBtn, background: s.leftTab === "tree" ? "rgba(143,168,147,.16)" : "transparent" }}>
              <FolderIcon color={s.leftTab === "tree" ? "var(--accent-hi)" : "#6E776F"} />
            </button>
            <button className="hv07" title={t("sc4.railFlow")} onClick={() => this.setState({ leftTab: "flow" })} style={{ ...railBtn, background: flow ? "rgba(143,168,147,.16)" : "transparent" }}>
              <FlowIcon color={flow ? "var(--accent-hi)" : "#6E776F"} />
            </button>
            <button className="hv07" title={t("sc4.railGit")} onClick={() => { this.setState({ leftTab: "git" }); void this.loadGit(); }} style={{ ...railBtn, position: "relative", background: s.leftTab === "git" ? "rgba(143,168,147,.16)" : "transparent" }}>
              <GitBranchIcon color={s.leftTab === "git" ? "var(--accent-hi)" : "#6E776F"} />
              {(() => { const c = (s.git?.staged.length ?? 0) + (s.git?.unstaged.length ?? 0) + (s.git?.untracked.length ?? 0); return c > 0 ? <span style={{ position: "absolute", top: 3, right: 3, minWidth: 13, height: 13, borderRadius: 7, background: "var(--accent)", color: "var(--on-accent)", fontSize: 8.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{c}</span> : null; })()}
            </button>
            <button className="hv07" title={t("sc4.railDebug")} onClick={() => this.setState({ leftTab: "debug" })} style={{ ...railBtn, position: "relative", background: s.leftTab === "debug" ? "rgba(143,168,147,.16)" : "transparent" }}>
              <DebugIcon />
              {s.debug && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 4, background: s.debug.status === "stopped" ? "#E0B052" : "#5DA06E" }} />}
            </button>
            <button className="hv07" title={t("sc4.railExt")} onClick={() => { this.setState({ leftTab: "ext" }); void this.reloadExtensions(); if (!this.state.extResults.length) void this.extMarketSearch(""); }} style={{ ...railBtn, background: s.leftTab === "ext" ? "rgba(143,168,147,.16)" : "transparent" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={s.leftTab === "ext" ? "var(--accent-hi)" : "#6E776F"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6v3a2 2 0 1 0 4 0V3h2v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H3v-6h3a2 2 0 1 0 0-4H3V3h6z" /></svg>
            </button>
            <div style={{ width: 22, height: 1, background: "var(--w07)", margin: "4px 0" }} />
            <button className="hv07" title={t("sc4.railTerminal")} onClick={() => this.toggleTerm()} style={{ ...railBtn, background: s.termOpen ? "rgba(143,168,147,.16)" : "transparent" }}>
              <TermIcon />
            </button>
            <div style={{ flex: 1 }} />
            <button className="hv07" title={t("sc4.railSettings")} onClick={() => this.openO({ settingsOpen: true })} style={railBtn}><GearIcon /></button>
          </div>

          {/* ── Left column ── */}
          <div ref={el => { this._leftCol = el; }}
            style={{ flex: ag ? 1 : "none", width: ag ? "auto" : s.leftW, minWidth: 0, display: "flex", flexDirection: "column", borderRight: ag ? "none" : "1px solid var(--w06)", background: ag ? "var(--bg-root)" : "var(--bg-panel)" }}>
            <div style={{ flex: "none", padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)", ...gone }}>{s.leftTab === "flow" ? t("panel.flow") : s.leftTab === "git" ? t("panel.git") : s.leftTab === "debug" ? t("panel.debug") : s.leftTab === "ext" ? t("panel.ext") : t("panel.tree")}</div>

            {/* 키에 워크스페이스를 포함 — 탭 전환뿐 아니라 프로젝트 전환 때도 페이드가 재생된다(전에는 프로젝트를 바꿔도 내용만 툭 갈렸다) */}
            <div data-tour="left-panel" key={s.leftTab + "|" + (s.workspace?.root ?? "")} className="sz-in" style={{ flex: 1, minHeight: ag ? 0 : TREE_MIN_H, display: "flex", flexDirection: "column", ...gone }}>
              {s.leftTab === "flow" ? this.renderFlow() : s.leftTab === "git" ? this.renderGit() : s.leftTab === "debug" ? this.renderDebug() : s.leftTab === "ext" ? this.renderExt() : this.renderTree()}
            </div>
            {/* 트리↔대화 세로 리사이즈 핸들 */}
            <div onMouseDown={e => this.startChatResize(e)} title={t("sc4.resizeHandleV")}
              style={{ flex: "none", height: 5, cursor: "row-resize", background: "transparent", zIndex: 30, ...gone }} className="szResize" />
            {this.renderChat()}
          </div>
          {/* 좌 리사이즈 핸들 */}
          <div onMouseDown={e => this.startResize("left", e)} title={t("sc4.resizeHandle")}
            style={{ flex: "none", width: 5, cursor: "col-resize", background: "transparent", zIndex: 30, ...gone }} className="szResize" />
          {/* 대화 ↔ 산출물 패널 — 에이전트 모드에서 패널이 열려 있을 때만 */}
          {sheet && (
            <div onMouseDown={e => this.startAgentSideResize(e)} title={t("sc4.resizeHandle")}
              style={{ flex: "none", width: 5, cursor: "col-resize", background: "transparent", zIndex: 30 }} className="szResize" />
          )}

          {/* ── Editor grid ── */}
          <div data-tour="editor" className="vtEditor" style={{ position: "relative", flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: s.layout === 1 ? "1fr" : "1fr 1fr", gridTemplateRows: s.layout === 4 ? "1fr 1fr" : "1fr", gap: 1, background: "var(--w07)",
            // 시트가 아니라 **분할**이다. 전체 화면을 덮으면 코드를 보는 동안 대화가 사라져
            // 무슨 이야기 중이었는지 잃는다. 옆에 두면 보면서 이어갈 수 있다.
            ...(sheet ? { flex: "none" as const, width: s.agentSideW, minWidth: 0, paddingTop: 30, background: "var(--bg-editor)", borderLeft: "1px solid var(--w06)" } : null), ...editorGone }}>
            {/* 패널 머리줄. 그리드 안에 있어야 position:absolute 가 이 패널을 기준으로 잡힌다 —
                밖에 두면 메인 행 전체에 걸려 대화 위를 가로지른다. */}
            {sheet && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 30, zIndex: 25, display: "flex", alignItems: "center", gap: 9, padding: "0 8px 0 12px", background: "var(--bg-panel)", borderBottom: "1px solid var(--w06)" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)" }}>{t("mode.sheetTitle")}</span>
                <div style={{ flex: 1 }} />
                <button className="hvDim" title={t("mode.sheetClose")} onClick={() => this.closeSheet()}
                  style={{ width: 22, height: 22, fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
              </div>
            )}
            {this.renderPanes()}
          </div>

          {/* 우 리사이즈 핸들 */}
          <div onMouseDown={e => this.startResize("right", e)} title={t("sc4.resizeHandle")}
            style={{ flex: "none", width: 5, cursor: "col-resize", background: "transparent", zIndex: 30, ...gone }} className="szResize" />
          {/* ── Right column ── */}
          {/* 예전엔 이 컬럼 전체가 data-tour="agents" 라 에이전트와 변경 검토가
              한 덩어리로 강조됐다. 둘은 다른 이야기라 앵커를 나눈다. */}
          <div className="vtSide" style={{ flex: "none", width: s.rightW, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--w06)", background: "var(--bg-panel)", ...gone }}>
            <div data-tour="agents" style={{ flex: "none", display: "flex", flexDirection: "column", minHeight: 0 }}>{this.renderAgents()}</div>
            <div data-tour="review" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{this.renderReview()}</div>
          </div>
        </div>

        {/* ══ Terminal dock ══ 최초 오픈 후엔 계속 마운트 유지(접어도 셸·스크롤백 보존), 접힘은 display:none 로 처리 */}
        {(s.termOpen || this._termMounted) && this.renderTerm()}

        {/* ══ Status bar ══ */}
        <div className="vtStatus" style={{ flex: "none", height: 25, display: "flex", alignItems: "center", gap: 13, padding: "0 12px", background: "var(--bg-panel)", borderTop: "1px solid var(--w06)", fontSize: 11, color: "var(--fg-dim)" }}>
          {(s.git?.branch || s.workspace?.branch) && (
            <button className="hv08" onClick={() => { this.setState({ leftTab: "git" }); void this.loadGit(); }}
              style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10.5, color: "var(--fg-sub2)", background: "transparent", border: "none", cursor: "pointer", height: 18, padding: "0 5px", borderRadius: 4 }}>
              <GitBranchIcon size={10} sw={1.6} />{s.git?.branch ?? s.workspace?.branch}
              {s.git?.upstream && (s.git.behind > 0 || s.git.ahead > 0) && (
                <span style={{ color: "var(--fg-dim)" }}>{s.git.behind > 0 ? " ↓" + s.git.behind : ""}{s.git.ahead > 0 ? " ↑" + s.git.ahead : ""}</span>
              )}
            </button>
          )}
          {(() => { const c = (s.git?.staged.length ?? 0) + (s.git?.unstaged.length ?? 0) + (s.git?.untracked.length ?? 0); return c > 0
            ? <span style={{ color: "#CCB491" }}>{t("status.changes", { n: c })}</span>
            : <span style={{ color: pendingFiles > 0 ? "#CCB491" : "var(--fg-dim)" }}>{pendingFiles > 0 ? t("status.pendingReview", { n: pendingFiles }) : t("status.noChanges")}</span>; })()}
          <div style={{ flex: 1 }} />
          <span>{t("status.agentsActive", { active: AGDEF.filter(d => ["edit", "plan"].includes(s.agents[d.id].status)).length, total: AGDEF.length })}</span>
          {quotaSummary && (() => {
            const left = this.quotaTightest(getManagerId()) ?? this.quotaTightest("claude") ?? this.quotaTightest("gpt") ?? 100;
            return <span title={t("status.quotaTitle")} style={{ fontFamily: MONO, color: left <= 10 ? "#CE9A9A" : left <= 25 ? "#C4A882" : "var(--fg-dim)" }}>{quotaSummary}</span>;
          })()}
          {ag && s.workspace && (
            <span style={{ fontFamily: MONO, color: "var(--fg-dim2)" }}>{s.workspace.name}</span>
          )}
          {ag && s.cliModel && (
            <span style={{ fontFamily: MONO, color: "var(--fg-dim2)" }}>{s.cliModel}</span>
          )}
          {/* Ln:Col 은 포커스된 편집기가 있어야 뜻이 있다 — 시트를 열었을 때만 남긴다 */}
          {(!ag || sheet) && s.statusInfo && (
            <>
              <span style={{ fontFamily: MONO }}>{s.statusInfo.lang}</span>
              <span style={{ fontFamily: MONO }}>Ln {s.statusInfo.line}:{s.statusInfo.col}</span>
            </>
          )}
          <span style={{ width: 1, height: 13, background: "var(--w07)" }} />
          <button className="hv08" onClick={() => this.toggleTerm()}
            style={{ height: 19, padding: "0 8px", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: s.termOpen ? "var(--accent-hi)" : "var(--fg-dim)", background: s.termOpen ? "rgba(143,168,147,.14)" : "transparent", border: "none" }}>
            <TermStatusIcon />{t("status.terminal")}
          </button>
        </div>
      </div>
    );
  }

  // ── 좌 패널: 소스 컨트롤 (Git) ──
  private gitCodeColor(code: string): string {
    if (code === "A" || code === "?") return "var(--ok)";
    if (code === "M") return "#CCB491";
    if (code === "D") return "#C97B7B";
    if (code === "R" || code === "C") return "#8FA8C0";
    return "var(--fg-sub2)";
  }

  renderGit() {
    const s = this.state;
    const g = s.git;
    if (!window.schutz) {
      return <div style={{ flex: 1, padding: "10px 16px", fontSize: 12, color: "var(--fg-dim)" }}>{t("gitp.desktopOnly")}</div>;
    }
    if (!s.workspace) {
      return <div style={{ flex: 1, padding: "10px 16px", fontSize: 12, color: "var(--fg-dim)" }}>{t("gitp.openProjectFirst")}</div>;
    }
    if (g?.notRepo) {
      return <div style={{ flex: 1, padding: "10px 16px", fontSize: 12, color: "var(--fg-dim)", lineHeight: 1.7 }}>{t("gitp.notRepo")}<br />{t("gitp.notRepoRunPrefix")}<span style={{ fontFamily: MONO, color: "var(--fg-sub2)" }}>git init</span>{t("gitp.notRepoRunSuffix")}</div>;
    }
    const staged = g?.staged ?? [];
    const changes = [...(g?.unstaged ?? []), ...(g?.untracked ?? []).map(u => ({ ...u, code: "?" }))];
    const untrackedSet = new Set((g?.untracked ?? []).map(u => u.path));

    const row = (e: GitEntry, section: "staged" | "changes") => {
      const isUntracked = untrackedSet.has(e.path);
      const name = e.path.split("/").pop();
      return (
        <div key={section + ":" + e.path} className="hv04"
          onClick={() => this.openDiff(e.path, section === "staged", isUntracked)}
          style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: "0 10px 0 14px", cursor: "pointer" }}>
          <span style={{ flex: "none", width: 12, textAlign: "center", fontFamily: MONO, fontSize: 11, fontWeight: 700, color: this.gitCodeColor(e.code) }}>{e.code}</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.path}>{name}</span>
          <span style={{ fontSize: 10, color: "var(--fg-dim3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : ""}</span>
          <div style={{ flex: 1 }} />
          {section === "changes" ? (
            <>
              <button className="hvDim" title={t("gitp.discardChange")} disabled={this.state.gitBusy} onClick={ev => { ev.stopPropagation(); void this.gitDiscard(e.path, isUntracked); }}
                style={gitIconBtn}>↩</button>
              <button className="hvDim" title={t("gitp.stage")} disabled={this.state.gitBusy} onClick={ev => { ev.stopPropagation(); void this.gitDo("stage", { path: e.path }); }}
                style={gitIconBtn}>＋</button>
            </>
          ) : (
            <button className="hvDim" title={t("gitp.unstage")} disabled={this.state.gitBusy} onClick={ev => { ev.stopPropagation(); void this.gitDo("unstage", { path: e.path }); }}
              style={gitIconBtn}>−</button>
          )}
        </div>
      );
    };

    return (
      <div style={{ flex: 1.15, minHeight: 0, display: "flex", flexDirection: "column", borderBottom: "1px solid var(--w06)" }}>
        {/* 브랜치 + 동기화 */}
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "2px 14px 8px", position: "relative" }}>
          <button className="hv05" title={t("gitp.switchCreateBranch")} onClick={() => this.setState(st => ({ branchOpen: !st.branchOpen }))}
            style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 11, color: "var(--fg-sub)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 5 }}>
            <GitBranchIcon size={11} color="var(--accent-hi)" />{g?.branch ?? "—"}<span style={{ fontSize: 7, opacity: .7 }}>▾</span>
          </button>
          {g?.upstream && (g.ahead > 0 || g.behind > 0) && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)" }}>{g.behind > 0 ? "↓" + g.behind : ""}{g.ahead > 0 ? " ↑" + g.ahead : ""}</span>
          )}
          {s.branchOpen && (
            <>
              <div onClick={() => this.setState({ branchOpen: false })} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
              <div className="sz-drop" style={{ position: "absolute", top: 28, left: 14, zIndex: 91, minWidth: 220, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 9, boxShadow: "var(--shadow-pop)", padding: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)", padding: "3px 8px 5px" }}>{t("gitp.switchBranch")}</div>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {s.gitBranches.map(b => (
                    <div key={b} className="hv04" onClick={() => void this.gitCheckout(b)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: b === g?.branch ? "var(--accent-soft)" : "transparent" }}>
                      <span style={{ flex: "none", width: 10, color: "var(--accent)", fontSize: 10 }}>{b === g?.branch ? "✓" : ""}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--fg)" }}>{b}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 5, padding: "6px 6px 3px", borderTop: "1px solid var(--w06)", marginTop: 4 }}>
                  <input value={s.newBranch} onChange={e => this.setState({ newBranch: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") void this.gitCreateBranch(); }}
                    placeholder={t("gitp.newBranchName")}
                    style={{ flex: 1, minWidth: 0, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 6, height: 26, padding: "0 8px", color: "var(--fg)", fontSize: 11, fontFamily: MONO, outline: "none" }} />
                  <button className="hvAccent" onClick={() => void this.gitCreateBranch()}
                    style={{ flex: "none", height: 26, padding: "0 9px", fontSize: 10.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("gitp.create")}</button>
                </div>
              </div>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button className="hvDim" title={t("common.refresh")} onClick={() => void this.loadGit()} style={gitIconBtn} disabled={s.gitBusy}>⟳</button>
          <button className="hv05" title={g?.upstream ? t("gitp.push") : t("gitp.setUpstreamAndPush")} disabled={s.gitBusy || !(g && g.ahead > 0)}
            onClick={() => void this.gitDo("push", { setUpstream: !g?.upstream })}
            style={{ height: 22, padding: "0 9px", fontSize: 10.5, fontFamily: "inherit", cursor: (g && g.ahead > 0) ? "pointer" : "default", borderRadius: 6, color: (g && g.ahead > 0) ? "var(--fg-sub)" : "var(--fg-dim3)", background: "transparent", border: "1px solid var(--w12)" }}>
            {t("gitp.push")}{g && g.ahead > 0 ? " ↑" + g.ahead : ""}
          </button>
        </div>

        {/* 커밋 박스 */}
        <div style={{ flex: "none", padding: "0 14px 10px" }}>
          <textarea value={s.gitMsg} placeholder={t("gitp.commitPlaceholder")}
            onChange={e => this.setState({ gitMsg: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void this.gitCommit(); } }}
            style={{ width: "100%", minHeight: 48, resize: "vertical", background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 8, padding: "8px 10px", color: "var(--fg)", fontSize: 12, fontFamily: SUIT, outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <button className="hvAccent" disabled={s.gitBusy || staged.length === 0 || !s.gitMsg.trim()}
              onClick={() => void this.gitCommit()}
              style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: (staged.length && s.gitMsg.trim()) ? "pointer" : "default", borderRadius: 8, color: "var(--on-accent)", background: (staged.length && s.gitMsg.trim()) ? "var(--accent)" : "var(--w10)", border: "none" }}>
              ✓ {t("gitp.commit")}{staged.length ? " (" + staged.length + ")" : ""}
            </button>
          </div>
          {s.gitError && <div style={{ fontSize: 10.5, color: "#CE9A9A", marginTop: 6, lineHeight: 1.5 }}>⚠️ {s.gitError}</div>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 10 }}>
          {staged.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 3px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("gitp.staged")}</span>
                <span style={{ fontSize: 10, color: "var(--fg-dim2)" }}>{staged.length}</span>
                <div style={{ flex: 1 }} />
                <button className="hvDim" title={t("gitp.unstageAll")} disabled={s.gitBusy} onClick={() => void this.gitUnstageAll()} style={{ ...gitIconBtn, width: "auto", padding: "0 6px", fontSize: 10 }}>−</button>
              </div>
              {staged.map(e => row(e, "staged"))}
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px 3px" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("gitp.changes")}</span>
            <span style={{ fontSize: 10, color: "var(--fg-dim2)" }}>{changes.length}</span>
            <div style={{ flex: 1 }} />
            {changes.length > 0 && <button className="hvDim" title={t("gitp.stageAll")} disabled={s.gitBusy} onClick={() => void this.gitDo("stageAll")} style={{ ...gitIconBtn, width: "auto", padding: "0 6px", fontSize: 11 }}>＋</button>}
          </div>
          {changes.length === 0 && staged.length === 0 && (
            <div style={{ padding: "8px 16px", fontSize: 11.5, color: "var(--fg-dim2)" }}>{t("gitp.noChanges")}</div>
          )}
          {changes.map(e => row(e, "changes"))}

          {/* 커밋 히스토리 */}
          {s.gitLog.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px 3px", borderTop: "1px solid var(--w06)", marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("gitp.history")}</span>
              </div>
              {s.gitLog.slice(0, 40).map(c => (
                <div key={c.hash} className="hv04" title={`${c.author} · ${c.date}`}
                  style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "3px 14px", cursor: "default" }}>
                  <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, color: "var(--accent)" }}>{c.hash}</span>
                  <span style={{ fontSize: 11, color: "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ flex: "none", fontSize: 9.5, color: "var(--fg-dim2)", whiteSpace: "nowrap" }}>{c.date}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  async gitUnstageAll() {
    // git reset -q HEAD -- . (전체 스테이지 해제)
    await this.gitDo("unstage", { path: "." });
  }

  async gitDiscard(path: string, untracked: boolean) {
    if (!window.confirm(t("sc4.discardConfirm", { path }))) return;
    await this.gitDo("discard", { path, untracked });
    void this.refreshWorkspace();
  }

  // ── 좌 패널: 작업 흐름 ──
  renderFlow() {
    const s = this.state;
    const planIcon: Record<string, [string, string]> = { pending: ["○", "var(--fg-dim2)"], done: ["✓", "var(--ok)"], stopped: ["–", "#C97B7B"] };
    const doneLabel = t("flowtree.done"); // 아래 s.tools.map(t => …) 에서 t 가 섀도잉되므로 미리 계산
    const editVerb = t("sc3.verbEdit"); // verb 는 번역값(1973) → 편집 하이라이트 비교를 리터럴 대신 번역값으로
    return (
      <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 14px 14px", position: "relative", borderBottom: "1px solid var(--w06)" }}>
        <div style={{ position: "absolute", left: 21, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#3B463F,#7D9183,#3B463F)", opacity: .4 }} />
        {s.plan.length === 0 && (
          <div style={{ position: "relative", paddingLeft: 22, fontSize: 12, color: "var(--fg-dim2)", marginTop: 8 }}>{t("flowtree.emptyState")}</div>
        )}
        {s.plan.length > 0 && (
          <div style={{ position: "relative", marginTop: 6 }}>
            <span style={{ position: "absolute", left: 4, top: 8, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
            <div style={{ marginLeft: 22, background: "var(--bg-card)", border: "1px solid var(--w06)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("flowtree.planLabel")}</span>
                <span style={{ fontSize: 10, color: "var(--accent)", background: "rgba(143,168,147,.1)", borderRadius: 3, padding: "0 6px", lineHeight: "15px" }}>{t("flowtree.planAuthor")}</span>
              </div>
              {s.plan.map(p => {
                const [icon, iconColor] = planIcon[p.st] || ["○", "var(--fg-dim2)"];
                const d = this.agDef(p.agent);
                const labelColor = p.st === "done" ? "#535B55" : p.st === "active" ? "var(--fg)" : p.st === "stopped" ? "#B98A8A" : "var(--fg-sub2)";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2.5px 0" }}>
                    <span style={{ flex: "none", width: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.st === "active"
                        ? <span style={spinner("var(--accent)", "rgba(143,168,147,.25)")} />
                        : <span style={{ fontSize: 10.5, color: iconColor }}>{icon}</span>}
                    </span>
                    <span style={{ fontSize: 11.5, color: labelColor, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ flex: "none", fontSize: 9.5, color: d.color, border: `1px solid ${d.color}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{d.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {s.tools.map(t => {
          const d = this.agDef(t.agent);
          return (
            <div key={t.id} style={{ position: "relative", marginTop: 10 }}>
              <span style={{ position: "absolute", left: 5, top: 5, width: 6, height: 6, borderRadius: "50%", background: d.color }} />
              <div style={{ marginLeft: 22, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: "none", fontSize: 9.5, color: d.color, border: `1px solid ${d.color}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{d.name}</span>
                <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, padding: "0 6px", lineHeight: "16px", borderRadius: 3, color: t.verb === editVerb ? "#CCB491" : "#A3B5A6", background: t.verb === editVerb ? "rgba(196,168,130,.1)" : "rgba(125,145,131,.12)" }}>{t.verb}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.path.split("/").pop()}</span>
                <div style={{ flex: 1 }} />
                {t.st === "run"
                  ? <span style={{ ...spinner("var(--accent)", "rgba(143,168,147,.25)"), flex: "none" }} />
                  /* 완료 라벨은 스피너가 있던 자리에 **떠오르며** 들어온다 — 스피너에서 이
                     span 으로 노드가 갈리므로 이 애니메이션은 완료되는 그 순간 한 번 돈다.
                     예전엔 스피너가 사라지고 글자가 제자리에 툭 나타나서 "끝나는 과정" 이
                     안 보였다. */
                  : <span style={{ flex: "none", fontFamily: MONO, fontSize: 10.5, whiteSpace: "nowrap", color: t.st === "stopped" ? "#C97B7B" : "#535B55", animation: "szFadeUp .32s var(--ease) both" }}>{t.note || doneLabel}</span>}
              </div>
              {/* 명령 출력 — 있으면 도구 줄 밑에 그대로 편다. 에디터 모드에서 도구는 이 flow
                  패널에만 뜨는데(대화 옆 renderToolRow 는 에이전트 모드용) 여기엔 출력이 안
                  보여서, 실행 결과가 "돌지도 않고 완료" 로 읽혔다. 한 줄씩 흘려 넣으면 이 자리에
                  줄이 차오르며 실제로 도는 것처럼 마친다. */}
              {t.out && (
                <pre style={{ margin: "6px 0 0 22px", padding: "8px 11px", maxHeight: 160, overflow: "auto",
                  fontFamily: MONO, fontSize: 10.5, lineHeight: 1.65, color: "var(--fg-code)",
                  background: "var(--bg-editor)", border: "1px solid var(--w06)", borderRadius: 7, whiteSpace: "pre" }}>{t.out}</pre>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── 좌 패널: 파일 트리 ──
  renderTree() {
    const s = this.state;
    // 데스크톱 앱 + 워크스페이스 없음 → 빈 상태 (데모 트리는 웹 프리뷰 전용)
    if (window.schutz && !s.workspace) {
      return (
        <div style={{ flex: 1.15, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, borderBottom: "1px solid var(--w06)", padding: "0 20px" }}>
          <span style={{ fontSize: 12, color: "var(--fg-dim)", textAlign: "center", lineHeight: 1.7 }}>{t("flowtree.noProject")}</span>
          <button className="hvAccent" onClick={() => void this.openProject()}
            style={{ height: 30, padding: "0 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>{t("flowtree.openProject")}</button>
        </div>
      );
    }
    // 실제 워크스페이스가 열려 있으면 실파일 트리
    if (s.workspace) {
      const ws = s.workspace;
      const collapsed = s.collapsed;
      // 접힘 판정 — 항목의 조상 경로만 검사(O(depth))해 O(N·M) 전체 스캔 회피
      const isHidden = (rel: string) => {
        const parts = rel.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) { acc = acc ? acc + "/" + parts[i] : parts[i]; if (collapsed[acc]) return true; }
        return false;
      };
      return (
        <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 0 14px", borderBottom: "1px solid var(--w06)" }}>
          <div style={{ padding: "4px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{ws.name.toUpperCase()}</div>
          {ws.entries.map(en => {
            const pad = 16 + en.depth * 14;
            if (isHidden(en.rel)) return null;
            if (en.dir) {
              const isCollapsed = !!s.collapsed[en.rel];
              return (
                <div key={en.rel} className="hv04 sz-row-in" onClick={() => this.setState(st => ({ collapsed: { ...st.collapsed, [en.rel]: !st.collapsed[en.rel] } }))}
                  onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: { x: e.clientX, y: e.clientY, rel: en.rel, isDir: true } }); }}
                  style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "pointer" }}>
                  <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", width: 8, display: "inline-block", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform var(--dur) var(--ease)" }}>▸</span>
                  <span style={{ fontSize: 12, color: "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.name}</span>
                </div>
              );
            }
            const inPane = this.isOpen(en.rel, s);
            const dirty = s.paneDirty[en.rel];
            return (
              <div key={en.rel} className="hv04 sz-row-in" onClick={() => this.openFile(en.rel)}
                onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: { x: e.clientX, y: e.clientY, rel: en.rel, isDir: false } }); }}
                style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "pointer", background: inPane ? "rgba(125,145,131,.08)" : "transparent", transition: "background var(--dur-fast) var(--ease)" }}>
                <FileIcon rel={en.rel} size={14} />
                <span style={{ fontSize: 12, fontFamily: MONO, color: inPane ? "var(--fg)" : "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.name}</span>
                <div style={{ flex: 1 }} />
                {dirty && <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: "#CCB491" }} />}
              </div>
            );
          })}
          {ws.truncated && <div style={{ padding: "6px 16px", fontSize: 10.5, color: "var(--fg-dim2)" }}>{t("flowtree.truncated")}</div>}
        </div>
      );
    }
    const lockOf = (path: string) => AGDEF.find(d => s.agents[d.id].file === path);
    const pendOf = (path: string) => s.files.find(f => f.path === path && f.status === "pending");
    const fileRow = (path: string, name: string, pad: number) => {
      const lock = lockOf(path);
      const pend = pendOf(path);
      const inPane = this.isOpen(path, s);
      return (
        <div key={path} className="hv04" onClick={() => this.openFile(path)}
          style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "pointer", background: inPane ? "rgba(125,145,131,.08)" : "transparent" }}>
          <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", width: 8 }}></span>
          <span style={{ fontSize: 12, fontFamily: MONO, color: inPane ? "var(--fg)" : "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <div style={{ flex: 1 }} />
          {lock && (
            <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: lock.color, border: `1px solid ${lock.color}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: lock.color, animation: "szPulse 1.1s ease-in-out infinite" }} />{lock.name}
            </span>
          )}
          {!lock && pend && <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: this.agDef(pend.agent).color }} />}
        </div>
      );
    };
    const dirRow = (key: string, name: string, pad: number) => (
      <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "default" }}>
        <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", width: 8 }}>▾</span>
        <span style={{ fontSize: 12, color: "var(--fg-sub2)" }}>{name}</span>
      </div>
    );
    const plainRow = (key: string, name: string, pad: number) => (
      <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "default" }}>
        <span style={{ flex: "none", fontSize: 9, width: 8 }}></span>
        <span style={{ fontSize: 12, fontFamily: MONO, color: "#6E776F" }}>{name}</span>
      </div>
    );
    return (
      <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 0 14px", borderBottom: "1px solid var(--w06)" }}>
        <div style={{ padding: "4px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>SCHUTZ-CORE</div>
        {dirRow("d1", "src", 16)}
        {dirRow("d2", "auth", 30)}
        {fileRow(TM, "token-manager.ts", 44)}
        {fileRow(TY, "types.ts", 44)}
        {plainRow("f1", "client.ts", 44)}
        {plainRow("f2", "index.ts", 44)}
        {dirRow("d3", "docs", 16)}
        {fileRow(MD, "auth.md", 30)}
        {plainRow("f3", "package.json", 16)}
      </div>
    );
  }

  /** 현재 탭에 보여줄 메시지. 레거시(agent 없음)는 전체 탭에서만 보인다 —
   *  who 접두어로 역추론하면 언어가 바뀌었거나 "Codex · 구독" 같은 값에서 틀린다. */
  private visibleMessages(): ChatMsg[] {
    const { chatTab, messages } = this.state;
    if (chatTab === "all") return messages;
    // schutz = 시스템 응답(슬래시 명령 결과·경고). 탭은 없지만 모든 탭에 보여야 한다 —
    // 안 그러면 에이전트 탭에서 /model 을 쳤을 때 명령도 답도 사라져 먹통처럼 보인다.
    return messages.filter((m, i) => {
      if (m.agent === chatTab || m.agent === "schutz") return true;
      // 시스템 응답 바로 앞의 사용자 메시지(= 그 명령)도 짝지어 보여준다
      const next = messages[i + 1];
      return m.role === "user" && !m.agent && !!next && next.agent === "schutz";
    });
  }

  /** 탭별 스크롤 위치 · 안 읽은 개수 기준점 */
  private _chatScroll: Record<string, number> = {};
  private _chatSeen: Record<string, number> = {};

  // ── 입력창 ────────────────────────────────────────────────────────────────
  private _chatInput: HTMLTextAreaElement | null = null;
  /** IME 조합 중 여부 — 한글/일본어에서 Enter 가 "확정"인지 "전송"인지 가른다 */
  private _composing = false;
  /** ↑/↓ 로 되돌려 보는 위치. -1 = 지금 쓰는 중(히스토리 밖) */
  private _recallIdx = -1;
  private _recallStash = "";

  /** 내용에 맞춰 입력창 높이 조절 (최대 높이는 style 의 maxHeight 가 잡는다) */
  private autoGrowInput() {
    const ta = this._chatInput;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 148) + "px";
  }

  private draftKey(): string | null {
    const root = this.state.workspace?.root;
    return root ? "schutz.draft:" + root : null;
  }
  /** 입력 중이던 글은 껐다 켜도 남아 있어야 한다 (프로젝트별로 따로) */
  private saveDraft(v: string) {
    const k = this.draftKey();
    if (!k) return;
    clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => {
      try { v.trim() ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ }
    }, 300);
  }
  private _draftTimer: ReturnType<typeof setTimeout> | undefined;
  /** 임시저장 삭제 — 예약된 저장까지 취소한다(안 그러면 방금 보낸 글이 되살아난다) */
  private clearDraft() {
    clearTimeout(this._draftTimer);
    const k = this.draftKey();
    if (k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  }
  private restoreDraft() {
    const k = this.draftKey();
    if (!k) return;
    try {
      const v = localStorage.getItem(k);
      if (v) this.setState({ input: v }, () => this.autoGrowInput());
    } catch { /* ignore */ }
  }

  /** 이전에 보낸 메시지 소환. 더 갈 데가 없으면 null 을 돌려 기본 캐럿 이동을 막지 않는다. */
  private recallSent(dir: -1 | 1): string | null {
    const sent = this.state.messages.filter(m => m.role === "user").map(m => m.text);
    if (!sent.length) return null;
    if (this._recallIdx === -1) {
      if (dir === 1) return null;            // 아래로 갈 곳이 없다
      this._recallStash = this.state.input;  // 쓰던 글은 돌아올 때 복구
      this._recallIdx = sent.length - 1;
      return sent[this._recallIdx];
    }
    const next = this._recallIdx + (dir === -1 ? -1 : 1);
    if (next < 0) return sent[0];            // 가장 오래된 것에서 멈춘다
    if (next >= sent.length) { this._recallIdx = -1; return this._recallStash; }
    this._recallIdx = next;
    return sent[next];
  }

  private switchChatTab(next: string) {
    const cur = this.state.chatTab;
    if (cur === next) return;
    if (this._chat) {
      const el = this._chat;
      // 하단에 붙어 있었으면 픽셀이 아니라 "하단"을 기억한다 — 안 그러면 돌아왔을 때
      // 그 사이 자란 내용만큼 위에 남아 자동 추적이 영영 끊긴다.
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      this._chatScroll[cur] = atBottom ? -1 : el.scrollTop;
    }
    this._markSeen(cur);   // 떠나는 탭도 읽음 처리 — 예전엔 방금 읽은 글이 안읽음으로 남았다
    this._markSeen(next);
    this.setState({ chatTab: next, chatAway: false }, () => {
      if (!this._chat) return;
      const y = this._chatScroll[next];
      this._chat.scrollTop = (y === undefined || y === -1) ? this._chat.scrollHeight : y;
      this._chatSig = null;
    });
  }

  /**
   * "최신으로" — 예전엔 scrollTop 을 끝값으로 대입해 순간이동했다. 스트리밍 중
   * 자동 추적(componentDidUpdate)은 매 토큰마다 붙는 거라 즉시여야 맞지만, 사용자가
   * 직접 누른 이 버튼은 어디로 가는지 보여야 한다.
   *
   * behavior 를 직접 고르는 이유: global.css 의 `scroll-behavior: auto !important` 는
   * CSS 속성만 덮고 ScrollOptions 는 못 막는다 — 모션 최소화 설정이 무시됐을 것이다.
   */
  private jumpChatToLatest() {
    const el = this._chat;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
    this.setState({ chatAway: false });   // 버튼은 도착을 기다리지 않고 바로 걷는다
  }

  /**
   * 활성 탭을 보이는 영역으로 끌어온다. 탭 스트립은 overflowX:auto 인데 이걸 아무도
   * 안 했다 — 파일을 여럿 열면 새 탭이 스트립 바깥에 생겨서, 열었는데 안 보였다.
   *
   * 매 렌더마다 부르면 편집할 때마다 스트립이 튀므로, 슬롯별로 마지막에 끌어온 파일을
   * 기억했다가 실제로 바뀌었을 때만 움직인다.
   */
  private _tabShown: Record<string, string> = {};
  private _activeTabRef = (el: HTMLElement | null) => {
    if (!el) return;
    const slot = el.dataset.slot ?? "";
    const rel = el.dataset.rel ?? "";
    if (this._tabShown[slot] === rel) return;
    this._tabShown[slot] = rel;
    const strip = el.parentElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;   // 안 넘치면 할 일 없다
    // scrollIntoView 를 안 쓴다 — behavior:"smooth" 를 주면 이 컨테이너에선 조용히 무시되고
    // (즉시 모드는 멀쩡히 동작한다) 탭이 화면 밖에 그대로 남는다. 직접 계산해 scrollTo 한다.
    // offsetLeft 도 못 쓴다: 스트립이 position:static 이라 offsetParent 가 위쪽 요소다.
    const er = el.getBoundingClientRect(), sr = strip.getBoundingClientRect();
    const pad = 12;   // 옆 탭이 살짝 걸쳐 보여야 더 있다는 걸 안다
    let d = 0;
    if (er.left < sr.left + pad) d = er.left - sr.left - pad;
    else if (er.right > sr.right - pad) d = er.right - sr.right + pad;
    if (!d) return;
    strip.scrollTo({ left: Math.max(0, strip.scrollLeft + d), behavior: reducedMotion() ? "auto" : "smooth" });
  };

  /** 하단에서 멀어지면 "최신으로" 를 띄운다. 새 메시지 도착과 무관하게 항상 돌아갈 길을 준다. */
  private onChatScroll = () => {
    const el = this._chat;
    if (!el) return;
    const away = el.scrollHeight - el.scrollTop - el.clientHeight >= 60;
    if (away !== this.state.chatAway) this.setState({ chatAway: away });
  };

  private _markSeen(id: string) {
    this._chatSeen[id] = this.state.messages.filter(m => id === "all" || m.agent === id).length;
  }
  /** 모든 탭의 안 읽음 기준점을 현재 메시지 수로 — 복원·프로젝트 전환 직후에 부른다 */
  private seedChatSeen() {
    this._chatSeen = {};
    const ids = new Set<string>(["all", ...this.state.messages.map(m => m.agent).filter((a): a is string => !!a)]);
    for (const id of ids) this._markSeen(id);
  }

  /** 채팅 탭 스트립 — 터미널 탭(renderTerm)과 같은 관용구 */
  renderChatTabs() {
    const s = this.state;
    if (!window.schutz) return null;
    // 메시지가 있는 에이전트 + 현재 연결된 에이전트의 합집합. schutz(시스템 노트)는 탭을 주지 않는다.
    const withMsgs = new Set(s.messages.map(m => m.agent).filter((a): a is string => !!a && a !== "schutz"));
    const ids = [...new Set([...this.configuredAgents(), ...withMsgs])];
    if (ids.length < 2) return null; // 에이전트가 하나뿐이면 탭이 의미 없다

    const tab = (id: string, label: string, color?: string) => {
      const on = s.chatTab === id;
      const total = s.messages.filter(m => id === "all" || m.agent === id).length;
      // 기준점이 없으면 0 이 아니라 total 이 맞다 — 예전엔 한 번도 안 연 탭에 배지가 안 떴다
      const unread = on ? 0 : Math.max(0, total - (this._chatSeen[id] ?? 0));
      return (
        <button key={id} className="hvTermTab" onMouseDown={() => this.switchChatTab(id)}
          style={{ height: 22, padding: "0 9px", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: on ? 600 : 500, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, border: "none", color: on ? "var(--fg)" : "var(--fg-dim)", background: on ? "var(--w06)" : "transparent" }}>
          {color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flex: "none" }} />}
          {label}
          {unread > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 7, padding: "0 5px", lineHeight: "13px", color: "var(--bg-root)", background: "var(--accent)" }}>{unread}</span>
          )}
        </button>
      );
    };

    return (
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 3, padding: "0 12px 6px",
        paddingLeft: this.state.uiMode === "agent" ? "max(24px, calc((100% - 52rem) / 2))" : undefined,
        overflowX: "auto" }}>
        {tab("all", t("chat.tabAll"))}
        <span style={{ flex: "none", width: 1, height: 13, background: "var(--w07)", margin: "0 3px" }} />
        {ids.map(id => tab(id, this.agDef(id).name, this.agDef(id).color))}
      </div>
    );
  }

  /** 실행 승인 모달 — 명령을 그대로 보여주고 승인/거절. 셸 명령은 되돌릴 수 없어 기본은 확인. */
  renderAskRun() {
    const a = this.state.askRun;
    if (!a) return null;
    // 에이전트 모드는 모달을 쓰지 않는다. 같은 answerRun 을 흐름 안 카드와 고정 바가 부른다.
    if (this.state.uiMode === "agent") return null;
    const d = this.agDef(a.agent);
    return (
      <div className="sz-backdrop" onClick={() => this.answerRun(false)}
        style={{ position: "fixed", inset: 0, zIndex: 230, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("run.askTitle"))} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 460, maxWidth: "92%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flex: "none" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t("run.askTitle")}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>{d.name}</span>
          </div>
          {a.rationale && <div style={{ fontSize: 12, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 10 }}>{a.rationale}</div>}
          <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: "var(--fg)", background: "var(--bg-editor)", border: "1px solid var(--w07)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <span style={{ color: "var(--fg-dim)", userSelect: "none" }}>$ </span>{a.command}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim)", marginBottom: 14 }}>{t("run.askHint")}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="hv05" onClick={() => this.answerRun(false)}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("run.reject")}</button>
            <button className="hvAccent" autoFocus onClick={() => this.answerRun(true)}
              style={{ height: 32, padding: "0 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("run.approve")}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 좌 패널: 대화 ──
  /** 트랜스크립트 한 줄기 — 대화·도구·제안·대기 중인 승인을 시간순으로 합친다.
   *
   *  visibleMessages() 를 그대로 재사용한다. 그 함수는 chatTab 이 "all" 이면 조기
   *  반환하는데(에이전트 모드엔 탭이 없으니 늘 그렇다), 그 뒤에 있는 i-1 인접 페어링
   *  휴리스틱은 도구 줄이 섞이면 깨진다. **조기 반환을 "정리" 하지 말 것** — 그게
   *  여기서 유일하게 안전을 보장하는 장치다. */
  private renderAgentRows() {
    const s = this.state;
    const rows = buildTimeline({
      messages: this.visibleMessages(), tools: s.tools, proposals: s.proposals, ask: s.askRun,
    });
    if (!rows.length) {
      return <div style={{ fontSize: 12.5, color: "var(--fg-dim2)", padding: "18px 2px", fontFamily: SUIT }}>{t("mode.transcriptEmpty")}</div>;
    }
    return rows.map(r => {
      if (r.k === "msg") return this.renderAgentMsg(r.v as ChatMsg);
      if (r.k === "tool") return this.renderToolRow(r.v as ToolItem);
      if (r.k === "prop") return this.renderProposalCard(r.v as Proposal, { wide: true });
      return this.renderApprovalCard(r.v as { command: string; rationale: string; agent: string });
    });
  }

  // ── 에이전트 모드 표기법 ──────────────────────────────────────────────────
  // 대화 앱의 문법이다. 좁은 칼럼용 장치(아바타 거터·◆ 마커·작은 글씨)를 그대로 넓히면
  // 사이드바를 늘려놓은 것처럼 보인다 — 여기서는 읽는 화면으로 다시 짠다.
  //
  //  · 사람 말은 부드러운 사각 안에 담고, 에이전트 말은 아무 것에도 담지 않는다.
  //    담긴 쪽과 담기지 않은 쪽의 대비만으로 누가 말하는지 알 수 있어, 이름표가 필요 없다.
  //  · 글자는 비례 폰트 15px, 행간 1.75. 읽으라고 만든 화면이라 코드 폰트를 쓰지 않는다.
  //  · 턴 사이 24px. 빽빽하면 기록이 되고 성기면 대화가 된다.
  private renderAgentMsg(m: ChatMsg) {
    if (m.role === "user") {
      return (
        <div key={m.id} className="sz-in" style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{
            maxWidth: "84%", padding: "12px 16px", borderRadius: 16,
            background: "var(--w05)", border: "1px solid var(--w06)",
            fontFamily: SUIT, fontSize: 14.5, lineHeight: 1.7, color: "var(--fg)",
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          }}>{m.text}</div>
        </div>
      );
    }
    return (
      <div key={m.id} className="sz-in sz-msg" style={{ position: "relative", paddingRight: 26 }}>
        {/* 여러 에이전트가 도는 앱이라 이름은 남긴다 — 다만 아주 조용히, 문단 위에 얹는다 */}
        {m.who && <div style={{ fontSize: 11.5, fontWeight: 600, color: this.chatAgentColor(m.agent), marginBottom: 6 }}>{m.who}</div>}
        <div style={{
          fontFamily: SUIT, fontSize: 15, lineHeight: 1.78, color: "var(--fg-code)",
          whiteSpace: "pre-wrap", overflowWrap: "anywhere",
        }}>
          {m.text}
          {m.streaming && <span style={{ display: "inline-block", width: 2, height: 14, marginLeft: 2, background: "var(--accent)", verticalAlign: -2, animation: "szBlink 1s steps(1) infinite" }} />}
        </div>
        <button className="sz-msg-copy hv05" title={t("chat.copyMsg")}
          onClick={() => { navigator.clipboard.writeText(m.text ?? "").then(() => this.toast("ok", t("chat.copied")), () => { /* 거부 */ }); }}
          style={{ position: "absolute", top: 0, right: 0, height: 21, padding: "0 8px", fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-dim)", background: "var(--bg-card)", border: "1px solid var(--w08)" }}>⧉</button>
      </div>
    );
  }

  /** 도구 호출 한 줄. CLI 의 리듬을 만드는 자리라 모노스페이스다.
   *  기본은 접힘 — 펼치면 실제 출력이 나온다(run_command 만 out 을 남긴다). */
  private renderToolRow(ti: ToolItem) {
    const open = !!this.state.openTools[ti.id];
    const color = this.agDef(ti.agent)?.color ?? "var(--accent)";
    const canOpen = !!ti.out;
    return (
      <div key={ti.id} className="sz-in" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div onClick={canOpen ? () => this.setState(st => ({ openTools: { ...st.openTools, [ti.id]: !st.openTools[ti.id] } })) : undefined}
          style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 20, cursor: canOpen ? "pointer" : "default", fontFamily: MONO, fontSize: 11.5 }}>
          <span style={{ flex: "none", width: 9, fontSize: 8, color: "var(--fg-dim)" }}>{canOpen ? (open ? "▾" : "▸") : ""}</span>
          <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: color, opacity: ti.st === "run" ? 1 : .5 }} />
          <span style={{ flex: "none", color: "var(--fg-sub)" }}>{ti.verb}</span>
          {/* 경로만 코드 폰트다 — 거기만 글자 정렬이 뜻을 가진다. 누르면 시트로 뜬다. */}
          {ti.path && this.state.workspace
            ? <span onClick={e => { e.stopPropagation(); this.openSheet(ti.path); }} title={t("mode.openInSheet")}
                style={{ minWidth: 0, fontFamily: MONO, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg-dim)", cursor: "pointer", textDecorationLine: "underline", textDecorationColor: "var(--w14)", textUnderlineOffset: 3 }}>{ti.path}</span>
            : <span style={{ minWidth: 0, fontFamily: MONO, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg-dim)" }}>{ti.path}</span>}
          <div style={{ flex: 1 }} />
          {ti.st === "run"
            ? <span style={{ flex: "none", width: 9, height: 9, borderRadius: "50%", border: "1.5px solid var(--w14)", borderTopColor: color, animation: "szSpin .8s linear infinite" }} />
            : <span style={{ flex: "none", fontSize: 11, color: "var(--fg-dim2)" }}>{ti.note}</span>}
          {canOpen && <span style={{ flex: "none", fontSize: 8, color: "var(--fg-dim)" }}>{open ? "▾" : "▸"}</span>}
        </div>
        {open && ti.out && (
          <pre style={{ margin: 0, padding: "10px 13px", maxHeight: 320, overflow: "auto", fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: "var(--fg-code)", background: "var(--bg-editor)", border: "1px solid var(--w06)", borderRadius: 8, whiteSpace: "pre" }}>{ti.out}</pre>
        )}
      </div>
    );
  }

  /** 승인 — 흐름 안에 그대로 놓인다. 모달이 아니다. */
  private renderApprovalCard(a: { command: string; rationale: string; agent: string }) {
    const d = this.agDef(a.agent);
    return (
      <div key="askrun" className="sz-in" style={{ background: "var(--bg-card)", border: "1px solid #C4A88240", borderRadius: 10, padding: "11px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flex: "none" }} />
          <span style={{ fontSize: 12, fontWeight: 650, color: "var(--fg)" }}>{t("run.askTitle")}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>{d.name}</span>
        </div>
        {a.rationale && <div style={{ fontSize: 12, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 8, fontFamily: SUIT }}>{a.rationale}</div>}
        <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: "var(--fg)", background: "var(--bg-editor)", border: "1px solid var(--w07)", borderRadius: 8, padding: "9px 11px", maxHeight: 180, overflow: "auto", whiteSpace: "pre", overflowX: "auto" }}>
          <span style={{ color: "var(--fg-dim)", userSelect: "none" }}>$ </span>{a.command}
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
          <div style={{ flex: 1 }} />
          <button className="hv05" onClick={() => this.answerRun(false)}
            style={{ height: 26, padding: "0 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("run.reject")}</button>
          <button className="hvAccent" onClick={() => this.answerRun(true)}
            style={{ height: 26, padding: "0 15px", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("run.approve")}</button>
        </div>
      </div>
    );
  }

  /** 컴포저 바로 위에 **고정**되는 승인 줄.
   *
   *  카드만 있으면 위로 스크롤해 시야에서 사라질 수 있는데, askRunApproval 의 promise 에는
   *  타임아웃도 취소 경로도 없다. 화면 밖으로 나간 카드 하나가 에이전트 루프를 영원히
   *  세운다. 스크롤되는 표면만으로는 이 보장을 만들 수 없어서 바를 따로 둔다. */
  // ── 에이전트 모드 사이드바 ────────────────────────────────────────────────
  // 대화 앱의 왼쪽 열. 새 대화 · 아티팩트 · 사용자 지정 · 최근 항목.
  //
  // 에디터 모드의 레일(42px 아이콘 줄)과는 다른 물건이다. 레일은 **패널을 고르는** 스위치고
  // 이건 **대화를 고르는** 목록이라, 같은 자리에 두 개가 다 있을 이유가 없다 — 모드에 따라
  // 하나만 뜬다.
  /** 가져오기 — 어느 대화를 데려올지 고른다.
   *
   *  이 화면은 **읽기만** 한다. 고르기 전에는 아무것도 안 바뀌고, 고른 뒤에도 원본 파일은
   *  그대로다. 그래서 되돌리기가 필요 없다. */
  private renderImport() {
    const s = this.state;
    if (!s.impOpen) return null;
    const root = (s.workspace?.root ?? "").toLowerCase();
    const rows = s.impRows ?? [];
    // Windows 는 경로 대소문자를 안 가린다. Codex 는 실제로 `c:\Users\…` 를, Claude Code 는
    // `C:\Users\…` 를 적는다 — 그대로 비교하면 같은 폴더가 남남이 된다.
    const mine = root ? rows.filter(r => r.cwd.toLowerCase() === root) : rows;
    const scoped = s.impThisOnly && root ? mine : rows;
    const shown = s.impAgent === "all" ? scoped : scoped.filter(r => r.agent === s.impAgent);

    const close = () => this.closeImport();
    const day = (ms: number) => {
      const d = new Date(ms), n = new Date();
      const sameDay = d.toDateString() === n.toDateString();
      return sameDay
        ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };

    return (
      <div className="sz-backdrop" onClick={close}
        style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("imp.title"))} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 620, maxWidth: "94%", height: 520, maxHeight: "86vh", display: "flex", flexDirection: "column",
            background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 16px 11px", borderBottom: "1px solid var(--w06)" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t("imp.title")}</span>
            <div style={{ flex: 1 }} />
            {root && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--fg-sub2)", cursor: "pointer" }}>
                <input type="checkbox" checked={s.impThisOnly} onChange={e => this.setState({ impThisOnly: e.target.checked })} />
                {t("imp.thisProject")}
                <span style={{ color: "var(--fg-dim2)" }}>({mine.length}/{rows.length})</span>
              </label>
            )}
            <button className="hv07" onClick={close} title={t("imp.close")}
              style={{ border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 3 }}>✕</button>
          </div>

          {/* 어디서 작업한 것인지로 나눈다. 도구마다 대화의 결이 다르다 — 무엇을 찾는지
              이미 알고 온 사람에게는 이 한 줄이 목록 전체를 훑는 것보다 빠르다.
              세는 대상은 **지금 범위 안**이다("이 프로젝트만" 을 켜면 그 안에서 센다) —
              탭 숫자를 더한 값이 아래 목록과 안 맞으면 둘 중 하나가 거짓말이 된다. */}
          {s.impRows !== null && scoped.length > 0 && (
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 3, padding: "8px 12px 2px" }}>
              {([["all", t("chat.tabAll"), ""],
                 ["claude", "Claude Code", "#C67A4A"],
                 ["codex", "Codex", "#6E8FA8"]] as const).map(([id, label, color]) => {
                const n = id === "all" ? scoped.length : scoped.filter(r => r.agent === id).length;
                // 하나도 없는 도구는 탭을 주지 않는다 — 눌러봐야 빈 목록이다.
                if (!n) return null;
                const on = s.impAgent === id;
                return (
                  <button key={id} className="hvTermTab" onClick={() => this.setState({ impAgent: id })}
                    style={{ height: 24, padding: "0 10px", display: "flex", alignItems: "center", gap: 6,
                      fontSize: 11, fontWeight: on ? 600 : 500, fontFamily: "inherit", cursor: "pointer",
                      borderRadius: 7, border: "none", color: on ? "var(--fg)" : "var(--fg-dim)",
                      background: on ? "var(--w06)" : "transparent" }}>
                    {color && <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: color, flex: "none" }} />}
                    {label}
                    <span style={{ fontSize: 9.5, color: "var(--fg-dim2)" }}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 8px" }}>
            {s.impRows === null ? (
              <div style={{ padding: "26px 12px", fontSize: 12, color: "var(--fg-dim2)" }}>{t("imp.scanning")}</div>
            ) : shown.length === 0 ? (
              <div style={{ padding: "26px 12px", fontSize: 12, lineHeight: 1.7, color: "var(--fg-dim2)" }}>
                {rows.length === 0 ? t("imp.none") : scoped.length === 0 ? t("imp.noneHere") : t("imp.noneAgent")}
              </div>
            ) : shown.map(r => {
              const busy = s.impBusy === r.file;
              return (
                <button key={r.file} className="hv05" disabled={!!s.impBusy}
                  onClick={() => void this.importCliChat(r)} title={r.file}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px",
                    borderRadius: 9, border: "none", background: "transparent", cursor: s.impBusy ? "default" : "pointer",
                    textAlign: "left", fontFamily: SUIT, opacity: s.impBusy && !busy ? 0.45 : 1 }}>
                  <span aria-hidden style={{ flex: "none", width: 6, height: 6, borderRadius: "50%",
                    background: r.agent === "claude" ? "#C67A4A" : "#6E8FA8" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </span>
                    {/* 경로는 오른쪽 끝이 중요하다 — 앞은 어차피 다 같은 C:\Users\… 다 */}
                    <span style={{ display: "block", fontFamily: MONO, fontSize: 10, color: "var(--fg-dim2)", marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>
                      {r.cwd || "—"}
                    </span>
                  </span>
                  <span style={{ flex: "none", fontSize: 10, color: "var(--fg-dim2)", textAlign: "right" }}>
                    {busy ? t("imp.reading") : <>{day(r.updatedAt)}<br />{(r.bytes / 1e6).toFixed(1)} MB</>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 미리 말한다. 가져오고 나서만 말하면 이미 늦다. */}
          <div style={{ padding: "10px 16px 13px", borderTop: "1px solid var(--w06)", fontSize: 10.5, lineHeight: 1.6, color: "var(--fg-dim2)" }}>
            {t("imp.capNote", { n: CLI_MSG_CAP })}
          </div>
        </div>
      </div>
    );
  }

  private renderAgentAside() {
    const s = this.state;
    const idx = this.convIndex();
    const groups = groupByDay(idx, Date.now());
    const arts = s.proposals.filter(p => p.status !== "rejected");

    const navBtn = (label: string, icon: string, onClick: () => void, badge?: number) => (
      <button key={label} className="hv05" onClick={onClick}
        style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", height: 30, padding: "0 10px",
          fontFamily: SUIT, fontSize: 12.5, cursor: "pointer", borderRadius: 8, border: "none",
          color: "var(--fg-sub)", background: "transparent", textAlign: "left" }}>
        <span style={{ flex: "none", width: 14, textAlign: "center", fontSize: 12, color: "var(--fg-dim)" }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {badge ? <span style={{ flex: "none", fontSize: 10, color: "var(--fg-dim2)" }}>{badge}</span> : null}
      </button>
    );

    const convRow = (c: ConvMeta) => {
      const on = c.id === s.convId;
      return (
        <button key={c.id} className="hv05" onClick={() => this.openConversation(c.id)}
          title={c.source ? c.title + " — " + t(c.source === "claude" ? "imp.fromClaude" : "imp.fromCodex") : c.title}
          style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", height: 28, padding: "0 10px",
            fontFamily: SUIT, fontSize: 12, cursor: "pointer", borderRadius: 7, border: "none", textAlign: "left",
            color: on ? "var(--fg)" : "var(--fg-sub2)", background: on ? "var(--w06)" : "transparent" }}>
          {/* 가져온 대화라는 표식. 글자를 쓰면 제목 자리를 먹으니 점 하나로 둔다 —
              무슨 뜻인지는 title 속성이 말한다. */}
          {c.source && (
            <span aria-hidden style={{ flex: "none", width: 4, height: 4, borderRadius: "50%",
              background: c.source === "claude" ? "#C67A4A" : "#6E8FA8" }} />
          )}
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
        </button>
      );
    };

    const groupHdr = (label: string) => (
      <div style={{ padding: "12px 10px 4px", fontSize: 10, fontWeight: 700, letterSpacing: 1.1, color: "var(--fg-dim2)" }}>{label}</div>
    );

    return (
      <div data-tour="aside" className="vtAside" style={{
        flex: "none", width: 216, display: ag2(s) ? "flex" : "none", flexDirection: "column",
        borderRight: "1px solid var(--w06)", background: "var(--bg-panel)", padding: "10px 8px 8px",
      }}>
        <button className="hv06" onClick={() => this.startNewConversation()}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 34, padding: "0 11px",
            fontFamily: SUIT, fontSize: 12.5, fontWeight: 600, cursor: "pointer", borderRadius: 9,
            color: "var(--fg)", background: "var(--w05)", border: "1px solid var(--w08)", textAlign: "left" }}>
          <span style={{ flex: "none", fontSize: 14, lineHeight: 1, color: "var(--accent)" }}>＋</span>
          {t("aside.newChat")}
        </button>

        <div style={{ height: 8 }} />
        {navBtn(t("aside.artifacts"), "◫", () => this.setState(st => ({ asideTab: st.asideTab === "artifacts" ? "recents" : "artifacts" })), arts.length || undefined)}
        {navBtn(t("imp.aside"), "⤓", () => this.openImport())}
        {navBtn(t("aside.customize"), "⚙", () => this.openO({ settingsOpen: true }))}

        <div data-tour="recents" style={{ flex: 1, minHeight: 0, overflowY: "auto", marginTop: 4 }}>
          {s.asideTab === "artifacts" ? (
            arts.length === 0
              ? <div style={{ padding: "12px 10px", fontSize: 11.5, lineHeight: 1.6, color: "var(--fg-dim2)" }}>{t("aside.noArtifacts")}</div>
              : arts.map(p => (
                  <button key={p.id} className="hv05" onClick={() => this.openSheet(p.rel)} title={p.rel}
                    style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", height: 28, padding: "0 10px",
                      fontFamily: MONO, fontSize: 11, cursor: "pointer", borderRadius: 7, border: "none", textAlign: "left",
                      color: "var(--fg-sub2)", background: "transparent" }}>
                    <span style={{ flex: "none", width: 5, height: 5, borderRadius: "50%", background: p.status === "pending" ? "var(--accent)" : "var(--fg-dim3)" }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>{p.rel}</span>
                  </button>
                ))
          ) : (
            <>
              {idx.length === 0 && <div style={{ padding: "12px 10px", fontSize: 11.5, lineHeight: 1.6, color: "var(--fg-dim2)" }}>{t("aside.noRecents")}</div>}
              {groups.today.length > 0 && <>{groupHdr(t("aside.today"))}{groups.today.map(convRow)}</>}
              {groups.yesterday.length > 0 && <>{groupHdr(t("aside.yesterday"))}{groups.yesterday.map(convRow)}</>}
              {groups.older.length > 0 && <>{groupHdr(t("aside.older"))}{groups.older.map(convRow)}</>}
            </>
          )}
        </div>
      </div>
    );
  }

  /** 사이드바의 "새 대화" — 슬래시 경로와 달리 전송 가드를 거치지 않는다.
   *  실행 중이면 먼저 세운다. 안 그러면 버튼이 눌리지 않는 것처럼 보인다. */
  private startNewConversation() {
    if (this.state.running) this.stopRun();
    this.newConversation();
  }

  /** 컴포저 안 도구줄 — 첨부·에이전트·보내기. 대화 앱은 이걸 전부 입력 상자 안에 둔다. */
  private renderComposerTools() {
    const s = this.state;
    const canSend = (!!s.input.trim() || s.attach.length > 0) && !s.running;
    const chip: React.CSSProperties = {
      height: 26, padding: "0 11px", fontSize: 11.5, fontFamily: SUIT, cursor: "pointer",
      borderRadius: 13, color: "var(--fg-sub2)", background: "transparent", border: "1px solid var(--w08)",
    };
    const ids = [...new Set([...this.configuredAgents(), ...s.messages.map(m => m.agent).filter((a): a is string => !!a && a !== "schutz")])];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px 10px", background: "var(--bg-root)", borderRadius: "0 0 19px 19px" }}>
        {window.schutz && s.workspace && (
          <>
            <button className="hv05" style={chip} title={t("chat.attachFileTitle")}
              onClick={() => this.setState(st => ({ attachPickerOpen: !st.attachPickerOpen, attachQuery: "" }))}>{t("chat.attachFile")}</button>
            <button className="hv05" style={chip} title={t("chat.attachSelTitle")} onClick={() => this.attachSelection()}>{t("chat.attachSelection")}</button>
          </>
        )}
        {/* 에이전트가 둘 이상일 때만 고를 이유가 생긴다 — 하나뿐이면 선택지가 아니라 잡음이다 */}
        {ids.length >= 2 && ids.map(id => {
          const on = s.chatTab === id;
          return (
            <button key={id} className="hv05" onClick={() => this.switchChatTab(on ? "all" : id)}
              style={{ ...chip, display: "flex", alignItems: "center", gap: 6,
                color: on ? "var(--fg)" : "var(--fg-dim)", background: on ? "var(--w06)" : "transparent" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: this.chatAgentColor(id) }} />
              {this.agDef(id)?.name ?? id}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* 실행 중엔 같은 자리가 중지 버튼이 된다 — 멈추려고 다른 곳을 찾을 이유가 없다 */}
        {s.running ? (
          <button className="hvRed2" onClick={() => this.stopRun()} title={t("chat.stop")}
            style={{ height: 34, width: 34, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", cursor: "pointer", borderRadius: 17, color: "#CE9A9A", background: "rgba(201,123,123,.10)", border: "1px solid rgba(201,123,123,.3)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: "#C98A8A" }} />
          </button>
        ) : (
          <button className="hvAccent" onClick={() => this.send()} disabled={!canSend} title={t("chat.send")}
            style={{ height: 34, width: 34, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: canSend ? "pointer" : "default", borderRadius: 17, color: canSend ? "var(--bg-root)" : "var(--fg-dim)", background: canSend ? "var(--accent)" : "var(--w06)", border: "none", transition: "background var(--dur) var(--ease), color var(--dur) var(--ease)" }}>↑</button>
        )}
      </div>
    );
  }

  private renderApprovalBar() {
    const a = this.state.askRun;
    if (!a) return null;
    return (
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 9, padding: "7px 14px", paddingLeft: "max(24px, calc((100% - 52rem) / 2))", paddingRight: "max(24px, calc((100% - 52rem) / 2))", borderTop: "1px solid #C4A88233", background: "color-mix(in srgb, #C4A882 8%, transparent)" }}>
        <span style={{ fontSize: 11.5, color: "#D8C09A", fontFamily: SUIT }}>{t("mode.approvalWaiting")}</span>
        <span style={{ minWidth: 0, flex: 1, fontFamily: MONO, fontSize: 11, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>$ {a.command}</span>
        <button className="hv05" onClick={() => this.answerRun(false)}
          style={{ flex: "none", height: 22, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("run.reject")}</button>
        <button className="hvAccent" onClick={() => this.answerRun(true)}
          style={{ flex: "none", height: 22, padding: "0 13px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("run.approve")}</button>
      </div>
    );
  }

  /** 대화 한 줄 — 두 모드가 같은 것을 그린다. 에이전트 모드는 폭만 달라진다. */
  private renderChatMsg(m: ChatMsg) {
    return (
          <div key={m.id} className="sz-in sz-msg" style={{ display: "flex", gap: 8, position: "relative" }}>
            <span style={{ flex: "none", width: 11, fontSize: 9, lineHeight: 2, color: m.role === "user" ? "var(--accent)" : "transparent" }}>{m.role === "user" ? "◆" : ""}</span>
            {/* 복사 — 긴 답변을 드래그로 긁어내는 건 사실상 불가능했다. hover 시에만 나타난다 */}
            <button className="sz-msg-copy hv05" title={t("chat.copyMsg")}
              onClick={() => { navigator.clipboard.writeText(m.text ?? "").then(() => this.toast("ok", t("chat.copied")), () => { /* 클립보드 거부 */ }); }}
              style={{ position: "absolute", top: -2, right: 0, height: 19, padding: "0 7px", fontSize: 9.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "var(--bg-card)", border: "1px solid var(--w08)" }}>⧉</button>
            <div style={{ minWidth: 0 }}>
              {/* 에이전트 색으로 라벨 — 전에는 전부 같은 --accent 라 이름 글자만 달랐다.
                  AGDEF.color 는 에이전트 패널·제안 배지·AI 로그가 이미 쓰는 관용구다. */}
              {m.role === "ai" && m.who && <div style={{ fontSize: 10, color: this.chatAgentColor(m.agent), marginBottom: 2 }}>{m.who}</div>}
              <div style={{ fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", color: m.role === "user" ? "#E0E5E0" : "var(--fg-sub2)", fontWeight: m.role === "user" ? 500 : 400, fontFamily: SUIT }}>
                {m.text}
                {m.streaming && <span style={{ display: "inline-block", width: 2, height: 12, marginLeft: 2, background: "var(--accent)", verticalAlign: -1, animation: "szBlink 1s steps(1) infinite" }} />}
              </div>
            </div>
          </div>
    );
  }

  renderChat() {
    const s = this.state;
    const ag = s.uiMode === "agent";
    return (
      <div data-tour="chat" className="vtConversation" style={ag ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : { flex: "none", height: s.chatH, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: ag ? "none" : "flex", flex: "none", height: 34, alignItems: "center", gap: 8, padding: "0 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>
          {t("chat.title")}
          <div style={{ flex: 1 }} />
          {window.schutz && s.cliAgents.claude?.ok && s.workspace && !s.running && (
            <button className="hv05" title={t("chat.continueTitle")}
              onClick={() => this.runCliTurn("claude", t("chat.continuePrompt"), true)}
              style={{ height: 22, padding: "0 9px", fontSize: 10.5, fontWeight: 500, letterSpacing: 0, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--accent)", background: "rgba(143,168,147,.08)", border: "1px solid rgba(143,168,147,.3)" }}>↻ {t("chat.continue")}</button>
          )}
          {s.running && (
            <button className="hvRed2" onClick={() => this.stopRun()}
              style={{ height: 22, padding: "0 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, letterSpacing: 0, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#C98A8A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.3)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 1.5, background: "#C98A8A" }} />{t("chat.stop")}
            </button>
          )}
        </div>
        {!ag && this.renderChatTabs()}
        <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        {s.chatAway && (
          <button className="hv05 sz-in" onClick={() => this.jumpChatToLatest()}
            style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 5, height: 24, padding: "0 12px", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 12, color: "var(--fg-sub)", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", boxShadow: "var(--shadow-pop)" }}>
            ↓ {t("chat.jumpLatest")}
          </button>
        )}
        <div ref={el => { this._chat = el; }} onScroll={this.onChatScroll} style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", scrollbarGutter: "stable",
            padding: ag ? "28px max(24px, calc((100% - 52rem) / 2)) 40px" : "0 16px 14px",
            display: "flex", flexDirection: "column", gap: ag ? 24 : 10 }}>
          {ag ? this.renderAgentRows() : this.visibleMessages().map(m => this.renderChatMsg(m))}
        </div>
        </div>
        {ag && this.renderApprovalBar()}
        {window.schutz && s.workspace && (
          <div style={{ flex: "none", display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", padding: ag ? "0 0 6px" : "8px 12px 2px", paddingLeft: ag ? "max(24px, calc((100% - 52rem) / 2))" : undefined, paddingRight: ag ? "max(24px, calc((100% - 52rem) / 2))" : undefined, position: "relative", borderTop: ag ? "none" : "1px solid var(--w06)" }}>
            {!ag && <>
              <button className="hv05" title={t("chat.attachFileTitle")} onClick={() => this.setState(st => ({ attachPickerOpen: !st.attachPickerOpen, attachQuery: "" }))}
                style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub2)", background: "var(--w04)", border: "1px solid var(--w08)" }}>{t("chat.attachFile")}</button>
              <button className="hv05" title={t("chat.attachSelTitle")} onClick={() => this.attachSelection()}
                style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub2)", background: "var(--w04)", border: "1px solid var(--w08)" }}>{t("chat.attachSelection")}</button>
            </>}
            {s.attach.map((a, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, height: 21, padding: "0 4px 0 8px", fontSize: 10.5, fontFamily: MONO, borderRadius: 6, color: "var(--accent-hi)", background: "var(--accent-soft)", border: "1px solid var(--w08)" }}>
                {a.kind === "selection" ? "✂" : "@"} {a.label}
                <button className="hvDim" onClick={() => this.removeAttach(i)} style={{ width: 15, height: 15, fontSize: 9, fontFamily: "inherit", cursor: "pointer", borderRadius: 4, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
              </span>
            ))}
            {s.attachPickerOpen && (() => {
              const q = s.attachQuery.toLowerCase();
              const files = (s.workspace?.entries ?? []).filter(e => !e.dir && (!q || e.rel.toLowerCase().includes(q))).slice(0, 10);
              return (
                <div className="sz-drop" style={{ position: "absolute", bottom: 28, left: 12, right: 12, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 60, maxHeight: 240, overflowY: "auto" }}>
                  <input autoFocus value={s.attachQuery} onChange={e => this.setState({ attachQuery: e.target.value })}
                    onKeyDown={e => { if (e.key === "Escape") this.setState({ attachPickerOpen: false }); else if (e.key === "Enter" && files[0]) this.addFileAttach(files[0].rel); }}
                    placeholder={t("chat2.fileNamePlaceholder")}
                    style={{ width: "100%", background: "var(--bg-root)", border: "none", borderBottom: "1px solid var(--w08)", height: 32, padding: "0 10px", color: "var(--fg)", fontSize: 12, fontFamily: SUIT, outline: "none", marginBottom: 4 }} />
                  {files.length === 0 && <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--fg-dim)" }}>{t("chat2.noMatchingFiles")}</div>}
                  {files.map(f => (
                    <div key={f.rel} onMouseDown={ev => { ev.preventDefault(); this.addFileAttach(f.rel); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", borderRadius: 6, cursor: "pointer" }} className="hv04">
                      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg)" }}>{f.rel.split("/").pop()}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.rel}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        <div data-tour="composer" style={{ flex: "none", padding: "10px 12px", paddingLeft: ag ? "max(24px, calc((100% - 52rem) / 2))" : undefined, paddingRight: ag ? "max(24px, calc((100% - 52rem) / 2))" : undefined, paddingBottom: ag ? 16 : 10, borderTop: s.attach.length || (window.schutz && s.workspace) ? "none" : "1px solid var(--w06)", display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <div className="szMoving" style={{ flex: 1, padding: 1.5, borderRadius: ag ? 20 : 10, ...(ag ? { display: "flex" as const, flexDirection: "column" as const } : null), background: s.running ? "linear-gradient(90deg,#4D5D53,var(--accent),#A9BCA9,var(--accent),#4D5D53)" : "var(--w10)", backgroundSize: s.running ? "200% 100%" : "auto", animation: s.running ? "szRingFlow 2.2s linear infinite" : "none", transition: "background .4s ease" }}>
            {(() => {
              const models = this.modelPalette();
              const list = models.length ? [] : this.slashList();
              const len = models.length || list.length;
              if (!len) return null;
              const sel = Math.min(s.slashSel, len - 1);
              return (
                <div className="sz-drop" style={{ position: "absolute", bottom: 58, left: 12, right: 12, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 60, maxHeight: 260, overflowY: "auto" }}>
                  {models.length ? models.map((m, i) => (
                    <div key={m.agent + m.modelId}
                      onMouseDown={ev => { ev.preventDefault(); this.applyModelFromPalette(m.agent, m.modelId); }}
                      onMouseEnter={() => this.setState({ slashSel: i })}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 6, cursor: "pointer", background: i === sel ? "var(--accent-soft)" : "transparent" }}>
                      <span style={{ flex: "none", width: 10, color: "var(--accent)", fontSize: 11 }}>{m.current ? "●" : ""}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg)", fontWeight: 600 }}>{m.modelId}</span>
                      <span style={{ fontSize: 11, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{m.label}</span>
                      <span style={{ flex: "none", fontSize: 9.5, color: m.color, border: `1px solid ${m.color}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{m.badge}</span>
                    </div>
                  )) : list.map((c, i) => (
                    <div key={c.origin + c.cmd}
                      onMouseDown={ev => { ev.preventDefault(); this.setState({ input: c.cmd + (c.cmd === "/model" ? " " : "") }, () => { if (c.cmd !== "/model") this.send(); }); }}
                      onMouseEnter={() => this.setState({ slashSel: i })}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 6, cursor: "pointer", background: i === sel ? "var(--accent-soft)" : "transparent" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg)", fontWeight: 600 }}>{c.cmd}</span>
                      <span style={{ fontSize: 11, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t(c.desc)}</span>
                      <span style={{ flex: "none", fontSize: 9.5, color: ORIGIN_COLOR[c.origin], border: `1px solid ${ORIGIN_COLOR[c.origin]}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{ORIGIN_LABEL[c.origin]}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <textarea ref={el => { this._chatInput = el; }} value={s.input} rows={1}
              onChange={e => { const val = e.target.value; this.setState({ input: val, slashSel: 0 }); this.saveDraft(val); this.autoGrowInput(); if (/^\/model/.test(val)) this.ensureModelsFetched(); }}
              onCompositionStart={() => { this._composing = true; }}
              onCompositionEnd={() => { this._composing = false; }}
              onKeyDown={e => {
                // 한글·일본어 조합 중 Enter 는 "글자 확정"이지 전송이 아니다.
                // (isComposing 은 compositionend 직전 keydown 에서도 true — 그래서 자체 플래그도 함께 본다)
                const composing = this._composing || (e.nativeEvent as any).isComposing || (e as any).keyCode === 229;
                const models = this.modelPalette();
                const list = models.length ? [] : this.slashList();
                const len = models.length || list.length;
                if (len && !composing) {
                  const sel = Math.min(s.slashSel, len - 1);
                  if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ slashSel: (sel + 1) % len }); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ slashSel: (sel - 1 + len) % len }); return; }
                  if (models.length) {
                    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); this.applyModelFromPalette(models[sel].agent, models[sel].modelId); return; }
                  } else {
                    if (e.key === "Tab") { e.preventDefault(); this.setState({ input: list[sel].cmd + " " }); return; }
                    if (e.key === "Enter" && s.input !== list[sel].cmd && list[sel].cmd.startsWith(s.input)) {
                      e.preventDefault();
                      this.setState({ input: list[sel].cmd }, () => this.send());
                      return;
                    }
                  }
                }
                // 보낸 메시지 다시 꺼내기 — 캐럿이 첫 줄/끝 줄일 때만 (여러 줄 편집을 방해하지 않게)
                if (!composing && !len && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                  const ta = e.currentTarget;
                  const atTop = ta.selectionStart === ta.selectionEnd && !ta.value.slice(0, ta.selectionStart).includes("\n");
                  const atEnd = ta.selectionStart === ta.selectionEnd && !ta.value.slice(ta.selectionStart).includes("\n");
                  if ((e.key === "ArrowUp" && atTop) || (e.key === "ArrowDown" && atEnd)) {
                    const recalled = this.recallSent(e.key === "ArrowUp" ? -1 : 1);
                    if (recalled !== null) { e.preventDefault(); this.setState({ input: recalled }, () => this.autoGrowInput()); return; }
                  }
                }
                if (e.key === "Enter" && !e.shiftKey && !composing) {
                  e.preventDefault(); // 줄바꿈 대신 전송 (Shift+Enter 는 줄바꿈)
                  this.send();
                }
              }}
              placeholder={t("chat.inputPlaceholder")}
              style={{ width: "100%", background: "var(--bg-root)", border: "none",
                borderRadius: ag ? "19px 19px 0 0" : 8.5,
                minHeight: ag ? 52 : 34, maxHeight: ag ? 240 : 148,
                padding: ag ? "15px 20px" : "8px 13px",
                color: "var(--fg)", fontSize: ag ? 14.5 : 12.5, lineHeight: ag ? 1.6 : 1.5,
                fontFamily: SUIT, outline: "none", display: "block", resize: "none", overflowY: "auto" }} />
            {/* 도구는 상자 **안**에 산다. 밖에 띄워두면 입력창과 별개의 줄로 읽혀 위쪽이
                어수선해진다. 첨부·에이전트 선택·보내기가 한 줄에 모인다. */}
            {ag && this.renderComposerTools()}
          </div>
          {!ag && (() => {
            const canSend = (!!this.state.input.trim() || this.state.attach.length > 0) && !this.state.running;
            return (
              <button className="hvAccent" onClick={() => this.send()} disabled={!canSend} title={this.state.running ? t("chat.sending") : t("chat.send")}
                style={{ height: 37, width: 40, fontSize: 14, fontFamily: "inherit", cursor: canSend ? "pointer" : "default", borderRadius: 9, color: canSend ? "var(--bg-root)" : "var(--fg-dim)", background: canSend ? "var(--accent)" : "var(--w06)", border: "none", fontWeight: 700, transition: "background var(--dur) var(--ease), color var(--dur) var(--ease)" }}>↑</button>
            );
          })()}
        </div>
      </div>
    );
  }

  // ── 에디터 그리드 (슬롯 × 탭) ──
  private _lineColors: Record<string, [string, string]> = {
    typing: ["rgba(125,145,131,.1)", ""],
    fresh: ["rgba(196,168,130,.16)", "#C4A882"],
    pending: ["rgba(125,145,131,.07)", ""],
    removed: ["rgba(201,123,123,.08)", "#C97B7B"],
    accepted: ["color-mix(in srgb, var(--ok) 13%, transparent)", "var(--ok)"],
    base: ["transparent", "transparent"],
  };

  renderPanes() {
    const s = this.state;
    return Array.from({ length: s.layout }, (_, si) => {
      const tabsHere = s.tabs[si] ?? [];
      const activeRel = s.active[si] ?? "";
      if (tabsHere.length === 0 || !activeRel) {
        return (
          <div key={"empty" + si} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--bg-editor)" }}
            onMouseDown={() => { this._focusSlot = si; }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-dim3)" }}>
              {window.schutz && !s.workspace ? (
                <>
                  <Logo size={40} opacity={.3} />
                  <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>{t("misc.openProjectToStart")}</span>
                  <button className="hvAccent" onClick={() => void this.openProject()}
                    style={{ marginTop: 4, height: 30, padding: "0 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>{t("misc.openFolder")}</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 20 }}>▢</span>
                  <span style={{ fontSize: 11 }}>{t("misc.emptyEditorHint")}</span>
                </>
              )}
            </div>
          </div>
        );
      }
      const diffMeta = this.parseDiffKey(activeRel);
      const realFile = !!(s.workspace && !s.docs[activeRel] && !diffMeta);
      const isImg = realFile && isImage(activeRel);
      const isMdPrev = realFile && activeRel.endsWith(".md") && !!s.mdPreview[activeRel];
      const isReal = realFile && !isImg && !isMdPrev;
      return (
        <div key={"slot" + si} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--bg-editor)" }}
          onMouseDown={() => { this._focusSlot = si; }}>
          {this.renderTabStrip(si, tabsHere, activeRel)}
          {this.parsePreviewKey(activeRel) ? (
            <PreviewPane key={activeRel} url={this.parsePreviewKey(activeRel)!} />
          ) : diffMeta && s.workspace ? (
            <DiffPane
              key={activeRel + ":" + (s.paneVer[diffMeta.path] ?? 0)}
              root={s.workspace.root}
              rel={diffMeta.path}
              staged={diffMeta.staged}
              untracked={diffMeta.untracked}
            />
          ) : isImg ? (
            <ImagePane key={activeRel + ":" + (s.paneVer[activeRel] ?? 0)} root={s.workspace!.root} rel={activeRel} />
          ) : isMdPrev ? (
            <MarkdownPane key={activeRel + ":md:" + (s.paneVer[activeRel] ?? 0)} root={s.workspace!.root} rel={activeRel} />
          ) : isReal ? (
            <MonacoPane
              key={activeRel + ":" + (s.paneVer[activeRel] ?? 0)}
              root={s.workspace!.root}
              rel={activeRel}
              onDirtyChange={this.handleDirtyChange}
              onStatus={this.handleStatus}
              onInlineEdit={this.handleInlineEdit}
              breakpoints={s.breakpoints[activeRel]}
              stoppedLine={s.debug?.stoppedRel === activeRel ? s.debug.stoppedLine : null}
              onToggleBreakpoint={this.toggleBreakpoint}
            />
          ) : this.renderDemoBody(activeRel)}
        </div>
      );
    });
  }

  /** 슬롯 탭 바 */
  renderTabStrip(si: number, tabsHere: string[], activeRel: string) {
    const s = this.state;
    const lock = AGDEF.find(d => s.agents[d.id].file === activeRel);
    return (
      <div style={{ flex: "none", height: 34, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--w05)", background: "var(--bg-panel)" }}>
        <div className="sz-tabstrip"
          onWheel={e => { const el = e.currentTarget; if (e.deltaY && el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY; }}
          style={{ flex: 1, display: "flex", alignItems: "stretch", overflowX: "auto", minWidth: 0 }}>
          {tabsHere.map(rel => {
            const on = rel === activeRel;
            const closingTab = s.closingTabs.includes(si + ":" + rel);
            const dm = this.parseDiffKey(rel);
            const pv = this.parsePreviewKey(rel);
            const dirty = !dm && !pv && this.isDirtyRel(rel);
            // 프리뷰 rel 은 URL 이라 "/" 로 잘라 쓰면 이름이 빈 문자열이 된다 — host:port 로 라벨을 만든다
            const name = dm ? (dm.path.split("/").pop() + " ⇆")
              : pv ? this.previewLabel(pv)
              : rel.split("/").pop();
            return (
              <div key={rel} className={"hv04 " + (closingTab ? "sz-tab-out" : "sz-tab-in")} title={dm ? dm.path + " (diff)" : pv ? pv : rel}
                ref={on ? this._activeTabRef : undefined} data-slot={si} data-rel={rel}
                draggable={!closingTab}
                onDragStart={() => { this._dragTab = { slot: si, rel }; }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); this.reorderTab(si, rel); }}
                onMouseDown={e => { e.stopPropagation(); if (closingTab) return; this._focusSlot = si; this.selectTab(si, rel); }}
                // flex:none 이 핵심 — 예전엔 기본값(0 1 auto)이라 탭이 줄어들었다. 아이콘·닫기
                // 버튼·패딩이 61px 를 먹으니, 11개만 열어도 이름 칸이 13px 로 눌려 파일명이
                // 사실상 안 보였다. 이제 탭은 내용 크기(최대 200px)를 지키고 스트립이 스크롤된다.
                style={{ display: "flex", flex: "none", alignItems: "center", gap: 6, padding: "0 8px 0 11px", cursor: "pointer", minWidth: 0, maxWidth: 200, borderRight: "1px solid var(--w04)", background: on ? "var(--bg-editor)" : "transparent", transition: "background var(--dur) var(--ease)" }}>
                {dm ? <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: on ? "var(--accent)" : "var(--fg-dim3)" }} />
                  : pv ? <span style={{ flex: "none", fontSize: 11, lineHeight: 1, color: on ? "var(--ok)" : "var(--fg-dim2)" }}>◉</span>
                  : <FileIcon rel={rel} size={13} />}
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: on ? "var(--fg)" : "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                {dirty && <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: "#CCB491" }} />}
                <button className="hvDim" title={t("sc4.closeTab")}
                  onMouseDown={e => { e.stopPropagation(); this.closeTab(si, rel); }}
                  style={{ flex: "none", width: 17, height: 17, fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 4, color: "var(--fg-dim)", background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            );
          })}
        </div>
        {activeRel.endsWith(".md") && !this.parseDiffKey(activeRel) && !this.parsePreviewKey(activeRel) && s.workspace && (
          <button className="hv05" title={t("editor.previewTitle")}
            onClick={() => this.setState(st => ({ mdPreview: { ...st.mdPreview, [activeRel]: !st.mdPreview[activeRel] } }))}
            style={{ flex: "none", alignSelf: "center", height: 20, marginRight: 8, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: s.mdPreview[activeRel] ? "var(--on-accent)" : "var(--fg-sub)", background: s.mdPreview[activeRel] ? "var(--accent)" : "var(--w05)", border: "none" }}>
            {s.mdPreview[activeRel] ? t("editor.code") : t("editor.preview")}
          </button>
        )}
        {lock && (
          <span style={{ flex: "none", alignSelf: "center", display: "flex", alignItems: "center", gap: 5, marginRight: 10, fontSize: 10, color: lock.color, border: `1px solid ${lock.color}50`, borderRadius: 4, padding: "0 6px", lineHeight: "16px" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: lock.color, animation: "szPulse 1.1s ease-in-out infinite" }} />{t("sc4.agentWorking", { name: lock.name })}
          </span>
        )}
      </div>
    );
  }

  /** 데모(웹 프리뷰)·에이전트 diff 문서 본문 렌더 */
  renderDemoBody(path: string) {
    const s = this.state;
    const lineColors = this._lineColors;
    const doc = s.docs[path] || [];
    const isMd = path.endsWith(".md");
    const agColor = this.agentColorFor(path) || "#7D9183";
    const hunkInfo: Record<string, { active: boolean; open: boolean }> = {};
    doc.forEach(l => {
      if (!l.hunk) return;
      const h = hunkInfo[l.hunk] || (hunkInfo[l.hunk] = { active: false, open: false });
      if (l.kind === "typing" || l.kind === "fresh") h.active = true;
      if (l.kind === "pending" || l.kind === "removed") h.open = true;
    });
    const headSeen: Record<string, boolean> = {};
    let num = 0;
    return (
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div ref={el => { this._paneRefs[path] = el; }} style={{ position: "absolute", inset: 0, overflow: "auto", padding: "10px 0 50px", fontFamily: MONO }}>
          {doc.map(l => {
            const removed = l.kind === "removed";
            if (!removed) num++;
            const colorDef = lineColors[l.kind] || lineColors.base;
            const rowBg = colorDef[0];
            const barColor = (l.kind === "typing" || l.kind === "pending") ? agColor : colorDef[1];
            const marked = ["pending", "removed", "fresh", "typing"].includes(l.kind);
            const isHead = l.hunk && marked && !headSeen[l.hunk];
            if (isHead) headSeen[l.hunk!] = true;
            const chip = isHead && s.chips[l.hunk!] ? s.chips[l.hunk!] : null;
            const info = l.hunk ? hunkInfo[l.hunk] : null;
            const actions = !!(isHead && info && info.open && !info.active);
            const hk = l.hunk!;
            return (
              <div key={l.id} style={{ position: "relative", display: "flex", alignItems: "flex-start", minHeight: 20, background: rowBg, transition: "background .7s ease", animation: l.kind === "fresh" ? "szFlash .7s var(--ease)" : undefined }}>
                <div style={{ flex: "none", width: 46, textAlign: "right", paddingRight: 10, fontSize: 10.5, lineHeight: "20px", color: l.kind === "base" ? "var(--fg-dim3)" : "var(--fg-sub2)", userSelect: "none" }}>{removed ? "" : String(num)}</div>
                <div style={{ flex: "none", width: 2.5, borderRadius: 2, alignSelf: "stretch", margin: "1px 0", background: barColor }} />
                <div style={{ paddingLeft: 14, whiteSpace: "pre", lineHeight: "20px", fontSize: 12, color: "var(--fg-code)", textDecoration: removed ? "line-through" : "none", opacity: removed ? 0.5 : 1 }}>
                  {this.hl(l.text, isMd)}
                  {l.kind === "typing" && <span style={{ display: "inline-block", width: 2, height: 13, marginLeft: 1, background: agColor, verticalAlign: -2, animation: "szBlink 1s steps(1) infinite" }} />}
                  {chip && (
                    <span style={{ marginLeft: 14, fontFamily: SUIT, fontSize: 10, color: "#93A896", background: "rgba(125,145,131,.12)", borderRadius: 3, padding: "1px 6px", opacity: chip.op, transition: "opacity .9s ease", whiteSpace: "nowrap", verticalAlign: 1 }}>{chip.text}</span>
                  )}
                </div>
                {actions && (
                  <div style={{ position: "absolute", right: 14, top: -26, display: "flex", alignItems: "center", gap: 2, zIndex: 8, fontFamily: SUIT, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 8, padding: "2px 3px", boxShadow: "var(--shadow-soft)" }}>
                    <button className="hvGreen" onClick={() => this.resolveHunk(path, hk, true)} style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--ok-hi)", background: "transparent", border: "none" }}>{t("sc4.accept")}</button>
                    <div style={{ width: 1, height: 12, background: "var(--w10)" }} />
                    <button className="hvRed" onClick={() => this.resolveHunk(path, hk, false)} style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#CE9A9A", background: "transparent", border: "none" }}>{t("sc4.reject")}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 우 패널: 에이전트 ──
  renderAgents() {
    const s = this.state;
    const astMap: Record<string, [string, string]> = { idle: [t("agent.statusIdle"), "var(--fg-dim)"], plan: [t("agent.statusPlan"), "#A3B5A6"], edit: [t("agent.statusEdit"), "#A3B5A6"], review: [t("agent.statusReview"), "#C4A882"], stop: [t("agent.statusStop"), "#C98A8A"] };
    return (
      <div style={{ flex: "none", borderBottom: "1px solid var(--w06)" }}>
        <div className="hvHead" onClick={() => this.setState(st => ({ agentsOpen: !st.agentsOpen }))}
          style={{ height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 8.5, width: 10, display: "inline-block", transform: s.agentsOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform var(--dur) var(--ease)" }}>▸</span>{t("agent.title")}
          <span style={{ fontSize: 10.5, fontWeight: 400, letterSpacing: 0, color: "var(--fg-dim2)" }}>{s.agentsOpen ? t("agent.subtitle") : ""}</span>
        </div>
        {s.agentsOpen && (
          <div className="sz-in" style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {window.schutz && AGDEF.every(d => this.modelOf(d.id) === null) && (
              <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "2px 2px 4px", lineHeight: 1.6 }}>
                {t("agent.noneConnected")}
              </div>
            )}
            {AGDEF.filter(d => !window.schutz || this.modelOf(d.id) !== null).map(d => {
              const a = s.agents[d.id];
              const [stText, stColor] = astMap[a.status];
              return (
                <div key={d.id} style={{ background: "var(--bg-card)", border: "1px solid var(--w06)", borderRadius: 10, padding: "9px 12px", borderLeft: `3px solid ${d.color}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{d.name}</span>
                    {(() => { const m = this.modelOf(d.id); return m
                      ? <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-sub2)", background: "var(--w05)", borderRadius: 3, padding: "0 5px", lineHeight: "15px" }}>{m}</span>
                      : <span style={{ fontSize: 9.5, color: "var(--fg-dim2)", border: "1px solid var(--w08)", borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{t("agent.notConnected")}</span>; })()}
                    {(() => {
                      const isMgr = getManagerId() === d.id;
                      const connected = this.modelOf(d.id) !== null;
                      if (isMgr) return <span style={{ fontSize: 9.5, color: "var(--bg-root)", background: d.color, borderRadius: 3, padding: "0 5px", lineHeight: "15px", fontWeight: 700 }}>{t("agent.manager")}</span>;
                      if (connected) return (
                        <button className="hv07" title={t("agent.setManagerTitle")} onClick={() => { setManagerId(d.id); this.forceUpdate(); }}
                          style={{ fontSize: 9.5, color: "var(--fg-dim)", background: "transparent", border: "1px solid var(--w10)", borderRadius: 3, padding: "0 5px", lineHeight: "14px", cursor: "pointer", fontFamily: "inherit" }}>{t("agent.setManager")}</button>
                      );
                      return null;
                    })()}
                    <div style={{ flex: 1 }} />
                    {(a.status === "edit" || a.status === "plan") && <span style={{ ...spinner(d.color, d.color + "40"), flex: "none" }} />}
                    <span key={a.status} style={{ fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: stColor, background: stColor + "1F", borderRadius: 5, padding: "1.5px 8px", animation: "szScaleIn .3s var(--ease-emph) both" }}>{stText}</span>
                    {(a.status === "edit" || a.status === "plan") && (
                      <button className="hvRed2" title={t("agent.stopAgentTitle")} onClick={() => this.stopAgent(d.id)}
                        style={{ flex: "none", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", cursor: "pointer", borderRadius: 4, color: "#C98A8A", background: "transparent", border: "none" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 1.5, background: "#C98A8A" }} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: a.file ? d.color : "var(--fg-dim3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file ?? "—"}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)", whiteSpace: "nowrap" }}>↓{a.tin.toLocaleString()} ↑{a.tout.toLocaleString()}</span>
                  </div>
                  {/* 구독 잔여 할당량 — 금액 대신. 가장 빠듯한 창을 막대로, 창별 남은 비율을 글자로. */}
                  {(() => {
                    const q = this.state.quota[d.id];
                    const left = this.quotaTightest(d.id);
                    if (!q || left === null) return null;
                    const col = left <= 10 ? "#CE9A9A" : left <= 25 ? "#C4A882" : d.color;
                    return (
                      <div title={t("status.quotaTitle")} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--w06)", overflow: "hidden" }}>
                          <div style={{ width: (100 - left) + "%", height: "100%", background: col, transition: "width var(--dur-med) var(--ease)" }} />
                        </div>
                        <span style={{ flex: "none", fontFamily: MONO, fontSize: 9.5, color: "var(--fg-dim2)", whiteSpace: "nowrap" }}>{this.quotaText(d.id)}</span>
                        <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: col, whiteSpace: "nowrap" }}>{left}%</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── 우 패널: 변경 검토 (워크스페이스 모드 — Claude 편집 제안) ──
  /** 제안 카드 한 장 — 우측 검토 패널과, 곧 들어올 에이전트 모드 트랜스크립트가 함께 쓴다.
   *  두 곳에서 같은 카드를 그려야 하므로 map 콜백 안에 있던 것을 그대로 들어냈다.
   *  wide: 창 폭을 다 쓰는 자리용 — break-all 은 진짜 코드를 글자 단위로 찢는다. */
  renderProposalCard(p: Proposal, opts?: { wide?: boolean }) {
    const pstMap: Record<string, [string, string]> = {
      pending: [t("misc.statusPending"), "#C4A882"], accepted: [t("misc.statusAccepted"), "var(--ok)"],
      rejected: [t("misc.statusRejected"), "#C97B7B"], failed: [t("misc.statusFailed"), "#C97B7B"],
    };
        const [sl, sc] = pstMap[p.status];
        return (
          <div key={p.id} className="sz-pop" style={{ position: "relative", background: opts?.wide ? "transparent" : "var(--bg-card)", border: "1px solid var(--w07)", borderRadius: opts?.wide ? 12 : 10, overflow: "hidden" }}>
            {/* 반영이 **착지**하는 순간의 물결. 수락으로 바뀔 때 한 번 지나가고 사라진다 —
                key 를 status 로 줘서 pending→accepted 로 넘어가는 그 순간에만 마운트되어 돈다.
                pointerEvents none 이라 카드 조작을 막지 않는다. */}
            {p.status === "accepted" && (
              <span key={"land" + p.status} aria-hidden style={{
                position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", borderRadius: "inherit",
                background: "color-mix(in srgb, var(--ok) 22%, transparent)",
                animation: "szLand .6s var(--ease) both",
              }} />
            )}
            {/* 좌측 스파인은 **좁은 검토 패널**에서 눈에 띄라고 만든 장치다. 읽는 화면에
                그대로 얹으면 카드 하나가 문단보다 시끄럽다 — 넓은 자리에선 뺀다. */}
            {!opts?.wide && (
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: p.status === "accepted" ? "var(--ok)" : p.status === "rejected" || p.status === "failed" ? "#C97B7B" : "var(--accent)", zIndex: 2, animation: p.status === "pending" ? "szGlow 2s ease-in-out infinite" : "none", transition: "background var(--dur) var(--ease)" }} />
            )}
            <div style={{ padding: opts?.wide ? "11px 14px 10px" : "10px 13px 9px 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span style={{ fontFamily: MONO, fontSize: opts?.wide ? 12.5 : 12, color: "var(--fg)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.rel}</span>
                <span style={{ flex: "none", fontSize: 9.5, color: this.agDef(p.agent)?.color ?? "var(--accent)", border: `1px solid ${(this.agDef(p.agent)?.color ?? "var(--accent)") + "50"}`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{this.agDef(p.agent)?.name ?? p.agent}</span>
                <div style={{ flex: 1 }} />
                {p.auto && <span style={{ flex: "none", fontSize: 9.5, color: "var(--accent)", background: "var(--accent-soft)", borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{t("misc.auto")}</span>}
                {opts?.wide
                  ? <span key={p.status} style={{ fontSize: 11, whiteSpace: "nowrap", color: p.status === "pending" ? "var(--fg-dim)" : sc }}>{sl}</span>
                  : <span key={p.status} style={{ fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: sc, background: sc + "1F", borderRadius: 5, padding: "1.5px 8px", animation: "szScaleIn .3s var(--ease-emph) both" }}>{sl}</span>}
              </div>
              <div style={{ fontSize: opts?.wide ? 12.5 : 11, lineHeight: opts?.wide ? 1.65 : 1.4, color: "var(--fg-sub2)", marginTop: opts?.wide ? 6 : 4, fontFamily: SUIT }}>{p.auto ? t("misc.autoAcceptedPrefix") + p.rationale : p.rationale}</div>
              {p.error && <div style={{ fontSize: 10.5, color: "#CE9A9A", marginTop: 4 }}>⚠️ {p.error}</div>}
            </div>
            {/* diff 는 접었다 펼친다. 예전엔 maxHeight 180 + 중첩 스크롤이라 아래 코드가 안 보이는데
                스크롤 대신 드래그 선택이 됐고, 수락/거절 버튼까지 그 잘린 영역 안에 있어 손이 안 닿았다. */}
            {(() => {
              const rows = [
                ...(p.find ? p.find.split("\n").map(l => ({ k: "-" as const, l })) : []),
                ...p.replace.split("\n").map(l => ({ k: "+" as const, l })),
              ];
              const LIMIT = 14, PEEK = 8;
              const long = rows.length > LIMIT;
              const open = !!this.state.openDiffs[p.id];
              const shown = long && !open ? rows.slice(0, PEEK) : rows;
              return (
                <div style={{ borderTop: "1px solid var(--w06)", background: "var(--bg-editor)", fontFamily: MONO, fontSize: 10.5, lineHeight: "18px" }}>
                  {shown.map((r, i) => (
                    <div key={r.k + i} className={p.status === "pending" && r.k === "+" ? "sz-in" : undefined}
                      style={{ display: "flex", background: r.k === "-" ? "rgba(201,123,123,.1)" : "color-mix(in srgb, var(--ok) 9%, transparent)", animationDelay: Math.min(i, 14) * 22 + "ms" }}>
                      <span style={{ flex: "none", width: 16, textAlign: "center", color: r.k === "-" ? "#C97B7B" : "var(--ok)", userSelect: "none" }}>{r.k === "-" ? "−" : "+"}</span>
                      <span style={{ ...(opts?.wide ? { whiteSpace: "pre" as const, overflowX: "auto" as const } : { whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const }), color: r.k === "-" ? "#C99A9A" : "#B7CBBA" }}>{r.l || " "}</span>
                    </div>
                  ))}
                  {long && (
                    <button className="hv05" onClick={() => this.setState(st => ({ openDiffs: { ...st.openDiffs, [p.id]: !st.openDiffs[p.id] } }))}
                      style={{ width: "100%", height: 26, fontSize: 10.5, fontFamily: SUIT, cursor: "pointer", border: "none", borderTop: "1px solid var(--w05)", color: "var(--fg-dim)", background: "transparent" }}>
                      {open ? t("misc.diffCollapse") : t("misc.diffExpand", { n: rows.length - PEEK })}
                    </button>
                  )}
                </div>
              );
            })()}
            {/* 버튼은 diff 밖 — 코드가 아무리 길어도 항상 닿는다 */}
            {p.status === "pending" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderTop: "1px solid var(--w06)", fontFamily: SUIT }}>
                <div style={{ flex: 1 }} />
                {opts?.wide && (
                  <button className="hv05" onClick={() => this.openSheet(p.rel)}
                    style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("mode.openInSheet")}</button>
                )}
                <button className="hvGreen2" onClick={() => void this.acceptProposal(p.id)} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--ok-hi)", background: "color-mix(in srgb, var(--ok) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ok) 30%, transparent)" }}>{t("misc.accept")}</button>
                <button className="hvRed2" onClick={() => this.rejectProposal(p.id)} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#CE9A9A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>{t("misc.reject")}</button>
              </div>
            )}
          </div>
        );
  }

  renderProposals() {
    const s = this.state;
    const pending = s.proposals.filter(p => p.status === "pending").length;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>{t("agent.review")}</span>
          {s.proposals.length > 0 && <span style={{ fontSize: 10.5, color: "var(--fg-sub2)", background: "var(--w06)", borderRadius: 8, padding: "0 7px", lineHeight: "16px" }}>{s.proposals.length}</span>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {s.proposals.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-dim2)", padding: "6px 2px" }}>{t("agent.reviewEmpty")}</div>}
          {pending > 1 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hvAccent" onClick={() => s.proposals.filter(p => p.status === "pending").forEach(p => void this.acceptProposal(p.id))} style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>{t("misc.acceptAll")}</button>
              <button className="hv05" onClick={() => s.proposals.forEach(p => this.rejectProposal(p.id))} style={{ flex: 1, height: 30, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("misc.rejectAll")}</button>
            </div>
          )}
          {s.proposals.map(p => this.renderProposalCard(p))}
        </div>
      </div>
    );
  }

  // ── 우 패널: 변경 검토 ──
  renderReview() {
    const s = this.state;
    if (s.workspace || window.schutz) return this.renderProposals();
    const fstMap: Record<string, [string, string]> = { pending: [t("sc5.reviewPending"), "#C4A882"], accepted: [t("sc5.reviewAccepted"), "var(--ok)"], rejected: [t("sc5.reviewRejected"), "#C97B7B"] };
    const pendingFiles = s.files.filter(f => f.status === "pending").length;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div onClick={() => this.setState(st => ({ reviewOpen: !st.reviewOpen }))}
          style={{ flex: "none", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 8.5, width: 10, color: "var(--fg-dim)" }}>{s.reviewOpen ? "▾" : "▸"}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>{t("agent.review")}</span>
          {s.files.length > 0 && <span style={{ fontSize: 10.5, color: "var(--fg-sub2)", background: "var(--w06)", borderRadius: 8, padding: "0 7px", lineHeight: "16px" }}>{s.files.length}</span>}
        </div>
        {s.reviewOpen && (
          <div style={{ flex: 1, overflowY: "auto", padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {s.files.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-dim2)", padding: "6px 2px" }}>{t("sc5.reviewEmpty")}</div>}
            {pendingFiles > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="hvAccent" onClick={() => this.resolveAll(true)} style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>{t("sc5.acceptAll")}</button>
                <button className="hv05" onClick={() => this.resolveAll(false)} style={{ flex: 1, height: 30, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("sc5.rejectAll")}</button>
              </div>
            )}
            {s.files.map(f => {
              const [sl, sc] = fstMap[f.status];
              const d = this.agDef(f.agent);
              const seg = f.path.split("/"); const name = seg.pop();
              const tot = Math.max(f.add + f.del, 1);
              const expanded = s.expanded === f.path;
              return (
                <div key={f.path} style={{ position: "relative", background: "var(--bg-card)", border: `1px solid ${expanded ? d.color + "60" : "var(--w07)"}`, borderRadius: 10, overflow: "hidden" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: d.color, zIndex: 2 }} />
                  <div className="hv02" onClick={() => this.setState(st => ({ expanded: st.expanded === f.path ? null : f.path }))} style={{ padding: "11px 13px 11px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontSize: 9, color: "var(--fg-dim)" }}>{expanded ? "▾" : "▸"}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12.5, color: "var(--fg)", whiteSpace: "nowrap" }}>{name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seg.join("/") + "/"}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ flex: "none", fontSize: 9.5, color: d.color, border: `1px solid ${d.color}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{d.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--ok)" }}>+{f.add}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#C97B7B" }}>−{f.del}</span>
                      <div style={{ flex: 1, display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden" }}>
                        <span style={{ height: "100%", background: "var(--ok)", opacity: .75, width: Math.round((f.add / tot) * 60) + "%" }} />
                        <span style={{ height: "100%", background: "#C97B7B", opacity: .75, width: Math.round((f.del / tot) * 60) + "%" }} />
                        <span style={{ height: "100%", background: "var(--w07)", flex: 1 }} />
                      </div>
                      <span style={{ fontSize: 10.5, whiteSpace: "nowrap", color: sc }}>{sl}</span>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ borderTop: "1px solid var(--w06)", background: "var(--bg-editor)", maxHeight: 300, overflow: "auto" }}>
                      {this.diffRows(f.path).map(dd => dd.sep
                        ? <div key={dd.key} style={{ fontFamily: MONO, fontSize: 10, lineHeight: "18px", color: "var(--fg-dim2)", background: "#12151340", textAlign: "center", borderTop: "1px solid var(--w04)", borderBottom: "1px solid var(--w04)" }}>· · ·</div>
                        : (
                          <div key={dd.key} style={{ display: "flex", fontFamily: MONO, fontSize: 10.5, lineHeight: "19px", background: dd.bg }}>
                            <span style={{ flex: "none", width: 30, textAlign: "right", paddingRight: 5, color: "#49524B", userSelect: "none" }}>{dd.oldN}</span>
                            <span style={{ flex: "none", width: 30, textAlign: "right", paddingRight: 5, color: "#49524B", userSelect: "none" }}>{dd.newN}</span>
                            <span style={{ flex: "none", width: 14, textAlign: "center", color: dd.signColor, userSelect: "none" }}>{dd.sign}</span>
                            <span style={{ whiteSpace: "pre", color: dd.color }}>{dd.text}</span>
                          </div>
                        ))}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderTop: "1px solid var(--w05)" }}>
                        <button className="hv05" onClick={e => { e.stopPropagation(); this.openFile(f.path); }} style={{ height: 23, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w12)" }}>{t("sc5.openInEditor")}</button>
                        <div style={{ flex: 1 }} />
                        {f.status === "pending" && (
                          <>
                            <button className="hvGreen2" onClick={e => { e.stopPropagation(); this.resolveFile(f.path, true); }} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--ok-hi)", background: "color-mix(in srgb, var(--ok) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ok) 30%, transparent)" }}>{t("sc5.accept")}</button>
                            <button className="hvRed2" onClick={e => { e.stopPropagation(); this.resolveFile(f.path, false); }} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#CE9A9A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>{t("sc5.reject")}</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── 터미널 독 (xterm 멀티 탭 + AI 로그) ──
  renderTerm() {
    const s = this.state;
    // 처음 여는 순간엔 도크가 아예 없다가 210 으로 생겨서 애니메이션할 여지가 없었다.
    // 첫 렌더는 높이 0 으로 두고, 다음 프레임에 펼쳐 다른 토글과 똑같이 움직이게 한다.
    const firstMount = !this._termMounted;
    this._termMounted = true; // 최초 렌더 시 래치 → 이후 접어도 언마운트되지 않게(셸 유지)
    if (firstMount) requestAnimationFrame(() => this.setState({ termReady: true }));
    const DIM = "var(--fg-dim)", TXT = "var(--fg-code)", SUB = "var(--fg-sub)", AC = "var(--accent)";
    const termCloseTitle = t("term.close"), toolDoneLabel = t("term.toolDone"); // 아래 map(t => …) 섀도잉 회피
    const onAi = s.termTab === "ai";
    const onProblems = s.termTab === "problems";
    const errs = s.problems.filter(p => p.severity >= 8).length;
    const warns = s.problems.length - errs;
    return (
      <div data-tour="terminal" style={{
        // minHeight:0 이 없으면 flex 아이템의 min-height:auto 가 내용 높이를 바닥으로 잡아
        // height:0 을 줘도 210 그대로 남는다(접히지 않는다)
        flex: "none", height: s.termOpen && s.termReady ? 210 : 0, minHeight: 0, overflow: "hidden",
        display: "flex", flexDirection: "column", background: "var(--bg-dock)",
        borderTop: s.termOpen ? "1px solid var(--w07)" : "1px solid transparent",
        // --ease-emph 는 오버슈트(1.4)가 있어 패널이 210 을 넘어 220 까지 튀었다가 돌아온다.
        // 도크에는 오버슈트 없는 --ease 가 맞다(그 토큰은 AI 강조용).
        transition: "height var(--dur-med) var(--ease), border-color var(--dur-med) var(--ease)",
      }}>
        <div style={{ flex: "none", height: 32, display: "flex", alignItems: "center", gap: 2, padding: "0 8px 0 10px", borderBottom: "1px solid var(--w05)" }}>
          {s.terms.map(t => {
            const on = s.termTab === t.id;
            return (
              <div key={t.id} className="hvTermTab" onMouseDown={() => this.setState({ termTab: t.id, termOpen: true })}
                style={{ height: 24, padding: "0 6px 0 11px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, color: on ? "var(--fg)" : "var(--fg-dim)", background: on ? "var(--w06)" : "transparent", transition: "background var(--dur) var(--ease), color var(--dur-fast) var(--ease)" }}>
                {t2("sc1.terminal_prefix") + t.n}
                {s.terms.length > 1 && (
                  <button className="hvDim" title={termCloseTitle} onMouseDown={e => { e.stopPropagation(); this.closeTerm(t.id); }}
                    style={{ width: 15, height: 15, fontSize: 9, fontFamily: "inherit", cursor: "pointer", borderRadius: 4, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
                )}
              </div>
            );
          })}
          <button className="hvDim" title={t("misc.newTerminal")} onClick={() => this.addTerm()}
            style={{ width: 22, height: 22, fontSize: 13, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>＋</button>
          <div style={{ width: 1, height: 14, background: "var(--w07)", margin: "0 4px" }} />
          <button className="hvTermTab" onMouseDown={() => this.setState({ termTab: "problems", termOpen: true })}
            style={{ height: 24, padding: "0 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, color: onProblems ? "var(--fg)" : "var(--fg-dim)", background: onProblems ? "var(--w06)" : "transparent", border: "none", transition: "background var(--dur) var(--ease), color var(--dur-fast) var(--ease)" }}>
            {t("misc.problems")}
            {(errs > 0 || warns > 0) && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: errs > 0 ? "#CE9A9A" : "#CCB491", background: errs > 0 ? "rgba(201,123,123,.14)" : "rgba(196,168,130,.14)", borderRadius: 7, padding: "0 6px", lineHeight: "14px" }}>{errs + warns}</span>
            )}
          </button>
          <button className="hvTermTab" onMouseDown={() => this.setState({ termTab: "ai", termOpen: true })}
            style={{ height: 24, padding: "0 11px", display: "flex", alignItems: "center", fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, color: onAi ? "var(--fg)" : "var(--fg-dim)", background: onAi ? "var(--w06)" : "transparent", border: "none", transition: "background var(--dur) var(--ease), color var(--dur-fast) var(--ease)" }}>{t("misc.aiLog")}</button>
          <div style={{ flex: 1 }} />
          <button className="hvDim" onClick={() => this.setState({ termOpen: false })} title={t("misc.collapseDock")} style={{ width: 22, height: 22, fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>⌄</button>
        </div>

        {/* 본문 — 터미널들은 셸 유지를 위해 모두 마운트, 비활성은 숨김 */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {window.schutz ? (
            s.terms.map(t => (
              <div key={t.id} style={{ position: "absolute", inset: 0, display: s.termTab === t.id ? "block" : "none" }}>
                <XtermView id={t.id} cwd={s.workspace?.root} codeFont={getEditorPrefs().codeFont} fontSize={getEditorPrefs().fontSize} themeId={getThemeId()} />
              </div>
            ))
          ) : (
            <div style={{ position: "absolute", inset: 0, display: onAi ? "none" : "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--fg-dim)" }}>
              {t("misc.terminalDesktopOnly")}
            </div>
          )}
          {/* AI 로그 (실제 에이전트 도구 활동) */}
          <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "9px 16px", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.75, display: onAi ? "block" : "none" }}>
            {!s.tools.length && <div style={{ color: DIM }}>{t("misc.agentActivityHere")}</div>}
            {s.tools.map(t => {
              const d = this.agDef(t.agent);
              return (
                <div key={"al" + t.id} style={{ whiteSpace: "pre-wrap" }}>
                  <span style={{ color: d.color }}>{d.name.padEnd(7)}</span>
                  <span style={{ color: SUB }}>{t.verb + "  "}</span>
                  <span style={{ color: TXT }}>{t.path}</span>
                  <span style={{ color: t.st === "run" ? AC : DIM }}>{t.st === "run" ? "  …" : "  " + (t.note || toolDoneLabel)}</span>
                </div>
              );
            })}
          </div>
          {/* 문제 패널 (Monaco 진단) */}
          <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "6px 0", display: onProblems ? "block" : "none" }}>
            {s.problems.length === 0 && (
              <div style={{ padding: "9px 16px", fontSize: 11.5, color: DIM }}>
                {s.tsLargeProject ? t("misc.largeProjectDiag") : t("misc.noProblems")}
              </div>
            )}
            {s.problems.slice(0, 500).map((p, i) => (
              <div key={"pb" + i} className="hv04" onMouseDown={() => this.openProblem(p)}
                style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 16px", cursor: "pointer", fontFamily: MONO, fontSize: 11.5 }}>
                <span style={{ flex: "none", color: p.severity >= 8 ? "#CE9A9A" : "#CCB491" }}>{p.severity >= 8 ? "✕" : "▲"}</span>
                <span style={{ flex: "none", color: TXT, minWidth: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.rel.split("/").pop()}</span>
                <span style={{ flex: "none", color: DIM }}>:{p.line}:{p.col}</span>
                <span style={{ color: SUB, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Ctrl+P 퀵오픈 ──
  /** Ctrl+Tab MRU 탭 전환 오버레이 */
  renderMru() {
    const s = this.state;
    if (!s.mruOpen) return null;
    const list = this._tabMRU.filter(r => this.isOpen(r)).slice(0, 12);
    if (list.length < 2) return null;
    const sel = s.mruSel % list.length;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.2)" }}>
        <div className="sz-pop" style={{ minWidth: 320, maxWidth: 520, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 6 }}>
          {list.map((rel, i) => (
            <div key={rel} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", borderRadius: 7, background: i === sel ? "var(--accent-soft)" : "transparent", transition: "background var(--dur-fast) var(--ease)" }}>
              <span style={{ fontFamily: MONO, fontSize: 12.5, color: "var(--fg)" }}>{rel.split("/").pop()}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rel}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /** 토스트 스택 (우하단) */
  renderToasts() {
    const s = this.state;
    if (!s.toasts.length) return null;
    const col = { info: "var(--accent)", ok: "var(--ok)", error: "#CE9A9A" };
    return (
      <div style={{ position: "fixed", right: 16, bottom: 40, zIndex: 300, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        {s.toasts.map(t => (
          <div key={t.id} onClick={() => this.dismissToast(t.id)}
            style={{ maxWidth: 380, display: "flex", alignItems: "flex-start", gap: 8, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderLeft: `3px solid ${col[t.kind]}`, borderRadius: 9, boxShadow: "var(--shadow-pop)", padding: "9px 13px", cursor: "pointer", animation: t.leaving ? "szFadeOut .28s var(--ease) both" : "szFadeUp .25s var(--ease-emph) both" }}>
            <span style={{ flex: "none", color: col[t.kind], fontSize: 12, lineHeight: 1.5 }}>{t.kind === "error" ? "⚠" : t.kind === "ok" ? "✓" : "•"}</span>
            <span style={{ fontSize: 12, color: "var(--fg)", lineHeight: 1.5, fontFamily: SUIT }}>{t.text}</span>
          </div>
        ))}
      </div>
    );
  }

  /** 미저장 탭 닫기 확인 모달 */
  renderAskClose() {
    const a = this.state.askClose;
    if (!a) return null;
    const out = this.isClosing("askClose");
    const closeAsk = () => this.closeOverlay("askClose", { askClose: null });
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeAsk}
        style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("misc.unsavedTitle"))} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()}
          style={{ width: 380, maxWidth: "90%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: "18px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t("misc.unsavedTitle")}</div>
          <div style={{ fontSize: 12, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 16 }}>
            <span style={{ fontFamily: MONO, color: "var(--fg)" }}>{a.rel.split("/").pop()}</span>{t("misc.unsavedBodySuffix")}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="hv05" onClick={closeAsk}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("misc.cancel")}</button>
            <button className="hvRed2" onClick={() => this.confirmCloseDiscard()}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#CE9A9A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>{t("misc.dontSave")}</button>
            <button className="hvAccent" onClick={() => void this.confirmCloseSave()}
              style={{ height: 32, padding: "0 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("misc.saveAndClose")}</button>
          </div>
        </div>
      </div>
    );
  }

  private _searchTimer: ReturnType<typeof setTimeout> | null = null;
  private onSearchInput(v: string) {
    this.setState({ searchQuery: v });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => void this.runSearch(v), 180);
  }

  /** 전역 텍스트 검색 오버레이 (Ctrl+Shift+F) */
  renderSearch() {
    const s = this.state;
    if (!s.searchOpen && !this.isClosing("search")) return null;
    const out = this.isClosing("search");
    const closeSearch = () => this.closeOverlay("search", { searchOpen: false });
    const hits = s.searchResults;
    // 파일별 그룹핑 (렌더 순서 보존)
    const groups: { rel: string; items: SearchHit[] }[] = [];
    const idx: Record<string, number> = {};
    hits.forEach(h => {
      if (idx[h.rel] === undefined) { idx[h.rel] = groups.length; groups.push({ rel: h.rel, items: [] }); }
      groups[idx[h.rel]].items.push(h);
    });
    const sel = Math.min(s.searchSel, Math.max(0, hits.length - 1));
    const hitIdx = new Map(hits.map((h, i) => [h, i])); // O(1) 인덱스 조회 (O(N²) indexOf 회피)
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeSearch}
        style={{ position: "fixed", inset: 0, zIndex: 180, background: "rgba(0,0,0,.25)", display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <div className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 640, maxWidth: "92%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--w08)" }}>
            <button className="hvDim" title={s.replaceOpen ? t("palette.replaceClose") : t("palette.replaceOpen")} onClick={() => this.setState(st => ({ replaceOpen: !st.replaceOpen }))}
              style={{ flex: "none", width: 26, height: 44, fontSize: 11, fontFamily: "inherit", cursor: "pointer", color: "var(--fg-dim)", background: "transparent", border: "none" }}>{s.replaceOpen ? "▾" : "▸"}</button>
            <input autoFocus value={s.searchQuery}
              onChange={e => this.onSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ searchSel: (sel + 1) % Math.max(1, hits.length) }); }
                else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ searchSel: (sel - 1 + hits.length) % Math.max(1, hits.length) }); }
                else if (e.key === "Enter" && hits[sel]) { this.jumpToHit(hits[sel]); }
                else if (e.key === "Escape") closeSearch();
              }}
              placeholder={t("palette.searchPlaceholder")}
              style={{ flex: 1, background: "transparent", border: "none", height: 44, padding: "0 8px", color: "var(--fg)", fontSize: 13.5, fontFamily: `var(--font-ui, ${SUIT})`, outline: "none" }} />
            {/* 옵션 토글 */}
            {([["caseSensitive", "Aa", t("palette.optCaseSensitive")], ["wholeWord", "‹›", t("palette.optWholeWord")], ["regex", ".*", t("palette.optRegex")]] as [keyof S["searchOpts"], string, string][]).map(([key, label, title]) => (
              <button key={key as string} title={title}
                onClick={() => this.setState(st => ({ searchOpts: { ...st.searchOpts, [key]: !st.searchOpts[key] } }), () => this.onSearchInput(this.state.searchQuery))}
                style={{ flex: "none", width: 26, height: 26, marginRight: 3, fontSize: 11, fontWeight: 700, fontFamily: MONO, cursor: "pointer", borderRadius: 6, color: s.searchOpts[key] ? "var(--on-accent)" : "var(--fg-dim)", background: s.searchOpts[key] ? "var(--accent)" : "var(--w05)", border: "none" }}>{label}</button>
            ))}
            <span style={{ flex: "none", marginRight: 14, marginLeft: 6, fontSize: 11, color: "var(--fg-dim)", fontFamily: MONO }}>
              {s.searchBusy ? t("palette.searching") : hits.length > 0 ? t("palette.hitCount", { n: hits.length, plus: s.searchTruncated ? "+" : "" }) : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "6px 14px 6px 26px", borderBottom: "1px solid var(--w08)" }}>
            <input value={s.searchOpts.include} onChange={e => this.setState(st => ({ searchOpts: { ...st.searchOpts, include: e.target.value } }), () => this.onSearchInput(this.state.searchQuery))}
              placeholder={t("palette.includeGlob")}
              style={{ flex: 1, background: "var(--bg-root)", border: "1px solid var(--w08)", borderRadius: 6, height: 26, padding: "0 9px", color: "var(--fg-sub)", fontSize: 11, fontFamily: MONO, outline: "none" }} />
            <input value={s.searchOpts.exclude} onChange={e => this.setState(st => ({ searchOpts: { ...st.searchOpts, exclude: e.target.value } }), () => this.onSearchInput(this.state.searchQuery))}
              placeholder={t("palette.excludeGlob")}
              style={{ flex: 1, background: "var(--bg-root)", border: "1px solid var(--w08)", borderRadius: 6, height: 26, padding: "0 9px", color: "var(--fg-sub)", fontSize: 11, fontFamily: MONO, outline: "none" }} />
          </div>
          {s.replaceOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 8px 26px", borderBottom: "1px solid var(--w08)" }}>
              <input value={s.replaceVal} onChange={e => this.setState({ replaceVal: e.target.value })}
                placeholder={t("palette.replaceWith")}
                style={{ flex: 1, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 7, height: 30, padding: "0 11px", color: "var(--fg)", fontSize: 12.5, fontFamily: `var(--font-ui, ${SUIT})`, outline: "none" }} />
              <button className="hvAccent" disabled={s.searchQuery.trim().length < 2 || hits.length === 0}
                onClick={() => void this.doReplaceAll()}
                style={{ flex: "none", height: 30, padding: "0 12px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: (s.searchQuery.trim().length >= 2 && hits.length > 0) ? "pointer" : "default", borderRadius: 7, color: "var(--on-accent)", background: (s.searchQuery.trim().length >= 2 && hits.length > 0) ? "var(--accent)" : "var(--w10)", border: "none" }}>{t("palette.replaceAll")}</button>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
            {!s.workspace && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.openProjectFirst")}</div>}
            {s.workspace && !s.searchBusy && s.searchQuery.trim().length >= 2 && hits.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.noResults")}</div>
            )}
            {groups.map(g => (
              <div key={g.rel} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px 3px" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--fg)" }}>{g.rel.split("/").pop()}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.rel}</span>
                  <span style={{ fontSize: 10, color: "var(--fg-dim2)" }}>{g.items.length}</span>
                </div>
                {g.items.map(h => {
                  const gi = hitIdx.get(h) ?? 0;
                  return (
                    <div key={h.rel + ":" + h.line + ":" + h.col} ref={gi === sel ? this._selRowRef : undefined}
                      onMouseDown={e => { e.preventDefault(); this.jumpToHit(h); }}
                      onMouseEnter={() => this.setState({ searchSel: gi })}
                      style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "3px 12px 3px 20px", borderRadius: 6, cursor: "pointer", background: gi === sel ? "var(--accent-soft)" : "transparent" }}>
                      <span style={{ flex: "none", fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim)", minWidth: 30, textAlign: "right" }}>{h.line}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--fg-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.preview}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderCommandPalette() {
    const s = this.state;
    if (!s.cmdOpen && !this.isClosing("cmd")) return null;
    const out = this.isClosing("cmd");
    const closeCmd = () => this.closeOverlay("cmd", { cmdOpen: false });
    const q = s.cmdQuery.toLowerCase().trim();
    const all = this.commands();
    const list = (!q ? all : all.filter(c => {
      const l = c.label.toLowerCase();
      if (l.includes(q)) return true;
      let i = 0; for (const ch of l) if (ch === q[i]) i++; return i === q.length; // 서브시퀀스
    })).slice(0, 40);
    const sel = Math.min(s.cmdSel, Math.max(0, list.length - 1));
    const runAt = (i: number) => { const c = list[i]; this.closeOverlay("cmd", { cmdOpen: false }); if (c) setTimeout(() => c.run(), 0); };
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeCmd}
        style={{ position: "fixed", inset: 0, zIndex: 190, background: "rgba(0,0,0,.25)", display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <div className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 580, maxWidth: "92%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input autoFocus value={s.cmdQuery}
            onChange={e => this.setState({ cmdQuery: e.target.value, cmdSel: 0 })}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ cmdSel: (sel + 1) % Math.max(1, list.length) }); }
              else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ cmdSel: (sel - 1 + list.length) % Math.max(1, list.length) }); }
              else if (e.key === "Enter") { e.preventDefault(); runAt(sel); }
              else if (e.key === "Escape") closeCmd();
            }}
            placeholder={t("palette.cmdPlaceholder")}
            style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--w08)", height: 42, padding: "0 16px", color: "var(--fg)", fontSize: 13.5, fontFamily: `var(--font-ui, ${SUIT})`, outline: "none" }} />
          <div style={{ maxHeight: 360, overflowY: "auto", padding: 4 }}>
            {list.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.noCommands")}</div>}
            {list.map((c, i) => (
              <div key={c.id} ref={i === sel ? this._selRowRef : undefined}
                onMouseDown={e => { e.preventDefault(); runAt(i); }}
                onMouseEnter={() => this.setState({ cmdSel: i })}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", borderRadius: 6, cursor: "pointer", background: i === sel ? "var(--accent-soft)" : "transparent" }}>
                <span style={{ fontSize: 12.5, color: "var(--fg)", flex: 1 }}>{c.label}</span>
                {c.hint && <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim)" }}>{c.hint}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderQuickOpen() {
    const s = this.state;
    if (!s.quickOpen && !this.isClosing("quick")) return null;
    const out = this.isClosing("quick");
    const closeQuick = () => this.closeOverlay("quick", { quickOpen: false });
    const list = this.quickList();
    const sel = Math.min(s.quickSel, Math.max(0, list.length - 1));
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeQuick}
        style={{ position: "fixed", inset: 0, zIndex: 180, background: "rgba(0,0,0,.25)", display: "flex", justifyContent: "center", paddingTop: 90 }}>
        <div className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 560, maxWidth: "90%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input autoFocus value={s.quickQuery}
            onChange={e => this.setState({ quickQuery: e.target.value, quickSel: 0 })}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ quickSel: (sel + 1) % Math.max(1, list.length) }); }
              else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ quickSel: (sel - 1 + list.length) % Math.max(1, list.length) }); }
              else if (e.key === "Enter" && list[sel]) { this.revealFile(list[sel].rel); closeQuick(); }
              else if (e.key === "Escape") closeQuick();
            }}
            placeholder={t("palette.quickPlaceholder")}
            style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--w08)", height: 42, padding: "0 16px", color: "var(--fg)", fontSize: 13.5, fontFamily: SUIT, outline: "none" }} />
          <div style={{ maxHeight: 320, overflowY: "auto", padding: 4 }}>
            {!this.state.workspace && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.openProjectFirst")}</div>}
            {this.state.workspace && list.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.noFiles")}</div>}
            {list.map((f, i) => (
              <div key={f.rel} ref={i === sel ? this._selRowRef : undefined}
                onMouseDown={e => { e.preventDefault(); this.revealFile(f.rel); closeQuick(); }}
                onMouseEnter={() => this.setState({ quickSel: i })}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 12px", borderRadius: 6, cursor: "pointer", background: i === sel ? "var(--accent-soft)" : "transparent" }}>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: "var(--fg)" }}>{f.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.rel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderExt() {
    const s = this.state;
    const badge = (text: string, color: string) => <span style={{ fontSize: 8.5, fontWeight: 700, color, background: color + "22", borderRadius: 4, padding: "1px 5px" }}>{text}</span>;
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Open VSX 마켓플레이스 검색 */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.6 }}><SearchIcon /></span>
          <input value={s.extSearch} onChange={e => void this.extMarketSearch(e.target.value)} placeholder={t("extui.searchPlaceholder")}
            style={{ width: "100%", height: 32, padding: "0 10px 0 30px", fontSize: 11.5, fontFamily: SUIT, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 8, color: "var(--fg)", outline: "none" }} />
        </div>
        {(s.extBusy || (!s.extResults.length && !s.extSearch)) && [0, 1, 2, 3].map(i => (
          <div key={"sk" + i} style={{ display: "flex", gap: 9, padding: "8px 9px", opacity: 1 - i * 0.18 }}>
            <div className="sz-skel" style={{ width: 34, height: 34, borderRadius: 6, flex: "none" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
              <div className="sz-skel" style={{ height: 11, width: "55%" }} />
              <div className="sz-skel" style={{ height: 9, width: "85%" }} />
            </div>
          </div>
        ))}
        {s.extResults.map((r, ri) => {
          const installed = s.extList.some(e => e.id === r.namespace + "." + r.name);
          const installing = s.extInstalling.includes(r.namespace + "." + r.name);
          const iconUrl = r.icon;
          return (
            <div key={r.namespace + "." + r.name} className="hv04 sz-in" onClick={() => void this.openExtDetail(r.namespace, r.name)} style={{ display: "flex", gap: 9, borderRadius: 8, padding: "8px 9px", cursor: "pointer", animationDelay: Math.min(ri, 12) * 28 + "ms" }}>
              {iconUrl
                ? <img src={iconUrl} width={34} height={34} style={{ flex: "none", borderRadius: 6, objectFit: "contain", background: "var(--w05)" }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                : <div style={{ flex: "none", width: 34, height: 34, borderRadius: 6, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-hi)", fontSize: 15, fontWeight: 800 }}>{(r.displayName || r.name).slice(0, 1).toUpperCase()}</div>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.displayName}</span>
                  <span style={{ flex: "none", fontSize: 9.5, color: "var(--fg-dim)" }}>{r.namespace}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--fg-sub2)", marginTop: 1, lineHeight: 1.4, maxHeight: 28, overflow: "hidden" }}>{r.description}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, color: "var(--fg-dim)", display: "flex", alignItems: "center", gap: 3 }}>⬇ {this.fmtCount(r.downloadCount)}</span>
                  {r.rating > 0 && <span style={{ fontSize: 9.5, color: "var(--fg-dim)" }}>★ {r.rating.toFixed(1)}</span>}
                  <div style={{ flex: 1 }} />
                  {installed
                    ? <span style={{ fontSize: 9.5, color: "var(--accent-hi)", fontWeight: 600 }}>{t("extui.installed")}</span>
                    : <button className="hv08" disabled={installing} onClick={e => { e.stopPropagation(); void this.extInstall(r.namespace, r.name); }}
                      style={{ flex: "none", padding: "3px 12px", fontSize: 10.5, fontWeight: 600, fontFamily: SUIT, cursor: installing ? "default" : "pointer", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--on-accent)", opacity: installing ? 0.6 : 1 }}>{installing ? t("extui.installing") : t("extui.install")}</button>}
                </div>
              </div>
            </div>
          );
        })}
        {!s.extBusy && !!s.extSearch.trim() && s.extResults.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "10px 4px", textAlign: "center", lineHeight: 1.5 }}>
            {t("extui.noResults1", { q: s.extSearch.trim() })}<br />{t("extui.noResults2")}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={sectHdr}>{t("extui.installedHdr")}</span>
          <div style={{ flex: 1 }} />
          <button className="hv08" onClick={() => void this.reloadExtensions()} style={{ padding: "3px 8px", fontSize: 10, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub)" }}>{t("common.refresh")}</button>
          <button className="hv08" onClick={() => void window.schutz?.extOpenDir()} style={{ padding: "3px 8px", fontSize: 10, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub)" }}>{t("common.folder")}</button>
        </div>
        {s.extList.length === 0 && <div style={{ fontSize: 11, color: "var(--fg-dim)", padding: "6px 2px" }}>{t("extui.none")}</div>}
        {s.extList.map(ext => {
          const [ns, ...rest] = ext.id.split(".");
          const clickable = ext.kind === "vscode" && rest.length > 0;
          const limited = s.extLimited.find(l => l.id === ext.id);
          return (
          <div key={ext.id} onClick={clickable ? () => void this.openExtDetail(ns, rest.join(".")) : undefined} style={{ border: "1px solid var(--w08)", borderRadius: 8, padding: "8px 10px", background: "var(--bg-root)", cursor: clickable ? "pointer" : "default" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ext.name}</span>
              {ext.kind === "vscode" ? badge("VS Code", "#4A90D0") : badge("Schutz", "#8FA893")}
              <button className="hv08" onClick={e => { e.stopPropagation(); void this.toggleExtEnabled(ext.id, !ext.enabled); }}
                style={{ marginLeft: "auto", flex: "none", padding: "2px 8px", fontSize: 10, fontFamily: SUIT, cursor: "pointer", borderRadius: 5, border: "1px solid var(--w10)", background: ext.enabled ? "var(--accent-soft)" : "transparent", color: ext.enabled ? "var(--accent-hi)" : "var(--fg-dim)" }}>{ext.enabled ? t("extui.enabled") : t("extui.disabled")}</button>
            </div>
            {ext.description && <div style={{ fontSize: 10.5, color: "var(--fg-sub2)", marginTop: 3, maxHeight: 30, overflow: "hidden" }}>{ext.description}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "var(--fg-dim)", fontFamily: MONO }}>v{ext.version}</span>
              {ext.contributes.map(c => badge(c, "#8B8F9E"))}
              {ext.kind === "vscode" && ext.programmatic && !limited && <span style={{ fontSize: 9, color: "var(--fg-dim)" }}>{t("extui.programmatic")}</span>}
            </div>
            {limited && (
              <div title={limited.reason} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: 9.5, color: "#C4A45A", lineHeight: 1.4 }}>
                <span style={{ flex: "none" }}>ⓘ</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{t("sc5.extLimitedRuntime")}</span>
              </div>
            )}
          </div>
          );
        })}
      </div>
    );
  }

  renderDebug() {
    const s = this.state;
    const d = s.debug;
    const rel = s.active[this._focusSlot];
    const btn = (label: string, onClick: () => void, disabled = false, primary = false) => (
      <button className="hv08" disabled={disabled} onClick={onClick}
        style={{ padding: "5px 9px", fontSize: 11, fontFamily: SUIT, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, borderRadius: 6, border: "1px solid var(--w10)", background: primary ? "var(--accent)" : "transparent", color: primary ? "var(--on-accent)" : "var(--fg-sub)" }}>{label}</button>
    );
    const stopped = d?.status === "stopped";
    const bpEntries = Object.entries(s.breakpoints).filter(([, l]) => l.length);
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 툴바 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {!d && btn(t("dbg.run"), () => void this.startDebug(), !rel?.endsWith(".py"), true)}
          {d && btn(t("dbg.continue"), this.dbgContinue, !stopped)}
          {d && btn(t("dbg.stepOver"), this.dbgStepOver, !stopped)}
          {d && btn(t("dbg.stepInto"), this.dbgStepIn, !stopped)}
          {d && btn(t("dbg.stepOut"), this.dbgStepOut, !stopped)}
          {d && btn(t("dbg.stop"), () => void this.stopDebug())}
        </div>
        {d && <div style={{ fontSize: 10.5, color: stopped ? "#E0B052" : "var(--fg-dim)", fontFamily: MONO }}>
          {d.status === "starting" ? t("dbg.statusStarting") : d.status === "running" ? t("dbg.statusRunning") : t("dbg.statusStopped", { line: d.stoppedLine })}
        </div>}

        {/* 콜스택 */}
        {d && d.frames.length > 0 && (
          <div>
            <div style={sectHdr}>{t("dbg.callStack")}</div>
            {d.frames.map(f => (
              <div key={f.id} onClick={() => void this.selectFrame(f.id)}
                style={{ padding: "3px 6px", borderRadius: 5, cursor: "pointer", fontFamily: MONO, fontSize: 11, color: f.id === d.frameId ? "var(--fg)" : "var(--fg-sub2)", background: f.id === d.frameId ? "var(--accent-soft)" : "transparent" }}>
                {f.name} <span style={{ color: "var(--fg-dim)" }}>:{f.line}</span>
              </div>
            ))}
          </div>
        )}

        {/* 변수 */}
        {d && d.scopes.length > 0 && (
          <div>
            <div style={sectHdr}>{t("dbg.variables")}</div>
            {d.scopes.map((sc, i) => (
              <div key={sc.name + i}>
                <div onClick={() => void this.toggleScope(i)} style={{ cursor: "pointer", fontSize: 10.5, color: "var(--fg-sub)", fontFamily: MONO, padding: "2px 4px" }}>{sc.expanded ? "▾" : "▸"} {sc.name}</div>
                {sc.expanded && sc.vars.map((v, j) => (
                  <div key={v.name + j} style={{ padding: "1px 4px 1px 16px", fontFamily: MONO, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: "var(--accent-hi)" }}>{v.name}</span><span style={{ color: "var(--fg-dim)" }}> = </span><span style={{ color: "var(--fg-sub)" }}>{v.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 브레이크포인트 */}
        <div>
          <div style={sectHdr}>{t("dbg.breakpoints")}</div>
          {bpEntries.length === 0 && <div style={{ fontSize: 10.5, color: "var(--fg-dim)", padding: "2px 4px" }}>{t("dbg.breakpointsEmpty")}</div>}
          {bpEntries.map(([r, lines]) => lines.map(ln => (
            <div key={r + ":" + ln} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", fontFamily: MONO, fontSize: 10.5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: "#E05252", flex: "none" }} />
              <span onClick={() => { this.openFile(r); }} style={{ cursor: "pointer", color: "var(--fg-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r}:{ln}</span>
              <button className="hv08" onClick={() => this.toggleBreakpoint(r, ln)} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 12 }}>×</button>
            </div>
          )))}
        </div>

        {/* 디버그 콘솔 */}
        {s.debugConsole.length > 0 && (
          <div>
            <div style={sectHdr}>{t("dbg.console")}</div>
            <div style={{ maxHeight: 160, overflowY: "auto", fontFamily: MONO, fontSize: 10.5, color: "var(--fg-sub2)", whiteSpace: "pre-wrap", background: "var(--bg-root)", borderRadius: 6, padding: "6px 8px" }}>{s.debugConsole.join("")}</div>
          </div>
        )}
      </div>
    );
  }

  /** 공용 모달 셸 (About/Usage/Keybindings) — renderExtPanel 패턴 */
  /** 오버레이 닫기 — 나가는 애니메이션(~180ms) 후 실제 언마운트 */
  isClosing(key: string): boolean { return this.state.closing.includes(key); }
  // 오버레이별 전용 close 타이머 — this.qt(clearTimers로 지워질 수 있음)와 분리, 재열림 시 정확히 취소
  private _closeTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  closeOverlay(key: string, patch: Partial<S>, dur = 260) {
    if (this.isClosing(key)) return;
    this.setState(s => ({ closing: [...s.closing, key] }));
    if (this._closeTimers[key]) clearTimeout(this._closeTimers[key]);
    this._closeTimers[key] = setTimeout(() => {
      delete this._closeTimers[key];
      this.setState(s => ({ ...(patch as any), closing: s.closing.filter(k => k !== key) }));
    }, dur);
  }
  /** 닫는 애니메이션 중 재열 때 호출 — 대기 중인 닫기 타이머를 취소하고 closing 해제 */
  cancelClose(key: string) {
    if (this._closeTimers[key]) { clearTimeout(this._closeTimers[key]); delete this._closeTimers[key]; }
    if (this.isClosing(key)) this.setState(s => ({ closing: s.closing.filter(k => k !== key) }));
  }
  /** 오버레이 플래그 → closing 키 맵 (재열림 시 pending close 무효화용) */
  private static OVERLAY_KEY: Record<string, string> = {
    aboutOpen: "about", usageOpen: "usage", keysOpen: "keys", commandsOpen: "commands",
    settingsOpen: "settings", mcpOpen: "mcp", cmdOpen: "cmd", quickOpen: "quick", symOpen: "sym", searchOpen: "search",
    extDetail: "extDetail", extPanel: "extPanel", askClose: "askClose",
  };
  /** 오버레이 열기 — 닫는 애니메이션 중이면 취소하고 연다 (닫자마자 다시 닫히는 버그 방지) */
  private openO(patch: Partial<S>) {
    for (const flag of Object.keys(patch)) {
      const key = App.OVERLAY_KEY[flag];
      if (key && (patch as any)[flag]) this.cancelClose(key);
    }
    this.setState(patch as any);
  }

  /** 모달 접근성 — role/aria + 마운트 시 첫 포커스 + Tab 포커스 트랩 */
  private dialogProps(title: string): any {
    return {
      role: "dialog", "aria-modal": true, "aria-label": title, tabIndex: -1,
      ref: (el: HTMLElement | null) => {
        if (el && !el.dataset.szf) {
          el.dataset.szf = "1";
          const f = el.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])');
          (f ?? el).focus();
        }
      },
      onKeyDown: (e: React.KeyboardEvent) => this.trapTab(e),
    };
  }
  private trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const root = e.currentTarget as HTMLElement;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(n => n.offsetParent !== null);
    if (nodes.length < 2) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  private modalShell(key: string, title: string, onClose: () => void, body: React.ReactNode, width = 560) {
    const out = this.isClosing(key);
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 195, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(title)} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()} style={{ width, maxWidth: "92%", maxHeight: "84%", overflow: "auto", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)", fontFamily: SUIT, outline: "none" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "13px 16px", borderBottom: "1px solid var(--w06)", position: "sticky", top: 0, background: "var(--bg-card)" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{title}</span>
            <button className="hvDim" onClick={onClose} style={{ marginLeft: "auto", width: 24, height: 24, border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 15, borderRadius: 5 }}>✕</button>
          </div>
          <div style={{ padding: "16px 18px" }}>{body}</div>
        </div>
      </div>
    );
  }

  renderAbout() {
    if (!this.state.aboutOpen && !this.isClosing("about")) return null;
    const env: string[] = [];
    if (window.schutz) env.push(t("modal.envDesktop")); else env.push(t("modal.envWebPreview"));
    return this.modalShell("about", t("modal.aboutTitle"), () => this.closeOverlay("about", { aboutOpen: false }), (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", padding: "8px 0" }}>
        <Logo size={44} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--fg)", letterSpacing: -0.5 }}>Schutz</div>
          <div style={{ fontSize: 12, color: "var(--fg-sub)", marginTop: 3 }}>{t("modal.aboutTagline", { version: APP_VERSION })}</div>
        </div>
        {/* 오프닝과 같은 문장. 언어와 무관하게 독일어로 두고 번역을 밑에 깐다 —
            이건 번역 대상이 아니라 상표에 가깝다. */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 300, color: "var(--fg)", letterSpacing: "-.01em" }}>
            {t("open.say").replace(/\*/g, "")}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 4 }}>{t("open.saySub")}</div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--fg-sub2)", lineHeight: 1.7 }}>
          {t("modal.aboutDesc")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", marginTop: 4 }}>
          {[["GitHub", "github.com/SchutzScript/Schutz"], [t("modal.aboutLicense"), "FSL-1.1-Apache-2.0"], [t("modal.aboutEnv"), env.join(" · ")], [t("modal.aboutEngine"), ENGINE_CREDIT]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "4px 0", borderTop: "1px solid var(--w05)" }}>
              <span style={{ color: "var(--fg-dim)" }}>{k}</span><span style={{ color: "var(--fg-sub)", fontFamily: MONO }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    ), 380);
  }

  renderUsage() {
    if (!this.state.usageOpen && !this.isClosing("usage")) return null;
    const connected = AGDEF.filter(d => this.modelOf(d.id) !== null);
    let totIn = 0, totOut = 0;
    for (const d of AGDEF) { const a = this.state.agents[d.id]; totIn += a.tin; totOut += a.tout; }
    const body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[[t("modal.usageInputTokens"), totIn.toLocaleString()], [t("modal.usageOutputTokens"), totOut.toLocaleString()]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, background: "var(--bg-root)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--w06)" }}>
              <div style={{ fontSize: 10, color: "var(--fg-dim)", marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)", fontFamily: MONO }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={sectHdr}>{t("modal.usageByAgent")}</div>
        {connected.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-dim)" }}>{t("modal.usageNoAgents")}</div>}
        {connected.map(d => {
          const a = this.state.agents[d.id];
          const sub = this.isSubscription(d.id);
          const m = this.modelOf(d.id) ?? "?";
          const q = this.state.quota[d.id];
          const left = this.quotaTightest(d.id);
          return (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--bg-root)", borderRadius: 9, border: "1px solid var(--w06)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: d.color, flex: "none" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--fg)" }}>{d.name} <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)" }}>{m}</span></div>
                <div style={{ fontSize: 10.5, color: "var(--fg-dim)", fontFamily: MONO }}>{t("modal.usageAgentTokens", { tin: a.tin.toLocaleString(), tout: a.tout.toLocaleString(), price: sub ? t("modal.subscription") : "" })}</div>
                {q && (
                  <div style={{ fontSize: 10, color: "var(--fg-dim2)", fontFamily: MONO, marginTop: 2 }}>
                    {this.quotaText(d.id)}{q.plan ? " · " + q.plan : ""}
                    {q.windows.map(w => w.resetAt).filter(Boolean).length > 0 && " · " + t("modal.quotaResets", { when: this.quotaResetText(d.id) })}
                  </div>
                )}
              </div>
              <div title={t("status.quotaTitle")} style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: left === null ? "var(--fg-dim3)" : left <= 10 ? "#CE9A9A" : left <= 25 ? "#C4A882" : "var(--ok)" }}>{left === null ? "—" : left + "%"}</div>
            </div>
          );
        })}
        <div style={{ fontSize: 10, color: "var(--fg-dim)" }}>{t("modal.usageFootnote")}</div>
      </div>
    );
    return this.modalShell("usage", t("modal.usageTitle"), () => this.closeOverlay("usage", { usageOpen: false }), body, 520);
  }

  renderKeybindings() {
    if (!this.state.keysOpen && !this.isClosing("keys")) return null;
    const cmds = this.commands().filter(c => c.hint);
    const extra: [string, string][] = [
      [t("modal.kbWorkspaceSymbol"), "Ctrl+T"], [t("modal.kbCycleTabs"), "Ctrl+Tab"], [t("modal.kbGoToLine"), "Ctrl+G"],
      [t("modal.kbDebugStart"), "F5"], [t("modal.kbStepOver"), "F10"], [t("modal.kbStepInto"), "F11"], [t("modal.kbStepOut"), "Shift+F11"], [t("modal.kbDebugStop"), "Shift+F5"],
      [t("modal.kbInlineEdit"), "Ctrl+K"], [t("modal.kbToggleTerminal"), "Ctrl+`"],
    ];
    const rows: [string, string][] = [...cmds.map(c => [c.label, c.hint!] as [string, string]), ...extra];
    const seen = new Set<string>();
    const uniq = rows.filter(([, h]) => { if (seen.has(h)) return false; seen.add(h); return true; });
    return this.modalShell("keys", t("modal.keysTitle"), () => this.closeOverlay("keys", { keysOpen: false }), (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {uniq.map(([label, hint], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 6, background: i % 2 ? "var(--w03)" : "transparent" }}>
            <span style={{ fontSize: 12, color: "var(--fg-sub)" }}>{label}</span>
            <div style={{ flex: 1 }} />
            <kbd style={{ fontSize: 10.5, fontFamily: MONO, color: "var(--fg)", background: "var(--w06)", border: "1px solid var(--w08)", borderRadius: 5, padding: "2px 7px" }}>{hint}</kbd>
          </div>
        ))}
      </div>
    ), 460);
  }

  // ── MCP 관리 ──
  openMcp() { this.cancelClose("mcp"); this.setState({ mcpOpen: true }); void this.refreshMcp(); }

  // ── 첫 실행 데모 ─────────────────────────────────────────────────────────
  /** 데모 시작 전 워크스페이스 — 끝나면 여기로 돌려놓는다 */
  private _demoPrevRoot: string | null = null;
  private _demoAbort = false;

  private demoSleep(ms: number) {
    return new Promise<void>(r => { this.qt(() => r(), ms); });
  }

  /**
   * 첫 실행 데모. 목업이 아니라 **진짜 UI** 를 움직인다 — 실제 워크스페이스를 열고,
   * 실제 Monaco 모델에 타이핑하고, 실제 제안을 검토에 올리고, 실제 수락 경로로 반영한다.
   *
   * API 호출은 0회다. "에이전트" 가 할 일을 여기서 직접 상태에 밀어넣을 뿐이라,
   * 화면에 보이는 건 전부 진짜다. 사용자 파일은 안 건드린다 — userData 아래 샘플에서만 돈다.
   */
  private async runDemo() {
    if (!window.schutz) { this.finishDemo(false); return; }
    this._demoAbort = false;
    this._demoPrevRoot = this.state.workspace?.root ?? null;

    // 자막을 워크스페이스보다 **먼저** 세운다. 샘플을 만들고 여는 데 시간이 걸리는데,
    // 그 사이 화면에는 아무 설명 없이 낯선 프로젝트가 나타난다 — 첫 실행 사용자에게는
    // 그게 데모의 시작이 아니라 오작동으로 보인다.
    this.setState({ demoCaption: DEMO_STEPS[0].caption ?? null, demoRunning: true });

    let root: string;
    try {
      root = await window.schutz.demoProject();
      // 빈 무대에서 시작한다. openWorkspacePath 는 그 프로젝트의 지난 대화를 복원하는데,
      // 데모 프로젝트의 지난 대화란 **지난번 데모**다. 그대로 두면 "오프닝 다시 보기" 를
      // 할 때마다 같은 제안이 검토 패널에 하나씩 쌓이고 답이 두 번씩 나온다.
      //
      // 여는 **앞에서** 지운다. 열고 나서 state 를 비우는 걸 먼저 시도했는데, 복원은
      // 중첩 setState 콜백 안에서 일어나 내 리셋보다 늦게 착지한다 — 경쟁에서 진다.
      // 지울 게 없으면 복원할 것도 없다.
      this.clearProjectConversations(root);
      await this.openWorkspacePath(root);
    } catch {
      this.finishDemo(false);   // 샘플을 못 만들면 데모를 접는다 — 빈 화면을 보여줄 수는 없다
      return;
    }
    this._proposalsById.clear();

    for (const step of DEMO_STEPS) {
      if (this._demoAbort) return;
      this.setState({ demoCaption: step.caption ?? null });
      await this.demoSleep(step.waitMs);
      if (this._demoAbort) return;
      try { await this.demoStep(step.id, root); } catch { /* 한 단계 실패로 데모를 죽이지 않는다 */ }
    }
    if (!this._demoAbort) this.setState({ openingPhase: "outro", demoCaption: null, demoRunning: false });
  }

  private async demoStep(id: string, root: string) {
    switch (id) {
      case "reveal":
        return;

      case "ask": {
        // 대화 입력창에 한 글자씩 — 진짜 입력창이라 자동 높이 조절까지 그대로 돈다
        const text = t("open.ask");
        for (let i = 1; i <= text.length; i++) {
          if (this._demoAbort) return;
          this.setState({ input: text.slice(0, i) }, () => this.autoGrowInput());
          await this.demoSleep(TYPE_INTERVAL_MS);
        }
        return;
      }

      case "look": {
        // 사용자가 보낸 것처럼 대화에 남기고 입력창을 비운다
        this.setState(s => ({
          messages: [...s.messages, { id: "u" + (this._uid++), role: "user" as const, agent: "claude", text: t("open.ask") }],
          input: "",
        }));
        this.setAgent("claude", { status: "edit", file: DEMO_FILE });
        // 에디터 모드에서 도구 줄은 왼쪽 패널의 **흐름 탭**에 쌓인다. 트리 탭인 채로
        // 두면 줄은 만들어지는데 화면 어디에도 안 보인다 — 이 박자가 통째로 헛돈다.
        // (에이전트 모드는 트랜스크립트에 그대로 흐르므로 건드릴 게 없다.)
        if (this.state.uiMode === "editor") this.setState({ leftTab: "flow" });
        // 찾고 읽는 걸 **보여준다**. 예전 시연엔 도구 줄이 한 줄도 없어서, 상태만
        // "편집 중" 으로 바뀌고 결과가 튀어나왔다 — 그건 다른 도구와 구분이 안 되는
        // 그림이고, "무엇을 읽었는지 다 보인다" 는 이 앱의 약속과도 어긋난다.
        await this.demoTool("search", DEMO_FIND, 900);
        await this.demoTool("read", DEMO_FILE, 700);
        // 에이전트 모드에선 편집기가 숨어 있어 openFile 만으로는 아무것도 안 보인다.
        // 시트를 띄운다 — 코드가 필요할 때만 떠오른다는 그 동작을 데모가 그대로 가르친다.
        this.revealFile(DEMO_FILE);
        return;
      }

      case "propose": {
        // 진짜 제안 — 검토 패널이 이걸 그대로 그린다
        const p: Proposal = {
          id: "p" + (this._uid++),
          rel: DEMO_FILE,
          find: DEMO_FIND,
          replace: DEMO_REPLACE,
          rationale: t("open.reply"),
          agent: "claude",
          status: "pending",
        };
        this._proposalsById.set(p.id, p);
        this.setState(s => ({
          proposals: [...s.proposals, p],
          messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who: this.agDef("claude").name, agent: "claude", text: t("open.reply") }],
        }));
        this._demoProposalId = p.id;
        return;
      }

      case "accept": {
        // 코드가 바뀌는 순간이 이 데모의 핵심이다. 평소 속도로는 42자가 224ms 만에 끝나
        // "깜빡였다" 로 보이므로, 여기서만 늦추고 글자를 키워 과정이 보이게 한다.
        const base = getEditorPrefs().fontSize;
        this._demoTyping = true;
        await this.demoZoom(DEMO_FILE, base, DEMO_ZOOM_FONT, DEMO_ZOOM_MS);
        try {
          // 실제 수락 경로 — animateEditIntoModel 이 진짜 Monaco 모델에 타이핑한다
          if (this._demoProposalId) await this.acceptProposal(this._demoProposalId);
        } finally {
          this._demoTyping = false;
        }
        // 바뀐 코드를 잠깐 크게 둔 채로 보여주고 되돌린다 — 확대한 채로 끝내면
        // 데모가 남긴 상태가 사용자 설정처럼 보인다.
        await this.demoSleep(1100);
        await this.demoZoom(DEMO_FILE, DEMO_ZOOM_FONT, base, DEMO_ZOOM_MS);
        this.setAgent("claude", { status: "idle", file: null });
        return;
      }

      case "ask2": {
        // 두 번째 요청. 한 번 고치고 끝나면 "한 번 쓰고 마는 도구" 로 보인다.
        const text = t("open.ask2");
        for (let i = 1; i <= text.length; i++) {
          if (this._demoAbort) return;
          this.setState({ input: text.slice(0, i) }, () => this.autoGrowInput());
          await this.demoSleep(TYPE_INTERVAL_MS);
        }
        this.setState(s => ({
          messages: [...s.messages, { id: "u" + (this._uid++), role: "user" as const, agent: "claude", text }],
          input: "",
        }));
        return;
      }

      case "run": {
        // 명령은 **묻고 나서** 돌린다. 무엇을 돌릴지 먼저 보여주는 이 카드가 이 앱에서
        // 제일 중요한 안전장치인데 시연에 없었다. 진짜로 실행하지는 않는다 — 시연은
        // 셸도 API 도 건드리지 않는다(그래서 출력도 각본에 적힌 문자열이다).
        this.setState({ askRun: { command: DEMO_CMD, rationale: t("open.runWhy"), agent: "claude" } });
        await this.demoSleep(2600);
        if (this._demoAbort) { this.setState({ askRun: null }); return; }
        this.setState({ askRun: null });
        // 실행은 시연의 클라이맥스다. 예전엔 스피너 1.2초 뒤 결과가 통째로 툭 떴다 —
        // "돌려도 되냐" 를 물어놓고 정작 도는 모습이 안 보였다. 여기서는 도구 줄의
        // 출력을 펼친 채로 한 줄씩 흘려, 테스트가 **실제로 도는 것처럼** 마친다.
        {
          const runId = "t" + (this._uid++);
          this.addTool(runId, "claude", t("open.tool.run"), DEMO_CMD);
          this.setState(st => ({ openTools: { ...st.openTools, [runId]: true } }));
          const lines = DEMO_CMD_OUT.split("\n");
          let acc = "";
          for (let i = 0; i < lines.length; i++) {
            if (this._demoAbort) return;
            acc += (i ? "\n" : "") + lines[i];
            this.setTool(runId, { out: acc });
            await this.demoSleep(340);
          }
          if (this._demoAbort) return;
          await this.demoSleep(420);
          this.setTool(runId, { st: "done" });   // 출력이 다 흐른 뒤에야 완료로 넘긴다
        }
        await this.demoSleep(500);
        if (this._demoAbort) return;
        this.setState(s => ({
          messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who: this.agDef("claude").name, agent: "claude", text: t("open.runDone") }],
        }));
        this.setAgent("claude", { status: "idle", file: null });
        return;
      }

      case "done":
        return;
    }
  }

  /** 시연용 도구 줄 하나 — 떴다가 끝난다. 실제 실행 경로와 같은 상태를 쓰므로
   *  트랜스크립트도 검토 패널도 진짜일 때와 똑같이 그린다. */
  private async demoTool(verb: string, path: string, ms: number, out?: string) {
    const id = "t" + (this._uid++);
    this.addTool(id, "claude", t("open.tool." + verb), path);
    await this.demoSleep(ms);
    if (this._demoAbort) return;
    this.setTool(id, { st: "done", ...(out ? { out } : {}) });
  }

  /** 한 프로젝트의 저장된 대화를 전부 지운다. **데모 프로젝트에만** 쓴다 —
   *  userData 아래 우리가 만든 샘플이고, 매번 같은 장면을 처음부터 보여줘야 한다.
   *  사용자 프로젝트에는 절대 부르지 않는다(호출부가 하나뿐인 이유다). */
  private clearProjectConversations(root: string) {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("schutz.conv:" + root) || k.startsWith("schutz.convs:" + root)
          || k.startsWith("schutz.curConv:" + root) || k.startsWith("schutz.session:" + root)) {
          localStorage.removeItem(k);
        }
      }
    } catch { /* 저장소를 못 써도 데모는 돈다 — 지난 장면이 남을 뿐이다 */ }
  }

  private _demoProposalId: string | null = null;

  /** 시연 건너뛰기 — 끄는 게 아니라 **마무리로 보낸다.**
   *
   *  그냥 종료하면 "준비됐습니다" 와 투어 선택을 못 보고 끝난다. 그건 건너뛰기가 아니라
   *  중단이다. 확대해 둔 글자 크기도 여기서 되돌린다 — demoZoom 은 _demoAbort 를 보면
   *  즉시 반환하므로, 그대로 두면 커진 채로 남는다. */
  private skipDemo() {
    if (this._demoAbort) return;
    this._demoAbort = true;
    this._demoTyping = false;
    try {
      const ed = paneRegistry.panes.get(DEMO_FILE)?.editor;
      ed?.updateOptions({ fontSize: getEditorPrefs().fontSize });
    } catch { /* 페인이 없으면 되돌릴 것도 없다 */ }
    this.setState({ demoCaption: null, demoRunning: false, askRun: null, openingPhase: "outro" });
  }
  /** 데모가 코드를 타이핑하는 중인가 — animateEditIntoModel 이 배수를 여기서 읽는다. */
  private _demoTyping = false;

  /** 데모용 확대. **설정을 건드리지 않고** 살아 있는 에디터에만 건다.
   *
   *  applyEditorPref 로 하면 paneVer 가 올라가 Monaco 페인이 리마운트되고, 그 순간
   *  타이핑 애니메이션이 통째로 날아간다. 게다가 사용자 설정을 데모가 덮어쓰게 되어
   *  중간에 빠져나가면 글자 크기가 커진 채로 남는다. updateOptions 는 둘 다 피한다 —
   *  살아 있는 인스턴스에만 적용되고, 페인이 다시 뜨면 저장된 설정으로 돌아온다. */
  private async demoZoom(rel: string, from: number, to: number, ms: number) {
    const ed = paneRegistry.panes.get(rel)?.editor;
    if (!ed || from === to) return;
    if (reducedMotion()) { try { ed.updateOptions({ fontSize: to }); } catch { /* 언마운트됨 */ } return; }
    const t0 = performance.now();
    for (;;) {
      if (this._demoAbort) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      // 부드럽게 붙는 곡선 — 선형이면 확대가 기계적으로 보인다
      const e = 1 - Math.pow(1 - k, 3);
      try { ed.updateOptions({ fontSize: from + (to - from) * e }); } catch { return; }
      if (k >= 1) return;
      await this.demoSleep(16);
    }
  }

  /** 데모 종료 — 원래 프로젝트로 돌려놓는다. */
  private finishDemo(wantsTour: boolean, wantsImport = false) {
    this._demoAbort = true;
    const prev = this._demoPrevRoot;
    this._demoPrevRoot = null;
    this._demoProposalId = null;
    this.setState({ openingPhase: "off", demoCaption: null, demoRunning: false });
    // 남은 #/opening 을 지운다. 그대로 두면 새로고침할 때마다 오프닝이 다시 뜬다.
    try { if (window.location.hash.startsWith("#/opening")) window.location.hash = "#/"; } catch { /* ignore */ }
    try {
      localStorage.setItem("schutz.openingSeen", "1");
      localStorage.setItem("schutz.onboarded", "1");
    } catch { /* ignore */ }

    const after = () => {
      // 오프닝에서 "골라서 가져오기" 를 골랐으면 그게 먼저다 — 방금 한 선택이고,
      // 투어나 설정보다 사용자가 기다리고 있는 것이다. 목록은 여기서 처음 읽는다.
      //
      // 둘 다 골랐을 수 있다(가져오기는 세팅에서, 투어는 마무리 화면에서 따로 묻는다).
      // 그때 투어를 그냥 버리면 사용자가 누른 버튼이 아무 일도 안 한 것이 된다. 가져오기
      // 화면이 닫히는 순간으로 미룬다 — 스포트라이트와 모달이 겹치지도 않는다.
      if (wantsImport) {
        this._tourAfterImport = wantsTour;
        this.qt(() => this.openImport(), 700);
        return;
      }
      if (wantsTour) this.qt(() => this.startTour(), 900);
      else if (this.configuredAgents().length === 0 && !this.state.cliAgents.claude?.ok && !this.state.cliAgents.codex?.ok) {
        // 오프닝은 테마만 받았다. 여기서 안 이어주면 첫 실행 사용자가 AI 를 연결할
        // 경로가 아예 없다 — 설정 모달 맨 위가 로그인/키 섹션이라 그대로 쓴다.
        this.qt(() => this.openO({ settingsOpen: true }), 700);
      }
    };
    // 열려 있던 프로젝트가 있으면 되돌린다. 데모가 남의 작업 자리를 뺏으면 안 된다.
    if (prev && prev !== this.state.workspace?.root) void this.openWorkspacePath(prev).then(after);
    else after();
  }

  // ── 사용법 스포트라이트 투어 ─────────────────────────────────────────────
  private _tourCardH = 168;   // 첫 렌더 추정치. 마운트 직후 실측으로 대체된다.
  private _tourResize = () => { if (this.state.tourOpen) this.forceUpdate(); };
  /** 창이 짧아지면 대화가 트리를 밀어내므로 상한을 다시 적용한다. */
  private _clampChatOnResize = () => {
    const avail = this._leftCol?.clientHeight;
    if (!avail) return;
    const h = this.clampChatH(this.state.chatH, avail);
    if (h !== this.state.chatH) this.setState({ chatH: h });
  };
  /** 이번 투어에서 단계를 하나라도 실제로 보여줬는가 — 끝났을 때 완주인지 불발인지 가른다. */
  private _tourShown = false;
  startTour() {
    window.addEventListener("resize", this._tourResize);
    // 중간에 창을 닫았으면 그 단계부터. 인덱스가 아니라 id 로 찾는다 — 단계 순서가
    // 바뀌어도 엉뚱한 곳에서 재개되지 않게.
    let from = 0;
    try {
      const saved = localStorage.getItem("schutz.tourStep");
      const at = saved ? TOUR_STEPS.findIndex(x => x.id === saved) : -1;
      if (at > 0) from = at;
    } catch { /* */ }
    this._tourShown = false;
    // 다른 오버레이/모달은 모두 닫고 시작 — 투어(z240)가 덮어 가려진 채로 남지 않도록
    this.setState({
      tourOpen: true, tourStep: from, openMenu: null, projOpen: false,
      settingsOpen: false, cmdOpen: false, quickOpen: false, symOpen: false, searchOpen: false,
      aboutOpen: false, commandsOpen: false, mcpOpen: false, usageOpen: false, keysOpen: false,
      extDetail: null, extPanel: null, askClose: null, closing: [],
      // 재개 지점을 tourStep 으로 바로 밀어넣지 않고 tourStepTo 를 거친다. 직접 넣으면
      // when/before/앵커 검증을 통째로 건너뛰어, 앵커가 없는 단계에서 재개될 때 아무것도
      // 강조되지 않는 빈 카드가 뜬다.
    }, () => this.tourStepTo(from, 1));
  }
  /** 투어가 앱을 건드리는 유일한 통로. tour.ts 가 App 을 import 하지 않게 한다. */
  private tourHost(): TourHost {
    return {
      showLeftTab: tab => this.setState({ leftTab: tab } as any),
      showTerminal: open => { if (this.state.termOpen !== open) this.toggleTerm(); },
      hasWorkspace: () => !!this.state.workspace,
      mode: () => this.state.uiMode,
      showAsideTab: tab => this.setState({ asideTab: tab }),
      // 시트가 닫혀 있으면 오른쪽 열이 아예 없어 앵커 크기가 0 이 된다. 데모 파일이
      // 없을 수도 있으니 지금 열려 있는 것 중 하나를, 그것도 없으면 그냥 넘어간다.
      showSide: open => {
        if (!open) { if (this.state.sheetOpen) this.closeSheet(); return; }
        if (this.state.sheetOpen) return;
        const rel = this.allOpen()[0] ?? this.state.proposals[this.state.proposals.length - 1]?.rel;
        if (rel) this.openSheet(rel);
      },
    };
  }

  /**
   * dir 은 건너뛸 방향 — 뒤로 가다가 조건에 안 맞는 단계를 만나면 계속 뒤로 가야지
   * 앞으로 튕기면 안 된다.
   */
  private tourStepTo(i: number, dir: 1 | -1 = 1) {
    if (i < 0) return;
    // 끝까지 갔는데 한 단계도 못 보여줬다면 완주가 아니라 불발이다. 예전엔 둘 다
    // endTour 로 흘러가서, 앵커가 하나도 없는 상황에서 투어를 한 번 열었다는 이유만으로
    // tutorialDone 이 영구히 기록되고 자동 시작이 두 번 다시 안 뜨는 상태가 됐다.
    if (i >= TOUR_STEPS.length) { if (this._tourShown) this.endTour(); else this.abortTour(); return; }
    const step = TOUR_STEPS[i];
    const host = this.tourHost();
    if (step.when && !step.when(host)) { this.tourStepTo(i + dir, dir); return; }
    step.before?.(host);
    this.setState({ tourStep: i }, () => {
      // before 가 연 패널이 실제로 그려질 한 프레임을 준다. 그래도 앵커가 없으면
      // 건너뛴다 — 예전엔 조용히 중앙 카드로 퇴화해서 아무것도 강조되지 않았다.
      requestAnimationFrame(() => {
        if (step.anchor && !anchorRect(step.anchor)) { this.tourStepTo(i + dir, dir); return; }
        this._tourShown = true;
        try { localStorage.setItem("schutz.tourStep", step.id); } catch { /* */ }
      });
    });
  }

  /** 완주(또는 사용자가 그만 보겠다고 닫음) — 다시 자동으로 뜨지 않는다. */
  endTour() {
    window.removeEventListener("resize", this._tourResize);
    try {
      localStorage.setItem("schutz.tutorialDone", "1");
      localStorage.removeItem("schutz.tourStep");   // 완주했으면 이어보기 지점도 지운다
    } catch { /* ignore */ }
    this.setState({ tourOpen: false });
  }

  /** 불발 — 보여줄 수 있는 단계가 하나도 없었다. tutorialDone 을 **쓰지 않는다**:
   *  못 본 것을 봤다고 기록하면 다시는 볼 기회가 없어진다. */
  private abortTour() {
    window.removeEventListener("resize", this._tourResize);
    try { localStorage.removeItem("schutz.tourStep"); } catch { /* ignore */ }
    this.setState({ tourOpen: false });
    this.toast("error", t("tour.noSteps"));
  }
  renderTour() {
    if (!this.state.tourOpen) return null;
    const cur = Math.min(Math.max(0, this.state.tourStep), TOUR_STEPS.length - 1);
    const step = TOUR_STEPS[cur];
    const rect = anchorRect(step.anchor);
    // 카드 높이는 실제로 재서 쓴다. 예전엔 168 로 박아놔서 문장이 긴 독일어·일본어에선
    // 배치 계산이 실제 카드보다 작게 잡혀 화면 밖으로 밀려났다.
    const cardW = 330, cardH = this._tourCardH;
    const pos = cardPos(rect, cardW, cardH, step.placement);
    // 진행 표시는 **지금 모양에서 보게 될** 단계만 센다. TOUR_STEPS.length 는 두 트랙을
    // 합친 수라 어느 모드에서도 도달하지 않는다.
    const visTotal = visibleSteps(this.tourHost()).length;
    const visPos = visiblePos(this.tourHost(), step.id);
    const isLast = cur === TOUR_STEPS.length - 1;
    const tourBtn: React.CSSProperties = { padding: "5px 14px", fontSize: 11.5, borderRadius: 7, cursor: "pointer", fontFamily: SUIT };
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 240 }} aria-modal="true" role="dialog"
        onClick={e => { if (e.target === e.currentTarget) { /* 배경 클릭은 무시(오작동 방지) */ } }}>
        {rect
          ? <div className="sz-tour-hole" style={{ position: "fixed", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 9, pointerEvents: "none" }} />
          : <div className="sz-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.58)" }} />}
        <div className="sz-pop" onClick={e => e.stopPropagation()}
          ref={el => {
            if (!el) return;
            const h = el.offsetHeight;
            // 2px 이상 달라질 때만 다시 그린다 — 안 그러면 반올림 오차로 무한 루프.
            if (Math.abs(h - this._tourCardH) > 2) { this._tourCardH = h; this.forceUpdate(); }
          }}
          style={{ position: "fixed", left: pos.left, top: pos.top, width: cardW, background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 16, fontFamily: SUIT }}>
          {/* 뼈대 그림 — 첫 실행에서 모드를 고를 때 쓰는 도안과 같은 어법이다.
              같은 말(여기가 화면의 어디인가)을 두 번 다르게 그리지 않는다. */}
          {step.figure && (
            <div style={{ marginBottom: 11, border: "1px solid var(--w08)", borderRadius: 8, overflow: "hidden" }}>
              <TourFigure region={step.figure as FigureRegion} />
            </div>
          )}
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg)", marginBottom: 7 }}>{t(step.titleKey)}</div>
          <div style={{ fontSize: 12, color: "var(--fg-sub)", lineHeight: 1.6 }}>{t(step.bodyKey)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 15 }}>
            {/* 예전엔 점이었는데 14단계에선 안 읽힌다. 정의만 해두고 안 쓰던
                tour.progress 키를 여기서 쓴다. */}
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 54, height: 3, borderRadius: 2, background: "var(--w12)", overflow: "hidden" }}>
                <div style={{ width: `${(visPos / Math.max(1, visTotal)) * 100}%`, height: "100%", background: "var(--accent)", transition: "width var(--dur) var(--ease)" }} />
              </div>
              <span style={{ fontSize: 10.5, color: "var(--fg-dim)", fontVariantNumeric: "tabular-nums" }}>
                {t("tour.progress", { cur: visPos, total: visTotal })}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button className="hvDim" onClick={() => this.endTour()} style={{ background: "transparent", border: "none", color: "var(--fg-dim)", fontSize: 11.5, cursor: "pointer", padding: "5px 8px", borderRadius: 6, fontFamily: SUIT }}>{t("common.skip")}</button>
            {cur > 0 && <button className="hv08" onClick={() => this.tourStepTo(cur - 1, -1)} style={{ ...tourBtn, background: "transparent", border: "1px solid var(--w10)", color: "var(--fg-sub)" }}>{t("common.prev")}</button>}
            <button className="hvAccent" onClick={() => this.tourStepTo(cur + 1)} style={{ ...tourBtn, background: "var(--accent)", color: "var(--on-accent)", border: "none", fontWeight: 700 }}>{isLast ? t("common.done") : t("common.next")}</button>
          </div>
        </div>
      </div>
    );
  }
  async refreshMcp() {
    const [servers, discovered] = await Promise.all([
      mcp.listServers(),
      mcp.discover(this.state.workspace?.root ?? null),
    ]);
    await mcp.refreshTools();
    this.setState({ mcpServers: servers, mcpDiscovered: discovered });
  }
  private async mcpAct(name: string, fn: () => Promise<any>) {
    this.setState({ mcpBusy: name });
    try { await fn(); } finally { this.setState({ mcpBusy: "" }); await this.refreshMcp(); }
  }
  mcpStartServer(name: string) { void this.mcpAct(name, async () => { const r = await mcp.startServer(name); if (!r.ok) this.toast("error", t("sc5.mcpStartFail", { name, reason: r.reason || "" })); else this.toast("ok", t("sc5.mcpStarted", { name })); }); }
  mcpStopServer(name: string) { void this.mcpAct(name, () => mcp.stopServer(name)); }
  mcpRemoveServer(name: string) { void this.mcpAct(name, () => mcp.removeServer(name)); }
  mcpImport(d: { name: string; command: string; args: string[]; env: Record<string, string> }) {
    void this.mcpAct(d.name, async () => {
      const r = await mcp.addServer(d.name, { command: d.command, args: d.args, env: d.env });
      if (!r.ok) { this.toast("error", t("sc5.mcpAddFail", { error: r.error || "" })); return; }
      const s = await mcp.startServer(d.name);
      this.toast(s.ok ? "ok" : "error", s.ok ? t("sc5.mcpImportedStarted", { name: d.name }) : t("sc5.mcpAddedStartFail", { name: d.name }));
    });
  }
  mcpAddJson() {
    let parsed: any;
    try { parsed = JSON.parse(this.state.mcpJson.trim()); } catch { this.toast("error", t("sc5.mcpJsonParseFail")); return; }
    // { "name": {command,args,env} } 또는 { mcpServers: {...} } 또는 {command,args} 단일
    let entries: [string, any][] = [];
    if (parsed.mcpServers) entries = Object.entries(parsed.mcpServers);
    else if (parsed.command) entries = [[parsed.name || "server", parsed]];
    else entries = Object.entries(parsed);
    if (!entries.length) { this.toast("error", t("sc5.mcpNoServerDef")); return; }
    void this.mcpAct("", async () => {
      for (const [name, cfg] of entries) {
        if (!cfg || typeof cfg.command !== "string") continue;
        await mcp.addServer(name, { command: cfg.command, args: cfg.args || [], env: cfg.env || {} });
        await mcp.startServer(name);
      }
      this.setState({ mcpJson: "" });
      this.toast("ok", t("sc5.mcpServersAdded", { n: entries.length }));
    });
  }

  /** 프로그램 분석 → MCP 서버 생성 (분석 → AI 생성 → 기록 → 등록 → 시작) */
  async mcpGenerate() {
    const g = this.state.mcpGen;
    if (!g || !window.schutz) return;
    const configured = this.configuredAgents();
    const pref = getManagerId();
    const managerId = configured.includes(pref) ? pref : (configured.includes("claude") ? "claude" : configured[0]);
    if (!managerId) { this.toast("error", t("sc5.mcpNeedAi")); return; }
    const provider = this.providers[managerId];

    const setStatus = (status: string) => this.setState(s => ({ mcpGen: s.mcpGen ? { ...s.mcpGen, status } : null }));
    this.setState({ mcpBusy: "__gen" });
    let mcpGenRunId = "";
    try {
      // 1) 분석
      setStatus(t("sc5.mcpAnalyzing"));
      let analysis = "", name = "custom";
      if (g.mode === "cli") {
        const cmd = g.input.trim();
        name = mcpGen.slug(cmd);
        const h = await window.schutz.cliHelp(cmd);
        if (!h.ok && !h.text) { this.toast("error", t("sc5.mcpCliAnalyzeFail", { error: h.error || "" })); return; }
        analysis = `명령: ${cmd}\n\n--help 출력:\n${h.text || ""}`;
      } else if (g.mode === "project") {
        const root = g.input.trim() || this.state.workspace?.root;
        if (!root) { this.toast("error", t("sc5.mcpNeedProject")); return; }
        name = mcpGen.slug(root.split(/[\\/]/).pop() || "project");
        const tree = await window.schutz.readTree(root);
        const files = tree.entries.filter(e => !e.dir).slice(0, 60).map(e => e.rel).join("\n");
        let key = "";
        for (const f of ["package.json", "README.md", "pyproject.toml", "Cargo.toml"]) {
          if (tree.entries.some(e => e.rel === f)) { try { key += `\n--- ${f} ---\n` + (await window.schutz.readFile(root, f)).slice(0, 4000); } catch { /* */ } }
        }
        analysis = `프로젝트: ${tree.name}\n\n파일:\n${files}\n${key}`;
      } else if (g.mode === "openapi") {
        const src = g.input.trim();
        name = mcpGen.slug("api-" + (src.replace(/^https?:\/\//, "").split(/[\/?]/)[0] || "openapi"));
        let spec = "";
        if (/^https?:/i.test(src)) { const r = await window.schutz.mcpFetchSpec(src); if (!r.ok) { this.toast("error", t("sc5.mcpSpecFetchFail", { error: r.error || r.status })); return; } spec = r.text || ""; }
        else if (this.state.workspace) { try { spec = await window.schutz.readFile(this.state.workspace.root, src); } catch { this.toast("error", t("sc5.mcpLocalSpecFail")); return; } }
        analysis = `OpenAPI 스펙 (원본: ${src}):\n${spec}`;
      } else {
        name = mcpGen.slug(g.input.trim().split(/\s+/).slice(0, 3).join("-") || "custom");
        analysis = g.input.trim();
      }

      // 2) AI 생성 (단발, 도구 없음)
      setStatus(t("sc5.mcpGenerating", { name }));
      const system = mcpGen.genSystem();
      const transcript: NeutralMsg[] = [{ role: "user", text: mcpGen.genUser(g.mode, name, analysis) }];
      const abort = new AbortController();
      // role "system" 으로 등록 — 예전의 "__mcpgen" 매직 키를 대체한다
      const genRun = this.engine.runs.start({ agentId: "__mcpgen", role: "system", cancel: () => abort.abort() });
      mcpGenRunId = genRun.runId;
      this.abortCtls.set(mcpGenRunId, abort);
      let out = "";
      for await (const ev of provider.streamAgentTurn({ transcript, system, tools: undefined, signal: abort.signal })) {
        if (ev.type === "text") out += ev.delta;
        else if (ev.type === "usage") this.bumpAgent(managerId, ev.inputTokens, ev.outputTokens);
        else if (ev.type === "error") { this.toast("error", t("sc5.mcpGenError", { message: ev.message })); return; }
      }
      this.endInlineRun(mcpGenRunId, "done");
      const code = mcpGen.extractCode(out);
      if (!code || code.length < 80) { this.toast("error", t("sc5.mcpEmptyCode")); return; }

      // 3) 기록 → 4) 등록 → 5) 시작
      setStatus(t("sc5.mcpWritingStarting"));
      const w = await window.schutz.mcpWriteServer(name, code);
      if (!w.ok || !w.path) { this.toast("error", t("sc5.mcpWriteFail", { error: w.error || "" })); return; }
      // overwrite:true — 같은 이름 재생성은 의도된 교체(mcpAdd 가 실행 중 옛 인스턴스 kill → 새 코드로 respawn)
      const added = await mcp.addServer(name, { command: "node", args: [w.path], overwrite: true });
      if (!added.ok) { this.toast("error", t("sc5.mcpAddFail", { error: added.error || "" })); return; }
      const started = await mcp.startServer(name);
      await this.refreshMcp();
      if (started.ok) this.toast("ok", t("sc5.mcpCreatedStarted", { name, count: started.tools?.length ?? 0 }));
      else this.toast("error", t("sc5.mcpCreatedStartFail", { name, reason: started.reason || "" }));
      this.setState({ mcpGen: null });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") this.toast("info", t("sc5.mcpGenCancelled"));
      else this.toast("error", t("sc5.mcpGenFail", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      this.endInlineRun(mcpGenRunId, "done");
      this.setState({ mcpBusy: "" });
    }
  }

  /** MCP 관리 모달 — 설치된 서버 · 가져오기 · JSON 추가 · 생성 */
  renderMcp() {
    if (!this.state.mcpOpen && !this.isClosing("mcp")) return null;
    const s = this.state;
    const busy = (n: string) => s.mcpBusy === n;
    const srcLabel: Record<string, string> = { "claude:user": "Claude", "claude:project": t("mcpui.srcClaudeProject"), "mcp.json": ".mcp.json", "codex": "Codex" };
    const toImport = s.mcpDiscovered.filter(d => !d.added && !s.mcpServers.some(x => x.name === d.name));
    return this.modalShell("mcp", t("mcpui.title"), () => this.closeOverlay("mcp", { mcpOpen: false }), (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 11.5, color: "var(--fg-sub2)", lineHeight: 1.5 }}>
          {t("mcpui.intro")}
        </div>

        {/* 생성 */}
        <div>
          <div style={sectHdr}>{t("mcpui.createNew")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {([["cli", t("mcpui.modeCli")], ["project", t("mcpui.modeProject")], ["openapi", "OpenAPI"], ["generic", t("mcpui.modeGeneric")]] as const).map(([mode, label]) => (
              <button key={mode} className="hv08" onClick={() => this.setState({ mcpGen: { mode, input: mode === "project" && s.workspace ? s.workspace.root : "", status: "" } })}
                style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "1px solid var(--w10)", background: s.mcpGen?.mode === mode ? "var(--accent-soft)" : "transparent", color: "var(--fg-sub)" }}>{label}</button>
            ))}
          </div>
          {s.mcpGen && this.renderMcpGen()}
        </div>

        {/* 설치된 서버 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={sectHdr}>{t("mcpui.installedServers")}</span><div style={{ flex: 1 }} />
            <button className="hv08" onClick={() => void this.refreshMcp()} style={{ padding: "3px 8px", fontSize: 10, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub)" }}>{t("common.refresh")}</button>
          </div>
          {s.mcpServers.length === 0 && <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "6px 2px" }}>{t("mcpui.noInstalled")}</div>}
          {s.mcpServers.map(sv => (
            <div key={sv.name} className="sz-in" style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--w06)", marginTop: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: sv.running ? "var(--ok)" : "var(--fg-dim3)", flex: "none", boxShadow: sv.running ? "0 0 6px color-mix(in srgb, var(--ok) 60%, transparent)" : "none" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{sv.name}</div>
                <div style={{ fontSize: 10, color: "var(--fg-dim)", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sv.command} {sv.args.join(" ")}</div>
              </div>
              {sv.running && <span style={{ flex: "none", fontSize: 10, color: "var(--accent-hi)" }}>{t("mcpui.toolCount", { n: sv.tools })}</span>}
              <button className="hv08" disabled={busy(sv.name)} onClick={() => sv.running ? this.mcpStopServer(sv.name) : this.mcpStartServer(sv.name)}
                style={{ flex: "none", padding: "3px 11px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: sv.running ? "#CE9A9A" : "var(--accent-hi)" }}>{busy(sv.name) ? "…" : sv.running ? t("mcpui.stop") : t("mcpui.start")}</button>
              <button className="hvDim" title={t("mcpui.remove")} onClick={() => this.mcpRemoveServer(sv.name)} style={{ flex: "none", width: 22, height: 22, border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 13, borderRadius: 5 }}>✕</button>
            </div>
          ))}
        </div>

        {/* 가져오기 */}
        <div>
          <div style={sectHdr}>{t("mcpui.importFrom")}</div>
          {toImport.length === 0 && <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "6px 2px" }}>{t("mcpui.noImport")}</div>}
          {toImport.map(d => (
            <div key={d.source + d.name} className="sz-in" style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 8, marginTop: 6 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{d.name}</span>
                  <span style={{ fontSize: 9, color: "var(--fg-dim)", border: "1px solid var(--w10)", borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{srcLabel[d.source] || d.source}</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-dim)", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.command} {d.args.join(" ")}</div>
              </div>
              <button className="hv08" disabled={busy(d.name)} onClick={() => this.mcpImport(d)} style={{ flex: "none", padding: "4px 12px", fontSize: 11.5, fontWeight: 600, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "none", background: "var(--accent)", color: "var(--on-accent)" }}>{busy(d.name) ? "…" : t("mcpui.import")}</button>
            </div>
          ))}
        </div>

        {/* JSON 추가 */}
        <div>
          <div style={sectHdr}>{t("mcpui.addJson")}</div>
          <textarea value={s.mcpJson} onChange={e => this.setState({ mcpJson: e.target.value })}
            placeholder={'{ "my-server": { "command": "npx", "args": ["-y", "some-mcp"] } }'}
            style={{ width: "100%", height: 68, marginTop: 6, resize: "vertical", background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 8, padding: "8px 10px", color: "var(--fg)", fontSize: 11, fontFamily: MONO, outline: "none" }} />
          <button className="hvAccent" onClick={() => this.mcpAddJson()} disabled={!s.mcpJson.trim()} style={{ marginTop: 6, height: 30, padding: "0 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: s.mcpJson.trim() ? "pointer" : "default", borderRadius: 8, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("mcpui.addStart")}</button>
        </div>
      </div>
    ), 600);
  }

  /** 생성 마법사 — P32D 에서 실제 분석·생성 로직 채움 */
  renderMcpGen(): React.ReactNode {
    const g = this.state.mcpGen!;
    const ph: Record<string, string> = { cli: t("mcpui.phCli"), project: t("mcpui.phProject"), openapi: t("mcpui.phOpenapi"), generic: t("mcpui.phGeneric") };
    return (
      <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg-card)", border: "1px solid var(--w06)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {g.mode === "generic" || g.mode === "project"
          ? <textarea value={g.input} onChange={e => this.setState({ mcpGen: { ...g, input: e.target.value } })} placeholder={ph[g.mode]} style={{ width: "100%", height: 54, resize: "vertical", background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 7, padding: "7px 10px", color: "var(--fg)", fontSize: 12, fontFamily: g.mode === "project" ? MONO : SUIT, outline: "none" }} />
          : <input value={g.input} onChange={e => this.setState({ mcpGen: { ...g, input: e.target.value } })} placeholder={ph[g.mode]} style={{ width: "100%", height: 32, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 7, padding: "0 11px", color: "var(--fg)", fontSize: 12, fontFamily: MONO, outline: "none" }} />}
        {g.status && <div style={{ fontSize: 11, color: "var(--fg-sub2)" }}>{g.status}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="hvAccent" onClick={() => void this.mcpGenerate()} disabled={!!this.state.mcpBusy || (g.mode !== "project" && !g.input.trim())}
            style={{ height: 30, padding: "0 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("mcpui.analyzeGenerate")}</button>
          <button className="hv05" onClick={() => this.setState({ mcpGen: null })} style={{ height: 30, padding: "0 12px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("mcpui.cancel")}</button>
        </div>
      </div>
    );
  }

  /** 명령어 레퍼런스 모달 (/help) — 슬래시 명령을 오리진별로 (내장 + 발견된 커스텀) */
  renderCommands() {
    if (!this.state.commandsOpen && !this.isClosing("commands")) return null;
    const ca = this.state.cliAgents;
    const originOk = (o: string) => o === "schutz" || (o === "claude" && !!ca.claude?.ok) || (o === "codex" && !!ca.codex?.ok);
    const builtin = SLASH_COMMANDS.filter(c => originOk(c.origin));
    const discovered = (this.state.agentCommands ?? []).filter(c => originOk(c.origin));
    const groups: { title: string; color: string; items: { cmd: string; desc: string; badge?: string }[] }[] = [
      { title: "Schutz", color: ORIGIN_COLOR.schutz, items: builtin.filter(c => c.origin === "schutz").map(c => ({ cmd: c.cmd + (c.argHint ? " " + t(c.argHint) : ""), desc: t(c.desc) })) },
      { title: "Claude Code", color: ORIGIN_COLOR.claude, items: [
        ...builtin.filter(c => c.origin === "claude").map(c => ({ cmd: c.cmd, desc: t(c.desc) })),
        ...discovered.filter(c => c.origin === "claude").map(c => ({ cmd: "/" + c.name + (c.argHint ? " " + c.argHint : ""), desc: c.description || t("cmds.customCommand"), badge: c.scope === "project" ? t("cmds.scopeProject") : t("cmds.scopeUser") })),
      ] },
      { title: "Codex", color: ORIGIN_COLOR.codex, items: [
        ...builtin.filter(c => c.origin === "codex").map(c => ({ cmd: c.cmd, desc: t(c.desc) })),
        ...discovered.filter(c => c.origin === "codex").map(c => ({ cmd: "/" + c.name + (c.argHint ? " " + c.argHint : ""), desc: c.description || t("cmds.customPrompt"), badge: t("cmds.scopeUser") })),
      ] },
    ];
    return this.modalShell("commands", t("cmds.title"), () => this.closeOverlay("commands", { commandsOpen: false }), (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 11.5, color: "var(--fg-sub2)", lineHeight: 1.5 }}>{t("cmds.hintBefore")}<code style={{ fontFamily: MONO, background: "var(--w06)", borderRadius: 4, padding: "1px 5px" }}>/</code>{t("cmds.hintAfter")}</div>
        {groups.filter(g => g.items.length).map(g => (
          <div key={g.title}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: g.color }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{g.title.toUpperCase()}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {g.items.map((it, i) => (
                <div key={it.cmd + i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 8px", borderRadius: 6, background: i % 2 ? "var(--w03)" : "transparent" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg)", flex: "none", minWidth: 150 }}>{it.cmd}</span>
                  <span style={{ fontSize: 11.5, color: "var(--fg-sub2)", flex: 1 }}>{it.desc}</span>
                  {it.badge && <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", border: "1px solid var(--w10)", borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{it.badge}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ), 560);
  }

  /** 확장 상세(정보) 뷰 — VS Code 마켓 상세처럼 (아이콘·통계·README) */
  renderExtDetail() {
    const d = this.state.extDetail;
    if (!d) return null;
    const out = this.isClosing("extDetail");
    const closeDetail = () => this.closeOverlay("extDetail", { extDetail: null });
    const id = d.namespace + "." + d.name;
    const installed = this.state.extList.some(e => e.id === id);
    const installing = this.state.extInstalling.includes(id);
    const stat = (label: string, val: string) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 9.5, color: "var(--fg-dim)" }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--fg-sub)", fontFamily: MONO }}>{val}</span>
      </div>
    );
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeDetail} style={{ position: "fixed", inset: 0, zIndex: 196, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(d.displayName || d.name)} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: "92%", height: "84%", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)", fontFamily: SUIT, overflow: "hidden" }}>
          {/* 헤더 */}
          <div style={{ display: "flex", gap: 14, padding: "18px 20px", borderBottom: "1px solid var(--w06)" }}>
            {d.icon
              ? <img src={d.icon} width={56} height={56} style={{ flex: "none", borderRadius: 10, objectFit: "contain", background: "var(--w05)" }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              : <div style={{ flex: "none", width: 56, height: 56, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-hi)", fontSize: 24, fontWeight: 800 }}>{(d.displayName || d.name).slice(0, 1).toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>{d.displayName}</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-dim)", marginTop: 2, fontFamily: MONO }}>{d.namespace}.{d.name}{d.version ? " · v" + d.version : ""}</div>
              {!d.loading && <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                {installed
                  ? <span style={{ fontSize: 11.5, color: "var(--accent-hi)", fontWeight: 700, alignSelf: "center" }}>{t("extui.installed")}</span>
                  : <button className="hv08" disabled={installing} onClick={() => void this.extInstall(d.namespace, d.name)} style={{ padding: "6px 18px", fontSize: 12, fontWeight: 600, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "none", background: "var(--accent)", color: "var(--on-accent)", opacity: installing ? 0.6 : 1 }}>{installing ? t("extui.installing") : t("extui.install")}</button>}
              </div>}
            </div>
            <button className="hvDim" onClick={closeDetail} style={{ flex: "none", width: 26, height: 26, border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 16, borderRadius: 6, alignSelf: "flex-start" }}>✕</button>
          </div>
          {d.loading
            ? <div style={{ flex: 1, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {[70, 92, 60, 88, 80, 40].map((w, i) => <div key={i} className="sz-skel" style={{ height: i === 0 ? 18 : 12, width: w + "%" }} />)}
            </div>
            : <>
              {/* 통계 */}
              <div style={{ display: "flex", gap: 26, padding: "12px 20px", borderBottom: "1px solid var(--w05)", flexWrap: "wrap" }}>
                {stat(t("extd.download"), this.fmtCount(d.downloadCount))}
                {d.rating > 0 && stat(t("extd.rating"), "★ " + d.rating.toFixed(1) + (d.reviewCount ? ` (${d.reviewCount})` : ""))}
                {d.license && stat(t("extd.license"), d.license)}
                {stat(t("extd.publisher"), d.publishedBy || d.namespace)}
                {d.repository && stat(t("extd.repository"), String(d.repository).replace(/^https?:\/\//, "").slice(0, 34))}
              </div>
              {(d.categories?.length || d.tags?.length) ? <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "10px 20px 0" }}>
                {[...(d.categories || []), ...(d.tags || [])].slice(0, 10).map((t: string, i: number) => <span key={i} style={{ fontSize: 9.5, color: "var(--fg-sub2)", background: "var(--w05)", borderRadius: 4, padding: "2px 7px" }}>{t}</span>)}
              </div> : null}
              {/* README */}
              <div className="ext-readme" style={{ flex: 1, overflowY: "auto", padding: "14px 22px", color: "var(--fg-sub)", fontSize: 13, lineHeight: 1.65 }}
                dangerouslySetInnerHTML={{ __html: d.readme ? mdToHtml(d.readme) : `<p style='color:var(--fg-dim)'>${t("extd.noReadme")}</p>` }} />
            </>}
        </div>
      </div>
    );
  }

  /** 확장 기여 패널 (ui.showPanel) — 확장은 신뢰 코드로 간주 */
  renderExtPanel() {
    const p = this.state.extPanel;
    if (!p && !this.isClosing("extPanel")) return null;
    const out = this.isClosing("extPanel");
    const closeExtPanel = () => this.closeOverlay("extPanel", { extPanel: null });
    if (!p) return null;
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeExtPanel}
        style={{ position: "fixed", inset: 0, zIndex: 190, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(p.title)} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()}
          style={{ width: 520, maxWidth: "90%", maxHeight: "80%", overflow: "auto", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--w08)" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{p.title}</span>
            <button onClick={closeExtPanel} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <div style={{ color: "var(--fg)" }} dangerouslySetInnerHTML={{ __html: p.html }} />
        </div>
      </div>
    );
  }

  renderSymbolPalette() {
    const s = this.state;
    if (!s.symOpen && !this.isClosing("sym")) return null;
    const out = this.isClosing("sym");
    const closeSym = () => this.closeOverlay("sym", { symOpen: false });
    const list = s.symResults;
    const sel = Math.min(s.symSel, Math.max(0, list.length - 1));
    const kindName = (k: number) => monaco.languages.SymbolKind[k] ?? "";
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeSym}
        style={{ position: "fixed", inset: 0, zIndex: 180, background: "rgba(0,0,0,.25)", display: "flex", justifyContent: "center", paddingTop: 90 }}>
        <div className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 620, maxWidth: "90%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input autoFocus value={s.symQuery}
            onChange={e => this.runSymbolSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ symSel: (sel + 1) % Math.max(1, list.length) }); }
              else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ symSel: (sel - 1 + list.length) % Math.max(1, list.length) }); }
              else if (e.key === "Enter" && list[sel]) { this.jumpToSymbol(list[sel]); }
              else if (e.key === "Escape") closeSym();
            }}
            placeholder={t("palette.symPlaceholder")}
            style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--w08)", height: 42, padding: "0 16px", color: "var(--fg)", fontSize: 13.5, fontFamily: SUIT, outline: "none" }} />
          <div style={{ maxHeight: 340, overflowY: "auto", padding: 4 }}>
            {s.symLoading && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.searching")}</div>}
            {!s.symLoading && s.symQuery.trim() && list.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.noSymbols")}</div>}
            {!s.symQuery.trim() && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("palette.symPrompt")}</div>}
            {list.map((sym, i) => (
              <div key={sym.uri + ":" + sym.range.startLineNumber + ":" + i} ref={i === sel ? this._selRowRef : undefined}
                onMouseDown={e => { e.preventDefault(); this.jumpToSymbol(sym); }}
                onMouseEnter={() => this.setState({ symSel: i })}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 12px", borderRadius: 6, cursor: "pointer", background: i === sel ? "var(--accent-soft)" : "transparent" }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--fg-dim)", minWidth: 62 }}>{kindName(sym.kind)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: "var(--fg)" }}>{sym.name}</span>
                {sym.container && <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim)" }}>{sym.container}</span>}
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{this.uriToRel(sym.uri)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /** 에디터 설정 변경 → 저장 + 열린 페인 재생성(폰트/키맵 반영) */
  private applyEditorPref(patch: Partial<EditorPrefs>) {
    setEditorPrefs(patch);
    if (patch.uiFont || patch.codeFont) applyUiFont(); // 저장 후 --font-ui/--font-code 재적용(전 UI 전파)
    this.setState(s => {
      const paneVer: Record<string, number> = { ...s.paneVer };
      for (const p of this.allOpen(s)) paneVer[p] = (paneVer[p] ?? 0) + 1;
      return { paneVer } as any;
    });
  }
  private applyAutonomy(patch: any) { setAutonomy(patch); this.forceUpdate(); }

  // ── 설정 모달 (프로바이더 API 키) ──
  renderSettings() {
    const s = this.state;
    if (!s.settingsOpen && !this.isClosing("settings")) return null;
    const out = this.isClosing("settings");
    const closeSettings = () => this.closeOverlay("settings", { settingsOpen: false });
    const ed = getEditorPrefs();
    const au = getAutonomy();
    const segBtn = (on: boolean): React.CSSProperties => ({ flex: 1, height: 30, fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: on ? "var(--fg)" : "var(--fg-sub2)", background: on ? "var(--accent-soft)" : "transparent", border: `1px solid ${on ? "var(--accent)" : "var(--w10)"}` });
    return (
      <div className={out ? "sz-backdrop-out" : "sz-backdrop"} onClick={closeSettings}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("settings.title"))} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()}
          style={{ width: 480, maxWidth: "92%", maxHeight: "88vh", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t("settings.title")}</span>
            <div style={{ flex: 1 }} />
            <button className="hvDim" onClick={closeSettings}
              style={{ width: 24, height: 24, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
          </div>
          {window.schutz && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)" }}>{t("settings.subLogin")}</div>
              {[
                { id: "claude", label: t("settings.planClaude") },
                { id: "codex", label: t("settings.planCodex") },
              ].map(c => {
                const connected = !!getOAuth(c.id);
                return (
                  <div key={c.id} style={{ padding: "8px 12px", borderRadius: 8, background: connected ? "rgba(143,168,147,.08)" : "var(--w03)", border: `1px solid ${connected ? "rgba(143,168,147,.35)" : "var(--w08)"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "var(--ok)" : "var(--fg-dim)", flex: "none" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: connected ? "var(--fg)" : "var(--fg-sub2)", flex: 1 }}>
                        {c.label} {connected ? t("settings.connectedTag") : t("settings.disconnectedTag")}
                      </span>
                      {connected ? (
                        <button className="hv05" onClick={() => { setOAuth(c.id, null); this.setState(st => ({ oauthTick: st.oauthTick + 1 })); }}
                          style={{ flex: "none", height: 25, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-dim)", background: "transparent", border: "1px solid var(--w14)" }}>{t("settings.disconnect")}</button>
                      ) : (
                        <button className="hvAccent" onClick={() => void this.startOauth(c.id)}
                          style={{ flex: "none", height: 25, padding: "0 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("settings.login")}</button>
                      )}
                    </div>
                    {!connected && s.oauthPasteFor === c.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <input value={s.oauthPasteVal} placeholder={t("settings.oauthPaste")}
                          onChange={e => this.setState({ oauthPasteVal: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") void this.submitOauthPaste(); }}
                          style={{ flex: 1, minWidth: 0, background: "var(--bg-root)", border: "1px solid rgba(143,168,147,.35)", borderRadius: 6, height: 28, padding: "0 10px", color: "var(--fg)", fontSize: 11, fontFamily: MONO, outline: "none" }} />
                        <button className="hvAccent" onClick={() => void this.submitOauthPaste()}
                          style={{ height: 28, padding: "0 11px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{t("settings.connect")}</button>
                      </div>
                    )}
                    {!connected && c.id === "codex" && s.oauthWait && (
                      <div style={{ fontSize: 10.5, color: "var(--fg-sub2)", marginTop: 7 }}>{t("settings.oauthWaitMsg")}</div>
                    )}
                  </div>
                );
              })}
              {s.oauthMsg && <div style={{ fontSize: 10.5, color: "#CE9A9A" }}>⚠️ {s.oauthMsg}</div>}
              <div style={{ fontSize: 10, color: "var(--fg-dim2)" }}>{t("settings.noSubNote")}</div>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("settings.apiKeysTitle")} {window.schutz && (s.cliAgents.claude?.ok || s.cliAgents.codex?.ok) ? t("settings.apiKeysOptional") : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AGDEF.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ flex: "none", width: 52, fontSize: 12, fontWeight: 600, color: d.color }}>{d.name}</span>
                <input
                  type="password"
                  defaultValue={getStoredKey(d.id as any)}
                  onChange={e => setStoredKey(d.id as any, e.target.value.trim())}
                  placeholder={t("settings.apiKeyPlaceholder")}
                  style={{ flex: 1, minWidth: 0, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 7, height: 30, padding: "0 11px", color: "var(--fg)", fontSize: 11.5, fontFamily: MONO, outline: "none" }}
                />
                <button className="hv05" onClick={() => void this.testConn(d.id)}
                  style={{ flex: "none", height: 30, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("settings.test")}</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
            {AGDEF.filter(d => s.testMsg[d.id]).map(d => (
              <div key={d.id} style={{ fontSize: 10.5, color: s.testMsg[d.id].startsWith("✓") ? "var(--ok)" : s.testMsg[d.id].startsWith("⚠") ? "#CE9A9A" : "var(--fg-sub2)" }}>
                {d.name}: {s.testMsg[d.id]}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", marginTop: 10, lineHeight: 1.6 }}>
            {t("settings.keysNote")}
          </div>

          {/* ── 화면 모드 ── */}
          <div style={{ height: 1, background: "var(--w06)", margin: "16px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("mode.settingsLabel")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {/* 목록을 오프닝과 같은 모듈에서 순회한다 — 테마 목록이 하드코딩돼 어긋났던 전례가 있다 */}
            {UI_MODES.map(m => (
              <button key={m} onClick={() => this.toggleUiMode(m)} style={segBtn(s.uiMode === m)}>{t("mode." + m)}</button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", marginTop: 7, lineHeight: 1.6 }}>
            {t("mode." + s.uiMode + ".desc")}
            {s.workspace && <> · {t("mode.settingsHint")}</>}
          </div>

          {/* ── 언어 / Language ── */}
          <div style={{ height: 1, background: "var(--w06)", margin: "16px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("settings.language")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LANGS.map(([code, name]) => (
              <button key={code} onClick={() => setLang(code)} style={segBtn(getLang() === code)}>{name}</button>
            ))}
          </div>

          {/* ── 에디터 ── */}
          <div style={{ height: 1, background: "var(--w06)", margin: "16px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("settings.editor")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.codeFont")}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {Object.entries(CODE_FONTS).map(([k, f]) => (
                  <button key={k} onClick={() => this.applyEditorPref({ codeFont: k })} style={{ ...segBtn(ed.codeFont === k), fontFamily: f.stack }}>{f.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.uiFont")}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {Object.entries(UI_FONTS).map(([k, f]) => (
                  <button key={k} onClick={() => this.applyEditorPref({ uiFont: k })} style={{ ...segBtn(ed.uiFont === k), fontFamily: f.stack }}>{f.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.codeSize")}</span>
              <input type="range" min={11} max={16} step={1} value={ed.fontSize}
                onChange={e => this.applyEditorPref({ fontSize: +e.target.value })}
                style={{ flex: 1, accentColor: "var(--accent)", background: "transparent" }} />
              <span style={{ flex: "none", width: 34, textAlign: "right", fontSize: 11.5, fontFamily: MONO, color: "var(--fg-sub2)" }}>{ed.fontSize}px</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.keymap")}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {KEYMAPS.map(([k, name]) => (
                  <button key={k} onClick={() => this.applyEditorPref({ keymap: k })} style={segBtn(ed.keymap === k)}>{name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {([["wordWrap", t("settings.wordWrap")], ["minimap", t("settings.minimap")], ["formatOnSave", t("settings.formatOnSave")], ["lineNumbers", t("settings.lineNumbers")], ["renderWhitespace", t("settings.renderWhitespace")]] as [keyof typeof ed, string][]).map(([key, label]) => (
                <div key={key as string} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--fg-sub)" }}>{label}</span>
                  <button onClick={() => this.applyEditorPref({ [key]: !ed[key] } as any)}
                    style={{ width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none", background: ed[key] ? "var(--accent)" : "var(--w12)", position: "relative", transition: "background var(--dur) var(--ease)" }}>
                    <span style={{ position: "absolute", top: 2.5, left: ed[key] ? 18.5 : 2.5, width: 15, height: 15, borderRadius: "50%", background: ed[key] ? "var(--on-accent)" : "var(--fg-sub2)", transition: "left var(--dur) var(--ease)" }} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.autoSave")}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {([["off", t("settings.autoSaveOff")], ["afterDelay", t("settings.autoSaveDelay")], ["onFocusChange", t("settings.autoSaveFocus")]] as [EditorPrefs["autoSave"], string][]).map(([v, label]) => (
                  <button key={v} onClick={() => this.applyEditorPref({ autoSave: v })} style={segBtn(ed.autoSave === v)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.tabSize")}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {[2, 4, 8].map(n => (<button key={n} onClick={() => this.applyEditorPref({ tabSize: n })} style={segBtn(ed.tabSize === n)}>{n}</button>))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ flex: "none", width: 62, fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.cursor")}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {([["line", t("settings.cursorLine")], ["block", t("settings.cursorBlock")], ["underline", t("settings.cursorUnderline")]] as [EditorPrefs["cursorStyle"], string][]).map(([v, label]) => (
                  <button key={v} onClick={() => this.applyEditorPref({ cursorStyle: v })} style={segBtn(ed.cursorStyle === v)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", lineHeight: 1.6 }}>{t("settings.editorNote")}</div>
          </div>

          {/* ── 테마 ── */}
          <div style={{ height: 1, background: "var(--w06)", margin: "16px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("settings.theme")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(THEME_TOKENS).map(([id, t]) => (
              <button key={id} onClick={() => this.setTheme(id)} style={{ ...segBtn(getThemeId() === id), display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.bgEditor, border: `1px solid ${t.accent}`, flex: "none" }} />{t.name}
              </button>
            ))}
          </div>
          {this.state.extThemes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "var(--fg-dim)", marginBottom: 5 }}>{t("settings.importedThemes")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {this.state.extThemes.map(t => (
                  <button key={t.id} onClick={() => this.selectVsxTheme(t)}
                    style={{ padding: "4px 10px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "1px solid var(--w10)", background: getActiveVsxTheme() === t.id ? "var(--accent-soft)" : "transparent", color: "var(--fg-sub)" }}>{t.label}</button>
                ))}
              </div>
            </div>
          )}
          {this.state.extIconThemes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "var(--fg-dim)", marginBottom: 5 }}>{t("settings.iconThemes")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button onClick={() => void this.applyIconTheme(null)} style={{ padding: "4px 10px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "1px solid var(--w10)", background: iconTheme.isIconThemeActive() ? "transparent" : "var(--accent-soft)", color: "var(--fg-sub)" }}>{t("settings.builtinIcon")}</button>
                {this.state.extIconThemes.map(t => (
                  <button key={t.extId + t.path} onClick={() => void this.applyIconTheme(t)}
                    style={{ padding: "4px 10px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "1px solid var(--w10)", background: iconTheme.iconThemeLabel() === t.label ? "var(--accent-soft)" : "transparent", color: "var(--fg-sub)" }}>{t.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* ── 단축키 ── */}
          <div style={{ height: 1, background: "var(--w06)", margin: "16px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("settings.shortcuts")}</div>
          <button onClick={() => this.openO({ settingsOpen: false, keysOpen: true })} style={{ ...segBtn(false), flex: "none", padding: "0 14px", width: "auto" }}>{t("settings.viewAllKeys")}</button>

          {/* ── 자율성 ── */}
          <div style={{ height: 1, background: "var(--w06)", margin: "16px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>{t("settings.autonomy")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["manual", t("settings.autoManual")], ["balanced", t("settings.autoBalanced")], ["auto", t("settings.autoAuto")]].map(([k, name]) => (
              <button key={k} onClick={() => this.applyAutonomy({ policy: k })} style={segBtn(au.policy === k)}>{name}</button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", lineHeight: 1.6, marginBottom: au.policy === "balanced" ? 10 : 0 }}>
            {au.policy === "manual" ? t("settings.autoManualDesc") : au.policy === "balanced" ? t("settings.autoBalancedDesc") : t("settings.autoAutoDesc")}
          </div>
          {au.policy === "balanced" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[["docs", t("settings.ruleDocs"), "*.md, docs/"], ["tests", t("settings.ruleTests"), "*.test.*, *.spec.*"], ["deps", t("settings.ruleDeps"), "package.json, lockfile"]].map(([k, label, hint]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontSize: 12, color: "var(--fg-code)" }}>{label}</span>
                  <span style={{ fontSize: 10.5, color: "var(--fg-dim2)", fontFamily: MONO }}>{hint}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => this.applyAutonomy({ rules: { ...au.rules, [k]: !(au.rules as any)[k] } })}
                    style={{ width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none", background: (au.rules as any)[k] ? "var(--accent)" : "var(--w12)", position: "relative", transition: "background var(--dur) var(--ease)" }}>
                    <span style={{ position: "absolute", top: 2.5, left: (au.rules as any)[k] ? 18.5 : 2.5, width: 15, height: 15, borderRadius: "50%", background: (au.rules as any)[k] ? "var(--on-accent)" : "var(--fg-sub2)", transition: "left var(--dur) var(--ease)" }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}

const iconBtn: React.CSSProperties = { width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer" };
const railBtn: React.CSSProperties = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer", transition: "background var(--dur) var(--ease)" };
const sectHdr: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)", textTransform: "uppercase", margin: "4px 0 3px" };
const gitIconBtn: React.CSSProperties = { flex: "none", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" };
const spinner = (color: string, track: string): React.CSSProperties => ({ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${track}`, borderTopColor: color, animation: "szSpin .9s linear infinite", display: "block" });
