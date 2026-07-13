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

  /** 간이 터미널: 셸 시작 (이미 있으면 무시) */
  termStart: (cwd) => ipcRenderer.send("schutz:termStart", cwd),
  /** 터미널에 한 줄 입력 */
  termInput: (line) => ipcRenderer.send("schutz:termInput", line),
  /** 터미널 출력 구독 → 해제 함수 반환 */
  onTermData: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("schutz:termData", h);
    return () => ipcRenderer.removeListener("schutz:termData", h);
  },

  /** 새 IDE 창 (기본 1분할) */
  newWindow: () => ipcRenderer.send("schutz:newWindow"),

  /** 구독 CLI 에이전트 감지 (claude/codex — 계정 인증) */
  cliCheck: () => ipcRenderer.invoke("schutz:cliCheck"),
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

  onCliEvent: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on("schutz:cliEvent", h);
    return () => ipcRenderer.removeListener("schutz:cliEvent", h);
  },
});
