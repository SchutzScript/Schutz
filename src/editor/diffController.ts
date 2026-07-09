import * as vscode from "vscode";
import { EditSink } from "../core/orchestrator";
import { EditTransaction, TransactionManager } from "../core/transaction";
import { PatchEdit } from "../ai/types";
import { DecorationController } from "./decorations";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface AppliedTx {
  uri: vscode.Uri;
  ranges: vscode.Range[];
  rationale?: string;
}

/**
 * EditSink 구현체. 프로바이더가 낸 편집을 실제 에디터에 타이핑 애니메이션과 함께
 * pending 으로 반영하고, 수락/거절/CodeLens를 관리한다. (기둥1 + 기둥2)
 */
export class DiffController implements EditSink, vscode.CodeLensProvider {
  private readonly applied = new Map<string, AppliedTx>();
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(
    private readonly txManager: TransactionManager,
    private readonly deco: DecorationController,
  ) {}

  // ── EditSink ────────────────────────────────────────────────────────────

  async applyPending(tx: EditTransaction): Promise<void> {
    const uri = this.resolveUri(tx.patch.file);
    if (!uri) {
      throw new Error(`파일 경로를 워크스페이스에서 찾을 수 없습니다: ${tx.patch.file}`);
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    const cfg = vscode.workspace.getConfiguration("schutz");
    const speed = cfg.get<number>("animation.typingSpeed", 12);
    const glowMs = cfg.get<number>("animation.glowDurationMs", 1200);

    // 아래(높은 라인)부터 적용해 상위 편집이 하위 좌표를 밀지 않게 한다.
    const edits = [...tx.patch.edits].sort((a, b) => b.startLine - a.startLine);
    const ranges: vscode.Range[] = [];

    for (const edit of edits) {
      const range = await this.applyEditAnimated(editor, edit, speed);
      if (range) {
        ranges.push(range);
      }
    }

    this.deco.showTypingCursor(editor); // 커서 제거
    this.applied.set(tx.id, { uri, ranges, rationale: tx.patch.rationale });
    this.refreshPending(editor);
    this.deco.glow(editor, ranges, glowMs);
    this._onDidChangeCodeLenses.fire();
  }

  private async applyEditAnimated(
    editor: vscode.TextEditor,
    edit: PatchEdit,
    speed: number,
  ): Promise<vscode.Range | undefined> {
    const doc = editor.document;
    const isInsertion = edit.endLine < edit.startLine;

    if (isInsertion) {
      const line = Math.min(Math.max(edit.startLine, 0), doc.lineCount);
      const startPos =
        line >= doc.lineCount
          ? doc.lineAt(Math.max(0, doc.lineCount - 1)).range.end
          : new vscode.Position(line, 0);
      const startOffset = doc.offsetAt(startPos);
      const text = line >= doc.lineCount ? "\n" + edit.newText : edit.newText;

      let inserted = 0;
      for (const chunk of splitChunks(text, speed)) {
        const pos = doc.positionAt(startOffset + inserted);
        await editor.edit(
          (eb) => eb.insert(pos, chunk),
          { undoStopBefore: false, undoStopAfter: false },
        );
        inserted += chunk.length;
        this.deco.showTypingCursor(editor, doc.positionAt(startOffset + inserted));
        await sleep(28);
      }
      return new vscode.Range(startPos, doc.positionAt(startOffset + text.length));
    }

    // 치환: 범위를 새 텍스트로 한 번에 교체
    const endLine = Math.min(edit.endLine, doc.lineCount - 1);
    const range = new vscode.Range(
      new vscode.Position(edit.startLine, 0),
      doc.lineAt(endLine).range.end,
    );
    const startOffset = doc.offsetAt(range.start);
    await editor.edit((eb) => eb.replace(range, edit.newText), {
      undoStopBefore: false,
      undoStopAfter: false,
    });
    return new vscode.Range(range.start, doc.positionAt(startOffset + edit.newText.length));
  }

  // ── 수락 / 거절 ────────────────────────────────────────────────────────

  async accept(txId: string): Promise<void> {
    this.txManager.setStatus(txId, "accepted");
    this.applied.delete(txId);
    this.refreshActiveEditors();
    this._onDidChangeCodeLenses.fire();
  }

  async reject(txId: string): Promise<void> {
    const info = this.applied.get(txId);
    if (info) {
      const doc = await vscode.workspace.openTextDocument(info.uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      // 삽입 텍스트 삭제: 아래(뒤) 범위부터 지워 좌표 밀림 방지
      const ordered = [...info.ranges].sort((a, b) => b.start.line - a.start.line);
      for (const r of ordered) {
        await editor.edit((eb) => eb.delete(r), {
          undoStopBefore: false,
          undoStopAfter: false,
        });
      }
    }
    this.txManager.setStatus(txId, "rejected");
    this.applied.delete(txId);
    this.refreshActiveEditors();
    this._onDidChangeCodeLenses.fire();
  }

  async acceptAll(): Promise<void> {
    for (const id of [...this.applied.keys()]) {
      await this.accept(id);
    }
  }

  async rejectAll(): Promise<void> {
    for (const id of [...this.applied.keys()]) {
      await this.reject(id);
    }
  }

  // ── CodeLensProvider (기둥2: 라인별 수락/거절 UI) ──────────────────────

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (const [txId, info] of this.applied) {
      if (info.uri.toString() !== document.uri.toString() || info.ranges.length === 0) {
        continue;
      }
      const anchor = new vscode.Range(info.ranges[0].start, info.ranges[0].start);
      lenses.push(
        new vscode.CodeLens(anchor, {
          title: "$(check) 수락",
          command: "schutz.acceptTransaction",
          arguments: [txId],
        }),
        new vscode.CodeLens(anchor, {
          title: "$(x) 거절",
          command: "schutz.rejectTransaction",
          arguments: [txId],
        }),
      );
      if (info.rationale) {
        lenses.push(
          new vscode.CodeLens(anchor, {
            title: `$(info) ${info.rationale}`,
            command: "",
          }),
        );
      }
    }
    return lenses;
  }

  // ── 내부 유틸 ──────────────────────────────────────────────────────────

  private refreshActiveEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refreshPending(editor);
    }
  }

  private refreshPending(editor: vscode.TextEditor): void {
    const ranges: vscode.Range[] = [];
    for (const info of this.applied.values()) {
      if (info.uri.toString() === editor.document.uri.toString()) {
        ranges.push(...info.ranges);
      }
    }
    this.deco.setPending(editor, ranges);
  }

  private resolveUri(relPath: string): vscode.Uri | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return vscode.Uri.joinPath(folders[0].uri, relPath);
    }
    // 워크스페이스가 없고 활성 에디터가 있으면 그 문서를 대상으로.
    return vscode.window.activeTextEditor?.document.uri;
  }
}

function splitChunks(s: string, size: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, size);
  for (let i = 0; i < s.length; i += step) {
    out.push(s.slice(i, i + step));
  }
  return out;
}
