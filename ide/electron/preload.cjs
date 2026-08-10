const { contextBridge, ipcRenderer, webUtils } = require("electron");

/**
 * 렌더러에 노출되는 안전한 파일 시스템 API.
 * window.schutz 존재 여부로 렌더러가 Electron/브라우저 모드를 구분한다.
 */
contextBridge.exposeInMainWorld("schutz", {
  /** 폴더 선택 다이얼로그 → 선택한 절대경로 (취소 시 null) */
  openFolder: () => ipcRenderer.invoke("schutz:openFolder"),
  /** 워크스페이스 트리 읽기 → { name, root, entries: [{rel, name, dir, depth}] } */
  readTree: (root) => ipcRenderer.invoke("schutz:readTree", root),
  /** 파일 내용 읽기 (UTF-8) */
  readFile: (root, rel) => ipcRenderer.invoke("schutz:readFile", root, rel),
  /** 파일 저장 (UTF-8) */
  writeFile: (root, rel, content) => ipcRenderer.invoke("schutz:writeFile", root, rel, content),
  /** 프로젝트 전체 텍스트 검색 → { hits: [{rel,line,col,preview}], truncated } */
  searchFiles: (root, query, opts) => ipcRenderer.invoke("schutz:searchFiles", root, query, opts),
  /** Git — action: status|headFile|diffLines|stage|stageAll|unstage|discard|commit|push */
  git: (root, action, payload) => ipcRenderer.invoke("schutz:git", root, action, payload),

  /** 터미널: 셸 시작 (termId별, 이미 있으면 무시) */
  termStart: (cwd, id, cols, rows) => ipcRenderer.send("schutz:termStart", cwd, id, cols, rows),
  /** 터미널에 raw 입력 (PTY면 바이트 그대로) */
  termInput: (data, id) => ipcRenderer.send("schutz:termInput", data, id),
  /** 터미널 리사이즈 (cols/rows) */
  termResize: (id, cols, rows) => ipcRenderer.send("schutz:termResize", id, cols, rows),
  /** 진짜 PTY 사용 가능 여부 */
  ptyReal: () => ipcRenderer.invoke("schutz:ptyReal"),
  /** 터미널 종료 (termId별) */
  termKill: (id) => ipcRenderer.send("schutz:termKill", id),
  /** 렌더러 재로드 후 살아있는 termId 목록을 알려 고아 셸을 정리 (리로드 시 PTY 누수 방지) */
  termReconcile: (ids) => ipcRenderer.send("schutz:termReconcile", ids),
  /** 터미널 출력 구독 → cb(termId, data). 해제 함수 반환 */
  onTermData: (cb) => {
    const h = (_e, id, data) => cb(id, data);
    ipcRenderer.on("schutz:termData", h);
    return () => ipcRenderer.removeListener("schutz:termData", h);
  },

  /** 타이틀바 오버레이 테마 연동 */
  setOverlay: (color, symbolColor) => ipcRenderer.send("schutz:setOverlay", color, symbolColor),
  /** 창·작업표시줄 아이콘을 테마 색으로 갈아끼운다 (렌더러가 만든 PNG 데이터 URL) */
  setAppIcon: (dataUrl) => ipcRenderer.send("schutz:setAppIcon", dataUrl),
  /** 파일/폴더 이름 변경 · 삭제 */
  renameEntry: (root, relFrom, relTo) => ipcRenderer.invoke("schutz:renameEntry", root, relFrom, relTo),
  deleteEntry: (root, rel) => ipcRenderer.invoke("schutz:deleteEntry", root, rel),
  /** 새 폴더 · 탐색기에서 보기 · 파일간 치환 */
  readBinary: (root, rel) => ipcRenderer.invoke("schutz:readBinary", root, rel),
  /** 파일 워처 — 외부 변경 시 콜백 */
  watchStart: (root) => ipcRenderer.send("schutz:watchStart", root),
  watchStop: () => ipcRenderer.send("schutz:watchStop"),
  onFsChange: (cb) => {
    // 바뀐 파일들의 상대 경로를 함께 넘긴다. 예전엔 인자 없이 불러서, 무엇이
    // 움직였는지 아는 쪽(메인)의 정보가 렌더러에 닿지 않았다.
    // overflow=true 면 이 목록이 전부가 아니다(상한에 걸려 이름이 잘렸다).
    // 받는 쪽은 개별 이름 대신 트리 비교로 판정해야 한다.
    const h = (_e, rels, overflow) => cb(Array.isArray(rels) ? rels : [], !!overflow);
    ipcRenderer.on("schutz:fsChange", h);
    return () => ipcRenderer.removeListener("schutz:fsChange", h);
  },
  mkdir: (root, rel) => ipcRenderer.invoke("schutz:mkdir", root, rel),
  /** 체크포인트 — AI 실행 하나가 손댄 파일의 원본을 잡아 두고 통째로 되돌린다.
   *  해시는 전부 메인에서 계산한다(렌더러와 인코딩이 어긋나면 가짜 드리프트가 난다). */
  cpCapture: (root, runId, rel, kind, startedAt, ownerId) => ipcRenderer.invoke("schutz:cp:capture", root, runId, rel, kind, startedAt, ownerId),
  /** 이 실행이 살아 있다는 신호 — 다른 창이 고아 체크포인트로 오인해 닫는 것을 막는다. */
  cpBeat: (root, runId) => ipcRenderer.invoke("schutz:cp:beat", root, runId),
  cpMark: (root, runId, rel) => ipcRenderer.invoke("schutz:cp:mark", root, runId, rel),
  cpClose: (root, runId) => ipcRenderer.invoke("schutz:cp:close", root, runId),
  cpList: (root) => ipcRenderer.invoke("schutz:cp:list", root),
  cpProbe: (root, runId) => ipcRenderer.invoke("schutz:cp:probe", root, runId),
  cpRestore: (root, runId, actions) => ipcRenderer.invoke("schutz:cp:restore", root, runId, actions),
  cpDrop: (root, runId) => ipcRenderer.invoke("schutz:cp:drop", root, runId),
  /** 끌어다 놓은 File 의 실제 경로. Electron 32 부터 File.path 가 사라져서 이게 유일한 길이다
   *  — 없는 걸 쓰면 드롭이 조용히 아무 일도 안 한다. */
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ""; } },
  /** MCP 번들(.mcpb) — 풀어 보기 → 확정 → 목록/삭제. 등록 자체는 mcpAdd 가 한다. */
  mcpbPick: () => ipcRenderer.invoke("schutz:mcpbPick"),
  mcpbOpen: (filePath) => ipcRenderer.invoke("schutz:mcpbOpen", filePath),
  mcpbCommit: (name) => ipcRenderer.invoke("schutz:mcpbCommit", name),
  mcpbDiscard: () => ipcRenderer.invoke("schutz:mcpbDiscard"),
  mcpbList: () => ipcRenderer.invoke("schutz:mcpbList"),
  mcpbRemove: (name) => ipcRenderer.invoke("schutz:mcpbRemove", name),
  // 첫 실행 데모용 샘플 프로젝트를 만들고 그 경로를 돌려준다 (경로는 메인이 정한다)
  demoProject: () => ipcRenderer.invoke("schutz:demoProject"),
  reveal: (root, rel) => ipcRenderer.invoke("schutz:reveal", root, rel),
  replaceInFiles: (root, query, replacement, opts) => ipcRenderer.invoke("schutz:replaceInFiles", root, query, replacement, opts),

  /** 새 IDE 창 (기본 1분할) */
  newWindow: () => ipcRenderer.send("schutz:newWindow"),

  /** 구독 CLI 에이전트 감지 (claude/codex — 계정 인증) */
  cliCheck: () => ipcRenderer.invoke("schutz:cliCheck"),
  /** Claude Code · Codex 커스텀 명령 발견 */
  agentCommands: (root) => ipcRenderer.invoke("schutz:agentCommands", root),

  /** 지난 대화 가져오기 — 파일 수만 센다(내용 안 읽음). 오프닝이 블록을 띄울지 정하는 용도 */
  cliChatCounts: () => ipcRenderer.invoke("schutz:cliChatCounts"),
  /** 목록 — 각 파일 앞부분 headBytes 만. 해석은 src/cliChats.ts 가 한다 */
  cliChatList: (agent, headBytes) => ipcRenderer.invoke("schutz:cliChatList", agent, headBytes),
  /** 열기 — 파일 끝 tailBytes 만 */
  cliChatRead: (agent, file, tailBytes) => ipcRenderer.invoke("schutz:cliChatRead", agent, file, tailBytes),

  /** 외부 브라우저로 URL 열기(http/https 만) */
  openExternal: (url) => ipcRenderer.invoke("schutz:openExternal", url),
  /** Codex Cloud 위임 — 로컬 codex CLI 로 원격 태스크 다루기 */
  codexCloud: (action, payload) => ipcRenderer.invoke("schutz:codexCloud", action, payload),
  /** MCP 호스트 — Schutz가 직접 stdio MCP 서버를 실행/사용 */
  mcpList: () => ipcRenderer.invoke("schutz:mcpList"),
  mcpStart: (name) => ipcRenderer.invoke("schutz:mcpStart", name),
  mcpStop: (name) => ipcRenderer.invoke("schutz:mcpStop", name),
  mcpTools: (name) => ipcRenderer.invoke("schutz:mcpTools", name),
  mcpResources: (name) => ipcRenderer.invoke("schutz:mcpResources", name),
  mcpPrompts: (name) => ipcRenderer.invoke("schutz:mcpPrompts", name),
  mcpInfo: (name) => ipcRenderer.invoke("schutz:mcpInfo", name),
  mcpReadResource: (name, uri) => ipcRenderer.invoke("schutz:mcpReadResource", name, uri),
  mcpGetPrompt: (name, promptName, args) => ipcRenderer.invoke("schutz:mcpGetPrompt", name, promptName, args),
  mcpAllTools: () => ipcRenderer.invoke("schutz:mcpAllTools"),
  mcpCall: (name, tool, args) => ipcRenderer.invoke("schutz:mcpCall", name, tool, args),
  mcpAdd: (name, cfg) => ipcRenderer.invoke("schutz:mcpAdd", name, cfg),
  mcpRemove: (name) => ipcRenderer.invoke("schutz:mcpRemove", name),
  mcpDiscover: (root) => ipcRenderer.invoke("schutz:mcpDiscover", root),
  cliHelp: (cmd) => ipcRenderer.invoke("schutz:cliHelp", cmd),
  mcpFetchSpec: (url) => ipcRenderer.invoke("schutz:mcpFetchSpec", url),
  mcpWriteServer: (name, code) => ipcRenderer.invoke("schutz:mcpWriteServer", name, code),
  /** Claude Code 스킬 — 목록은 이름·설명만, 본문은 고른 것만 읽는다 */
  skillsList: (root) => ipcRenderer.invoke("schutz:skillsList", root),
  /** 서브에이전트 목록 — 스킬과 같은 출처(사용자·프로젝트·켠 플러그인) */
  agentsList: (root) => ipcRenderer.invoke("schutz:agentsList", root),
  skillRead: (file) => ipcRenderer.invoke("schutz:skillRead", file),
  /** 커넥터 목록 — 카탈로그 + 설치·활성 상태 */
  pluginList: () => ipcRenderer.invoke("schutz:pluginList"),
  pluginSetEnabled: (name, on) => ipcRenderer.invoke("schutz:pluginSetEnabled", name, on),
  pluginInstall: (name) => ipcRenderer.invoke("schutz:pluginInstall", name),
  pluginUninstall: (name) => ipcRenderer.invoke("schutz:pluginUninstall", name),
  /** 게임 엔진 MCP 를 GitHub 에서 설치(clone→build) — 처음 쓰는 사용자용 */
  engineInstall: (spec) => ipcRenderer.invoke("schutz:engineInstall", spec),
  engineInstalledPath: (spec) => ipcRenderer.invoke("schutz:engineInstalledPath", spec),
  onEngineInstallProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on("schutz:engineInstallProgress", h);
    return () => ipcRenderer.removeListener("schutz:engineInstallProgress", h);
  },
  /** 앱 내 로그인 — 해당 CLI의 공식 OAuth 플로우를 콘솔로 실행 */
  cliLogin: (id) => ipcRenderer.send("schutz:cliLogin", id),
  /** Claude Code CLI 턴 실행 */
  cliRun: (opts) => ipcRenderer.send("schutz:cliRun", opts),
  cliStop: () => ipcRenderer.send("schutz:cliStop"),
  /** 앱 내 직접 OAuth — 브라우저 승인 플로우 시작 */
  oauthStart: (id) => ipcRenderer.invoke("schutz:oauthStart", id),
  /** (claude) 승인 코드 붙여넣기 → 토큰 교환 */
  oauthExchange: (id, code) => ipcRenderer.invoke("schutz:oauthExchange", id, code),
  /** 토큰 갱신 */
  oauthRefresh: (id, refreshToken) => ipcRenderer.invoke("schutz:oauthRefresh", id, refreshToken),
  /** (codex) 로컬 콜백 자동 로그인 결과 구독 */
  onOauthResult: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:oauthResult", h);
    return () => ipcRenderer.removeListener("schutz:oauthResult", h);
  },

  /** ChatGPT 구독 추론 릴레이 */
  oaiRun: (opts) => ipcRenderer.send("schutz:oaiRun", opts),
  oaiStop: (id) => ipcRenderer.send("schutz:oaiStop", id),
  onOaiEvent: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:oaiEvent", h);
    return () => ipcRenderer.removeListener("schutz:oaiEvent", h);
  },

  /** 에이전트 명령 실행 (워크스페이스 안, 타임아웃·출력 상한 있음) */
  runCommand: (opts) => ipcRenderer.invoke("schutz:runCommand", opts),
  /** 실행 도구가 PATH 에 있는지 — 없는 걸 눌렀을 때 셸 오류 대신 안내를 하려고. */
  whichTool: (name) => ipcRenderer.invoke("schutz:whichTool", name),
  tmpDir: () => ipcRenderer.invoke("schutz:tmpDir"),
  runStop: (id) => ipcRenderer.send("schutz:runStop", id),
  onRunOutput: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:runOutput", h);
    return () => ipcRenderer.removeListener("schutz:runOutput", h);
  },

  /** 잔여 할당량 — 켤 때 1토큰 요청으로 즉시 조회, 이후엔 실제 요청 헤더로 갱신 */
  quotaProbe: (opts) => ipcRenderer.invoke("schutz:quotaProbe", opts),
  onQuota: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:quota", h);
    return () => ipcRenderer.removeListener("schutz:quota", h);
  },

  /** 저장 안 한 파일 목록을 메인에 알려 둔다.
   *  종료를 누른 **뒤에** 물어보면 늦다 — 그때는 이미 트레이가 사라지고 실행 중인
   *  프로세스가 죽은 다음이다. 미리 알고 있어야 종료 자체를 붙잡을 수 있다. */
  reportDirty: (files) => ipcRenderer.send("schutz:dirty", files),
  /** 메인이 "저장하고 종료" 를 골랐을 때. 저장이 끝나면 done() 을 부른다. */
  onQuitSave: (cb) => {
    const h = () => cb(() => ipcRenderer.send("schutz:quitReady"));
    ipcRenderer.on("schutz:quitSave", h);
    return () => ipcRenderer.removeListener("schutz:quitSave", h);
  },
  /** 메인이 "저장하지 않고 종료" 를 골랐을 때 — beforeunload 가 더는 막으면 안 된다. */
  onQuitForce: (cb) => {
    const h = () => cb();
    ipcRenderer.on("schutz:quitForce", h);
    return () => ipcRenderer.removeListener("schutz:quitForce", h);
  },

  /** 범용 GET (CORS 우회) — 모델 목록 등 */
  httpGet: (url, headers) => ipcRenderer.invoke("schutz:httpGet", url, headers),

  /** LSP 브리지 */
  lspLanguages: () => ipcRenderer.invoke("schutz:lspLanguages"),
  lspCatalog: () => ipcRenderer.invoke("schutz:lspCatalog"),
  lspStart: (languageId, root) => ipcRenderer.invoke("schutz:lspStart", { languageId, root }),
  lspSend: (serverId, message) => ipcRenderer.send("schutz:lspSend", serverId, message),
  lspStop: (serverId) => ipcRenderer.send("schutz:lspStop", serverId),
  onLspMessage: (cb) => { const h = (_e, sid, m) => cb(sid, m); ipcRenderer.on("schutz:lspMessage", h); return () => ipcRenderer.removeListener("schutz:lspMessage", h); },
  onLspLog: (cb) => { const h = (_e, sid, l) => cb(sid, l); ipcRenderer.on("schutz:lspLog", h); return () => ipcRenderer.removeListener("schutz:lspLog", h); },
  onLspExit: (cb) => { const h = (_e, sid, code) => cb(sid, code); ipcRenderer.on("schutz:lspExit", h); return () => ipcRenderer.removeListener("schutz:lspExit", h); },

  /** DAP(디버그) 브리지 */
  dapLanguages: () => ipcRenderer.invoke("schutz:dapLanguages"),
  dapStart: (languageId) => ipcRenderer.invoke("schutz:dapStart", { languageId }),
  dapSend: (sessionId, message) => ipcRenderer.send("schutz:dapSend", sessionId, message),
  dapStop: (sessionId) => ipcRenderer.send("schutz:dapStop", sessionId),
  onDapMessage: (cb) => { const h = (_e, sid, m) => cb(sid, m); ipcRenderer.on("schutz:dapMessage", h); return () => ipcRenderer.removeListener("schutz:dapMessage", h); },
  onDapLog: (cb) => { const h = (_e, sid, l) => cb(sid, l); ipcRenderer.on("schutz:dapLog", h); return () => ipcRenderer.removeListener("schutz:dapLog", h); },
  onDapExit: (cb) => { const h = (_e, sid, code) => cb(sid, code); ipcRenderer.on("schutz:dapExit", h); return () => ipcRenderer.removeListener("schutz:dapExit", h); },

  /** 확장 시스템 */
  extList: () => ipcRenderer.invoke("schutz:extList"),
  extReadEntry: (id, main) => ipcRenderer.invoke("schutz:extReadEntry", id, main),
  extReadFile: (id, relPath) => ipcRenderer.invoke("schutz:extReadFile", id, relPath),
  extReadFileBase64: (id, relPath) => ipcRenderer.invoke("schutz:extReadFileBase64", id, relPath),
  extSetEnabled: (id, enabled) => ipcRenderer.invoke("schutz:extSetEnabled", id, enabled),
  extOpenDir: () => ipcRenderer.invoke("schutz:extOpenDir"),
  openVsxSearch: (query) => ipcRenderer.invoke("schutz:openVsxSearch", query),
  openVsxDetail: (namespace, name) => ipcRenderer.invoke("schutz:openVsxDetail", namespace, name),
  vsixInstallOpenVsx: (namespace, name) => ipcRenderer.invoke("schutz:vsixInstallOpenVsx", namespace, name),
  vsixInstallFile: (filePath) => ipcRenderer.invoke("schutz:vsixInstallFile", filePath),
  /** Claude(Anthropic) 추론 릴레이 — CORS 우회 */
  anthropicRun: (opts) => ipcRenderer.send("schutz:anthropicRun", opts),
  anthropicStop: (id) => ipcRenderer.send("schutz:anthropicStop", id),
  onAnthropicEvent: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:anthropicEvent", h);
    return () => ipcRenderer.removeListener("schutz:anthropicEvent", h);
  },

  onCliEvent: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:cliEvent", h);
    return () => ipcRenderer.removeListener("schutz:cliEvent", h);
  },
});
