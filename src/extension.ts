import * as vscode from "vscode";
import { ProviderRegistry } from "./ai/provider";
import { MockProvider } from "./ai/providers/mockProvider";
import { ClaudeProvider } from "./ai/providers/claudeProvider";
import { Message } from "./ai/types";
import { SCHUTZ_SYSTEM_PROMPT } from "./ai/prompts";
import { TransactionManager } from "./core/transaction";
import { Orchestrator } from "./core/orchestrator";
import { DecorationController } from "./editor/decorations";
import { DiffController } from "./editor/diffController";
import { ChatViewProvider } from "./webview/chatViewProvider";
import { ActivityViewProvider } from "./webview/activityViewProvider";
import { MultiFileOverview } from "./webview/multiFileOverview";

export function activate(context: vscode.ExtensionContext): void {
  // ── AI 레이어 ──────────────────────────────────────────────────────────
  const registry = new ProviderRegistry();
  registry.register(new MockProvider());
  registry.register(new ClaudeProvider(() => currentApiKey()));

  // ── 코어 ───────────────────────────────────────────────────────────────
  const txManager = new TransactionManager();
  const deco = new DecorationController();
  const diff = new DiffController(txManager, deco);
  const orchestrator = new Orchestrator(txManager, diff);

  // ── UI ─────────────────────────────────────────────────────────────────
  const chatView = new ChatViewProvider(context.extensionUri);
  const activityView = new ActivityViewProvider(context.extensionUri);
  const overview = new MultiFileOverview(
    context.extensionUri,
    txManager,
    (id) => diff.accept(id),
    (id) => diff.reject(id),
  );

  // 오케스트레이터 이벤트를 모든 뷰로 브로드캐스트.
  orchestrator.on((ev) => {
    chatView.post(ev);
    activityView.post(ev);
  });

  const history: Message[] = [];
  let busy = false;

  async function runUserTurn(text: string, demoFiles?: string[]): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    history.push({ role: "user", content: text });

    const cfg = vscode.workspace.getConfiguration("schutz");
    const providerId = cfg.get<string>("provider", "mock");
    const provider = registry.resolve(providerId);
    if (!provider) {
      chatView.post({ type: "error", message: "사용 가능한 AI 프로바이더가 없습니다." });
      busy = false;
      return;
    }
    if (provider.isConfigured && !provider.isConfigured()) {
      chatView.post({
        type: "error",
        message: `${provider.label} 설정이 필요합니다 (API 키 등). 설정에서 확인하세요.`,
      });
      busy = false;
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const context2 = editor
      ? {
          activeFile: toRelative(editor.document.uri),
          activeFileText: editor.document.getText(),
          selection: editor.document.getText(editor.selection),
          demoFiles,
        }
      : demoFiles
        ? { demoFiles }
        : undefined;

    const model = cfg.get<string>("model", "");
    const messages: Message[] = [
      { role: "system", content: SCHUTZ_SYSTEM_PROMPT },
      ...history,
    ];

    try {
      const reply = await orchestrator.runTurn(provider, messages, context2, model);
      if (reply) {
        history.push({ role: "assistant", content: reply });
      }
    } finally {
      busy = false;
    }
  }

  chatView.setHandlers(
    (text) => void runUserTurn(text),
    () => orchestrator.cancel(),
  );

  // ── 등록 ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chatView),
    vscode.window.registerWebviewViewProvider(ActivityViewProvider.viewId, activityView),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, diff),
    vscode.commands.registerCommand("schutz.openChat", () => {
      void vscode.commands.executeCommand("workbench.view.extension.schutz");
    }),
    vscode.commands.registerCommand("schutz.runDemo", () =>
      runUserTurn("이 파일 문서화를 개선해줘"),
    ),
    vscode.commands.registerCommand("schutz.runMultiFileDemo", () => {
      overview.open();
      return runUserTurn("여러 파일 문서화를 개선해줘", [
        "examples/demo.ts",
        "examples/user.ts",
        "examples/greet.ts",
      ]);
    }),
    vscode.commands.registerCommand("schutz.acceptAll", () => diff.acceptAll()),
    vscode.commands.registerCommand("schutz.rejectAll", () => diff.rejectAll()),
    vscode.commands.registerCommand("schutz.acceptTransaction", (id: string) =>
      diff.accept(id),
    ),
    vscode.commands.registerCommand("schutz.rejectTransaction", (id: string) =>
      diff.reject(id),
    ),
    vscode.commands.registerCommand("schutz.openMultiFileOverview", () => overview.open()),
    { dispose: () => deco.dispose() },
  );
}

export function deactivate(): void {
  // no-op
}

function currentApiKey(): string {
  return vscode.workspace.getConfiguration("schutz").get<string>("claude.apiKey", "");
}

function toRelative(uri: vscode.Uri): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length) {
    const root = folders[0].uri.fsPath;
    const p = uri.fsPath;
    if (p.startsWith(root)) {
      return p.slice(root.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
    }
  }
  return uri.fsPath.replace(/\\/g, "/");
}
