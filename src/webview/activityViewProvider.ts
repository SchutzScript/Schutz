import * as vscode from "vscode";
import { loadAstroView, webviewDistRoot } from "./astroView";

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
      localResourceRoots: [webviewDistRoot(this.extensionUri)],
    };
    view.webview.html = loadAstroView(view.webview, this.extensionUri, "activity");
  }

  post(message: unknown): void {
    this.view?.webview.postMessage(message);
  }
}
