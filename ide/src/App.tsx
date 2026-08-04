import React from "react";
import {
  AGDEF, MENUS, ENGINE_CREDIT,
  AgentState, PlanItem, ToolItem, ReviewFile, ChatMsg,
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
import { Message, ToolCall, ToolDef, NeutralMsg, AgentProvider, getStoredKey, setStoredKey, getOAuth, setOAuth, freshOAuth, getModelOverride, setModelOverride } from "./ai/provider";
import { MonacoPane, paneRegistry } from "./editor/MonacoPane";
import { DiffPane } from "./editor/DiffPane";
import { PreviewPane } from "./editor/PreviewPane";
import { createEngine, DEFAULT_POLICY } from "./engine";
import type { DelegationOutcome, RejectReason, RunRecord, StopCause } from "./engine";
import { normalizeSteps, mergePlan, stopPlan } from "./engine/plan";
import { summarizeChanges, totalOf } from "./engine/changeset";
import { buildHunks, composeFromHunks, allSelected, changeCount, hunkStats, type ChangeHunk } from "./review/hunks";
import {
  planUndo, actionable, pruneCheckpoints, CHECKPOINT_LIMITS,
  type UndoVerdict, type DiskState,
  sweepableRuns, CHECKPOINT_STALE_MS,
} from "./engine/checkpoints";
import { resolveRenameTarget, isMove } from "./engine/movePath";
import { applyProposal } from "./engine/editApply";
import { planRun, langFor, LANGS as RUN_LANGS } from "./engine/runFile";
import { getRunOverride, getRunOverrides, setRunOverride } from "./settings";
import { emptyNav, push as navPush, back as navBack, forward as navForward, current as navCurrent, dropMissing as navDropMissing, type NavState } from "./engine/navHistory";
import { shouldProbeQuota } from "./engine/quotaPoll";
import { OVERLAYS, OVERLAY_KEY, topOverlay, suppressesAction, overlayZ } from "./overlays";
import { filterPicks, stepIndex, validateInput, type PromptReq, type NormPick } from "./ext/prompt";
import { upsert as sbUpsert, remove as sbRemove, ordered as sbOrdered, ALIGN_LEFT, ALIGN_RIGHT, type StatusItem } from "./ext/statusBar";
import { classify as fsClassify } from "./ext/fsWatch";
import {
  targetIdOf, isSubagentTarget, findSubagent, providerFor, filterTools,
  rosterLines, personaSystem, type SubagentDef,
} from "./engine/subagents";
import {
  parseMcpbManifest, resolveServer, missingRequired, initialValues,
  type McpbManifest,
} from "./engine/mcpb";

/** 끌어다 놓은 것이 MCP 번들인가. 옛 이름 .dxt 도 같은 형식이다. */
function isBundleName(name: string): boolean {
  return /\.(mcpb|dxt)$/i.test(name);
}
/** 매니페스트의 platform_overrides 를 고를 때 쓴다. navigator 로만 판별한다(메인 왕복 없이). */
function bundlePlatform(): "win32" | "darwin" | "linux" {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win32";
  if (/Mac OS X|Macintosh/i.test(ua)) return "darwin";
  return "linux";
}
import { XtermView } from "./editor/XtermView";
import { ImagePane, MarkdownPane, isImage, mdToHtml } from "./editor/MediaPane";
import monaco, { languageOf, applyTsPaths, revalidateTs } from "./editor/monacoSetup";
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
import * as engines from "./gameEngine/adapters";
import { buildReviewSystemPrompt, buildReviewUserPrompt, parseFindings, severityRank, Finding, type ReviewLang } from "./review/reviewer";
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

/** 편집기가 있어야만 뜻이 있는 메뉴들. 에이전트 모드에는 편집기가 없어 눌러도 아무 일이
 *  없었다 — 이제 그렇다고 말해 준다(모드 전환·터미널은 두 모드 모두에서 된다). */
const EDITOR_ONLY_ACTIONS = new Set([
  "view.split4", "view.split2", "view.splitReset",
  "view.format", "view.wordWrap", "view.minimap", "view.problems",
]);

/* ── 에이전트 도구 상한 ────────────────────────────────────────────────────
   도구 결과는 그대로 모델 컨텍스트가 된다. 상한이 없으면 큰 저장소에서 list_files
   한 번에 수천 줄, read_file 한 번에 파일 전체가 실려 남은 턴을 다 태운다.
   자를 때는 반드시 **잘랐다고 알린다** — 모델이 다 봤다고 믿고 단정하면 안 된다. */
const LIST_MAX = 400;        // list_files 가 한 번에 보여줄 경로 수
const SEARCH_MAX = 200;      // search_files 히트 수 상한
const SEARCH_PREVIEW = 160;  // 히트 한 줄의 미리보기 길이
const READ_MAX = 1200;       // read_file 이 범위 없이 읽을 최대 줄 수

const TRAIL_MAX = 24;        // history 에 남길 도구 자취 줄 수

/** 도구 호출 하나를 한 줄로. 인자는 무엇을 했는지 알아볼 최소한만 싣는다
 *  — 결과는 넣지 않는다(그게 컨텍스트를 태우던 원인이다). */
function toolTrailLine(c: ToolCall): string {
  const i = c.input ?? {};
  const arg =
    c.name === "search_files" ? String(i.query ?? "")
    : c.name === "run_command" ? String(i.command ?? "")
    : c.name === "delegate_task" ? String(i.agent ?? "")
    : c.name === "skill" ? String(i.name ?? "")
    : String(i.path ?? i.glob ?? "");
  const range = c.name === "read_file" && i.offset ? ` (${i.offset}줄~)` : "";
  return `- ${c.name} ${arg.slice(0, 120)}${range}`.trimEnd();
}

/** 이번 턴의 도구 자취를 어시스턴트 발화 뒤에 붙일 블록으로. 없으면 빈 문자열. */
function trailBlock(trail: string[]): string {
  if (!trail.length) return "";
  const shown = trail.slice(-TRAIL_MAX);
  const cut = trail.length - shown.length;
  return "\n\n(이번 턴에 쓴 도구" + (cut ? ` — 앞 ${cut}건 생략` : "") + ":\n" + shown.join("\n") + ")";
}

/** 켜면 시스템 프롬프트에 실리는 프로젝트 지침 파일 — Claude 계열·OpenAI 계열 관례 둘 다. */
const PROJECT_INSTRUCTION_FILES = ["CLAUDE.md", "AGENTS.md"];
const PROJECT_INSTR_MAX = 12000; // 한 파일에서 실을 최대 글자

/** 팔레트·메뉴에 보여줄 단축키 문자열 — **표에서 뽑는다.**
 *  손으로 적어 두면 사용자가 재정의했을 때 화면만 옛 키를 계속 광고한다. */
function kb(id: ActionId): string {
  return displayChord(chordFor(id), navigator.platform.toLowerCase().includes("mac"));
}

/** 쉼표로 구분한 glob 목록 → (rel) => boolean. 비면 전부 통과.
 *  main.cjs 의 globToMatcher 와 같은 규칙(**=경계 넘음, *=한 구간, ?=한 글자). */
function globFilter(patterns: string): (rel: string) => boolean {
  const list = patterns.split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length) return () => true;
  const res = list.map(p => {
    const rx = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, " ").replace(/\*/g, "[^/]*").replace(/ /g, ".*").replace(/\?/g, ".");
    return new RegExp("(^|/)" + rx + "$|^" + rx + "$");
  });
  return (rel: string) => res.some(r => r.test(rel));
}
import { getUiMode, setUiMode, applyUiMode, switchUiMode, UI_MODES, type UiMode } from "./uiMode";
import {
  BINDINGS, buildMap, chordOf, chordFor, conflictsOf, displayChord,
  getOverrides, isModifierOnly, setOverride, resetOverrides, type ActionId,
} from "./keymap";
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
  /** 이 제안을 낸 **루트** 실행. 체크포인트가 이 단위로 되돌린다 — 하위 에이전트 하나만
   *  되돌리면 그 턴이 한 일의 절반만 사라진다. 제안을 만드는 시점에 확정한다
   *  (runs.reap 이 나중에 부모 레코드를 버리면 그때는 루트를 알 수 없다). */
  rootRunId?: string;
}

/** Codex Cloud 로 위임한 태스크 하나(로컬 추적본). 원격이 진실이고 이건 UI 표시·재시작 복원용. */
interface CloudTask {
  id: string;
  prompt: string;
  env?: string | null;
  status: string;         // running | done | failed | applied | stopped
  createdAt: number;
  raw?: string;
}

// 설정 폰트가 전 UI에 전파되도록 CSS 변수를 참조(applyUiFont가 --font-ui/--font-code 설정).
// 심볼·이모지 폴백 포함(장식 글리프 tofu 방지).
const MONO = "var(--font-code,'IBM Plex Mono','Yu Gothic UI','Meiryo','Segoe UI Symbol','Segoe UI Emoji',monospace)";
const SUIT = "var(--font-ui,'SUIT Variable','Yu Gothic UI','Meiryo','Segoe UI Symbol','Segoe UI Emoji',sans-serif)";

// 빌드 시 vite.config 이 package.json 버전을 주입한다(define). 손으로 박지 않는다 —
// 예전엔 0.0.4 를 냈는데도 여기가 0.0.3 이라 정보 창이 옛 버전을 보여줬다.
// 빌드 때 vite define 이 package.json 버전으로 치환한다. dev 서버(vite serve)는 이 define 을
// 소스에 적용하지 않아 예전엔 __APP_VERSION__ 이 그대로 남아 ReferenceError 로 앱이 죽었다.
// typeof 가드는 undeclared 식별자에도 던지지 않으므로, 빌드에선 치환된 버전을, dev 에선 "dev" 를 쓴다.
declare const __APP_VERSION__: string | undefined;
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

/** "v0.0.7" · "0.0.7" → [0,0,7]. 숫자가 아닌 꼬리(-beta 등)는 버린다. */
function parseVer(v: string): number[] {
  return String(v).replace(/^v/, "").split(".").map(p => parseInt(p, 10) || 0);
}
/** a 가 b 보다 새 버전이면 true. 자리 수가 달라도(0.1 vs 0.0.9) 맞게 비교한다. */
function isNewerVer(a: string, b: string): boolean {
  const x = parseVer(a), y = parseVer(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
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
  /** 조사식 — 멈출 때마다·프레임을 바꿀 때마다 현재 프레임에서 다시 계산한다.
   *  value 가 null 이면 아직 계산 전(세션이 없거나 실행 중). */
  watches: { expr: string; value: string | null }[];
  watchInput: string;
  /** Git 상태 (소스 컨트롤 패널) */
  git: GitStatus | null;
  gitMsg: string;
  gitBusy: boolean;
  gitError: string;
  /** Git 브랜치·로그 */
  gitBranches: string[];
  gitLog: { hash: string; author: string; date: string; subject: string }[];
  /** git 상태가 갱신될 때마다 오르는 수 — 에디터 거터를 다시 그리게 하는 신호. */
  gitVer: number;
  /** 감춰둔 변경(stash) 목록. 백엔드 stashList 는 있었는데 부르는 곳이 없어
   *  감춰만 두고 무엇이 들어 있는지 볼 방법이 없었다. */
  gitStashes: { ref: string; subject: string }[];
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
  /** 되돌리기 어려운 일을 하기 전의 확인. window.confirm 을 대신한다 — OS 대화상자는
   *  렌더러를 통째로 얼리고, 테마도 따르지 않으며, 무엇을 지우는지 한 줄 이상 못 싣는다. */
  confirmAsk: {
    title: string; body: string; okLabel: string; cancelLabel: string;
    /** 되돌릴 수 없는 일 — 확인 버튼을 오류 색으로. */
    danger?: boolean;
  } | null;
  /** 확장이 상태바에 올린 항목. 예전엔 셰임이 받아 두기만 하고 읽는 곳이 없었다. */
  extStatus: StatusItem[];
  /** 확장이 사용자에게 던진 물음. 셰임의 showQuickPick/showInputBox/showXMessage 가
   *  여기로 온다 — 예전엔 묻지도 않고 undefined(=취소)를 돌려줬다. */
  extAsk: PromptReq | null;
  /** 물음 안의 입력값. 빠른 선택에서는 걸러내기 문자열, 입력창에서는 값 자체다. */
  extAskText: string;
  /** 빠른 선택의 커서. **걸러낸 뒤 목록에서의 자리**다(원본 index 가 아니다). */
  extAskSel: number;
  /** canPickMany 에서 체크한 항목 — 원본 index 를 담는다. 걸러도 선택이 유지돼야 한다. */
  extAskPicked: number[];
  /** validateInput 이 돌려준 문구. 있으면 확인을 막는다. */
  extAskErr: string | null;
  /** 실행 승인 대기 중인 명령 (수동 정책일 때) */
  /** 승인 대기. okLabel/cancelLabel 은 자리에 맞는 문구가 있을 때만 채운다(없으면 기본 허용/거부). */
  askRun: { command: string; rationale: string; agent: string; okLabel?: string; cancelLabel?: string } | null;
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
  /** 에이전트 모드 좌측 대화 목록 폭 — 대화 목록 ↔ 채팅 사이 경계를 끌어 조절한다. */
  agentAsideW: number;
  /** 열린 터미널 탭들 (멀티 터미널) */
  // 번호만 들고 있고 제목은 렌더에서 만든다. 예전엔 만들 때 t() 로 굳혀서, 언어를 바꿔도
  // 탭 이름만 옛말로 남았다 — 이 배열은 어디에도 저장되지 않으니 모양을 바꿔도 안전하다.
  /** cmd 가 있으면 그 터미널이 열리자마자 한 번 실행한다(작업 실행기) */
  terms: { id: string; n: number; cmd?: string }[];
  /** package.json 의 scripts — 팔레트에서 바로 실행한다 */
  tasks: { name: string; cmd: string }[];
  /** 키바인딩 재정의 입력 중인 행동. null 이면 평소대로 단축키가 동작한다. */
  keyCapture: ActionId | null;
  /** 제안별로 고른 헝크 index. 항목이 **없으면 전부 고른 것**이다 —
   *  기본이 전부라 줄 단위 수락을 얹어도 기존 동작이 그대로다. */
  hunkSel: Record<string, number[]>;
  /** 되돌릴 수 있는 AI 실행들 — 최신순. 메인의 보관 폴더가 진실이고 이건 그 사본이다. */
  checkpoints: CheckpointInfo[];
  /** 끌어다 놓은 MCP 번들 — 무엇이 설치될지 보여 준 뒤에만 등록한다. null 이면 안 열려 있다. */
  mcpb: {
    manifest: McpbManifest;
    values: Record<string, string>;
    busy: boolean;
    /** 덮어쓰기 확인이 필요한가 (같은 이름이 이미 있다) */
    exists: boolean;
  } | null;
  /** 커밋을 새로 하지 않고 방금 것을 고쳐 쓴다(--amend). */
  gitAmend: boolean;
  /** 히스토리에서 고른 커밋의 전문. null 이면 안 열려 있다. */
  commitView: { hash: string; text: string; loading: boolean; truncated?: boolean } | null;
  /** 되돌리기 확인 화면. 무엇을 되돌리고 무엇을 못 되돌리는지 **보여준 뒤에** 실행한다.
   *  window.confirm 을 쓰지 않는 이유: 파일별 사유를 한 줄도 못 싣는다. */
  undoAsk: { runId: string; plan: UndoVerdict[]; busy: boolean } | null;
  agents: Record<string, AgentState>;
  /** 실제로 연 프로젝트 폴더. null 이면 아직 아무 프로젝트도 열지 않았다. */
  workspace: SchutzWorkspaceTree | null;
  paneDirty: Record<string, boolean>;
  /** Claude의 실파일 편집 제안 */
  proposals: Proposal[];
  /** 독립 리뷰 패스가 짚은 것 — 조언이라 닫을 수만 있고 편집 패치가 없다(제안과 분리). */
  reviewFindings: Finding[];
  /** 리뷰 패스 진행 중 */
  reviewBusy: boolean;
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
  /** 게임 엔진 접속 상태 — serverName → Studio 에 실제로 닿는지. 패널 열 때·연결 후에만 조회. */
  engineStatus: Record<string, { reachable: boolean; detail: string }>;
  /** Claude Code 스킬 — 이름·설명만. 본문은 모델이 고를 때 읽는다. */
  skills: SkillInfo[];
  /** 플러그인·프로젝트·사용자가 정의한 서브에이전트(인격). 위임 대상이 된다. */
  subagents: SubagentDef[];
  /** 커넥터 — 화면 이름만 커넥터고, 읽는 실체는 플러그인 카탈로그다 */
  pluginOpen: boolean;
  plugins: PluginInfo[];
  pluginQuery: string;
  pluginCat: string;
  pluginBusy: string;
  /** 클라우드 위임(Codex Cloud) 패널 */
  cloudOpen: boolean;
  cloudTasks: CloudTask[];
  cloudPrompt: string;
  cloudBusy: string;   // "dispatch" | task id(적용/확인 중) | ""
  /** 엔진 뷰(전용 화면) 열림 */
  engineOpen: boolean;
  /** 엔진 뷰 — 뷰포트 스냅샷(data URL) · 씬 트리 텍스트 · 진행 중 동작 · 오류 */
  engineShot: string | null;
  engineTree: string;
  engineViewBusy: string;
  engineViewErr: string;
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
  /** 상태바 언어 선택 팝오버 열림 */
  langPickOpen: boolean;
  /** 트리 우클릭 메뉴 */
  ctxMenu: { x: number; y: number; rel: string; isDir: boolean } | null;
  /** 탭 우클릭 메뉴 — 다른 탭 닫기·오른쪽 닫기처럼 한 번에 여러 개를 정리하는 자리. */
  tabMenu: { x: number; y: number; slot: number; rel: string } | null;
  /** 트리 인라인 편집 — 새 파일/폴더(rel=부모 dir, ""=루트) 또는 이름변경(rel=대상) */
  treeEdit: { kind: "newFile" | "newFolder" | "rename"; rel: string; value: string } | null;
  /** 새 버전 알림 — 최신 릴리스가 지금 버전보다 위일 때만 채워진다 */
  update: { version: string; url: string } | null;
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
/** 채팅에 붙이는 것.
 *  file      = 워크스페이스 파일(경로만 들고, 보낼 때 읽는다)
 *  selection = 에디터 선택 영역(텍스트를 그대로 들고 있다)
 *  upload    = 사람이 고른 **실제 파일**(사진·문서). 워크스페이스 밖이어도 되고, 붙여넣기·
 *              끌어다 놓기로도 들어온다. 이미지는 base64(data)로, 글자 파일은 text 로 담는다. */
interface AttachRef {
  kind: "file" | "selection" | "upload";
  rel: string; text?: string; label: string;
  mime?: string; data?: string; size?: number;
}

/** Git 변경 항목 */
interface GitEntry { path: string; code: string }
interface GitStatus {
  branch: string | null; ahead: number; behind: number; upstream: boolean; notRepo?: boolean;
  staged: GitEntry[]; unstaged: GitEntry[]; untracked: GitEntry[];
  /** 병합 충돌(unmerged). 스테이지도 워킹도 아니라 따로 세운다 — 해결하기 전엔 커밋할 수 없다. */
  conflicted: GitEntry[];
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
  /** 진행 중인 리뷰 패스의 중단자 — 한 번에 하나만 돈다. */
  private _reviewAbort: AbortController | null = null;
  /**
   * 파일 락: rel → 잡고 있는 **runId**.
   * agentId 로 잡으면 낡은 실행의 정리가 같은 에이전트의 새 실행 락을 풀어 버린다.
   */
  private fileLocks = new Map<string, string>();

  state: S = {
    statusKey: "idle", running: false, runProgress: 0, messages: [], input: "",
    plan: [], tools: [], files: [], chips: {},
    tabs: [[]], active: [""], leftTab: "flow", expanded: null,
    breakpoints: {}, debug: null, debugConsole: [], watches: [], watchInput: "",
    extCommands: [], extList: [], extErrors: [], extLimited: [], extPanel: null, extThemes: [], extIconThemes: [], iconVer: 0, extSearch: "", extResults: [], extBusy: false, extInstalling: [], extDetail: null, extDetailBusy: false,
    git: null, gitMsg: "", gitBusy: false, gitError: "",
    gitBranches: [], gitLog: [], gitStashes: [], gitVer: 0, branchOpen: false, newBranch: "",
    attach: [], attachPickerOpen: false, attachQuery: "",
    openMenu: null, projOpen: false,
    agentsOpen: true, reviewOpen: true,
    termOpen: false, termReady: false, termTab: "t1", chatTab: "all", chatAway: false, openDiffs: {}, openTools: {}, sheetOpen: false, convId: null, asideTab: "recents",
    impOpen: false, impRows: null, impThisOnly: true, impBusy: null, impAgent: "all",
    agentSideW: (() => { try { return Math.max(360, Math.min(1100, +(localStorage.getItem("schutz.agentSideW") || 620))); } catch { return 620; } })(),
    agentAsideW: (() => { try { return Math.max(150, Math.min(480, +(localStorage.getItem("schutz.agentAsideW") || 216))); } catch { return 216; } })(), quota: {}, askRun: null, confirmAsk: null, extStatus: [], extAsk: null, extAskText: "", extAskSel: 0, extAskPicked: [], extAskErr: null, terms: [{ id: "t1", n: 1 }], tasks: [], keyCapture: null, hunkSel: {}, checkpoints: [], undoAsk: null, gitAmend: false, commitView: null, mcpb: null,
    agents: this.freshAgents(),
    workspace: null, paneDirty: {},
    proposals: [], reviewFindings: [], reviewBusy: false, paneVer: {},
    termReal: "", termInput: "", settingsOpen: false, aboutOpen: false, usageOpen: false, keysOpen: false, commandsOpen: false, agentCommands: [], mcpOpen: false, mcpServers: [], mcpDiscovered: [], mcpBusy: "", engineStatus: {}, skills: [], subagents: [],
    pluginOpen: false, plugins: [], pluginQuery: "", pluginCat: "", pluginBusy: "",
    cloudOpen: false, cloudTasks: [], cloudPrompt: "", cloudBusy: "",
    engineOpen: false, engineShot: null, engineTree: "", engineViewBusy: "", engineViewErr: "", mcpJson: "", mcpGen: null, tourOpen: false, tourStep: 0, openingPhase: "off", demoCaption: null, demoRunning: false, closing: [], closingTabs: [], testMsg: {},
    layout: (() => {
      const m = /[?&]layout=(\d)/.exec(window.location.search);
      if (m) { const v = parseInt(m[1], 10); return v === 2 ? 2 : v === 4 ? 4 : 1; }
      // 단일 그룹(탭 스택)으로 시작한다. 4분할은 데모 시각화 전용이었다.
      return 1;
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
    // 0 은 "접힘" 이다. 예전엔 하한 200 이라 접은 채로 껐다 켜면 도로 펴졌다.
    leftW: (() => { try { const v = +(localStorage.getItem("schutz.leftW") || 272); return v === 0 ? 0 : Math.max(200, Math.min(520, v)); } catch { return 272; } })(),
    uiMode: getUiMode(),   // 워크스페이스는 아직 없다 — 전역 기본값. 열릴 때 프로젝트 값으로 다시 맞춘다
    rightW: (() => { try { return Math.max(240, Math.min(600, +(localStorage.getItem("schutz.rightW") || 336))); } catch { return 336; } })(),
    // 대화 높이. 예전엔 트리와 대화가 둘 다 flex:1 이라 50/50 으로 고정이었다.
    chatH: (() => { try { return Math.max(CHAT_MIN_H, +(localStorage.getItem("schutz.chatH") || 360)); } catch { return 360; } })(),
    mdPreview: {}, replaceOpen: false, replaceVal: "",
    searchOpts: { regex: false, caseSensitive: false, wholeWord: false, include: "", exclude: "" },
    mruOpen: false, mruSel: 0,
    collapsed: {}, statusInfo: null, langPickOpen: false, ctxMenu: null, tabMenu: null, treeEdit: null, update: null,
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
  /** 저장을 확장에 알린다. 저장 경로가 둘(페인·모델)이라 여기 한 곳으로 모은다. */
  private notifySaved = (rel: string) => extHost.notifyExtensions("file.save", { rel });
  /** 페인에서 부르는 확인 창구 — 화살표로 묶어 this 를 잃지 않게. */
  private askConfirmProp = (o: { title: string; body: string; okLabel: string; danger?: boolean }) => this.askConfirm(o);

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
        if (silent || !await this.askConfirm({ title: t("confirm.overwriteTitle"), body: t("sc1.externalChangedOverwrite", { rel }), okLabel: t("confirm.overwriteOk"), danger: true })) { failed.push(rel + " (" + t("sc1.externalChangedSkipped") + ")"); continue; }
      }
      try {
        await window.schutz.writeFile(ws.root, rel, content);
        projectModels.markSaved(ws.root, rel, content);
        this.notifySaved(rel);
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
  /** 정의로 이동 (F12) / 참조 찾기 (Shift+F12) / 줄로 이동 (Ctrl+G) / 서식
   *  activePane() 을 쓴다 — paneRegistry.focused 는 에디터 **안을 직접 클릭**해야 채워져서,
   *  트리에서 파일만 연 흔한 흐름에선 null 이었다. 그때 조용히 return 하는 바람에
   *  F12·Ctrl+G·서식이 눌러도 아무 일이 없었다. 없으면 이유를 말한다. */
  private triggerEditorAction(actionId: string) {
    const pane = this.activePane();
    if (!pane) { this.toast("info", t("sc1.noEditorForAction")); return; }
    pane.editor.focus();
    void pane.editor.getAction(actionId)?.run();
  }

  // ── 토스트 ──
  /** 토스트 전용 타이머. 탭 닫기와 같은 이유로 _timers 풀 밖에 둔다 —
   *  clearTimers()(stopRun)가 이 타이머를 지우면 토스트가 제거되지 않고
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

  // 새 파일/폴더·이름변경 — Electron 은 window.prompt 를 지원하지 않아(그냥 null 반환)
  // 예전엔 아무 일도 안 일어났다. 트리에 인라인 입력칸을 띄우는 방식으로 바꾼다(VS Code 처럼).
  newFileAt(dirRel: string) { this.beginTreeEdit("newFile", dirRel); }
  newFolderAt(dirRel: string) { this.beginTreeEdit("newFolder", dirRel); }

  /** 트리 인라인 편집 시작. 새로 만들 땐 부모 폴더를 펼쳐 입력칸이 보이게 한다. */
  beginTreeEdit(kind: "newFile" | "newFolder" | "rename", rel: string) {
    // 프로젝트가 없으면 만들 곳이 없다. 예전엔 조용히 return 해서 Ctrl+N·파일 메뉴·
    // 팔레트 셋 다 눌러도 아무 일이 없었다 — 이유를 말하고 여는 길을 가리킨다.
    if (!this.state.workspace) { this.toast("info", t("misc.openProjectToStart")); return; }
    if (!window.schutz) return;
    const value = kind === "rename" ? (rel.split("/").pop() || "") : "";
    this.setState(s => ({
      treeEdit: { kind, rel, value },
      collapsed: kind === "rename" || !rel ? s.collapsed : { ...s.collapsed, [rel]: false },
      ctxMenu: null,
    }));
  }
  cancelTreeEdit() { this.setState({ treeEdit: null }); }
  async commitTreeEdit() {
    const te = this.state.treeEdit;
    if (!te) return;
    const name = te.value.trim();
    this.setState({ treeEdit: null });
    if (!name) return;
    if (te.kind === "rename") await this._doRename(te.rel, name);
    else if (te.kind === "newFolder") await this._doNewFolder(te.rel, name);
    else await this._doNewFile(te.rel, name);
  }

  private async _doNewFile(dirRel: string, name: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const rel = dirRel ? dirRel + "/" + name : name;
    try {
      await window.schutz.writeFile(ws.root, rel, "");
      await this.refreshWorkspace();
      this.openFile(rel);
      this.toast("ok", t("sc1.file_created") + name);
    } catch (e) { this.toast("error", t("sc1.create_failed") + (e instanceof Error ? e.message : String(e))); }
  }

  private async _doNewFolder(dirRel: string, name: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
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
    // 실패를 삼키지 않는다 — 탐색기가 안 뜨면 사용자는 클릭이 먹었는지조차 모른다.
    try {
      const ok = await window.schutz.reveal(ws.root, rel);
      if (!ok) this.toast("error", t("sc1.revealFailed"));
    } catch (e) { this.toast("error", t("sc1.revealFailed") + (e instanceof Error ? " — " + e.message : "")); }
  }

  /** 좌·우 패널 드래그 리사이즈 */
  /** 대화 목록 ↔ 채팅 폭. 오른쪽으로 끌면 목록이 넓어진다.
   *  산출물 패널과 같은 방식이되, 이쪽은 목록이라 더 좁게까지 줄일 수 있다. */
  private startAgentAsideResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = this.state.agentAsideW;
    const onMove = (ev: MouseEvent) => {
      // 채팅 쪽에도 최소 폭을 남긴다 — 목록을 끝까지 끌어 채팅을 0 으로 만들 수 있으면 안 된다.
      const maxW = Math.max(150, Math.min(480, window.innerWidth - 420));
      this.setState({ agentAsideW: Math.max(150, Math.min(maxW, startW + (ev.clientX - startX))) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      try { localStorage.setItem("schutz.agentAsideW", String(this.state.agentAsideW)); } catch { /* ignore */ }
      requestAnimationFrame(() => { for (const p of paneRegistry.panes.values()) { try { p.editor.layout(); } catch { /* */ } } });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  }

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

  renameAt(rel: string) { this.beginTreeEdit("rename", rel); }

  private async _doRename(rel: string, nn: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    // 이름에 `/` 를 넣으면 **이동**이다. 메인의 renameEntry 는 원래부터 mkdir -p + rename
    // 이라 워크스페이스 안 임의 이동이 됐는데, 여기서 basename 만 갈아끼워 늘 같은 부모에
    // 도로 붙이고 있었다. 경로 계산은 engine/movePath.ts 가 한다(테스트 있음).
    const target = resolveRenameTarget(rel, nn);
    if (target.ok === false) {
      // "same" 은 오류가 아니라 할 일이 없는 것이다 — 조용히 넘긴다.
      if (target.why !== "same") this.toast("error", t("move.err_" + target.why));
      return;
    }
    const relTo = target.to;
    try {
      await window.schutz.renameEntry(ws.root, rel, relTo);
      if (isMove(rel, relTo)) this.toast("ok", t("move.moved", { to: relTo }));
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

  /** 경로를 클립보드로. 상대 경로가 기본이다 — 이슈·리뷰에 붙일 때 쓰는 건 그쪽이다. */
  async copyPath(rel: string, absolute: boolean) {
    const ws = this.state.workspace;
    let text = rel;
    if (absolute && ws) {
      // 루트가 역슬래시를 쓰면(윈도) 이어 붙이는 쪽도 맞춘다 — 섞이면 붙여넣어 못 쓴다.
      const win = ws.root.includes("\\");
      text = win ? ws.root.replace(/[\\/]+$/, "") + "\\" + rel.replace(/\//g, "\\")
                 : ws.root.replace(/\/+$/, "") + "/" + rel;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.toast("ok", t("sc4.pathCopied", { path: text }));
    } catch (e) {
      this.toast("error", t("sc4.copyFailed") + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** 파일 복제 — `Card.tsx` → `Card copy.tsx`, 이미 있으면 `Card copy 2.tsx`.
   *  이름이 비는 자리를 못 찾으면 만들지 않는다(기존 파일을 덮는 것보다 아무것도 안 하는 게 낫다). */
  async duplicateAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const dot = rel.lastIndexOf(".");
    const slash = rel.lastIndexOf("/");
    const hasExt = dot > slash + 1;      // ".gitignore" 는 확장자가 아니라 이름이다
    const stem = hasExt ? rel.slice(0, dot) : rel;
    const ext = hasExt ? rel.slice(dot) : "";
    const taken = new Set(ws.entries.map(e => e.rel));
    let to = "";
    for (let n = 1; n <= 50; n++) {
      const cand = stem + (n === 1 ? " copy" : ` copy ${n}`) + ext;
      if (!taken.has(cand)) { to = cand; break; }
    }
    if (!to) { this.toast("error", t("sc4.duplicateNoName")); return; }
    try {
      const text = await window.schutz.readFile(ws.root, rel);
      await window.schutz.writeFile(ws.root, to, text);
      await this.refreshWorkspace();
      this.openFile(to);
      this.toast("ok", t("sc4.duplicated", { to }));
    } catch (e) {
      this.toast("error", t("sc4.duplicateFailed") + (e instanceof Error ? e.message : String(e)));
    }
  }

  async deleteAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    if (!await this.askConfirm({ title: t("confirm.deleteTitle"), body: t("sc1.confirm_delete", { rel }), okLabel: t("confirm.deleteOk"), danger: true })) return;
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

  /** 이벤트가 터미널 안에서 났는가. 안이면 키를 셸로 넘겨야 한다 —
   *  Ctrl+S 는 셸에서 흐름 제어(XOFF)라 가로채면 터미널이 멈춘 것처럼 보인다. */
  private inTerminalDom(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest(".xterm");
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
      this._lastTabsRef = restored.tabs; this._lastActiveRef = restored.active; this._lastCollapsedRef = restored.collapsed;
      this.setState(s => ({
        workspace: tree, leftTab: "tree", tabs: restored.tabs, active: restored.active, layout: restored.layout, messages: [],
        files: [], plan: [], tools: [], chips: {},
        expanded: null, paneDirty: {}, statusKey: "idle", running: false,
        // 프로젝트마다 모드를 따로 기억한다 — 설정이 없으면 전역 기본값으로 떨어진다
        uiMode: getUiMode(tree.root),
        // 어느 대화를 열지 여기서 정한다 — 이어보던 것 → 레거시 이관분 → 가장 최근 → 새것.
        convId: this.pickConv(tree.root),
        agents: this.freshAgents(), proposals: [], paneVer: {}, collapsed: restored.collapsed,
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
      void this.loadTasks(tree);     // package.json scripts → 팔레트의 "작업: …"
      this.notifyWorkspaceOpen(tree.root);
      void this.refreshCheckpoints(tree.root); // 지난 실행의 되돌리기 지점 (프로젝트별로 따로 보관된다)
      void this.loadAgentCommands(); // 프로젝트 .claude/commands 반영
      window.schutz.watchStart(tree.root); // 외부 변경 감지 시작
      // TS/JS 프로젝트 모델 프리로드 (파일간 인텔리전스) — UI 논블로킹.
      //
      // 경로 별칭을 **먼저** 물린다. 둘을 나란히 띄웠더니 붙는 순서가 그때그때 달라져,
      // 별칭이 늦게 붙은 실행에서는 `@/…` 가 계속 "모듈을 찾을 수 없음" 으로 남았다
      // (컴파일러 옵션이 바뀌어도 이미 진단이 끝난 모델은 다시 안 도는 경우가 있다).
      // 별칭 읽기는 파일 한 개라 프리로드를 눈에 띄게 늦추지 않는다.
      setTimeout(() => {
        void (async () => {
          try {
            const had = await applyTsPaths(tree.root, rel => window.schutz!.readFile(tree.root, rel));
            if (had) this.toast("info", t("sc4.tsPathsApplied"));
          } catch { /* 별칭이 없는 프로젝트가 대다수다 — 조용히 넘긴다 */ }
          const res = await projectModels.preload(tree.root, tree.entries, (r, rel) => window.schutz!.readFile(r, rel), this.isDirtyRel);
          if (res.skipped) this.setState({ tsLargeProject: true });
          // 모델이 다 앉은 뒤 진단을 한 번 더 확정한다 — 이유는 revalidateTs 주석 참고.
          revalidateTs();
        })();
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
    // 빈 채로 열면 **최근 연 파일**을 준다. 예전엔 사전순 앞 12개라 Ctrl+P → Enter 가
    // 늘 엉뚱한 파일로 갔다 — VS Code 에서는 그게 "직전 파일로 돌아가기" 다.
    if (!q) {
      const byRel = new Map(files.map(f => [f.rel, f]));
      const recent = this._tabMRU.map(r => byRel.get(r)).filter((f): f is SchutzTreeEntry => !!f);
      const rest = files.filter(f => !this._tabMRU.includes(f.rel));
      return [...recent, ...rest].slice(0, 12);
    }
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
      { id: "newFile", label: t("sc1.cmd_new_file"), hint: kb("file.new"), run: () => void this.newFileAt("") },
      { id: "save", label: t("sc1.cmd_save"), hint: kb("file.save"), run: () => void this.saveActive() },
      { id: "runFile", label: t("runfile.cmdRun"), hint: kb("file.run"), run: () => void this.runActiveFile() },
      { id: "saveAll", label: t("sc1.cmd_save_all"), hint: kb("file.saveAll"), run: () => void this.saveAll() },
      { id: "settings", label: t("sc1.cmd_open_settings"), hint: kb("settings.open"), run: () => this.openO({ settingsOpen: true }) },
      { id: "term", label: t("sc1.cmd_toggle_terminal"), hint: kb("terminal.toggle"), run: () => this.toggleTerm() },
      { id: "uiMode", label: t("mode.command"), hint: kb("mode.toggle"), run: () => this.toggleUiMode(this.state.uiMode === "agent" ? "editor" : "agent") },
      // 사이드바는 에이전트 모드에만 있다. 명령으로도 열어두지 않으면 에디터 모드를 고른
      // 사람에게는 첫 실행 화면이 유일한 입구이고, 거기서 "나중에" 를 누르면 길이 없어진다.
      { id: "importChats", label: t("imp.command"), run: () => this.openImport() },
      { id: "split1", label: t("sc1.cmd_split1"), run: () => this.setLayout(1) },
      { id: "split2", label: t("sc1.cmd_split2"), run: () => this.setLayout(2) },
      { id: "split4", label: t("sc1.cmd_split4"), run: () => this.setLayout(4) },
      { id: "quickOpen", label: t("sc1.cmd_goto_file"), hint: kb("palette.quick"), run: () => this.openO({ quickOpen: true, quickQuery: "", quickSel: 0 }) },
      { id: "symOpen", label: t("sc1.cmd_goto_ws_symbol"), hint: kb("palette.symbol"), run: () => this.openSymbolPalette() },
      { id: "search", label: t("sc1.cmd_global_search"), hint: kb("search.inFiles"), run: () => this.openO({ searchOpen: true, searchSel: 0 }) },
      { id: "outline", label: t("sc1.cmd_goto_symbol_outline"), hint: kb("editor.outline"), run: () => this.triggerOutline() },
      { id: "gotoDef", label: t("sc1.cmd_goto_def"), hint: "F12", run: () => this.triggerEditorAction("editor.action.revealDefinition") },
      { id: "findRefs", label: t("sc1.cmd_find_refs"), hint: "Shift+F12", run: () => this.triggerEditorAction("editor.action.goToReferences") },
      { id: "quickFix", label: t("sc1.cmd_quick_fix"), hint: "Ctrl+.", run: () => this.triggerEditorAction("editor.action.quickFix") },
      { id: "rename", label: t("sc1.cmd_rename_symbol"), hint: "F2", run: () => this.triggerRename() },
      { id: "gotoLine", label: t("sc1.cmd_goto_line"), hint: kb("editor.gotoLine"), run: () => this.triggerEditorAction("editor.action.gotoLine") },
      { id: "format", label: t("sc1.cmd_format_doc"), run: () => this.triggerEditorAction("editor.action.formatDocument") },
      { id: "wrap", label: t("sc1.cmd_toggle_wrap"), run: () => this.applyEditorPref({ wordWrap: !getEditorPrefs().wordWrap }) },
      { id: "minimap", label: t("sc1.cmd_toggle_minimap"), run: () => this.applyEditorPref({ minimap: !getEditorPrefs().minimap }) },
      { id: "problems", label: t("sc1.cmd_open_problems"), run: () => this.setState({ termOpen: true, termTab: "problems" }) },
      { id: "newWindow", label: t("sc1.cmd_new_window"), hint: kb("window.new"), run: () => window.schutz?.newWindow() },
      { id: "theme", label: t("sc1.cmd_cycle_theme"), run: () => this.cycleTheme() },
    ];
    if (this.state.workspace) {
      cmds.push({ id: "openProject", label: t("sc1.cmd_open_project"), hint: kb("project.open"), run: () => void this.openProject() });
      cmds.push({ id: "gitPanel", label: t("sc1.cmd_open_scm"), run: () => { this.setState({ leftTab: "git" }); void this.loadGit(); } });
      cmds.push({ id: "gitRefresh", label: t("sc1.cmd_git_refresh"), run: () => void this.loadGit() });
      cmds.push({ id: "gitReview", label: t("review.button"), run: () => void this.reviewChanges() });
      // 되돌리기 카드는 리뷰 패널에만 있다 — 다른 탭에 있을 때도 닿을 수 있게 팔레트에 둔다.
      // 가장 최근 것 하나만 — 목록에서 고르는 건 패널이 한다.
      cmds.push({
        id: "cpUndoLast", label: t("cp.title"),
        run: () => {
          const last = this.state.checkpoints.find(c => !c.open && c.restorable > 0);
          if (!last) { this.toast("info", t("cp.nothingToUndo")); return; }
          void this.askUndoRun(last.rootRunId);
        },
      });
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
    // package.json 의 scripts — 새 터미널에서 npm run <name>. 출력·중지가 터미널에 그대로 남는다.
    for (const tk of this.state.tasks) {
      cmds.push({ id: "task:" + tk.name, label: t("task.run", { name: tk.name }), hint: tk.cmd.slice(0, 40), run: () => this.runTask(tk.name) });
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

  /** 아웃라인 (심볼 퀵픽) — Monaco 내장. triggerEditorAction 과 같은 이유로 activePane(). */
  triggerOutline() {
    this.triggerEditorAction("editor.action.quickOutline");
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
    if (textmate.isTextMateWired()) {
      textmate.defineTmTheme();   // 위젯 색이 지금 테마를 따라가도록 다시 정의한 뒤 적용
      monaco.editor.setTheme(textmate.tmThemeId());
    }
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
  addTerm(cmd?: string) {
    this._termSeq++;
    const id = "t" + this._termSeq + "_" + (this._uid++);
    this.setState(s => ({ terms: [...s.terms, { id, n: s.terms.length + 1, cmd }], termTab: id, termOpen: true } as any));
  }

  /** package.json 의 scripts 를 읽어 온다. 없거나 깨져 있으면 빈 목록 —
   *  작업 실행기는 "없으면 안 보인다" 로 충분하다. */
  /** ws 를 인자로 받는다 — 프로젝트를 여는 경로에서는 setState 가 아직 반영되기 전이라
   *  this.state.workspace 가 **직전 프로젝트**(또는 null)다. 그걸 읽어 처음엔 늘 빈 목록이었다. */
  private async loadTasks(ws0?: SchutzWorkspaceTree) {
    const ws = ws0 ?? this.state.workspace;
    if (!ws || !window.schutz) { this.setState({ tasks: [] }); return; }
    if (!ws.entries.some(e => !e.dir && e.rel === "package.json")) { this.setState({ tasks: [] }); return; }
    try {
      const pkg = JSON.parse(await window.schutz.readFile(ws.root, "package.json"));
      const scripts = pkg?.scripts;
      if (!scripts || typeof scripts !== "object") { this.setState({ tasks: [] }); return; }
      const tasks = Object.entries(scripts)
        .filter(([n, c]) => typeof n === "string" && typeof c === "string")
        .slice(0, 60)
        .map(([name, cmd]) => ({ name, cmd: String(cmd) }));
      this.setState({ tasks });
    } catch { this.setState({ tasks: [] }); }
  }

  /** 지금 열려 있는 파일 하나를 실행한다.
   *
   *  출력 패널이 아니라 **진짜 터미널**에서 돌린다. Code Runner 류가 출력 채널을 쓰다가
   *  stdin 이 없어 input() 이 멈추는 게 가장 흔한 불만인데, 여기서는 작업 실행이 쓰는
   *  그 PTY 를 그대로 쓰므로 입력·색·Ctrl+C 가 공짜로 따라온다.
   *
   *  자동 실행은 없다 — 남이 준 저장소를 열어보는 일이 흔하고, 키 하나로 임의 코드가
   *  도는 것과 폴더를 여는 것만으로 도는 것은 전혀 다른 이야기다. */
  async runActiveFile() {
    const ws = this.state.workspace;
    const rel = this.state.active[this._focusSlot];
    if (!ws || !window.schutz || !rel || this.parseDiffKey(rel) || this.parsePreviewKey(rel)) {
      this.toast("info", t("runfile.noFile")); return;
    }
    const lang = langFor(rel);
    if (!lang) { this.toast("info", t("runfile.unsupported", { ext: rel.split(".").pop() ?? "" })); return; }

    // 저장하지 않은 채 실행하면 방금 고친 게 아니라 옛 파일이 돈다 — 조용히 저장한다.
    if (this.isDirtyRel(rel)) {
      this.toast("info", t("runfile.saveFirst"));
      const pane = paneRegistry.panes.get(rel);
      if (pane) await pane.save(); else await this.saveAllDirtyModels(true);
    }

    // 없는 도구를 눌렀을 때 셸 오류를 그대로 토해내지 않는다.
    try {
      const found = await window.schutz.whichTool(lang.requires);
      if (!found.ok) { this.toast("error", t("runfile.missingTool", { tool: lang.requires })); return; }
    } catch { /* 조회 실패는 막지 않는다 — 실행해 보고 셸이 말하게 둔다 */ }

    const tmp = await window.schutz.tmpDir().catch(() => "");
    // 루트가 역슬래시를 쓰면(윈도) 이어 붙이는 쪽도 맞춘다 — copyPath 와 같은 규칙이다.
    const win = ws.root.includes("\\");
    const abs = win ? ws.root.replace(/[\\/]+$/, "") + "\\" + rel.replace(/\//g, "\\")
                    : ws.root.replace(/\/+$/, "") + "/" + rel;
    const r = planRun({ absFile: abs, platform: win ? "win32" : "posix", tmpDir: tmp, override: getRunOverride(rel) });
    if (r.ok === false) { this.toast("info", t("runfile.unsupported", { ext: r.ext })); return; }
    this.addTerm(r.plan.command);
  }

  /** 작업 실행 — 새 터미널에서 `npm run <name>`. 터미널에 남으므로 출력·중지가 그대로 된다. */
  runTask(name: string) {
    this.addTerm(`npm run ${name}`);
    this.setState({ cmdOpen: false });
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
  /** 이 제안에서 고른 헝크만 반영한 replace.
   *  선택 기록이 없으면 원래 replace 를 **그대로** 돌려준다 — 기본이 전부 선택이다. */
  private effectiveReplace(p: Proposal): string {
    const sel = this.state.hunkSel[p.id];
    if (!sel) return p.replace;
    return composeFromHunks(buildHunks(p.find, p.replace), new Set(sel));
  }

  /** 헝크 하나를 켜고 끈다. 처음 건드리는 순간 "전부 선택" 을 실제 목록으로 펼친다. */
  toggleHunk(p: Proposal, index: number) {
    const hunks = buildHunks(p.find, p.replace);
    this.setState(s => {
      const cur = s.hunkSel[p.id] ?? [...allSelected(hunks)];
      const next = cur.includes(index) ? cur.filter(i => i !== index) : [...cur, index].sort((a, b) => a - b);
      return { hunkSel: { ...s.hunkSel, [p.id]: next } };
    });
  }

  /* ── 체크포인트 ──────────────────────────────────────────────────────────
   * 자율성이 `auto` 면 편집이 묻지도 않고 적용된다. 지금까지 회수 수단은 파일별
   * Monaco 실행취소와 git 뿐이라 "방금 그 실행이 한 일 전부" 를 되돌릴 수가 없었다.
   *
   * 캡처 지점은 여기 한 곳이다 — acceptProposal 이 _acceptQueue 로 직렬화하고
   * 자동 수락도 이 경로를 탄다. execTool 에 걸면 두 군데가 되고, 거절될 제안까지
   * 스냅샷하게 된다. 해시는 전부 메인에서 계산한다(engine/checkpoints.ts 참고). */

  /** 이번 세션에서 아직 닫지 않은 루트 실행들. 턴이 끝날 때 한꺼번에 닫는다. */
  private _cpOpen = new Set<string>();

  /** 쓰기 **직전** 에 원본을 잡아 둔다. 실패해도 편집은 그대로 진행한다 —
   *  안전망을 못 깔았다고 편집을 막으면 더 나쁘다. 대신 목록에 안 뜨므로 조용하지 않다. */
  /** 이 창의 id. 체크포인트 주인 표시에 쓴다 — 저장하지 않는다(창이 죽으면 같이 죽어야 한다). */
  private _cpOwner = "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  private _cpBeatTimer: ReturnType<typeof setInterval> | null = null;

  /** 열린 체크포인트에 "살아 있다" 를 주기적으로 남긴다. 이게 없으면 다른 창이 조용한
   *  실행을 죽은 것으로 오인해 닫고, 뒤이어 보관 상한이 지워 버린다. */
  private startCpHeartbeat() {
    if (this._cpBeatTimer) return;
    this._cpBeatTimer = setInterval(() => {
      const root = this.state.workspace?.root;
      if (!root || !window.schutz?.cpBeat || !this._cpOpen.size) return;
      for (const id of this._cpOpen) void window.schutz.cpBeat(root, id).catch(() => { /* 부가 정보 */ });
    }, 15_000);
  }

  private async captureBefore(root: string, p: Proposal) {
    if (!p.rootRunId || !window.schutz) return;
    try {
      await window.schutz.cpCapture(root, p.rootRunId, p.rel, p.find === "" ? "create" : "modify", Date.now(), this._cpOwner);
      this._cpOpen.add(p.rootRunId);
      this.startCpHeartbeat();
    } catch { /* 체크포인트 실패가 편집을 막으면 안 된다 */ }
  }

  /** 우리가 쓴 직후의 내용을 기록한다. 이게 "그 뒤로 누가 고쳤나" 의 기준이 된다. */
  private async markAfter(root: string, p: Proposal) {
    if (!p.rootRunId || !window.schutz) return;
    try { await window.schutz.cpMark(root, p.rootRunId, p.rel); } catch { /* 위와 같다 */ }
  }

  /** 턴이 끝났다 — 열린 체크포인트를 닫고 보관 상한을 적용한다.
   *  무엇을 버릴지는 pruneCheckpoints(순수 함수)가 정한다. 메인에는 정책이 없다. */
  private async closeCheckpoints() {
    const root = this.state.workspace?.root;
    if (!root || !window.schutz || !this._cpOpen.size) return;
    const ids = [...this._cpOpen];
    this._cpOpen.clear();
    if (this._cpBeatTimer) { clearInterval(this._cpBeatTimer); this._cpBeatTimer = null; }
    let headers: CheckpointInfo[] = [];
    try {
      for (const id of ids) headers = await window.schutz.cpClose(root, id);
      for (const id of pruneCheckpoints(headers, CHECKPOINT_LIMITS)) {
        await window.schutz.cpDrop(root, id);
        headers = headers.filter(h => h.rootRunId !== id);
      }
    } catch { /* 보관 정리 실패는 다음 턴에 다시 시도된다 */ }
    this.setState({ checkpoints: headers });
  }

  /** root 를 넘길 수 있게 둔 이유: 프로젝트를 여는 도중에 부르면 state.workspace 는
   *  아직 **이전** 프로젝트다(loadTasks 가 정확히 그래서 남의 스크립트를 보여줬다). */
  private async refreshCheckpoints(root0?: string) {
    const root = root0 ?? this.state.workspace?.root;
    if (!root || !window.schutz) { this.setState({ checkpoints: [] }); return; }
    try {
      let headers = await window.schutz.cpList(root);
      // 실행 도중에 앱이 죽으면 그 체크포인트는 open 인 채로 남는다. 그러면 목록에도 안 뜨고
      // (돌고 있는 줄 안다) 보관 상한에서도 빠져 영영 안 지워진다.
      //
      // 그 청소는 **지금 도는 게 없을 때만** 해야 한다. 실행 중에 열린 것을 닫으면 그 실행이
      // 아직 파일을 더 건드릴 참인데 보관 상한이 그걸 지워 버릴 수 있다.
      // 창이 둘이면 이 판단이 어려워진다 — 예전엔 주인 개념이 없어서 **놀고 있는 창이
      // 옆 창에서 돌고 있는 실행의 체크포인트를 닫았고**, 이어서 보관 상한이 그걸 지웠다.
      // 무엇을 치워도 되는지는 sweepableRuns(순수 함수)가 정한다.
      const selfBusy = this._cpOpen.size > 0 || this.engine.runs.hasActiveAgentRuns();
      for (const id of sweepableRuns(headers, { ownerId: this._cpOwner, now: Date.now(), staleMs: CHECKPOINT_STALE_MS, selfBusy })) {
        headers = await window.schutz.cpClose(root, id);
      }
      for (const id of pruneCheckpoints(headers, CHECKPOINT_LIMITS)) {
        await window.schutz.cpDrop(root, id);
        headers = headers.filter(h => h.rootRunId !== id);
      }
      this.setState({ checkpoints: headers });
    } catch { this.setState({ checkpoints: [] }); }
  }

  /** 되돌리기 1단계 — 계산해서 **보여준다.** 아직 아무것도 안 쓴다. */
  async askUndoRun(runId: string) {
    const root = this.state.workspace?.root;
    if (!root || !window.schutz) return;
    let probe: Awaited<ReturnType<NonNullable<typeof window.schutz>["cpProbe"]>>;
    try { probe = await window.schutz.cpProbe(root, runId); }
    catch (e) { this.toast("error", e instanceof Error ? e.message : String(e)); return; }
    if (!probe) { this.toast("error", t("cp.missing")); await this.refreshCheckpoints(); return; }

    // 저장 안 한 버퍼가 떠 있으면 디스크를 되돌려도 다음 Ctrl+S 가 도로 덮는다.
    // 그 사실은 렌더러만 안다 — 메인이 준 디스크 상태에 여기서 얹는다.
    const disk = new Map<string, DiskState>(
      probe.disk.map(([rel, d]) => [rel, { ...d, dirtyInEditor: projectModels.isDirty(rel) }]),
    );
    const plan = planUndo(probe.entries, disk);
    if (!actionable(plan).length) { this.toast("info", t("cp.nothingToUndo")); return; }
    this.setState({ undoAsk: { runId, plan, busy: false } });
  }

  /** 되돌리기 2단계 — 확인된 것만 실행한다. 충돌 항목은 애초에 목록에 없다. */
  async confirmUndoRun() {
    const ask = this.state.undoAsk;
    const root = this.state.workspace?.root;
    if (!ask || !root || !window.schutz || ask.busy) return;
    this.setState({ undoAsk: { ...ask, busy: true } });
    const acts = actionable(ask.plan).map(v => ({ rel: v.rel, action: v.action as "restore" | "delete" }));
    try {
      const r = await window.schutz.cpRestore(root, ask.runId, acts);
      // 디스크가 바뀌었으니 열린 모델을 디스크 기준으로 다시 맞춘다 — 안 하면
      // 되돌린 파일이 에디터에서는 예전 그대로 보이고, 저장하는 순간 도로 덮인다.
      //
      // **되돌린 파일만** 건드린다. 예전엔 reloadAll(…, () => false) 이었는데,
      // 그 상수 false 는 "미저장 여부를 묻지 마라" 라서 되돌리기와 무관한 파일의
      // 미저장 버퍼까지 전부 디스크로 덮었다 — askUndoRun 이 화면에 "저장 안 한
      // 편집은 건드리지 않는다" 고 적어 놓고 실행이 그 약속을 어기고 있었다.
      const deleted = new Set(acts.filter(a => a.action === "delete").map(a => a.rel));
      for (const rel of r.done) {
        if (deleted.has(rel)) { projectModels.drop(root, rel); continue; } // 남기면 다음 저장이 되살린다
        try { projectModels.reload(root, rel, await window.schutz.readFile(root, rel), false); }
        catch { projectModels.drop(root, rel); }
      }
      const tree = await window.schutz.readTree(root);
      this.setState({ workspace: tree, undoAsk: null });
      if (r.failed.length) {
        this.toast("error", t("cp.undoPartial", { n: r.done.length, m: r.failed.length }));
      } else {
        this.toast("ok", t("cp.undoDone", { n: r.done.length }));
      }
      await window.schutz.cpDrop(root, ask.runId);   // 되돌린 체크포인트는 남길 이유가 없다
      await this.refreshCheckpoints();
      void this.loadGit();
    } catch (e) {
      this.setState({ undoAsk: null });
      this.toast("error", e instanceof Error ? e.message : String(e));
    }
  }

  /** 제안 수락: find→replace를 실제 파일에 적용 */
  private async _acceptProposal(id: string) {
    // 동기 등록본 우선 — 자동수락 시 아직 state 에 커밋 안 됐어도 조회 가능(파일 미기록인데 성공 보고되는 버그 방지)
    const p = this._proposalsById.get(id) ?? this.state.proposals.find(x => x.id === id);
    const ws = this.state.workspace;
    if (!p || !ws || !window.schutz || p.status !== "pending") return;
    // 고른 헝크만 반영한 replace. 헝크를 안 건드렸으면(기본) 원래 replace 와 글자 하나까지 같다
    // — 그래야 줄 단위 수락을 얹어도 기존 적용이 그대로다(review/hunks.ts 의 불변 조건).
    const eff = this.effectiveReplace(p);
    // 헝크를 전부 껐으면 쓸 게 없다. 조용히 "수락됨" 으로 만들면 바뀐 줄 알고 넘어간다.
    if (eff === p.find) { this.toast("info", t("hunk.noneSelected")); return; }
    try {
      let newContent: string;
      let editStart = -1, editEnd = -1; // 애니메이션 대상 범위
      if (p.find === "") {
        // 새 파일 생성 — 기존 파일 덮어쓰기 방지
        const exists = await window.schutz.readFile(ws.root, p.rel).then(() => true, () => false);
        if (exists) throw new Error(t("proposal.fileExists"));
        newContent = eff;
        await this.captureBefore(ws.root, p);
        await window.schutz.writeFile(ws.root, p.rel, newContent);
        await this.markAfter(ws.root, p);
        const tree = await window.schutz.readTree(ws.root);
        this.setState({ workspace: tree });
        // 빈 파일 → 전체 내용. 파일이 열리며 코드가 타이핑되는 장면이 여기서 나온다
        editStart = 0; editEnd = 0;
      } else {
        // 기준은 **열린 버퍼**다(미저장이면). 디스크를 기준으로 잡고 쓰면 그 write 가
        // 사용자의 미저장 편집을 통째로 지우는데, 뒤이어 markSaved 까지 걸려 dirty 표시도
        // 같이 사라진다 — 무엇을 잃었는지조차 알 수 없게 된다. 버퍼 위에 얹으면 편집이
        // 살아남고 기준선도 정직해진다. 버퍼에서 find 를 못 찾으면 아래 오류가 뜨는데,
        // 그게 맞는 결과다("안전하게 못 하겠다").
        const cur = this.baseTextFor(ws.root, p.rel) ?? await window.schutz.readFile(ws.root, p.rel);
        const res = applyProposal({ base: cur, find: p.find, replace: eff, range: p.range });
        if (res.ok === false) throw new Error(t(res.error === "multiple" ? "sc1.orig_multiple" : "sc1.orig_not_found"));
        newContent = res.text;
        await this.captureBefore(ws.root, p);
        await window.schutz.writeFile(ws.root, p.rel, newContent);
        await this.markAfter(ws.root, p);
        editStart = res.start;
        editEnd = res.end;
      }
      extHost.notifyExtensions("proposal.accept", { rel: p.rel, agent: p.agent });
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
      if (!canAnimate) { this.forceModelText(m, finalText); return; }
      await typeEdit(m, start, end, replacement, { reveal: true, slow: this._demoTyping ? DEMO_TYPE_SLOWDOWN : 1 });
      // 애니메이션 중 다른 편집이 끼어들었을 수 있다 — 최종본과 다르면 맞춘다
      this.forceModelText(m, finalText);
    } catch {
      if (!m.isDisposed()) this.forceModelText(m, finalText);
    }
  }

  /** 모델을 최종본으로 맞춘다 — **undo 스택에 남게.**
   *  setValue 는 undo 이력을 통째로 날려서, 여기서 덮인 사용자 편집을 Ctrl+Z 로도 못 찾는다.
   *  pushEditOperations 는 결과가 같고 되돌릴 수 있다. */
  private forceModelText(m: monaco.editor.ITextModel, finalText: string) {
    if (m.getValue() === finalText) return;
    m.pushEditOperations([], [{ range: m.getFullModelRange(), text: finalText }], () => null);
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
    const p = this._proposalsById.get(id) ?? this.state.proposals.find(x => x.id === id);
    if (p && p.status === "pending") extHost.notifyExtensions("proposal.reject", { rel: p.rel, agent: p.agent });
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
  private _confirmResolve: ((ok: boolean) => void) | null = null;

  /** 인앱 확인 — window.confirm 을 대신한다.
   *
   *  OS 대화상자는 세 가지가 나쁘다: 렌더러를 통째로 얼려 애니메이션·타이머가 멈추고,
   *  앱 테마를 따르지 않으며, 문구를 한 덩어리로만 실어 "무엇을" 지우는지 강조할 자리가
   *  없다. askRunApproval 이 같은 이유로 이미 이 모양을 쓰고 있다.
   *
   *  이미 물어보는 중이면 앞선 물음을 취소로 닫는다 — 확인창이 겹쳐 쌓이면 어느 쪽에
   *  답한 것인지 알 수 없다. */
  private askConfirm(o: { title: string; body: string; okLabel: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
    this._confirmResolve?.(false);
    return new Promise<boolean>(resolve => {
      this._confirmResolve = resolve;
      this.setState({ confirmAsk: { ...o, cancelLabel: o.cancelLabel ?? t("confirm.cancel") } });
    });
  }
  /** 상태바 항목의 등록 순서. 우선순위가 같을 때 자리를 고정한다. */
  private _sbSeq = 0;

  /** 확장이 올린 상태바 항목 하나. 누르면 그 확장이 붙여 둔 명령이 돈다. */
  private renderExtStatus(align: number) {
    const items = sbOrdered(this.state.extStatus, align);
    if (!items.length) return null;
    return <>{items.map(it => (
      <button key={it.id} className={it.run ? "hv08" : undefined} title={it.tooltip} disabled={!it.run}
        onClick={it.run ? () => { try { it.run!(); } catch { /* 확장이 던져도 상태바는 살아 있어야 한다 */ } } : undefined}
        style={{ flex: "none", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          height: 19, padding: "0 6px", fontFamily: SUIT, fontSize: 10.5, borderRadius: 5, border: "none",
          background: "transparent", color: "var(--fg-dim)", cursor: it.run ? "pointer" : "default" }}>{it.text}</button>
    ))}</>;
  }

  private _extAskResolve: ((v: any) => void) | null = null;

  /** 확장의 물음을 띄우고 답을 기다린다. 취소면 undefined 로 푼다 — vscode 규약이다.
   *
   *  물음이 이미 떠 있으면 앞의 것을 **취소로** 닫는다. 겹쳐 쌓이면 어느 물음에 답한
   *  것인지 알 수 없고, 확장 쪽 await 는 둘 다 살아 있다(askConfirm 과 같은 규칙). */
  private askExtension(req: PromptReq): Promise<any> {
    this._extAskResolve?.(undefined);
    return new Promise<any>(resolve => {
      this._extAskResolve = resolve;
      const picked = req.kind === "pick" ? req.items.filter(i => i.picked).map(i => i.index) : [];
      this.openO({
        extAsk: req,
        extAskText: req.kind === "input" ? req.value : "",
        extAskSel: 0, extAskPicked: picked, extAskErr: null,
      });
      // 확장이 준 초기값이 이미 규칙에 어긋날 수 있다. 열자마자 검사하지 않으면
      // 멀쩡해 보이는 값에 확인을 눌러야 비로소 왜 안 되는지 알게 된다.
      //
      // 여기서는 state 를 보면 안 된다. 바로 위의 setState 는 아직 반영되지 않았을 수
      // 있어서(React 가 마이크로태스크에서 몰아 처리한다) `extAsk`·`extAskText` 둘 다
      // 옛 값이고, 그걸 "그 사이 다른 물음으로 바뀌었다" 로 읽어 조용히 지나갔다.
      // **기다리는 resolve** 는 동기적으로 이미 정해져 있으니 그걸로 신원을 확인한다.
      //
      // 사용자가 그 사이 타자를 쳤다면 그쪽 onChange 가 더 최신 답을 덮어쓴다.
      if (req.kind === "input") {
        void validateInput(req.validate, req.value).then(m => {
          if (this._extAskResolve === resolve) this.setState({ extAskErr: m });
        });
      }
    });
  }
  private answerExtension(v: any) {
    const r = this._extAskResolve;
    this._extAskResolve = null;
    this.setState({ extAsk: null, extAskText: "", extAskPicked: [], extAskErr: null }, () => r?.(v));
  }

  /** 지금 걸러낸 목록. 렌더와 키 처리가 같은 것을 봐야 커서가 어긋나지 않는다. */
  private extAskVisible(): NormPick[] {
    const a = this.state.extAsk;
    if (a?.kind !== "pick") return [];
    return filterPicks(a.items, this.state.extAskText, a.match);
  }

  private async extAskSubmit() {
    const a = this.state.extAsk;
    if (!a) return;
    if (a.kind === "input") {
      const msg = await validateInput(a.validate, this.state.extAskText);
      // 확인을 누른 뒤에도 다시 검사한다 — 타자 중 검사만 믿으면 마지막 글자가 빠진다.
      if (msg) { this.setState({ extAskErr: msg }); return; }
      this.answerExtension(this.state.extAskText);
      return;
    }
    if (a.kind === "pick") {
      if (a.many) { this.answerExtension(this.state.extAskPicked.slice().sort((x, y) => x - y)); return; }
      const vis = this.extAskVisible();
      const it = vis[this.state.extAskSel];
      // 걸러낸 결과가 비었으면 고를 것이 없다. 여기서 취소로 닫으면 확장은 사용자가
      // 그만둔 줄 안다 — 실제로는 오타 하나였을 수 있으므로 아무것도 하지 않는다.
      if (!it) return;
      this.answerExtension(it.index);
    }
  }

  private answerConfirm(ok: boolean) {
    const r = this._confirmResolve;
    this._confirmResolve = null;
    this.setState({ confirmAsk: null }, () => r?.(ok));
  }

  /** 실행 승인 대기 — window.confirm 은 렌더러를 통째로 얼려서 인앱 모달로 바꿨다.
   *  labels 를 주면 버튼 문구를 갈아끼운다: 커밋 게이트처럼 "허용/거부" 가 어색한 자리를 위해. */
  private askRunApproval(command: string, rationale: string, agent: string, labels?: { ok: string; cancel: string }): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this._askRunResolve = resolve;
      this.setState({ askRun: { command, rationale, agent, okLabel: labels?.ok, cancelLabel: labels?.cancel } });
    });
  }
  private answerRun(ok: boolean) {
    const r = this._askRunResolve;
    this._askRunResolve = null;
    this.setState({ askRun: null }, () => r?.(ok));
  }

  /** 켤 때 잔여 할당량 조회 — 헤더는 요청을 보내야 오므로 1토큰짜리 최소 요청을 한 번 던진다.
   *  실패해도 조용히 넘어간다(대화에는 영향 없음). */
  /** 잔여량이 마지막으로 갱신된 시각. 실요청 헤더(onQuota)와 이 조회가 함께 갱신한다. */
  private _lastQuotaAt = 0;
  private _quotaTimer: ReturnType<typeof setInterval> | null = null;
  private _quotaProbing = false;
  /** 이보다 오래된 값이면 다시 조회한다. 벤더 창이 5시간·7일 단위라 분 단위로 볼 이유는 없고,
   *  조회 한 번이 실제 요청 한 번(1토큰)이라 짧게 잡을수록 그냥 낭비다. */
  private static QUOTA_STALE_MS = 10 * 60_000;

  /** 주기 틱과 창 복귀에서 부른다. 낡았고, 보이고, 이미 조회 중이 아닐 때만 실제로 나간다. */
  private maybeProbeQuotas = () => {
    // 창이 가려져 있으면 아무도 안 본다 — 다시 보일 때 visibilitychange 로 어차피 한 번 더 온다.
    const go = shouldProbeQuota({
      now: Date.now(),
      lastAt: this._lastQuotaAt,
      hidden: document.visibilityState === "hidden",
      probing: this._quotaProbing,
      staleMs: App.QUOTA_STALE_MS,
    });
    if (go) void this.probeQuotas();
  };

  private async probeQuotas() {
    if (!window.schutz?.quotaProbe) return;
    this._quotaProbing = true;
    try { await this._probeQuotasInner(); } finally { this._quotaProbing = false; }
  }

  private async _probeQuotasInner() {
    for (const id of ["claude", "gpt"]) {
      // **freshOAuth** 다. getOAuth 는 저장된 토큰을 그대로 주는데, 액세스 토큰 수명이
      // 한 시간쯤이라 마지막 사용 뒤 한 참 있다가 켜면 거의 항상 만료돼 있다. 그러면 이
      // 조회만 401 로 튕기고(대화 경로는 둘 다 freshOAuth 를 쓰니 멀쩡하다) 헤더가 안 와서,
      // **켤 때마다 잔여량이 아예 안 보이다가 첫 메시지를 보내야 나타났다.**
      const tok = await freshOAuth(id === "gpt" ? "codex" : id);
      if (!tok?.access) continue;
      try {
        const r = await window.schutz!.quotaProbe({ provider: id, access: tok.access, accountId: tok.accountId ?? null });
        if (r.ok && r.quota) {
          this._lastQuotaAt = Date.now();
          this.setState(st => ({ quota: { ...st.quota, [id]: r.quota! } }));
        }
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
      plan: stopPlan(s.plan),
      tools: s.tools.map(t => t.st === "run" ? { ...t, st: "stopped" as const, note: "중지" } : t),
      messages: s.messages.map(m => m.streaming ? { ...m, streaming: false } : m),
      agents: Object.fromEntries(Object.entries(s.agents).map(([k, a]) => [k, (a.status === "edit" || a.status === "plan") ? { ...a, status: "stop" as const, file: null } : a])),
    }));
    // 검토할 것이 남았는지는 제안 목록이 안다 — 예전엔 데모 문서의 줄 상태를 세어 판정했다.
    this.qt(() => this.setState(s => {
      if (s.statusKey !== "stopped") return null;
      return { statusKey: s.proposals.some(p => p.status === "pending") ? "review" : "idle" } as any;
    }), 1800);
  }


  /** 파일을 포커스된 슬롯의 탭으로 연다 (이미 어느 슬롯에 열려 있으면 그 슬롯을 활성화) */
  /** 편집 위치 기록. "방금 어디 있었더라" 를 되짚는 길이 없어서, 정의로 점프하고 나면
   *  원래 자리로 돌아오려면 파일 이름과 줄 번호를 외우고 있어야 했다. */
  private _nav: NavState = emptyNav();
  /** 뒤로/앞으로 이동하는 중 — 그때의 openFile 은 새 자리로 기록하면 안 된다(무한 전진). */
  private _navJumping = false;

  /** 지금 커서가 있는 자리를 기록에 반영한다. 같은 자리면 줄 번호만 갱신된다.
   *  커서 이동마다 이벤트를 다는 대신, **떠나기 직전**에 한 번 읽는다 —
   *  Monaco 리스너를 페인마다 붙이지 않아도 결과가 같다. */
  private navSync() {
    const rel = this.state.active[this._focusSlot];
    if (!rel || this.parseDiffKey(rel) || this.parsePreviewKey(rel)) return;
    const line = paneRegistry.panes.get(rel)?.editor.getPosition()?.lineNumber ?? 1;
    this._nav = navPush(this._nav, { rel, line });
  }

  /** 어딘가로 갔다 — 기록에 남긴다. diff·프리뷰 탭은 되돌아갈 "자리" 가 아니라 뺀다. */
  private navRecord(rel: string) {
    if (this._navJumping) return;
    if (this.parseDiffKey(rel) || this.parsePreviewKey(rel)) return;
    this.navSync();                    // 떠나기 직전 자리를 최신으로
    const line = paneRegistry.panes.get(rel)?.editor.getPosition()?.lineNumber ?? 1;
    this._nav = navPush(this._nav, { rel, line });
  }

  /** Alt+← / Alt+→. 갈 곳이 없으면 아무 일도 하지 않는다(VS Code 와 같다). */
  private navGo(dir: -1 | 1) {
    this.navSync();
    const next = dir < 0 ? navBack(this._nav) : navForward(this._nav);
    if (next === this._nav) return;    // 같은 객체 = 끝에 닿았다
    this._nav = next;
    const spot = navCurrent(next);
    if (!spot) return;
    this._navJumping = true;
    this.openFile(spot.rel);
    this.revealInPane(spot.rel, spot.line, 1);
    // openFile 의 setState 콜백과 revealInPane 폴링이 끝난 뒤에 풀어야 그 사이의
    // openFile 이 새 자리로 기록되지 않는다.
    setTimeout(() => { this._navJumping = false; }, 0);
  }

  openFile(path: string) {
    extHost.notifyExtensions("file.open", { rel: path });
    this.navRecord(path);
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
  private async consumeAttachments(): Promise<{ block: string; summary: string; images: { mime: string; data: string }[] }> {
    const items = this.state.attach;
    if (!items.length) return { block: "", summary: "", images: [] };
    const ws = this.state.workspace;
    const parts: string[] = [];
    const images: { mime: string; data: string }[] = [];
    for (const a of items) {
      if (a.kind === "selection") {
        parts.push(`# 선택 영역 (${a.label})\n\`\`\`\n${(a.text ?? "").slice(0, 12_000)}\n\`\`\``);
      } else if (a.kind === "upload") {
        // 사진은 이미지 블록으로 따로 실어 보내고, 글자 파일은 본문에 붙인다.
        if (a.data && a.mime) images.push({ mime: a.mime, data: a.data });
        else if (a.text != null) parts.push(`# 첨부 파일 ${a.label}\n\`\`\`\n${a.text.slice(0, 20_000)}\n\`\`\``);
      } else if (ws && window.schutz) {
        try {
          const content = await window.schutz.readFile(ws.root, a.rel);
          parts.push(`# 파일 ${a.rel}\n\`\`\`\n${content.slice(0, 20_000)}\n\`\`\``);
        } catch { /* 무시 */ }
      }
    }
    const summary = items.map(a => (a.kind === "selection" ? "✂ " : a.kind === "upload" ? "🖼 " : "@") + a.label).join(", ");
    this.setState({ attach: [] });
    return { block: parts.length ? "\n\n--- 첨부 컨텍스트 ---\n" + parts.join("\n\n") : "", summary, images };
  }

  /** 사람이 고른/붙여넣은/끌어다 놓은 실제 파일을 첨부 목록에 넣는다.
   *  Electron 렌더러에서도 File/FileReader 가 그대로 되므로 별도 IPC 를 두지 않는다 —
   *  덕분에 워크스페이스 밖 사진도, 클립보드 스크린샷도 같은 길로 들어온다. */
  private async addUploads(files: File[]) {
    const MAX = 8 * 1024 * 1024;                 // 한 장 8MB — 그 이상은 모델도 잘 못 받는다
    const next: AttachRef[] = [];
    for (const f of files.slice(0, 6)) {
      if (f.size > MAX) { this.toast("error", t2("chat.attachTooBig", { name: f.name })); continue; }
      const isImage = f.type.startsWith("image/");
      try {
        if (isImage) {
          const data = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onerror = () => rej(r.error);
            // data:<mime>;base64,<...> 에서 뒤쪽만 쓴다(프로바이더가 원본 base64 를 원한다)
            r.onload = () => res(String(r.result).split(",")[1] ?? "");
            r.readAsDataURL(f);
          });
          next.push({ kind: "upload", rel: "", label: f.name, mime: f.type, data, size: f.size });
        } else {
          const text = await f.text();
          next.push({ kind: "upload", rel: "", label: f.name, text, size: f.size });
        }
      } catch { this.toast("error", t2("chat.attachReadFail", { name: f.name })); }
    }
    if (next.length) this.setState(s => ({ attach: [...s.attach, ...next] }));
  }

  /** 컴포저에 붙여넣기 — 클립보드에 이미지가 있으면(스크린샷 등) 그대로 첨부한다. */
  private onComposerPaste = (e: React.ClipboardEvent) => {
    const files = [...(e.clipboardData?.items ?? [])]
      .filter(it => it.kind === "file")
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();                          // 파일이 있을 때만 기본 붙여넣기를 막는다
    void this.addUploads(files);
  };

  /** 컴포저에 끌어다 놓기. */
  private onComposerDrop = (e: React.DragEvent) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    // 번들은 첨부가 아니라 설치다 — 전역 핸들러가 잡았으니 여기선 흘려보낸다.
    if (files.some(f => isBundleName(f.name))) return;
    e.preventDefault();
    void this.addUploads(files);
  };

  /* ── MCP 번들(.mcpb) ─────────────────────────────────────────────────────
   * 창 아무 데나 끌어다 놓으면 MCP 서버가 된다. 남이 만든 파일이 우리 기계에서
   * 명령을 실행하게 되는 일이라, **무엇을 실행할지 보여 준 뒤에만** 등록한다. */

  private onWindowDrop = (e: DragEvent) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    const bundle = files.find(f => isBundleName(f.name));
    if (!bundle) return;
    e.preventDefault();
    e.stopPropagation();
    // Electron 32 부터 File.path 가 없다 — preload 의 webUtils 로만 실제 경로를 얻는다.
    const p = window.schutz?.pathForFile(bundle) ?? "";
    if (!p) { this.toast("error", t("mcpb.noPath")); return; }
    void this.openBundle(p);
  };
  private onWindowDragOver = (e: DragEvent) => {
    // 파일 드래그를 브라우저 기본 동작(그 파일로 네비게이트)에 맡기면 앱이 통째로 날아간다.
    if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  };

  /** 파일을 골라 설치 — 끌어다 놓기만으로는 있는 줄 모른다. */
  async pickBundle() {
    if (!window.schutz) return;
    const p = await window.schutz.mcpbPick();
    if (p) await this.openBundle(p);
  }

  /** 번들을 풀어 보고 확인 화면을 띄운다. 아직 등록하지 않는다. */
  async openBundle(filePath: string) {
    if (!window.schutz) return;
    const r = await window.schutz.mcpbOpen(filePath);
    if (!r.ok) { this.toast("error", r.error || t("mcpb.openFailed")); return; }
    const parsed = parseMcpbManifest(r.manifest, bundlePlatform());
    // `!parsed.ok` 로 쓰면 좁혀지지 않는다(이 tsconfig 는 truthiness 로 리터럴 판별을 못 한다).
    if (parsed.ok === false) {
      void window.schutz.mcpbDiscard();
      this.toast("error", parsed.why);
      return;
    }
    const m = parsed.manifest;
    this.setState({
      mcpb: {
        manifest: m,
        values: initialValues(m.userConfig),
        busy: false,
        exists: this.state.mcpServers.some(x => x.name === m.name),
      },
    });
  }

  closeBundle() {
    void window.schutz?.mcpbDiscard();
    this.setState({ mcpb: null });
  }

  /** 확정 — 푼 것을 제 이름으로 옮기고, 채운 값으로 명령을 완성해 MCP 로 등록한다. */
  async installBundle() {
    const b = this.state.mcpb;
    if (!b || b.busy || !window.schutz) return;
    const m = b.manifest;
    if (missingRequired(m.userConfig, b.values).length) return;
    this.setState({ mcpb: { ...b, busy: true } });
    try {
      const c = await window.schutz.mcpbCommit(m.name);
      if (!c.ok || !c.dir) throw new Error(c.error || t("mcpb.commitFailed"));
      const resolved = resolveServer(m, {
        dirname: c.dir.replace(/\\/g, "/"),   // 인자에 들어가므로 구분자를 하나로 통일한다
        home: "", sep: "/",
        userConfig: b.values,
      });
      // 안 채워진 `${…}` 가 남았으면 실행해 봐야 엉뚱하게 돈다. 여기서 멈추고 말한다.
      if (resolved.unresolved.length) {
        throw new Error(t("mcpb.unresolved", { keys: resolved.unresolved.join(", ") }));
      }
      const added = await window.schutz.mcpAdd(m.name, {
        command: resolved.command, args: resolved.args, env: resolved.env,
        cwd: c.dir, overwrite: true,
      });
      if (!added.ok) throw new Error(added.error || "");
      this.setState({ mcpb: null });
      const started = await window.schutz.mcpStart(m.name);
      await this.refreshMcp();
      this.toast(started?.ok ? "ok" : "info",
        started?.ok ? t("mcpb.installedStarted", { name: m.displayName })
                    : t("mcpb.installedNotStarted", { name: m.displayName }));
    } catch (e) {
      this.setState(s => (s.mcpb ? { mcpb: { ...s.mcpb, busy: false } } : null));
      this.toast("error", e instanceof Error ? e.message : String(e));
    }
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
  /** 탭 드래그 — 같은 슬롯이면 재정렬, 다른 슬롯이면 그 분할로 옮긴다. targetRel 이 있으면 그 앞에 꽂는다. */
  reorderTab(slot: number, targetRel: string) {
    const d = this._dragTab;
    this._dragTab = null;
    if (!d || d.rel === targetRel) return;
    if (d.slot !== slot) { this.moveTab(d.slot, d.rel, slot, targetRel); return; }
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

  /** 탭을 다른 분할(슬롯)로 옮긴다. targetRel 있으면 그 앞, 없으면 끝에. */
  moveTab(fromSlot: number, rel: string, toSlot: number, targetRel?: string) {
    if (fromSlot === toSlot) return;
    this.setState(s => {
      const tabs = s.tabs.map(t => [...t]);
      if (!tabs[toSlot]) return null;
      const fi = (tabs[fromSlot] ?? []).indexOf(rel);
      if (fi < 0) return null;
      tabs[fromSlot].splice(fi, 1);
      if (!tabs[toSlot].includes(rel)) {
        const to = targetRel ? tabs[toSlot].indexOf(targetRel) : -1;
        if (to < 0) tabs[toSlot].push(rel); else tabs[toSlot].splice(to, 0, rel);
      }
      const active = s.active.map((a, i) => {
        if (i === toSlot) return rel;                              // 옮겨온 슬롯은 그 파일을 활성
        if (i === fromSlot && a === rel) return tabs[fromSlot][Math.min(fi, tabs[fromSlot].length - 1)] ?? ""; // 빠진 자리 이웃으로
        return a;
      });
      return { tabs, active } as any;
    }, () => { this._focusSlot = toSlot; try { paneRegistry.panes.get(rel)?.editor.focus(); } catch { /* */ } });
  }

  /** 현재 편집기를 옆 분할로 — VS Code 의 "편집기 분할". 누를 때마다 1→2→4 로 늘리고,
   *  빈 분할이 있으면 거기에, 없으면 다음 슬롯에 같은 파일을 연다. */
  splitActiveEditor(fromSlot: number) {
    const rel = this.state.active[fromSlot];
    if (!rel) return;
    this.setState(s => {
      const layout = s.layout === 1 ? 2 : s.layout === 2 ? 4 : 4;   // 1→2→4, 4에서 더는 안 늘림
      const norm = this.normSlots(s.tabs, s.active, layout);
      const tabs = norm.tabs.map(t => [...t]);
      const active = [...norm.active];
      // 빈 분할을 먼저 채운다(2→4 로 늘리면 새 슬롯 2~3 이 비어 있다). 없으면 다음 슬롯.
      let toSlot = -1;
      for (let i = 0; i < layout; i++) { const j = (fromSlot + 1 + i) % layout; if ((tabs[j] ?? []).length === 0) { toSlot = j; break; } }
      if (toSlot < 0) toSlot = (fromSlot + 1) % layout;
      if (!tabs[toSlot]) tabs[toSlot] = [];
      if (!tabs[toSlot].includes(rel)) tabs[toSlot].push(rel);
      active[toSlot] = rel;
      this._focusSlot = toSlot;
      return { layout, tabs, active, openMenu: null } as any;
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

  /** 이 슬롯에서 한 번에 여러 탭을 닫는다. 미저장 확인은 closeTab 이 각자 하므로
   *  그대로 태운다 — 확인이 뜨면 그 파일만 남고 나머지는 정리된다. */
  closeTabsIn(slot: number, which: "others" | "right" | "all") {
    const here = this.state.tabs[slot] ?? [];
    const cur = this.state.tabMenu?.rel ?? this.state.active[slot];
    const i = here.indexOf(cur);
    const targets =
      which === "all" ? [...here]
      : which === "others" ? here.filter(r => r !== cur)
      : i >= 0 ? here.slice(i + 1) : [];
    // 뒤에서부터 — 앞에서 지우면 인덱스가 밀려 오른쪽 목록이 어긋난다.
    for (const rel of [...targets].reverse()) this.closeTab(slot, rel);
  }

  /** 방금 닫은 탭들 — Ctrl+Shift+T 로 되살린다. 커서·스크롤은 projectModels 가
   *  이미 들고 있어서(saveView) 경로만 기억하면 원래 보던 자리로 그대로 돌아온다. */
  private _closedTabs: { slot: number; rel: string }[] = [];

  reopenClosedTab() {
    for (;;) {
      const last = this._closedTabs.pop();
      if (!last) { this.toast("info", t("tabm.nothingToReopen")); return; }
      if (this.isOpen(last.rel)) continue;          // 그 사이 다시 연 것은 건너뛴다
      this.openFile(last.rel);
      return;
    }
  }

  /** 에디터 글자 크기 한 칸. 설정과 같은 경로를 타므로 모든 페인에 즉시 반영된다. */
  bumpFontSize(delta: number) {
    const cur = getEditorPrefs().fontSize;
    const next = Math.max(9, Math.min(28, cur + delta));
    if (next === cur) return;
    this.applyEditorPref({ fontSize: next });
    this.toast("info", t("misc.fontSizeNow", { n: next }));
  }

  /** 좌측 패널 접기/펴기. 폭은 200 아래로 못 내려가게 막혀 있어서, 좁은 화면에서
   *  코드 폭을 확보할 방법이 아예 없었다. 접기 전 폭을 기억해 그대로 되돌린다. */
  private _leftWBeforeHide = 0;
  toggleSidebar() {
    this.setState(s => {
      if (s.leftW > 0) { this._leftWBeforeHide = s.leftW; return { leftW: 0 }; }
      return { leftW: this._leftWBeforeHide || 272 };
    }, () => { try { localStorage.setItem("schutz.leftW", String(this.state.leftW)); } catch { /* */ } });
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
    // 되살리기 스택 — diff·프리뷰 같은 특수 탭은 경로가 아니라 키라서 담지 않는다.
    if (!this.parseDiffKey(rel) && !this.parsePreviewKey(rel)) {
      this._closedTabs = [...this._closedTabs.filter(c => c.rel !== rel), { slot, rel }].slice(-20);
    }
    // 탭을 곧바로 제거하지 않고 szTabOut 재생 후 언마운트.
    // 전용 타이머 — clearTimers()(stopRun) 가 이 닫기 타이머를 지워 좀비탭(닫힘 상태 영구 고착)이 되지 않도록 _timers 풀 밖에 둔다.
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
        const next = getEditorPrefs().keymap === "vim" ? "intellij" : "vim";
        // 설정 모달과 **같은 경로**로 보낸다. 예전엔 setEditorPrefs + forceUpdate 라
        // 저장은 됐는데 이미 열려 있는 에디터는 그대로였다 — 키맵이 바뀌었다고 말해 놓고
        // 실제로는 다음에 그 파일을 다시 열어야 적용됐다.
        this.applyEditorPref({ keymap: next });
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
    // 빈 입력 + 첨부 없음이면 아무것도 보내지 않는다.
    if (!rawIn && !hasAttach) return;
    const t = rawIn || "첨부한 컨텍스트를 참고해서 진행해줘.";
    const { block, summary, images } = await this.consumeAttachments();
    const display = summary ? t + "\n📎 " + summary : t;
    // 1순위: 앱 내 연결된 계정(OAuth) 또는 API 키 — Schutz 통합 에이전트 루프
    if (this.configuredAgents().length > 0) { void this.runReal(t + block, display, images); return; }
    // 2순위(폴백): 로컬에 설치된 구독 CLI
    if (window.schutz) {
      const ca = this.state.cliAgents;
      if (ca.claude?.ok) { this.runCliTurn("claude", t + block); return; }
      if (ca.codex?.ok) { this.runCliTurn("codex", t + block); return; }
    }
    // 붙은 에이전트가 없다 — 무엇을 해야 하는지 말해 준다.
    {
      this.setState(s => ({
        input: "",
        messages: [...s.messages,
          { id: "u" + (this._uid++), role: "user" as const, text: t },
          // 여기서는 지역변수 t 가 i18n 의 t 를 가린다 — 그래서 t2 별칭으로 부른다.
          // (이 문구가 마지막까지 한국어로 굳어 있던 이유가 그거였다.)
          { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", text: t2("sc3.noAiConnected") }],
      }), () => this.saveSession());
    }
  }

  /** 설정된 프로바이더 id 목록 */
  /** 위임할 수 있는 대상 전부 — 연결된 다른 프로바이더 + 서브에이전트(@이름).
   *  로스터에 광고하는 이름과 startDelegation 이 받아들이는 이름이 여기서 하나로 묶인다. */
  private delegateRoster(self?: string): string[] {
    const providers = this.configuredAgents().filter(id => id !== self);
    return [...providers, ...this.state.subagents.map(targetIdOf)];
  }

  /** 서브에이전트가 있으면 무엇을 하는 인격인지 한 줄씩 붙인다. 없으면 아무것도 안 붙는다. */
  private subagentRosterExtra(): string {
    const lines = rosterLines(this.state.subagents);
    return lines.length ? "\n" + t("sub.rosterHead") + "\n" + lines.map(l => "- " + l).join("\n") : "";
  }

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

  // ── 스킬 (Claude Code 생태계) ───────────────────────────────────────────────
  // SKILL.md 는 Claude API 기능이 아니라 **프롬프트 묶음**이다. 그래서 어느 모델이든 똑같이
  // 쓸 수 있고, Claude 든 GPT 든 같은 도구 하나로 노출한다.
  //
  // 본문을 시스템 프롬프트에 다 넣지 않는다 — 스킬이 수십 개면 매 턴 수만 토큰이 샌다.
  // 목록에는 이름·설명만 주고, 모델이 고른 것만 skill 도구로 읽어 가게 한다.

  /** 스킬 목록을 다시 읽는다(부팅·워크스페이스 변경·플러그인 토글 후). */
  async refreshSkills() {
    if (!window.schutz?.skillsList) return;
    try {
      const r = await window.schutz.skillsList(this.state.workspace?.root ?? null);
      if (r.ok) this.setState({ skills: r.skills });
    } catch { /* 스킬이 없어도 앱은 그대로 돈다 */ }
    // 서브에이전트도 같은 출처(사용자·프로젝트·켠 플러그인)라 같이 읽는다.
    if (!window.schutz.agentsList) return;
    try {
      const r = await window.schutz.agentsList(this.state.workspace?.root ?? null);
      if (r.ok) this.setState({ subagents: r.agents });
    } catch { /* 없어도 그만 */ }
  }

  /** 스킬이 하나라도 있으면 도구 하나를 준다. 이름은 목록에서 고르게 한다. */
  private skillToolDefs(): ToolDef[] {
    const list = this.state.skills;
    if (!list.length) return [];
    return [{
      name: "skill",
      description:
        "사용할 수 있는 스킬(작업 지침 묶음)의 내용을 읽어 온다. 아래 목록에 있는 스킬이 지금 하려는 일과 맞으면, " +
        "먼저 이 도구로 그 지침을 읽고 그대로 따른다. 이름은 목록에 적힌 것을 그대로 쓴다.",
      input_schema: {
        type: "object",
        properties: { name: { type: "string", description: "읽을 스킬 이름", enum: list.map(s => s.id) } },
        required: ["name"],
      },
    }];
  }

  /** 프로젝트의 CLAUDE.md·AGENTS.md 를 시스템 프롬프트에 싣는다 — **설정을 켰을 때만**.
   *
   *  기본이 꺼짐인 이유: 저장소 안의 파일이 그대로 모델 지시가 되는 일이다. 남의 저장소를
   *  열었을 때 그 파일이 무엇을 시킬지 사용자가 모른 채 따르게 만들면 안 된다. 켠 사람은
   *  자기 저장소를 알고 켠 것이다.
   *
   *  프롬프트를 만들 때마다 읽는다 — 파일이 바뀌면 다음 턴에 바로 반영되고, 캐시를 언제
   *  버릴지 고민할 필요가 없다. 작은 파일 둘이라 비용이 무시할 만하다. */
  private async projectInstructionsExtra(): Promise<string> {
    const ws = this.state.workspace;
    if (!ws || !window.schutz || !getAutonomy().projectInstructions) return "";
    const parts: string[] = [];
    for (const name of PROJECT_INSTRUCTION_FILES) {
      if (!ws.entries.some(e => !e.dir && e.rel === name)) continue;
      try {
        const text = (await window.schutz.readFile(ws.root, name)).trim();
        if (text) parts.push(`--- ${name} ---\n` + text.slice(0, PROJECT_INSTR_MAX));
      } catch { /* 읽기 실패는 조용히 건너뛴다 — 지침이 없는 것과 같다 */ }
    }
    if (!parts.length) return "";
    return "\n\n이 프로젝트의 규약입니다. 아래 지침을 따르세요:\n\n" + parts.join("\n\n");
  }

  /** 어떤 스킬이 있는지 시스템 프롬프트에 한 줄씩 알린다(이름 + 설명만). */
  private skillSystemExtra(): string {
    const list = this.state.skills;
    if (!list.length) return "";
    const lines = list.slice(0, 60).map(s => `- ${s.id}: ${s.description.slice(0, 200)}`);
    return "\n\n사용할 수 있는 스킬(필요하면 skill 도구로 내용을 읽고 따르세요):\n" + lines.join("\n");
  }

  /** 검증된 asset id — 카탈로그 도구가 실제로 돌려준 것만 담는다. 미지의 id 로 asset_import 를
   *  부르면 Studio 가 영구 행업하므로, 여기 없는 id 는 auto 모드에서도 승인을 강제한다. */
  private _validatedAssetIds = new Set<string>();
  /** 엔진별 플레이테스트 진행 여부(서버명 → playing). play 중 쓰기/임포트는 Studio 를 행업시킨다. */
  private _enginePlaying = new Map<string, boolean>();

  /** 연결된 게임 엔진이 있으면 그 운영 수칙을 시스템 프롬프트에 덧붙인다 — 편집 전 정지·
   *  트리 먼저 읽기·asset id 추측 금지. 서버가 돌 때만(도구가 실제 노출될 때만) 붙인다. */
  private engineSystemExtra(): string {
    const running = new Set(mcp.getMcpTools().map(t => t.server));
    const active = engines.ADAPTERS.filter(a => running.has(a.serverName));
    if (!active.length) return "";
    // 엔진마다 운영 수칙이 다르다(OVERDARE 는 트리·정지·asset, Blender 는 파이썬·에셋) — 어댑터가
    // 자기 systemGuide 를 들고 있고, 여기선 연결된 것만 이어 붙인다.
    return "\n\n" + active.map(a => a.systemGuide).join("\n");
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
    // 스킬 읽기 — 워크스페이스와 무관. 지침을 돌려줄 뿐이라 승인 게이트가 없다.
    if (call.name === "skill") {
      const want = String(call.input?.name ?? "").trim();
      const sk = this.state.skills.find(s => s.id === want) ?? this.state.skills.find(s => s.name === want);
      const sid = "rt" + (this._uid++);
      this.addTool(sid, agentId, t("skill.verb"), want);
      if (!sk || !window.schutz?.skillRead) {
        this.setTool(sid, { st: "done", note: t("sc2.noteError") });
        return `오류: '${want}' 스킬을 찾을 수 없습니다. 목록에 있는 이름을 그대로 쓰세요.`;
      }
      try {
        const r = await window.schutz.skillRead(sk.file);
        if (!r.ok || !r.body) { this.setTool(sid, { st: "done", note: t("sc2.noteError") }); return "스킬을 읽지 못했습니다: " + (r.error || ""); }
        this.setTool(sid, { st: "done", note: sk.name });
        // 스킬이 도구를 제한해 두었으면 그대로 알려 준다(강제는 Schutz 의 승인·자율성 계층이 한다).
        const limit = sk.allowedTools.length ? `\n\n(이 스킬이 권하는 도구: ${sk.allowedTools.join(", ")})` : "";
        return `# 스킬: ${sk.name}\n\n${r.body}${limit}`;
      } catch (e) {
        this.setTool(sid, { st: "done", note: t("sc2.noteError") });
        return "스킬 오류: " + (e instanceof Error ? e.message : String(e));
      }
    }
    // MCP 도구 — 워크스페이스와 무관하게 실행
    if (mcp.isMcpToolName(call.name)) {
      const r = mcp.resolveMcpTool(call.name);
      if (!r) return "오류: 알 수 없는 MCP 도구 " + call.name;
      const mid = "rt" + (this._uid++);
      const adapter = engines.adapterForServer(r.server);
      const label = adapter ? adapter.label : "MCP";
      this.addTool(mid, agentId, label, r.server + "·" + r.tool);

      // 게임 엔진 안전장치 — 일반 MCP 는 adapter 가 없어 아래를 전부 건너뛴다(무게이트 유지).
      if (adapter) {
        // ① 편집 전 정지 — 플레이테스트 중 쓰기/임포트는 Studio 를 행업시킨다.
        if (this._enginePlaying.get(r.server) && engines.mutatesWhilePlaying(r.server, r.tool)) {
          this.setTool(mid, { st: "done", note: t("eng.notePlaying") });
          return `오류: 지금 ${adapter.label} 플레이테스트가 실행 중입니다. ${adapter.stopTool ?? "stop"} 로 먼저 멈춘 뒤 편집·임포트하세요(재생 중 쓰면 Studio 가 멈춥니다).`;
        }
        // ② 위험도 게이트 — 미검증 asset id 의 import 는 auto 모드에서도 막는다.
        let risk = engines.riskFor(r.server, r.tool);
        const importId = engines.assetImportId(r.server, r.tool, call.input ?? {});
        const unverified = importId != null && !this._validatedAssetIds.has(engines.normalizeAssetId(importId));
        if (importId != null && unverified) risk = "gated";
        const need = risk === "gated" || (risk === "confirm" && getAutonomy().policy !== "auto");
        if (need) {
          const why = importId != null && unverified
            ? t("eng.whyUnverifiedAsset", { id: importId })
            : t("eng.whyEngineAction", { engine: adapter.label });
          const ok = await this.askRunApproval(`${adapter.label} · ${r.tool}` + (importId ? ` (${importId})` : ""), why, agentId);
          if (!ok) {
            this.setTool(mid, { st: "done", note: t("sc2.noteRejected") });
            return "사용자가 이 엔진 작업을 거절했습니다. 다른 방법을 제안하거나 작업 방법을 안내하세요.";
          }
          // 사용자가 명시적으로 승인한 id 는 이번 세션 동안 검증된 것으로 취급한다.
          if (importId != null) this._validatedAssetIds.add(engines.normalizeAssetId(importId));
        }
      }

      try {
        const out = await mcp.callTool(r.server, r.tool, call.input ?? {});
        // ③ 카탈로그가 돌려준 asset id 를 수확 → 이후 import 게이트를 완화한다.
        if (adapter) {
          for (const id of engines.harvestAssetIds(r.server, r.tool, out)) this._validatedAssetIds.add(engines.normalizeAssetId(id));
          // ④ 재생/정지 상태 추적(플레이 가드용).
          if (r.tool === adapter.playTool) this._enginePlaying.set(r.server, true);
          else if (r.tool === adapter.stopTool) this._enginePlaying.set(r.server, false);
        }
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
      // 계획 패널을 채우는 유일한 경로. 예전엔 브라우저 프리뷰의 데모 스크립트에서만
      // 찼고, 실제 AI 가 붙으면 영원히 빈 칸이었다 — README 가
      // "지금 하는 일과 다음" 을 보여준다고 적어 둔 바로 그 패널이다.
      if (call.name === "set_plan") {
        const steps = normalizeSteps(call.input?.steps);
        this.addTool(toolId, agentId, t("sc2.verbPlan"), t("sc2.noteSteps", { n: steps.length }));
        this.setTool(toolId, { st: "done", note: t("sc2.noteSteps", { n: steps.length }) });
        if (!steps.length) { this.setState({ plan: [] }); return "계획을 비웠습니다."; }
        this.setState(s => ({ plan: mergePlan(s.plan, steps, agentId) }));
        return `계획 ${steps.length}단계를 올렸습니다. 단계를 끝낼 때마다 done 을 갱신해 다시 부르세요.`;
      }
      if (call.name === "list_files") {
        const glob = String(call.input?.glob ?? "").trim();
        this.addTool(toolId, agentId, t("sc2.verbList"), glob || ws.name);
        const match = globFilter(glob);
        const all = ws.entries.filter(e => !e.dir).map(e => e.rel).filter(match);
        // 목록도 컨텍스트를 태운다. 상한을 넘기면 잘라 보내되 **잘랐다고 알린다** —
        // 모델이 "전부 봤다"고 착각하고 없는 파일이 없다고 단정하는 것을 막는다.
        const shown = all.slice(0, LIST_MAX);
        const cut = all.length - shown.length;
        this.setTool(toolId, { st: "done", note: t("sc2.noteCount", { n: all.length }) + (cut ? " · " + t("sc2.noteCut") : "") });
        if (!all.length) return glob ? `(${glob} 에 맞는 파일 없음)` : "(빈 워크스페이스)";
        return shown.join("\n") + (cut ? `\n\n… ${cut}개 더 있음(전체 ${all.length}). glob 으로 좁혀서 다시 부르세요.` : "");
      }
      if (call.name === "search_files") {
        const query = String(call.input?.query ?? "");
        this.addTool(toolId, agentId, t("sc2.verbSearch"), query);
        if (query.length < 2) {
          this.setTool(toolId, { st: "done", note: t("sc2.noteError") });
          return "오류: query 는 2글자 이상이어야 합니다.";
        }
        const r = await window.schutz.searchFiles(ws.root, query, {
          max: SEARCH_MAX,
          include: String(call.input?.include ?? "") || undefined,
          exclude: String(call.input?.exclude ?? "") || undefined,
          regex: !!call.input?.regex,
        });
        if (r.error) {
          this.setTool(toolId, { st: "done", note: t("sc2.noteError") });
          return "검색 오류: " + r.error;
        }
        this.setTool(toolId, { st: "done", note: t("sc2.noteHits", { n: r.hits.length }) + (r.truncated ? " · " + t("sc2.noteCut") : "") });
        if (!r.hits.length) return `"${query}" 에 대한 결과 없음.`;
        const body = r.hits.map(h => `${h.rel}:${h.line}: ${h.preview.slice(0, SEARCH_PREVIEW)}`).join("\n");
        return body + (r.truncated ? `\n\n… 결과가 상한(${SEARCH_MAX})에서 잘렸습니다. include 로 좁히세요.` : "");
      }
      if (call.name === "read_file") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, t("sc2.verbRead"), rel);
        const text = await window.schutz.readFile(ws.root, rel);
        const lines = text.split("\n");
        // offset 은 1부터. 범위를 안 주면 앞에서 READ_MAX 줄까지만 — 통째 읽기가
        // 컨텍스트를 태우던 것을 막는다. 자른 경우 이어 읽을 방법을 함께 알린다.
        const from = Math.max(1, Math.floor(Number(call.input?.offset) || 1));
        const want = Math.floor(Number(call.input?.limit) || 0);
        const count = want > 0 ? Math.min(want, READ_MAX) : READ_MAX;
        const slice = lines.slice(from - 1, from - 1 + count);
        const end = from - 1 + slice.length;
        const numbered = slice.map((l, i) => `${from + i}\t${l}`).join("\n");
        const cut = end < lines.length;
        this.setTool(toolId, { st: "done", note: t("sc2.noteLines", { n: slice.length }) + (cut ? " · " + t("sc2.noteCut") : "") });
        if (!slice.length) return `(${rel} 은 ${lines.length}줄이라 ${from}번째 줄이 없습니다)`;
        return numbered + (cut ? `\n\n… ${end}줄까지 보여줬습니다(전체 ${lines.length}줄). 이어 보려면 offset:${end + 1} 로 다시 부르세요.` : "");
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
          rootRunId: this.engine.runs.rootOf(runId),
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
          rootRunId: this.engine.runs.rootOf(runId),
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
      /** 서브에이전트로 도는 경우의 인격 — 지침과 도구 제한이 여기서 온다. */
      persona?: SubagentDef | null;
    },
  ): Promise<DelegationOutcome> {
    const provider = this.providers[agentId];
    const d = this.agDef(agentId);
    const persona = opts.persona ?? null;
    // 화면·기록에 남는 이름은 인격 이름. 그래야 "누가 무엇을 했나" 가 읽힌다.
    const who = (persona ? persona.name : d.name) + (opts.isManager ? t("sc2.managerSuffix") : "");
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
    extHost.notifyExtensions("run.start", { agent: agentId, manager: opts.isManager });
    this.abortCtls.set(run.runId, abort);
    this.setAgent(agentId, { status: opts.isManager ? "plan" : "edit" });

    // 워크스페이스가 열려야만 파일 도구를 준다. 하지만 MCP·게임 엔진 도구는 코드
    // 프로젝트와 무관하다 — 예전엔 useTools 가 워크스페이스에 묶여 있어, OVERDARE 만
    // 조종하려는 사용자가 빈 폴더를 열어야 도구가 모델에 보였다. 둘을 분리한다.
    const useWs = !!(this.state.workspace && window.schutz);
    const hasMcp = !!window.schutz && mcp.getMcpTools().length > 0;
    // 위임 로스터 = 연결된 다른 프로바이더 + 서브에이전트(인격). 서브에이전트만 있어도
    // 위임은 성립한다 — 자기 자신 위에서 다른 인격으로 돌면 된다.
    const roster = this.delegateRoster(agentId);
    const wsTools = useWs
      ? [...(opts.isManager && roster.length ? [...WORKSPACE_TOOLS, DELEGATE_TOOL] : WORKSPACE_TOOLS)]
      : [];
    const skillDefs = this.skillToolDefs();
    const allTools = (useWs || hasMcp || skillDefs.length) ? [...wsTools, ...this.mcpToolDefs(), ...skillDefs] : undefined;
    // 인격이 도구를 좁혀 놓았으면 그것만 준다. 하나도 안 맞으면 제한을 접는다 —
    // 도구 0개짜리 에이전트는 아무 일도 못 하면서 성공한 척 답한다.
    const tools = allTools && persona ? filterTools(allTools, persona.tools).tools : allTools;
    const system =
      schutzSystemPrompt() +
      // 위임 안내는 delegate_task 를 실제로 줄 때만 붙인다 — 도구 조건(roster.length)과
      // 반드시 같아야 한다. 예전엔 여기만 조건이 없어서, 프로바이더가 하나뿐일 때
      // "delegate_task 로 위임하세요, 이번 턴에 도구를 부르세요" + 빈 로스터를 주고
      // 정작 그 도구는 안 줬다. 앱이 환각을 만들어 놓고 아래 가드로 모델을 나무라던 셈.
      (opts.isManager && roster.length ? MANAGER_SYSTEM_EXTRA + "\n연결된 에이전트: " + roster.join(", ") + this.subagentRosterExtra() : "") +
      (useWs ? "\n현재 워크스페이스: " + this.state.workspace!.name : "") +
      this.engineSystemExtra() + this.skillSystemExtra() + (await this.projectInstructionsExtra()) +
      (persona ? personaSystem(persona) : "");

    const transcript: NeutralMsg[] = [...seed];
    let finalText = "";
    // 이번 턴에 무슨 도구를 썼는지 한 줄씩. 다음 턴의 seed 는 history(글자)로만 다시 만들어져
    // 도구 활동이 통째로 사라졌다 — 그래서 방금 읽은 파일을 다음 턴에 또 읽고, 방금 돌린
    // 테스트를 또 돌렸다. 전체 transcript 를 보존하면 컨텍스트가 폭증하므로 자취만 남긴다.
    const toolTrail: string[] = [];
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

        // 스트리밍 텍스트 커밋을 **프레임 단위로 합친다.** 예전엔 토큰 하나마다 setMsg →
        // 7천 줄짜리 트리를 통째로 다시 그렸고(트랜스크립트·트리·검토 전부), buildTimeline 도
        // 매 토큰 정렬됐다 — 긴 답을 받는 내내 UI 가 덜덜거렸다. 이제 최대 ~25fps 로만
        // 커밋하고, 마지막 텍스트는 루프가 끝날 때 반드시 한 번 밀어 넣는다.
        let lastFlush = 0, flushTimer = 0;
        const flushText = () => { flushTimer = 0; lastFlush = performance.now(); this.setMsg(aiId, { text: turnText }); };

        for await (const ev of provider.streamAgentTurn({ transcript, system, tools, signal: abort.signal })) {
          if (ev.type === "text") {
            turnText += ev.delta;
            const now = performance.now();
            if (now - lastFlush >= 40) { if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; } flushText(); }
            else if (!flushTimer) { flushTimer = window.setTimeout(flushText, 40); }
          } else if (ev.type === "tool_call") {
            calls.push(ev.call);
            this.setState({ statusKey: "tool" });
            if (!opts.isManager) this.setAgent(agentId, { status: "edit" });
          } else if (ev.type === "usage") {
            this.bumpAgent(agentId, ev.inputTokens, ev.outputTokens);
          } else if (ev.type === "stop") {
            stopReason = ev.reason;
          } else if (ev.type === "error") {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
            turnText = turnText ? turnText + "\n\n⚠️ " + ev.message : "⚠️ " + ev.message;
            this.setMsg(aiId, { text: turnText });
            stopReason = "error";
            this.maybeRevertModel(agentId, ev.message);
          }
        }
        // 대기 중인 프레임 커밋이 있으면 취소하고, 마지막 텍스트까지 한 번에 확정한다 —
        // 안 그러면 마지막 몇 토큰이 화면에 안 남을 수 있다.
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
        this.setMsg(aiId, { text: turnText, streaming: false });
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
        for (const c of calls) toolTrail.push(toolTrailLine(c));
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
        if (opts.isManager && finalText) {
          this.history.push({ role: "assistant", content: finalText + trailBlock(toolTrail) });
        }
        // 모든 에이전트 루프가 끝났을 때만 running 해제 (인라인/mcp생성 사이드플로는 세지 않는다)
        if (!this.engine.runs.hasActiveAgentRuns()) {
          // 빔을 100% 로 채운 채 멈춘다(transition 이 끝까지 달린다). running=false 가 되면
          // beamW 가 "100%" 를 쓰므로 runProgress 는 다음 실행 시작 때 다시 0 으로 초기화된다.
          this.setState(s => ({
            running: false, runProgress: 1,
            statusKey: s.proposals.some(p => p.status === "pending") ? "review" : "idle",
          }), () => this.saveSession());
          // 턴이 통째로 끝났다 — 이제 이 실행을 하나의 되돌리기 단위로 확정한다.
          // 하위 에이전트가 끝날 때마다 닫으면 절반만 되돌아가는 체크포인트가 생긴다.
          void this.closeCheckpoints();
        }
      }
    }

    extHost.notifyExtensions("run.end", { agent: agentId, manager: opts.isManager, cause: stopCause });
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

    // 서브에이전트(@이름)는 **인격**이지 모델이 아니다. 어떤 프로바이더 위에서 돌지 여기서
    // 정하고, 그 아래 정책 판정(깊이·사이클·바쁨)은 프로바이더 기준으로 그대로 태운다
    // — 안 그러면 같은 모델을 쓰는 두 인격이 동시에 돌아 서로의 파일 락을 밟는다.
    let persona: SubagentDef | null = null;
    let runOn = target;
    if (isSubagentTarget(target)) {
      persona = findSubagent(this.state.subagents, target);
      if (!persona) {
        this.setTool(toolId, { st: "done", note: t("engine.noteRejected") });
        return Promise.resolve(t("sub.unknown", { target, known: this.delegateRoster().join(", ") || "—" }));
      }
      const p = providerFor(persona, this.configuredAgents(), fromAgent);
      if (!p) {
        this.setTool(toolId, { st: "done", note: t("engine.noteRejected") });
        return Promise.resolve(t("sub.noProvider", { name: persona.name }));
      }
      runOn = p;
    }

    // cancel 훅은 하위 루프의 AbortController 보다 먼저 등록돼야 해서 상자로 전달한다.
    const box: { cancel: () => void } = { cancel: () => { /* 아직 안 떴다 */ } };
    const res = this.engine.requestDelegation(
      { parentRunId, fromAgent, toAgent: runOn, task },
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
      // 인격으로 불렀는데 그 모델이 바쁜 경우가 있다 — 무엇이 막았는지 그대로 말한다.
      return Promise.resolve(this.rejectText(res.reason, persona ? `${target} (${runOn})` : target));
    }

    // 보고할 때 쓰는 이름은 **인격** 이름이다 — 모델 이름을 돌려주면 매니저가
    // 자기가 누구에게 시켰는지 헷갈린다.
    const name = persona ? persona.name : this.agDef(runOn).name;
    this.setTool(toolId, { st: "done", note: t("sc2.noteDelegated") });

    const ctx = this.delegationContext(fromAgent);
    const seedText =
      t("engine.seed", { manager: this.agDef(fromAgent).name, task }) +
      (ctx ? t("engine.seedContext", { context: ctx }) : "");

    const child = this.runAgentLoop(runOn, [{ role: "user", text: seedText }], {
      isManager: false,
      parentRunId,
      delegationId: res.delegationId,
      run: res.childRun,
      onCancel: fn => { box.cancel = fn; },
      persona,
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
  /** 트리 접힘 상태 — 저장된 게 있으면 그대로, 없으면 **깊은 폴더는 접은 채로** 연다.
   *
   *  예전엔 늘 전부 펼친 상태였다. node_modules 를 걸러도 웬만한 저장소는 수백 줄이라
   *  트리가 벽이 되고, 파일 하나 찾으려면 스크롤부터 해야 했다. 위 두 단계만 보이게
   *  시작하면 프로젝트의 모양이 한눈에 들어온다. 사용자가 편 것은 그대로 저장된다. */
  private restoredCollapsed(tree: SchutzWorkspaceTree, saved: any): Record<string, boolean> {
    if (saved && Array.isArray(saved.collapsed)) {
      const out: Record<string, boolean> = {};
      for (const rel of saved.collapsed) if (typeof rel === "string") out[rel] = true;
      return out;
    }
    const out: Record<string, boolean> = {};
    for (const e of tree.entries) if (e.dir && e.depth >= 1) out[e.rel] = true;
    return out;
  }

  private restoredLayout(tree: SchutzWorkspaceTree, fallbackLayout: number): { tabs: string[][]; active: string[]; layout: number; collapsed: Record<string, boolean> } {
    const k = this.layoutKey(tree.root);
    let d: any = null;
    try { const raw = k && localStorage.getItem(k); if (raw) d = JSON.parse(raw); } catch { /* */ }
    const layout = d && [1, 2, 4].includes(d.layout) ? d.layout : fallbackLayout;
    // 저장본이 없거나 깨졌을 때 — 첫 실행이 정확히 이 길이라 collapsed 를 빠뜨리면 안 된다.
    if (!d || !Array.isArray(d.tabs)) {
      const ns = this.normSlots([], [], layout);
      return { tabs: ns.tabs, active: ns.active, layout, collapsed: this.restoredCollapsed(tree, d) };
    }
    // 트리가 capped(truncated)면 tree.entries 를 존재 오라클로 신뢰 불가(>4000파일·깊은 경로 파일 누락) →
    // 필터하지 않고 보존해 실제 존재하는 탭이 시작 시 사라지지 않게. 진짜 삭제 파일은 pane 오류 오버레이가 처리.
    const truncated = !!(tree as any).truncated;
    const exists = new Set(tree.entries.filter(e => !e.dir).map(e => e.rel));
    const keep = (rel: string) => typeof rel === "string" && (truncated || exists.has(rel));
    const tabs: string[][] = [];
    for (let i = 0; i < layout; i++) tabs.push((Array.isArray(d.tabs[i]) ? d.tabs[i] : []).filter(keep));
    const active = tabs.map((slot, i) => (Array.isArray(d.active) && slot.includes(d.active[i])) ? d.active[i] : (slot[slot.length - 1] ?? ""));
    return { tabs, active, layout, collapsed: this.restoredCollapsed(tree, d) };
  }
  private _layoutT: ReturnType<typeof setTimeout> | null = null;
  /** 현재 탭/활성/레이아웃을 워크스페이스별로 저장 (디바운스) */
  private persistLayout() {
    if (this._layoutT) clearTimeout(this._layoutT);
    this._layoutT = setTimeout(() => {
      const k = this.layoutKey();
      if (!k) return;
      try {
        const { tabs, active, layout, collapsed } = this.state;
        const clean = tabs.map(slot => slot.filter(rel => !this.parseDiffKey(rel) && !this.parsePreviewKey(rel))); // diff 등 특수 탭 제외
        // 접어 둔 폴더도 같이 남긴다 — 이게 없으면 프로젝트를 열 때마다 트리가 전부 펼쳐진다.
        // true 인 것만 담아 저장본이 폴더 수만큼 불어나지 않게 한다.
        const folded = Object.keys(collapsed).filter(r => collapsed[r]);
        localStorage.setItem(k, JSON.stringify({ tabs: clean, active, layout, collapsed: folded }));
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
  /** 워처가 알려 준, 아직 처리하지 않은 경로들. 디바운스 동안 모았다가 트리를
   *  다시 읽은 뒤 만들어짐/고쳐짐/지워짐으로 나눈다. */
  private _fsTouched = new Set<string>();
  private onFsChange = (rels?: string[]) => {
    for (const r of rels ?? []) this._fsTouched.add(r);
    if (this._fsTimer) clearTimeout(this._fsTimer);
    this._fsTimer = setTimeout(() => void this.syncFromDisk(), 250);
  };
  async syncFromDisk(opts?: { bulk?: boolean }) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const before = ws.entries.filter(e => !e.dir).map(e => e.rel);
    let tree: SchutzWorkspaceTree | null = null;
    try {
      tree = await window.schutz.readTree(ws.root);
      if (this.state.workspace !== ws) return; // 그 사이 워크스페이스 전환 → 스테일 트리로 새 repo를 덮지 않음
      this.setState({ workspace: tree });
    } catch { /* */ }
    // 확장의 파일 감시자에게 알린다. 워처가 준 이름만으로는 무슨 일이 있었는지 알 수
    // 없으므로(만들어졌는지 지워졌는지 고쳐졌는지) 앞뒤 트리와 맞춰 판정한다.
    const touched = [...this._fsTouched];
    this._fsTouched.clear();
    if (tree) {
      const after = tree.entries.filter(e => !e.dir).map(e => e.rel);
      // 트리가 잘렸으면 "목록에 없다" 가 "지워졌다" 가 아니라 "상한에 걸려 안 읽었다"
      // 일 수 있다. 그때 트리 전체를 비교하면 멀쩡한 파일에 지워짐을 쏜다 — 그걸 받은
      // 확장은 인덱스에서 실제로 지운다. 그래서 **워처가 이름을 준 경로만** 본다.
      const capped = tree.truncated || ws.truncated;
      const t = new Set(touched);
      const delta = capped
        ? fsClassify(before.filter(r => t.has(r)), after.filter(r => t.has(r)), touched)
        : fsClassify(before, after, touched);
      if (delta.created.length || delta.changed.length || delta.deleted.length) extHost.notifyFsDelta(delta);
    }
    // 사라진 파일(외부 삭제·브랜치 전환)의 stale 모델·진단·문제패널 항목 정리 — 트리 완전할 때만(truncated 면 실존 파일 오삭제 위험)
    if (tree && !(tree as any).truncated) {
      const present = new Set(tree.entries.filter(e => !e.dir).map(e => e.rel));
      projectModels.dropMissing(ws.root, present);
      this._nav = navDropMissing(this._nav, rel => present.has(rel));   // 지워진 파일로 되돌아가면 빈 탭이 열린다
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
      if (!r.ok) { this.setState({ git: { branch: ws.branch ?? null, ahead: 0, behind: 0, upstream: false, notRepo: !!r.notRepo, staged: [], unstaged: [], untracked: [], conflicted: [] } }); return; }
      // gitVer 를 올려 열려 있는 에디터의 거터를 다시 그리게 한다 — 커밋 직후에도
      // 거터가 옛 변경을 계속 가리키던 자리다.
      this.setState(st => ({ git: { branch: r.branch, ahead: r.ahead, behind: r.behind, upstream: r.upstream, staged: r.staged, unstaged: r.unstaged, untracked: r.untracked, conflicted: r.conflicted ?? [] }, gitVer: st.gitVer + 1 }));
      // 브랜치·로그도 함께 (실패 무시, 스테일 시 무시)
      window.schutz.git(ws.root, "branches").then(b => { if (!stale() && b?.ok) this.setState({ gitBranches: b.branches }); }).catch(() => { });
      window.schutz.git(ws.root, "log", { n: 40 }).then(l => { if (!stale() && l?.ok) this.setState({ gitLog: l.commits }); }).catch(() => { });
      window.schutz.git(ws.root, "stashList").then(k => { if (!stale() && k?.ok) this.setState({ gitStashes: k.stashes }); }).catch(() => { });
    } catch { if (!stale()) this.setState({ git: null }); }
  }

  /** 브랜치 전환 */
  async gitCheckout(branch: string) {
    if (this.anyDirty()) { this.toast("error", t("sc3.unsavedChanges")); return; }
    const ok = await this.gitDo("checkout", { branch });
    this.setState({ branchOpen: false });
    if (ok === true) { this.toast("ok", t("sc3.branchSwitched", { branch })); await this.syncFromDisk({ bulk: true }); }
    else if (ok === false) this.toast("error", t("sc3.switchFailed") + (this.state.gitError || ""));
  }
  /** 새 브랜치 생성+전환 */
  async gitCreateBranch() {
    const name = this.state.newBranch.trim();
    if (!name) return;
    const ok = await this.gitDo("createBranch", { branch: name });
    this.setState({ branchOpen: false, newBranch: "" });
    if (ok === true) { this.toast("ok", t("sc3.newBranchCreated", { name })); await this.syncFromDisk({ bulk: true }); }
    else if (ok === false) this.toast("error", t("sc3.branchCreateFailed") + (this.state.gitError || ""));
  }

  /** 단순 git 액션(스태시/풀/페치) + 토스트 */
  async gitSimple(action: string, okMsg: string) {
    const ok = await this.gitDo(action, action === "stash" ? { includeUntracked: true } : undefined);
    if (ok === true) { this.toast("ok", okMsg); if (action === "pull" || action === "stashPop") await this.syncFromDisk({ bulk: true }); }
    else if (ok === false) this.toast("error", (this.state.gitError || t("sc3.failed")));
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

  /** 충돌을 한쪽으로 통째로 해결한다. 파일이 바뀌므로 디스크에서 다시 읽는다. */
  async resolveConflict(path: string, side: "ours" | "theirs") {
    const ok = await this.gitDo("resolveConflict", { path, side });
    if (ok === true) { this.toast("ok", t("gitp.conflictResolved", { path: path.split("/").pop() ?? path })); await this.syncFromDisk({ bulk: true }); }
  }

  /** 마커를 손으로 정리한 파일을 해결됨으로 표시. 마커가 남아 있으면 막는다 —
   *  <<<<<<< 가 그대로 있는 채로 커밋되는 것이 이 기능의 가장 흔한 사고다. */
  async markResolved(path: string) {
    const ws = this.state.workspace;
    if (ws && window.schutz) {
      try {
        const text = await window.schutz.readFile(ws.root, path);
        if (/^<{7} |^={7}$|^>{7} /m.test(text)) { this.toast("error", t("gitp.markersRemain")); return; }
      } catch { /* 읽지 못하면 git 판단에 맡긴다 */ }
    }
    const ok = await this.gitDo("markResolved", { path });
    if (ok === true) this.toast("ok", t("gitp.conflictResolved", { path: path.split("/").pop() ?? path }));
  }

  /** 감춰둔 변경을 꺼내 온다(pop — 꺼내면 목록에서 사라진다). 파일이 통째로 바뀌므로
   *  디스크에서 다시 읽어 열린 편집기의 stale 내용을 남기지 않는다. */
  async stashApply(ref: string) {
    if (this.anyDirty()) { this.toast("error", t("sc3.unsavedChanges")); return; }
    const ok = await this.gitDo("stashApply", { ref });
    if (ok === true) { this.toast("ok", t("sc1.toast_stash_popped")); await this.syncFromDisk({ bulk: true }); }
  }

  /** 감춰둔 변경을 버린다 — 되돌릴 수 없으므로 반드시 묻는다. */
  async stashDrop(ref: string) {
    const k = this.state.gitStashes.find(x => x.ref === ref);
    if (!await this.askConfirm({ title: t("confirm.stashDropTitle"), body: t("gitp.stashDropConfirm", { subject: k?.subject ?? ref }), okLabel: t("confirm.stashDropOk"), danger: true })) return;
    const ok = await this.gitDo("stashDrop", { ref });
    if (ok === true) this.toast("ok", t("gitp.stashDropped"));
  }

  /** git 액션 실행 후 상태 갱신 (+ 열린 diff/페인 리로드) */
  private _gitOpInFlight = false; // 동기 재진입 가드 — setState 는 async 라 state.gitBusy 만으론 rapid double-fire(이중 커밋/index.lock) 못 막음
  /** "차단됨" 을 실패와 구분해 돌려준다. 예전엔 둘 다 false 라, 버튼을 빠르게 두 번 누르면
   *  두 번째가 **"전환 실패"** 같은 오류 토스트를 띄웠다 — 아무 일도 안 일어난 것이 진실인데
   *  사용자에게는 git 이 깨진 것처럼 보였다. */
  private async gitDo(action: string, payload?: any): Promise<boolean | "busy"> {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return false;
    if (this._gitOpInFlight) { this.toast("info", t("gitp.busy")); return "busy"; } // 진행 중이면 동시 git 변경 차단
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
    const amend = this.state.gitAmend;
    if (!msg) { this.setState({ gitError: t("sc3.enterCommitMsg") }); return; }
    // amend 는 방금 한 커밋을 고쳐 쓰는 것이라 스테이지가 비어 있어도 뜻이 있다(메시지만 고치기).
    if (!amend && !(this.state.git?.staged.length)) { this.setState({ gitError: t("sc3.noStagedChanges") }); return; }
    // 충돌이 남아 있으면 git 이 어차피 거부한다 — 여기서 이유를 먼저 말해 준다.
    if (this.state.git?.conflicted.length) { this.setState({ gitError: t("gitp.commitBlockedByConflicts", { n: this.state.git.conflicted.length }) }); return; }
    // 이미 올라간 커밋을 고치면 강제 푸시가 필요해진다. 되돌리기 어려운 일이라 미리 말한다.
    if (amend && (this.state.git?.ahead ?? 0) === 0 && this.state.git?.upstream) {
      if (!await this.askConfirm({ title: t("confirm.amendTitle"), body: t("gitp.amendPushedWarn"), okLabel: t("confirm.amendOk"), danger: true })) return;
    }
    // 커밋 전 자동 리뷰 — 켰을 때만. 짚은 게 있으면 승인 바로 진행/취소를 묻는다.
    if (getAutonomy().reviewOnCommit && !(await this.reviewGateBeforeCommit())) return;
    const ok = await this.gitDo("commit", { message: msg, amend });
    if (ok === true) { this.setState({ gitMsg: "", gitAmend: false }); void this.refreshWorkspace(); }
  }

  /** amend 를 켜면 HEAD 메시지를 채워 준다 — 빈 칸에서 다시 쓰게 하면 원래 메시지를 날린다. */
  async toggleAmend() {
    const on = !this.state.gitAmend;
    this.setState({ gitAmend: on, gitError: "" });
    if (!on) { this.setState({ gitMsg: "" }); return; }
    const root = this.state.workspace?.root;
    if (!root || !window.schutz) return;
    try {
      const r = await window.schutz.git(root, "headMessage", {}) as { ok: boolean; message?: string };
      if (r?.ok && r.message && !this.state.gitMsg.trim()) this.setState({ gitMsg: r.message });
    } catch { /* 메시지를 못 불러와도 amend 자체는 된다 */ }
  }

  /** 히스토리 한 줄 → 그 커밋 전체. 40개를 그려 놓고 눌러도 아무 일 없던 자리다. */
  async showCommit(hash: string) {
    const root = this.state.workspace?.root;
    if (!root || !window.schutz) return;
    this.setState({ commitView: { hash, text: "", loading: true } });
    try {
      const r = await window.schutz.git(root, "show", { hash }) as { ok: boolean; text?: string; truncated?: boolean; error?: string };
      if (!r?.ok) throw new Error(r?.error || "git show 실패");
      this.setState({ commitView: { hash, text: r.text ?? "", loading: false, truncated: !!r.truncated } });
    } catch (e) {
      this.setState({ commitView: null });
      this.toast("error", e instanceof Error ? e.message : String(e));
    }
  }

  /** 커밋 전 리뷰 게이트. 계속해도 되면 true.
   *  실패(리뷰어 오류 등)는 조용히 막지도 커밋하지도 않는다 — 경고 후 사용자에게 맡긴다(fail-open). */
  private async reviewGateBeforeCommit(): Promise<boolean> {
    const root = this.state.workspace?.root;
    if (!root || !window.schutz) return true;
    this.setState({ reviewBusy: true });
    let findings: Finding[] = [];
    try {
      const d = await window.schutz.git(root, "diff", { staged: true }) as any;
      const patch = d && d.ok ? String(d.patch || "") : "";
      if (!patch.trim()) return true;                   // 볼 게 없으면 통과
      findings = await this.runReviewPass(patch);
    } catch {
      this.toast("info", t("review.parseFailed"));      // fail-open
      return true;
    } finally {
      this.setState({ reviewBusy: false });
    }
    this.setState({ reviewFindings: findings });
    if (findings.length === 0) return true;             // 짚은 게 없으면 그대로 커밋
    const managerId = getManagerId();
    const top = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 3)
      .map(f => "· [" + t("review.sev" + (f.severity === "high" ? "High" : f.severity === "med" ? "Med" : "Low")) + "] " + f.summary).join("\n");
    // 여기선 "허용/거부" 가 어색하다 — 커밋을 밀지 말지 묻는 자리라 그 말로 묻는다.
    const proceed = await this.askRunApproval(t("review.gateTitle", { n: findings.length }), top, managerId,
      { ok: t("review.proceedAnyway"), cancel: t("review.cancelCommit") });
    if (!proceed) this.toast("info", t("review.commitBlocked"));
    return proceed;
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
      // 1=Hint, 2=Info, 4=Warning, 8=Error. 예전엔 4 미만을 전부 버려서 "쓰지 않는 변수"
      // 같은 Info 진단이 패널에 아예 안 떴다 — 에디터엔 밑줄이 그어져 있는데 목록엔 없었다.
      // Hint 는 계속 뺀다(포매팅 제안 등으로 목록이 넘친다).
      if (m.severity < 2) continue;
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
  async runReal(text: string, display: string = text, images: { mime: string; data: string }[] = []) {
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
    // 이번에 붙인 사진은 방금 넣은 마지막 사용자 메시지에만 싣는다. history 는 글자만 들고
    // 있으므로 다음 턴에는 따라가지 않는다 — 세션 파일이 붓지 않고 모델도 옛 사진을 다시 안 본다.
    if (images.length && seed.length) seed[seed.length - 1] = { ...seed[seed.length - 1], images };
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
      rootRunId: inlineKey || undefined,   // 인라인 편집도 되돌릴 수 있어야 한다 (자기 자신이 루트다)
    };
    this.setState(s => ({ proposals: [...s.proposals, p] }));
    this.setMsg(aiId, { text: t("sc3.inlineEditProposalMade") });
    this.openFile(rel);
    void this.saveSession();
  }

  /** 독립 리뷰 패스 — diff 만 든 새 transcript 로 프로바이더를 단발 호출한다.
   *  매니저 history·도구·프로젝트 지침을 절대 넘기지 않는다(격리). 실패해도 던지지 않고
   *  빈 배열을 돌려준다 — 리뷰 실패가 커밋을 조용히 막지 않도록(fail-open). */
  private async runReviewPass(diff: string): Promise<Finding[]> {
    if (!diff.trim()) return [];
    const configured = this.configuredAgents();
    const pref = getManagerId();
    const managerId = configured.includes(pref) ? pref : (configured.includes("claude") ? "claude" : configured[0]);
    const provider = managerId ? this.providers[managerId] : undefined;
    if (!provider) return [];
    // 리뷰 결과도 UI 언어를 따른다 — 예전엔 무슨 언어를 쓰든 한국어로 왔다.
    const system = buildReviewSystemPrompt(getLang() as ReviewLang);
    const transcript: NeutralMsg[] = [{ role: "user", text: buildReviewUserPrompt(diff) }];
    const abort = new AbortController();
    this._reviewAbort = abort;
    let out = "";
    try {
      for await (const ev of provider.streamAgentTurn({ transcript, system, tools: undefined, signal: abort.signal })) {
        if (ev.type === "text") out += ev.delta;
        else if (ev.type === "usage") this.bumpAgent(managerId, ev.inputTokens, ev.outputTokens);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return [];
      return [];                                        // 네트워크 등 실패 → fail-open
    } finally {
      if (this._reviewAbort === abort) this._reviewAbort = null;
    }
    return parseFindings(out);
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
      // MCP 번들을 창 아무 데나 끌어다 놓을 수 있게. capture 로 먼저 잡아야 컴포저 첨부보다
      // 앞선다. dragover 를 안 막으면 브라우저가 그 파일로 네비게이트해 앱이 통째로 날아간다.
      window.addEventListener("dragover", this.onWindowDragOver);
      window.addEventListener("drop", this.onWindowDrop, true);
      this._markersOff = monaco.editor.onDidChangeMarkers(() => this._scheduleMarkerScan());
      this._fsOff = window.schutz.onFsChange(this.onFsChange);
      // 잔여 할당량: 실제 요청이 나갈 때마다 헤더로 갱신되고, 켤 때는 아래에서 한 번 조회한다
      this._quotaOff = window.schutz.onQuota(line => {
        try {
          const q = JSON.parse(line) as QuotaInfo;
          this._lastQuotaAt = Date.now(); // 실요청이 방금 갱신했다 → 주기 조회는 그만큼 미뤄진다
          this.setState(st => ({ quota: { ...st.quota, [q.provider]: q } }));
        } catch { /* 부가 정보 — 실패해도 무시 */ }
      });
      void this.probeQuotas();
      // 켠 뒤로도 늙지 않게. 1분마다 두드리되 실제로 나가는 건 값이 낡았고 창이 보일 때뿐이다.
      this._quotaTimer = setInterval(this.maybeProbeQuotas, 60_000);
      // 다른 창·다른 클라이언트에서 쓰다 돌아온 순간이 가장 어긋나 있을 때다.
      document.addEventListener("visibilitychange", this.maybeProbeQuotas);
      window.addEventListener("focus", this.maybeProbeQuotas);
      // 재로드 후 고아 PTY 정리 — 이 렌더러의 현재 터미널 탭에 없는 셸을 메인이 종료(리로드 시 누수 방지)
      try { window.schutz.termReconcile?.(this.state.terms.map(t => t.id)); } catch { /* */ }
      // LSP 초기화 + Monaco 프로바이더 등록 (Python 등)
      void lspClient.initLsp().then(() => { registerLspProviders(); return lspClient.syncOpenModels(); });
      // 확장 로드 (커맨드 기여 → 팔레트)
      void this.reloadExtensions();
      // MCP 서버 시작 (Schutz 호스트) → 도구를 에이전트 루프에 노출
      mcp.setMcpChangeHandler(() => this.forceUpdate());
      void mcp.startAll();
      // Claude Code 스킬 — 있으면 모델에게 노출한다(없으면 아무 일도 없다)
      void this.refreshSkills();
      this.startEngineWatch();
      // 모델 목록 미리 조회 → /model 팔레트가 즉시 실시간 목록을 보여줌
      setTimeout(() => this.ensureModelsFetched(), 1500);
      // 새 버전 확인 — 부팅 경쟁을 피해 한 박자 늦게, 하루 한 번만.
      this._updateTimer = setTimeout(() => void this.checkForUpdate(), 6000);
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
    window.removeEventListener("dragover", this.onWindowDragOver);
    window.removeEventListener("drop", this.onWindowDrop, true);
    if (this._engineWatch) { clearTimeout(this._engineWatch); this._engineWatch = 0; }
    if (this._updateTimer) { clearTimeout(this._updateTimer); this._updateTimer = null; }
    this.stopCloudPoll();
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
    if (this._quotaTimer) { clearInterval(this._quotaTimer); this._quotaTimer = null; }
    if (this._cpBeatTimer) { clearInterval(this._cpBeatTimer); this._cpBeatTimer = null; }
    document.removeEventListener("visibilitychange", this.maybeProbeQuotas);
    window.removeEventListener("focus", this.maybeProbeQuotas);
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
      // 손으로 쓴 else-if 사슬이던 자리. 사슬은 새 모달을 만들 때마다 갱신을 잊었고
      // (되돌리기·번들 설치·커밋 보기가 Esc 로 안 닫혔다), 순서가 z-index 와 무관해
      // **밑에 깔린 것이 먼저 닫혔다**(askClose 220 이 settings 195 뒤에 있었다).
      // 이제 표(overlays.ts)가 "무엇이 위인가" 를 정하고, 여기는 최상위 하나만 닫는다.
      const top = topOverlay(this.openOverlayIds());
      if (top) { if (top.escapable) this.closeOverlayById(top.id); return; } // 모달은 Esc 를 삼킨다
      if (s.openMenu || s.projOpen) { this.setState({ openMenu: null, projOpen: false }); return; }
      if (this.engine.runs.activeRuns(["inline"]).length > 0) {
        // 진행 중 인라인 편집(Ctrl+K)을 Escape 로 취소 — 도달 가능한 유일한 트리거.
        // 예전엔 abortCtls 키의 "__inline" 접두어를 스니핑했다.
        this.engine.runs.cancelAll(["inline"]);
      }
      return; // 닫을 오버레이 없음 → 다른 핸들러에 위임
    }
    if (!window.schutz) return;
    // 키바인딩 재정의 중이면 그 화면이 키를 먹는다 — 안 그러면 Ctrl+S 를 새 화음으로
    // 집으려는 순간 저장이 먼저 일어난다.
    if (this.state.keyCapture) { e.preventDefault(); this.captureChord(e); return; }
    // 눌린 키 → 행동. 조건 사슬 대신 표 하나를 본다(keymap.ts). 표는 이 디스패처와
    // 키바인딩 화면이 함께 쓰므로, 화면에 적힌 것과 실제 동작이 어긋날 수 없다.
    const action = this._keymap.get(chordOf(e));
    if (!action) return;
    // 모달이 떠 있으면 그 모달 자신의 단축키만 통과한다. 이 줄이 없어서 설정 모달 위의
    // Ctrl+W 가 **뒤에 가려진 탭**을 닫고, Ctrl+P 가 보이지 않는 팔레트를 열어 포커스를
    // 훔치고, 승인 모달 위의 F5 가 디버그를 시작했다.
    if (suppressesAction(topOverlay(this.openOverlayIds()), action)) { e.preventDefault(); return; }
    this.runKeyAction(action, e);
  };

  /** 지금 유효한 화음 표. 재정의를 바꿀 때마다 다시 만든다. */
  private _keymap: Map<string, ActionId> = buildMap();
  private rebuildKeymap() { this._keymap = buildMap(); }

  /** 행동 실행 — **가드는 여기 남는다.** 화음이 맞아도 상황이 아니면 넘겨야 하는 것들이
   *  있다(에디터 안의 Ctrl+F, 터미널의 Ctrl+S, 디버그 세션 없을 때의 F10 …). */
  private runKeyAction(action: ActionId, e: KeyboardEvent) {
    const prevent = () => e.preventDefault();
    switch (action) {
      case "palette.command": prevent(); this.cancelClose("cmd"); this.setState(s => ({ cmdOpen: !s.cmdOpen, cmdQuery: "", cmdSel: 0 })); return;
      case "palette.quick": prevent(); this.cancelClose("quick"); this.setState(s => ({ quickOpen: !s.quickOpen, quickQuery: "", quickSel: 0 })); return;
      case "palette.symbol": prevent(); this.cancelClose("sym"); this.openSymbolPalette(); return;
      case "search.inFiles": prevent(); this.cancelClose("search"); this.setState(s => ({ searchOpen: !s.searchOpen, searchSel: 0 })); return;

      // 에디터 밖(트리·대화·터미널)에서 누른 것을 활성 에디터로 보낸다. 에디터 안이면
      // 건드리지 않는다 — 가로채면 찾기 위젯 안의 Ctrl+F 가 깨진다.
      case "editor.find":
      case "editor.replace":
        if (this.inEditorDom(e.target)) return;
        if (!this.activePane()) return;            // 열린 파일이 없으면 브라우저 기본 동작
        prevent(); this.editorAction(action === "editor.find" ? "find" : "replace"); return;
      case "find.next":
      case "find.prev":
        if (this.inEditorDom(e.target)) return;    // 에디터 안은 Monaco 자체 바인딩
        if (!this.activePane()) return;
        prevent(); this.editorAction(action === "find.next" ? "findNext" : "findPrev"); return;

      // 전역 검색 결과 이동 — 패널이 닫혀 있어도 동작한다(그게 요점이다).
      case "search.nextHit": prevent(); this.stepHit(1); return;
      case "search.prevHit": prevent(); this.stepHit(-1); return;

      // 탭을 닫는 길이 ✕ 버튼 하나뿐이었다 — 20개 열어 두면 20번 조준해야 했다.
      case "tabs.close": {
        const slot = this._focusSlot, rel = this.state.active[slot];
        if (!rel) return;
        prevent(); this.closeTab(slot, rel); return;
      }
      case "tabs.reopen": prevent(); this.reopenClosedTab(); return;

      // 위치 기록 이동. 에디터 안에서도 동작해야 한다 — Monaco 는 Alt+←/→ 를 안 쓴다.
      case "nav.back": prevent(); this.navGo(-1); return;
      case "nav.forward": prevent(); this.navGo(1); return;

      case "file.run": prevent(); void this.runActiveFile(); return;

      // 글자 크기 — 설정 모달을 열지 않고. wrap·minimap 팔레트 명령과 같은 경로다.
      case "editor.fontUp": prevent(); this.bumpFontSize(1); return;
      case "editor.fontDown": prevent(); this.bumpFontSize(-1); return;

      case "view.sidebar": prevent(); this.toggleSidebar(); return;

      case "editor.outline": prevent(); this.triggerOutline(); return;
      case "editor.gotoLine": prevent(); this.triggerEditorAction("editor.action.gotoLine"); return;
      // 에디터 안이면 Monaco 에 맡긴다(자체 서식 바인딩이 있다).
      case "editor.format":
        if (this.inEditorDom(e.target)) return;
        prevent(); this.triggerEditorAction("editor.action.formatDocument"); return;

      case "file.saveAll": prevent(); void this.saveAll(); return;
      // Monaco 안이면 자체 바인딩이 이기게 두고, 터미널 안이면 셸 흐름 제어(XOFF)를 뺏지 않는다.
      case "file.save":
        if (this.inEditorDom(e.target) || this.inTerminalDom(e.target)) return;
        prevent(); void this.saveActive(); return;

      case "file.new": prevent(); void this.newFileAt(""); return;
      case "window.new": prevent(); window.schutz!.newWindow(); return;
      case "project.open": prevent(); void this.openProject(); return;
      case "tabs.mru": prevent(); this.cycleMru(1); return;
      case "tabs.mruBack": prevent(); this.cycleMru(-1); return;
      case "settings.open": prevent(); this.openO({ settingsOpen: true }); return;
      case "terminal.toggle": prevent(); this.toggleTerm(); return;
      // 키를 누르고 있으면 OS 자동 반복이 keydown 을 쏟아낸다 — 모드 변신이 매 반복마다
      // 시작돼 확확 뒤집힌다. 반복 이벤트(e.repeat)는 무시하고 한 번만 토글한다.
      case "mode.toggle": if (e.repeat) return; prevent(); this.toggleUiMode(this.state.uiMode === "agent" ? "editor" : "agent"); return;

      case "split.one": prevent(); this.setLayout(1); return;
      case "split.two": prevent(); this.setLayout(2); return;
      case "split.four": prevent(); this.setLayout(4); return;

      case "debug.startOrContinue":
        prevent();
        if (this.state.debug) { if (this.state.debug.status === "stopped") this.dbgContinue(); }
        else void this.startDebug();
        return;
      case "debug.stop": if (!this.state.debug) return; prevent(); void this.stopDebug(); return;
      case "debug.stepOver": if (this.state.debug?.status !== "stopped") return; prevent(); this.dbgStepOver(); return;
      case "debug.stepIn": if (this.state.debug?.status !== "stopped") return; prevent(); this.dbgStepIn(); return;
      case "debug.stepOut": if (this.state.debug?.status !== "stopped") return; prevent(); this.dbgStepOut(); return;
    }
  }

  /** 재정의 입력 — 누른 화음을 그대로 받는다. 모디파이어만 누른 상태는 무시(아직 미완성). */
  private captureChord(e: KeyboardEvent) {
    const id = this.state.keyCapture;
    if (!id) return;
    if (e.key === "Escape") { this.setState({ keyCapture: null }); return; }
    if (isModifierOnly(e.code)) return;
    setOverride(id, chordOf(e));
    this.rebuildKeymap();
    this.setState({ keyCapture: null });
  }

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
    if (!await this.askConfirm({ title: t("confirm.replaceTitle"), body: t("sc3.replaceAllConfirm", { q, rep: this.state.replaceVal }), okLabel: t("confirm.replaceOk"), danger: true })) return;
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

  /** 검색 히트로 이동 — 파일 열고 해당 라인으로 스크롤.
   *  패널은 닫지만 **결과 목록은 남긴다** — F4 로 다음 히트로 계속 넘어갈 수 있게.
   *  예전엔 히트 30개를 보려면 패널을 30번 다시 열어야 했다. */
  jumpToHit(h: SearchHit) {
    const i = this.state.searchResults.indexOf(h);
    this.openFile(h.rel);
    this.closeOverlay("search", { searchOpen: false, ...(i >= 0 ? { searchSel: i } : {}) });
    this.revealInPane(h.rel, h.line, h.col);
  }

  /** 검색 결과 사이를 앞뒤로. 패널이 닫혀 있어도 마지막 목록으로 움직인다. */
  stepHit(delta: number) {
    const hits = this.state.searchResults;
    if (!hits.length) { this.toast("info", t("sc3.noSearchHits")); return; }
    const next = (this.state.searchSel + delta + hits.length) % hits.length;
    const h = hits[next];
    this.setState({ searchSel: next });
    this.openFile(h.rel);
    this.revealInPane(h.rel, h.line, h.col);
    this.toast("info", t("sc3.hitPosition", { i: next + 1, n: hits.length, rel: h.rel }));
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
  /** 이 파일에 편집을 얹을 **기준 텍스트** — 미저장 버퍼가 있으면 그 내용, 없으면 null(호출측이 디스크를 읽는다).
   *  디스크를 기준으로 쓰면 그 write 가 미저장 편집을 조용히 덮는다. */
  private baseTextFor(root: string, rel: string): string | null {
    if (!this.isDirtyRel(rel)) return null;
    const m = projectModels.getByRel(rel);
    return m && !m.isDisposed() ? m.getValue() : null;
  }
  /** 어디든 미저장이 있는가 (종료·브랜치 전환 가드용) */
  private anyDirty(): boolean {
    return Object.values(this.state.paneDirty).some(Boolean) || projectModels.dirtyRels().length > 0;
  }
  // MonacoPane 콜백 — 안정 참조(arrow property)로 두어 React.memo 가 불필요한 리렌더를 차단하게 한다
  private handleDirtyChange = (rel: string, d: boolean) => this.setState(st => ({ paneDirty: { ...st.paneDirty, [rel]: d } }));
  private handleStatus = (info: any) => this.setState({ statusInfo: info });

  /** 상태바에서 고른 언어로 현재(포커스된) 편집기 모델의 언어를 바꾼다.
   *  VS Code 의 언어 모드 전환과 같다 — 파일 내용은 그대로, 문법·색칠만 바뀐다.
   *  세션 단위(다시 열면 확장자 기준으로 돌아온다)라 디스크엔 손대지 않는다. */
  private setEditorLanguage(id: string) {
    // activePane() — focused 만 보면 에디터 본문을 클릭한 적 없을 때 언어가 안 바뀐다.
    const model = this.activePane()?.editor.getModel();
    if (!model) { this.setState({ langPickOpen: false }); this.toast("info", t("sc1.noEditorForAction")); return; }
    monaco.editor.setModelLanguage(model, id);
    this.setState(s => ({ langPickOpen: false, statusInfo: s.statusInfo ? { ...s.statusInfo, lang: id } : s.statusInfo }));
  }

  /** 언어 선택 팝오버 — 상태바 위로 뜬다. Monaco 에 등록된 언어를 골라 바꾼다. */
  private renderLangPicker(cur?: string) {
    // 자주 쓰는 것 먼저, 그다음 나머지를 알파벳순으로.
    const COMMON = ["typescript", "javascript", "json", "markdown", "html", "css", "scss", "python", "rust", "go", "java", "cpp", "c", "csharp", "shell", "yaml", "sql", "xml", "plaintext"];
    const all = monaco.languages.getLanguages().map(l => l.id);
    const seen = new Set<string>();
    const ordered = [...COMMON.filter(id => all.includes(id)), ...all.sort()].filter(id => (seen.has(id) ? false : (seen.add(id), true)));
    return (
      <>
        {/* 바깥 클릭으로 닫기 */}
        <div onClick={() => this.setState({ langPickOpen: false })} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
        <div className="sz-drop" style={{ position: "absolute", bottom: 26, left: 0, zIndex: 200, minWidth: 190, maxHeight: 320, overflowY: "auto",
          background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 5 }}>
          <div style={{ fontSize: 9.5, color: "var(--fg-dim)", padding: "3px 9px 5px", letterSpacing: 0.5 }}>{t("status.langPick")}</div>
          {ordered.map(id => (
            <div key={id} className="hvMenuItem" onClick={() => this.setEditorLanguage(id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontFamily: MONO, color: id === cur ? "var(--accent-hi)" : "var(--fg-sub)" }}>
              <span style={{ flex: "none", width: 6, textAlign: "center", color: "var(--accent)" }}>{id === cur ? "✓" : ""}</span>
              {id}
            </div>
          ))}
        </div>
      </>
    );
  }
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
      // 다시 달리기 시작하면 조사식 값은 이미 옛것이다 — 지우지 않으면 지금 값으로 읽힌다.
      onContinued: () => this.setState(s => ({ debug: s.debug ? { ...s.debug, status: "running", stoppedLine: null, stoppedRel: null } : null, watches: s.watches.map(w => ({ ...w, value: null })) })),
      onOutput: (cat, text) => this.setState(s => ({ debugConsole: [...s.debugConsole, (cat === "stderr" ? "⚠ " : "") + text].slice(-500) })),
      onTerminated: () => { this.setState(s => ({ debug: null, watches: s.watches.map(w => ({ ...w, value: null })) })); this.toast("info", t("sc3.debugSessionEnded")); },
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
    void this.refreshWatches(top?.id ?? null);
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
    void this.refreshWatches(frameId); // 조사식은 프레임마다 값이 다르다
  }
  /* ── 조사식 ──────────────────────────────────────────────────────────────
     dapClient.evaluate 는 처음부터 구현돼 있었는데 부르는 곳이 없었다. 멈춘 순간의
     현재 프레임에서 임의 식을 물어보는 것이 디버거의 절반이라, 입력칸 하나로 살린다. */

  /** 현재 프레임에서 모든 조사식을 다시 계산. 프레임이 없으면 값을 비워 둔다
   *  (실행 중에 옛 값을 그대로 보여주면 지금 값으로 오해한다). */
  private async refreshWatches(frameId?: number | null) {
    const list = this.state.watches;
    if (!list.length) return;
    if (frameId == null) { this.setState({ watches: list.map(w => ({ ...w, value: null })) }); return; }
    const vals = await Promise.all(list.map(w => dap.evaluate(w.expr, frameId)));
    // 계산하는 동안 목록이 바뀌었을 수 있다 — 식으로 다시 맞춰 엉뚱한 값이 붙지 않게.
    const byExpr = new Map(list.map((w, i) => [w.expr, vals[i]]));
    this.setState(s => ({ watches: s.watches.map(w => byExpr.has(w.expr) ? { ...w, value: byExpr.get(w.expr)! } : w) }));
  }

  addWatch() {
    const expr = this.state.watchInput.trim();
    if (!expr) return;
    if (this.state.watches.some(w => w.expr === expr)) { this.setState({ watchInput: "" }); return; }
    this.setState(s => ({ watches: [...s.watches, { expr, value: null }], watchInput: "" }),
      () => void this.refreshWatches(this.state.debug?.frameId));
  }

  removeWatch(expr: string) {
    this.setState(s => ({ watches: s.watches.filter(w => w.expr !== expr) }));
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
  /** workspace.open 을 확장에 **한 번만** 알린다.
   *  프로젝트는 확장 로드보다 먼저 열릴 수도, 나중에 열릴 수도 있다. 먼저 열리면
   *  구독자가 아직 없어서 사건이 허공에 사라졌다 — 그래서 확장 로드가 끝난 뒤에도
   *  한 번 알린다. 같은 root 를 두 번 알리지 않도록 마지막으로 알린 것을 기억한다. */
  private _notifiedRoot: string | null = null;
  private notifyWorkspaceOpen(root: string) {
    if (this._notifiedRoot === root) return;
    this._notifiedRoot = root;
    extHost.notifyExtensions("workspace.open", { root });
  }

  async reloadExtensions() {
    if (!window.schutz) return;
    // 상태바를 먼저 비운다. 항목은 확장이 올린 것뿐이라 전부 지워도 되고, 안 지우면
    // 방금 끈 확장의 "빌드 중…" 이 아무도 갱신하지 않은 채 영원히 남는다.
    if (this.state.extStatus.length) this.setState({ extStatus: [] });
    const res = await extHost.loadExtensions({
      toast: (k, m) => this.toast(k, m),
      showPanel: (title, html) => this.openO({ extPanel: { title, html } }),
      getActiveFile: () => this.state.active[this._focusSlot] || null,
      // 셰임이 진짜 문서·편집기를 만들 수 있게 — 이게 없어서 확장이 현재 파일을
      // 못 읽고 조용히 무동작했다.
      workspaceRoot: () => this.state.workspace?.root ?? null,
      openFiles: () => this.allOpen().filter(rel => !this.parseDiffKey(rel) && !this.parsePreviewKey(rel)),
      prompt: req => this.askExtension(req),
      statusSet: item => this.setState(st => ({ extStatus: sbUpsert(st.extStatus, { ...item, seq: this._sbSeq++ }) })),
      statusRemove: id => this.setState(st => ({ extStatus: sbRemove(st.extStatus, id) })),
    });
    // VS Code 확장(선언형) — 테마·스니펫·언어설정 적용
    const vres = await vscodeExt.loadVscodeExtensions();
    // 아이콘 테마 목록 수집
    const raw = await window.schutz.extList();
    const iconThemes: { extId: string; label: string; path: string }[] = [];
    for (const e of raw) { if (e.kind === "vscode" && e.enabled) for (const it of (e.contributes?.iconThemes || [])) iconThemes.push({ extId: e.id, label: it.label || e.name, path: it.path }); }
    iconTheme.setIconThemeChangeHandler(() => this.setState(s => ({ iconVer: s.iconVer + 1 })));
    const list = await extHost.listExtensions();
    // 확장이 붙기 전에 이미 열려 있던 프로젝트를 알려 준다(위 주석 참고).
    const openRoot = this.state.workspace?.root;
    if (openRoot) { this._notifiedRoot = null; this.notifyWorkspaceOpen(openRoot); }
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
  private _lastCollapsedRef: Record<string, boolean> | null = null;
  /** 렌더 커밋 직전의 채팅 스크롤 상태 — 하단 추적 판정은 반드시 갱신 전 값으로 해야 한다.
   *
   *  앵커(화면 맨 위에 걸친 메시지)도 같이 잡는다. 모드를 바꾸면 채팅이 통째로 다시
   *  그려진다 — 여백 16px↔28px, 간격 10↔24, 폭도 사이드바↔52rem 중앙 정렬이라
   *  scrollHeight 가 달라진다. 픽셀 scrollTop 은 그 사이에서 아무 뜻이 없다. */
  getSnapshotBeforeUpdate(): { chatAtBottom: boolean; anchorId: string | null; anchorTop: number } | null {
    const el = this._chat;
    if (!el) return null;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    let anchorId: string | null = null, anchorTop = 0;
    if (!atBottom) {
      const top = el.getBoundingClientRect().top;
      for (const n of Array.from(el.querySelectorAll<HTMLElement>("[data-mid]"))) {
        const d = n.getBoundingClientRect().top - top;
        if (d >= -n.offsetHeight) { anchorId = n.dataset.mid ?? null; anchorTop = d; break; }
      }
    }
    return { chatAtBottom: atBottom, anchorId, anchorTop };
  }

  componentDidUpdate(_pp?: any, _ps?: any, snap?: { chatAtBottom: boolean; anchorId: string | null; anchorTop: number } | null) {
    // 도움말 → 오프닝 다시 보기는 해시만 바꾼다. App 은 재마운트되지 않으므로
    // componentDidMount 가 다시 돌지 않는다 — prop 이 켜지는 순간을 여기서 잡는다.
    if (this.props.playOpening && !_pp?.playOpening && this.state.openingPhase === "off") {
      this.setState({ openingPhase: "intro" });
    }
    if (_ps) this._restoreClosedFocus(_ps);
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
    // 탭/활성/레이아웃/트리 접힘이 바뀌면(참조 비교 O(1)) 레이아웃 영속 (디바운스).
    // collapsed 를 여기 안 넣으면 폴더를 접어도 저장이 안 걸린다 — 저장 코드만 고치고
    // 트리거를 빼먹어서 실제로 한 번 그랬다.
    if (this.state.workspace && (this.state.tabs !== this._lastTabsRef || this.state.active !== this._lastActiveRef || this.state.collapsed !== this._lastCollapsedRef)) {
      this._lastTabsRef = this.state.tabs; this._lastActiveRef = this.state.active;
      this._lastCollapsedRef = this.state.collapsed;
      this.persistLayout();
    }
    if (this._chat) {
      // 지금 탭에 보이는 것만 기준으로 — 안 보이는 탭이 자라도 끌어내리지 않는다.
      // 그리고 사용자가 위로 올려 읽는 중이면 건드리지 않는다(예전엔 매 토큰 하단으로 잡아당겼다).
      const el = this._chat;
      // 모드가 바뀌면 읽던 자리를 되돌린다. 서명(sig)에 uiMode 가 없어서 "바뀐 게 없다" 로
      // 읽히는데, 실제로는 채팅이 통째로 다시 그려져 픽셀 위치가 무의미해진다 — 그래서
      // 아무 보정도 없이 엉뚱한 자리에 떨어졌다. switchChatTab 이 탭에 대해 쓰는 규칙과 같다.
      //
      // 전환은 View Transition 안에서 일어나 이 시점의 레이아웃은 아직 앉지 않았다.
      // 지금 한 번, 다음 프레임에 한 번 더 맞춘다(상대 이동이라 두 번 불러도 수렴한다).
      if (_ps && _ps.uiMode !== this.state.uiMode && snap) {
        this.restoreChatScroll(snap);
        requestAnimationFrame(() => this.restoreChatScroll(snap));
      }
      // text 가 없는 손상된 항목이 하나라도 있으면 여기서 터져 화면 전체가 하얘졌다 — 방어
      const sig = this.state.uiMode + "|" + this.state.chatTab + "|" + this.visibleMessages().map(m => (m.text ?? "").length).join(",");
      if (sig !== this._chatSig) {
        const modeOnly = !!_ps && _ps.uiMode !== this.state.uiMode;
        this._chatSig = sig;
        // 모드 전환은 위에서 이미 자리를 잡았다 — 여기서 또 하단으로 끌지 않는다.
        if (!modeOnly && (snap ? snap.chatAtBottom : true)) el.scrollTop = el.scrollHeight;
      }
      this.onChatScroll(); // 버튼 노출은 스크롤 위치 하나로 판단 (도착·스크롤 공통)
    }
  }

  /** 모드 전환 전의 읽던 자리로 되돌린다. 하단에 있었으면 하단, 아니면 보고 있던
   *  메시지를 같은 높이에. */
  private restoreChatScroll(snap: { chatAtBottom: boolean; anchorId: string | null; anchorTop: number }) {
    const el = this._chat;
    if (!el) return;
    if (snap.chatAtBottom) { el.scrollTop = el.scrollHeight; return; }
    if (!snap.anchorId) return;
    const n = el.querySelector<HTMLElement>(`[data-mid="${CSS.escape(snap.anchorId)}"]`);
    // offsetTop 은 가장 가까운 positioned 조상 기준이라 스크롤러와 어긋난다 —
    // 실제 좌표 차이로 옮긴다(레이아웃이 통째로 바뀐 뒤라 이게 유일하게 맞다).
    if (n) el.scrollTop += (n.getBoundingClientRect().top - el.getBoundingClientRect().top) - snap.anchorTop;
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
    // 상태바 언어는 **활성 파일에서 바로** 읽는다 — 포커스 이벤트를 안 기다리고, 탭만 바꿔도
    // 자동으로 맞는다. 모델이 있으면 실제 언어(수동 변경분 포함), 없으면 확장자로 추정.
    const activeRel = paneRegistry.focused?.rel || s.active[this._focusSlot] || s.active.find(Boolean) || null;
    const activeLang = activeRel && !activeRel.startsWith("git-diff:") && !activeRel.startsWith("preview:")
      ? (paneRegistry.panes.get(activeRel)?.editor.getModel()?.getLanguageId() || languageOf(activeRel))
      : null;
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
        {this.renderEngine()}
        {this.renderPlugins()}
        {this.renderCloud()}
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
        {this.renderConfirm()}
        {this.renderExtAsk()}
        {this.renderAskRun()}
        {this.renderUndoAsk()}
        {this.renderCommitView()}
        {this.renderMcpbInstall()}
        {this.renderImport()}
        {this.renderToasts()}
        {this.renderMru()}
        {s.tabMenu && (() => {
          const tm = s.tabMenu;
          const here = s.tabs[tm.slot] ?? [];
          const rightCount = Math.max(0, here.length - 1 - here.indexOf(tm.rel));
          const item = (label: string, run: () => void, disabled?: boolean) => (
            <div key={label} className={disabled ? "" : "hvMenuItem"}
              onClick={() => { if (disabled) return; this.setState({ tabMenu: null }); run(); }}
              style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: disabled ? "default" : "pointer", color: disabled ? "var(--fg-dim3)" : "var(--fg-code)" }}>{label}</div>
          );
          return (
            <div onClick={() => this.setState({ tabMenu: null })} onContextMenu={e => { e.preventDefault(); this.setState({ tabMenu: null }); }}
              style={{ position: "fixed", inset: 0, zIndex: 190 }}>
              <div className="sz-drop" onClick={e => e.stopPropagation()}
                style={{ position: "fixed", left: tm.x, top: tm.y, minWidth: 170, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 8, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 191 }}>
                {item(t("tabm.close"), () => this.closeTab(tm.slot, tm.rel))}
                {item(t("tabm.closeOthers"), () => this.closeTabsIn(tm.slot, "others"), here.length < 2)}
                {item(t("tabm.closeRight"), () => this.closeTabsIn(tm.slot, "right"), rightCount === 0)}
                {item(t("tabm.closeAll"), () => this.closeTabsIn(tm.slot, "all"))}
                <div style={{ height: 1, background: "var(--w06)", margin: "4px 6px" }} />
                {item(t("sc4.ctxCopyPath"), () => void this.copyPath(tm.rel, false))}
                {item(t("sc4.ctxReveal"), () => void this.revealAt(tm.rel))}
              </div>
            </div>
          );
        })()}

        {s.ctxMenu && (() => {
          const ctx = s.ctxMenu;
          // 항목 하나 = 라벨 + 할 일. 다섯 줄이 같은 여섯 개 속성을 반복하고 있어서 묶었다.
          const item = (label: string, run: (rel: string) => void, danger?: boolean) => (
            <div key={label} className="hvMenuItem" onClick={() => { this.setState({ ctxMenu: null }); run(ctx.rel); }}
              style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: danger ? "var(--err)" : "var(--fg-code)" }}>{label}</div>
          );
          const sep = <div key={"sep" + Math.random()} style={{ height: 1, background: "var(--w06)", margin: "4px 6px" }} />;
          return (
          <div onClick={() => this.setState({ ctxMenu: null })} onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: null }); }}
            style={{ position: "fixed", inset: 0, zIndex: 190 }}>
            <div className="sz-drop" onClick={e => e.stopPropagation()}
              style={{ position: "fixed", left: ctx.x, top: ctx.y, minWidth: 180, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 8, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 191 }}>
              {ctx.isDir && item(t("sc4.ctxNewFile"), r => void this.newFileAt(r))}
              {ctx.isDir && item(t("sc4.ctxNewFolder"), r => void this.newFolderAt(r))}
              {item(t("sc4.ctxRename"), r => void this.renameAt(r))}
              {/* 복제는 파일만 — 폴더는 재귀 복사라 성격이 다르다(안 되는 걸 띄우느니 안 띄운다) */}
              {!ctx.isDir && item(t("sc4.ctxDuplicate"), r => void this.duplicateAt(r))}
              {sep}
              {item(t("sc4.ctxCopyPath"), r => void this.copyPath(r, false))}
              {item(t("sc4.ctxCopyAbsPath"), r => void this.copyPath(r, true))}
              {/* 이 폴더만 검색 — 예전엔 전역 검색을 열고 include 칸에 glob 를 손으로 쳐야 했다 */}
              {ctx.isDir && item(t("sc4.ctxSearchHere"), r => {
                this.openO({ searchOpen: true, searchSel: 0 });
                this.setState(st => ({ searchOpts: { ...st.searchOpts, include: r + "/**" } }),
                  () => this.onSearchInput(this.state.searchQuery));
              })}
              {item(t("sc4.ctxReveal"), r => void this.revealAt(r))}
              {sep}
              {item(t("sc4.ctxDelete"), r => void this.deleteAt(r), true)}
            </div>
          </div>
          );
        })()}

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
                              // 에이전트 모드엔 편집기가 없다. 눌렀는데 아무 일도 안 일어나면
                              // 고장으로 읽히므로, 왜 안 되는지 말하고 넘어가는 길을 준다.
                              if (ag2(s) && EDITOR_ONLY_ACTIONS.has(it[0])) {
                                this.setState({ openMenu: null });
                                this.toast("info", t("menu.editorOnly", { item: t("menu." + it[0]) }));
                                return;
                              }
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
                                case "ai.engine": this.setState({ openMenu: null }); this.openEngine(); return;
                                case "ai.plugins": this.setState({ openMenu: null }); this.openPlugins(); return;
                                case "ai.cloud": this.setState({ openMenu: null }); this.openCloud(); return;
                                case "ai.import": this.setState({ openMenu: null }); this.openImport(); return;
                                case "view.mode": this.setState({ openMenu: null }); this.toggleUiMode(this.state.uiMode === "agent" ? "editor" : "agent"); return;
                                case "view.terminal": this.setState({ openMenu: null }); this.toggleTerm(); return;
                                case "view.split4": this.setLayout(4); return;
                                case "view.split2": this.setLayout(2); return;
                                case "view.splitReset": this.setLayout(1); return;
                                case "view.format": this.setState({ openMenu: null }); this.triggerEditorAction("editor.action.formatDocument"); return;
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
                                case "help.update": this.setState({ openMenu: null }); void this.checkForUpdate(true); return;
                                case "help.about": this.openO({ openMenu: null, aboutOpen: true }); return;
                                default: this.setState({ openMenu: null });
                              }
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 18, padding: "5px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <span style={{ color: ag2(s) && EDITOR_ONLY_ACTIONS.has(it[0]) ? "var(--fg-dim)" : "var(--fg-code)" }}>{t("menu." + it[0])}</span>
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
          {/* 엔진 뷰 — 엔진이 실제로 붙어 있을 때만 띄운다. 안 쓰는 사람에게는 없는 버튼이다. */}
          {(() => { const ea = this.activeEngine(); if (!ea) return null; return (
            <button className="hv07" title={ea.label} onClick={() => this.openEngine()} style={{ ...iconBtn }}>
              {/* 정육면체 — 3D·게임 엔진을 한 글자로 */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-hi)" strokeWidth="1.7" strokeLinejoin="round">
                <path d="M12 2.6 21 7.3v9.4L12 21.4 3 16.7V7.3z" />
                <path d="M3 7.3 12 12l9-4.7M12 12v9.4" />
              </svg>
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
            // leftW 0 = 접힘(Ctrl+B). overflow 를 막지 않으면 폭이 0 이어도 내용이 삐져나온다.
            style={{ flex: ag ? 1 : "none", width: ag ? "auto" : s.leftW, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", borderRight: ag ? "none" : "1px solid var(--w06)", background: ag ? "var(--bg-root)" : "var(--bg-panel)" }}>
            <div style={{ flex: "none", padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)", ...gone }}>{s.leftTab === "flow" ? t("panel.flow") : s.leftTab === "git" ? t("panel.git") : s.leftTab === "debug" ? t("panel.debug") : s.leftTab === "ext" ? t("panel.ext") : t("panel.tree")}</div>

            {/* 키에 워크스페이스를 포함 — 탭 전환뿐 아니라 프로젝트 전환 때도 페이드가 재생된다(전에는 프로젝트를 바꿔도 내용만 툭 갈렸다) */}
            <div data-tour="left-panel" key={s.leftTab + "|" + (s.workspace?.root ?? "")} className="sz-in" style={{ flex: 1, minHeight: ag ? 0 : TREE_MIN_H, display: "flex", flexDirection: "column", ...gone }}>
              {/* 에이전트 모드에선 이 칸이 display:none 이다 — 그런데도 매 렌더마다 트리·플로우를
                  통째로 다시 만들면(큰 저장소는 수천 행) 보이지도 않는 것에 프레임을 태운다.
                  숨겨져 있으면 아예 그리지 않는다. 모드를 되돌리면 그때 다시 그린다. */}
              {!ag && (s.leftTab === "flow" ? this.renderFlow() : s.leftTab === "git" ? this.renderGit() : s.leftTab === "debug" ? this.renderDebug() : s.leftTab === "ext" ? this.renderExt() : this.renderTree())}
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
        <div className="vtStatus" style={{ flex: "none", height: 25, display: "flex", alignItems: "center", gap: 13, padding: "0 12px", overflow: "hidden", background: "var(--bg-panel)", borderTop: "1px solid var(--w06)", fontSize: 11, color: "var(--fg-dim)" }}>
          {(s.git?.branch || s.workspace?.branch) && (
            <button className="hv08" onClick={() => { this.setState({ leftTab: "git" }); void this.loadGit(); }}
              title={s.git?.branch ?? s.workspace?.branch ?? ""}
              style={{ display: "flex", alignItems: "center", gap: 5, flex: "none", maxWidth: 180, minWidth: 0, fontFamily: MONO, fontSize: 10.5, color: "var(--fg-sub2)", background: "transparent", border: "none", cursor: "pointer", height: 18, padding: "0 5px", borderRadius: 4 }}>
              <GitBranchIcon size={10} sw={1.6} />
              {/* 브랜치 이름만 줄어든다. 길이 제한이 없던 시절엔 `feature/…-2026-07` 하나로
                  오른쪽 끝의 언어·Ln:Col 이 상태바 밖으로 밀려났다. */}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.git?.branch ?? s.workspace?.branch}</span>
              {s.git?.upstream && (s.git.behind > 0 || s.git.ahead > 0) && (
                <span style={{ color: "var(--fg-dim)" }}>{s.git.behind > 0 ? " ↓" + s.git.behind : ""}{s.git.ahead > 0 ? " ↑" + s.git.ahead : ""}</span>
              )}
            </button>
          )}
          {(() => { const c = (s.git?.staged.length ?? 0) + (s.git?.unstaged.length ?? 0) + (s.git?.untracked.length ?? 0); return c > 0
            ? <span style={{ color: "var(--dirty)" }}>{t("status.changes", { n: c })}</span>
            : <span style={{ color: pendingFiles > 0 ? "var(--dirty)" : "var(--fg-dim)" }}>{pendingFiles > 0 ? t("status.pendingReview", { n: pendingFiles }) : t("status.noChanges")}</span>; })()}
          {this.renderExtStatus(ALIGN_LEFT)}
          <div style={{ flex: 1 }} />
          {this.renderExtStatus(ALIGN_RIGHT)}
          <span>{t("status.agentsActive", { active: AGDEF.filter(d => ["edit", "plan"].includes(s.agents[d.id].status)).length, total: AGDEF.length })}</span>
          {quotaSummary && (() => {
            const left = this.quotaTightest(getManagerId()) ?? this.quotaTightest("claude") ?? this.quotaTightest("gpt") ?? 100;
            return <span title={t("status.quotaTitle")} style={{ fontFamily: MONO, color: left <= 10 ? "var(--err)" : left <= 25 ? "var(--warn)" : "var(--fg-dim)" }}>{quotaSummary}</span>;
          })()}
          {ag && s.workspace && (
            <span title={s.workspace.name} style={{ flex: "none", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: MONO, color: "var(--fg-dim2)" }}>{s.workspace.name}</span>
          )}
          {ag && s.cliModel && (
            <span title={s.cliModel} style={{ flex: "none", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: MONO, color: "var(--fg-dim2)" }}>{s.cliModel}</span>
          )}
          {/* 언어 모드 — 활성 파일에서 자동으로 읽어 늘 맞게 보인다(포커스 불필요). 클릭하면 바꾼다. */}
          {(!ag || sheet) && activeLang && (
            <div style={{ position: "relative" }}>
              {/* 폭을 글자 수(monospace 라 ch=글자폭)에 딱 맞춘다 → 빈칸이 안 남는다.
                  대신 그 폭을 transition 으로 바꿔, css↔javascript 처럼 길이가 달라져도 오른쪽
                  Ln:Col 이 툭 튀지 않고 스르륵 밀린다. 너무 짧은 이름은 최소 4자폭 확보. */}
              <button className="hv08" title={t("status.langPick")}
                onClick={() => this.setState(st => ({ langPickOpen: !st.langPickOpen }))}
                style={{ height: 19, width: `calc(${Math.max(activeLang.length, 4)}ch + 14px)`, padding: "0 7px", textAlign: "center", fontFamily: MONO, fontSize: 10.5, cursor: "pointer", borderRadius: 5, color: s.langPickOpen ? "var(--accent-hi)" : "inherit", background: s.langPickOpen ? "rgba(143,168,147,.14)" : "transparent", border: "none", transition: "width var(--dur) var(--ease), background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)" }}>
                {/* key 를 언어값으로 줘 값이 바뀔 때만 다시 마운트 → 새 이름이 툭 나타나지 않고
                    부드럽게 떠오른다. 같은 파일 안에서 리렌더될 땐 그대로라 깜빡이지 않는다. */}
                <span key={activeLang} style={{ display: "inline-block", animation: "szLangIn var(--dur) var(--ease)" }}>{activeLang}</span>
              </button>
              {s.langPickOpen && this.renderLangPicker(activeLang)}
            </div>
          )}
          {/* Ln:Col 은 포커스된 편집기가 있어야 뜻이 있다 — 시트를 열었을 때만 남긴다 */}
          {(!ag || sheet) && s.statusInfo && (
            <span style={{ fontFamily: MONO }}>Ln {s.statusInfo.line}:{s.statusInfo.col}</span>
          )}
          {/* 새 버전 — 있을 때만 뜬다. 자동으로 받지 않고 받으러 갈 곳만 알려준다. */}
          {s.update && (
            <>
              <button className="hv08" title={t("update.availableTitle", { version: s.update.version })} onClick={() => this.openUpdate()}
                style={{ height: 19, padding: "0 9px", display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--on-accent)", opacity: .8 }} />
                {t("update.badge", { version: s.update.version })}
              </button>
              <button className="hvDim" title={t("update.skip")} onClick={() => this.skipUpdate()}
                style={{ width: 18, height: 18, fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 4, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
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
  /** 파일 경로 → 그 파일의 git 상태 색. 없으면 null.
   *
   *  소스 컨트롤 패널까지 가야만 무엇이 바뀌었는지 알 수 있었다 — 트리에는 아무 표시가
   *  없어서, 파일을 열기 전엔 그게 새 파일인지 고친 파일인지 알 방법이 없다.
   *  충돌 > 새 파일 > 수정 순으로 우선한다(충돌이 가장 급하고, 새 파일은 수정을 겸한다). */
  private gitTreeColors(): Map<string, string> | null {
    const g = this.state.git;
    if (!g || g.notRepo) return null;
    const m = new Map<string, string>();
    for (const e of g.staged) m.set(e.path, e.code === "A" ? "var(--ok)" : "var(--dirty)");
    for (const e of g.unstaged) m.set(e.path, "var(--dirty)");
    for (const e of g.untracked) m.set(e.path, "var(--ok)");
    for (const e of g.conflicted) m.set(e.path, "var(--err)");   // 마지막 = 가장 센 신호
    return m.size ? m : null;
  }

  private gitCodeColor(code: string): string {
    if (code === "A" || code === "?") return "var(--ok)";
    if (code === "M") return "var(--dirty)";
    if (code === "D") return "var(--err)";
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
    const conflicted = g?.conflicted ?? [];
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
            {/* amend 는 스테이지가 비어도 뜻이 있다 — 메시지만 고치는 게 가장 흔한 쓰임이다 */}
            {(() => {
              const canCommit = !!s.gitMsg.trim() && (s.gitAmend || staged.length > 0);
              return (
                <button className="hvAccent" disabled={s.gitBusy || !canCommit}
                  onClick={() => void this.gitCommit()}
                  style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: canCommit ? "pointer" : "default", borderRadius: 8, color: "var(--on-accent)", background: canCommit ? "var(--accent)" : "var(--w10)", border: "none" }}>
                  ✓ {s.gitAmend ? t("gitp.amendCommit") : t("gitp.commit")}{staged.length ? " (" + staged.length + ")" : ""}
                </button>
              );
            })()}
            <button className="hv05" title={t("gitp.amendHint")} onClick={() => void this.toggleAmend()} disabled={s.gitBusy}
              style={{ flex: "none", height: 30, padding: "0 10px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: s.gitAmend ? "var(--on-accent)" : "var(--fg-sub)", background: s.gitAmend ? "var(--accent)" : "transparent", border: "1px solid " + (s.gitAmend ? "var(--accent)" : "var(--w12)") }}>
              {t("gitp.amend")}
            </button>
          </div>
          {s.gitError && <div style={{ fontSize: 10.5, color: "var(--err)", marginTop: 6, lineHeight: 1.5 }}>⚠️ {s.gitError}</div>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 10 }}>
          {/* 병합 충돌 — 해결 전엔 커밋할 수 없으므로 맨 위에 세운다.
              "내 것/상대 것" 은 파일 전체를 한쪽으로 고르는 빠른 길이고, 섞어야 하면
              파일을 열어 마커를 정리한 뒤 "해결됨" 을 누른다. */}
          {conflicted.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 3px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--err)" }}>{t("gitp.conflicts")}</span>
                <span style={{ fontSize: 10, color: "var(--fg-dim2)" }}>{conflicted.length}</span>
              </div>
              {/* 줄바꿈을 허용한다. 좌 패널은 200px 까지 좁아지는데 버튼 셋이 전부 flex:none 이라,
                  좁히거나 독일어("Gelöst")·일본어("解決済み")로 두면 마지막 버튼이 패널 밖으로
                  잘려 나갔다 — 가로 스크롤도 없어서 **충돌을 해결할 방법 자체가 사라졌다.**
                  이름은 줄어들고, 버튼은 자리가 모자라면 아랫줄로 내려간다. */}
              {conflicted.map(e => (
                <div key={e.path} className="hv04" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "3px 14px", minWidth: 0 }}>
                  <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, color: "var(--err)", width: 18 }}>{e.code}</span>
                  <span onClick={() => this.openFile(e.path)} title={e.path}
                    style={{ flex: "1 1 60px", fontSize: 11.5, color: "var(--fg-sub)", cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.path.split("/").pop()}</span>
                  <button className="hv08" disabled={s.gitBusy} title={t("gitp.takeOurs")} onClick={() => void this.resolveConflict(e.path, "ours")}
                    style={{ flex: "none", border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub2)", cursor: s.gitBusy ? "default" : "pointer", fontSize: 10, fontFamily: SUIT, borderRadius: 5, padding: "1px 6px" }}>{t("gitp.ours")}</button>
                  <button className="hv08" disabled={s.gitBusy} title={t("gitp.takeTheirs")} onClick={() => void this.resolveConflict(e.path, "theirs")}
                    style={{ flex: "none", border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub2)", cursor: s.gitBusy ? "default" : "pointer", fontSize: 10, fontFamily: SUIT, borderRadius: 5, padding: "1px 6px" }}>{t("gitp.theirs")}</button>
                  <button className="hvGreen" disabled={s.gitBusy} title={t("gitp.markResolvedHint")} onClick={() => void this.markResolved(e.path)}
                    style={{ flex: "none", border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub2)", cursor: s.gitBusy ? "default" : "pointer", fontSize: 10, fontFamily: SUIT, borderRadius: 5, padding: "1px 6px" }}>{t("gitp.markResolved")}</button>
                </div>
              ))}
            </>
          )}
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

          {/* 감춰둔 변경(stash) — 있을 때만 보인다 */}
          {s.gitStashes.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px 3px", borderTop: "1px solid var(--w06)", marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("gitp.stashes")}</span>
              </div>
              {s.gitStashes.map(k => (
                <div key={k.ref} className="hv04" style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 14px" }}>
                  <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, color: "var(--accent)" }}>{k.ref}</span>
                  <span style={{ fontSize: 11, color: "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.subject}</span>
                  <div style={{ flex: 1 }} />
                  <button className="hv08" disabled={s.gitBusy} title={t("gitp.stashPop")} onClick={() => void this.stashApply(k.ref)}
                    style={{ flex: "none", border: "none", background: "transparent", color: "var(--fg-dim)", cursor: s.gitBusy ? "default" : "pointer", fontSize: 12, padding: "0 4px" }}>↥</button>
                  <button className="hvRed" disabled={s.gitBusy} title={t("gitp.stashDrop")} onClick={() => void this.stashDrop(k.ref)}
                    style={{ flex: "none", border: "none", background: "transparent", color: "var(--fg-dim)", cursor: s.gitBusy ? "default" : "pointer", fontSize: 12, padding: "0 4px" }}>×</button>
                </div>
              ))}
            </>
          )}

          {/* 커밋 히스토리 */}
          {s.gitLog.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px 3px", borderTop: "1px solid var(--w06)", marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("gitp.history")}</span>
              </div>
              {s.gitLog.slice(0, 40).map(c => (
                <div key={c.hash} className="hv04" title={`${c.author} · ${c.date}`}
                  role="button" tabIndex={0}
                  onClick={() => void this.showCommit(c.hash)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void this.showCommit(c.hash); } }}
                  style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "3px 14px", cursor: "pointer" }}>
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
    if (!await this.askConfirm({ title: t("confirm.discardTitle"), body: t("sc4.discardConfirm", { path }), okLabel: t("confirm.discardOk"), danger: true })) return;
    await this.gitDo("discard", { path, untracked });
    void this.refreshWorkspace();
  }

  // ── 좌 패널: 작업 흐름 ──
  renderFlow() {
    const s = this.state;
    const planIcon: Record<string, [string, string]> = { pending: ["○", "var(--fg-dim2)"], done: ["✓", "var(--ok)"], stopped: ["–", "var(--err)"] };
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
                <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, padding: "0 6px", lineHeight: "16px", borderRadius: 3, color: t.verb === editVerb ? "var(--dirty)" : "#A3B5A6", background: t.verb === editVerb ? "rgba(196,168,130,.1)" : "rgba(125,145,131,.12)" }}>{t.verb}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.path.split("/").pop()}</span>
                <div style={{ flex: 1 }} />
                {t.st === "run"
                  ? <span style={{ ...spinner("var(--accent)", "rgba(143,168,147,.25)"), flex: "none" }} />
                  /* 완료 라벨은 스피너가 있던 자리에 **떠오르며** 들어온다 — 스피너에서 이
                     span 으로 노드가 갈리므로 이 애니메이션은 완료되는 그 순간 한 번 돈다.
                     예전엔 스피너가 사라지고 글자가 제자리에 툭 나타나서 "끝나는 과정" 이
                     안 보였다. */
                  : <span style={{ flex: "none", fontFamily: MONO, fontSize: 10.5, whiteSpace: "nowrap", color: t.st === "stopped" ? "var(--err)" : "#535B55", animation: "szFadeUp .32s var(--ease) both" }}>{t.note || doneLabel}</span>}
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
  /** 새 파일 아이콘 버튼 — 문서+플러스. dirRel="" 은 루트. */
  private newFileIconBtn(dirRel: string) {
    return (
      <button className="hv08" title={t("tree.newFile")} onClick={e => { e.stopPropagation(); this.beginTreeEdit("newFile", dirRel); }}
        style={{ flex: "none", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 4, color: "var(--fg-sub2)", background: "transparent", border: "none" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M4 2h5l3 3v6.5" /><path d="M9 2v3h3" /><path d="M4 2v12h4.5" /><path d="M11.5 10v4M9.5 12h4" />
        </svg>
      </button>
    );
  }
  /** 새 폴더 아이콘 버튼 — 폴더+플러스. */
  private newFolderIconBtn(dirRel: string) {
    return (
      <button className="hv08" title={t("tree.newFolder")} onClick={e => { e.stopPropagation(); this.beginTreeEdit("newFolder", dirRel); }}
        style={{ flex: "none", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 4, color: "var(--fg-sub2)", background: "transparent", border: "none" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M2 4.5h4l1.3 1.5h5.2V12H2z" /><path d="M8 8.2v3.4M6.3 9.9h3.4" />
        </svg>
      </button>
    );
  }
  /** 트리 인라인 입력 한 줄 — 새 파일/폴더 이름, 또는 이름변경. Enter 확정·Esc 취소·blur 확정. */
  private renderTreeInput(depth: number, isFolder: boolean) {
    const te = this.state.treeEdit;
    if (!te) return null;
    const pad = 16 + Math.min(depth, 8) * 14;
    return (
      <div key="__treeEdit" className="sz-row-in" style={{ display: "flex", alignItems: "center", gap: 7, height: 26, padding: `0 8px 0 ${pad}px` }}>
        {isFolder
          ? <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", width: 8 }}>▸</span>
          : <FileIcon rel={te.value || "x.txt"} size={14} />}
        <input autoFocus value={te.value} spellCheck={false}
          onChange={e => this.setState(st => (st.treeEdit ? { treeEdit: { ...st.treeEdit, value: e.target.value } } : null))}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); void this.commitTreeEdit(); }
            else if (e.key === "Escape") { e.preventDefault(); this.cancelTreeEdit(); }
          }}
          onBlur={() => { if (this.state.treeEdit) void this.commitTreeEdit(); }}
          placeholder={te.kind === "newFolder" ? t("tree.newFolderPh") : te.kind === "rename" ? "" : t("tree.newFilePh")}
          // 이름에 / 를 넣으면 옮겨진다는 걸 아무 데서도 알려 주지 않았다. 툴팁이 그 자리다.
          title={te.kind === "rename" ? t("move.hint") : undefined}
          style={{ flex: 1, minWidth: 0, height: 20, fontFamily: MONO, fontSize: 12, color: "var(--fg)", background: "var(--bg-root)", border: "1px solid var(--accent)", borderRadius: 4, padding: "0 6px", outline: "none" }} />
      </div>
    );
  }

  renderTree() {
    const s = this.state;
    // 아직 프로젝트를 안 열었다
    if (!s.workspace) {
      return (
        <div style={{ flex: 1.15, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, borderBottom: "1px solid var(--w06)", padding: "0 20px" }}>
          <span style={{ fontSize: 12, color: "var(--fg-dim)", textAlign: "center", lineHeight: 1.7 }}>{t("flowtree.noProject")}</span>
          <button className="hvAccent" onClick={() => void this.openProject()}
            style={{ height: 30, padding: "0 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>{t("flowtree.openProject")}</button>
        </div>
      );
    }
    {
      const ws = s.workspace;
      const collapsed = s.collapsed;
      // 접힘 판정 — 항목의 조상 경로만 검사(O(depth))해 O(N·M) 전체 스캔 회피
      const isHidden = (rel: string) => {
        const parts = rel.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) { acc = acc ? acc + "/" + parts[i] : parts[i]; if (collapsed[acc]) return true; }
        return false;
      };
      const te = s.treeEdit;
      const gitColors = this.gitTreeColors();
      const rows: React.ReactNode[] = [];
      for (const en of ws.entries) {
        const pad = 16 + Math.min(en.depth, 8) * 14;   // 상한 없이 밀면 깊은 경로의 이름 칸이 0 이 된다
        // 이름변경 중인 대상은 그 자리에서 입력칸으로 바꾼다.
        if (te && te.kind === "rename" && te.rel === en.rel) {
          rows.push(this.renderTreeInput(en.depth, en.dir));
          continue;
        }
        if (isHidden(en.rel)) continue;
        if (en.dir) {
          const isCollapsed = !!s.collapsed[en.rel];
          rows.push(
            <div key={en.rel} className="hv04 sz-row-in treeRow" onClick={() => this.setState(st => ({ collapsed: { ...st.collapsed, [en.rel]: !st.collapsed[en.rel] } }))}
              // <div onClick> 이라 Tab 으로 닿지도, Enter 로 열리지도 않았다. 트리 항목으로
              // 알리고 키보드에서도 같은 동작을 준다(접힘 상태는 aria-expanded 로 읽힌다).
              tabIndex={0} role="treeitem" aria-expanded={!isCollapsed} aria-label={en.name}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.setState(st => ({ collapsed: { ...st.collapsed, [en.rel]: !st.collapsed[en.rel] } })); } }}
              onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: { x: e.clientX, y: e.clientY, rel: en.rel, isDir: true } }); }}
              style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 8px 0 ${pad}px`, cursor: "pointer" }}>
              <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", width: 8, display: "inline-block", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform var(--dur) var(--ease)" }}>▸</span>
              <span title={en.rel} style={{ fontSize: 12, color: "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.name}</span>
              <div style={{ flex: 1 }} />
              {/* 폴더에 마우스 올리면 새 파일·폴더 아이콘 — 클릭은 폴더 접힘과 겹치지 않게 stopPropagation */}
              <div className="treeAct" style={{ flex: "none", display: "flex", gap: 1 }}>
                {this.newFileIconBtn(en.rel)}
                {this.newFolderIconBtn(en.rel)}
              </div>
            </div>
          );
          // 이 폴더 안에 새로 만드는 중이면 바로 아래에 입력칸.
          if (te && te.kind !== "rename" && te.rel === en.rel) rows.push(this.renderTreeInput(en.depth + 1, te.kind === "newFolder"));
          continue;
        }
        const inPane = this.isOpen(en.rel, s);
        const dirty = s.paneDirty[en.rel];
        rows.push(
          <div key={en.rel} className="hv04 sz-row-in treeRow" onClick={() => this.openFile(en.rel)}
            tabIndex={0} role="treeitem" aria-selected={inPane} aria-label={en.name}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.openFile(en.rel); } }}
            onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: { x: e.clientX, y: e.clientY, rel: en.rel, isDir: false } }); }}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 8px 0 ${pad}px`, cursor: "pointer", background: inPane ? "rgba(125,145,131,.08)" : "transparent", transition: "background var(--dur-fast) var(--ease)" }}>
            <FileIcon rel={en.rel} size={14} />
            <span title={en.rel} style={{ fontSize: 12, fontFamily: MONO, color: gitColors?.get(en.rel) ?? (inPane ? "var(--fg)" : "var(--fg-sub)"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.name}</span>
            <div style={{ flex: 1 }} />
            {dirty && <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: "var(--dirty)" }} />}
          </div>
        );
      }
      return (
        <div role="tree" aria-label={ws.name} style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 0 14px", borderBottom: "1px solid var(--w06)" }}>
          <div className="treeHdr" style={{ display: "flex", alignItems: "center", padding: "4px 8px 6px 16px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name.toUpperCase()}</span>
            <div style={{ flex: 1 }} />
            {/* 루트에 새 파일·폴더 — 헤더 아이콘은 늘 은은히 보인다(트리가 비었을 때도 눌러야 하므로) */}
            <div className="treeActAlways" style={{ flex: "none", display: "flex", gap: 1 }}>
              {this.newFileIconBtn("")}
              {this.newFolderIconBtn("")}
            </div>
          </div>
          {/* 루트에 새로 만드는 중이면 헤더 바로 아래 입력칸 */}
          {te && te.kind !== "rename" && te.rel === "" && this.renderTreeInput(0, te.kind === "newFolder")}
          {rows}
          {rows.length === 0 && !te && (
            <div style={{ padding: "14px 16px", fontSize: 11, color: "var(--fg-dim2)", lineHeight: 1.6 }}>{t("flowtree.empty")}</div>
          )}
          {ws.truncated && <div style={{ padding: "6px 16px", fontSize: 10.5, color: "var(--fg-dim2)" }}>{t("flowtree.truncated")}</div>}
        </div>
      );
    }
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
  /** 숨은 파일 선택창 — 첨부 버튼이 이걸 대신 눌러 준다. */
  private _uploadInput: HTMLInputElement | null = null;
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
  renderConfirm() {
    const a = this.state.confirmAsk;
    if (!a) return null;
    return (
      <div className="sz-backdrop" onClick={() => this.answerConfirm(false)}
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("confirmAsk"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(a.title, "confirmAsk")} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 440, maxWidth: "92%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: a.danger ? "var(--err)" : "var(--fg)" }}>{a.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--fg-sub2)", lineHeight: 1.7, marginBottom: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.body}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="hv08" onClick={() => this.answerConfirm(false)}
              style={{ height: 28, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w12)" }}>{a.cancelLabel}</button>
            <button className={a.danger ? "hvRed2" : "hvAccent"} onClick={() => this.answerConfirm(true)}
              style={{ height: 28, padding: "0 14px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7,
                color: a.danger ? "var(--err)" : "var(--on-accent)",
                background: a.danger ? "var(--err-soft)" : "var(--accent)",
                border: a.danger ? "1px solid var(--err)" : "none" }}>{a.okLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  /** 확장이 던진 물음 — 빠른 선택 / 입력 / 버튼.
   *
   *  세 모양이 한 함수에 있는 이유는 vscode 도 셋을 "확장이 사용자에게 묻는 한 가지 일"
   *  로 묶기 때문이다. 어느 쪽이든 **누가 묻는지**를 머리에 밝힌다 — 확장이 띄운 창을
   *  앱이 띄운 것으로 오해하면, 확장을 지운 뒤에도 앱을 의심하게 된다. */
  renderExtAsk() {
    const a = this.state.extAsk;
    if (!a) return null;
    const s = this.state;
    const cancel = () => this.answerExtension(undefined);
    const head = (
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none",
          background: a.kind === "buttons" && a.tone === "error" ? "var(--err)" : a.kind === "buttons" && a.tone === "warn" ? "var(--warn)" : "var(--accent)" }} />
        <span style={{ fontSize: 10.5, color: "var(--fg-dim)" }}>{t("extask.from", { name: a.source })}</span>
      </div>
    );
    const inputStyle: React.CSSProperties = {
      width: "100%", height: 30, boxSizing: "border-box", padding: "0 10px", fontSize: 12.5, fontFamily: "inherit",
      color: "var(--fg)", background: "var(--bg-editor)", borderRadius: 7, outline: "none",
      border: "1px solid " + (s.extAskErr ? "var(--err)" : "var(--w12)"),
    };
    const btn = (label: string, primary: boolean, onClick: () => void, key?: string) => (
      <button key={key ?? label} className={primary ? "hvAccent" : "hv08"} onClick={onClick}
        style={{ height: 28, padding: "0 14px", fontSize: 12, fontWeight: primary ? 600 : 400, fontFamily: "inherit", cursor: "pointer", borderRadius: 7,
          color: primary ? "var(--on-accent)" : "var(--fg-sub)", background: primary ? "var(--accent)" : "transparent",
          border: primary ? "none" : "1px solid var(--w12)" }}>{label}</button>
    );

    let body: React.ReactNode;
    if (a.kind === "buttons") {
      body = (<>
        <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.title}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {/* 첫 버튼이 권장값이라는 것이 vscode 관례다. isCloseAffordance 는 취소 자리로 둔다. */}
          {a.buttons.map((b, i) => btn(b.label, i === 0 && !b.isClose, () => this.answerExtension(i), "b" + i))}
        </div>
      </>);
    } else if (a.kind === "input") {
      body = (<>
        {a.title && <div style={{ fontSize: 12.5, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 10 }}>{a.title}</div>}
        <input data-szfocus type={a.password ? "password" : "text"} value={s.extAskText} placeholder={a.detail} style={inputStyle}
          onChange={e => {
            const v = e.target.value;
            this.setState({ extAskText: v, extAskErr: null });
            // 타자 중에도 검사한다. 늦게 오는 답이 그 사이 바뀐 값을 덮지 않게, 돌아왔을
            // 때 값이 그대로인지 확인한다.
            void validateInput(a.validate, v).then(m => {
              if (this.state.extAsk === a && this.state.extAskText === v) this.setState({ extAskErr: m });
            });
          }}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); void this.extAskSubmit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }} />
        {s.extAskErr && <div style={{ fontSize: 11.5, color: "var(--err)", marginTop: 7 }}>{s.extAskErr}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          {btn(t("extask.cancel"), false, cancel)}
          {btn(t("extask.ok"), true, () => void this.extAskSubmit())}
        </div>
      </>);
    } else {
      const vis = this.extAskVisible();
      const sel = Math.min(s.extAskSel, Math.max(0, vis.length - 1));
      const toggle = (idx: number) => this.setState(st => ({
        extAskPicked: st.extAskPicked.includes(idx) ? st.extAskPicked.filter(x => x !== idx) : [...st.extAskPicked, idx],
      }));
      body = (<>
        <input data-szfocus value={s.extAskText} placeholder={a.title || t("extask.pickPlaceholder")} style={inputStyle}
          onChange={e => this.setState({ extAskText: e.target.value, extAskSel: 0 })}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ extAskSel: stepIndex(sel, 1, vis.length) }); }
            else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ extAskSel: stepIndex(sel, -1, vis.length) }); }
            else if (e.key === "Enter") { e.preventDefault(); void this.extAskSubmit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
            // 여러 개 고르는 중에는 Space 가 체크다. 한 개짜리에서는 걸러내기에 쓰는
            // 평범한 글자여야 하므로 가로채지 않는다.
            else if (e.key === " " && a.many && vis[sel]) { e.preventDefault(); toggle(vis[sel]!.index); }
          }} />
        <div style={{ marginTop: 8, maxHeight: 280, overflowY: "auto", border: "1px solid var(--w07)", borderRadius: 8 }}>
          {!vis.length && <div style={{ padding: "14px 12px", fontSize: 12, color: "var(--fg-dim)" }}>{t("extask.none")}</div>}
          {vis.map((it, i) => (
            <div key={it.index} className="hv06" role="option" aria-selected={i === sel}
              onMouseEnter={() => this.setState({ extAskSel: i })}
              onClick={() => { if (a.many) toggle(it.index); else this.answerExtension(it.index); }}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 11px", cursor: "pointer",
                background: i === sel ? "var(--w08)" : "transparent" }}>
              {a.many && <span style={{ width: 13, height: 13, flex: "none", borderRadius: 3, border: "1px solid var(--w20)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--on-accent)", background: s.extAskPicked.includes(it.index) ? "var(--accent)" : "transparent" }}>{s.extAskPicked.includes(it.index) ? "✓" : ""}</span>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.label}
                  {it.description && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--fg-dim)" }}>{it.description}</span>}
                </div>
                {it.detail && <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.detail}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 10.5, color: "var(--fg-dim)" }}>
            {a.many ? (s.extAskPicked.length ? t("extask.selected", { n: s.extAskPicked.length }) : t("extask.pickMany")) : ""}
          </span>
          <div style={{ flex: 1 }} />
          {btn(t("extask.cancel"), false, cancel)}
          {a.many && btn(t("extask.ok"), true, () => void this.extAskSubmit())}
        </div>
      </>);
    }

    return (
      <div className="sz-backdrop" onClick={cancel}
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("extAsk"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: a.kind === "pick" ? "flex-start" : "center", justifyContent: "center", paddingTop: a.kind === "pick" ? "12vh" : 0 }}>
        <div {...this.dialogProps(t("extask.from", { name: a.source }), "extAsk")} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 460, maxWidth: "92%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 18, fontFamily: SUIT }}>
          {head}
          {body}
        </div>
      </div>
    );
  }

  renderAskRun() {
    const a = this.state.askRun;
    if (!a) return null;
    // 에이전트 모드는 모달을 쓰지 않는다. 같은 answerRun 을 흐름 안 카드와 고정 바가 부른다.
    if (this.state.uiMode === "agent") return null;
    const d = this.agDef(a.agent);
    return (
      <div className="sz-backdrop" onClick={() => this.answerRun(false)}
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("askRun"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("run.askTitle"), "askRun")} className="sz-pop" onClick={e => e.stopPropagation()}
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
  /** buildTimeline 결과 캐시 — 입력 넷의 참조가 그대로면 정렬을 다시 안 한다. 에이전트
   *  모드에선 visibleMessages() 가 s.messages 를 그대로 돌려주므로(chatTab "all") 참조가
   *  안정적이다. 컴포저에 글자를 칠 때처럼 트랜스크립트와 무관한 리렌더에서 매번 합치고
   *  정렬하던 것을 건너뛴다. */
  private _timelineCache: { m: unknown; t: unknown; p: unknown; a: unknown; rows: ReturnType<typeof buildTimeline> } | null = null;

  private renderAgentRows() {
    const s = this.state;
    const msgs = this.visibleMessages();
    const c = this._timelineCache;
    let rows: ReturnType<typeof buildTimeline>;
    if (c && c.m === msgs && c.t === s.tools && c.p === s.proposals && c.a === s.askRun) {
      rows = c.rows;
    } else {
      rows = buildTimeline({ messages: msgs, tools: s.tools, proposals: s.proposals, ask: s.askRun });
      this._timelineCache = { m: msgs, t: s.tools, p: s.proposals, a: s.askRun, rows };
    }
    if (!rows.length) {
      return <div style={{ fontSize: 12.5, color: "var(--fg-dim2)", padding: "18px 2px", fontFamily: SUIT }}>{t("mode.transcriptEmpty")}</div>;
    }
    return rows.map(r => {
      if (r.k === "msg") return this.renderAgentMsg(r.v as ChatMsg);
      if (r.k === "tool") return this.renderToolRow(r.v as ToolItem);
      if (r.k === "prop") return this.renderProposalCard(r.v as Proposal, { wide: true });
      return this.renderApprovalCard(r.v as { command: string; rationale: string; agent: string; okLabel?: string; cancelLabel?: string });
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
        <div key={m.id} data-mid={m.id} className="sz-in" style={{ display: "flex", justifyContent: "flex-end" }}>
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
      <div key={m.id} data-mid={m.id} className="sz-in sz-msg" style={{ position: "relative", paddingRight: 26 }}>
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
  private renderApprovalCard(a: { command: string; rationale: string; agent: string; okLabel?: string; cancelLabel?: string }) {
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
            style={{ height: 26, padding: "0 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{a.cancelLabel ?? t("run.reject")}</button>
          <button className="hvAccent" onClick={() => this.answerRun(true)}
            style={{ height: 26, padding: "0 15px", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{a.okLabel ?? t("run.approve")}</button>
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
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("import"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("imp.title"), "import")} className="sz-pop" onClick={e => e.stopPropagation()}
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
        flex: "none", width: s.agentAsideW, display: ag2(s) ? "flex" : "none", flexDirection: "column",
        borderRight: "1px solid var(--w06)", background: "var(--bg-panel)", padding: "10px 8px 8px",
        position: "relative",
      }}>
        {/* 목록 ↔ 채팅 경계. 테두리 위에 겹쳐 두어 폭을 차지하지 않는다. */}
        <div onMouseDown={e => this.startAgentAsideResize(e)} title={t("aside.resize")}
          style={{ position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "col-resize", zIndex: 5 }} />
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
            style={{ height: 34, width: 34, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", cursor: "pointer", borderRadius: 17, color: "var(--err)", background: "rgba(201,123,123,.10)", border: "1px solid rgba(201,123,123,.3)" }}>
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
          style={{ flex: "none", height: 22, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{a.cancelLabel ?? t("run.reject")}</button>
        <button className="hvAccent" onClick={() => this.answerRun(true)}
          style={{ flex: "none", height: 22, padding: "0 13px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>{a.okLabel ?? t("run.approve")}</button>
      </div>
    );
  }

  /** 대화 한 줄 — 두 모드가 같은 것을 그린다. 에이전트 모드는 폭만 달라진다. */
  private renderChatMsg(m: ChatMsg) {
    return (
          <div key={m.id} data-mid={m.id} className="sz-in sz-msg" style={{ display: "flex", gap: 8, position: "relative" }}>
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
        {/* 에이전트 모드는 탭을 숨기지만 필터는 그대로 걸려 있다(renderAgentRows 도
            visibleMessages 를 쓴다). 표시가 없으면 대화 절반이 사라진 걸 모른 채
            "왜 답이 없지" 가 된다 — 걸려 있을 때만 한 줄로 알린다. */}
        {ag && s.chatTab !== "all" && (
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--fg-dim)",
            padding: "10px max(24px, calc((100% - 52rem) / 2)) 0" }}>
            <span>{t("mode.filtered", { who: this.agDef(s.chatTab).name })}</span>
            <button className="hv05" onClick={() => this.switchChatTab("all")}
              style={{ height: 20, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w10)" }}>{t("mode.filteredClear")}</button>
          </div>
        )}
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
            {/* 실제 파일·사진 붙이기 — 워크스페이스가 없어도 된다(밖의 사진도 되니까).
                끌어다 놓기·붙여넣기로도 같은 자리로 들어온다. */}
            <button className="hv05" title={t("chat.attachUploadTitle")} onClick={() => this._uploadInput?.click()}
              style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub2)", background: "var(--w04)", border: "1px solid var(--w08)" }}>{t("chat.attachUpload")}</button>
            <input ref={el => { this._uploadInput = el; }} type="file" multiple hidden
              onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void this.addUploads(fs); }} />
            {s.attach.map((a, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, height: 21, padding: "0 4px 0 8px", fontSize: 10.5, fontFamily: MONO, borderRadius: 6, color: "var(--accent-hi)", background: "var(--accent-soft)", border: "1px solid var(--w08)" }}>
                {a.kind === "upload" && a.data
                  ? <img src={`data:${a.mime};base64,${a.data}`} alt="" style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 3 }} />
                  : <>{a.kind === "selection" ? "✂" : a.kind === "upload" ? "📄" : "@"}</>}
                {a.label}
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
              onPaste={this.onComposerPaste}
              onDrop={this.onComposerDrop}
              onDragOver={e => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }}
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
    fresh: ["var(--warn-soft)", "var(--warn)"],
    pending: ["rgba(125,145,131,.07)", ""],
    removed: ["var(--err-soft)", "var(--err)"],
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
            onMouseDown={() => { this._focusSlot = si; }}
            onDragOver={e => { if (this._dragTab) e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); const d = this._dragTab; this._dragTab = null; if (d) this.moveTab(d.slot, d.rel, si); }}>
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
      const realFile = !!(s.workspace && !diffMeta);
      const isImg = realFile && isImage(activeRel);
      const isMdPrev = realFile && activeRel.endsWith(".md") && !!s.mdPreview[activeRel];
      const isReal = realFile && !isImg && !isMdPrev;
      return (
        <div key={"slot" + si} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--bg-editor)" }}
          onMouseDown={() => { this._focusSlot = si; }}
          onDragOver={e => { if (this._dragTab && this._dragTab.slot !== si) e.preventDefault(); }}
          onDrop={e => { const d = this._dragTab; if (!d || d.slot === si) return; e.preventDefault(); this._dragTab = null; this.moveTab(d.slot, d.rel, si); }}>
          {this.renderTabStrip(si, tabsHere, activeRel)}
          {isReal && this.renderBreadcrumb(activeRel)}
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
              onSaved={this.notifySaved}
              onConfirm={this.askConfirmProp}
              onStatus={this.handleStatus}
              onInlineEdit={this.handleInlineEdit}
              breakpoints={s.breakpoints[activeRel]}
              stoppedLine={s.debug?.stoppedRel === activeRel ? s.debug.stoppedLine : null}
              onToggleBreakpoint={this.toggleBreakpoint}
              gitVer={s.gitVer}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--fg-dim2)" }}>
              <span style={{ fontSize: 20 }}>▢</span>
              <span style={{ fontSize: 11 }}>{t("misc.emptyEditorHint")}</span>
            </div>
          )}
        </div>
      );
    });
  }

  /** 경로 브레드크럼 — 탭 이름만으로는 같은 이름의 파일(index.ts 여럿)을 구분할 수 없다.
   *  폴더를 누르면 트리에서 그 폴더를 펼쳐 보여준다. 파일명은 마지막 칸이라 누를 것이 없다. */
  renderBreadcrumb(rel: string) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const crumb: React.CSSProperties = { fontSize: 10.5, color: "var(--fg-dim)", fontFamily: MONO, whiteSpace: "nowrap" };
    return (
      <div style={{ flex: "none", height: 20, display: "flex", alignItems: "center", gap: 3, padding: "0 10px", overflowX: "auto", background: "var(--bg-editor)", borderBottom: "1px solid var(--w03)" }}>
        {parts.map((p, i) => {
          const last = i === parts.length - 1;
          const dir = parts.slice(0, i + 1).join("/");
          return (
            <React.Fragment key={dir}>
              {i > 0 && <span style={{ ...crumb, color: "var(--fg-dim3)" }}>/</span>}
              {last
                ? <span style={{ ...crumb, color: "var(--fg-sub2)" }}>{p}</span>
                : <span className="hvHead" role="button" tabIndex={0} style={{ ...crumb, cursor: "pointer" }}
                    onClick={() => this.revealDir(dir)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.revealDir(dir); } }}>{p}</span>}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  /** 브레드크럼의 폴더 클릭 — 그 폴더와 위쪽 조상들을 모두 펼쳐 트리에서 보이게 한다.
   *  하나만 펼치면 조상이 접혀 있어 아무 변화도 안 보인다. */
  private revealDir(dir: string) {
    const parts = dir.split("/").filter(Boolean);
    this.setState(s => {
      const collapsed = { ...s.collapsed };
      for (let i = 1; i <= parts.length; i++) delete collapsed[parts.slice(0, i).join("/")];
      return { collapsed, leftTab: "tree" } as any;
    });
  }

  /** 슬롯 탭 바 */
  renderTabStrip(si: number, tabsHere: string[], activeRel: string) {
    const s = this.state;
    const lock = AGDEF.find(d => s.agents[d.id].file === activeRel);
    return (
      <div style={{ flex: "none", height: 34, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--w05)", background: "var(--bg-panel)" }}>
        <div className="sz-tabstrip" role="tablist" aria-label={t("misc.editorTabs")}
          onWheel={e => { const el = e.currentTarget; if (e.deltaY && el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY; }}
          onDragOver={e => { if (this._dragTab) e.preventDefault(); }}
          onDrop={e => { const d = this._dragTab; if (!d) return; e.preventDefault(); this._dragTab = null; if (d.slot !== si) this.moveTab(d.slot, d.rel, si); }}
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
                // 탭도 <div onMouseDown> 이라 키보드로 닿지 않았다. 활성 탭만 Tab 순서에 두고
                // (탭 목록의 관행), 방향키로 형제 탭 사이를 옮긴다.
                tabIndex={on ? 0 : -1} role="tab" aria-selected={on} aria-label={name}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._focusSlot = si; this.selectTab(si, rel); return; }
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const i = tabsHere.indexOf(rel);
                    const next = tabsHere[i + (e.key === "ArrowRight" ? 1 : -1)];
                    if (next) { this._focusSlot = si; this.selectTab(si, next); }
                  }
                }}
                // flex:none 이 핵심 — 예전엔 기본값(0 1 auto)이라 탭이 줄어들었다. 아이콘·닫기
                // 버튼·패딩이 61px 를 먹으니, 11개만 열어도 이름 칸이 13px 로 눌려 파일명이
                // 사실상 안 보였다. 이제 탭은 내용 크기(최대 200px)를 지키고 스트립이 스크롤된다.
                // 가운데 클릭으로 닫기 — 탭이 여럿일 때 ✕ 를 조준하는 것보다 훨씬 빠르다.
                onAuxClick={e => { if (e.button === 1) { e.preventDefault(); this.closeTab(si, rel); } }}
                onContextMenu={e => { e.preventDefault(); this.setState({ tabMenu: { x: e.clientX, y: e.clientY, slot: si, rel } }); }}
                style={{ display: "flex", flex: "none", alignItems: "center", gap: 6, padding: "0 8px 0 11px", cursor: "pointer", minWidth: 0, maxWidth: 200, borderRight: "1px solid var(--w04)", background: on ? "var(--bg-editor)" : "transparent", transition: "background var(--dur) var(--ease)" }}>
                {dm ? <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: on ? "var(--accent)" : "var(--fg-dim3)" }} />
                  : pv ? <span style={{ flex: "none", fontSize: 11, lineHeight: 1, color: on ? "var(--ok)" : "var(--fg-dim2)" }}>◉</span>
                  : <FileIcon rel={rel} size={13} />}
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: on ? "var(--fg)" : "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                {dirty && <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: "var(--dirty)" }} />}
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
        {/* 편집기 분할 — 오른쪽 끝. 아이콘은 **누르면 될 모양**을 보여준다:
            1분할→2분할 그림, 2분할→4분할(2×2) 그림, 4분할→한 칸으로 되돌아가는 그림.
            그래야 다음에 무엇이 되는지 눌러 보기 전에 안다. */}
        <button className="hv05" title={t(s.layout === 1 ? "editor.split" : s.layout === 2 ? "editor.split4" : "editor.splitReset")}
          onClick={() => { if (s.layout >= 4) this.setLayout(1); else this.splitActiveEditor(si); }}
          style={{ flex: "none", alignSelf: "center", width: 24, height: 22, marginRight: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 5, color: "var(--fg-sub2)", background: "transparent", border: "none" }}>
          {/* 획을 지웠다 그리지 않고 **전부 남겨 둔 채** 투명도·스케일만 바꾼다 —
              그래야 선이 자라나고 사라지며 부드럽게 넘어간다(툭 갈아끼우지 않는다). */}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.3" />
            {/* 세로 나눔선 — 1·2분할에서 보이고, 되돌리기(4분할)에선 접힌다 */}
            <path d="M8 2.5v11" style={{
              opacity: s.layout >= 4 ? 0 : 1,
              transform: s.layout >= 4 ? "scaleY(0)" : "scaleY(1)",
              transformBox: "fill-box", transformOrigin: "center",
              transition: "opacity var(--dur) var(--ease), transform var(--dur) var(--ease)",
            }} />
            {/* 가로 나눔선 — 2분할일 때만. 가운데에서 좌우로 자라난다 */}
            <path d="M1.5 8h13" style={{
              opacity: s.layout === 2 ? 1 : 0,
              transform: s.layout === 2 ? "scaleX(1)" : "scaleX(0)",
              transformBox: "fill-box", transformOrigin: "center",
              transition: "opacity var(--dur) var(--ease), transform var(--dur) var(--ease)",
            }} />
            {/* 되돌리기 화살표 — 4분할에서만 떠오른다 */}
            <g style={{
              opacity: s.layout >= 4 ? 1 : 0,
              transform: s.layout >= 4 ? "scale(1)" : "scale(.6)",
              transformBox: "fill-box", transformOrigin: "center",
              transition: "opacity var(--dur) var(--ease), transform var(--dur) var(--ease-emph)",
            }}>
              <path d="M9.8 6.2 6.4 8l3.4 1.8" /><path d="M6.4 8h3.2" />
            </g>
          </svg>
        </button>
      </div>
    );
  }


  // ── 우 패널: 에이전트 ──
  renderAgents() {
    const s = this.state;
    const astMap: Record<string, [string, string]> = { idle: [t("agent.statusIdle"), "var(--fg-dim)"], plan: [t("agent.statusPlan"), "#A3B5A6"], edit: [t("agent.statusEdit"), "#A3B5A6"], review: [t("agent.statusReview"), "var(--warn)"], stop: [t("agent.statusStop"), "#C98A8A"] };
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
                  {/* 모델 이름이 길면(gpt-5.6-terra-preview 등) 상태 배지가 카드 밖으로 밀려났다.
                      이름은 줄어들고 모델 칩도 상한을 갖는다 — 상태는 절대 안 밀린다. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span title={d.name} style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{d.name}</span>
                    {(() => { const m = this.modelOf(d.id); return m
                      ? <span title={m} style={{ flex: "0 1 auto", minWidth: 0, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: MONO, fontSize: 10, color: "var(--fg-sub2)", background: "var(--w05)", borderRadius: 3, padding: "0 5px", lineHeight: "15px" }}>{m}</span>
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
      pending: [t("misc.statusPending"), "var(--warn)"], accepted: [t("misc.statusAccepted"), "var(--ok)"],
      rejected: [t("misc.statusRejected"), "var(--err)"], failed: [t("misc.statusFailed"), "var(--err)"],
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
              {p.error && <div style={{ fontSize: 10.5, color: "var(--err)", marginTop: 4 }}>⚠️ {p.error}</div>}
            </div>
            {/* diff 는 접었다 펼친다. 예전엔 maxHeight 180 + 중첩 스크롤이라 아래 코드가 안 보이는데
                스크롤 대신 드래그 선택이 됐고, 수락/거절 버튼까지 그 잘린 영역 안에 있어 손이 안 닿았다. */}
            {(() => {
              // 새 파일은 전부 추가라 쪼갤 것이 없다. 헝크로 돌리면 before 가 [""] 라
              // 없는 줄을 지운 것처럼 보인다.
              const isCreate = p.find === "";
              const hunks = isCreate ? [] : buildHunks(p.find, p.replace);
              const nCh = isCreate ? 1 : changeCount(hunks);
              // 조각이 하나뿐이면 고를 것이 없다 — 체크박스는 소음일 뿐이다.
              const selectable = p.status === "pending" && nCh > 1;
              const sel = new Set(this.state.hunkSel[p.id] ?? (isCreate ? [] : [...allSelected(hunks)]));

              type Row =
                | { t: "head"; index: number; add: number; del: number }
                | { t: "line"; k: "-" | "+" | " "; l: string };
              const rows: Row[] = isCreate
                ? p.replace.split("\n").map(l => ({ t: "line" as const, k: "+" as const, l }))
                : hunks.flatMap((h): Row[] => {
                  if (h.kind === "context") return h.lines.map(l => ({ t: "line" as const, k: " " as const, l }));
                  const ch = h as ChangeHunk;
                  const st = hunkStats(ch);
                  return [
                    ...(selectable ? [{ t: "head" as const, index: ch.index, add: st.add, del: st.del }] : []),
                    ...ch.before.map(l => ({ t: "line" as const, k: "-" as const, l })),
                    ...ch.after.map(l => ({ t: "line" as const, k: "+" as const, l })),
                  ];
                });
              const LIMIT = 14, PEEK = 8;
              const long = rows.length > LIMIT;
              const open = !!this.state.openDiffs[p.id];
              const shown = long && !open ? rows.slice(0, PEEK) : rows;
              return (
                <div style={{ borderTop: "1px solid var(--w06)", background: "var(--bg-editor)", fontFamily: MONO, fontSize: 10.5, lineHeight: "18px" }}>
                  {shown.map((r, i) => {
                    // 헝크 머리 — 이 조각만 켜고 끄는 곳
                    if (r.t === "head") {
                      const on = sel.has(r.index);
                      return (
                        <div key={"h" + r.index} className="hv05" role="checkbox" aria-checked={on} tabIndex={0}
                          onClick={() => this.toggleHunk(p, r.index)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggleHunk(p, r.index); } }}
                          title={t("hunk.toggle")}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 6px", cursor: "pointer", borderTop: r.index > 0 ? "1px solid var(--w05)" : "none", background: on ? "transparent" : "var(--w03)" }}>
                          <span style={{ flex: "none", width: 11, height: 11, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, border: `1px solid ${on ? "var(--accent)" : "var(--w14)"}`, background: on ? "var(--accent)" : "transparent", color: "var(--on-accent)" }}>{on ? "✓" : ""}</span>
                          <span style={{ fontSize: 9.5, color: "var(--fg-dim)", fontFamily: SUIT }}>{t("hunk.n", { n: r.index + 1 })}</span>
                          <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ok)" }}>+{r.add}</span>
                          <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--err)" }}>−{r.del}</span>
                          {!on && <span style={{ fontSize: 9.5, color: "var(--fg-dim2)", fontFamily: SUIT }}>{t("hunk.skipped")}</span>}
                        </div>
                      );
                    }
                    const ctx = r.k === " ";
                    return (
                      <div key={r.k + i} className={p.status === "pending" && r.k === "+" ? "sz-in" : undefined}
                        style={{ display: "flex", background: ctx ? "transparent" : r.k === "-" ? "rgba(201,123,123,.1)" : "color-mix(in srgb, var(--ok) 9%, transparent)", animationDelay: Math.min(i, 14) * 22 + "ms" }}>
                        <span style={{ flex: "none", width: 16, textAlign: "center", color: ctx ? "var(--fg-dim3)" : r.k === "-" ? "var(--err)" : "var(--ok)", userSelect: "none" }}>{ctx ? " " : r.k === "-" ? "−" : "+"}</span>
                        <span style={{ ...(opts?.wide ? { whiteSpace: "pre" as const, overflowX: "auto" as const } : { whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const }), color: ctx ? "var(--fg-dim)" : r.k === "-" ? "#C99A9A" : "#B7CBBA" }}>{r.l || " "}</span>
                      </div>
                    );
                  })}
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
                <button className="hvRed2" onClick={() => this.rejectProposal(p.id)} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--err)", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>{t("misc.reject")}</button>
              </div>
            )}
          </div>
        );
  }

  /** 리뷰 발견 카드 한 장 — 제안(Proposal)과 달리 편집 패치가 없다. 심각도 색 + 닫기만. */
  renderFindingCard(f: Finding) {
    const sev: Record<Finding["severity"], [string, string]> = {
      high: [t("review.sevHigh"), "var(--err)"], med: [t("review.sevMed"), "var(--warn)"], low: [t("review.sevLow"), "var(--fg-sub2)"],
    };
    const [sl, sc] = sev[f.severity];
    return (
      <div key={f.id} className="sz-pop" style={{ position: "relative", background: "var(--bg-card)", border: "1px solid var(--w07)", borderRadius: 10, overflow: "hidden" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sc, zIndex: 2 }} />
        <div style={{ padding: "9px 12px 9px 15px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ flex: "none", fontSize: 9.5, fontWeight: 600, color: sc, background: sc + "1F", borderRadius: 4, padding: "0 6px", lineHeight: "15px" }}>{sl}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file}{f.line != null ? ":" + f.line : ""}</span>
            <div style={{ flex: 1 }} />
            <button className="hv05" title={t("review.dismiss")} onClick={() => this.setState(st => ({ reviewFindings: st.reviewFindings.filter(x => x.id !== f.id) }))}
              style={{ flex: "none", width: 18, height: 18, lineHeight: "16px", fontSize: 12, cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "1px solid var(--w10)" }}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--fg)", marginTop: 5, fontFamily: SUIT, fontWeight: 500 }}>{f.summary}</div>
          {f.detail && <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--fg-sub2)", marginTop: 3, fontFamily: SUIT }}>{f.detail}</div>}
        </div>
      </div>
    );
  }

  /** 수동 리뷰 — 현재 변경 diff 를 독립 패스로 점검한다. unstaged 없으면 staged 를 본다. */
  async reviewChanges() {
    const root = this.state.workspace?.root;
    if (!root || !window.schutz) { this.toast("info", t("review.noDiff")); return; }
    if (this.state.reviewBusy) return;
    this.setState({ reviewBusy: true });
    try {
      let d = await window.schutz.git(root, "diff", { staged: false }) as any;
      let patch = d && d.ok ? String(d.patch || "") : "";
      let truncated = !!(d && d.truncated);
      if (!patch.trim()) {                              // 워킹트리가 깨끗하면 스테이지된 것을 본다
        d = await window.schutz.git(root, "diff", { staged: true }) as any;
        patch = d && d.ok ? String(d.patch || "") : "";
        truncated = !!(d && d.truncated);
      }
      if (!patch.trim()) { this.toast("info", t("review.noDiff")); return; }
      const findings = await this.runReviewPass(patch);
      this.setState({ reviewFindings: findings });
      if (truncated) this.toast("info", t("review.truncated"));
      if (findings.length === 0) this.toast("ok", t("review.empty"));
    } finally {
      this.setState({ reviewBusy: false });
    }
  }

  /** 변경 전체를 한 화면에 — README 의 네 번째 기둥.
   *
   *  파일이 하나뿐이면 그리지 않는다. 아래 제안 카드가 이미 그 파일 이야기라
   *  같은 것을 두 번 말하는 꼴이 된다. 여럿일 때만 "이번에 무엇이 움직였나" 를
   *  먼저 보여준다.
   *
   *  별도 상태를 두지 않고 제안에서 유도한다 — 예전 s.files 는 데모만 채워서
   *  실사용에서 늘 비어 있었다(engine/changeset.ts 주석 참고). */
  renderChangeOverview() {
    const files = summarizeChanges(this.state.proposals);
    if (files.length < 2) return null;
    const tot = totalOf(files);
    const maxBar = Math.max(1, ...files.map(f => f.add + f.del));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--w06)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("chg.title")}</span>
          <span style={{ fontSize: 10.5, color: "var(--fg-sub2)" }}>{t("chg.total", { files: tot.files })}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--ok)" }}>+{tot.add}</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--err)" }}>−{tot.del}</span>
        </div>
        {files.map(f => {
          const d = this.agDef(f.agents[0]);
          const w = ((f.add + f.del) / maxBar) * 100;
          return (
            <div key={f.rel} className="hv04" role="button" tabIndex={0}
              title={f.rel + (f.agents.length > 1 ? " · " + f.agents.join(", ") : "")}
              onClick={() => this.openFile(f.rel)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.openFile(f.rel); } }}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 4px", borderRadius: 5, cursor: "pointer", minWidth: 0 }}>
              <span style={{ flex: "none", width: 5, height: 5, borderRadius: "50%", background: f.status === "pending" ? "#C4A882" : f.status === "failed" ? "#C97B7B" : d.color }} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>{f.rel}</span>
              <div style={{ flex: 1 }} />
              <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, color: "var(--ok)" }}>+{f.add}</span>
              <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, color: "var(--err)" }}>−{f.del}</span>
              {/* 파일 사이의 변경 크기를 눈으로 견주는 막대 — 가장 큰 파일이 100% */}
              <span style={{ flex: "none", width: 46, height: 3, borderRadius: 2, background: "var(--w07)", overflow: "hidden", display: "flex" }}>
                <span style={{ width: w + "%", height: "100%", display: "flex" }}>
                  <span style={{ flex: f.add || 0.001, background: "var(--ok)", opacity: .8 }} />
                  <span style={{ flex: f.del || 0.001, background: "#C97B7B", opacity: .8 }} />
                </span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  /** 되돌릴 수 있는 실행 목록. `restorable === 0` 인 것은 눌러 봐야 할 일이 없으므로 안 그린다. */
  renderCheckpoints() {
    const cps = this.state.checkpoints.filter(c => !c.open && c.restorable > 0);
    if (!cps.length) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8, borderTop: "1px dashed var(--w08)" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{t("cp.section")}</span>
        {cps.map(c => (
          <div key={c.rootRunId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 2px", minWidth: 0 }}>
            <span style={{ fontSize: 10.5, color: "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("cp.summary", { n: c.files, c: c.created, m: c.modified })}
            </span>
            <div style={{ flex: 1 }} />
            <button className="hv05" onClick={() => void this.askUndoRun(c.rootRunId)}
              style={{ flex: "none", height: 21, padding: "0 9px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w10)" }}>
              {t("cp.undo")}
            </button>
          </div>
        ))}
      </div>
    );
  }

  /** 되돌리기 확인. **무엇을 안 되돌리는지** 를 같이 보여주는 게 이 화면의 목적이다 —
   *  사용자가 그 뒤에 고친 파일을 조용히 덮으면 안 되고, 조용히 건너뛰어도 안 된다. */
  renderUndoAsk() {
    const ask = this.state.undoAsk;
    if (!ask) return null;
    const doing = actionable(ask.plan);
    const keeping = ask.plan.filter(v => v.action === "conflict");
    const skipped = ask.plan.filter(v => v.action === "skip");
    const why = (w: string) => w === "drift" ? t("cp.whyDrift")
      : w === "unsaved-buffer" ? t("cp.whyUnsaved")
      : w === "oversize" ? t("cp.whyOversize")
      : w === "gone" ? t("cp.whyGone")
      : w === "never-written" ? t("cp.whyNever") : t("cp.whyDone");
    const row = (rel: string, tag: string, dim: boolean) => (
      <div key={rel + tag} style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: dim ? "var(--fg-dim)" : "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>{rel}</span>
        <div style={{ flex: 1 }} />
        <span style={{ flex: "none", fontSize: 10, color: dim ? "var(--fg-dim2)" : "var(--fg-sub2)" }}>{tag}</span>
      </div>
    );
    return (
      <div className="sz-backdrop" onClick={() => { if (!ask.busy) this.setState({ undoAsk: null }); }}
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("undoAsk"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("cp.title"), "undoAsk")} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 480, maxWidth: "92%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t("cp.title")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
            {doing.map(v => row(v.rel, v.action === "delete" ? t("cp.willDelete") : t("cp.willRestore"), false))}
            {keeping.length > 0 && (
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--warn)", marginTop: 8 }}>{t("cp.keepHead")}</div>
            )}
            {keeping.map(v => row(v.rel, why((v as { why: string }).why), true))}
            {skipped.length > 0 && (
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fg-dim)", marginTop: 8 }}>{t("cp.skipHead")}</div>
            )}
            {skipped.map(v => row(v.rel, why((v as { why: string }).why), true))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim)", lineHeight: 1.6, marginBottom: 14 }}>{t("cp.scope")}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="hv05" disabled={ask.busy} onClick={() => this.setState({ undoAsk: null })}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: ask.busy ? "default" : "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)", opacity: ask.busy ? .6 : 1 }}>{t("misc.cancel")}</button>
            <button className="hvAccent" autoFocus disabled={ask.busy} onClick={() => void this.confirmUndoRun()}
              style={{ height: 32, padding: "0 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: ask.busy ? "default" : "pointer", borderRadius: 8, color: "var(--on-accent)", background: "var(--accent)", border: "none", opacity: ask.busy ? .6 : 1 }}>{t("cp.undo")}</button>
          </div>
        </div>
      </div>
    );
  }

  /** MCP 번들 설치 확인.
   *
   *  이 화면의 요점은 **실행될 명령을 그대로 보여 주는 것**이다. 번들은 인터넷에서 받은
   *  남의 파일이고, 설치는 곧 "이 명령을 내 기계에서 돌려도 좋다" 는 승인이다. */
  renderMcpbInstall() {
    const b = this.state.mcpb;
    if (!b) return null;
    const m = b.manifest;
    const missing = missingRequired(m.userConfig, b.values);
    const preview = resolveServer(m, { dirname: "…", home: "", sep: "/", userConfig: b.values });
    // 미리보기에는 비밀값을 찍지 않는다 — 화면 공유·스크린샷으로 새는 가장 흔한 길이다.
    const secret = new Set(m.userConfig.filter(f => f.sensitive).map(f => f.key));
    const mask = (s: string) => {
      let out = s;
      for (const k of secret) { const v = b.values[k]; if (v) out = out.split(v).join("••••"); }
      return out;
    };
    const label = { fontSize: 10.5, color: "var(--fg-dim)", marginBottom: 3 } as React.CSSProperties;
    return (
      <div className="sz-backdrop" onClick={() => { if (!b.busy) this.closeBundle(); }}
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("mcpb"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("mcpb.title"), "mcpb")} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 540, maxWidth: "94%", maxHeight: "86%", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{t("mcpb.title")}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "var(--fg)" }}>{m.displayName}</span>
            {m.version && <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--fg-dim)" }}>{m.version}</span>}
            {m.author && <span style={{ fontSize: 10.5, color: "var(--fg-dim2)" }}>· {m.author}</span>}
          </div>
          {m.description && <div style={{ fontSize: 12, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 12 }}>{m.description}</div>}

          {b.exists && (
            <div style={{ fontSize: 11, color: "var(--warn)", marginBottom: 10, lineHeight: 1.5 }}>⚠ {t("mcpb.willReplace", { name: m.name })}</div>
          )}
          {m.warnings.includes("cmd-shell") && (
            <div style={{ fontSize: 11, color: "var(--err)", marginBottom: 10, lineHeight: 1.5 }}>⚠ {t("mcpb.warnShell")}</div>
          )}

          <div style={label}>{t("mcpb.willRun")}</div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: "var(--fg)", background: "var(--bg-editor)", border: "1px solid var(--w07)", borderRadius: 8, padding: "9px 11px", marginBottom: 12, maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <span style={{ color: "var(--fg-dim)", userSelect: "none" }}>$ </span>
            {mask([preview.command, ...preview.args].join(" "))}
            {Object.keys(preview.env).length > 0 && (
              <div style={{ color: "var(--fg-dim2)", marginTop: 5 }}>
                {Object.keys(preview.env).map(k => k + "=" + (secret.has(k) ? "••••" : mask(preview.env[k]))).join("\n")}
              </div>
            )}
          </div>

          {m.tools.length > 0 && (
            <>
              <div style={label}>{t("mcpb.tools", { n: m.tools.length })}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 12 }}>
                {m.tools.slice(0, 12).join(" · ")}{m.tools.length > 12 ? " …" : ""}
              </div>
            </>
          )}

          {m.userConfig.length > 0 && (
            <>
              <div style={label}>{t("mcpb.settings")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {m.userConfig.map(f => (
                  <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--fg-sub)" }}>
                      {f.title}{f.required && <span style={{ color: "var(--err)" }}> *</span>}
                    </span>
                    {f.description && <span style={{ fontSize: 10, color: "var(--fg-dim2)" }}>{f.description}</span>}
                    <input
                      type={f.sensitive ? "password" : "text"}
                      value={b.values[f.key] ?? ""}
                      onChange={e => { const v = e.target.value; this.setState(s => (s.mcpb ? { mcpb: { ...s.mcpb, values: { ...s.mcpb.values, [f.key]: v } } } : null)); }}
                      style={{ height: 28, background: "var(--bg-root)", border: "1px solid " + (missing.includes(f.key) ? "var(--err)" : "var(--w10)"), borderRadius: 6, padding: "0 9px", color: "var(--fg)", fontSize: 12, fontFamily: f.sensitive ? MONO : "inherit", outline: "none" }} />
                  </label>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 10.5, color: "var(--fg-dim)", lineHeight: 1.6, marginBottom: 14 }}>{t("mcpb.scope")}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="hv05" disabled={b.busy} onClick={() => this.closeBundle()}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: b.busy ? "default" : "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)", opacity: b.busy ? .6 : 1 }}>{t("misc.cancel")}</button>
            <button className="hvAccent" autoFocus disabled={b.busy || missing.length > 0} onClick={() => void this.installBundle()}
              title={missing.length ? t("mcpb.fillRequired") : ""}
              style={{ height: 32, padding: "0 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: (b.busy || missing.length) ? "default" : "pointer", borderRadius: 8, color: "var(--on-accent)", background: (b.busy || missing.length) ? "var(--w10)" : "var(--accent)", border: "none" }}>
              {b.busy ? t("mcpb.installing") : t("mcpb.install")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /** 커밋 하나를 통째로. 색은 diff 관례대로 — 눈으로 훑는 화면이라 그게 제일 빠르다. */
  renderCommitView() {
    const cv = this.state.commitView;
    if (!cv) return null;
    const lines = cv.text.split("\n");
    const colorOf = (ln: string) =>
      ln.startsWith("+++") || ln.startsWith("---") ? "var(--fg-dim)"
      : ln.startsWith("+") ? "var(--ok)"
      : ln.startsWith("-") ? "var(--err)"
      : ln.startsWith("@@") ? "var(--accent)"
      : ln.startsWith("diff --git") ? "var(--fg-sub)" : "var(--fg-sub2)";
    return (
      <div className="sz-backdrop" onClick={() => this.setState({ commitView: null })}
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("commitView"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(cv.hash, "commitView")} className="sz-pop" onClick={e => e.stopPropagation()}
          style={{ width: 820, maxWidth: "94%", height: "78%", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 16 }}>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--accent)" }}>{cv.hash}</span>
            <div style={{ flex: 1 }} />
            <button className="hv05" onClick={() => void this.copyText(cv.text)}
              style={{ height: 24, padding: "0 10px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w12)" }}>{t("gitp.copyPatch")}</button>
            <button className="hv05" onClick={() => this.setState({ commitView: null })}
              style={{ height: 24, padding: "0 10px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w12)" }}>{t("sc4.closeTab")}</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "var(--bg-editor)", border: "1px solid var(--w07)", borderRadius: 8, padding: "10px 12px" }}>
            {cv.loading && <div style={{ fontSize: 12, color: "var(--fg-dim)" }}>{t("gitp.loadingCommit")}</div>}
            {!cv.loading && lines.map((ln, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.55, whiteSpace: "pre", color: colorOf(ln) }}>{ln || " "}</div>
            ))}
            {cv.truncated && <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 8 }}>{t("gitp.commitTruncated")}</div>}
          </div>
        </div>
      </div>
    );
  }

  /** 클립보드에 넣고 알린다. 실패를 조용히 넘기면 붙여넣을 때에야 안다. */
  private async copyText(text: string) {
    try { await navigator.clipboard.writeText(text); this.toast("ok", t("chat.copied")); }
    catch (e) { this.toast("error", t("sc4.copyFailed") + (e instanceof Error ? e.message : String(e))); }
  }

  renderProposals() {
    const s = this.state;
    const pending = s.proposals.filter(p => p.status === "pending").length;
    const findings = [...s.reviewFindings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>{t("agent.review")}</span>
          {s.proposals.length > 0 && <span style={{ fontSize: 10.5, color: "var(--fg-sub2)", background: "var(--w06)", borderRadius: 8, padding: "0 7px", lineHeight: "16px" }}>{s.proposals.length}</span>}
          <div style={{ flex: 1 }} />
          <button className="hv08" title={t("review.button")} disabled={s.reviewBusy} onClick={() => void this.reviewChanges()}
            style={{ flex: "none", height: 22, padding: "0 9px", fontSize: 10.5, fontFamily: SUIT, cursor: s.reviewBusy ? "default" : "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w10)", opacity: s.reviewBusy ? 0.6 : 1 }}>
            {s.reviewBusy ? t("review.running") : t("review.button")}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {findings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4, borderBottom: "1px dashed var(--w08)", marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fg-sub2)" }}>{t("review.title")}</span>
                <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>{t("review.foundN", { n: findings.length })}</span>
                <div style={{ flex: 1 }} />
                <button className="hv05" onClick={() => this.setState({ reviewFindings: [] })} style={{ fontSize: 10, cursor: "pointer", border: "none", background: "transparent", color: "var(--fg-dim)" }}>{t("review.dismiss")}</button>
              </div>
              {findings.map(f => this.renderFindingCard(f))}
            </div>
          )}
          {s.proposals.length === 0 && findings.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-dim2)", padding: "6px 2px" }}>{t("agent.reviewEmpty")}</div>}
          {this.renderChangeOverview()}
          {pending > 1 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hvAccent" onClick={() => s.proposals.filter(p => p.status === "pending").forEach(p => void this.acceptProposal(p.id))} style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>{t("misc.acceptAll")}</button>
              <button className="hv05" onClick={() => s.proposals.forEach(p => this.rejectProposal(p.id))} style={{ flex: 1, height: 30, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("misc.rejectAll")}</button>
            </div>
          )}
          {s.proposals.map(p => this.renderProposalCard(p))}
          {this.renderCheckpoints()}
        </div>
      </div>
    );
  }

  // ── 우 패널: 변경 검토 ──
  renderReview() {
    // 예전엔 이 아래로 데모용 파일 카드 격자가 80여 줄 더 있었다. 첫 줄에서 늘
    // 갈라져 나가 **데스크톱에서는 한 번도 그려지지 않는** 코드였다.
    return this.renderProposals();
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
          {/* 터미널 탭만 스크롤한다. 예전엔 이 줄 전체가 한 flex 라, 터미널을 예닐곱 개 열면
              문제·AI로그·접기(⌄)가 오른쪽으로 밀려 **화면 밖으로 나갔다** — 가로 스크롤이
              없어서 도크를 접을 방법조차 없었다. 바로 위 에디터 탭 줄은 이미 이렇게 돼 있다. */}
          <div style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 2, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          {s.terms.map(t => {
            const on = s.termTab === t.id;
            return (
              <div key={t.id} className="hvTermTab" onMouseDown={() => this.setState({ termTab: t.id, termOpen: true })}
                style={{ flex: "none", height: 24, padding: "0 6px 0 11px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, color: on ? "var(--fg)" : "var(--fg-dim)", background: on ? "var(--w06)" : "transparent", transition: "background var(--dur) var(--ease), color var(--dur-fast) var(--ease)" }}>
                {t2("sc1.terminal_prefix") + t.n}
                {s.terms.length > 1 && (
                  <button className="hvDim" title={termCloseTitle} onMouseDown={e => { e.stopPropagation(); this.closeTerm(t.id); }}
                    style={{ width: 15, height: 15, fontSize: 9, fontFamily: "inherit", cursor: "pointer", borderRadius: 4, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
                )}
              </div>
            );
          })}
          </div>
          <button className="hvDim" title={t("misc.newTerminal")} onClick={() => this.addTerm()}
            style={{ flex: "none", width: 22, height: 22, fontSize: 13, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>＋</button>
          <div style={{ flex: "none", width: 1, height: 14, background: "var(--w07)", margin: "0 4px" }} />
          <button className="hvTermTab" onMouseDown={() => this.setState({ termTab: "problems", termOpen: true })}
            style={{ flex: "none", height: 24, padding: "0 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, color: onProblems ? "var(--fg)" : "var(--fg-dim)", background: onProblems ? "var(--w06)" : "transparent", border: "none", transition: "background var(--dur) var(--ease), color var(--dur-fast) var(--ease)" }}>
            {t("misc.problems")}
            {(errs > 0 || warns > 0) && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: errs > 0 ? "var(--err)" : "var(--warn)", background: errs > 0 ? "var(--err-soft)" : "var(--warn-soft)", borderRadius: 7, padding: "0 6px", lineHeight: "14px" }}>{errs + warns}</span>
            )}
          </button>
          <button className="hvTermTab" onMouseDown={() => this.setState({ termTab: "ai", termOpen: true })}
            style={{ flex: "none", height: 24, padding: "0 11px", display: "flex", alignItems: "center", fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, color: onAi ? "var(--fg)" : "var(--fg-dim)", background: onAi ? "var(--w06)" : "transparent", border: "none", transition: "background var(--dur) var(--ease), color var(--dur-fast) var(--ease)" }}>{t("misc.aiLog")}</button>
          <div style={{ flex: 1 }} />
          <button className="hvDim" onClick={() => this.setState({ termOpen: false })} title={t("misc.collapseDock")} style={{ flex: "none", width: 22, height: 22, fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>⌄</button>
        </div>

        {/* 본문 — 터미널들은 셸 유지를 위해 모두 마운트, 비활성은 숨김 */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {window.schutz ? (
            s.terms.map(t => (
              <div key={t.id} style={{ position: "absolute", inset: 0, display: s.termTab === t.id ? "block" : "none" }}>
                <XtermView id={t.id} cwd={s.workspace?.root} codeFont={getEditorPrefs().codeFont} fontSize={getEditorPrefs().fontSize} themeId={getThemeId()} initialCommand={t.cmd} />
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
                <span style={{ flex: "none", color: p.severity >= 8 ? "var(--err)" : p.severity >= 4 ? "var(--dirty)" : DIM }}>{p.severity >= 8 ? "✕" : p.severity >= 4 ? "▲" : "·"}</span>
                <span style={{ flex: "none", color: TXT, minWidth: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.rel.split("/").pop()}</span>
                <span style={{ flex: "none", color: DIM }}>:{p.line}:{p.col}</span>
                <span style={{ color: SUB, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.message}</span>
                {/* 여기까지 와서 고칠 방법이 없던 자리 — 전구는 에디터 안에만 있었다.
                    mouseDown 으로 행 이동이 먼저 일어나므로 click 은 그 뒤에 도착한다. */}
                <button className="hv08" title={t("misc.quickFixTitle")}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); this.openProblem(p); setTimeout(() => this.triggerEditorAction("editor.action.quickFix"), 220); }}
                  style={{ flex: "none", marginLeft: "auto", height: 17, padding: "0 7px", fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "1px solid var(--w10)" }}>
                  {t("misc.quickFix")}
                </button>
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
      <div style={{ position: "fixed", inset: 0, zIndex: overlayZ("mru"), display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.2)" }}>
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
    const col = { info: "var(--accent)", ok: "var(--ok)", error: "var(--err)" };
    return (
      // 토스트는 조용한 실패를 표면화하려고 만든 채널이다 — 화면을 못 보는 사람에게도
      // 도착해야 뜻이 있다. polite: 진행 중인 낭독을 자르지 않고 뒤에 붙는다.
      <div role="status" aria-live="polite" aria-atomic="false"
        style={{ position: "fixed", right: 16, bottom: 40, zIndex: 300, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
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
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("askClose"), background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("misc.unsavedTitle"), "askClose")} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()}
          style={{ width: 380, maxWidth: "90%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: "18px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t("misc.unsavedTitle")}</div>
          <div style={{ fontSize: 12, color: "var(--fg-sub2)", lineHeight: 1.6, marginBottom: 16 }}>
            <span style={{ fontFamily: MONO, color: "var(--fg)" }}>{a.rel.split("/").pop()}</span>{t("misc.unsavedBodySuffix")}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="hv05" onClick={closeAsk}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>{t("misc.cancel")}</button>
            <button className="hvRed2" onClick={() => this.confirmCloseDiscard()}
              style={{ height: 32, padding: "0 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--err)", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>{t("misc.dontSave")}</button>
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
        <div {...this.dialogProps(t("sc1.cmd_global_search"), "search")} className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 640, maxWidth: "92%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--w08)" }}>
            <button className="hvDim" title={s.replaceOpen ? t("palette.replaceClose") : t("palette.replaceOpen")} onClick={() => this.setState(st => ({ replaceOpen: !st.replaceOpen }))}
              style={{ flex: "none", width: 26, height: 44, fontSize: 11, fontFamily: "inherit", cursor: "pointer", color: "var(--fg-dim)", background: "transparent", border: "none" }}>{s.replaceOpen ? "▾" : "▸"}</button>
            <input data-szfocus value={s.searchQuery}
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
        <div {...this.dialogProps(t("palette.cmdPlaceholder"), "cmd")} className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 580, maxWidth: "92%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input data-szfocus value={s.cmdQuery}
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
        <div {...this.dialogProps(t("palette.quickPlaceholder"), "quick")} className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 560, maxWidth: "90%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input data-szfocus value={s.quickQuery}
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

        {/* 조사식 — 세션이 없어도 미리 적어둘 수 있다(멈추는 순간 값이 채워진다) */}
        <div>
          <div style={sectHdr}>{t("dbg.watch")}</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
            <input value={s.watchInput} placeholder={t("dbg.watchAdd")}
              onChange={e => this.setState({ watchInput: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); this.addWatch(); } }}
              style={{ flex: 1, minWidth: 0, padding: "4px 7px", fontSize: 11, fontFamily: MONO, borderRadius: 6, border: "1px solid var(--w10)", background: "var(--bg-root)", color: "var(--fg)", outline: "none" }} />
            <button className="hv08" onClick={() => this.addWatch()} disabled={!s.watchInput.trim()}
              style={{ flex: "none", padding: "4px 9px", fontSize: 11, fontFamily: SUIT, borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub)", cursor: s.watchInput.trim() ? "pointer" : "default", opacity: s.watchInput.trim() ? 1 : 0.4 }}>+</button>
          </div>
          {s.watches.length === 0 && <div style={{ fontSize: 10.5, color: "var(--fg-dim)", padding: "2px 4px" }}>{t("dbg.watchEmpty")}</div>}
          {s.watches.map(w => (
            <div key={w.expr} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", fontFamily: MONO, fontSize: 11, minWidth: 0 }}>
              <span style={{ color: "var(--accent-hi)", flex: "none", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.expr}</span>
              <span style={{ color: "var(--fg-dim)", flex: "none" }}>=</span>
              {/* 값이 null 이면 "지금은 알 수 없다" 다 — 옛 값을 남겨 지금 값처럼 보이게 하지 않는다 */}
              <span style={{ color: w.value === null ? "var(--fg-dim2)" : "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {w.value === null ? t("dbg.watchIdle") : w.value}
              </span>
              <button className="hv08" onClick={() => this.removeWatch(w.expr)} title={t("review.dismiss")}
                style={{ marginLeft: "auto", flex: "none", border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>

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
    // 닫는 애니메이션 중에 다시 연 것이다 — DOM 노드가 살아 있어 dialogProps 의 "첫 포커스"
    // 표식이 남아 있다. 세대를 올려 무효화하지 않으면 재열린 모달에 포커스가 안 간다.
    this._dlgSeq[key] = (this._dlgSeq[key] ?? 0) + 1;
    if (this._closeTimers[key]) { clearTimeout(this._closeTimers[key]); delete this._closeTimers[key]; }
    if (this.isClosing(key)) this.setState(s => ({ closing: s.closing.filter(k => k !== key) }));
  }
  /** 오버레이 열기 — 닫는 애니메이션 중이면 취소하고 연다 (닫자마자 다시 닫히는 버그 방지).
   *  플래그 → closing 키 맵은 overlays.ts 의 표에서 파생된다(손으로 관리하던 사본을 없앴다). */
  private openO(patch: Partial<S>) {
    for (const flag of Object.keys(patch)) {
      const key = OVERLAY_KEY[flag];
      if (key && (patch as any)[flag]) this.cancelClose(key);
    }
    this.setState(patch as any);
  }

  /** 지금 실제로 떠 있는 오버레이 id 들. 닫는 애니메이션 중인 것은 뺀다 —
   *  안 그러면 260ms 동안 이미 사라지는 모달이 Esc 와 단축키를 계속 먹는다. */
  private openOverlayIds(st: S = this.state): string[] {
    const s = st as unknown as Record<string, unknown>;
    const out: string[] = [];
    for (const o of OVERLAYS) {
      if (!o.flag || !s[o.flag]) continue;
      if (o.closeKey && st.closing.includes(o.closeKey)) continue; // st 기준으로 본다 — 이전 상태로도 부른다
      out.push(o.id);
    }
    return out;
  }

  /** 표의 id → 그 오버레이의 실제 닫기. 실행 중(busy)이면 아무 일도 하지 않는다 —
   *  호출측이 이미 Esc 를 삼킨 뒤라, 진행 중인 작업을 남기고 창만 사라지는 일은 없다. */
  private closeOverlayById(id: string): void {
    const s = this.state;
    switch (id) {
      case "sheet": this.closeSheet(); return;
      case "search": this.closeOverlay("search", { searchOpen: false }); return;
      case "sym": this.closeOverlay("sym", { symOpen: false }); return;
      case "quick": this.closeOverlay("quick", { quickOpen: false }); return;
      case "extPanel": this.closeOverlay("extPanel", { extPanel: null }); return;
      case "cmd": this.closeOverlay("cmd", { cmdOpen: false }); return;
      case "about": this.closeOverlay("about", { aboutOpen: false }); return;
      case "usage": this.closeOverlay("usage", { usageOpen: false }); return;
      case "keys": this.closeOverlay("keys", { keysOpen: false, keyCapture: null }); return;
      case "commands": this.closeOverlay("commands", { commandsOpen: false }); return;
      case "mcp": this.closeOverlay("mcp", { mcpOpen: false }); return;
      case "engine": this.closeOverlay("engine", { engineOpen: false }); return;
      case "plugins": this.closeOverlay("plugins", { pluginOpen: false }); return;
      case "cloud": this.stopCloudPoll(); this.closeOverlay("cloud", { cloudOpen: false }); return;
      case "extDetail": this.closeOverlay("extDetail", { extDetail: null }); return;
      case "settings": this.closeOverlay("settings", { settingsOpen: false }); return;
      // Ctrl 을 떼면 확정되는 게 정상 경로다. Esc 는 **고르지 않고** 물러난다 —
      // 그러려면 확정용 keyup 리스너부터 떼야 한다(안 떼면 Ctrl 을 놓는 순간 파일이 바뀐다).
      case "mru": this._mruCommit?.(); this._mruCommit = null; this.setState({ mruOpen: false }); return;
      case "askClose": this.closeOverlay("askClose", { askClose: null }); return;
      case "askRun": this.answerRun(false); return;
      case "undoAsk": if (!s.undoAsk?.busy) this.setState({ undoAsk: null }); return;
      case "commitView": this.setState({ commitView: null }); return;
      case "mcpb": if (!s.mcpb?.busy) void this.closeBundle(); return;
      case "confirmAsk": this.answerConfirm(false); return;   // Esc = 취소
      case "extAsk": this.answerExtension(undefined); return;  // 확장에는 "취소" 로 간다
      case "import": this.closeImport(); return;
      case "tour": this.endTour(); return;
    }
  }

  /** 모달을 열기 직전에 포커스가 있던 곳 — 닫을 때 여기로 돌려준다. key 는 오버레이 id. */
  private _focusReturn: Record<string, HTMLElement | null> = {};
  /** 모달별 "첫 포커스를 이미 줬다" 표식의 세대 번호. 닫는 애니메이션(260ms) 중에 다시 열면
   *  React 가 같은 DOM 노드를 재사용해 dataset 이 남아 있는데, 예전엔 그걸 "이미 줬다" 로
   *  읽어 **포커스가 안 갔다.** cancelClose 가 세대를 올려 표식을 무효화한다. */
  private _dlgSeq: Record<string, number> = {};

  /** 모달 접근성 — role/aria + 마운트 시 첫 포커스 + Tab 포커스 트랩.
   *  포커스 되돌리기는 여기가 아니라 componentDidUpdate 가 한다(아래 _restoreClosedFocus 주석 참고). */
  private dialogProps(title: string, key: string): any {
    const seq = String(this._dlgSeq[key] ?? 0);
    return {
      role: "dialog", "aria-modal": true, "aria-label": title, tabIndex: -1,
      ref: (el: HTMLElement | null) => {
        if (!el || el.dataset.szf === seq) return;
        el.dataset.szf = seq;
        const prev = document.activeElement as HTMLElement | null;
        if (this._focusReturn[key] === undefined) {
          this._focusReturn[key] = prev && prev !== document.body && !el.contains(prev) ? prev : null;
        }
        // data-szfocus 가 있으면 그쪽이 우선이다 — 검색 팔레트는 DOM 순서상 첫 포커스 대상이
        // 치환 토글 버튼이라, 그냥 "첫 번째" 를 잡으면 정작 입력창에 커서가 안 간다.
        const f = el.querySelector<HTMLElement>("[data-szfocus]")
          ?? el.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])');
        (f ?? el).focus();
      },
      onKeyDown: (e: React.KeyboardEvent) => this.trapTab(e),
    };
  }

  /** 닫힌 모달의 포커스를 원래 자리로 돌린다.
   *
   *  ref 콜백의 언마운트(null) 분기에서 하면 안 된다 — dialogProps 는 매 렌더 새 함수를
   *  돌려주므로 React 가 렌더마다 ref(null)→ref(el) 을 부른다. 그러면 모달이 떠 있는 내내
   *  포커스가 뒤로 튕긴다. 그래서 "열려 있던 것이 사라졌다" 는 사실을 상태로 본다.
   *
   *  이게 없으면 모달을 닫는 순간 포커스가 <body> 로 떨어져, 다음 Tab 이 문서 맨 앞부터
   *  시작한다(키보드만 쓰는 사람에게는 매번 처음부터 훑는 일이 된다). */
  private _restoreClosedFocus(prevState: S) {
    const now = new Set(this.openOverlayIds());
    for (const id of this.openOverlayIds(prevState)) {
      if (now.has(id)) continue;
      const back = this._focusReturn[id];
      delete this._focusReturn[id];
      if (back && back.isConnected) { try { back.focus(); } catch { /* 사라진 노드 */ } }
    }
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
        <div {...this.dialogProps(title, key)} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()} style={{ width, maxWidth: "92%", maxHeight: "84%", overflow: "auto", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)", fontFamily: SUIT, outline: "none" }}>
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
        {/* 오프닝과 같은 문장. 언어와 무관하게 독일어 한 줄만 둔다 — 번역 자막도,
            설명 문구도 붙이지 않는다. 이건 번역 대상이 아니라 상표에 가깝다. */}
        <div style={{ fontSize: 15, fontWeight: 300, color: "var(--fg)", letterSpacing: "-.01em" }}>
          {t("open.say").replace(/\*/g, "")}
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
    let totIn = 0, totOut = 0, totCost = 0;
    for (const d of AGDEF) { const a = this.state.agents[d.id]; totIn += a.tin; totOut += a.tout; totCost += a.cost; }
    // 비용은 **재놓고 안 보여주던** 값이다. 다만 우리가 값을 아는 건 CLI 가 직접 청구액을
    // 알려줄 때뿐이라(total_cost_usd), 0 이면 칸을 아예 안 만든다. 요금표를 짜서 추정하면
    // 그럴듯하지만 틀린 숫자가 된다 — 그건 안 한다.
    const tiles: [string, string][] = [
      [t("modal.usageInputTokens"), totIn.toLocaleString()],
      [t("modal.usageOutputTokens"), totOut.toLocaleString()],
    ];
    if (totCost > 0) tiles.push([t("modal.usageCost"), "$" + totCost.toFixed(totCost < 1 ? 4 : 2)]);
    const body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {tiles.map(([k, v]) => (
            <div key={k} style={{ flex: 1, background: "var(--bg-root)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--w06)" }}>
              <div style={{ fontSize: 10, color: "var(--fg-dim)", marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)", fontFamily: MONO }}>{v}</div>
            </div>
          ))}
        </div>
        {totCost > 0 && <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", marginTop: -8 }}>{t("modal.usageCostNote")}</div>}
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
                <div style={{ fontSize: 10.5, color: "var(--fg-dim)", fontFamily: MONO }}>
                  {t("modal.usageAgentTokens", { tin: a.tin.toLocaleString(), tout: a.tout.toLocaleString(), price: sub ? t("modal.subscription") : "" })}
                  {a.cost > 0 && " · $" + a.cost.toFixed(a.cost < 1 ? 4 : 2)}
                </div>
                {q && (
                  <div style={{ fontSize: 10, color: "var(--fg-dim2)", fontFamily: MONO, marginTop: 2 }}>
                    {this.quotaText(d.id)}{q.plan ? " · " + q.plan : ""}
                    {q.windows.map(w => w.resetAt).filter(Boolean).length > 0 && " · " + t("modal.quotaResets", { when: this.quotaResetText(d.id) })}
                  </div>
                )}
              </div>
              <div title={t("status.quotaTitle")} style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: left === null ? "var(--fg-dim3)" : left <= 10 ? "var(--err)" : left <= 25 ? "var(--warn)" : "var(--ok)" }}>{left === null ? "—" : left + "%"}</div>
            </div>
          );
        })}
        <div style={{ fontSize: 10, color: "var(--fg-dim)" }}>{t("modal.usageFootnote")}</div>
      </div>
    );
    return this.modalShell("usage", t("modal.usageTitle"), () => this.closeOverlay("usage", { usageOpen: false }), body, 520);
  }

  /** 키바인딩 — **읽기 전용 치트시트가 아니라 실제 표**를 그린다.
   *  예전엔 손으로 적은 목록이라 실제 동작과 어긋나도 아무도 몰랐다. 이제 디스패처가
   *  보는 그 표(keymap.ts)를 그대로 보여주고, 여기서 바꾼 것이 곧바로 그 표에 들어간다. */
  renderKeybindings() {
    if (!this.state.keysOpen && !this.isClosing("keys")) return null;
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const ov = getOverrides();
    const capturing = this.state.keyCapture;
    const changed = Object.keys(ov).length;
    return this.modalShell("keys", t("modal.keysTitle"), () => this.closeOverlay("keys", { keysOpen: false, keyCapture: null }), (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-dim2)", lineHeight: 1.5 }}>{t("key.hint")}</span>
          <div style={{ flex: 1 }} />
          {changed > 0 && (
            <button className="hv08" onClick={() => { resetOverrides(); this.rebuildKeymap(); this.forceUpdate(); }}
              style={{ flex: "none", padding: "4px 9px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub)" }}>
              {t("key.resetAll", { n: changed })}
            </button>
          )}
        </div>
        {BINDINGS.map((b, i) => {
          const chord = chordFor(b.id, ov);
          const overridden = !!ov[b.id];
          const clash = conflictsOf(chord, b.id, ov);
          const on = capturing === b.id;
          return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: i % 2 ? "var(--w03)" : "transparent" }}>
              <span style={{ fontSize: 12, color: "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(b.labelKey)}</span>
              {/* 같은 화음을 둘이 쓰면 앞선 것만 동작한다 — 조용히 두지 않고 말한다 */}
              {clash.length > 0 && <span title={t("key.conflictWith", { other: clash.map(c => t(BINDINGS.find(x => x.id === c)!.labelKey)).join(", ") })}
                style={{ flex: "none", fontSize: 10, color: "var(--err)" }}>⚠</span>}
              <div style={{ flex: 1 }} />
              {overridden && !on && (
                <button className="hvDim" title={t("key.resetOne")} onClick={() => { setOverride(b.id, null); this.rebuildKeymap(); this.forceUpdate(); }}
                  style={{ flex: "none", border: "none", background: "transparent", color: "var(--fg-dim)", cursor: "pointer", fontSize: 11 }}>↺</button>
              )}
              <button className="hv08" onClick={() => this.setState({ keyCapture: on ? null : b.id })}
                style={{
                  flex: "none", minWidth: 96, fontSize: 10.5, fontFamily: MONO, cursor: "pointer",
                  color: on ? "var(--on-accent)" : "var(--fg)", background: on ? "var(--accent)" : "var(--w06)",
                  border: `1px solid ${overridden ? "var(--accent)" : "var(--w08)"}`, borderRadius: 5, padding: "2px 7px",
                  transition: "background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)",
                }}>
                {on ? t("key.pressNow") : displayChord(chord, isMac)}
              </button>
            </div>
          );
        })}
      </div>
    ), 460);
  }

  // ── MCP 관리 ──
  openMcp() { this.cancelClose("mcp"); this.setState({ mcpOpen: true }); void this.refreshMcp().then(() => this.refreshEngineStatus()); }

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
      <div style={{ position: "fixed", inset: 0, zIndex: overlayZ("tour") }} aria-modal="true" role="dialog"
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
              <TourFigure region={step.figure as FigureRegion} mode={this.state.uiMode} />
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

  /** 엔진 도달성 감시 타이머. 사용자가 Studio 를 켜면 알아서 알아채라고 둔다. */
  private _engineWatch = 0;

  /** Studio 를 켜면 "연결됐다" 고 알려 준다.
   *
   *  예전엔 MCP 패널을 열거나 [상태 확인] 을 눌러야 알 수 있었다. 그런데 순서는 대개 반대다 —
   *  Schutz 를 띄워 두고 나서 Studio 를 켠다. 그래서 배경에서 지켜보다가 **닿지 않던 것이
   *  닿는 순간**에만 한 번 알린다.
   *
   *  status 호출은 Studio 를 두드리므로 자주 하면 안 된다. 아직 못 닿을 때만 20초마다 보고,
   *  닿은 뒤에는 60초로 늦춘다(끊긴 것도 알아야 하지만 급하지 않다). */
  private startEngineWatch() {
    if (this._engineWatch) return;
    const tick = async () => {
      const running = new Set(mcp.getMcpTools().map(t => t.server));
      const active = engines.ADAPTERS.filter(a => running.has(a.serverName) && a.statusTool);
      let anyReachable = false;
      for (const a of active) {
        const was = this.state.engineStatus[a.serverName]?.reachable;
        try {
          const out = await mcp.callTool(a.serverName, a.statusTool!, {});
          const now = !/cannot reach|unreachable|not reachable|timed out|timeout|refused|econnrefused|⚠️/i.test(out);
          if (now) anyReachable = true;
          if (now !== was) {
            this.setState(st => ({ engineStatus: { ...st.engineStatus, [a.serverName]: { reachable: now, detail: "" } } }));
            // 알림은 "이제 닿는다" 일 때만. 꺼진 것까지 매번 띄우면 잔소리가 된다.
            if (now) this.toast("ok", t("eng.autoConnected", { engine: a.label }));
          }
        } catch { /* 못 물어봤으면 다음 차례에 다시 */ }
      }
      this._engineWatch = window.setTimeout(tick, active.length === 0 ? 60_000 : anyReachable ? 60_000 : 20_000);
    };
    this._engineWatch = window.setTimeout(tick, 4_000);   // 부팅 직후 붐빌 때는 비켜 준다
  }

  /** 게임 엔진 접속 상태 조회 — 돌고 있는 엔진 서버마다 status 도구를 불러 Studio 도달성을 본다.
   *  status 호출은 Studio 를 두드려 응답이 몇 초 걸릴 수 있으므로 패널 열 때·연결 후에만 부른다. */
  async refreshEngineStatus() {
    const running = new Set((await mcp.listServers()).filter(s => s.running).map(s => s.name));
    const active = engines.ADAPTERS.filter(a => running.has(a.serverName));
    await Promise.all(active.map(async a => {
      const set = (reachable: boolean, detail: string) =>
        this.setState(st => ({ engineStatus: { ...st.engineStatus, [a.serverName]: { reachable, detail } } }));
      // 상태 도구가 없는 엔진(예: Blender)은 도달성을 따로 못 물으니 running=연결로 본다.
      if (!a.statusTool) { set(true, ""); return; }
      try {
        const out = await mcp.callTool(a.serverName, a.statusTool, {});
        const reachable = !/cannot reach|unreachable|not reachable|timed out|timeout|refused|econnrefused|⚠️/i.test(out);
        set(reachable, out.split("\n").map(l => l.trim()).find(Boolean)?.slice(0, 120) ?? "");
      } catch (e) { set(false, e instanceof Error ? e.message : String(e)); }
    }));
  }

  // ── 커넥터 ──────────────────────────────────────────────────────────────────
  // Claude Code 플러그인 하나가 스킬·명령·MCP 서버를 함께 들고 온다. 그래서 "MCP 를 손으로
  // 등록하는 것"(비공식)과 달리, 여기서 켜는 것은 공식 카탈로그에서 고른 묶음이다.
  // 화면은 VS Code 확장 패널과 같은 어법으로 — 검색 · 분류 · 카드 · 켬/끔.

  async refreshPlugins() {
    if (!window.schutz?.pluginList) return;
    try {
      const r = await window.schutz.pluginList();
      if (r.ok) this.setState({ plugins: r.plugins });
    } catch { /* 마켓플레이스가 없어도 앱은 그대로 돈다 */ }
  }

  openPlugins() {
    this.cancelClose("plugins");
    this.setState({ pluginOpen: true, pluginQuery: "", pluginCat: "" });
    void this.refreshPlugins();
  }

  // ── 새 버전 알림 ────────────────────────────────────────────────────────────
  // 자동 업데이트는 의도적으로 쓰지 않는다(릴리스는 설치본만 올린다). 대신 최신 릴리스를
  // 조용히 확인해 "새 버전이 있다"고만 알리고, 받는 것은 사용자가 정한다.
  private _updateTimer: ReturnType<typeof setTimeout> | null = null;

  /** 하루에 한 번만 물어본다 — 켤 때마다 두드리면 GitHub 한도만 축낸다. */
  private updateCheckDue(): boolean {
    try {
      const last = +(localStorage.getItem("schutz.updateCheckedAt") || 0);
      return !last || Date.now() - last > 24 * 60 * 60 * 1000;
    } catch { return true; }
  }

  async checkForUpdate(manual = false) {
    if (!window.schutz?.httpGet) return;
    if (APP_VERSION === "dev" && !manual) return;      // dev 빌드는 알림 대상이 아니다
    if (!manual && !this.updateCheckDue()) return;
    try {
      const r = await window.schutz.httpGet("https://api.github.com/repos/SchutzScript/Schutz/releases/latest", { Accept: "application/vnd.github+json" });
      try { localStorage.setItem("schutz.updateCheckedAt", String(Date.now())); } catch { /* */ }
      if (!r.ok || !r.json) { if (manual) this.toast("info", t("update.checkFailed")); return; }
      const tag = String(r.json.tag_name || "");
      const url = String(r.json.html_url || "https://github.com/SchutzScript/Schutz/releases/latest");
      if (!tag) { if (manual) this.toast("info", t("update.checkFailed")); return; }
      const latest = tag.replace(/^v/, "");
      if (!isNewerVer(latest, APP_VERSION)) {
        if (manual) this.toast("ok", t("update.upToDate", { version: APP_VERSION }));
        return;
      }
      // 이미 "나중에" 로 넘긴 버전이면 배지만 남기고 토스트는 띄우지 않는다.
      let skipped = "";
      try { skipped = localStorage.getItem("schutz.updateSkipped") || ""; } catch { /* */ }
      this.setState({ update: { version: latest, url } });
      if (manual || skipped !== latest) this.toast("info", t("update.available", { version: latest }));
    } catch {
      if (manual) this.toast("info", t("update.checkFailed"));
    }
  }

  /** 받으러 가기 — 다운로드 페이지를 연다(설치본을 직접 내려받지 않는다). */
  openUpdate() {
    const u = this.state.update;
    void window.schutz?.openExternal(u ? u.url : "https://schutzscript.github.io/Schutz/");
  }
  /** 이번 버전은 넘긴다 — 다음 버전이 나오면 다시 알린다. */
  skipUpdate() {
    const v = this.state.update?.version;
    if (v) { try { localStorage.setItem("schutz.updateSkipped", v); } catch { /* */ } }
    this.setState({ update: null });
  }

  // ── 클라우드 위임(Codex Cloud) ──────────────────────────────────────────────
  // 로컬 codex CLI 로 원격 태스크를 넘기고 상태를 폴링한다. 저장소에 연결된 클라우드 환경이
  // 미리 있어야 하며, 없으면 안내로 돌린다(가장 흔한 경우). PR 은 Codex Cloud 가 직접 연다.
  private _cloudPoll: ReturnType<typeof setInterval> | null = null;

  private cloudEnv(): string { try { return localStorage.getItem("schutz.cloudEnv") || ""; } catch { return ""; } }
  private setCloudEnv(v: string) { try { localStorage.setItem("schutz.cloudEnv", v); } catch { /* */ } this.forceUpdate(); }

  openCloud() {
    this.cancelClose("cloud");
    this.setState({ cloudOpen: true });
    void this.refreshCloudTasks();
    this.startCloudPoll();
  }

  /** 원격 목록 + 로컬 추적본을 합쳐 cloudTasks 로. 원격이 진실, 로컬은 재시작 복원분. */
  async refreshCloudTasks() {
    if (!window.schutz?.codexCloud) return;
    try {
      const r = await window.schutz.codexCloud("list", {});
      const byId = new Map<string, CloudTask>();
      for (const t of (r.local || [])) byId.set(t.id, { id: t.id, prompt: t.prompt || "", env: t.env, status: t.status || "running", createdAt: t.createdAt || 0, raw: t.raw });
      for (const t of (r.remote || [])) {  // 원격 필드는 형식이 유동적이라 방어적으로 읽는다
        const id = String(t.id || t.task_id || t.taskId || "");
        if (!id) continue;
        const prev = byId.get(id);
        const status = String(t.status || t.state || prev?.status || "running");
        byId.set(id, { id, prompt: prev?.prompt || String(t.prompt || t.title || ""), env: prev?.env ?? null, status, createdAt: prev?.createdAt || 0, raw: prev?.raw });
      }
      const tasks = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
      this.setState({ cloudTasks: tasks });
    } catch { /* 목록 실패는 조용히 — 패널은 그대로 */ }
  }

  private startCloudPoll() {
    if (this._cloudPoll) return;
    // 진행 중 태스크가 있을 때만 주기적으로 상태를 확인한다(롱폴 아님, 짧은 호출).
    this._cloudPoll = setInterval(() => {
      if (!this.state.cloudOpen) { this.stopCloudPoll(); return; }
      const running = this.state.cloudTasks.filter(t => t.status === "running");
      if (!running.length) return;
      running.slice(0, 3).forEach(t => void this.checkCloud(t.id, true));
    }, 12000);
  }
  private stopCloudPoll() { if (this._cloudPoll) { clearInterval(this._cloudPoll); this._cloudPoll = null; } }

  /** 프롬프트를 클라우드에 넘긴다. env 없으면 안내, 실패 사유는 사람 말로 토스트. */
  async dispatchCloud() {
    if (!window.schutz?.codexCloud) return;
    const root = this.state.workspace?.root;
    if (!root) { this.toast("info", t("cloud.needProject")); return; }
    const prompt = this.state.cloudPrompt.trim();
    if (!prompt) return;
    const env = this.cloudEnv().trim();
    this.setState({ cloudBusy: "dispatch" });
    try {
      const r = await window.schutz.codexCloud("dispatch", { prompt, env, cwd: root });
      if (r.ok) {
        this.setState({ cloudPrompt: "" });
        this.toast("ok", t("cloud.dispatched"));
        await this.refreshCloudTasks();
        this.startCloudPoll();
      } else {
        this.toast("error", this.cloudReasonText(r.reason) || t("cloud.failed"));
      }
    } finally {
      this.setState({ cloudBusy: "" });
    }
  }

  private cloudReasonText(reason?: string | null): string {
    if (reason === "not-installed") return t("cloud.notInstalled");
    if (reason === "auth-missing") return t("cloud.authMissing");
    if (reason === "env-not-configured") return t("cloud.envMissing");
    return "";
  }

  async checkCloud(id: string, quiet = false) {
    if (!window.schutz?.codexCloud) return;
    try {
      const r = await window.schutz.codexCloud("status", { id });
      if (r.ok && r.state) {
        this.setState(s => ({ cloudTasks: s.cloudTasks.map(t2 => t2.id === id ? { ...t2, status: r.state! } : t2) }));
      } else if (!quiet && r.reason) {
        this.toast("info", this.cloudReasonText(r.reason));
      }
    } catch { /* */ }
  }

  async applyCloud(id: string) {
    if (!window.schutz?.codexCloud || this.state.cloudBusy) return;
    const root = this.state.workspace?.root;
    if (!root) { this.toast("info", t("cloud.needProject")); return; }
    this.setState({ cloudBusy: id });
    try {
      const r = await window.schutz.codexCloud("apply", { id, cwd: root });
      if (r.ok) {
        this.setState(s => ({ cloudTasks: s.cloudTasks.map(t2 => t2.id === id ? { ...t2, status: "applied" } : t2) }));
        this.toast("ok", t("cloud.applied"));
        await this.loadGit();              // 당겨온 변경을 git 패널에 반영
        void this.reviewChanges();         // 적용된 diff 를 독립 리뷰어로 한 번 훑는다
      } else {
        this.toast("error", this.cloudReasonText(r.reason) || t("cloud.failed"));
      }
    } finally {
      this.setState({ cloudBusy: "" });
    }
  }

  async stopCloud(id: string) {
    if (!window.schutz?.codexCloud) return;
    await window.schutz.codexCloud("stop", { id });
    this.setState(s => ({ cloudTasks: s.cloudTasks.map(t2 => t2.id === id ? { ...t2, status: "stopped" } : t2) }));
  }

  async forgetCloud(id: string) {
    if (!window.schutz?.codexCloud) return;
    await window.schutz.codexCloud("forget", { id });
    this.setState(s => ({ cloudTasks: s.cloudTasks.filter(t2 => t2.id !== id) }));
  }

  /** 클라우드 위임 패널 — 환경 ID · 프롬프트 · 태스크 목록. */
  renderCloud() {
    if (!this.state.cloudOpen && !this.isClosing("cloud")) return null;
    const s = this.state;
    const close = () => { this.stopCloudPoll(); this.closeOverlay("cloud", { cloudOpen: false }); };
    const env = this.cloudEnv();
    const stateLabel: Record<string, [string, string]> = {
      running: [t("cloud.stateRunning"), "var(--warn)"], done: [t("cloud.stateDone"), "var(--ok)"],
      failed: [t("cloud.stateFailed"), "var(--err)"], applied: [t("cloud.stateApplied"), "var(--accent-hi)"],
      stopped: [t("cloud.stateStopped"), "var(--fg-dim)"],
    };
    const inputStyle: React.CSSProperties = { width: "100%", background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 8, padding: "8px 11px", color: "var(--fg)", fontSize: 12.5, fontFamily: SUIT, outline: "none" };
    const btnMini = (label: string, onClick: () => void, opts?: { busy?: boolean; danger?: boolean; accent?: boolean }) => (
      <button className="hv08" disabled={opts?.busy} onClick={onClick}
        style={{ height: 24, padding: "0 10px", fontSize: 10.5, fontFamily: SUIT, cursor: opts?.busy ? "default" : "pointer", borderRadius: 6,
          border: `1px solid ${opts?.accent ? "transparent" : "var(--w10)"}`, background: opts?.accent ? "var(--accent)" : "transparent",
          color: opts?.danger ? "var(--err)" : opts?.accent ? "var(--on-accent)" : "var(--fg-sub)", opacity: opts?.busy ? 0.6 : 1 }}>{label}</button>
    );

    const body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11.5, color: "var(--fg-sub2)", lineHeight: 1.55 }}>{t("cloud.intro")}</div>

        {/* 환경 ID */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 10.5, color: "var(--fg-dim)", letterSpacing: 0.5 }}>{t("cloud.envLabel")}</label>
          <input value={env} onChange={e => this.setCloudEnv(e.target.value)} placeholder={t("cloud.envPlaceholder")}
            spellCheck={false} style={{ ...inputStyle, fontFamily: MONO, height: 32 }} />
        </div>

        {/* 프롬프트 + 위임 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea value={s.cloudPrompt} onChange={e => this.setState({ cloudPrompt: e.target.value })}
            placeholder={t("cloud.promptPlaceholder")} rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.5 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, fontSize: 10.5, color: "var(--fg-dim2)" }}>{!env ? t("cloud.setupGuide") : ""}</div>
            <button className="hvAccent" disabled={s.cloudBusy === "dispatch" || !s.cloudPrompt.trim()} onClick={() => void this.dispatchCloud()}
              style={{ flex: "none", height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600, fontFamily: SUIT, cursor: s.cloudBusy === "dispatch" || !s.cloudPrompt.trim() ? "default" : "pointer",
                borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--on-accent)", opacity: s.cloudBusy === "dispatch" || !s.cloudPrompt.trim() ? 0.55 : 1 }}>
              {s.cloudBusy === "dispatch" ? t("cloud.dispatching") : t("cloud.delegate")}
            </button>
          </div>
        </div>

        {/* 태스크 목록 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fg-sub2)", letterSpacing: 0.5 }}>{t("cloud.tasks")}</span>
          <div style={{ flex: 1 }} />
          <button className="hv05" onClick={() => void this.refreshCloudTasks()} style={{ fontSize: 10.5, cursor: "pointer", border: "none", background: "transparent", color: "var(--fg-dim)" }}>{t("cloud.refresh")}</button>
        </div>
        <div style={{ display: "grid", gap: 7, maxHeight: "40vh", overflowY: "auto", paddingRight: 2 }}>
          {s.cloudTasks.length === 0 && <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "6px 2px" }}>{t("cloud.noTasks")}</div>}
          {s.cloudTasks.map(task => {
            const [sl, sc] = stateLabel[task.status] || [task.status, "var(--fg-dim)"];
            const busy = s.cloudBusy === task.id;
            const prUrl = (/https?:\/\/\S+/.exec(task.raw || "") || [])[0];
            return (
              <div key={task.id} className="sz-in" style={{ display: "flex", flexDirection: "column", gap: 7, padding: "9px 11px", borderRadius: 9, background: "var(--bg-card)", border: "1px solid var(--w06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ flex: "none", fontSize: 9.5, fontWeight: 600, color: sc, background: sc + "1F", borderRadius: 4, padding: "1px 7px" }}>{sl}</span>
                  <span style={{ fontSize: 12, color: "var(--fg)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SUIT }}>{task.prompt || task.id}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--fg-dim2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.id}</span>
                  <div style={{ flex: 1 }} />
                  {prUrl && btnMini(t("cloud.openPr"), () => void window.schutz?.openExternal(prUrl))}
                  {task.status === "running" && btnMini(t("cloud.check"), () => void this.checkCloud(task.id))}
                  {(task.status === "done" || task.status === "running") && btnMini(busy ? t("cloud.applying") : t("cloud.apply"), () => void this.applyCloud(task.id), { busy, accent: true })}
                  {task.status === "running" && btnMini(t("cloud.stop"), () => void this.stopCloud(task.id), { danger: true })}
                  {task.status !== "running" && btnMini(t("cloud.forget"), () => void this.forgetCloud(task.id))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
    return this.modalShell("cloud", t("cloud.title"), close, body, 640);
  }

  /** 카탈로그에서 직접 받는다. 받자마자 켜 준다 — 여기서 "설치" 는 곧 "쓰겠다" 다. */
  private async installPlugin(name: string) {
    if (!window.schutz?.pluginInstall || this.state.pluginBusy) return;
    this.setState({ pluginBusy: name });
    try {
      const r = await window.schutz.pluginInstall(name);
      if (!r.ok) { this.toast("error", r.error || t("plug.installFail")); return; }
      await window.schutz.pluginSetEnabled?.(name, true);
      await this.refreshPlugins();
      await this.refreshSkills();
      this.toast("ok", t("plug.installed", { name }));
    } catch (e) { this.toast("error", e instanceof Error ? e.message : String(e)); }
    finally { this.setState({ pluginBusy: "" }); }
  }

  /** 켜면 그 플러그인의 스킬이 곧바로 모델 목록에 들어온다. */
  private async togglePlugin(name: string, on: boolean) {
    if (!window.schutz?.pluginSetEnabled) return;
    this.setState({ pluginBusy: name });
    try {
      const r = await window.schutz.pluginSetEnabled(name, on);
      if (!r.ok) { this.toast("error", r.error || ""); return; }
      await this.refreshPlugins();
      await this.refreshSkills();          // 스킬 목록이 바로 바뀐다
      this.toast("ok", t(on ? "plug.enabled" : "plug.disabled", { name }));
    } catch (e) { this.toast("error", e instanceof Error ? e.message : String(e)); }
    finally { this.setState({ pluginBusy: "" }); }
  }

  /** 커넥터 목록 — 검색·분류·카드. 설치돼 있는 것만 켤 수 있다. */
  renderPlugins() {
    if (!this.state.pluginOpen && !this.isClosing("plugins")) return null;
    const s = this.state;
    const close = () => this.closeOverlay("plugins", { pluginOpen: false });
    const q = s.pluginQuery.trim().toLowerCase();
    const cats = [...new Set(s.plugins.map(p => p.category).filter((c): c is string => !!c))].sort();
    const list = s.plugins
      .filter(p => !s.pluginCat || p.category === s.pluginCat)
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.displayName || "").toLowerCase().includes(q)
        || (p.description || "").toLowerCase().includes(q) || (p.author || "").toLowerCase().includes(q))
      // 설치된 것 먼저 — 지금 쓸 수 있는 게 위로 온다
      .sort((a, b) => (Number(b.installed) - Number(a.installed)) || a.name.localeCompare(b.name));
    const shown = list.slice(0, 80);
    const chip = (label: string, on: boolean, onClick: () => void) => (
      <button key={label} className="hv08" onClick={onClick}
        style={{ padding: "3px 10px", fontSize: 10.5, fontFamily: SUIT, cursor: "pointer", borderRadius: 12,
          border: `1px solid ${on ? "transparent" : "var(--w10)"}`, background: on ? "var(--accent)" : "transparent",
          color: on ? "var(--on-accent)" : "var(--fg-sub2)", whiteSpace: "nowrap" }}>{label}</button>
    );
    const badge = (text: string) => (
      <span style={{ fontSize: 9.5, color: "var(--fg-dim)", border: "1px solid var(--w10)", borderRadius: 4, padding: "0 5px", lineHeight: "14px" }}>{text}</span>
    );
    // 로고 — 저장소 소유자의 GitHub 아바타. 카탈로그에 아이콘 필드가 없어서 이렇게 얻는다.
    // 못 얻거나 못 불러오면 이름에서 뽑은 모노그램 타일이 그대로 드러난다(아래에 깔아 둔다).
    const logo = (p: PluginInfo) => {
      const label = p.displayName || p.name;
      let h = 0;
      for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
      return (
        <div style={{ flex: "none", position: "relative", width: 30, height: 30, borderRadius: 7, overflow: "hidden",
          background: `hsl(${h} 32% 46% / 0.22)`, border: "1px solid var(--w06)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: `hsl(${h} 38% 62%)`, fontFamily: SUIT }}>
            {label.replace(/[^A-Za-z0-9가-힣]/g, "").charAt(0).toUpperCase() || "?"}
          </span>
          {p.iconUrl && (
            <img src={p.iconUrl} alt="" loading="lazy"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
      );
    };

    const body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11.5, color: "var(--fg-sub2)", lineHeight: 1.5 }}>{t("plug.intro")}</div>
        <input value={s.pluginQuery} onChange={e => this.setState({ pluginQuery: e.target.value })}
          placeholder={t("plug.searchPlaceholder")}
          style={{ width: "100%", height: 32, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 8,
            padding: "0 11px", color: "var(--fg)", fontSize: 12.5, fontFamily: SUIT, outline: "none" }} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {chip(t("plug.catAll"), !s.pluginCat, () => this.setState({ pluginCat: "" }))}
          {cats.map(c => chip(c, s.pluginCat === c, () => this.setState({ pluginCat: s.pluginCat === c ? "" : c })))}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--fg-dim)" }}>
          {t("plug.count", { shown: shown.length, total: list.length, installed: s.plugins.filter(p => p.installed).length })}
        </div>
        <div style={{ display: "grid", gap: 7, maxHeight: "46vh", overflowY: "auto", paddingRight: 2 }}>
          {shown.map(p => (
            <div key={p.marketplace + "/" + p.name} className="sz-in" style={{ display: "flex", alignItems: "flex-start", gap: 10,
              padding: "9px 11px", borderRadius: 9, background: "var(--bg-card)", border: "1px solid var(--w06)" }}>
              {logo(p)}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{p.displayName || p.name}</span>
                  {p.author && <span style={{ fontSize: 10.5, color: "var(--fg-dim)" }}>{p.author}</span>}
                  {p.category && badge(p.category)}
                  {p.installed && p.skills > 0 && badge(t("plug.nSkills", { n: p.skills }))}
                  {p.installed && p.commands > 0 && badge(t("plug.nCommands", { n: p.commands }))}
                  {p.installed && (p.agents ?? 0) > 0 && badge(t("plug.nAgents", { n: p.agents }))}
                  {p.installed && p.mcp && badge("MCP")}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 3, lineHeight: 1.5,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</div>
              </div>
              <div style={{ flex: "none" }}>
                {p.installed ? (
                  <button className="hv08" disabled={s.pluginBusy === p.name} onClick={() => void this.togglePlugin(p.name, !p.enabled)}
                    style={{ padding: "4px 12px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 7,
                      border: `1px solid ${p.enabled ? "transparent" : "var(--w10)"}`,
                      background: p.enabled ? "var(--accent)" : "transparent",
                      color: p.enabled ? "var(--on-accent)" : "var(--accent-hi)" }}>
                    {s.pluginBusy === p.name ? "…" : t(p.enabled ? "plug.on" : "plug.off")}
                  </button>
                ) : p.canInstall ? (
                  <button className="hv08" disabled={!!s.pluginBusy} onClick={() => void this.installPlugin(p.name)}
                    style={{ padding: "4px 12px", fontSize: 11, fontFamily: SUIT, cursor: s.pluginBusy ? "default" : "pointer",
                      borderRadius: 7, border: "none", background: "var(--accent)", color: "var(--on-accent)", opacity: s.pluginBusy ? 0.6 : 1 }}>
                    {s.pluginBusy === p.name ? t("plug.installing") : t("plug.install")}
                  </button>
                ) : (
                  // 받을 곳이 적혀 있지 않은 것(마켓플레이스 저장소 안에 있는 것)은 그대로 알린다.
                  <span style={{ fontSize: 10.5, color: "var(--fg-dim)", whiteSpace: "nowrap" }}>{t("plug.notFetched")}</span>
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "8px 2px" }}>{t("plug.none")}</div>}
        </div>
      </div>
    );
    return this.modalShell("plugins", t("plug.title"), close, body, 720);
  }

  // ── 엔진 뷰 (Stage 3) ───────────────────────────────────────────────────────
  // 에이전트가 엔진을 조종하는 동안 사람은 결과를 눈으로 봐야 한다. 3D 뷰포트는 스크린샷,
  // 구조는 트리, 확인은 재생/정지 — 전용 모달 하나로 묶는다. 세 번째 uiMode 를 만들지 않고
  // 기존 modalShell 을 재사용한다(모드 전환 배관·양 모드 CSS 비용이 얻는 것보다 크다).

  /** 지금 도구가 올라와 있는(= 실제로 쓸 수 있는) 첫 엔진 어댑터. 없으면 null. */
  private activeEngine(): engines.EngineAdapter | null {
    const running = new Set(mcp.getMcpTools().map(t => t.server));
    return engines.ADAPTERS.find(a => running.has(a.serverName)) ?? null;
  }

  openEngine() {
    this.cancelClose("engine");
    this.setState({ engineOpen: true, engineViewErr: "" });
    void this.refreshEngineStatus();
    const a = this.activeEngine();
    if (a) { void this.engineShotRefresh(a); void this.engineTreeRefresh(a); }
  }

  /** 뷰포트 스냅샷 — 이미지 content 를 보존해야 하므로 callToolRaw 를 쓴다. */
  private async engineShotRefresh(a: engines.EngineAdapter) {
    if (!a.screenshotTool) return;
    this.setState({ engineViewBusy: "shot", engineViewErr: "" });
    try {
      const r = await mcp.callToolRaw(a.serverName, a.screenshotTool, {});
      if (!r.ok) { this.setState({ engineViewErr: r.error || "" }); return; }
      const img = r.content.find((c: any) => c?.type === "image" && c?.data);
      if (img) this.setState({ engineShot: `data:${img.mimeType || "image/png"};base64,${img.data}` });
      else {
        // 이미지가 없으면 텍스트라도 이유를 보여준다(대개 "Studio 에 닿지 않음").
        const txt = r.content.map((c: any) => (c?.type === "text" ? c.text : "")).join("\n").trim();
        this.setState({ engineShot: null, engineViewErr: txt.slice(0, 300) });
      }
    } catch (e) { this.setState({ engineViewErr: e instanceof Error ? e.message : String(e) }); }
    finally { this.setState({ engineViewBusy: "" }); }
  }

  /** 씬/DataModel 트리 — 텍스트 그대로 보여준다(모델이 읽는 것과 같은 내용). */
  private async engineTreeRefresh(a: engines.EngineAdapter) {
    if (!a.browseTool) return;
    this.setState({ engineViewBusy: "tree", engineViewErr: "" });
    try {
      const out = await mcp.callTool(a.serverName, a.browseTool, {});
      this.setState({ engineTree: out.slice(0, 20000) });
    } catch (e) { this.setState({ engineViewErr: e instanceof Error ? e.message : String(e) }); }
    finally { this.setState({ engineViewBusy: "" }); }
  }

  /** 재생·정지·저장 — 사용자가 직접 누른 것이라 승인 게이트를 태우지 않는다(게이트는
   *  에이전트가 스스로 부를 때를 위한 것이다). 대신 재생 상태는 에이전트 가드와 공유한다. */
  private async engineAction(a: engines.EngineAdapter, tool: string, key: string) {
    this.setState({ engineViewBusy: key, engineViewErr: "" });
    try {
      const out = await mcp.callTool(a.serverName, tool, {});
      if (tool === a.playTool) this._enginePlaying.set(a.serverName, true);
      else if (tool === a.stopTool) this._enginePlaying.set(a.serverName, false);
      if (/⚠️|error|실패/i.test(out)) this.setState({ engineViewErr: out.slice(0, 300) });
      // 재생/정지 뒤엔 화면이 달라졌을 테니 뷰포트를 다시 찍는다.
      if (tool === a.playTool || tool === a.stopTool) { this.setState({ engineViewBusy: "" }); await this.engineShotRefresh(a); return; }
    } catch (e) { this.setState({ engineViewErr: e instanceof Error ? e.message : String(e) }); }
    finally { this.setState({ engineViewBusy: "" }); }
  }

  /** 엔진 뷰 — 상태 · 뷰포트 · 트리 · 재생/정지/저장 */
  renderEngine() {
    if (!this.state.engineOpen && !this.isClosing("engine")) return null;
    const s = this.state;
    const a = this.activeEngine();
    const close = () => this.closeOverlay("engine", { engineOpen: false });
    const est = a ? s.engineStatus[a.serverName] : undefined;
    const busy = (k: string) => s.engineViewBusy === k;
    const btn = (label: string, on: boolean, onClick: () => void, disabled?: boolean): React.ReactNode => (
      <button className="hv08" disabled={disabled} onClick={onClick}
        style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: SUIT, cursor: disabled ? "default" : "pointer",
          borderRadius: 7, border: `1px solid ${on ? "transparent" : "var(--w10)"}`,
          background: on ? "var(--accent)" : "transparent", color: on ? "var(--on-accent)" : "var(--fg-sub)", opacity: disabled ? 0.55 : 1 }}>
        {label}
      </button>
    );

    const body = !a ? (
      <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
        <div style={{ fontSize: 12.5, color: "var(--fg-sub2)", lineHeight: 1.6 }}>{t("eng.viewNone")}</div>
        <button className="hvAccent" onClick={() => { close(); this.openMcp(); }}
          style={{ height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--on-accent)" }}>{t("eng.viewConnect")}</button>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 상태 + 조작 */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, flex: "none",
            background: est?.reachable ? "var(--ok)" : "#C9A227" }} />
          <span style={{ fontSize: 12, color: "var(--fg-sub)" }}>
            {est ? (est.reachable ? t("eng.reachable") : t("eng.unreachable")) : t("eng.checking")}
          </span>
          <div style={{ flex: 1 }} />
          {a.playTool && btn(t("eng.play"), false, () => void this.engineAction(a, a.playTool!, "play"), !!s.engineViewBusy)}
          {a.stopTool && btn(t("eng.stop"), false, () => void this.engineAction(a, a.stopTool!, "stop"), !!s.engineViewBusy)}
          {a.saveTool && btn(t("eng.save"), true, () => void this.engineAction(a, a.saveTool!, "save"), !!s.engineViewBusy)}
        </div>

        {s.engineViewErr && (
          <div style={{ fontSize: 11, color: "var(--err)", whiteSpace: "pre-wrap", maxHeight: 72, overflow: "auto",
            background: "var(--bg-card)", border: "1px solid var(--w06)", borderRadius: 8, padding: "7px 10px" }}>{s.engineViewErr}</div>
        )}

        {/* 뷰포트 — 3D 화면만 찍힌다(엔진 UI 는 안 나온다) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={sectHdr}>{t("eng.viewport")}</span><div style={{ flex: 1 }} />
            {btn(busy("shot") ? "…" : t("common.refresh"), false, () => void this.engineShotRefresh(a), !!s.engineViewBusy)}
          </div>
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--w06)", background: "var(--bg-root)",
            minHeight: 190, display: "grid", placeItems: "center" }}>
            {s.engineShot
              ? <img src={s.engineShot} alt={t("eng.viewport")} style={{ display: "block", width: "100%", height: "auto" }} />
              : <span style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: 24 }}>{t("eng.viewportEmpty")}</span>}
          </div>
        </div>

        {/* 트리 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={sectHdr}>{t("eng.tree")}</span><div style={{ flex: 1 }} />
            {btn(busy("tree") ? "…" : t("common.refresh"), false, () => void this.engineTreeRefresh(a), !!s.engineViewBusy)}
          </div>
          <pre style={{ margin: 0, maxHeight: 230, overflow: "auto", background: "var(--bg-root)",
            border: "1px solid var(--w06)", borderRadius: 10, padding: "10px 12px",
            fontSize: 11, fontFamily: MONO, color: "var(--fg-sub)", whiteSpace: "pre-wrap" }}>
            {s.engineTree || t("eng.treeEmpty")}
          </pre>
        </div>
      </div>
    );
    return this.modalShell("engine", a ? a.label : t("eng.viewTitle"), close, body, 720);
  }

  /** 게임 엔진 원클릭 연결 — 발견된 MCP 설정을 그대로 등록·시작한다(mcpImport 와 같은 경로).
   *  연결 뒤 Studio 도달성까지 한 번 확인해 준다. */
  engineConnect(d: { name: string; command: string; args: string[]; env: Record<string, string> }) {
    void this.mcpAct(d.name, async () => {
      const r = await mcp.addServer(d.name, { command: d.command, args: d.args, env: d.env });
      if (!r.ok) { this.toast("error", t("sc5.mcpAddFail", { error: r.error || "" })); return; }
      const s = await mcp.startServer(d.name);
      this.toast(s.ok ? "ok" : "error", s.ok ? t("sc5.mcpImportedStarted", { name: d.name }) : t("sc5.mcpAddedStartFail", { name: d.name }));
      if (s.ok) await this.refreshEngineStatus();
    });
  }
  private async mcpAct(name: string, fn: () => Promise<any>) {
    this.setState({ mcpBusy: name });
    try { await fn(); } finally { this.setState({ mcpBusy: "" }); await this.refreshMcp(); }
  }
  mcpStartServer(name: string) { void this.mcpAct(name, async () => { const r = await mcp.startServer(name); if (!r.ok) this.toast("error", t("sc5.mcpStartFail", { name, reason: r.reason || "" })); else this.toast("ok", t("sc5.mcpStarted", { name })); }); }
  mcpStopServer(name: string) { void this.mcpAct(name, () => mcp.stopServer(name)); }
  /** 서버를 목록에서 뺀다. 번들(.mcpb)로 깔린 것이면 풀어 둔 파일까지 지운다 —
   *  설정만 지우면 userData 에 서버 코드가 영영 남아, 설치·제거를 반복할수록 쌓인다. */
  mcpRemoveServer(name: string) {
    void this.mcpAct(name, async () => {
      await mcp.removeServer(name);
      if (!window.schutz) return;
      try {
        const bundles = await window.schutz.mcpbList();
        if (bundles.includes(name)) await window.schutz.mcpbRemove(name);
      } catch { /* 파일 정리 실패가 제거 자체를 막으면 안 된다 */ }
    });
  }
  mcpImport(d: { name: string; command: string; args: string[]; env: Record<string, string>; url?: string | null }) {
    void this.mcpAct(d.name, async () => {
      // 원격 커넥터(url)는 실행 파일이 아니라 주소로 등록한다.
      const r = await mcp.addServer(d.name, d.url ? { url: d.url } : { command: d.command, args: d.args, env: d.env });
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

        {/* 게임 엔진 — 엔진 어댑터가 있는 서버(연결됐거나 발견된 것)만. 없으면 섹션 자체를 숨긴다. */}
        {(() => {
          const rows = engines.ADAPTERS
            .map(a => ({ a, sv: s.mcpServers.find(x => x.name === a.serverName), disc: s.mcpDiscovered.find(d => d.name === a.serverName), est: s.engineStatus[a.serverName] }))
            .filter(r => r.sv || r.disc);
          if (!rows.length) return null;
          return (
            <div>
              <div style={sectHdr}>{t("eng.section")}</div>
              {rows.map(({ a, sv, disc, est }) => {
                const running = !!sv?.running;
                const reachable = running && !!est?.reachable;
                const dot = reachable ? "var(--ok)" : running ? "#C9A227" : "var(--fg-dim3)";
                const statusText = !sv ? t("eng.notConnected")
                  : !running ? t("eng.stopped")
                  : est ? (est.reachable ? t("eng.reachable") : t("eng.unreachable"))
                  : t("eng.checking");
                return (
                  <div key={a.id} className="sz-in" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 9, background: "var(--bg-card)", border: "1px solid var(--w06)", marginTop: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: dot, flex: "none", boxShadow: reachable ? "0 0 6px color-mix(in srgb, var(--ok) 60%, transparent)" : "none" }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)" }}>{a.label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusText}{running && est?.detail && !/^[[{]/.test(est.detail) ? " · " + est.detail : ""}</div>
                    </div>
                    {sv?.running && <span style={{ flex: "none", fontSize: 10, color: "var(--accent-hi)" }}>{t("mcpui.toolCount", { n: sv.tools })}</span>}
                    {!sv && disc && (
                      <button className="hv08" disabled={busy(a.serverName)} onClick={() => this.engineConnect(disc)} style={{ flex: "none", padding: "4px 14px", fontSize: 11.5, fontWeight: 600, fontFamily: SUIT, cursor: "pointer", borderRadius: 7, border: "none", background: "var(--accent)", color: "var(--on-accent)" }}>{busy(a.serverName) ? "…" : t("eng.connect")}</button>
                    )}
                    {sv && !sv.running && (
                      <button className="hv08" disabled={busy(a.serverName)} onClick={() => this.mcpStartServer(a.serverName)} style={{ flex: "none", padding: "4px 12px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--accent-hi)" }}>{busy(a.serverName) ? "…" : t("eng.reconnect")}</button>
                    )}
                    {sv?.running && (
                      <button className="hv08" disabled={busy(a.serverName)} onClick={() => void this.refreshEngineStatus()} style={{ flex: "none", padding: "4px 10px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: "var(--fg-sub)" }}>{t("eng.checkStatus")}</button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

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
              {/* 도구 개수만 보여 주던 자리. 리소스·프롬프트를 내주는 서버는 여기서
                  "0개" 로 보였다 — 붙었는데 아무것도 없는 것처럼. 협상된 개정판도 같이 적어
                  무엇에 붙었는지 말할 수 있게 한다. */}
              {sv.running && (
                <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                  <span style={{ fontSize: 10, color: "var(--accent-hi)" }}>
                    {t("mcpui.offers", { t: sv.tools, r: sv.resources ?? 0, p: sv.prompts ?? 0 })}
                  </span>
                  {sv.protocolVersion && (
                    <span title={sv.serverName || undefined} style={{ fontSize: 9, fontFamily: MONO, color: "var(--fg-dim2)" }}>{sv.protocolVersion}</span>
                  )}
                </span>
              )}
              <button className="hv08" disabled={busy(sv.name)} onClick={() => sv.running ? this.mcpStopServer(sv.name) : this.mcpStartServer(sv.name)}
                style={{ flex: "none", padding: "3px 11px", fontSize: 11, fontFamily: SUIT, cursor: "pointer", borderRadius: 6, border: "1px solid var(--w10)", background: "transparent", color: sv.running ? "var(--err)" : "var(--accent-hi)" }}>{busy(sv.name) ? "…" : sv.running ? t("mcpui.stop") : t("mcpui.start")}</button>
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

        {/* 번들 설치 — 끌어다 놓기만으로는 있는 줄 모르니 버튼도 둔다 */}
        <div>
          <div style={sectHdr}>{t("mcpb.section")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 6 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--fg-sub2)", lineHeight: 1.5 }}>{t("mcpb.sectionHint")}</div>
            <button className="hv05" onClick={() => void this.pickBundle()}
              style={{ flex: "none", height: 28, padding: "0 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w12)" }}>
              {t("mcpb.pick")}
            </button>
          </div>
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
        <div {...this.dialogProps(d.displayName || d.name, "extDetail")} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: "92%", height: "84%", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)", fontFamily: SUIT, overflow: "hidden" }}>
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
        <div {...this.dialogProps(p.title, "extPanel")} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()}
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
        <div {...this.dialogProps(t("sc1.cmd_goto_ws_symbol"), "sym")} className={out ? "sz-drop-out" : "sz-drop"} onClick={e => e.stopPropagation()}
          style={{ width: 620, maxWidth: "90%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input data-szfocus value={s.symQuery}
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
        style={{ position: "fixed", inset: 0, zIndex: overlayZ("settings"), background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div {...this.dialogProps(t("settings.title"), "settings")} className={out ? "sz-pop-out" : "sz-pop"} onClick={e => e.stopPropagation()}
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
              {s.oauthMsg && <div style={{ fontSize: 10.5, color: "var(--err)" }}>⚠️ {s.oauthMsg}</div>}
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
              <div key={d.id} style={{ fontSize: 10.5, color: s.testMsg[d.id].startsWith("✓") ? "var(--ok)" : s.testMsg[d.id].startsWith("⚠") ? "var(--err)" : "var(--fg-sub2)" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.codeFont")}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(CODE_FONTS).map(([k, f]) => (
                  <button key={k} onClick={() => this.applyEditorPref({ codeFont: k })} style={{ ...segBtn(ed.codeFont === k), fontFamily: f.stack }}>{f.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.uiFont")}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(UI_FONTS).map(([k, f]) => (
                  <button key={k} onClick={() => this.applyEditorPref({ uiFont: k })} style={{ ...segBtn(ed.uiFont === k), fontFamily: f.stack }}>{f.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.codeSize")}</span>
              <input type="range" min={11} max={16} step={1} value={ed.fontSize}
                onChange={e => this.applyEditorPref({ fontSize: +e.target.value })}
                style={{ flex: 1, accentColor: "var(--accent)", background: "transparent" }} />
              <span style={{ flex: "none", width: 34, textAlign: "right", fontSize: 11.5, fontFamily: MONO, color: "var(--fg-sub2)" }}>{ed.fontSize}px</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.keymap")}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.autoSave")}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([["off", t("settings.autoSaveOff")], ["afterDelay", t("settings.autoSaveDelay")], ["onFocusChange", t("settings.autoSaveFocus")]] as [EditorPrefs["autoSave"], string][]).map(([v, label]) => (
                  <button key={v} onClick={() => this.applyEditorPref({ autoSave: v })} style={segBtn(ed.autoSave === v)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.tabSize")}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[2, 4, 8].map(n => (<button key={n} onClick={() => this.applyEditorPref({ tabSize: n })} style={segBtn(ed.tabSize === n)}>{n}</button>))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{t("settings.cursor")}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([["line", t("settings.cursorLine")], ["block", t("settings.cursorBlock")], ["underline", t("settings.cursorUnderline")]] as [EditorPrefs["cursorStyle"], string][]).map(([v, label]) => (
                  <button key={v} onClick={() => this.applyEditorPref({ cursorStyle: v })} style={segBtn(ed.cursorStyle === v)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", lineHeight: 1.6 }}>{t("settings.editorNote")}</div>
          </div>

          {/* ── 실행 명령 ── 기본표는 gcc·python 같은 가장 흔한 이름을 쓴다. clang 을 쓰거나
                python3 여야 하는 환경에서 기능을 통째로 못 쓰게 되는 대신 여기서 갈아끼운다. */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fg-sub)", marginBottom: 4 }}>{t("runfile.settingsTitle")}</div>
            <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", lineHeight: 1.6, marginBottom: 8 }}>{t("runfile.settingsNote")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 190, overflowY: "auto" }}>
              {RUN_LANGS.map(l => (
                <div key={l.ext[0]} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ flex: "none", minWidth: 62, whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-sub)" }}>{l.label}</span>
                  <input spellCheck={false} defaultValue={getRunOverrides()[l.ext[0]] ?? ""} placeholder={l.template}
                    onBlur={e => { setRunOverride(l.ext[0], e.target.value); this.forceUpdate(); }}
                    style={{ flex: 1, minWidth: 0, height: 26, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 6, padding: "0 9px", color: "var(--fg)", fontFamily: MONO, fontSize: 11, outline: "none" }} />
                </div>
              ))}
            </div>
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
          {/* 커밋 전 자동 리뷰 — 자율성 정책과 독립. 기본 off, 켤 때만 커밋을 가로챈다. */}
          <div style={{ height: 1, background: "var(--w06)", margin: "12px 0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--fg-code)" }}>{t("review.onCommit")}</div>
              <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", lineHeight: 1.5, marginTop: 2 }}>{t("review.onCommitHint")}</div>
            </div>
            <button onClick={() => this.applyAutonomy({ reviewOnCommit: !au.reviewOnCommit })}
              style={{ flex: "none", width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none", background: au.reviewOnCommit ? "var(--accent)" : "var(--w12)", position: "relative", transition: "background var(--dur) var(--ease)" }}>
              <span style={{ position: "absolute", top: 2.5, left: au.reviewOnCommit ? 18.5 : 2.5, width: 15, height: 15, borderRadius: "50%", background: au.reviewOnCommit ? "var(--on-accent)" : "var(--fg-sub2)", transition: "left var(--dur) var(--ease)" }} />
            </button>
          </div>
          {/* 프로젝트 지침 주입 — 저장소 파일이 모델 지시가 되는 일이라 기본 off. */}
          <div style={{ height: 1, background: "var(--w06)", margin: "12px 0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--fg-code)" }}>{t("instr.title")}</div>
              <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", lineHeight: 1.5, marginTop: 2 }}>{t("instr.hint")}</div>
            </div>
            <button onClick={() => this.applyAutonomy({ projectInstructions: !au.projectInstructions })}
              style={{ flex: "none", width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none", background: au.projectInstructions ? "var(--accent)" : "var(--w12)", position: "relative", transition: "background var(--dur) var(--ease)" }}>
              <span style={{ position: "absolute", top: 2.5, left: au.projectInstructions ? 18.5 : 2.5, width: 15, height: 15, borderRadius: "50%", background: au.projectInstructions ? "var(--on-accent)" : "var(--fg-sub2)", transition: "left var(--dur) var(--ease)" }} />
            </button>
          </div>
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
