import * as vscode from "vscode";
import { loadAstroView, webviewDistRoot } from "./astroView";
import { TransactionManager, EditTransaction } from "../core/transaction";

interface FileCard {
  file: string;
  added: number;
  removed: number;
  status: string;
  txId: string;
}

/**
 * 멀티파일 오버뷰 (기둥4).
 * 영향받는 파일들을 카드 그리드로 조망하고, 카드 클릭 시 해당 파일로 점프.
 */
export class MultiFileOverview {
  private panel?: vscode.WebviewPanel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly txManager: TransactionManager,
    private readonly onAccept: (txId: string) => void,
    private readonly onReject: (txId: string) => void,
  ) {
    // 트랜잭션 변화가 있으면 열려 있는 오버뷰를 자동 갱신.
    this.txManager.onChange(() => this.refresh());
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.refresh();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "schutz.overview",
      "Schutz · 멀티파일 오버뷰",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [webviewDistRoot(this.extensionUri)],
        retainContextWhenHidden: true,
      },
    );
    this.panel.webview.html = loadAstroView(this.panel.webview, this.extensionUri, "overview");

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "open" && typeof msg.file === "string") {
        this.openFile(msg.file);
      } else if (msg?.type === "accept" && typeof msg.txId === "string") {
        this.onAccept(msg.txId);
      } else if (msg?.type === "reject" && typeof msg.txId === "string") {
        this.onReject(msg.txId);
      } else if (msg?.type === "acceptAll") {
        for (const c of this.cards()) this.onAccept(c.txId);
      } else if (msg?.type === "rejectAll") {
        for (const c of this.cards()) this.onReject(c.txId);
      }
    });

    this.panel.onDidDispose(() => (this.panel = undefined));
    this.refresh();
  }

  private cards(): FileCard[] {
    return this.txManager
      .list()
      .filter((t) => t.status === "pending")
      .map((t) => this.toCard(t));
  }

  private toCard(tx: EditTransaction): FileCard {
    let added = 0;
    let removed = 0;
    for (const e of tx.patch.edits) {
      const isInsertion = e.endLine < e.startLine;
      const newLines = e.newText === "" ? 0 : e.newText.split("\n").length;
      if (isInsertion) {
        added += newLines;
      } else {
        added += newLines;
        removed += e.endLine - e.startLine + 1;
      }
    }
    return { file: tx.patch.file, added, removed, status: tx.status, txId: tx.id };
  }

  private refresh(): void {
    this.panel?.webview.postMessage({ type: "render", cards: this.cards() });
  }

  private async openFile(rel: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const uri =
      folders && folders.length
        ? vscode.Uri.joinPath(folders[0].uri, rel)
        : vscode.window.activeTextEditor?.document.uri;
    if (uri) {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
    }
  }
}
