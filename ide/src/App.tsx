import React from "react";
import {
  AGDEF, MENUS, PROJECTS, TM, TY, MD,
  freshDocs, hunkDefs,
  DocLine, AgentState, PlanItem, ToolItem, ReviewFile, ChatMsg,
} from "./ide/data";
import {
  GitBranchIcon, SearchIcon, PlayIcon, DebugIcon, BellIcon,
  FolderIcon, FlowIcon, VcsIcon, TermIcon, GearIcon, TermStatusIcon,
} from "./icons";
import { ClaudeProvider, SCHUTZ_SYSTEM_PROMPT } from "./ai/claude";
import { Message } from "./ai/provider";

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
}

const TYPING_SPEED = 1;
const SHOW_REASONS = true;
const AUTOPLAY = true;

export class App extends React.Component<{}, S> {
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _uid = 0;
  private _paneRefs: Record<string, HTMLDivElement | null> = {};
  private _chat: HTMLDivElement | null = null;
  private _chatSig = "";
  private claude = new ClaudeProvider();
  private history: Message[] = [];
  private abortCtl: AbortController | null = null;

  state: S = {
    statusKey: "idle", running: false, messages: [], input: "",
    plan: [], tools: [], files: [], docs: freshDocs(), chips: {},
    panes: [TM], leftTab: "flow", expanded: null,
    openMenu: null, projOpen: false,
    agentsOpen: true, reviewOpen: true,
    termOpen: false, termTab: "term",
    agents: this.freshAgents(),
  };

  freshAgents(): Record<string, AgentState> {
    const o: Record<string, AgentState> = {};
    AGDEF.forEach(a => { o[a.id] = { status: "idle", file: null, tin: 0, tout: 0, cost: 0 }; });
    return o;
  }

  agDef(id: string) { return AGDEF.find(a => a.id === id)!; }

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
    this.setState(s => {
      const a = s.agents[id];
      const cost = a.cost + (tin * 3 + tout * 15) / 1e6;
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
    this.abortCtl?.abort();
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
      const panes = s.panes.length < 4 ? [...s.panes, path] : [...s.panes.slice(0, 3), path];
      return { panes } as any;
    });
  }
  closePane(path: string) {
    this.setState(s => s.panes.length > 1 ? { panes: s.panes.filter(p => p !== path) } as any : null);
  }
  send() {
    const t = this.state.input.trim() || "TokenManager에 자동 갱신을 추가하고, 타입과 문서도 같이 맞춰줘";
    // Claude API 키가 설정돼 있으면 실제 모델과 대화, 없으면 오프라인 데모 시나리오
    if (this.claude.isConfigured()) this.runReal(t);
    else this.startRun(t);
  }

  /** 실제 Claude 스트리밍 턴 (텍스트 대화 — 편집 도구 연동은 후속) */
  async runReal(text: string) {
    if (this.state.running) return;
    this.abortCtl = new AbortController();
    this.history.push({ role: "user", content: text });
    const aiId = "a" + (this._uid++);
    this.setState(s => ({
      running: true, statusKey: "thinking", input: "",
      agents: { ...s.agents, claude: { ...s.agents.claude, status: "plan" } },
      messages: [
        ...s.messages,
        { id: "u" + (this._uid++), role: "user" as const, text },
        { id: aiId, role: "ai" as const, who: "Claude · 관리자", text: "", streaming: true },
      ],
    }));

    let full = "";
    try {
      const stream = this.claude.streamChat({
        messages: [{ role: "system", content: SCHUTZ_SYSTEM_PROMPT }, ...this.history],
        signal: this.abortCtl.signal,
      });
      for await (const ev of stream) {
        if (ev.type === "text") {
          full += ev.delta;
          this.setMsg(aiId, { text: full });
        } else if (ev.type === "usage") {
          this.bumpAgent("claude", ev.inputTokens, ev.outputTokens);
        } else if (ev.type === "error") {
          full = full ? full + "\n\n⚠️ " + ev.message : "⚠️ " + ev.message;
          this.setMsg(aiId, { text: full });
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        full += "\n\n⚠️ " + (e instanceof Error ? e.message : String(e));
        this.setMsg(aiId, { text: full });
      }
    } finally {
      if (full) this.history.push({ role: "assistant", content: full });
      this.abortCtl = null;
      this.setMsg(aiId, { streaming: false });
      this.setState(s => ({
        running: false, statusKey: "idle",
        agents: { ...s.agents, claude: { ...s.agents.claude, status: "idle" } },
      }));
    }
  }

  componentDidMount() {
    // StrictMode의 mount→unmount→mount에서도 안전: 언마운트 시 타이머가 정리되고,
    // 타이머 내부의 messages.length 가드가 중복 실행을 막는다.
    if (AUTOPLAY) {
      this.qt(() => { if (this.state.messages.length === 0) this.send(); }, 800);
    }
  }
  componentWillUnmount() { this.clearTimers(); }

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
      const base = /^\|/.test(text) ? "#9AA59C" : "#C4CBC4";
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
      let sign = " ", bg = "transparent", color = "#8B948C", signColor = "transparent";
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
      <div style={{ height: "100vh", minWidth: 1400, display: "flex", flexDirection: "column", background: "#0C0E0D", color: "#D5DAD5", fontFamily: SUIT, fontSize: 13, overflow: "hidden" }}>
        {anyMenuOpen && <div onClick={closeMenus} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}

        {/* ══ Header ══ */}
        <div style={{ flex: "none", height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: "#101312", borderBottom: "1px solid rgba(255,255,255,.06)", position: "relative", zIndex: 50 }}>
          <img src="/assets/logo-t.png" alt="Schutz" style={{ width: 24, height: 24, display: "block" }} />

          {/* project switcher */}
          <div style={{ position: "relative" }}>
            <button className="hv06" onClick={() => this.setState(st => ({ projOpen: !st.projOpen, openMenu: null }))}
              style={{ height: 28, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "#D5DAD5", background: s.projOpen ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 7, cursor: "pointer" }}>
              schutz-core
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8B948C", fontWeight: 400, fontFamily: MONO, background: "rgba(255,255,255,.05)", borderRadius: 4, padding: "2px 7px 2px 5px" }}>
                <GitBranchIcon />feature/token-refresh
              </span>
              <span style={{ fontSize: 8, color: "#5A635C" }}>▾</span>
            </button>
            {s.projOpen && (
              <div style={{ position: "absolute", top: 33, left: 0, width: 250, background: "#181C1A", border: "1px solid #2A302C", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.55)", padding: 6, zIndex: 100 }}>
                <div style={{ padding: "4px 8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#5A635C" }}>프로젝트</div>
                {PROJECTS.map(pj => (
                  <div key={pj.key} className="hv05" onClick={closeMenus} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}>
                    <span style={{ flex: "none", width: 20, height: 20, borderRadius: 5, background: pj.hue, color: "#0C0E0D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{pj.init}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#D5DAD5" }}>{pj.name}</div>
                      <div style={{ fontSize: 10, color: "#5A635C", fontFamily: MONO }}>{pj.path}</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    {pj.current && <span style={{ fontSize: 11, color: "#8FA893" }}>✓</span>}
                  </div>
                ))}
                <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "5px 6px" }} />
                <div className="hv05" onClick={closeMenus} style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#9AA59C" }}>
                  프로젝트 열기…<div style={{ flex: 1 }} /><span style={{ fontSize: 10.5, color: "#5A635C", fontFamily: MONO }}>⇧⌘O</span>
                </div>
              </div>
            )}
          </div>

          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,.07)" }} />

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
                    style={{ height: 26, padding: "0 10px", fontFamily: "inherit", fontSize: 12, color: open ? "#D5DAD5" : "#8B948C", background: open ? "rgba(255,255,255,.07)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer" }}>
                    {label}
                  </button>
                  {open && (
                    <div style={{ position: "absolute", top: 29, left: 0, minWidth: 215, background: "#181C1A", border: "1px solid #2A302C", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.55)", padding: 5, zIndex: 100 }}>
                      {items.map((it, i) => it === null
                        ? <div key={"s" + i} style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "4px 6px" }} />
                        : (
                          <div key={"i" + i} className="hvMenuItem" onClick={() => this.setState({ openMenu: null })} style={{ display: "flex", alignItems: "center", gap: 18, padding: "5px 10px", borderRadius: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <span style={{ color: "#C4CBC4" }}>{it[0]}</span>
                            <div style={{ flex: 1 }} />
                            <span style={{ color: "#5A635C", fontSize: 10.5, fontFamily: MONO }}>{it[1]}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />
          <button className="hv07" title="어디서나 검색 (⇧⇧)" style={iconBtn}><SearchIcon /></button>
          <button className="hv07" title="실행 (⌃R)" style={iconBtn}><PlayIcon /></button>
          <button className="hv07" title="디버그 (⌃D)" style={iconBtn}><DebugIcon /></button>
          <button className="hv07" title="알림" style={{ ...iconBtn, position: "relative" }}><BellIcon /></button>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,.08)" }} />
          <span style={{ fontSize: 12, color: "#8B948C", whiteSpace: "nowrap" }}>{statusLabel}</span>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,.08)" }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#5A635C", whiteSpace: "nowrap" }}>Σ 입력 {totIn.toLocaleString()} · 출력 {totOut.toLocaleString()} · {costText}</span>
        </div>

        {/* progress beam */}
        <div style={{ flex: "none", height: 2.5, background: "#141715" }}>
          <div style={{ height: "100%", width: beamW, opacity: beamOp, background: "linear-gradient(90deg,#4D5D53,#7D9183,#A9BCA9)", transition: "width .5s ease,opacity .8s ease" }} />
        </div>

        {/* ══ Main ══ */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

          {/* tool rail */}
          <div style={{ flex: "none", width: 42, background: "#101312", borderRight: "1px solid rgba(255,255,255,.06)", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 4 }}>
            <button className="hv07" title="프로젝트" onClick={() => this.setState({ leftTab: "tree" })} style={{ ...railBtn, background: !flow ? "rgba(143,168,147,.16)" : "transparent" }}>
              <FolderIcon color={!flow ? "#A9BCA9" : "#6E776F"} />
            </button>
            <button className="hv07" title="작업 흐름" onClick={() => this.setState({ leftTab: "flow" })} style={{ ...railBtn, background: flow ? "rgba(143,168,147,.16)" : "transparent" }}>
              <FlowIcon color={flow ? "#A9BCA9" : "#6E776F"} />
            </button>
            <div style={{ width: 22, height: 1, background: "rgba(255,255,255,.07)", margin: "4px 0" }} />
            <button className="hv07" title="버전 관리" style={railBtn}><VcsIcon /></button>
            <button className="hv07" title="터미널" onClick={() => this.setState(st => ({ termOpen: !st.termOpen }))} style={{ ...railBtn, background: s.termOpen ? "rgba(143,168,147,.16)" : "transparent" }}>
              <TermIcon />
            </button>
            <div style={{ flex: 1 }} />
            <button className="hv07" title="설정" style={railBtn}><GearIcon /></button>
          </div>

          {/* ── Left column ── */}
          <div style={{ flex: "none", width: 272, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,.06)", background: "#101312" }}>
            <div style={{ flex: "none", padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, color: "#5A635C" }}>{flow ? "작업 흐름" : "프로젝트"}</div>

            {flow ? this.renderFlow() : this.renderTree()}
            {this.renderChat()}
          </div>

          {/* ── Editor grid ── */}
          <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1, background: "rgba(255,255,255,.07)" }}>
            {this.renderPanes()}
          </div>

          {/* ── Right column ── */}
          <div style={{ flex: "none", width: 336, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,.06)", background: "#101312" }}>
            {this.renderAgents()}
            {this.renderReview()}
          </div>
        </div>

        {/* ══ Terminal dock ══ */}
        {s.termOpen && this.renderTerm()}

        {/* ══ Status bar ══ */}
        <div style={{ flex: "none", height: 25, display: "flex", alignItems: "center", gap: 13, padding: "0 12px", background: "#101312", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "#5A635C" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10.5, color: "#8B948C" }}>
            <GitBranchIcon size={10} sw={1.6} />feature/token-refresh
          </span>
          <span style={{ color: "#8BB292" }}>✓ 문제 없음</span>
          <span style={{ color: pendingFiles > 0 ? "#CCB491" : "#5A635C" }}>{pendingFiles > 0 ? "검토 대기 " + pendingFiles + "개 파일" : "변경 없음"}</span>
          <div style={{ flex: 1 }} />
          <span>에이전트 {AGDEF.filter(d => ["edit", "plan"].includes(s.agents[d.id].status)).length + "/" + AGDEF.length + " 활성"}</span>
          <span style={{ fontFamily: MONO }}>{costText}</span>
          <span style={{ width: 1, height: 13, background: "rgba(255,255,255,.07)" }} />
          <span style={{ fontFamily: MONO }}>Ln 24:5</span>
          <span style={{ fontFamily: MONO }}>UTF-8 · LF · TypeScript</span>
          <button className="hv08" onClick={() => this.setState(st => ({ termOpen: !st.termOpen }))}
            style={{ height: 19, padding: "0 8px", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: s.termOpen ? "#A9BCA9" : "#5A635C", background: s.termOpen ? "rgba(143,168,147,.14)" : "transparent", border: "none" }}>
            <TermStatusIcon />터미널
          </button>
        </div>
      </div>
    );
  }

  // ── 좌 패널: 작업 흐름 ──
  renderFlow() {
    const s = this.state;
    const planIcon: Record<string, [string, string]> = { pending: ["○", "#4B534D"], done: ["✓", "#8BB292"], stopped: ["–", "#C97B7B"] };
    return (
      <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 14px 14px", position: "relative", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ position: "absolute", left: 21, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#3B463F,#7D9183,#3B463F)", opacity: .4 }} />
        {s.plan.length === 0 && (
          <div style={{ position: "relative", paddingLeft: 22, fontSize: 12, color: "#4B534D", marginTop: 8 }}>요청을 보내면 계획과 실행 과정이 이곳에 기록됩니다.</div>
        )}
        {s.plan.length > 0 && (
          <div style={{ position: "relative", marginTop: 6 }}>
            <span style={{ position: "absolute", left: 4, top: 8, width: 8, height: 8, borderRadius: "50%", background: "#8FA893" }} />
            <div style={{ marginLeft: 22, background: "#151917", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "#5A635C" }}>계획</span>
                <span style={{ fontSize: 10, color: "#8FA893", background: "rgba(143,168,147,.1)", borderRadius: 3, padding: "0 6px", lineHeight: "15px" }}>Claude · 관리자</span>
              </div>
              {s.plan.map(p => {
                const [icon, iconColor] = planIcon[p.st] || ["○", "#4B534D"];
                const d = this.agDef(p.agent);
                const labelColor = p.st === "done" ? "#535B55" : p.st === "active" ? "#D5DAD5" : p.st === "stopped" ? "#B98A8A" : "#8B948C";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2.5px 0" }}>
                    <span style={{ flex: "none", width: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.st === "active"
                        ? <span style={spinner("#8FA893", "rgba(143,168,147,.25)")} />
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
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#9AA59C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.path.split("/").pop()}</span>
                <div style={{ flex: 1 }} />
                {t.st === "run"
                  ? <span style={{ ...spinner("#8FA893", "rgba(143,168,147,.25)"), flex: "none" }} />
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
    const lockOf = (path: string) => AGDEF.find(d => s.agents[d.id].file === path);
    const pendOf = (path: string) => s.files.find(f => f.path === path && f.status === "pending");
    const fileRow = (path: string, name: string, pad: number) => {
      const lock = lockOf(path);
      const pend = pendOf(path);
      const inPane = s.panes.includes(path);
      return (
        <div key={path} className="hv04" onClick={() => this.openFile(path)}
          style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "pointer", background: inPane ? "rgba(125,145,131,.08)" : "transparent" }}>
          <span style={{ flex: "none", fontSize: 9, color: "#5A635C", width: 8 }}></span>
          <span style={{ fontSize: 12, fontFamily: MONO, color: inPane ? "#D5DAD5" : "#9AA59C", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
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
        <span style={{ flex: "none", fontSize: 9, color: "#5A635C", width: 8 }}>▾</span>
        <span style={{ fontSize: 12, color: "#8B948C" }}>{name}</span>
      </div>
    );
    const plainRow = (key: string, name: string, pad: number) => (
      <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, height: 24, padding: `0 16px 0 ${pad}px`, cursor: "default" }}>
        <span style={{ flex: "none", fontSize: 9, width: 8 }}></span>
        <span style={{ fontSize: 12, fontFamily: MONO, color: "#6E776F" }}>{name}</span>
      </div>
    );
    return (
      <div style={{ flex: 1.15, minHeight: 0, overflowY: "auto", padding: "2px 0 14px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ padding: "4px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "#5A635C" }}>SCHUTZ-CORE</div>
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
        <div style={{ flex: "none", height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5A635C" }}>
          대화
          <div style={{ flex: 1 }} />
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
              <span style={{ flex: "none", width: 11, fontSize: 9, lineHeight: 2, color: m.role === "user" ? "#8FA893" : "transparent" }}>{m.role === "user" ? "◆" : ""}</span>
              <div style={{ minWidth: 0 }}>
                {m.role === "ai" && m.who && <div style={{ fontSize: 10, color: "#8FA893", marginBottom: 2 }}>{m.who}</div>}
                <div style={{ fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", color: m.role === "user" ? "#E0E5E0" : "#8B948C", fontWeight: m.role === "user" ? 500 : 400, fontFamily: SUIT }}>
                  {m.text}
                  {m.streaming && <span style={{ display: "inline-block", width: 2, height: 12, marginLeft: 2, background: "#8FA893", verticalAlign: -1, animation: "szBlink 1s steps(1) infinite" }} />}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, padding: 1.5, borderRadius: 10, background: s.running ? "linear-gradient(90deg,#4D5D53,#8FA893,#4D5D53)" : "rgba(255,255,255,.1)", transition: "background .4s ease" }}>
            <input value={s.input}
              onChange={e => this.setState({ input: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") this.send(); }}
              placeholder="에이전트 팀에게 작업 요청 (Enter)"
              style={{ width: "100%", background: "#0C0E0D", border: "none", borderRadius: 8.5, height: 34, padding: "0 13px", color: "#D5DAD5", fontSize: 12.5, fontFamily: SUIT, outline: "none", display: "block" }} />
          </div>
          <button className="hvAccent" onClick={() => this.send()}
            style={{ height: 37, width: 40, fontSize: 14, fontFamily: "inherit", cursor: "pointer", borderRadius: 9, color: "#0C0E0D", background: "#8FA893", border: "none", fontWeight: 700 }}>↑</button>
        </div>
      </div>
    );
  }

  // ── 에디터 그리드 ──
  renderPanes() {
    const s = this.state;
    const n = s.panes.length;
    const slots: (string | null)[] = [...s.panes];
    while (slots.length < 4) slots.push(null);

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
          <div key={"empty" + si} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "#0E100F" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#3A403C" }}>
              <span style={{ fontSize: 20 }}>▢</span>
              <span style={{ fontSize: 11 }}>빈 편집 창 · 탐색기에서 파일을 열 수 있습니다</span>
            </div>
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
      else { inspText = "✓"; inspColor = "#535B55"; inspBg = "rgba(255,255,255,.04)"; }
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
        <div key={path} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "#0E100F" }}>
          <div style={{ flex: "none", height: 34, display: "flex", alignItems: "center", gap: 9, padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <span style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: this.agentColorFor(path) || "#4B534D" }} />
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#9AA59C", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
            {lock && (
              <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: lock.color, border: `1px solid ${lock.color}50`, borderRadius: 4, padding: "0 6px", lineHeight: "16px" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: lock.color, animation: "szPulse 1.1s ease-in-out infinite" }} />{lock.name} 작업 중
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ flex: "none", display: "flex", alignItems: "center", height: 19, padding: "0 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", color: inspColor, background: inspBg }}>{inspText}</span>
            {n > 1 && (
              <button className="hvDim" onClick={() => this.closePane(path)} style={{ width: 20, height: 20, fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#5A635C", background: "transparent", border: "none" }}>✕</button>
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
                    <div style={{ flex: "none", width: 46, textAlign: "right", paddingRight: 10, fontSize: 10.5, lineHeight: "20px", color: l.kind === "base" ? "#3A403C" : "#8B948C", userSelect: "none" }}>{removed ? "" : String(num)}</div>
                    <div style={{ flex: "none", width: 2.5, borderRadius: 2, alignSelf: "stretch", margin: "1px 0", background: barColor }} />
                    <div style={{ paddingLeft: 14, whiteSpace: "pre", lineHeight: "20px", fontSize: 12, color: "#C4CBC4", textDecoration: removed ? "line-through" : "none", opacity: removed ? 0.5 : 1 }}>
                      {this.hl(l.text, isMd)}
                      {l.kind === "typing" && <span style={{ display: "inline-block", width: 2, height: 13, marginLeft: 1, background: agColor, verticalAlign: -2, animation: "szBlink 1s steps(1) infinite" }} />}
                      {chip && (
                        <span style={{ marginLeft: 14, fontFamily: SUIT, fontSize: 10, color: "#93A896", background: "rgba(125,145,131,.12)", borderRadius: 3, padding: "1px 6px", opacity: chip.op, transition: "opacity .9s ease", whiteSpace: "nowrap", verticalAlign: 1 }}>{chip.text}</span>
                      )}
                    </div>
                    {actions && (
                      <div style={{ position: "absolute", right: 14, top: -26, display: "flex", alignItems: "center", gap: 2, zIndex: 8, fontFamily: SUIT, background: "#181C1A", border: "1px solid #2A302C", borderRadius: 8, padding: "2px 3px", boxShadow: "0 5px 16px rgba(0,0,0,.5)" }}>
                        <button className="hvGreen" onClick={() => this.resolveHunk(path, hk, true)} style={{ height: 21, padding: "0 8px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#9DC4A3", background: "transparent", border: "none" }}>✓ 수락</button>
                        <div style={{ width: 1, height: 12, background: "rgba(255,255,255,.1)" }} />
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
    const astMap: Record<string, [string, string]> = { idle: ["대기", "#5A635C"], plan: ["계획 수립 중", "#A3B5A6"], edit: ["작업 중", "#A3B5A6"], review: ["완료 · 검토 대기", "#C4A882"], stop: ["중지됨", "#C98A8A"] };
    return (
      <div style={{ flex: "none", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="hvHead" onClick={() => this.setState(st => ({ agentsOpen: !st.agentsOpen }))}
          style={{ height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5A635C", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 8.5, width: 10 }}>{s.agentsOpen ? "▾" : "▸"}</span>에이전트
          <span style={{ fontSize: 10.5, fontWeight: 400, letterSpacing: 0, color: "#4B534D" }}>{s.agentsOpen ? "동시 작업 · 파일 락 격리" : ""}</span>
        </div>
        {s.agentsOpen && (
          <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {AGDEF.map(d => {
              const a = s.agents[d.id];
              const [stText, stColor] = astMap[a.status];
              return (
                <div key={d.id} style={{ background: "#151917", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "9px 12px", borderLeft: `3px solid ${d.color}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#D5DAD5" }}>{d.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "#8B948C", background: "rgba(255,255,255,.05)", borderRadius: 3, padding: "0 5px", lineHeight: "15px" }}>{d.model}</span>
                    {d.mgr && <span style={{ fontSize: 9.5, color: "#0C0E0D", background: d.color, borderRadius: 3, padding: "0 5px", lineHeight: "15px", fontWeight: 700 }}>관리자</span>}
                    <div style={{ flex: 1 }} />
                    {(a.status === "edit" || a.status === "plan") && <span style={{ ...spinner(d.color, d.color + "40"), flex: "none" }} />}
                    <span style={{ fontSize: 10.5, whiteSpace: "nowrap", color: stColor }}>{stText}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: a.file ? d.color : "#3A403C", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file ?? "—"}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "#5A635C", whiteSpace: "nowrap" }}>↓{a.tin.toLocaleString()} ↑{a.tout.toLocaleString()} · <span style={{ color: "#8B948C" }}>${a.cost.toFixed(3)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── 우 패널: 변경 검토 ──
  renderReview() {
    const s = this.state;
    const fstMap: Record<string, [string, string]> = { pending: ["검토 대기", "#C4A882"], accepted: ["수락됨", "#8BB292"], rejected: ["거절됨", "#C97B7B"] };
    const pendingFiles = s.files.filter(f => f.status === "pending").length;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div onClick={() => this.setState(st => ({ reviewOpen: !st.reviewOpen }))}
          style={{ flex: "none", height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: 8.5, width: 10, color: "#5A635C" }}>{s.reviewOpen ? "▾" : "▸"}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5A635C" }}>변경 검토</span>
          {s.files.length > 0 && <span style={{ fontSize: 10.5, color: "#8B948C", background: "rgba(255,255,255,.06)", borderRadius: 8, padding: "0 7px", lineHeight: "16px" }}>{s.files.length}</span>}
        </div>
        {s.reviewOpen && (
          <div style={{ flex: 1, overflowY: "auto", padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {s.files.length === 0 && <div style={{ fontSize: 12, color: "#4B534D", padding: "6px 2px" }}>검토할 변경이 없습니다.</div>}
            {pendingFiles > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="hvAccent" onClick={() => this.resolveAll(true)} style={{ flex: 1, height: 30, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#0C0E0D", background: "#8FA893", border: "none" }}>모두 수락</button>
                <button className="hv05" onClick={() => this.resolveAll(false)} style={{ flex: 1, height: 30, fontSize: 12, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, color: "#9AA59C", background: "transparent", border: "1px solid rgba(255,255,255,.14)" }}>모두 거절</button>
              </div>
            )}
            {s.files.map(f => {
              const [sl, sc] = fstMap[f.status];
              const d = this.agDef(f.agent);
              const seg = f.path.split("/"); const name = seg.pop();
              const tot = Math.max(f.add + f.del, 1);
              const expanded = s.expanded === f.path;
              return (
                <div key={f.path} style={{ position: "relative", background: "#151917", border: `1px solid ${expanded ? d.color + "60" : "rgba(255,255,255,.07)"}`, borderRadius: 10, overflow: "hidden" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: d.color, zIndex: 2 }} />
                  <div className="hv02" onClick={() => this.setState(st => ({ expanded: st.expanded === f.path ? null : f.path }))} style={{ padding: "11px 13px 11px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontSize: 9, color: "#5A635C" }}>{expanded ? "▾" : "▸"}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#D5DAD5", whiteSpace: "nowrap" }}>{name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#4B534D", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seg.join("/") + "/"}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ flex: "none", fontSize: 9.5, color: d.color, border: `1px solid ${d.color}50`, borderRadius: 3, padding: "0 5px", lineHeight: "14px" }}>{d.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#8BB292" }}>+{f.add}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#C97B7B" }}>−{f.del}</span>
                      <div style={{ flex: 1, display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden" }}>
                        <span style={{ height: "100%", background: "#8BB292", opacity: .75, width: Math.round((f.add / tot) * 60) + "%" }} />
                        <span style={{ height: "100%", background: "#C97B7B", opacity: .75, width: Math.round((f.del / tot) * 60) + "%" }} />
                        <span style={{ height: "100%", background: "rgba(255,255,255,.07)", flex: 1 }} />
                      </div>
                      <span style={{ fontSize: 10.5, whiteSpace: "nowrap", color: sc }}>{sl}</span>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", background: "#0E100F", maxHeight: 300, overflow: "auto" }}>
                      {this.diffRows(f.path).map(dd => dd.sep
                        ? <div key={dd.key} style={{ fontFamily: MONO, fontSize: 10, lineHeight: "18px", color: "#4B534D", background: "#12151340", textAlign: "center", borderTop: "1px solid rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>· · ·</div>
                        : (
                          <div key={dd.key} style={{ display: "flex", fontFamily: MONO, fontSize: 10.5, lineHeight: "19px", background: dd.bg }}>
                            <span style={{ flex: "none", width: 30, textAlign: "right", paddingRight: 5, color: "#49524B", userSelect: "none" }}>{dd.oldN}</span>
                            <span style={{ flex: "none", width: 30, textAlign: "right", paddingRight: 5, color: "#49524B", userSelect: "none" }}>{dd.newN}</span>
                            <span style={{ flex: "none", width: 14, textAlign: "center", color: dd.signColor, userSelect: "none" }}>{dd.sign}</span>
                            <span style={{ whiteSpace: "pre", color: dd.color }}>{dd.text}</span>
                          </div>
                        ))}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                        <button className="hv05" onClick={e => { e.stopPropagation(); this.openFile(f.path); }} style={{ height: 23, padding: "0 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: "#9AA59C", background: "transparent", border: "1px solid rgba(255,255,255,.12)" }}>에디터에서 열기</button>
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
    const DIM = "#5A635C", TXT = "#C4CBC4", SUB = "#9AA59C", OK = "#8BB292", AC = "#8FA893";
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
      <div style={{ flex: "none", height: 168, display: "flex", flexDirection: "column", background: "#0A0C0B", borderTop: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ flex: "none", height: 32, display: "flex", alignItems: "center", gap: 2, padding: "0 10px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          {tabs.map(([k, label, badge]) => (
            <button key={k} className="hvTermTab" onClick={() => this.setState({ termTab: k, termOpen: true })}
              style={{ height: 24, padding: "0 11px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 6, color: s.termTab === k ? "#D5DAD5" : "#5A635C", background: s.termTab === k ? "rgba(255,255,255,.06)" : "transparent", border: "none" }}>
              {label}
              {badge && <span style={{ fontSize: 9.5, color: "#8B948C", background: "rgba(255,255,255,.07)", borderRadius: 7, padding: "0 5px", lineHeight: "13px" }}>{badge}</span>}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="hvDim" onClick={() => this.setState(st => ({ termOpen: !st.termOpen }))} title="독 접기" style={{ width: 22, height: 22, fontSize: 10, fontFamily: "inherit", cursor: "pointer", borderRadius: 5, color: "#5A635C", background: "transparent", border: "none" }}>⌄</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "9px 16px", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.75 }}>
          {termLines.map(tl => (
            <div key={tl.key} style={{ whiteSpace: "pre-wrap" }}>
              {tl.segs.map((sg, i) => <span key={i} style={{ color: sg.c }}>{sg.t}</span>)}
              {tl.caret && <span style={{ display: "inline-block", width: 7, height: 12, background: "#8FA893", verticalAlign: -1, animation: "szBlink 1s steps(1) infinite" }} />}
            </div>
          ))}
        </div>
      </div>
    );
  }
}

const iconBtn: React.CSSProperties = { width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer" };
const railBtn: React.CSSProperties = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer" };
const spinner = (color: string, track: string): React.CSSProperties => ({ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${track}`, borderTopColor: color, animation: "szSpin .9s linear infinite", display: "block" });
