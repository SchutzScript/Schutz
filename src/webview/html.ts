import * as vscode from "vscode";

/** CSP nonce 생성. */
export function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

export interface HtmlOptions {
  title: string;
  scriptFile: string; // media/ 아래 파일명
  styleFile: string;
  bodyHtml: string;
}

/**
 * webview HTML 골격을 만든다. strict CSP + nonce.
 */
export function renderHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  opts: HtmlOptions,
): string {
  const n = nonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", opts.scriptFile),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", opts.styleFile),
  );
  const base = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "base.css"));

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${n}'; img-src ${webview.cspSource} data:;" />
  <link href="${base}" rel="stylesheet" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>${opts.title}</title>
</head>
<body>
${opts.bodyHtml}
<script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}
