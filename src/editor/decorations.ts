import * as vscode from "vscode";

/**
 * 기둥1(편집 애니메이션)의 시각 효과 담당.
 *
 * VSCode 확장 API로 렌더러를 직접 못 건드리므로, TextEditorDecoration을
 * 단계적으로 교체해 "글로우가 켜졌다가 서서히 사그라드는" 느낌을 흉내낸다.
 * (진짜 매끄러운 애니메이션은 설계 문서상 Phase 2 포크에서 완성.)
 */
export class DecorationController {
  /** 방금 삽입된 라인 — 강한 글로우 */
  private readonly glowStrong: vscode.TextEditorDecorationType;
  /** 사그라드는 중 — 약한 글로우 */
  private readonly glowFaint: vscode.TextEditorDecorationType;
  /** 수락 대기 중인 추가 라인 (지속) */
  private readonly pendingAdd: vscode.TextEditorDecorationType;
  /** 활성 타이핑 커서 위치 표시 */
  private readonly typingCursor: vscode.TextEditorDecorationType;

  constructor() {
    this.glowStrong = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(88, 166, 255, 0.28)",
      overviewRulerColor: "rgba(88, 166, 255, 0.8)",
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    this.glowFaint = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(88, 166, 255, 0.12)",
    });
    this.pendingAdd = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(63, 185, 80, 0.14)",
      borderWidth: "0 0 0 2px",
      borderStyle: "solid",
      borderColor: "rgba(63, 185, 80, 0.9)",
      overviewRulerColor: "rgba(63, 185, 80, 0.8)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconSize: "contain",
    });
    this.typingCursor = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "▏",
        color: "rgba(88, 166, 255, 1)",
        fontWeight: "bold",
      },
    });
  }

  /** 타이핑 중인 커서 위치를 표시(또는 위치 배열이 비면 제거). */
  showTypingCursor(editor: vscode.TextEditor, position?: vscode.Position): void {
    editor.setDecorations(
      this.typingCursor,
      position ? [new vscode.Range(position, position)] : [],
    );
  }

  /**
   * 주어진 범위에 글로우를 켜고 duration 후 서서히 끈다.
   * pending 데코레이션은 별도로 유지된다.
   */
  glow(editor: vscode.TextEditor, ranges: vscode.Range[], durationMs: number): void {
    editor.setDecorations(this.glowStrong, ranges);
    // 1단계: 강 → 약
    setTimeout(() => {
      editor.setDecorations(this.glowStrong, []);
      editor.setDecorations(this.glowFaint, ranges);
      // 2단계: 약 → 제거
      setTimeout(() => {
        editor.setDecorations(this.glowFaint, []);
      }, Math.max(200, durationMs * 0.5));
    }, Math.max(150, durationMs * 0.5));
  }

  /** 특정 tx의 pending 범위들을 표시. txRanges는 모든 pending tx의 범위 합집합. */
  setPending(editor: vscode.TextEditor, ranges: vscode.Range[]): void {
    editor.setDecorations(this.pendingAdd, ranges);
  }

  dispose(): void {
    this.glowStrong.dispose();
    this.glowFaint.dispose();
    this.pendingAdd.dispose();
    this.typingCursor.dispose();
  }
}
