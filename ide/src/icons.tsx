import type { CSSProperties } from "react";
/** 인라인 SVG 아이콘 (프로토타입 소스 그대로, stroke 1.2–1.6) */

export const GitBranchIcon = ({ size = 11, color = "#8FA893", sw = 1.4 }: { size?: number; color?: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <circle cx="4.5" cy="3.5" r="1.8" fill="none" stroke={color} strokeWidth={sw} />
    <circle cx="4.5" cy="12.5" r="1.8" fill="none" stroke={color} strokeWidth={sw} />
    <circle cx="11.5" cy="6" r="1.8" fill="none" stroke={color} strokeWidth={sw} />
    <path d="M4.5 5.3 V10.7 M11.5 7.8 C11.5 10 8.5 10.8 6.4 11.4" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
  </svg>
);

/** 모드 알약의 12px 글리프 — 남의 제품 로고가 아니라 **레이아웃 자체**를 그린다.
 *  editor: 좁은·넓은·좁은 세로 밴드(패널·에디터·패널). agent: 폭이 줄어드는 가로 규칙선 위의 프롬프트. */
export const ModeGlyph = ({ mode, color = "#6E776F" }: { mode: string; color?: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" style={{ flex: "none" }}>
    {mode === "agent" ? (
      <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 4.5 H13" />
        <path d="M2 8 H10" />
        <path d="M2 11.5 H6.5" />
        <path d="M9.5 10.4 L11.4 12 L9.5 13.6" />
      </g>
    ) : (
      <g fill="none" stroke={color} strokeWidth="1.4">
        <rect x="1.6" y="2.6" width="2.6" height="10.8" rx="1" />
        <rect x="5.6" y="2.6" width="4.8" height="10.8" rx="1" />
        <rect x="11.8" y="2.6" width="2.6" height="10.8" rx="1" />
      </g>
    )}
  </svg>
);

export const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16">
    <circle cx="7" cy="7" r="4.2" fill="none" stroke="#6E776F" strokeWidth="1.4" />
    <path d="M10.2 10.2 L13.6 13.6" stroke="#6E776F" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const PlayIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16">
    <path d="M4.5 2.8 L13 8 L4.5 13.2 Z" fill="none" stroke="var(--ok)" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const DebugIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16">
    <ellipse cx="8" cy="9" rx="3.2" ry="4" fill="none" stroke="#6E776F" strokeWidth="1.3" />
    <path d="M8 5 V3.5 M5.8 6 L4 4.5 M10.2 6 L12 4.5 M4.8 9 H2.5 M11.2 9 H13.5 M5.6 11.5 L4 13 M10.4 11.5 L12 13" stroke="#6E776F" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const BellIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16">
    <path d="M8 2 C5.8 2 4.5 3.8 4.5 6 V9 L3 11.5 H13 L11.5 9 V6 C11.5 3.8 10.2 2 8 2 Z M6.5 13 C6.8 14 7.3 14.5 8 14.5 C8.7 14.5 9.2 14 9.5 13" fill="none" stroke="#6E776F" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

export const FolderIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <path d="M1.5 4 A1.5 1.5 0 0 1 3 2.5 H6 L7.5 4.5 H13 A1.5 1.5 0 0 1 14.5 6 V12 A1.5 1.5 0 0 1 13 13.5 H3 A1.5 1.5 0 0 1 1.5 12 Z" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const FlowIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="3.5" cy="3.5" r="1.6" fill="none" stroke={color} strokeWidth="1.3" />
    <circle cx="3.5" cy="12.5" r="1.6" fill="none" stroke={color} strokeWidth="1.3" />
    <circle cx="12" cy="8" r="1.6" fill="none" stroke={color} strokeWidth="1.3" />
    <path d="M3.5 5.2 V10.8 M5.2 3.7 C9 4 10.4 5.4 10.6 7 M5.2 12.3 C9 12 10.4 10.6 10.6 9" fill="none" stroke={color} strokeWidth="1.2" />
  </svg>
);

export const VcsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16">
    <circle cx="4" cy="4" r="1.7" fill="none" stroke="#6E776F" strokeWidth="1.3" />
    <circle cx="4" cy="12" r="1.7" fill="none" stroke="#6E776F" strokeWidth="1.3" />
    <circle cx="12" cy="8" r="1.7" fill="none" stroke="#6E776F" strokeWidth="1.3" />
    <path d="M4 5.8 V10.2 M5.7 4 C9.5 4.2 12 5 12 6.2" fill="none" stroke="#6E776F" strokeWidth="1.2" />
  </svg>
);

export const TermIcon = ({ size = 15, color = "#6E776F" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke={color} strokeWidth="1.3" />
    <path d="M4 6 L6.5 8 L4 10 M8 10.5 H12" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const GearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="2" fill="none" stroke="#6E776F" strokeWidth="1.3" />
    <path d="M8 1.8 V3.4 M8 12.6 V14.2 M1.8 8 H3.4 M12.6 8 H14.2 M3.6 3.6 L4.7 4.7 M11.3 11.3 L12.4 12.4 M12.4 3.6 L11.3 4.7 M4.7 11.3 L3.6 12.4" stroke="#6E776F" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const McpIcon = ({ size = 15, color = "#6E776F" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    {/* 허브 — MCP 호스트가 도구 서버들과 연결 */}
    <circle cx="8" cy="8" r="1.9" fill="none" stroke={color} strokeWidth="1.3" />
    <circle cx="3" cy="3.5" r="1.35" fill="none" stroke={color} strokeWidth="1.2" />
    <circle cx="13" cy="3.5" r="1.35" fill="none" stroke={color} strokeWidth="1.2" />
    <circle cx="3" cy="12.5" r="1.35" fill="none" stroke={color} strokeWidth="1.2" />
    <circle cx="13" cy="12.5" r="1.35" fill="none" stroke={color} strokeWidth="1.2" />
    <path d="M6.6 6.6 L4 4.6 M9.4 6.6 L12 4.6 M6.6 9.4 L4 11.4 M9.4 9.4 L12 11.4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const TermStatusIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4 6 L6.5 8 L4 10 M8 10.5 H12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 브랜드 마크 — PNG 알파를 마스크로 쓰고 색은 테마에서 받는다.
 *  로고가 세이지 단색이 된 뒤로는 라이트 테마용 filter 반전(자주색으로 뒤집힘)이 성립하지 않아,
 *  이미지를 물들이는 대신 마스크로 칠한다. Paper 에선 --accent 가 포레스트라 자동으로 어두워진다.
 *  url() 은 Vite 가 재작성하지 않도록 인라인 스타일로 둔다(자산은 public/ 에서 dist/ 로 복사됨). */
export const Logo = ({ size, color, opacity, style }: {
  size: number; color?: string; opacity?: number; style?: CSSProperties;
}) => {
  const url = "url(./assets/logo-t.png)";
  return (
    <span
      role="img"
      aria-label="Schutz"
      style={{
        display: "block", width: size, height: size, opacity,
        background: color ?? "var(--accent)",
        WebkitMaskImage: url, maskImage: url,
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        WebkitMaskPosition: "center", maskPosition: "center",
        WebkitMaskSize: "contain", maskSize: "contain",
        ...style,
      }}
    />
  );
};
