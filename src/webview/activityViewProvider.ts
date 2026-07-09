import * as vscode from "vscode";
import { renderHtml } from "./html";

/**
 * Agent 활동 뷰 (schutz.activity) — 기둥3.
 * 계획 체크리스트 + 툴 호출 타임라인 + 토큰/비용 미터를 실시간 렌더.
 */
export class ActivityViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "schutz.activity";
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = renderHtml(view.webview, this.extensionUri, {
      title: "Agent Activity",
      scriptFile: "activity.js",
      styleFile: "activity.css",
      bodyHtml: `
        <section class="panel">
          <h3>계획</h3>
          <ul id="plan" class="plan"><li class="empty">아직 진행 중인 작업이 없어요.</li></ul>
        </section>
        <section class="panel">
          <h3>도구 타임라인</h3>
          <ul id="timeline" class="timeline"></ul>
        </section>
        <section class="panel meter">
          <h3>사용량</h3>
          <div id="usage" class="usage">— 토큰</div>
        </section>`,
    });
  }

  post(message: unknown): void {
    this.view?.webview.postMessage(message);
  }
}
