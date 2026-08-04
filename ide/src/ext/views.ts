/**
 * 확장이 사이드바에 붙이는 뷰 — 트리와 웹뷰.
 *
 * 예전 셰임은 이랬다:
 *
 *   registerTreeDataProvider: () => noopDisposable,
 *   registerWebviewViewProvider: () => noopDisposable,
 *
 * 등록은 성공하고, 그 뷰가 놓일 자리가 앱에 아예 없었다. 확장은 매니페스트에
 * `contributes.views` 로 "여기에 뷰를 하나 놓겠다" 고 선언하고 프로바이더까지
 * 붙이는데, 화면 어디에도 나타나지 않는다.
 *
 * 순수 모듈이다. React 도 monaco 도 모른다.
 */

export interface ViewDecl {
  id: string;
  /** 사이드바에 보일 이름. */
  name: string;
  /** 어느 컨테이너에 속하는가(explorer / scm / 확장이 만든 것). 표시에는 안 쓰지만
   *  같은 컨테이너끼리 묶어 보여 준다. */
  container: string;
  /** 매니페스트가 "webview" 라고 적었는가. 안 적으면 트리로 본다(vscode 기본값). */
  webview: boolean;
}

/**
 * `contributes.views` 를 읽는다.
 *
 * 모양은 `{ 컨테이너id: [ {id, name, type?}, … ] }` 다. 프로바이더를 등록하는
 * 쪽(registerTreeDataProvider)은 뷰 **id** 만 아는데, 사람에게 보여 줄 이름은
 * 여기에만 있다. 이걸 안 읽으면 사이드바에 원시 id(`myExt.viewA`)가 그대로 뜬다.
 */
export function parseViews(contributes: any): ViewDecl[] {
  const views = contributes?.views;
  if (!views || typeof views !== "object") return [];
  const out: ViewDecl[] = [];
  for (const [container, arr] of Object.entries<any>(views)) {
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      const id = String(v?.id ?? "").trim();
      if (!id) continue;
      out.push({ id, name: String(v?.name ?? id), container, webview: v?.type === "webview" });
    }
  }
  return out;
}

/** 사람에게 보여 줄 컨테이너 이름. 확장이 만든 컨테이너면 그 제목을 쓴다. */
export function containerTitle(contributes: any, container: string): string {
  const c = contributes?.viewsContainers;
  const groups = c && typeof c === "object" ? Object.values<any>(c) : [];
  for (const arr of groups) {
    if (!Array.isArray(arr)) continue;
    for (const g of arr) if (String(g?.id) === container) return String(g?.title ?? container);
  }
  return container;
}

/** vscode.TreeItemCollapsibleState — 0 None · 1 Collapsed · 2 Expanded */
export type Collapse = "none" | "collapsed" | "expanded";

export interface TreeRow {
  label: string;
  description: string;
  tooltip: string;
  collapse: Collapse;
  /** 눌렀을 때 돌릴 명령. 없으면 그냥 줄이다. */
  commandId?: string;
  commandArgs: any[];
  contextValue: string;
}

/**
 * 확장이 돌려준 TreeItem 을 한 모양으로 편다.
 *
 * `label` 은 문자열이거나 `{ label, highlights }` 객체다. `getTreeItem` 이 아무것도
 * 안 돌려주는 경우도 있는데(구현이 빠진 확장), 그때 줄을 통째로 버리면 트리가 조용히
 * 비어 보인다 — 자리는 남기고 이름만 비운다.
 */
export function normalizeTreeItem(raw: any): TreeRow {
  const lab = raw?.label;
  const cs = raw?.collapsibleState;
  const cmd = raw?.command;
  const row: TreeRow = {
    label: typeof lab === "string" ? lab : String(lab?.label ?? ""),
    description: typeof raw?.description === "string" ? raw.description : "",
    // 툴팁은 MarkdownString 일 수 있다.
    tooltip: typeof raw?.tooltip === "string" ? raw.tooltip : String(raw?.tooltip?.value ?? ""),
    collapse: cs === 2 ? "expanded" : cs === 1 ? "collapsed" : "none",
    commandArgs: Array.isArray(cmd?.arguments) ? cmd.arguments : [],
    contextValue: String(raw?.contextValue ?? ""),
  };
  const id = typeof cmd === "string" ? cmd : cmd?.command;
  if (id) row.commandId = String(id);
  return row;
}

/** 트리 안에서 한 줄을 가리키는 키. 부모 경로를 이어 붙여 만든다 —
 *  라벨만 쓰면 이름이 같은 형제가 함께 펴지고 접힌다. */
export function rowKey(viewId: string, path: readonly number[]): string {
  return viewId + "/" + path.join(".");
}

/**
 * 웹뷰 문서. 확장의 HTML 을 그대로 싣되 `acquireVsCodeApi()` 를 붙여 준다.
 *
 * 이게 없으면 웹뷰 확장은 첫 줄에서 죽는다 — 거의 모든 웹뷰가
 * `const vscode = acquireVsCodeApi();` 로 시작한다. 스크립트를 못 돌리는 자리에
 * HTML 만 그려 두면 "떠 있는데 아무 반응 없는 창" 이 되고, 그건 아무것도 안 뜨는
 * 것보다 나쁘다.
 *
 * 샌드박스 iframe 안에서 돈다. 부모와는 postMessage 로만 오간다.
 */
export function webviewDoc(html: string, viewId: string): string {
  const bridge = `<script>
(function () {
  var _state = {};
  window.acquireVsCodeApi = function () {
    return {
      postMessage: function (m) { parent.postMessage({ __schutzView: ${JSON.stringify(viewId)}, data: m }, "*"); },
      getState: function () { return _state; },
      setState: function (s) { _state = s; return s; },
    };
  };
  // 캡처 단계에서 봉투를 가로챈다. 확장의 리스너는 이 뒤에 붙으므로, 여기서 전파를
  // 끊지 않으면 웹뷰가 봉투(__schutzToView 를 단 객체)까지 그대로 받는다 — 확장은
  // 자기가 보낸 적 없는 모양을 받고 그걸 해석하려다 어긋난다.
  window.addEventListener("message", function (e) {
    if (!e.data || !e.data.__schutzToView) return;
    e.stopImmediatePropagation();
    var inner = e.data.data;
    setTimeout(function () { window.dispatchEvent(new MessageEvent("message", { data: inner })); }, 0);
  }, true);
}());
</script>`;
  const doc = String(html ?? "");
  // <head> 가 있으면 그 안 맨 앞에 넣는다. 확장의 스크립트보다 먼저 정의돼 있어야 한다.
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, m => m + bridge);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, m => m + "<head>" + bridge + "</head>");
  return bridge + doc;
}
