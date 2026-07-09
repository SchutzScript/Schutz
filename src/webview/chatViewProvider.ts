import * as vscode from "vscode";
import { renderHtml } from "./html";

export type ChatInboundHandler = (text: string) => void;

/**
 * 사이드바 채팅 뷰 (schutz.chat).
 * 사용자 입력을 받아 확장으로 전달하고, 어시스턴트 텍스트 스트림을 렌더한다.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "schutz.chat";
  private view?: vscode.WebviewView;
  private onSubmit?: ChatInboundHandler;
  private onCancel?: () => void;

  constructor(private readonly extensionUri: vscode.Uri) {}

  setHandlers(onSubmit: ChatInboundHandler, onCancel: () => void): void {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = renderHtml(view.webview, this.extensionUri, {
      title: "Schutz Chat",
      scriptFile: "chat.js",
      styleFile: "chat.css",
      bodyHtml: `
        <div id="messages"></div>
        <div id="composer">
          <textarea id="input" rows="2" placeholder="Schutz에게 요청… (Enter 전송, Shift+Enter 줄바꿈)"></textarea>
          <div class="composer-row">
            <span id="status" class="status">대기 중</span>
            <div class="spacer"></div>
            <button id="cancel" class="btn ghost" hidden>중지</button>
            <button id="send" class="btn primary">전송</button>
          </div>
        </div>`,
    });

    view.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "submit" && typeof msg.text === "string") {
        this.onSubmit?.(msg.text);
      } else if (msg?.type === "cancel") {
        this.onCancel?.();
      }
    });
  }

  post(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  reveal(): void {
    this.view?.show?.(true);
  }
}
