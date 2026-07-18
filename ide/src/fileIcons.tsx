/** 파일 타입 아이콘 — 확장자별 색 배지/글리프. (VSIX 아이콘테마가 있으면 그쪽이 우선) */
import { resolveIcon, isIconThemeActive } from "./ext/iconTheme";

interface Spec { color: string; label?: string; kind?: "img" | "badge" | "doc" }

const EXT: Record<string, Spec> = {
  py: { color: "#4B8BBE", label: "py" },
  pyi: { color: "#4B8BBE", label: "py" },
  js: { color: "#E8C15A", label: "js" },
  mjs: { color: "#E8C15A", label: "js" }, cjs: { color: "#E8C15A", label: "js" },
  jsx: { color: "#61C7D6", label: "jsx" },
  ts: { color: "#4A90D0", label: "ts" }, mts: { color: "#4A90D0", label: "ts" }, cts: { color: "#4A90D0", label: "ts" },
  tsx: { color: "#4A90D0", label: "tsx" },
  json: { color: "#C99A3B", label: "{}" }, jsonc: { color: "#C99A3B", label: "{}" },
  md: { color: "#6E95C8", label: "md" }, mdx: { color: "#6E95C8", label: "md" },
  txt: { color: "#9AA59C", label: "txt" },
  css: { color: "#C46B9E", label: "css" }, scss: { color: "#C46B9E", label: "css" }, less: { color: "#C46B9E", label: "css" },
  html: { color: "#E07A4A", label: "<>" }, htm: { color: "#E07A4A", label: "<>" },
  rs: { color: "#D08770", label: "rs" },
  go: { color: "#4FB8CF", label: "go" },
  c: { color: "#6E95C8", label: "c" }, h: { color: "#6E95C8", label: "h" },
  cpp: { color: "#6E95C8", label: "c++" }, cc: { color: "#6E95C8", label: "c++" }, hpp: { color: "#6E95C8", label: "h++" },
  java: { color: "#C4703B", label: "jv" },
  sh: { color: "#89B482", label: "sh" }, bash: { color: "#89B482", label: "sh" },
  lua: { color: "#5B8BD0", label: "lua" },
  yml: { color: "#C99A3B", label: "yml" }, yaml: { color: "#C99A3B", label: "yml" }, toml: { color: "#C99A3B", label: "tml" },
  lock: { color: "#8A8A8A", label: "🔒", kind: "doc" },
  png: { color: "#7FB37F", kind: "img" }, jpg: { color: "#7FB37F", kind: "img" }, jpeg: { color: "#7FB37F", kind: "img" },
  gif: { color: "#7FB37F", kind: "img" }, webp: { color: "#7FB37F", kind: "img" }, bmp: { color: "#7FB37F", kind: "img" },
  svg: { color: "#C4A45A", kind: "img" }, ico: { color: "#7FB37F", kind: "img" },
};

function specFor(rel: string): Spec {
  const name = rel.split(/[\\/]/).pop() || rel;
  const ext = (name.split(".").pop() || "").toLowerCase();
  return EXT[ext] || { color: "#8A9188", kind: "doc" };
}

/** 파일 아이콘 — 트리·탭·퀵오픈 공용. size 기본 15. */
export function FileIcon({ rel, size = 15 }: { rel: string; size?: number }) {
  // VS Code 아이콘 테마가 활성이면 우선
  if (isIconThemeActive()) {
    const name = rel.split(/[\\/]/).pop() || rel;
    const themed = resolveIcon(name, false);
    if (themed) {
      if (themed.kind === "font") {
        return <span style={{ width: size, height: size, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: themed.family, fontSize: size, color: themed.color, lineHeight: 1 }}>{themed.char}</span>;
      }
      return <img src={themed.dataUri} width={size} height={size} style={{ flex: "none" }} alt="" />;
    }
  }
  const s = specFor(rel);
  if (s.kind === "img") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: "none" }}>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.6" fill="none" stroke={s.color} strokeWidth="1.3" />
        <circle cx="5.5" cy="6" r="1.1" fill={s.color} />
        <path d="M2.5 12 L6 8.5 L8.5 11 L10.5 9 L13.5 12" fill="none" stroke={s.color} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  if (s.kind === "doc") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: "none" }}>
        <path d="M3.5 2 H9.5 L12.5 5 V13.2 A0.8 0.8 0 0 1 11.7 14 H4.3 A0.8 0.8 0 0 1 3.5 13.2 Z M9.3 2.2 V5 H12.2" fill="none" stroke={s.color} strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }
  // 색 배지 + 소문자 라벨
  const fs = s.label && s.label.length >= 3 ? size * 0.38 : size * 0.46;
  return (
    <span style={{ width: size, height: size, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 3, background: s.color + "26", color: s.color, fontFamily: "var(--font-code,monospace)", fontSize: fs, fontWeight: 700, lineHeight: 1, letterSpacing: -0.3 }}>
      {s.label}
    </span>
  );
}
