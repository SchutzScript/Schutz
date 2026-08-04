/** 잔여 할당량 — 벤더별 rate-limit 헤더를 하나로 정규화한 것.
 *  usedPercent 0..100, resetAt 은 epoch 초(모르면 null). */
interface QuotaInfo {
  provider: string;
  plan?: string | null;
  windows: { label: string; usedPercent: number; resetAt: number | null }[];
  at: number;
}

/** 체크포인트 한 개의 요약 — 실행 하나가 무엇을 얼마나 건드렸나.
 *  `restorable` 은 실제로 되돌릴 수 있는 파일 수(oversize·미기록 제외)라 0 이면 버튼이 무의미하다. */
interface CheckpointInfo {
  rootRunId: string;
  startedAt: number;
  /** 아직 도는 실행 — 보관 상한에서 제외된다. */
  open: boolean;
  /** 이 실행을 돌리는 창의 id. 창을 여럿 띄우면 남의 실행을 닫지 않기 위해 필요하다. */
  owner: string;
  /** 주인이 마지막으로 살아 있다고 알린 시각(ms). 0 이면 옛 형식. */
  beatAt: number;
  bytes: number;
  files: number;
  created: number;
  modified: number;
  restorable: number;
}

/** Claude Code 스킬 — SKILL.md 의 머리말. 본문은 필요할 때 skillRead 로 읽는다.
 *  프롬프트 묶음이라 모델을 가리지 않는다(Claude·GPT 동일). */
interface SkillInfo {
  id: string;
  name: string;
  description: string;
  userInvocable: boolean;
  allowedTools: string[];
  source: "user" | "project" | "plugin";
  owner: string | null;
  file: string;
}

/** 커넥터 한 개 — 카탈로그 항목(설치 여부·무엇을 들고 오는지 포함).
 *  타입 이름은 실체(플러그인)를 따르고, 화면에 보이는 말만 "커넥터" 다. */
interface PluginInfo {
  name: string;
  /** 사람이 읽는 이름. 없으면 name(슬러그)을 쓴다. */
  displayName?: string;
  /** 로고 — 저장소 소유자의 GitHub 아바타. 못 뽑으면 빈 문자열(화면에서 모노그램). */
  iconUrl?: string;
  description: string;
  author?: string;
  category?: string;
  homepage?: string;
  marketplace?: string;
  marketplaceOwner?: string;
  version?: string;
  dir?: string;
  installed: boolean;
  enabled: boolean;
  skills: number;
  commands: number;
  /** 이 커넥터가 들고 오는 서브에이전트 수 */
  agents?: number;
  mcp: boolean;
  /** Schutz 가 직접 받은 것 — 지울 수 있다 */
  own?: boolean;
  /** 아직 없지만 카탈로그에서 받아올 수 있다 */
  canInstall?: boolean;
}

/** MCP 서버가 노출하는 도구 (tools/list 결과) */
/** 서버가 내주는 읽을거리 — 파일·문서·DB 스키마 같은 것. */
interface McpResource { uri: string; name?: string; description?: string; mimeType?: string }
/** 서버가 내주는 프롬프트 템플릿. */
interface McpPrompt { name: string; description?: string; arguments?: { name: string; description?: string; required?: boolean }[] }

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

/** Electron preload가 노출하는 파일 시스템 API (브라우저에서는 undefined) */
interface SchutzTreeEntry {
  rel: string;
  name: string;
  dir: boolean;
  depth: number;
}

interface SchutzWorkspaceTree {
  root: string;
  name: string;
  entries: SchutzTreeEntry[];
  branch?: string | null;
  truncated: boolean;
}

interface SchutzApi {
  openFolder(): Promise<string | null>;
  readTree(root: string): Promise<SchutzWorkspaceTree>;
  readFile(root: string, rel: string): Promise<string>;
  writeFile(root: string, rel: string, content: string): Promise<boolean>;
  searchFiles(root: string, query: string, opts?: { max?: number; include?: string; exclude?: string; regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }): Promise<{ hits: { rel: string; line: number; col: number; preview: string }[]; truncated: boolean; error?: string }>;
  git(root: string, action: string, payload?: any): Promise<any>;
  httpGet(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number; json?: any; error?: string }>;
  lspLanguages(): Promise<string[]>;
  lspStart(languageId: string, root: string): Promise<{ ok: boolean; serverId?: string; reason?: string }>;
  lspSend(serverId: string, message: any): void;
  lspStop(serverId: string): void;
  onLspMessage(cb: (serverId: string, message: any) => void): () => void;
  onLspLog(cb: (serverId: string, log: string) => void): () => void;
  onLspExit(cb: (serverId: string, code: number) => void): () => void;
  dapLanguages(): Promise<{ languageId: string; available: boolean; reason: string }[]>;
  dapStart(languageId: string): Promise<{ ok: boolean; sessionId?: string; reason?: string }>;
  dapSend(sessionId: string, message: any): void;
  dapStop(sessionId: string): void;
  onDapMessage(cb: (sessionId: string, message: any) => void): () => void;
  onDapLog(cb: (sessionId: string, log: string) => void): () => void;
  onDapExit(cb: (sessionId: string, code: number) => void): () => void;
  extList(): Promise<{ kind: "schutz" | "vscode"; id: string; name: string; version: string; description: string; main?: string; contributes: any; dir: string; enabled: boolean; programmatic: boolean; engines?: any }[]>;
  extReadEntry(id: string, main: string): Promise<string | { error: string }>;
  extReadFile(id: string, relPath: string): Promise<string | { error: string }>;
  extReadFileBase64(id: string, relPath: string): Promise<string | { error: string }>;
  extSetEnabled(id: string, enabled: boolean): Promise<{ ok: boolean }>;
  extOpenDir(): Promise<{ ok: boolean }>;
  openVsxSearch(query: string): Promise<{ ok: boolean; error?: string; extensions?: { namespace: string; name: string; version: string; displayName: string; description: string; downloadCount: number; rating: number; icon: string }[] }>;
  openVsxDetail(namespace: string, name: string): Promise<{ ok: boolean; error?: string; detail?: any }>;
  vsixInstallOpenVsx(namespace: string, name: string): Promise<{ ok: boolean; error?: string; id?: string; name?: string }>;
  vsixInstallFile(filePath: string): Promise<{ ok: boolean; error?: string; id?: string; name?: string }>;
  termStart(cwd: string | undefined, id: string, cols?: number, rows?: number): void;
  termInput(data: string, id: string): void;
  termResize(id: string, cols: number, rows: number): void;
  ptyReal(): Promise<boolean>;
  termKill(id: string): void;
  termReconcile(ids: string[]): void;
  onTermData(cb: (id: string, data: string) => void): () => void;
  newWindow(): void;
  setOverlay(color: string, symbolColor: string): void;
  setAppIcon(dataUrl: string): void;
  renameEntry(root: string, relFrom: string, relTo: string): Promise<boolean>;
  /** trashed=false 면 휴지통을 못 써서 영구 삭제된 것 — 호출측이 사용자에게 구분해 알린다 */
  deleteEntry(root: string, rel: string): Promise<{ ok: boolean; trashed: boolean; reason?: string }>;
  readBinary(root: string, rel: string): Promise<string>;
  watchStart(root: string): void;
  watchStop(): void;
  onFsChange(cb: () => void): () => void;
  mkdir(root: string, rel: string): Promise<boolean>;
  /** 체크포인트 — 한 실행이 손댄 파일의 원본 바이트를 메인에 잡아 두고 통째로 되돌린다.
   *  해시는 전부 메인이 계산한다. 무엇을 되돌릴지는 engine/checkpoints.ts 가 정한다. */
  cpCapture(root: string, runId: string, rel: string, kind: "modify" | "create", startedAt: number, ownerId: string):
    Promise<{ beforeHash: string | null; oversize: boolean; first: boolean }>;
  cpMark(root: string, runId: string, rel: string): Promise<{ afterHash: string | null }>;
  /** 실행 종료 — 헤더 목록을 돌려준다. 보관 상한은 렌더러(pruneCheckpoints)가 적용한다. */
  cpClose(root: string, runId: string): Promise<CheckpointInfo[]>;
  cpList(root: string): Promise<CheckpointInfo[]>;
  cpProbe(root: string, runId: string): Promise<{
    entries: { rel: string; kind: "modify" | "create"; beforeHash: string | null; afterHash: string | null; oversize: boolean }[];
    disk: [string, { exists: boolean; hash: string | null }][];
    startedAt: number;
  } | null>;
  cpRestore(root: string, runId: string, actions: { rel: string; action: "restore" | "delete" }[]):
    Promise<{ done: string[]; failed: { rel: string; why: string }[] }>;
  /** 실행 도구가 PATH 에 있는가. 없으면 { ok: false }. */
  whichTool(name: string): Promise<{ ok: boolean; path?: string }>;
  tmpDir(): Promise<string>;
  cpBeat(root: string, runId: string): Promise<boolean>;
  cpDrop(root: string, runId: string): Promise<boolean>;
  /** 끌어다 놓은 File 의 실제 경로 (Electron 32+ 에서 File.path 가 사라졌다). 못 얻으면 "" */
  pathForFile(file: File): string;
  /** 서브에이전트 목록 — `agents/*.md`. 지침 본문까지 함께 온다(위임 즉시 필요하고 파일이 작다). */
  agentsList(root: string | null): Promise<{
    ok: boolean;
    agents: {
      id: string; name: string; description: string; tools: string[]; model: string;
      prompt: string; source: "user" | "project" | "plugin"; owner: string | null; file: string;
    }[];
    error?: string;
  }>;
  /** 파일 고르기 대화상자. 취소하면 null. */
  mcpbPick(): Promise<string | null>;
  /** MCP 번들(.mcpb/.dxt) — 풀어 보기. 아직 등록하지 않는다.
   *  매니페스트는 **원문 그대로** 온다 — 해석은 engine/mcpb.ts 한 군데서만 한다. */
  mcpbOpen(filePath: string): Promise<{ ok: boolean; manifest?: unknown; bytes?: number; error?: string }>;
  /** 확정 — 임시 폴더를 제 이름으로 옮긴다. 그 경로가 `${__dirname}` 이 된다. */
  mcpbCommit(name: string): Promise<{ ok: boolean; dir?: string; error?: string }>;
  mcpbDiscard(): Promise<{ ok: boolean }>;
  mcpbList(): Promise<string[]>;
  mcpbRemove(name: string): Promise<{ ok: boolean; error?: string }>;
  /** 첫 실행 데모용 샘플 프로젝트를 만들고 루트 경로를 돌려준다. 경로는 메인이 정한다. */
  demoProject(): Promise<string>;
  reveal(root: string, rel: string): Promise<boolean>;
  /** 에이전트 셸 명령 실행 — 워크스페이스 안에서, 타임아웃·출력 상한 있음 */
  runCommand(opts: { id?: string; command: string; cwd: string; background?: boolean }):
    Promise<{
      ok: boolean; error?: string; exitCode?: number | null; timedOut?: boolean;
      output?: string; truncated?: boolean;
      /** background:true 일 때만 — 감지한 접속 주소와 조기 종료 여부 */
      url?: string | null; background?: boolean; exitedEarly?: boolean;
    }>;
  runStop(id: string): void;
  onRunOutput(cb: (line: string) => void): () => void;

  /** 잔여 할당량 — 구독 경로는 금액이 늘 $0 이라 사용률로 보여준다 */
  quotaProbe(opts: { provider: string; access: string; accountId?: string | null; model?: string }):
    Promise<{ ok: boolean; quota?: QuotaInfo; error?: string }>;
  onQuota(cb: (line: string) => void): () => void;

  /** error=정규식 거부 등으로 아무것도 안 함 · partial=도중 실패해 일부만 적용됨 */
  replaceInFiles(root: string, query: string, replacement: string, opts?: any): Promise<{ changed: number; files: number; error?: string; partial?: boolean }>;
  cliCheck(): Promise<{ agents: Record<string, { ok: boolean; version: string; hasConfig: boolean }> }>;
  agentCommands(root: string | null): Promise<{ commands: { name: string; origin: "claude" | "codex"; scope: "user" | "project"; description: string; argHint: string; body: string }[] }>;
  cliChatCounts(): Promise<{ counts: Record<string, number> }>;
  cliChatList(agent: string, headBytes: number): Promise<{ rows: { agent: string; file: string; head: string; bytes: number; updatedAt: number }[] }>;
  cliChatRead(agent: string, file: string, tailBytes: number): Promise<{ text?: string; bytes?: number; partial?: boolean; error?: string }>;
  mcpList(): Promise<{ name: string; command: string; args: string[]; running: boolean; tools: number; remote?: boolean; resources?: number; prompts?: number; protocolVersion?: string | null; serverName?: string }[]>;
  mcpStart(name: string): Promise<{ ok: boolean; tools?: McpTool[]; resources?: McpResource[]; prompts?: McpPrompt[]; protocolVersion?: string; info?: { name?: string; version?: string } | null; reason?: string }>;
  mcpStop(name: string): Promise<{ ok: boolean }>;
  mcpTools(name: string): Promise<McpTool[]>;
  /** MCP 의 나머지 두 기둥. 예전엔 도구만 읽어서, 리소스를 노출하는 서버는 붙여도 빈 칸이었다. */
  mcpResources(name: string): Promise<McpResource[]>;
  mcpPrompts(name: string): Promise<McpPrompt[]>;
  /** 협상된 개정판과 서버가 스스로 밝힌 이름 — 무엇에 붙었는지 말할 수 있게. */
  mcpInfo(name: string): Promise<{ protocolVersion: string | null; info: { name?: string; version?: string } | null; caps: Record<string, unknown> } | null>;
  mcpReadResource(name: string, uri: string): Promise<{ ok: boolean; result?: any; error?: string }>;
  mcpGetPrompt(name: string, promptName: string, args?: Record<string, unknown>): Promise<{ ok: boolean; result?: any; error?: string }>;
  mcpAllTools(): Promise<(McpTool & { server: string })[]>;
  mcpCall(name: string, tool: string, args: any): Promise<{ ok: boolean; result?: any; error?: string }>;
  mcpAdd(name: string, cfg: { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; url?: string; headers?: Record<string, string>; overwrite?: boolean }): Promise<{ ok: boolean; error?: string }>;
  mcpRemove(name: string): Promise<{ ok: boolean }>;
  mcpDiscover(root: string | null): Promise<{ name: string; source: string; command: string; args: string[]; env: Record<string, string>; url: string | null; added: boolean }[]>;
  cliHelp(cmd: string): Promise<{ ok: boolean; text?: string; error?: string }>;
  mcpFetchSpec(url: string): Promise<{ ok: boolean; text?: string; status?: number; error?: string }>;
  mcpWriteServer(name: string, code: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  /** Claude Code 스킬(SKILL.md) 목록 — 사용자·프로젝트·켜둔 플러그인. 본문은 뺀다. */
  skillsList(root: string | null): Promise<{ ok: boolean; error?: string; skills: SkillInfo[] }>;
  /** 스킬 본문 — 모델이 고른 것만 이때 읽는다(프롬프트 비대화 방지). */
  skillRead(file: string): Promise<{ ok: boolean; error?: string; name?: string; body?: string }>;
  /** 커넥터 목록 — 카탈로그 + 설치·활성 상태 */
  pluginList(): Promise<{ ok: boolean; error?: string; plugins: PluginInfo[] }>;
  pluginSetEnabled(name: string, on: boolean): Promise<{ ok: boolean; error?: string }>;
  /** 카탈로그에서 직접 받아 설치한다(git clone). Schutz 몫의 디렉터리에 둔다. */
  pluginInstall(name: string): Promise<{ ok: boolean; error?: string; dir?: string; already?: boolean }>;
  pluginUninstall(name: string): Promise<{ ok: boolean; error?: string }>;
  /** 게임 엔진 MCP 를 GitHub 에서 clone → build 하여 설치한다. entryPath 를 mcpAdd 로 등록한다. */
  engineInstall(spec: { id: string; repo: string; build: string[]; entry: string }): Promise<{ ok: boolean; entryPath?: string; cached?: boolean; error?: string }>;
  /** 이미 설치돼 있으면 진입 파일 절대경로, 아니면 null. */
  engineInstalledPath(spec: { id: string; entry: string }): Promise<string | null>;
  /** 설치 진행 로그 구독. 해제 함수를 반환한다. */
  onEngineInstallProgress(cb: (d: { id: string; phase: string; line: string }) => void): () => void;
  /** 외부 브라우저로 URL 열기(http/https 만 허용) */
  openExternal(url: string): Promise<{ ok: boolean }>;
  /** Codex Cloud 위임 — 로컬 codex CLI 로 원격 태스크 dispatch/list/status/apply/stop.
   *  실패 시 reason 으로 "not-installed" | "auth-missing" | "env-not-configured" 를 돌려준다. */
  codexCloud(action: "dispatch", payload: { prompt: string; env?: string; cwd?: string }): Promise<{ ok: boolean; id?: string; task?: any; raw?: string; reason?: string | null; error?: string; timedOut?: boolean }>;
  codexCloud(action: "list", payload?: {}): Promise<{ ok: boolean; remote: any[]; local: any[]; reason?: string | null }>;
  codexCloud(action: "status", payload: { id: string }): Promise<{ ok: boolean; state?: string; text?: string; reason?: string | null; error?: string }>;
  codexCloud(action: "apply", payload: { id: string; cwd?: string }): Promise<{ ok: boolean; output?: string; reason?: string | null; error?: string }>;
  codexCloud(action: "stop", payload?: { id?: string }): Promise<{ ok: boolean; killed?: number }>;
  codexCloud(action: "forget", payload: { id: string }): Promise<{ ok: boolean }>;
  cliLogin(id: string): void;
  cliRun(opts: { agent?: string; cwd?: string; prompt: string; resume?: string; continue?: boolean }): void;
  cliStop(): void;
  onCliEvent(cb: (line: string) => void): () => void;
  oauthStart(id: string): Promise<{ ok: boolean; mode?: string; message?: string }>;
  oauthExchange(id: string, code: string): Promise<{ ok: boolean; access?: string; refresh?: string | null; exp?: number; message?: string }>;
  oauthRefresh(id: string, refreshToken: string): Promise<{ ok: boolean; access?: string; refresh?: string | null; exp?: number; message?: string }>;
  onOauthResult(cb: (line: string) => void): () => void;
  oaiRun(opts: { id: string; access: string; accountId?: string | null; body: any }): void;
  oaiStop(id: string): void;
  onOaiEvent(cb: (line: string) => void): () => void;
  anthropicRun(opts: { id: string; headers: Record<string, string>; body: any }): void;
  anthropicStop(id: string): void;
  onAnthropicEvent(cb: (line: string) => void): () => void;
}

interface Window {
  schutz?: SchutzApi;
}
