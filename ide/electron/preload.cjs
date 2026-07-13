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
});
