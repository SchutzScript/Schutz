import React from "react";

/**
 * 투어 카드에 붙는 작은 그림 — **지금 말하는 곳이 화면의 어디인가.**
 *
 * 스포트라이트는 실물을 비추지만, 실물은 그 순간 화면에 있는 것에 따라 달라 보인다.
 * 트리가 비어 있거나 검토 패널에 아무것도 없으면 무엇이 강조된 건지 알 수 없다. 뼈대
 * 그림은 늘 같은 모양이라 "여기가 그 자리다" 가 흔들리지 않는다.
 *
 * 첫 실행에서 모드를 고를 때 쓰는 도안(Opening 의 ModeDiagram)과 같은 어법이다 —
 * 스크린샷도 아이콘도 아니고 **레이아웃의 뼈대**. 같은 말을 두 번 다르게 그리지 않는다.
 *
 * 그리는 규칙: 강조할 영역만 accent 로 채우고 나머지는 흐리게 둔다. 색은 CSS 변수로
 * 받으므로 테마를 따라간다.
 */

/** 뼈대에서 강조할 자리. 투어 단계가 이 중 하나를 고른다. */
export type FigureRegion =
  | "rail" | "left" | "editor" | "chat" | "right" | "terminal" | "menubar"
  | "aside" | "conv" | "side" | "composer" | "mode";

/** 에이전트 모드 뼈대를 쓰는 자리들 — 그쪽은 상자 구성이 아예 다르다. */
const AGENT_REGIONS = new Set<FigureRegion>(["aside", "conv", "side", "composer"]);

const W = 132, H = 84;

export function TourFigure({ region }: { region: FigureRegion }) {
  const on = "var(--accent)";
  const off = "var(--w10)";
  const dim = "var(--w06)";
  const hit = (r: FigureRegion) => (r === region ? on : dim);
  const agent = AGENT_REGIONS.has(region);

  // 공통 — 상단바와 상태줄은 두 모드에 똑같이 있다.
  const chrome = (
    <>
      <rect x="0" y="0" width={W} height="11" rx="2.5" fill={region === "menubar" || region === "mode" ? on : off} />
      <rect x="0" y={H - 7} width={W} height="7" rx="2" fill={off} />
      {/* 모드 전환은 상단바 안의 작은 조각이다 — 상단바 전체를 칠하면 무엇을 가리키는지 흐려진다 */}
      {region === "mode" && <rect x="86" y="2.5" width="34" height="6" rx="3" fill="var(--bg-root)" opacity=".55" />}
    </>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", borderRadius: 7, background: "var(--bg-root)" }}
      role="img" aria-hidden>
      {chrome}
      {agent ? (
        <>
          {/* 에이전트 모드 — 사이드바 · 대화 · (필요할 때) 오른쪽 산출물 */}
          <rect x="3" y="14" width="26" height={H - 24} rx="2.5" fill={hit("aside")} />
          <rect x="32" y="14" width={region === "side" ? 60 : 97} height={H - 24} rx="2.5" fill={hit("conv")} />
          {region === "side" && <rect x="95" y="14" width="34" height={H - 24} rx="2.5" fill={on} />}
          {/* 컴포저는 대화 아래에 붙은 한 줄 */}
          <rect x="36" y={H - 20} width={region === "side" ? 52 : 89} height="8" rx="4"
            fill={region === "composer" ? on : "var(--w12)"} />
        </>
      ) : (
        <>
          {/* 에디터 모드 — 레일 · 좌측 패널 · 편집기 · 우측 패널 */}
          <rect x="3" y="14" width="8" height={H - 24} rx="2" fill={hit("rail")} />
          <rect x="14" y="14" width="30" height={H - 24} rx="2.5" fill={hit("left")} />
          <rect x="47" y="14" width={region === "terminal" ? 52 : 52} height={region === "terminal" ? 34 : H - 24} rx="2.5" fill={hit("editor")} />
          {region === "terminal" && <rect x="47" y="51" width="52" height={H - 61} rx="2.5" fill={on} />}
          <rect x="102" y="14" width="27" height={H - 24} rx="2.5" fill={hit("right")} />
        </>
      )}
    </svg>
  );
}
