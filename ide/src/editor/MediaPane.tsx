import React, { useEffect, useState } from "react";
import { t } from "../i18n";

const MONO = "'IBM Plex Mono',monospace";

const IMG_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon" };

export function isImage(rel: string): boolean {
  return IMG_EXT.has((rel.split(".").pop() ?? "").toLowerCase());
}

/** 아주 작은 마크다운 → HTML (미리보기용, 사용자 자기 파일 대상) */
export function mdToHtml(src: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t: string) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) => {
      // href 인젝션 방지 — 따옴표 인코딩 + 안전 스킴만 허용(javascript:/data: 등 차단)
      const safe = /^\s*(https?:|mailto:|#|\/|\.)/i.test(url) ? String(url).replace(/"/g, "%22") : "#";
      return `<a href="${safe}" target="_blank" rel="noreferrer">${txt}</a>`;
    });
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false, codeBuf: string[] = [], listOpen = false;
  const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
  for (const ln of lines) {
    if (/^```/.test(ln)) {
      if (inCode) { out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>"); codeBuf = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(ln); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(ln);
    if (h) { closeList(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (/^\s*[-*+]\s+/.test(ln)) { if (!listOpen) { out.push("<ul>"); listOpen = true; } out.push("<li>" + inline(ln.replace(/^\s*[-*+]\s+/, "")) + "</li>"); continue; }
    if (/^\s*>\s?/.test(ln)) { closeList(); out.push("<blockquote>" + inline(ln.replace(/^\s*>\s?/, "")) + "</blockquote>"); continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(ln)) { closeList(); out.push("<hr/>"); continue; }
    if (!ln.trim()) { closeList(); continue; }
    closeList();
    out.push("<p>" + inline(ln) + "</p>");
  }
  if (inCode) out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>");
  closeList();
  return out.join("\n");
}

/** 이미지 뷰 (base64 data URI) */
export function ImagePane({ root, rel }: { root: string; rel: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    if (!window.schutz) return;
    window.schutz.readBinary(root, rel)
      .then(b64 => { if (!off) setSrc(`data:${MIME[(rel.split(".").pop() ?? "").toLowerCase()] ?? "image/png"};base64,${b64}`); })
      .catch(e => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [root, rel]);
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-editor)", padding: 20 }}>
      {err ? <span style={{ color: "#CE9A9A", fontSize: 12 }}>⚠️ {err}</span>
        : src ? <img src={src} alt={rel} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", imageRendering: "auto" }} />
          : <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>{t("media.loading")}</span>}
    </div>
  );
}

/** 마크다운 미리보기 */
export function MarkdownPane({ root, rel }: { root: string; rel: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let off = false;
    if (!window.schutz) return;
    window.schutz.readFile(root, rel).then(t => { if (!off) setHtml(mdToHtml(t)); }).catch(() => { });
    return () => { off = true; };
  }, [root, rel]);
  return (
    <div className="szMd" style={{ flex: 1, minHeight: 0, overflow: "auto", background: "var(--bg-editor)", padding: "18px 26px", color: "var(--fg-code)", fontFamily: "'SUIT Variable',sans-serif", fontSize: 14, lineHeight: 1.7 }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export { MONO };
