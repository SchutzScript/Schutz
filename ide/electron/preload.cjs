const { contextBridge, ipcRenderer } = require("electron");

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
  /** 파일/폴더 이름 변경 · 삭제 */
  renameEntry: (root, relFrom, relTo) => ipcRenderer.invoke("schutz:renameEntry", root, relFrom, relTo),
  deleteEntry: (root, rel) => ipcRenderer.invoke("schutz:deleteEntry", root, rel),
  /** 새 폴더 · 탐색기에서 보기 · 파일간 치환 */
  readBinary: (root, rel) => ipcRenderer.invoke("schutz:readBinary", root, rel),
  /** 파일 워처 — 외부 변경 시 콜백 */
  watchStart: (root) => ipcRenderer.send("schutz:watchStart", root),
  watchStop: () => ipcRenderer.send("schutz:watchStop"),
  onFsChange: (cb) => {
    const h = () => cb();
    ipcRenderer.on("schutz:fsChange", h);
    return () => ipcRenderer.removeListener("schutz:fsChange", h);
  },
  mkdir: (root, rel) => ipcRenderer.invoke("schutz:mkdir", root, rel),
  reveal: (root, rel) => ipcRenderer.invoke("schutz:reveal", root, rel),
  replaceInFiles: (root, query, replacement, opts) => ipcRenderer.invoke("schutz:replaceInFiles", root, query, replacement, opts),

  /** 새 IDE 창 (기본 1분할) */
  newWindow: () => ipcRenderer.send("schutz:newWindow"),

  /** 구독 CLI 에이전트 감지 (claude/codex — 계정 인증) */
  cliCheck: () => ipcRenderer.invoke("schutz:cliCheck"),
  /** Claude Code · Codex 커스텀 명령 발견 */
  agentCommands: (root) => ipcRenderer.invoke("schutz:agentCommands", root),

  /** MCP 호스트 — Schutz가 직접 stdio MCP 서버를 실행/사용 */
  mcpList: () => ipcRenderer.invoke("schutz:mcpList"),
  mcpStart: (name) => ipcRenderer.invoke("schutz:mcpStart", name),
  mcpStop: (name) => ipcRenderer.invoke("schutz:mcpStop", name),
  mcpTools: (name) => ipcRenderer.invoke("schutz:mcpTools", name),
  mcpAllTools: () => ipcRenderer.invoke("schutz:mcpAllTools"),
  mcpCall: (name, tool, args) => ipcRenderer.invoke("schutz:mcpCall", name, tool, args),
  mcpAdd: (name, cfg) => ipcRenderer.invoke("schutz:mcpAdd", name, cfg),
  mcpRemove: (name) => ipcRenderer.invoke("schutz:mcpRemove", name),
  mcpDiscover: (root) => ipcRenderer.invoke("schutz:mcpDiscover", root),
  cliHelp: (cmd) => ipcRenderer.invoke("schutz:cliHelp", cmd),
  mcpFetchSpec: (url) => ipcRenderer.invoke("schutz:mcpFetchSpec", url),
  mcpWriteServer: (name, code) => ipcRenderer.invoke("schutz:mcpWriteServer", name, code),
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

  /** 범용 GET (CORS 우회) — 모델 목록 등 */
  httpGet: (url, headers) => ipcRenderer.invoke("schutz:httpGet", url, headers),

  /** LSP 브리지 */
  lspLanguages: () => ipcRenderer.invoke("schutz:lspLanguages"),
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
