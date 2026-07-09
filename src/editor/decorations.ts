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
  /** 편집된 라인 끝의 인라인 라벨 ("✦ 수정됨 · 사유") — 강/약 2단계 페이드 */
  private readonly labelStrong: vscode.TextEditorDecorationType;
  private readonly labelFaint: vscode.TextEditorDecorationType;
  private readonly strongLabels = new Map<string, vscode.DecorationOptions[]>();
  private readonly faintLabels = new Map<string, vscode.DecorationOptions[]>();

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
    // 라벨 텍스트/색은 per-range renderOptions 로 지정
    this.labelStrong = vscode.window.createTextEditorDecorationType({});
    this.labelFaint = vscode.window.createTextEditorDecorationType({});
  }

  /**
   * 편집된 라인 끝에 "✦ <text>" 인라인 라벨을 띄우고,
   * durationMs 동안 강→약 2단계로 사그라들게 한다. (기둥1: 자연스러운 수정 표시)
   */
  showEditedLabel(
    editor: vscode.TextEditor,
    line: number,
    text: string,
    durationMs: number,
  ): void {
    const key = editor.document.uri.toString();
    const eol = new vscode.Range(line, Number.MAX_SAFE_INTEGER, line, Number.MAX_SAFE_INTEGER);
    const make = (color: string): vscode.DecorationOptions => ({
      range: eol,
      renderOptions: {
        after: {
          contentText: `  ✦ ${text}`,
          color,
          fontStyle: "italic",
          margin: "0 0 0 1.5rem",
        },
      },
    });

    const strongOpt = make("rgba(88, 166, 255, 0.9)");
    const faintOpt = make("rgba(88, 166, 255, 0.35)");

    const strong = this.strongLabels.get(key) ?? [];
    strong.push(strongOpt);
    this.strongLabels.set(key, strong);
    this.applyLabels(key);

    // 1단계: 강 → 약
    setTimeout(() => {
      this.removeLabel(this.strongLabels, key, strongOpt);
      const faint = this.faintLabels.get(key) ?? [];
      faint.push(faintOpt);
      this.faintLabels.set(key, faint);
      this.applyLabels(key);
      // 2단계: 약 → 제거
      setTimeout(() => {
        this.removeLabel(this.faintLabels, key, faintOpt);
        this.applyLabels(key);
      }, Math.max(400, durationMs * 0.45));
    }, Math.max(600, durationMs * 0.55));
  }

  private removeLabel(
    map: Map<string, vscode.DecorationOptions[]>,
    key: string,
    opt: vscode.DecorationOptions,
  ): void {
    const list = map.get(key);
    if (!list) {
      return;
    }
    const idx = list.indexOf(opt);
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }

  private applyLabels(key: string): void {
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === key) {
        ed.setDecorations(this.labelStrong, this.strongLabels.get(key) ?? []);
        ed.setDecorations(this.labelFaint, this.faintLabels.get(key) ?? []);
      }
    }
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
    this.labelStrong.dispose();
    this.labelFaint.dispose();
  }
}
