import React from "react";
import {
  AGDEF, MENUS, TM, TY, MD,
  freshDocs, hunkDefs,
  DocLine, AgentState, PlanItem, ToolItem, ReviewFile, ChatMsg,
} from "./ide/data";
import {
  GitBranchIcon, SearchIcon,
  FolderIcon, FlowIcon, TermIcon, GearIcon, TermStatusIcon,
} from "./icons";
import {
  SCHUTZ_SYSTEM_PROMPT, MANAGER_SYSTEM_EXTRA,
  WORKSPACE_TOOLS, DELEGATE_TOOL,
} from "./ai/claude";
import { PROVIDERS_MAP, testProvider, getManagerId } from "./ai/registry";
import { Message, ToolCall, NeutralMsg, AgentProvider, getStoredKey, setStoredKey, getOAuth, setOAuth, getModelOverride, setModelOverride } from "./ai/provider";
import { MonacoPane, paneRegistry } from "./editor/MonacoPane";
import { applyTheme, getThemeId } from "./theme";

/** 에이전트가 제안한 실파일 편집 (수락 전까지 디스크 미반영) */
interface Proposal {
  id: string;
  rel: string;
  find: string;
  replace: string;
  rationale: string;
  agent: string;
  status: "pending" | "accepted" | "rejected" | "failed";
  error?: string;
}

const MONO = "'IBM Plex Mono',monospace";
const SUIT = "'SUIT Variable',sans-serif";

interface S {
  statusKey: "idle" | "thinking" | "tool" | "review" | "stopped";
  running: boolean;
  messages: ChatMsg[];
  input: string;
  plan: PlanItem[];
  tools: ToolItem[];
  files: ReviewFile[];
  docs: Record<string, DocLine[]>;
  chips: Record<string, { text: string; op: number }>;
  panes: string[];
  leftTab: "flow" | "tree";
  expanded: string | null;
  openMenu: string | null;
  projOpen: boolean;
  agentsOpen: boolean;
  reviewOpen: boolean;
  termOpen: boolean;
  termTab: string;
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

/** 슬래시 명령 레지스트리 — origin별로 실행 경로가 다르다 */
interface SlashCmd { cmd: string; origin: "schutz" | "claude" | "codex"; desc: string }
const SLASH_COMMANDS: SlashCmd[] = [
  { cmd: "/help", origin: "schutz", desc: "명령 목록" },
  { cmd: "/model", origin: "schutz", desc: "모델 확인 · 변경 (/model <에이전트> <모델>)" },
  { cmd: "/usage", origin: "schutz", desc: "세션 토큰 · 비용" },
  { cmd: "/agents", origin: "schutz", desc: "에이전트 연결 상태" },
  { cmd: "/clear", origin: "schutz", desc: "대화 초기화" },
  { cmd: "/init", origin: "claude", desc: "프로젝트 분석 후 CLAUDE.md 생성" },
  { cmd: "/review", origin: "claude", desc: "변경사항 코드 리뷰" },
  { cmd: "/security-review", origin: "claude", desc: "보안 관점 리뷰" },
  { cmd: "/compact", origin: "claude", desc: "세션 컨텍스트 압축 (이어가기 세션)" },
  { cmd: "/init", origin: "codex", desc: "프로젝트 분석 후 AGENTS.md 생성" },
  { cmd: "/review", origin: "codex", desc: "변경사항 리뷰" },
];
const ORIGIN_LABEL: Record<string, string> = { schutz: "Schutz", claude: "Claude Code", codex: "Codex" };
const ORIGIN_COLOR: Record<string, string> = { schutz: "var(--accent)", claude: "#C4A882", codex: "#8FA8C0" };

const TYPING_SPEED = 1;
const SHOW_REASONS = true;
const AUTOPLAY = true;

export class App extends React.Component<{}, S> {
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _uid = 0;
  private _paneRefs: Record<string, HTMLDivElement | null> = {};
  private _chat: HTMLDivElement | null = null;
  private _chatSig = "";
  /** 에이전트 id → 프로바이더 (Claude/GPT/Grok/GLM) */
  private providers: Record<string, AgentProvider> = PROVIDERS_MAP;
  private history: Message[] = [];
  /** 에이전트별 진행 중 턴 취소 컨트롤러 */
  private abortCtls = new Map<string, AbortController>();
  /** 파일 락: rel → 잡고 있는 에이전트 id */
  private fileLocks = new Map<string, string>();

  state: S = {
    statusKey: "idle", running: false, messages: [], input: "",
    plan: [], tools: [], files: [], docs: freshDocs(), chips: {},
    panes: [TM], leftTab: "flow", expanded: null,
    openMenu: null, projOpen: false,
    agentsOpen: true, reviewOpen: true,
    termOpen: false, termTab: "term",
    agents: this.freshAgents(),
    workspace: null, paneDirty: {},
    proposals: [], paneVer: {},
    termReal: "", termInput: "", settingsOpen: false, testMsg: {},
    layout: (() => {
      const m = /[?&]layout=(\d)/.exec(window.location.search);
      const v = m ? parseInt(m[1], 10) : 4;
      return v === 1 || v === 2 ? v : 4;
    })(),
    cliAgents: {}, cliBusy: false, cliModel: "",
    oauthPasteFor: null, oauthPasteVal: "", oauthWait: false, oauthMsg: "", oauthTick: 0,
    slashSel: 0,
    quickOpen: false, quickQuery: "", quickSel: 0,
    collapsed: {}, statusInfo: null, ctxMenu: null,
  };

  // ── 파일 작업 (트리 우클릭·메뉴) ──
  async saveAll() {
    for (const p of paneRegistry.panes.values()) await p.save();
  }

  async newFileAt(dirRel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const name = window.prompt("새 파일 이름", "untitled.md");
    if (!name) return;
    const rel = dirRel ? dirRel + "/" + name : name;
    try {
      await window.schutz.writeFile(ws.root, rel, "");
      await this.refreshWorkspace();
      this.openFile(rel);
    } catch (e) { window.alert("생성 실패: " + (e instanceof Error ? e.message : String(e))); }
  }

  async renameAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const parts = rel.split("/");
    const base = parts.pop()!;
    const nn = window.prompt("새 이름", base);
    if (!nn || nn === base) return;
    const relTo = [...parts, nn].join("/");
    try {
      await window.schutz.renameEntry(ws.root, rel, relTo);
      await this.refreshWorkspace();
      this.setState(s => ({
        panes: s.panes.map(p => p === rel ? relTo : p.startsWith(rel + "/") ? relTo + p.slice(rel.length) : p),
      }));
    } catch (e) { window.alert("이름 변경 실패: " + (e instanceof Error ? e.message : String(e))); }
  }

  async deleteAt(rel: string) {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    if (!window.confirm(`'${rel}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await window.schutz.deleteEntry(ws.root, rel);
      await this.refreshWorkspace();
      this.setState(s => ({
        panes: s.panes.filter(p => p !== rel && !p.startsWith(rel + "/")),
      }));
    } catch (e) { window.alert("삭제 실패: " + (e instanceof Error ? e.message : String(e))); }
  }

  /** 편집 메뉴 → 포커스된 Monaco 액션 */
  editorAction(kind: string) {
    const ed = paneRegistry.focused?.editor;
    if (!ed) return;
    ed.focus();
    if (kind === "undo") ed.trigger("menu", "undo", null);
    else if (kind === "redo") ed.trigger("menu", "redo", null);
    else if (kind === "cut") ed.trigger("menu", "editor.action.clipboardCutAction", null);
    else if (kind === "copy") ed.trigger("menu", "editor.action.clipboardCopyAction", null);
    else if (kind === "find") ed.trigger("menu", "actions.find", null);
    else if (kind === "paste") {
      void navigator.clipboard.readText().then(text => {
        const sel = ed.getSelection();
        if (sel && text) ed.executeEdits("paste", [{ range: sel, text, forceMoveMarkers: true }]);
      }).catch(() => { /* 클립보드 권한 없음 */ });
    }
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
      this.setState({
        workspace: tree, leftTab: "tree", panes: [],
        docs: freshDocs(), files: [], plan: [], tools: [], chips: {},
        expanded: null, paneDirty: {}, statusKey: "idle", running: false,
        agents: this.freshAgents(), proposals: [], paneVer: {}, collapsed: {},
      });
    } catch (e) {
      this.setState(s => ({
        messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", text: "폴더를 열 수 없습니다: " + (e instanceof Error ? e.message : String(e)) }],
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

  /** 현재 입력 기준 팔레트 후보 (사용 가능 origin만) */
  slashList(): SlashCmd[] {
    const v = this.state.input;
    if (!v.startsWith("/") || v.includes(" ")) return [];
    return SLASH_COMMANDS.filter(c => {
      if (!c.cmd.startsWith(v)) return false;
      if (c.origin === "claude") return !!this.state.cliAgents.claude?.ok;
      if (c.origin === "codex") return !!this.state.cliAgents.codex?.ok;
      return true;
    });
  }

  private _oauthOff: (() => void) | null = null;

  async startOauth(id: string) {
    if (!window.schutz) return;
    this.setState({ oauthMsg: "", oauthPasteFor: null, oauthWait: id === "codex" });
    const r = await window.schutz.oauthStart(id);
    if (!r.ok) { this.setState({ oauthMsg: r.message ?? "로그인 시작 실패", oauthWait: false }); return; }
    if (r.mode === "paste") this.setState({ oauthPasteFor: id, oauthPasteVal: "" });
  }

  async submitOauthPaste() {
    const id = this.state.oauthPasteFor;
    if (!id || !window.schutz) return;
    const r = await window.schutz.oauthExchange(id, this.state.oauthPasteVal);
    if (r.ok && r.access) {
      setOAuth(id, { access: r.access, refresh: r.refresh ?? null, exp: r.exp ?? Date.now() + 3600_000, accountId: (r as any).accountId ?? null });
      this.setState(st => ({ oauthPasteFor: null, oauthPasteVal: "", oauthMsg: "", oauthTick: st.oauthTick + 1 }));
    } else {
      this.setState({ oauthMsg: r.message ?? "코드 교환 실패" });
    }
  }

  /** 구독 CLI 재감지 */
  async detectCli() {
    if (!window.schutz) return;
    const r = await window.schutz.cliCheck();
    this.setState({ cliAgents: r.agents ?? {} });
  }

  async testConn(id: string) {
    this.setState(st => ({ testMsg: { ...st.testMsg, [id]: "확인 중…" } }));
    const r = await testProvider(id);
    this.setState(st => ({ testMsg: { ...st.testMsg, [id]: r.ok ? "✓ 연결됨" : "⚠️ " + r.message.slice(0, 120) } }));
  }

  private _termOff: (() => void) | null = null;
  private _termStarted = false;
  private _cliOff: (() => void) | null = null;
  /** CLI 세션 id (멀티턴 --resume) */
  private _cliSession: string | null = null;
  private _cliMsgId: string | null = null;
  private _cliAgentKey = "claude";

  /** Electron 셸 시작 + 출력 구독 (최초 1회) */
  ensureTerm() {
    if (!window.schutz || this._termStarted) return;
    this._termStarted = true;
    window.schutz.termStart(this.state.workspace?.root);
    this._termOff = window.schutz.onTermData(d => {
      this.setState(s => ({ termReal: (s.termReal + d).slice(-60_000) }));
    });
  }

  /** 실제 프로젝트 폴더 열기 (Electron에서만 동작) */
  async openProject() {
    this.setState({ openMenu: null, projOpen: false });
    if (!window.schutz) {
      this.setState(s => ({
        messages: [...s.messages, {
          id: "a" + (this._uid++), role: "ai" as const, who: "Schutz",
          text: "프로젝트 열기는 데스크톱 앱에서만 가능합니다. Schutz 앱(설치본 또는 npm run electron)에서 실행해 주세요.",
        }],
      }));
      return;
    }
    const root = await window.schutz.openFolder();
    if (!root) return;
    await this.openWorkspacePath(root);
  }

  /** 제안 수락: find→replace를 실제 파일에 적용 */
  async acceptProposal(id: string) {
    const p = this.state.proposals.find(x => x.id === id);
    const ws = this.state.workspace;
    if (!p || !ws || !window.schutz || p.status !== "pending") return;
    try {
      if (p.find === "") {
        // 새 파일 생성
        await window.schutz.writeFile(ws.root, p.rel, p.replace);
        const tree = await window.schutz.readTree(ws.root);
        this.setState({ workspace: tree });
      } else {
        const cur = await window.schutz.readFile(ws.root, p.rel);
        const idx = cur.indexOf(p.find);
        if (idx < 0) throw new Error("원문을 찾을 수 없습니다 (파일이 변경됨)");
        if (cur.indexOf(p.find, idx + 1) >= 0) throw new Error("원문이 여러 번 존재합니다");
        await window.schutz.writeFile(ws.root, p.rel, cur.replace(p.find, p.replace));
      }
      this.setState(s => ({
        proposals: s.proposals.map(x => x.id === id ? { ...x, status: "accepted" as const } : x),
        paneVer: { ...s.paneVer, [p.rel]: (s.paneVer[p.rel] ?? 0) + 1 },
      }));
      this.openFile(p.rel);
    } catch (e) {
      this.setState(s => ({
        proposals: s.proposals.map(x => x.id === id ? { ...x, status: "failed" as const, error: e instanceof Error ? e.message : String(e) } : x),
      }));
    }
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

  agDef(id: string) { return AGDEF.find(a => a.id === id)!; }

  /** 모델별 단가 (USD / 1M tokens, 입력·출력) — 추정 공시가 */
  static PRICING: Record<string, [number, number]> = {
    "claude-sonnet-5": [3, 15],
    "claude-opus-4-8": [15, 75],
    "claude-haiku-4-5": [0.8, 4],
    "gpt-5.2": [1.75, 14],
    "gpt-5.2-codex": [1.75, 14],
    "grok-4": [3, 15],
    "glm-4.6": [0.6, 2.2],
  };

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
      if (getOAuth("codex")) return getModelOverride("codex") || "gpt-5.2-codex";
      if (this.state.cliAgents.codex?.ok) return "Codex CLI";
      return null;
    }
    if (id === "grok") return getStoredKey("grok").trim() ? "grok-4" : null;
    if (id === "glm") return getStoredKey("glm").trim() ? "glm-4.6" : null;
    return null;
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
  bumpAgent(id: string, tin: number, tout: number) {
    const model = this.modelOf(id) ?? "";
    const [pin, pout] = App.PRICING[model] ?? [3, 15];
    const sub = this.isSubscription(id);
    this.setState(s => {
      const a = s.agents[id];
      const cost = sub ? a.cost : a.cost + (tin * pin + tout * pout) / 1e6;
      return { agents: { ...s.agents, [id]: { ...a, tin: a.tin + tin, tout: a.tout + tout, cost } } };
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
      docs: freshDocs(), panes: [TM], expanded: null,
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
      this.setState({ panes: [TM, TY, MD] });
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

  stopRun() {
    if (this.state.cliBusy && window.schutz) window.schutz.cliStop();
    for (const a of this.abortCtls.values()) a.abort();
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

  openFile(path: string) {
    this.setState(s => {
      if (s.panes.includes(path)) return null;
      const cap = s.layout;
      const panes = s.panes.length < cap ? [...s.panes, path] : [...s.panes.slice(0, cap - 1), path];
      return { panes } as any;
    });
  }

  setLayout(n: number) {
    this.setState(s => ({
      layout: n,
      panes: s.panes.slice(0, n),
      openMenu: null,
    } as any));
  }
  closePane(path: string) {
    this.setState(s => s.panes.length > 1 ? { panes: s.panes.filter(p => p !== path) } as any : null);
  }
  toggleTerm() {
    this.setState(st => ({ termOpen: !st.termOpen }), () => {
      if (this.state.termOpen) this.ensureTerm();
    });
  }

  /** 로컬 슬래시 명령 — AI로 보내지 않고 Schutz가 직접 처리 */
  private schutzSay(userText: string, reply: string) {
    this.setState(s => ({
      input: "",
      messages: [...s.messages,
        { id: "u" + (this._uid++), role: "user" as const, text: userText },
        { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", text: reply }],
    }));
  }

  handleSlash(raw: string): boolean {
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const connected = AGDEF.map(d => d.id).filter(id => this.modelOf(id) !== null);
    switch (cmd) {
      case "/help": {
        const avail = SLASH_COMMANDS.filter(c =>
          c.origin === "schutz" ||
          (c.origin === "claude" && this.state.cliAgents.claude?.ok) ||
          (c.origin === "codex" && this.state.cliAgents.codex?.ok));
        this.schutzSay(raw, "사용 가능한 명령:\n" +
          avail.map(c => `${c.cmd} — ${c.desc} [${ORIGIN_LABEL[c.origin]}]`).join("\n") +
          "\n\n/ 를 입력하면 자동완성 팔레트가 열립니다.");
        return true;
      }
      case "/model": {
        if (rest.length >= 2) {
          const [ag, model] = rest;
          if (!AGDEF.some(d => d.id === ag) && ag !== "codex") {
            this.schutzSay(raw, "알 수 없는 에이전트: " + ag + " (claude/gpt/grok/glm)");
            return true;
          }
          setModelOverride(ag, model);
          this.schutzSay(raw, ag + " 모델을 `" + model + "` (으)로 변경했습니다. 다음 턴부터 적용됩니다.");
          return true;
        }
        const lines = connected.length
          ? connected.map(id => {
              const m = this.modelOf(id) ?? "?";
              const [pin, pout] = App.PRICING[m] ?? [3, 15];
              const price = this.isSubscription(id) ? "구독 포함" : `$${pin}/${pout} per 1M`;
              return `${this.agDef(id).name}: \`${m}\` (${price})`;
            }).join("\n")
          : "연결된 에이전트가 없습니다. 설정(⚙)에서 로그인하세요.";
        this.schutzSay(raw, "현재 모델:\n" + lines + "\n\n변경: /model <에이전트> <모델>");
        return true;
      }
      case "/usage": {
        const lines = connected.length
          ? connected.map(id => {
              const a = this.state.agents[id];
              const cost = this.isSubscription(id) ? "구독 포함" : "$" + a.cost.toFixed(4);
              return `${this.agDef(id).name}: 입력 ${a.tin.toLocaleString()} · 출력 ${a.tout.toLocaleString()} 토큰 · ${cost}`;
            }).join("\n")
          : "연결된 에이전트가 없습니다.";
        this.schutzSay(raw, "이번 세션 사용량:\n" + lines);
        return true;
      }
      case "/agents": {
        const lines = AGDEF.map(d => {
          const m = this.modelOf(d.id);
          return `${d.name}: ${m ? "연결됨 (" + m + ")" : "미연결"}`;
        }).join("\n");
        this.schutzSay(raw, lines + "\n\n연결 관리는 설정(⚙) 또는 메뉴 AI → 모델 관리…");
        return true;
      }
      case "/clear":
        this.history = [];
        this._cliSession = null;
        this.setState({ messages: [], input: "" });
        return true;
      default:
        if (cmd.startsWith("/")) {
          this.schutzSay(raw, "알 수 없는 명령입니다: " + cmd + "\n/help 로 명령 목록을 확인하세요.");
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
      this.schutzSay(raw, "이 명령은 " + cand.map(c => ORIGIN_LABEL[c.origin]).join("/") + " 명령입니다. 해당 CLI가 설치·로그인되어 있어야 실행할 수 있어요.");
      return true;
    }
    if (!this.state.workspace) {
      this.schutzSay(raw, "`" + token + "` 은(는) 프로젝트 컨텍스트가 필요합니다. 먼저 폴더를 열어주세요 (파일 → 프로젝트 열기…).");
      return true;
    }
    this.runCliTurn(pick.origin, raw, token === "/compact");
    return true;
  }

  send() {
    const rawIn = this.state.input.trim();
    if (rawIn.startsWith("/")) {
      if (this.forwardSlash(rawIn)) return;
      if (this.handleSlash(rawIn)) return;
    }
    const t = this.state.input.trim() || "TokenManager에 자동 갱신을 추가하고, 타입과 문서도 같이 맞춰줘";
    // 1순위: 앱 내 연결된 계정(OAuth) 또는 API 키 — Schutz 통합 에이전트 루프
    if (this.configuredAgents().length > 0) { void this.runReal(t); return; }
    // 2순위(폴백): 로컬에 설치된 구독 CLI
    if (window.schutz) {
      const ca = this.state.cliAgents;
      if (ca.claude?.ok) { this.runCliTurn("claude", t); return; }
      if (ca.codex?.ok) { this.runCliTurn("codex", t); return; }
    }
    // 데스크톱 앱: 데모 대신 연결 안내 (데모는 웹 프리뷰 전용)
    if (window.schutz) {
      this.setState(s => ({
        input: "",
        messages: [...s.messages,
          { id: "u" + (this._uid++), role: "user" as const, text: t },
          { id: "a" + (this._uid++), role: "ai" as const, who: "Schutz", text: "아직 연결된 AI가 없습니다.\n\n설정(⚙)을 열고 [로그인]을 눌러 Claude 또는 ChatGPT 계정으로 연결하세요 (구독 사용, API 키 불필요). API 키 방식도 지원합니다." }],
      }));
      return;
    }
    this.startRun(t);
  }

  /** 설정된 프로바이더 id 목록 */
  private configuredAgents(): string[] {
    return Object.keys(this.providers).filter(id => this.providers[id].isConfigured());
  }

  /** 도구 실행 (워크스페이스 모드, 에이전트별) */
  private async execTool(agentId: string, call: ToolCall): Promise<string> {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return "오류: 워크스페이스가 열려 있지 않습니다.";
    const toolId = "rt" + (this._uid++);
    try {
      if (call.name === "list_files") {
        this.addTool(toolId, agentId, "목록", ws.name);
        const list = ws.entries.filter(e => !e.dir).map(e => e.rel).join("\n");
        this.setTool(toolId, { st: "done", note: ws.entries.filter(e => !e.dir).length + "개" });
        return list || "(빈 워크스페이스)";
      }
      if (call.name === "read_file") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, "읽기", rel);
        const text = await window.schutz.readFile(ws.root, rel);
        this.setTool(toolId, { st: "done", note: (text.length / 1024).toFixed(1) + " KB" });
        return text;
      }
      if (call.name === "propose_create") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, "생성", rel);
        const holder = this.fileLocks.get(rel);
        if (holder && holder !== agentId) {
          this.setTool(toolId, { st: "done", note: "락 충돌" });
          return `오류: ${rel} 은(는) ${this.agDef(holder).name}이(가) 작업 중입니다 (파일 락).`;
        }
        this.fileLocks.set(rel, agentId);
        this.setAgent(agentId, { file: rel });
        const p: Proposal = {
          id: "pp" + (this._uid++),
          rel,
          find: "",
          replace: String(call.input?.content ?? ""),
          rationale: String(call.input?.rationale ?? "새 파일 생성"),
          agent: agentId,
          status: "pending",
        };
        this.setState(s => ({ proposals: [...s.proposals, p] }));
        this.setTool(toolId, { st: "done", note: "제안됨" });
        return "파일 생성 제안이 등록되었습니다. 사용자가 수락하면 생성됩니다.";
      }
      if (call.name === "propose_edit") {
        const rel = String(call.input?.path ?? "");
        this.addTool(toolId, agentId, "편집", rel);
        // 파일 락: 다른 에이전트가 잡고 있으면 거부
        const holder = this.fileLocks.get(rel);
        if (holder && holder !== agentId) {
          this.setTool(toolId, { st: "done", note: "락 충돌" });
          return `오류: ${rel} 은(는) ${this.agDef(holder).name}이(가) 작업 중입니다 (파일 락). 다른 파일을 작업하세요.`;
        }
        this.fileLocks.set(rel, agentId);
        this.setAgent(agentId, { file: rel });
        const p: Proposal = {
          id: "pp" + (this._uid++),
          rel,
          find: String(call.input?.find ?? ""),
          replace: String(call.input?.replace ?? ""),
          rationale: String(call.input?.rationale ?? "수정 제안"),
          agent: agentId,
          status: "pending",
        };
        this.setState(s => ({ proposals: [...s.proposals, p] }));
        this.setTool(toolId, { st: "done", note: "제안됨" });
        this.openFile(rel);
        return "편집 제안이 등록되었습니다. 사용자가 변경 검토 패널에서 수락/거절합니다.";
      }
      if (call.name === "delegate_task") {
        const target = String(call.input?.agent ?? "");
        const task = String(call.input?.task ?? "");
        this.addTool(toolId, agentId, "위임", target);
        if (!this.providers[target] || target === agentId) {
          this.setTool(toolId, { st: "done", note: "대상 오류" });
          return "오류: 알 수 없는 에이전트 " + target;
        }
        if (!this.providers[target].isConfigured()) {
          this.setTool(toolId, { st: "done", note: "미연결" });
          return `오류: ${this.agDef(target).name}이(가) 연결되어 있지 않습니다 (API 키 없음).`;
        }
        this.setTool(toolId, { st: "done", note: "위임됨" });
        // 병렬 실행 — 관리자 턴을 막지 않는다
        void this.runAgentLoop(target, [
          { role: "user", text: `관리자 Claude가 위임한 작업입니다:\n\n${task}` },
        ], { isManager: false });
        return `${this.agDef(target).name}에게 위임했습니다. 병렬로 진행되며 결과는 변경 검토에 나타납니다.`;
      }
      return "알 수 없는 도구: " + call.name;
    } catch (e) {
      this.setTool(toolId, { st: "done", note: "오류" });
      return "오류: " + (e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 범용 에이전트 루프 — 어떤 프로바이더든 도구를 돌며 작업.
   * 관리자(첫 진입)는 delegate_task로 다른 에이전트를 병렬 가동할 수 있다.
   */
  async runAgentLoop(agentId: string, seed: NeutralMsg[], opts: { isManager: boolean }) {
    const provider = this.providers[agentId];
    const d = this.agDef(agentId);
    const who = d.name + (opts.isManager ? " · 관리자" : "");
    const abort = new AbortController();
    this.abortCtls.set(agentId, abort);
    this.setAgent(agentId, { status: opts.isManager ? "plan" : "edit" });

    const useTools = !!(this.state.workspace && window.schutz);
    const others = this.configuredAgents().filter(id => id !== agentId);
    const tools = useTools
      ? (opts.isManager && others.length ? [...WORKSPACE_TOOLS, DELEGATE_TOOL] : WORKSPACE_TOOLS)
      : undefined;
    const system =
      SCHUTZ_SYSTEM_PROMPT +
      (opts.isManager ? MANAGER_SYSTEM_EXTRA + "\n연결된 에이전트: " + others.join(", ") : "") +
      (useTools ? "\n현재 워크스페이스: " + this.state.workspace!.name : "");

    const transcript: NeutralMsg[] = [...seed];
    let finalText = "";

    try {
      for (let round = 0; round < 8; round++) {
        const aiId = "a" + (this._uid++);
        this.setState(s => ({
          messages: [...s.messages, { id: aiId, role: "ai" as const, who, text: "", streaming: true }],
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
          }
        }
        this.setMsg(aiId, { streaming: false });
        if (!turnText) {
          this.setState(s => ({ messages: s.messages.filter(m => m.id !== aiId) }));
        }
        finalText = turnText || finalText;

        if (stopReason !== "tool_use" || calls.length === 0) break;

        transcript.push({ role: "assistant", text: turnText || undefined, calls });
        const results: { id: string; content: string }[] = [];
        for (const c of calls) {
          const out = await this.execTool(agentId, c);
          results.push({ id: c.id, content: out.slice(0, 40_000) });
        }
        transcript.push({ role: "user", results });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        this.setState(s => ({
          messages: [...s.messages, { id: "a" + (this._uid++), role: "ai" as const, who, text: "⚠️ " + (e instanceof Error ? e.message : String(e)) }],
        }));
      }
    } finally {
      // 이 에이전트의 파일 락 해제
      for (const [rel, holder] of [...this.fileLocks.entries()]) {
        if (holder === agentId) this.fileLocks.delete(rel);
      }
      this.abortCtls.delete(agentId);
      const mine = this.state.proposals.some(p => p.agent === agentId && p.status === "pending");
      this.setAgent(agentId, { status: mine ? "review" : "idle", file: null });
      if (opts.isManager && finalText) this.history.push({ role: "assistant", content: finalText });
      // 모든 에이전트가 끝났을 때만 running 해제
      if (this.abortCtls.size === 0) {
        this.setState(s => ({
          running: false,
          statusKey: s.proposals.some(p => p.status === "pending") ? "review" : "idle",
        }));
      }
    }
  }

  /** Claude Code CLI(구독 인증) 턴 — 편집은 CLI가 직접 수행(acceptEdits), 종료 후 트리·페인 갱신 */
  runCliTurn(agent: string, text: string, cont = false) {
    if (this.state.cliBusy || !window.schutz) return;
    const aiId = "a" + (this._uid++);
    this._cliMsgId = aiId;
    const agentKey = agent === "codex" ? "gpt" : "claude";
    const who = agent === "codex" ? "Codex · 구독" : "Claude · 구독";
    this._cliAgentKey = agentKey;
    this.setState(s => ({
      running: true, cliBusy: true, statusKey: "tool", input: "",
      agents: { ...s.agents, [agentKey]: { ...s.agents[agentKey], status: "edit" } },
      messages: [...s.messages,
        { id: "u" + (this._uid++), role: "user" as const, text },
        { id: aiId, role: "ai" as const, who, text: "", streaming: true }],
    }));
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
      const cur = this.state.messages.find(m => m.id === aiId)?.text ?? "";
      this.setMsg(aiId, { text: cur ? cur + "\n\n" + t : t });
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
          const verb = /edit|write/i.test(b.name) ? "편집" : /read|glob|grep|ls/i.test(b.name) ? "읽기" : "도구";
          const tid = "cli" + (this._uid++);
          this.addTool(tid, "claude", verb, String(file).split(/[\/]/).slice(-2).join("/") || b.name);
          this.setTool(tid, { st: "done", note: b.name });
        }
      }
      return;
    }
    if (ev.type === "result") {
      if (ev.session_id) this._cliSession = ev.session_id;
      if (ev.result && aiId && !(this.state.messages.find(m => m.id === aiId)?.text)) append(String(ev.result));
      if (typeof ev.total_cost_usd === "number") {
        this.setState(s => ({ agents: { ...s.agents, claude: { ...s.agents.claude, cost: s.agents.claude.cost + ev.total_cost_usd } } }));
      }
      return;
    }
    if (ev.type === "schutz_raw") {
      // codex 등 비-claude CLI: ANSI 제거한 원문 스트림
      const clean = String(ev.text ?? "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
      if (clean.trim() && aiId) {
        const cur = this.state.messages.find(m => m.id === aiId)?.text ?? "";
        this.setMsg(aiId, { text: cur ? cur + "\n" + clean : clean });
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
      }));
      // CLI가 파일을 직접 수정했을 수 있음 → 트리·열린 페인 리로드
      void this.refreshWorkspace();
    }
  }

  async refreshWorkspace() {
    const ws = this.state.workspace;
    if (!ws || !window.schutz) return;
    const tree = await window.schutz.readTree(ws.root);
    this.setState(s => {
      const paneVer: Record<string, number> = { ...s.paneVer };
      for (const p of s.panes) paneVer[p] = (paneVer[p] ?? 0) + 1;
      return { workspace: tree, paneVer } as any;
    });
  }

  /** 실제 모델 턴 시작 — 관리자(Claude 우선, 없으면 연결된 첫 에이전트)가 진입점 */
  async runReal(text: string) {
    if (this.state.running) return;
    const configured = this.configuredAgents();
    const pref = getManagerId();
    const managerId = configured.includes(pref) ? pref : (configured.includes("claude") ? "claude" : configured[0]);
    if (!managerId) return;
    this.history.push({ role: "user", content: text });
    this.setState(s => ({
      running: true, statusKey: "thinking", input: "",
      messages: [...s.messages, { id: "u" + (this._uid++), role: "user" as const, text }],
    }));
    const seed: NeutralMsg[] = this.history.map(m => ({ role: m.role as "user" | "assistant", text: m.content }));
    await this.runAgentLoop(managerId, seed, { isManager: true });
  }

  componentDidMount() {
    applyTheme(getThemeId());
    // 데스크톱 앱: 데모 없이 빈 상태에서 시작 + Claude Code CLI(구독 인증) 감지
    if (window.schutz) {
      this.setState({ panes: [], leftTab: "tree" });
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
            this.setState({ oauthWait: false, oauthMsg: r.message ?? "로그인 실패" });
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
    this._termOff?.();
    this._termOff = null;
    this._termStarted = false;
    this._cliOff?.();
    this._cliOff = null;
    this._oauthOff?.();
    this._oauthOff = null;
    window.removeEventListener("keydown", this._onGlobalKey);
  }

  /** 전역 단축키 (데스크톱) */
  private _onGlobalKey = (e: KeyboardEvent) => {
    if (!window.schutz) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === "Escape" && this.state.quickOpen) this.setState({ quickOpen: false });
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "p" && !e.shiftKey) { e.preventDefault(); this.setState(s => ({ quickOpen: !s.quickOpen, quickQuery: "", quickSel: 0 })); }
    else if (k === "s" && e.shiftKey) { e.preventDefault(); void this.saveAll(); }
    else if (k === "n" && !e.shiftKey) { e.preventDefault(); void this.newFileAt(""); }
    else if (k === "n" && e.shiftKey) { e.preventDefault(); window.schutz.newWindow(); }
    else if (k === "o" && !e.shiftKey) { e.preventDefault(); void this.openProject(); }
    else if (k === ",") { e.preventDefault(); this.setState({ settingsOpen: true }); }
    else if (k === "`") { e.preventDefault(); this.toggleTerm(); }
  };

  componentDidUpdate() {
    if (this._chat) {
      const sig = this.state.messages.map(m => m.text.length).join(",");
      if (sig !== this._chatSig) { this._chatSig = sig; this._chat.scrollTop = this._chat.scrollHeight; }
    }
    this.state.panes.forEach(path => {
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
      else if (marked[i]) { sign = "+"; bg = "rgba(139,178,146,.09)"; color = "#B7CBBA"; signColor = "#8BB292"; }
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
    const stMap = { idle: "대기 중", thinking: "계획 수립 중…", tool: "동시 작업 중…", review: "검토 대기", stopped: "중지됨" };
    const statusLabel = stMap[s.statusKey];
    const totIn = AGDEF.reduce((n, d) => n + s.agents[d.id].tin, 0);
    const totOut = AGDEF.reduce((n, d) => n + s.agents[d.id].tout, 0);
    const totCost = AGDEF.reduce((n, d) => n + s.agents[d.id].cost, 0);
    const costText = "$" + totCost.toFixed(3);
    const pendingFiles = s.files.filter(f => f.status === "pending").length;
    const doneCount = s.plan.filter(p => p.st === "done").length;
    const beamW = s.running ? (s.plan.length ? Math.max(8, Math.round((doneCount / s.plan.length) * 100)) + "%" : "8%") : "100%";
    const beamOp = s.running ? 1 : (pendingFiles > 0 ? 0.55 : 0.2);
    const flow = s.leftTab === "flow";
    const anyMenuOpen = !!s.openMenu || s.projOpen;
    const closeMenus = () => this.setState({ openMenu: null, projOpen: false });

    return (
      <div style={{ height: "100vh", minWidth: 1400, display: "flex", flexDirection: "column", background: "var(--bg-root)", color: "var(--fg)", fontFamily: SUIT, fontSize: 13, overflow: "hidden" }}>
        {anyMenuOpen && <div onClick={closeMenus} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}
        {this.renderSettings()}
        {this.renderQuickOpen()}
        {s.ctxMenu && (
          <div onClick={() => this.setState({ ctxMenu: null })} onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: null }); }}
            style={{ position: "fixed", inset: 0, zIndex: 190 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ position: "fixed", left: s.ctxMenu.x, top: s.ctxMenu.y, minWidth: 160, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 8, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 191 }}>
              {s.ctxMenu.isDir && (
                <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.newFileAt(r); }}
                  style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--fg-code)" }}>새 파일</div>
              )}
              <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.renameAt(r); }}
                style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--fg-code)" }}>이름 바꾸기</div>
              <div className="hvMenuItem" onClick={() => { const r = s.ctxMenu!.rel; this.setState({ ctxMenu: null }); void this.deleteAt(r); }}
                style={{ padding: "6px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "#CE9A9A" }}>삭제</div>
            </div>
          </div>
        )}

        {/* ══ Header ══ */}
        <div className="titlebar" style={{ flex: "none", height: 46, display: "flex", alignItems: "center", gap: 10, padding: window.schutz ? "0 150px 0 14px" : "0 14px", background: "var(--bg-panel)", borderBottom: "1px solid var(--w06)", position: "relative", zIndex: 50 }}>
          <img src="./assets/logo-t.png" alt="Schutz" style={{ width: 24, height: 24, display: "block" }} />

          {/* project switcher */}
          <div style={{ position: "relative" }}>
            <button className="hv06" onClick={() => this.setState(st => ({ projOpen: !st.projOpen, openMenu: null }))}
              style={{ height: 28, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--fg)", background: s.projOpen ? "var(--w07)" : "var(--w03)", border: "1px solid var(--w08)", borderRadius: 7, cursor: "pointer" }}>
              {s.workspace ? s.workspace.name : (window.schutz ? "프로젝트 열기" : "schutz-core")}
              {s.workspace?.branch && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--fg-sub2)", fontWeight: 400, fontFamily: MONO, background: "var(--w05)", borderRadius: 4, padding: "2px 7px 2px 5px" }}>
                  <GitBranchIcon />{s.workspace.branch}
                </span>
              )}
              <span style={{ fontSize: 8, color: "var(--fg-dim)" }}>▾</span>
            </button>
            {s.projOpen && (
              <div style={{ position: "absolute", top: 33, left: 0, width: 250, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 6, zIndex: 100 }}>
                <div style={{ padding: "4px 8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>프로젝트</div>
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
                  <div style={{ padding: "4px 8px 8px", fontSize: 11, color: "var(--fg-dim2)" }}>열린 프로젝트가 없습니다.</div>
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
                  프로젝트 열기…<div style={{ flex: 1 }} /><span style={{ fontSize: 10.5, color: "var(--fg-dim)", fontFamily: MONO }}>⇧⌘O</span>
                </div>
              </div>
            )}
          </div>

          <span style={{ width: 1, height: 16, background: "var(--w07)" }} />

          {/* menu bar */}
          <div style={{ display: "flex", gap: 1 }}>
            {MENUS.map(([k, label, items]) => {
              const open = s.openMenu === k;
              return (
                <div key={k} style={{ position: "relative" }}>
                  <button
                    className="hvMenuBtn"
                    onClick={() => this.setState(st => ({ openMenu: st.openMenu === k ? null : k, projOpen: false }))}
                    onMouseEnter={() => this.setState(st => (st.openMenu && st.openMenu !== k) ? { openMenu: k } as any : null)}
                    style={{ height: 26, padding: "0 10px", fontFamily: "inherit", fontSize: 12, color: open ? "var(--fg)" : "var(--fg-sub2)", background: open ? "var(--w07)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer" }}>
                    {label}
                  </button>
                  {open && (
                    <div style={{ position: "absolute", top: 29, left: 0, minWidth: 215, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 5, zIndex: 100 }}>
                      {items.map((it, i) => it === null
                        ? <div key={"s" + i} style={{ height: 1, background: "var(--w07)", margin: "4px 6px" }} />
                        : (
                          <div key={"i" + i} className="hvMenuItem"
                            onClick={() => {
                              if (it[0] === "프로젝트 열기…") { void this.openProject(); return; }
                              if (it[0] === "설정…") { this.setState({ openMenu: null, settingsOpen: true }); return; }
                              if (it[0] === "새 창") { window.schutz?.newWindow(); this.setState({ openMenu: null }); return; }
                              if (it[0] === "모델 관리…") { this.setState({ openMenu: null, settingsOpen: true }); return; }
                              if (it[0] === "사용량 대시보드") { this.setState({ openMenu: null }); this.handleSlash("/usage"); return; }
                              if (it[0] === "새 파일") { this.setState({ openMenu: null }); void this.newFileAt(""); return; }
                              if (it[0] === "저장") { this.setState({ openMenu: null }); void paneRegistry.focused?.save(); return; }
                              if (it[0] === "모두 저장") { this.setState({ openMenu: null }); void this.saveAll(); return; }
                              if (it[0] === "터미널") { this.setState({ openMenu: null }); this.toggleTerm(); return; }
                              if (it[0] === "파일로 이동") { this.setState({ openMenu: null, quickOpen: true, quickQuery: "", quickSel: 0 }); return; }
                              if (it[0] === "실행 취소") { this.setState({ openMenu: null }); this.editorAction("undo"); return; }
                              if (it[0] === "다시 실행") { this.setState({ openMenu: null }); this.editorAction("redo"); return; }
                              if (it[0] === "잘라내기") { this.setState({ openMenu: null }); this.editorAction("cut"); return; }
                              if (it[0] === "복사") { this.setState({ openMenu: null }); this.editorAction("copy"); return; }
                              if (it[0] === "붙여넣기") { this.setState({ openMenu: null }); this.editorAction("paste"); return; }
                              if (it[0] === "찾기") { this.setState({ openMenu: null }); this.editorAction("find"); return; }
                              if (it[0] === "단축키 목록") { this.setState({ openMenu: null }); this.schutzSay("/help", "단축키:\nCtrl+P 파일로 이동 · Ctrl+S 저장 · Ctrl+Shift+S 모두 저장 · Ctrl+N 새 파일 · Ctrl+` 터미널 · Ctrl+, 설정 · Ctrl+Shift+N 새 창 · Ctrl+F 찾기(에디터)"); return; }
                              if (it[0] === "Schutz 정보") { this.setState({ openMenu: null }); this.schutzSay("정보", "Schutz v0.0.1 — AI 네이티브 IDE\ngithub.com/SchutzScript/Schutz"); return; }
                              if (it[0] === "에디터 4분할") { this.setLayout(4); return; }
                              if (it[0] === "에디터 2분할") { this.setLayout(2); return; }
                              if (it[0] === "분할 해제") { this.setLayout(1); return; }
                              this.setState({ openMenu: null });
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 18, padding: "5px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--fg-code)" }}>{it[0]}</span>
                            <div style={{ flex: 1 }} />
                            <span style={{ color: "var(--fg-dim)", fontSize: 10.5, fontFamily: MONO }}>{it[1]}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />
          <button className="hv07" title="파일로 이동 (Ctrl+P)" onClick={() => this.setState({ quickOpen: true, quickQuery: "", quickSel: 0 })} style={iconBtn}><SearchIcon /></button>
          <span style={{ width: 1, height: 16, background: "var(--w08)" }} />
          <span style={{ fontSize: 12, color: "var(--fg-sub2)", whiteSpace: "nowrap" }}>{statusLabel}</span>
          <span style={{ width: 1, height: 16, background: "var(--w08)" }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-dim)", whiteSpace: "nowrap" }}>Σ 입력 {totIn.toLocaleString()} · 출력 {totOut.toLocaleString()} · {costText}</span>
        </div>

        {/* progress beam */}
        <div style={{ flex: "none", height: 2.5, background: "#141715" }}>
          <div style={{ height: "100%", width: beamW, opacity: beamOp, background: "linear-gradient(90deg,#4D5D53,#7D9183,var(--accent-hi))", transition: "width .5s ease,opacity .8s ease" }} />
        </div>

        {/* ══ Main ══ */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

          {/* tool rail */}
          <div style={{ flex: "none", width: 42, background: "var(--bg-panel)", borderRight: "1px solid var(--w06)", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 4 }}>
            <button className="hv07" title="프로젝트" onClick={() => this.setState({ leftTab: "tree" })} style={{ ...railBtn, background: !flow ? "rgba(143,168,147,.16)" : "transparent" }}>
              <FolderIcon color={!flow ? "var(--accent-hi)" : "#6E776F"} />
            </button>
            <button className="hv07" title="작업 흐름" onClick={() => this.setState({ leftTab: "flow" })} style={{ ...railBtn, background: flow ? "rgba(143,168,147,.16)" : "transparent" }}>
              <FlowIcon color={flow ? "var(--accent-hi)" : "#6E776F"} />
            </button>
            <div style={{ width: 22, height: 1, background: "var(--w07)", margin: "4px 0" }} />
            <button className="hv07" title="터미널" onClick={() => this.toggleTerm()} style={{ ...railBtn, background: s.termOpen ? "rgba(143,168,147,.16)" : "transparent" }}>
              <TermIcon />
            </button>
            <div style={{ flex: 1 }} />
            <button className="hv07" title="설정" onClick={() => this.setState({ settingsOpen: true })} style={railBtn}><GearIcon /></button>
          </div>

          {/* ── Left column ── */}
          <div style={{ flex: "none", width: 272, display: "flex", flexDirection: "column", borderRight: "1px solid var(--w06)", background: "var(--bg-panel)" }}>
            <div style={{ flex: "none", padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>{flow ? "작업 흐름" : "프로젝트"}</div>

            {flow ? this.renderFlow() : this.renderTree()}
            {this.renderChat()}
          </div>

          {/* ── Editor grid ── */}
          <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: s.layout === 1 ? "1fr" : "1fr 1fr", gridTemplateRows: s.layout === 4 ? "1fr 1fr" : "1fr", gap: 1, background: "var(--w07)" }}>
            {this.renderPanes()}
          </div>

          {/* ── Right column ── */}
          <div style={{ flex: "none", width: 336, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--w06)", background: "var(--bg-panel)" }}>
            {this.renderAgents()}
            {this.renderReview()}
          </div>
        </div>

        {/* ══ Terminal dock ══ */}
        {s.termOpen && this.renderTerm()}

        {/* ══ Status bar ══ */}
        <div style={{ flex: "none", height: 25, display: "flex", alignItems: "center", gap: 13, padding: "0 12px", background: "var(--bg-panel)", borderTop: "1px solid var(--w06)", fontSize: 11, color: "var(--fg-dim)" }}>
          {s.workspace?.branch && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10.5, color: "var(--fg-sub2)" }}>
              <GitBranchIcon size={10} sw={1.6} />{s.workspace.branch}
            </span>
          )}
          <span style={{ color: pendingFiles > 0 ? "#CCB491" : "var(--fg-dim)" }}>{pendingFiles > 0 ? "검토 대기 " + pendingFiles + "개 파일" : "변경 없음"}</span>
          <div style={{ flex: 1 }} />
          <span>에이전트 {AGDEF.filter(d => ["edit", "plan"].includes(s.agents[d.id].status)).length + "/" + AGDEF.length + " 활성"}</span>
          <span style={{ fontFamily: MONO }}>{costText}</span>
          {s.statusInfo && (
            <>
              <span style={{ fontFamily: MONO }}>{s.statusInfo.lang}</span>
              <span style={{ fontFamily: MONO }}>Ln {s.statusInfo.line}:{s.statusInfo.col}</span>
            </>
          )}
          <span style={{ width: 1, height: 13, background: "var(--w07)" }} />
          <button className="hv08" onClick={() => this.toggleTerm()}
            style={{ height: 19, padding: "0 8px", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: s.termOpen ? "var(--accent-hi)" : "var(--fg-dim)", background: s.termOpen ? "rgba(143,168,147,.14)" : "transparent", border: "none" }}>
            <TermStatusIcon />터미널
          </button>
        </div>
      </div>
    );
  }

  // ── 좌 패널: 작업 흐름 ──
  renderFlow() {
    const s = this.state;
    const planIcon: Record<string, [string, string]> = { pending: ["○", "var(--fg-dim2)"], done: ["✓", "#8BB292"], stopped: ["–", "#C97B7B"] };
    return (
      <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 14px 14px", position: "relative", borderBottom: "1px solid var(--w06)" }}>
        <div style={{ position: "absolute", left: 21, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#3B463F,#7D9183,#3B463F)", opacity: .4 }} />
        {s.plan.length === 0 && (
          <div style={{ position: "relative", paddingLeft: 22, fontSize: 12, color: "var(--fg-dim2)", marginTop: 8 }}>요청을 보내면 계획과 실행 과정이 이곳에 기록됩니다.</div>
        )}
        {s.plan.length > 0 && (
          <div style={{ position: "relative", marginTop: 6 }}>
            <span style={{ position: "absolute", left: 4, top: 8, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
            <div style={{ marginLeft: 22, background: "var(--bg-card)", border: "1px solid var(--w06)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>계획</span>
                <span style={{ fontSize: 10, color: "var(--accent)", background: "rgba(143,168,147,.1)", borderRadius: 3, padding: "0 6px", lineHeight: "15px" }}>Claude · 관리자</span>
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
                <span style={{ flex: "none", fontFamily: MONO, fontSize: 10, padding: "0 6px", lineHeight: "16px", borderRadius: 3, color: t.verb === "편집" ? "#CCB491" : "#A3B5A6", background: t.verb === "편집" ? "rgba(196,168,130,.1)" : "rgba(125,145,131,.12)" }}>{t.verb}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.path.split("/").pop()}</span>
                <div style={{ flex: 1 }} />
                {t.st === "run"
                  ? <span style={{ ...spinner("var(--accent)", "rgba(143,168,147,.25)"), flex: "none" }} />
                  : <span style={{ flex: "none", fontFamily: MONO, fontSize: 10.5, whiteSpace: "nowrap", color: t.st === "stopped" ? "#C97B7B" : "#535B55" }}>{t.note || "완료"}</span>}
              </div>
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
          <span style={{ fontSize: 12, color: "var(--fg-dim)", textAlign: "center", lineHeight: 1.7 }}>아직 열린 프로젝트가 없습니다.</span>
          <button className="hvAccent" onClick={() => void this.openProject()}
            style={{ height: 30, padding: "0 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>프로젝트 열기…</button>
        </div>
      );
    }
    // 실제 워크스페이스가 열려 있으면 실파일 트리
    if (s.workspace) {
      const ws = s.workspace;
      return (
        <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 0 14px", borderBottom: "1px solid var(--w06)" }}>
          <div style={{ padding: "4px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "var(--fg-dim)" }}>{ws.name.toUpperCase()}</div>
          {ws.entries.map(en => {
            const pad = 16 + en.depth * 14;
            // 접힌 상위 디렉터리 아래 항목은 숨김
            const hidden = Object.keys(s.collapsed).some(c => s.collapsed[c] && en.rel !== c && en.rel.startsWith(c + "/"));
            if (hidden) return null;
            if (en.dir) {
              const isCollapsed = !!s.collapsed[en.rel];
              return (
                <div key={en.rel} className="hv04" onClick={() => this.setState(st => ({ collapsed: { ...st.collapsed, [en.rel]: !st.collapsed[en.rel] } }))}
                  onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: { x: e.clientX, y: e.clientY, rel: en.rel, isDir: true } }); }}
                  style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "pointer" }}>
                  <span style={{ flex: "none", fontSize: 9, color: "var(--fg-dim)", width: 8 }}>{isCollapsed ? "▸" : "▾"}</span>
                  <span style={{ fontSize: 12, color: "var(--fg-sub2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.name}</span>
                </div>
              );
            }
            const inPane = s.panes.includes(en.rel);
            const dirty = s.paneDirty[en.rel];
            return (
              <div key={en.rel} className="hv04" onClick={() => this.openFile(en.rel)}
                onContextMenu={e => { e.preventDefault(); this.setState({ ctxMenu: { x: e.clientX, y: e.clientY, rel: en.rel, isDir: false } }); }}
                style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "pointer", background: inPane ? "rgba(125,145,131,.08)" : "transparent" }}>
                <span style={{ flex: "none", fontSize: 9, width: 8 }}></span>
                <span style={{ fontSize: 12, fontFamily: MONO, color: inPane ? "var(--fg)" : "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.name}</span>
                <div style={{ flex: 1 }} />
                {dirty && <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: "#CCB491" }} />}
              </div>
            );
          })}
          {ws.truncated && <div style={{ padding: "6px 16px", fontSize: 10.5, color: "var(--fg-dim2)" }}>… 항목이 많아 일부만 표시합니다</div>}
        </div>
      );
    }
    const lockOf = (path: string) => AGDEF.find(d => s.agents[d.id].file === path);
    const pendOf = (path: string) => s.files.find(f => f.path === path && f.status === "pending");
    const fileRow = (path: string, name: string, pad: number) => {
      const lock = lockOf(path);
      const pend = pendOf(path);
      const inPane = s.panes.includes(path);
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

  // ── 좌 패널: 대화 ──
  renderChat() {
    const s = this.state;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>
          대화
          <div style={{ flex: 1 }} />
          {window.schutz && s.cliAgents.claude?.ok && s.workspace && !s.running && (
            <button className="hv05" title="이 폴더의 최근 Claude 세션을 이어서 진행"
              onClick={() => this.runCliTurn("claude", "직전 작업을 이어서 계속 진행해줘.", true)}
              style={{ height: 22, padding: "0 9px", fontSize: 10.5, fontWeight: 500, letterSpacing: 0, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--accent)", background: "rgba(143,168,147,.08)", border: "1px solid rgba(143,168,147,.3)" }}>↻ 이어가기</button>
          )}
          {s.running && (
            <button className="hvRed2" onClick={() => this.stopRun()}
              style={{ height: 22, padding: "0 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, letterSpacing: 0, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#C98A8A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.3)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 1.5, background: "#C98A8A" }} />중지
            </button>
          )}
        </div>
        <div ref={el => { this._chat = el; }} style={{ flex: 1, overflowY: "auto", padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {s.messages.map(m => (
            <div key={m.id} style={{ display: "flex", gap: 8 }}>
              <span style={{ flex: "none", width: 11, fontSize: 9, lineHeight: 2, color: m.role === "user" ? "var(--accent)" : "transparent" }}>{m.role === "user" ? "◆" : ""}</span>
              <div style={{ minWidth: 0 }}>
                {m.role === "ai" && m.who && <div style={{ fontSize: 10, color: "var(--accent)", marginBottom: 2 }}>{m.who}</div>}
                <div style={{ fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", color: m.role === "user" ? "#E0E5E0" : "var(--fg-sub2)", fontWeight: m.role === "user" ? 500 : 400, fontFamily: SUIT }}>
                  {m.text}
                  {m.streaming && <span style={{ display: "inline-block", width: 2, height: 12, marginLeft: 2, background: "var(--accent)", verticalAlign: -1, animation: "szBlink 1s steps(1) infinite" }} />}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", padding: "10px 12px", borderTop: "1px solid var(--w06)", display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <div style={{ flex: 1, padding: 1.5, borderRadius: 10, background: s.running ? "linear-gradient(90deg,#4D5D53,var(--accent),#4D5D53)" : "var(--w10)", transition: "background .4s ease" }}>
            {(() => {
              const list = this.slashList();
              if (!list.length) return null;
              const sel = Math.min(s.slashSel, list.length - 1);
              return (
                <div style={{ position: "absolute", bottom: 58, left: 12, right: 12, background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 10, boxShadow: "var(--shadow-pop)", padding: 4, zIndex: 60, maxHeight: 220, overflowY: "auto" }}>
                  {list.map((c, i) => (
                    <div key={c.origin + c.cmd}
                      onMouseDown={ev => { ev.preventDefault(); this.setState({ input: c.cmd + (c.cmd === "/model" ? " " : "") }, () => { if (c.cmd !== "/model") this.send(); }); }}
                      onMouseEnter={() => this.setState({ slashSel: i })}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 6, cursor: "pointer", background: i === sel ? "var(--accent-soft)" : "transparent" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg)", fontWeight: 600 }}>{c.cmd}</span>
                      <span style={{ fontSize: 11, color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{c.desc}</span>
                      <span style={{ flex: "none", fontSize: 9.5, color: ORIGIN_COLOR[c.origin], border: `1px solid ${ORIGIN_COLOR[c.origin]}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{ORIGIN_LABEL[c.origin]}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <input value={s.input}
              onChange={e => this.setState({ input: e.target.value, slashSel: 0 })}
              onKeyDown={e => {
                const list = this.slashList();
                if (list.length) {
                  const sel = Math.min(s.slashSel, list.length - 1);
                  if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ slashSel: (sel + 1) % list.length }); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ slashSel: (sel - 1 + list.length) % list.length }); return; }
                  if (e.key === "Tab") { e.preventDefault(); this.setState({ input: list[sel].cmd + " " }); return; }
                  if (e.key === "Enter" && s.input !== list[sel].cmd && list[sel].cmd.startsWith(s.input)) {
                    e.preventDefault();
                    this.setState({ input: list[sel].cmd }, () => this.send());
                    return;
                  }
                }
                if (e.key === "Enter") this.send();
              }}
              placeholder="요청 입력 · /명령 (Enter)"
              style={{ width: "100%", background: "var(--bg-root)", border: "none", borderRadius: 8.5, height: 34, padding: "0 13px", color: "var(--fg)", fontSize: 12.5, fontFamily: SUIT, outline: "none", display: "block" }} />
          </div>
          <button className="hvAccent" onClick={() => this.send()}
            style={{ height: 37, width: 40, fontSize: 14, fontFamily: "inherit", cursor: "pointer", borderRadius: 9, color: "var(--bg-root)", background: "var(--accent)", border: "none", fontWeight: 700 }}>↑</button>
        </div>
      </div>
    );
  }

  // ── 에디터 그리드 ──
  renderPanes() {
    const s = this.state;
    const n = s.panes.length;
    const slots: (string | null)[] = [...s.panes.slice(0, s.layout)];
    while (slots.length < s.layout) slots.push(null);

    const lineColors: Record<string, [string, string]> = {
      typing: ["rgba(125,145,131,.1)", ""],
      fresh: ["rgba(196,168,130,.16)", "#C4A882"],
      pending: ["rgba(125,145,131,.07)", ""],
      removed: ["rgba(201,123,123,.08)", "#C97B7B"],
      accepted: ["rgba(139,178,146,.13)", "#8BB292"],
      base: ["transparent", "transparent"],
    };

    return slots.map((path, si) => {
      if (!path) {
        return (
          <div key={"empty" + si} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--bg-editor)" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-dim3)" }}>
              {window.schutz && !s.workspace ? (
                <>
                  <img src="./assets/logo-t.png" alt="" style={{ width: 40, height: 40, opacity: .25 }} />
                  <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>프로젝트를 열어 시작하세요</span>
                  <button className="hvAccent" onClick={() => void this.openProject()}
                    style={{ marginTop: 4, height: 30, padding: "0 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>폴더 열기</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 20 }}>▢</span>
                  <span style={{ fontSize: 11 }}>빈 편집 창 · 탐색기에서 파일을 열 수 있습니다</span>
                </>
              )}
            </div>
          </div>
        );
      }

      // 실제 워크스페이스 파일 → Monaco 편집 페인
      if (s.workspace && !s.docs[path]) {
        const dirty = s.paneDirty[path];
        return (
          <div key={path} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--bg-editor)" }}>
            <div style={{ flex: "none", height: 34, display: "flex", alignItems: "center", gap: 9, padding: "0 14px", borderBottom: "1px solid var(--w05)" }}>
              <span style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: dirty ? "#CCB491" : "var(--fg-dim2)" }} />
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
              <div style={{ flex: 1 }} />
              <span style={{ flex: "none", display: "flex", alignItems: "center", height: 19, padding: "0 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", color: dirty ? "#CCB491" : "#535B55", background: dirty ? "rgba(196,168,130,.1)" : "var(--w04)" }}>{dirty ? "수정됨" : "✓"}</span>
              {n > 1 && (
                <button className="hvDim" onClick={() => this.closePane(path)} style={{ width: 20, height: 20, fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
              )}
            </div>
            <MonacoPane
              key={path + ":" + (s.paneVer[path] ?? 0)}
              root={s.workspace.root}
              rel={path}
              onDirtyChange={(rel, d) => this.setState(st => ({ paneDirty: { ...st.paneDirty, [rel]: d } }))}
              onStatus={info => this.setState({ statusInfo: info })}
            />
          </div>
        );
      }

      const doc = s.docs[path] || [];
      const isMd = path.endsWith(".md");
      const agColor = this.agentColorFor(path) || "#7D9183";
      const editing = doc.some(l => l.kind === "typing" || l.kind === "fresh");
      const nOpen = this.openHunks(path).length;
      let inspText: string, inspColor: string, inspBg: string;
      if (editing) { inspText = "작성 중…"; inspColor = "#A3B5A6"; inspBg = "rgba(125,145,131,.12)"; }
      else if (nOpen > 0) { inspText = "검토 " + nOpen + "곳"; inspColor = "#CCB491"; inspBg = "rgba(196,168,130,.1)"; }
      else { inspText = "✓"; inspColor = "#535B55"; inspBg = "var(--w04)"; }
      const lock = AGDEF.find(d => s.agents[d.id].file === path);

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
        <div key={path} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--bg-editor)" }}>
          <div style={{ flex: "none", height: 34, display: "flex", alignItems: "center", gap: 9, padding: "0 14px", borderBottom: "1px solid var(--w05)" }}>
            <span style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: this.agentColorFor(path) || "var(--fg-dim2)" }} />
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--fg-sub)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
            {lock && (
              <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: lock.color, border: `1px solid ${lock.color}50`, borderRadius: 4, padding: "0 6px", lineHeight: "16px" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: lock.color, animation: "szPulse 1.1s ease-in-out infinite" }} />{lock.name} 작업 중
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ flex: "none", display: "flex", alignItems: "center", height: 19, padding: "0 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", color: inspColor, background: inspBg }}>{inspText}</span>
            {n > 1 && (
              <button className="hvDim" onClick={() => this.closePane(path)} style={{ width: 20, height: 20, fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
            )}
          </div>
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
                  <div key={l.id} style={{ position: "relative", display: "flex", alignItems: "flex-start", minHeight: 20, background: rowBg, transition: "background .7s ease" }}>
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
                        <button className="hvGreen" onClick={() => this.resolveHunk(path, hk, true)} style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#9DC4A3", background: "transparent", border: "none" }}>✓ 수락</button>
                        <div style={{ width: 1, height: 12, background: "var(--w10)" }} />
                        <button className="hvRed" onClick={() => this.resolveHunk(path, hk, false)} style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#CE9A9A", background: "transparent", border: "none" }}>✕ 거절</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    });
  }

  // ── 우 패널: 에이전트 ──
  renderAgents() {
    const s = this.state;
    const astMap: Record<string, [string, string]> = { idle: ["대기", "var(--fg-dim)"], plan: ["계획 수립 중", "#A3B5A6"], edit: ["작업 중", "#A3B5A6"], review: ["완료 · 검토 대기", "#C4A882"], stop: ["중지됨", "#C98A8A"] };
    return (
      <div style={{ flex: "none", borderBottom: "1px solid var(--w06)" }}>
        <div className="hvHead" onClick={() => this.setState(st => ({ agentsOpen: !st.agentsOpen }))}
          style={{ height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 8.5, width: 10 }}>{s.agentsOpen ? "▾" : "▸"}</span>에이전트
          <span style={{ fontSize: 10.5, fontWeight: 400, letterSpacing: 0, color: "var(--fg-dim2)" }}>{s.agentsOpen ? "동시 작업 · 파일 락 격리" : ""}</span>
        </div>
        {s.agentsOpen && (
          <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {window.schutz && AGDEF.every(d => this.modelOf(d.id) === null) && (
              <div style={{ fontSize: 11.5, color: "var(--fg-dim)", padding: "2px 2px 4px", lineHeight: 1.6 }}>
                연결된 에이전트가 없습니다. 설정(⚙) 또는 메뉴 AI → 모델 관리…에서 로그인하세요.
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
                      : <span style={{ fontSize: 9.5, color: "var(--fg-dim2)", border: "1px solid var(--w08)", borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>미연결</span>; })()}
                    {d.mgr && <span style={{ fontSize: 9.5, color: "var(--bg-root)", background: d.color, borderRadius: 3, padding: "0 5px", lineHeight: "15px", fontWeight: 700 }}>관리자</span>}
                    <div style={{ flex: 1 }} />
                    {(a.status === "edit" || a.status === "plan") && <span style={{ ...spinner(d.color, d.color + "40"), flex: "none" }} />}
                    <span style={{ fontSize: 10.5, whiteSpace: "nowrap", color: stColor }}>{stText}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: a.file ? d.color : "var(--fg-dim3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file ?? "—"}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--fg-dim)", whiteSpace: "nowrap" }}>↓{a.tin.toLocaleString()} ↑{a.tout.toLocaleString()} · <span style={{ color: "var(--fg-sub2)" }}>{this.isSubscription(d.id) ? "구독" : "$" + a.cost.toFixed(3)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── 우 패널: 변경 검토 (워크스페이스 모드 — Claude 편집 제안) ──
  renderProposals() {
    const s = this.state;
    const pstMap: Record<string, [string, string]> = {
      pending: ["검토 대기", "#C4A882"], accepted: ["수락됨", "#8BB292"],
      rejected: ["거절됨", "#C97B7B"], failed: ["적용 실패", "#C97B7B"],
    };
    const pending = s.proposals.filter(p => p.status === "pending").length;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>변경 검토</span>
          {s.proposals.length > 0 && <span style={{ fontSize: 10.5, color: "var(--fg-sub2)", background: "var(--w06)", borderRadius: 8, padding: "0 7px", lineHeight: "16px" }}>{s.proposals.length}</span>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {s.proposals.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-dim2)", padding: "6px 2px" }}>Claude에게 작업을 요청하면 편집 제안이 여기에 표시됩니다.</div>}
          {pending > 1 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="hvAccent" onClick={() => s.proposals.filter(p => p.status === "pending").forEach(p => void this.acceptProposal(p.id))} style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>모두 수락</button>
              <button className="hv05" onClick={() => s.proposals.forEach(p => this.rejectProposal(p.id))} style={{ flex: 1, height: 30, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>모두 거절</button>
            </div>
          )}
          {s.proposals.map(p => {
            const [sl, sc] = pstMap[p.status];
            return (
              <div key={p.id} style={{ position: "relative", background: "var(--bg-card)", border: "1px solid var(--w07)", borderRadius: 10, overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--accent)", zIndex: 2 }} />
                <div style={{ padding: "10px 13px 9px 16px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.rel}</span>
                    <span style={{ flex: "none", fontSize: 9.5, color: this.agDef(p.agent)?.color ?? "var(--accent)", border: `1px solid ${(this.agDef(p.agent)?.color ?? "var(--accent)") + "50"}`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{this.agDef(p.agent)?.name ?? p.agent}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10.5, whiteSpace: "nowrap", color: sc }}>{sl}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg-sub2)", marginTop: 4 }}>{p.rationale}</div>
                  {p.error && <div style={{ fontSize: 10.5, color: "#CE9A9A", marginTop: 4 }}>⚠️ {p.error}</div>}
                </div>
                <div style={{ borderTop: "1px solid var(--w06)", background: "var(--bg-editor)", maxHeight: 180, overflow: "auto", fontFamily: MONO, fontSize: 10.5, lineHeight: "18px" }}>
                  {p.find.split("\n").map((l, i) => (
                    <div key={"o" + i} style={{ display: "flex", background: "rgba(201,123,123,.1)" }}>
                      <span style={{ flex: "none", width: 16, textAlign: "center", color: "#C97B7B", userSelect: "none" }}>−</span>
                      <span style={{ whiteSpace: "pre", color: "#C99A9A" }}>{l || " "}</span>
                    </div>
                  ))}
                  {p.replace.split("\n").map((l, i) => (
                    <div key={"n" + i} style={{ display: "flex", background: "rgba(139,178,146,.09)" }}>
                      <span style={{ flex: "none", width: 16, textAlign: "center", color: "#8BB292", userSelect: "none" }}>+</span>
                      <span style={{ whiteSpace: "pre", color: "#B7CBBA" }}>{l || " "}</span>
                    </div>
                  ))}
                  {p.status === "pending" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderTop: "1px solid var(--w05)", fontFamily: SUIT }}>
                      <div style={{ flex: 1 }} />
                      <button className="hvGreen2" onClick={() => void this.acceptProposal(p.id)} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#9DC4A3", background: "rgba(139,178,146,.1)", border: "1px solid rgba(139,178,146,.3)" }}>수락</button>
                      <button className="hvRed2" onClick={() => this.rejectProposal(p.id)} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#CE9A9A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>거절</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 우 패널: 변경 검토 ──
  renderReview() {
    const s = this.state;
    if (s.workspace || window.schutz) return this.renderProposals();
    const fstMap: Record<string, [string, string]> = { pending: ["검토 대기", "#C4A882"], accepted: ["수락됨", "#8BB292"], rejected: ["거절됨", "#C97B7B"] };
    const pendingFiles = s.files.filter(f => f.status === "pending").length;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div onClick={() => this.setState(st => ({ reviewOpen: !st.reviewOpen }))}
          style={{ flex: "none", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 8.5, width: 10, color: "var(--fg-dim)" }}>{s.reviewOpen ? "▾" : "▸"}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg-dim)" }}>변경 검토</span>
          {s.files.length > 0 && <span style={{ fontSize: 10.5, color: "var(--fg-sub2)", background: "var(--w06)", borderRadius: 8, padding: "0 7px", lineHeight: "16px" }}>{s.files.length}</span>}
        </div>
        {s.reviewOpen && (
          <div style={{ flex: 1, overflowY: "auto", padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {s.files.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-dim2)", padding: "6px 2px" }}>검토할 변경이 없습니다.</div>}
            {pendingFiles > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="hvAccent" onClick={() => this.resolveAll(true)} style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--bg-root)", background: "var(--accent)", border: "none" }}>모두 수락</button>
                <button className="hv05" onClick={() => this.resolveAll(false)} style={{ flex: 1, height: 30, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>모두 거절</button>
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
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#8BB292" }}>+{f.add}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#C97B7B" }}>−{f.del}</span>
                      <div style={{ flex: 1, display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden" }}>
                        <span style={{ height: "100%", background: "#8BB292", opacity: .75, width: Math.round((f.add / tot) * 60) + "%" }} />
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
                        <button className="hv05" onClick={e => { e.stopPropagation(); this.openFile(f.path); }} style={{ height: 23, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w12)" }}>에디터에서 열기</button>
                        <div style={{ flex: 1 }} />
                        {f.status === "pending" && (
                          <>
                            <button className="hvGreen2" onClick={e => { e.stopPropagation(); this.resolveFile(f.path, true); }} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#9DC4A3", background: "rgba(139,178,146,.1)", border: "1px solid rgba(139,178,146,.3)" }}>수락</button>
                            <button className="hvRed2" onClick={e => { e.stopPropagation(); this.resolveFile(f.path, false); }} style={{ height: 23, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#CE9A9A", background: "rgba(201,123,123,.08)", border: "1px solid rgba(201,123,123,.28)" }}>거절</button>
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

  // ── 터미널 독 ──
  renderTerm() {
    const s = this.state;
    const DIM = "var(--fg-dim)", TXT = "var(--fg-code)", SUB = "var(--fg-sub)", OK = "#8BB292", AC = "var(--accent)";
    let termLines: { key: string; segs: { t: string; c: string }[]; caret?: boolean }[];
    if (s.termTab === "term") termLines = [
      { key: "t1", segs: [{ t: "$ ", c: AC }, { t: "pnpm vitest run src/auth", c: TXT }] },
      { key: "t2", segs: [{ t: "  ✓ ", c: OK }, { t: "src/auth/token-manager.spec.ts ", c: SUB }, { t: "(14 tests) 231ms", c: DIM }] },
      { key: "t3", segs: [{ t: "  Tests  ", c: DIM }, { t: "14 passed", c: OK }, { t: " (14)", c: DIM }] },
      { key: "t4", segs: [{ t: "$ ", c: AC }, { t: "git diff --stat", c: TXT }] },
      { key: "t5", segs: [{ t: "  3 files changed, 23 insertions(+), 1 deletion(-)", c: DIM }] },
      { key: "t6", segs: [{ t: "$ ", c: AC }], caret: true },
    ];
    else if (s.termTab === "prob") termLines = [
      { key: "p1", segs: [{ t: "✓ 문제 없음 — 컴파일 · 린트 통과", c: OK }] },
      { key: "p2", segs: [{ t: "  마지막 검사: 방금 전 · tsc --noEmit · eslint", c: DIM }] },
    ];
    else if (s.termTab === "out") termLines = [
      { key: "o1", segs: [{ t: "[schutz] ", c: AC }, { t: "세션 시작 · 워크스페이스 인덱싱 완료 (1,204 files)", c: SUB }] },
      { key: "o2", segs: [{ t: "[schutz] ", c: AC }, { t: "에이전트 3개 연결됨 · 파일 락 관리자 활성", c: SUB }] },
      { key: "o3", segs: [{ t: "[lsp]    ", c: DIM }, { t: "typescript-language-server ready", c: DIM }] },
    ];
    else {
      const times = ["14:02:07", "14:02:09", "14:02:12", "14:02:15", "14:02:18", "14:02:21"];
      termLines = !s.tools.length
        ? [{ key: "a0", segs: [{ t: "에이전트 활동이 여기에 기록됩니다.", c: DIM }] }]
        : s.tools.map((t, i) => {
          const d = this.agDef(t.agent);
          return {
            key: "a" + t.id, segs: [
              { t: times[i % times.length] + "  ", c: DIM },
              { t: d.name.padEnd(7), c: d.color },
              { t: t.verb + "  ", c: SUB },
              { t: t.path, c: TXT },
              { t: t.st === "run" ? "  …" : "  " + (t.note || "완료"), c: t.st === "run" ? AC : DIM },
            ],
          };
        });
    }
    const tabs: [string, string, string | null][] = [["term", "터미널", null], ["prob", "문제", "0"], ["out", "출력", null], ["ai", "AI 로그", null]];
    return (
      <div style={{ flex: "none", height: 168, display: "flex", flexDirection: "column", background: "var(--bg-dock)", borderTop: "1px solid var(--w07)" }}>
        <div style={{ flex: "none", height: 32, display: "flex", alignItems: "center", gap: 2, padding: "0 10px", borderBottom: "1px solid var(--w05)" }}>
          {tabs.map(([k, label, badge]) => (
            <button key={k} className="hvTermTab" onClick={() => this.setState({ termTab: k, termOpen: true }, () => this.ensureTerm())}
              style={{ height: 24, padding: "0 11px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: s.termTab === k ? "var(--fg)" : "var(--fg-dim)", background: s.termTab === k ? "var(--w06)" : "transparent", border: "none" }}>
              {label}
              {badge && <span style={{ fontSize: 9.5, color: "var(--fg-sub2)", background: "var(--w07)", borderRadius: 7, padding: "0 5px", lineHeight: "13px" }}>{badge}</span>}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="hvDim" onClick={() => this.setState(st => ({ termOpen: !st.termOpen }))} title="독 접기" style={{ width: 22, height: 22, fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "var(--fg-dim)", background: "transparent", border: "none" }}>⌄</button>
        </div>
        {window.schutz && s.termTab === "term" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div ref={el => { if (el) el.scrollTop = el.scrollHeight; }} style={{ flex: 1, overflowY: "auto", padding: "9px 16px", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--fg-code)" }}>
              {s.termReal || "셸을 시작하는 중…"}
            </div>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "4px 16px 8px" }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--accent)" }}>$</span>
              <input
                value={s.termInput}
                onChange={e => this.setState({ termInput: e.target.value })}
                onKeyDown={e => {
                  if (e.key === "Enter" && window.schutz) {
                    window.schutz.termInput(s.termInput);
                    this.setState(st => ({ termReal: (st.termReal + "\n$ " + st.termInput + "\n").slice(-60_000), termInput: "" }));
                  }
                }}
                placeholder="명령 입력 (Enter)"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--fg)", fontFamily: MONO, fontSize: 11.5 }}
              />
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "9px 16px", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.75 }}>
            {termLines.map(tl => (
              <div key={tl.key} style={{ whiteSpace: "pre-wrap" }}>
                {tl.segs.map((sg, i) => <span key={i} style={{ color: sg.c }}>{sg.t}</span>)}
                {tl.caret && <span style={{ display: "inline-block", width: 7, height: 12, background: "var(--accent)", verticalAlign: -1, animation: "szBlink 1s steps(1) infinite" }} />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Ctrl+P 퀵오픈 ──
  renderQuickOpen() {
    const s = this.state;
    if (!s.quickOpen) return null;
    const list = this.quickList();
    const sel = Math.min(s.quickSel, Math.max(0, list.length - 1));
    return (
      <div onClick={() => this.setState({ quickOpen: false })}
        style={{ position: "fixed", inset: 0, zIndex: 180, background: "rgba(0,0,0,.25)", display: "flex", justifyContent: "center", paddingTop: 90 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width: 560, maxWidth: "90%", alignSelf: "flex-start", background: "var(--bg-popup)", border: "1px solid var(--bd-popup)", borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
          <input autoFocus value={s.quickQuery}
            onChange={e => this.setState({ quickQuery: e.target.value, quickSel: 0 })}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ quickSel: (sel + 1) % Math.max(1, list.length) }); }
              else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ quickSel: (sel - 1 + list.length) % Math.max(1, list.length) }); }
              else if (e.key === "Enter" && list[sel]) { this.openFile(list[sel].rel); this.setState({ quickOpen: false }); }
              else if (e.key === "Escape") this.setState({ quickOpen: false });
            }}
            placeholder="파일 이름으로 이동…"
            style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--w08)", height: 42, padding: "0 16px", color: "var(--fg)", fontSize: 13.5, fontFamily: SUIT, outline: "none" }} />
          <div style={{ maxHeight: 320, overflowY: "auto", padding: 4 }}>
            {!this.state.workspace && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>먼저 프로젝트를 열어주세요.</div>}
            {this.state.workspace && list.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-dim)" }}>일치하는 파일이 없습니다.</div>}
            {list.map((f, i) => (
              <div key={f.rel}
                onMouseDown={e => { e.preventDefault(); this.openFile(f.rel); this.setState({ quickOpen: false }); }}
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

  // ── 설정 모달 (프로바이더 API 키) ──
  renderSettings() {
    const s = this.state;
    if (!s.settingsOpen) return null;
    return (
      <div onClick={() => this.setState({ settingsOpen: false })}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width: 480, maxWidth: "92%", background: "var(--bg-card)", border: "1px solid var(--bd-popup)", borderRadius: 14, boxShadow: "var(--shadow-pop)", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>설정</span>
            <div style={{ flex: 1 }} />
            <button className="hvDim" onClick={() => this.setState({ settingsOpen: false })}
              style={{ width: 24, height: 24, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-dim)", background: "transparent", border: "none" }}>✕</button>
          </div>
          {window.schutz && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)" }}>구독 계정 로그인 (권장 · API 키 불필요)</div>
              {[
                { id: "claude", label: "Claude (Pro/Max 구독)" },
                { id: "codex", label: "ChatGPT (Plus/Pro 구독)" },
              ].map(c => {
                const connected = !!getOAuth(c.id);
                return (
                  <div key={c.id} style={{ padding: "8px 12px", borderRadius: 8, background: connected ? "rgba(143,168,147,.08)" : "var(--w03)", border: `1px solid ${connected ? "rgba(143,168,147,.35)" : "var(--w08)"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#8BB292" : "var(--fg-dim)", flex: "none" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: connected ? "var(--fg)" : "var(--fg-sub2)", flex: 1 }}>
                        {c.label} {connected ? "· 연결됨" : "· 미연결"}
                      </span>
                      {connected ? (
                        <button className="hv05" onClick={() => { setOAuth(c.id, null); this.setState(st => ({ oauthTick: st.oauthTick + 1 })); }}
                          style={{ flex: "none", height: 25, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--fg-dim)", background: "transparent", border: "1px solid var(--w14)" }}>해제</button>
                      ) : (
                        <button className="hvAccent" onClick={() => void this.startOauth(c.id)}
                          style={{ flex: "none", height: 25, padding: "0 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>로그인</button>
                      )}
                    </div>
                    {!connected && s.oauthPasteFor === c.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <input value={s.oauthPasteVal} placeholder="브라우저 승인 후 코드를 붙여넣으세요"
                          onChange={e => this.setState({ oauthPasteVal: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") void this.submitOauthPaste(); }}
                          style={{ flex: 1, minWidth: 0, background: "var(--bg-root)", border: "1px solid rgba(143,168,147,.35)", borderRadius: 6, height: 28, padding: "0 10px", color: "var(--fg)", fontSize: 11, fontFamily: MONO, outline: "none" }} />
                        <button className="hvAccent" onClick={() => void this.submitOauthPaste()}
                          style={{ height: 28, padding: "0 11px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "var(--on-accent)", background: "var(--accent)", border: "none" }}>연결</button>
                      </div>
                    )}
                    {!connected && c.id === "codex" && s.oauthWait && (
                      <div style={{ fontSize: 10.5, color: "var(--fg-sub2)", marginTop: 7 }}>브라우저에서 승인하면 자동으로 연결됩니다…</div>
                    )}
                  </div>
                );
              })}
              {s.oauthMsg && <div style={{ fontSize: 10.5, color: "#CE9A9A" }}>⚠️ {s.oauthMsg}</div>}
              <div style={{ fontSize: 10, color: "var(--fg-dim2)" }}>Grok·GLM은 구독 로그인 미제공 — API 키 방식만 지원됩니다.</div>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg-dim)", marginBottom: 8 }}>AI 프로바이더 API 키 {window.schutz && (s.cliAgents.claude?.ok || s.cliAgents.codex?.ok) ? "(선택 — 구독 인증이 우선)" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AGDEF.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ flex: "none", width: 52, fontSize: 12, fontWeight: 600, color: d.color }}>{d.name}</span>
                <input
                  type="password"
                  defaultValue={getStoredKey(d.id as any)}
                  onChange={e => setStoredKey(d.id as any, e.target.value.trim())}
                  placeholder="API 키 (비우면 미사용)"
                  style={{ flex: 1, minWidth: 0, background: "var(--bg-root)", border: "1px solid var(--w10)", borderRadius: 7, height: 30, padding: "0 11px", color: "var(--fg)", fontSize: 11.5, fontFamily: MONO, outline: "none" }}
                />
                <button className="hv05" onClick={() => void this.testConn(d.id)}
                  style={{ flex: "none", height: 30, padding: "0 11px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 7, color: "var(--fg-sub)", background: "transparent", border: "1px solid var(--w14)" }}>테스트</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
            {AGDEF.filter(d => s.testMsg[d.id]).map(d => (
              <div key={d.id} style={{ fontSize: 10.5, color: s.testMsg[d.id].startsWith("✓") ? "#8BB292" : s.testMsg[d.id].startsWith("⚠") ? "#CE9A9A" : "var(--fg-sub2)" }}>
                {d.name}: {s.testMsg[d.id]}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--fg-dim2)", marginTop: 10, lineHeight: 1.6 }}>
            키는 이 기기(localStorage)에만 저장됩니다. [테스트]는 실제 API를 1회 호출해 연결을 검증합니다.
          </div>
        </div>
      </div>
    );
  }
}

const iconBtn: React.CSSProperties = { width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer" };
const railBtn: React.CSSProperties = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer" };
const spinner = (color: string, track: string): React.CSSProperties => ({ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${track}`, borderTopColor: color, animation: "szSpin .9s linear infinite", display: "block" });
