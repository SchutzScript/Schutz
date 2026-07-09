import * as vscode from "vscode";
import * as fs from "fs";

/**
 * Astro로 빌드된 정적 웹뷰 페이지를 로드한다.
 *
 * webview-ui 를 `astro build` 하면 dist/<page>.html + dist/_astro/*.{js,css} 가 나온다.
 * 이 HTML은 에셋을 `/_astro/...` 절대경로로 참조하므로, 확장은
 *  1) 그 경로들을 webview.asWebviewUri(...) 로 재작성하고
 *  2) CSP 메타를 주입
 * 해서 웹뷰에 안전하게 로드한다. (Astro는 스크립트를 외부 모듈로 빼므로 nonce 불필요)
 */
export function loadAstroView(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  page: "chat" | "activity" | "overview",
): string {
  const distRoot = vscode.Uri.joinPath(extensionUri, "webview-ui", "dist");
  const htmlUri = vscode.Uri.joinPath(distRoot, `${page}.html`);

  let html: string;
  try {
    html = fs.readFileSync(htmlUri.fsPath, "utf8");
  } catch {
    return notBuiltHtml(page);
  }

  // /_astro/... (및 기타 절대경로) 에셋을 webview URI 로 재작성
  html = html.replace(/(href|src)="(\/[^"]+)"/g, (_m, attr: string, p: string) => {
    const rel = p.replace(/^\//, "");
    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, rel));
    return `${attr}="${assetUri}"`;
  });

  const csp =
    `<meta http-equiv="Content-Security-Policy" content="` +
    `default-src 'none'; ` +
    `img-src ${webview.cspSource} data:; ` +
    `style-src ${webview.cspSource} 'unsafe-inline'; ` +
    `script-src ${webview.cspSource}; ` +
    `font-src ${webview.cspSource};">`;
  html = html.replace(/<head>/i, `<head>${csp}`);

  return html;
}

/** webview-ui 가 아직 빌드되지 않았을 때의 안내 페이지. */
function notBuiltHtml(page: string): string {
  return `<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 16px; color: var(--vscode-foreground);">
    <h3>웹뷰가 아직 빌드되지 않았어요 (${page})</h3>
    <p><code>npm run build:webview</code> 를 실행한 뒤 뷰를 다시 여세요.</p>
  </body></html>`;
}

/** 웹뷰가 로컬 리소스로 접근할 dist 루트. */
export function webviewDistRoot(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, "webview-ui", "dist");
}
