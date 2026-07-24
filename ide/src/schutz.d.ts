/** 잔여 할당량 — 벤더별 rate-limit 헤더를 하나로 정규화한 것.
 *  usedPercent 0..100, resetAt 은 epoch 초(모르면 null). */
interface QuotaInfo {
  provider: string;
  plan?: string | null;
  windows: { label: string; usedPercent: number; resetAt: number | null }[];
  at: number;
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

/** 플러그인 — 창작마당 카탈로그 항목(설치 여부·무엇을 들고 오는지 포함) */
interface PluginInfo {
  name: string;
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
  mcp: boolean;
}

/** MCP 서버가 노출하는 도구 (tools/list 결과) */
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
  searchFiles(root: string, query: string, opts?: { max?: number }): Promise<{ hits: { rel: string; line: number; col: number; preview: string }[]; truncated: boolean }>;
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
  mcpList(): Promise<{ name: string; command: string; args: string[]; running: boolean; tools: number; remote?: boolean }[]>;
  mcpStart(name: string): Promise<{ ok: boolean; tools?: McpTool[]; reason?: string }>;
  mcpStop(name: string): Promise<{ ok: boolean }>;
  mcpTools(name: string): Promise<McpTool[]>;
  mcpAllTools(): Promise<(McpTool & { server: string })[]>;
  mcpCall(name: string, tool: string, args: any): Promise<{ ok: boolean; result?: any; error?: string }>;
  mcpAdd(name: string, cfg: { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; url?: string; headers?: Record<string, string> }): Promise<{ ok: boolean; error?: string }>;
  mcpRemove(name: string): Promise<{ ok: boolean }>;
  mcpDiscover(root: string | null): Promise<{ name: string; source: string; command: string; args: string[]; env: Record<string, string>; url: string | null; added: boolean }[]>;
  cliHelp(cmd: string): Promise<{ ok: boolean; text?: string; error?: string }>;
  mcpFetchSpec(url: string): Promise<{ ok: boolean; text?: string; status?: number; error?: string }>;
  mcpWriteServer(name: string, code: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  /** Claude Code 스킬(SKILL.md) 목록 — 사용자·프로젝트·켜둔 플러그인. 본문은 뺀다. */
  skillsList(root: string | null): Promise<{ ok: boolean; error?: string; skills: SkillInfo[] }>;
  /** 스킬 본문 — 모델이 고른 것만 이때 읽는다(프롬프트 비대화 방지). */
  skillRead(file: string): Promise<{ ok: boolean; error?: string; name?: string; body?: string }>;
  /** 플러그인 창작마당 — 카탈로그 + 설치·활성 상태 */
  pluginList(): Promise<{ ok: boolean; error?: string; plugins: PluginInfo[] }>;
  pluginSetEnabled(name: string, on: boolean): Promise<{ ok: boolean; error?: string }>;
  /** 게임 엔진 MCP 를 GitHub 에서 clone → build 하여 설치한다. entryPath 를 mcpAdd 로 등록한다. */
  engineInstall(spec: { id: string; repo: string; build: string[]; entry: string }): Promise<{ ok: boolean; entryPath?: string; cached?: boolean; error?: string }>;
  /** 이미 설치돼 있으면 진입 파일 절대경로, 아니면 null. */
  engineInstalledPath(spec: { id: string; entry: string }): Promise<string | null>;
  /** 설치 진행 로그 구독. 해제 함수를 반환한다. */
  onEngineInstallProgress(cb: (d: { id: string; phase: string; line: string }) => void): () => void;
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
