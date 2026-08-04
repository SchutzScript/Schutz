import type { ActionId } from "./keymap";

/**
 * 열려 있는 오버레이(모달·팔레트·시트)의 **표 하나**.
 *
 * 예전엔 세 곳이 따로 알고 있었다: Escape 는 손으로 쓴 `else if` 사슬, 전역 단축키는
 * 오버레이를 아예 안 봤고, 재열림 취소는 별도의 `OVERLAY_KEY` 맵을 봤다. 그래서
 *
 *   - 새 모달을 만들 때마다 사슬 갱신을 잊었다(되돌리기·번들 설치·커밋 보기가 Esc 로 안 닫혔다),
 *   - 사슬 순서가 z-index 와 무관해 **밑에 깔린 것이 먼저 닫혔고**(askClose 220 이 settings 195 뒤),
 *   - 모달 위에서 Ctrl+W 가 뒤의 탭을 닫고 Ctrl+P 가 보이지 않는 팔레트를 열었다.
 *
 * 셋 다 "표에 줄이 없다" 는 한 가지 원인이었다. keymap.ts 와 같은 규율이다 — 표가 하나뿐이고
 * 디스패치도 렌더도 그 표를 본다.
 *
 * 순수 모듈이다. React 도 monaco 도 모른다.
 */

export interface OverlaySpec {
  /** 안정적인 식별자. App 의 close 디스패치가 이걸로 분기한다. */
  id: string;
  /** 이 오버레이가 열려 있음을 나타내는 S 의 필드 이름. openO 가 재열림을 감지하는 데 쓴다. */
  flag?: string;
  /** closeOverlay/isClosing 이 쓰는 키. 없으면 퇴장 애니메이션이 없는 오버레이다. */
  closeKey?: string;
  /** 렌더 쪽 zIndex 리터럴과 **같아야 한다.** 무엇이 위에 있는지는 이 숫자가 정한다. */
  z: number;
  /** 최상위일 때도 통과시킬 행동 — 보통 자기 자신을 여닫는 단축키. */
  ownerActions?: ActionId[];
  /** Escape 로 닫히는가. false 면 Esc 를 **삼킨다**(아래 오버레이로 넘기지 않는다). */
  escapable: boolean;
}

/** z 오름차순으로 적는다. 같은 z 면 **뒤에 적힌 것이 위**다(topOverlay 가 그렇게 고른다). */
export const OVERLAYS: OverlaySpec[] = [
  // 고정 오버레이가 아니라 레이아웃 안의 패널 — 그래서 가장 아래다. 위에 뜬 모달이 있으면
  // Esc 는 그쪽부터 닫아야 한다(예전엔 이게 사슬 맨 앞이라 반대로 동작했다).
  { id: "sheet", flag: "sheetOpen", z: 10, escapable: true },

  { id: "search", flag: "searchOpen", closeKey: "search", z: 180, ownerActions: ["search.inFiles"], escapable: true },
  { id: "sym", flag: "symOpen", closeKey: "sym", z: 180, ownerActions: ["palette.symbol"], escapable: true },
  { id: "quick", flag: "quickOpen", closeKey: "quick", z: 180, ownerActions: ["palette.quick"], escapable: true },

  { id: "extPanel", flag: "extPanel", closeKey: "extPanel", z: 190, escapable: true },
  { id: "cmd", flag: "cmdOpen", closeKey: "cmd", z: 190, ownerActions: ["palette.command"], escapable: true },

  // modalShell 계열 — 전부 z 195 를 공유한다. 동시에 둘이 열리는 흐름은 없다.
  { id: "about", flag: "aboutOpen", closeKey: "about", z: 195, escapable: true },
  { id: "usage", flag: "usageOpen", closeKey: "usage", z: 195, escapable: true },
  { id: "keys", flag: "keysOpen", closeKey: "keys", z: 195, escapable: true },
  { id: "commands", flag: "commandsOpen", closeKey: "commands", z: 195, escapable: true },
  { id: "mcp", flag: "mcpOpen", closeKey: "mcp", z: 195, escapable: true },
  { id: "engine", flag: "engineOpen", closeKey: "engine", z: 195, escapable: true },
  { id: "plugins", flag: "pluginOpen", closeKey: "plugins", z: 195, escapable: true },
  { id: "cloud", flag: "cloudOpen", closeKey: "cloud", z: 195, escapable: true },

  { id: "extDetail", flag: "extDetail", closeKey: "extDetail", z: 196, escapable: true },
  { id: "settings", flag: "settingsOpen", closeKey: "settings", z: 200, ownerActions: ["settings.open"], escapable: true },

  // Ctrl+Tab 을 누르고 있는 동안만 뜬다 — Ctrl 을 떼면 스스로 닫힌다.
  { id: "mru", flag: "mruOpen", z: 210, ownerActions: ["tabs.mru", "tabs.mruBack"], escapable: true },

  { id: "askClose", flag: "askClose", closeKey: "askClose", z: 220, escapable: true },

  // 확인·승인 계열. 되돌리기는 실행 중(busy)이면 닫히지 않는다 — 그 판정은 App 이 한다.
  { id: "askRun", flag: "askRun", z: 230, escapable: true },
  { id: "undoAsk", flag: "undoAsk", z: 230, escapable: true },
  { id: "commitView", flag: "commitView", z: 230, escapable: true },
  { id: "mcpb", flag: "mcpb", z: 232, escapable: true },
  // 되돌리기 어려운 일 직전의 확인. 다른 모달 위에서 뜰 수 있어야 한다
  // (설정·검색 안에서도 삭제·치환을 부른다).
  { id: "confirmAsk", flag: "confirmAsk", z: 233, escapable: true },
  // 확장이 던진 물음. 확인창보다 위다 — 확장 명령이 앱의 확인을 거쳐 시작될 수 있고,
  // 그때 위에 뜨는 것은 확장 쪽이다. Esc 는 확장에 "취소" 로 전달된다.
  { id: "extAsk", flag: "extAsk", z: 234, escapable: true },

  { id: "import", flag: "impOpen", z: 240, escapable: true },
  { id: "tour", flag: "tourOpen", z: 245, escapable: true },
];

const BY_ID = new Map(OVERLAYS.map(o => [o.id, o]));
export function overlayById(id: string): OverlaySpec | null { return BY_ID.get(id) ?? null; }

/**
 * 렌더가 쓸 zIndex. **표에서 읽어 간다.**
 *
 * "렌더 쪽 리터럴과 같아야 한다" 고 적어 두기만 했더니 실제로 어긋나 있었다:
 * 확인창은 표에서 233 인데 231 로 그려졌고(번들 설치 232 **아래**), 투어는 표에서
 * 245 인데 240 으로 그려져 가져오기(240)와 같은 층이었다. 둘 다 Esc 는 표 순서대로
 * 위엣것부터 닫는데 **눈에 보이는 순서는 반대**가 된다 — 사용자는 보이는 창을 닫으려
 * Esc 를 누르고, 답은 뒤에 가려진 창으로 간다.
 *
 * 지켜야 할 규칙을 주석으로 적는 대신 한 곳에서 값을 내주면 어긋날 자리가 없다.
 */
export function overlayZ(id: string): number {
  const o = BY_ID.get(id);
  if (!o) throw new Error(`overlayZ: 표에 없는 오버레이 "${id}"`);
  return o.z;
}

/** 지금 열린 것들 중 **가장 위**. 같은 z 면 표에서 뒤에 적힌 것이 이긴다. */
export function topOverlay(openIds: readonly string[]): OverlaySpec | null {
  const open = new Set(openIds);
  let best: OverlaySpec | null = null;
  for (const o of OVERLAYS) if (open.has(o.id) && (!best || o.z >= best.z)) best = o;
  return best;
}

/** 이 행동을 지금 막아야 하는가. 오버레이가 떠 있으면 그 오버레이 자신의 단축키만 통과한다.
 *  이게 없으면 설정 모달 위에서 Ctrl+W 가 뒤의 탭을 닫고 F5 가 디버그를 시작한다. */
export function suppressesAction(top: OverlaySpec | null, a: ActionId): boolean {
  if (!top) return false;
  return !top.ownerActions?.includes(a);
}

/** 오버레이 플래그 → closing 키. openO 가 재열림 시 대기 중인 닫기를 취소하는 데 쓴다. */
export const OVERLAY_KEY: Record<string, string> = Object.fromEntries(
  OVERLAYS.filter(o => o.flag && o.closeKey).map(o => [o.flag!, o.closeKey!]),
);
