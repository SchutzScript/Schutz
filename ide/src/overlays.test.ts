import { describe, it, expect } from "vitest";
import { OVERLAYS, OVERLAY_KEY, overlayById, topOverlay, suppressesAction, overlayZ } from "./overlays";

describe("표 불변 조건", () => {
  it("id 가 유일하다", () => {
    const ids = OVERLAYS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("closeKey 가 유일하다 — 두 오버레이가 같은 닫기 타이머를 공유하면 서로를 취소한다", () => {
    const keys = OVERLAYS.map(o => o.closeKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("flag 가 유일하다", () => {
    const flags = OVERLAYS.map(o => o.flag).filter(Boolean);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it("z 오름차순으로 적혀 있다 — 같은 z 면 뒤가 위라는 규칙이 읽는 순서와 맞아야 한다", () => {
    for (let i = 1; i < OVERLAYS.length; i++) {
      expect(OVERLAYS[i].z).toBeGreaterThanOrEqual(OVERLAYS[i - 1].z);
    }
  });

  it("한 행동이 두 오버레이의 주인이 될 수 없다", () => {
    const owners = OVERLAYS.flatMap(o => o.ownerActions ?? []);
    expect(new Set(owners).size).toBe(owners.length);
  });

  it("OVERLAY_KEY 는 표에서 파생된다 — 손으로 관리하던 맵이 사라진 자리", () => {
    expect(OVERLAY_KEY.settingsOpen).toBe("settings");
    expect(OVERLAY_KEY.cloudOpen).toBe("cloud");
    expect(OVERLAY_KEY.askClose).toBe("askClose");
    // 퇴장 애니메이션이 없는 것은 들어가지 않는다
    expect(OVERLAY_KEY.mruOpen).toBeUndefined();
    expect(OVERLAY_KEY.undoAsk).toBeUndefined();
  });

  it("예전에 Esc 사슬에서 빠져 있던 여덟 개가 전부 표에 있다", () => {
    for (const id of ["cloud", "plugins", "engine", "askRun", "undoAsk", "commitView", "mcpb", "mru"]) {
      expect(overlayById(id), id).not.toBeNull();
    }
  });
});

describe("topOverlay", () => {
  it("아무것도 안 열려 있으면 null", () => {
    expect(topOverlay([])).toBeNull();
  });

  it("z 가 큰 쪽을 고른다 — 적힌 순서가 아니라", () => {
    // 이게 실제 버그였다: askClose(220) 가 settings(195) 보다 사슬 **뒤**에 있어
    // 위에 덮인 확인창이 아니라 밑에 깔린 설정이 먼저 닫혔다.
    expect(topOverlay(["settings", "askClose"])?.id).toBe("askClose");
    expect(topOverlay(["askClose", "settings"])?.id).toBe("askClose");
  });

  it("시트는 어떤 모달보다도 아래다", () => {
    expect(topOverlay(["sheet", "search"])?.id).toBe("search");
    expect(topOverlay(["sheet"])?.id).toBe("sheet");
  });

  it("투어와 가져오기가 최상위 두 자리를 지킨다", () => {
    expect(topOverlay(["tour", "import", "settings"])?.id).toBe("tour");
    expect(topOverlay(["import", "mcpb", "commitView"])?.id).toBe("import");
  });

  it("확인창이 설정·팔레트를 이긴다", () => {
    expect(topOverlay(["quick", "settings", "undoAsk"])?.id).toBe("undoAsk");
    expect(topOverlay(["settings", "mcpb"])?.id).toBe("mcpb");
  });

  it("같은 z 면 표에서 뒤에 적힌 것이 위", () => {
    expect(topOverlay(["search", "quick"])?.id).toBe("quick");
    expect(topOverlay(["extPanel", "cmd"])?.id).toBe("cmd");
  });

  it("모르는 id 는 무시한다", () => {
    expect(topOverlay(["nope", "settings"])?.id).toBe("settings");
    expect(topOverlay(["nope"])).toBeNull();
  });

  it("열린 모든 조합에서 z 최대를 고른다", () => {
    for (const a of OVERLAYS) for (const b of OVERLAYS) {
      const top = topOverlay([a.id, b.id])!;
      expect(top.z).toBe(Math.max(a.z, b.z));
    }
  });
});

describe("suppressesAction", () => {
  it("오버레이가 없으면 아무것도 막지 않는다", () => {
    expect(suppressesAction(null, "file.save")).toBe(false);
    expect(suppressesAction(null, "tabs.close")).toBe(false);
  });

  it("모달 위에서는 전역 단축키가 죽는다", () => {
    const settings = overlayById("settings");
    for (const a of ["tabs.close", "file.save", "view.sidebar", "file.new", "debug.startOrContinue"] as const) {
      expect(suppressesAction(settings, a), a).toBe(true);
    }
  });

  it("자기 자신을 여닫는 단축키는 통과한다 — Ctrl+P 로 빠른 열기를 다시 닫을 수 있어야 한다", () => {
    expect(suppressesAction(overlayById("quick"), "palette.quick")).toBe(false);
    expect(suppressesAction(overlayById("cmd"), "palette.command")).toBe(false);
    expect(suppressesAction(overlayById("search"), "search.inFiles")).toBe(false);
    expect(suppressesAction(overlayById("sym"), "palette.symbol")).toBe(false);
    expect(suppressesAction(overlayById("settings"), "settings.open")).toBe(false);
  });

  it("남의 팔레트 단축키는 막는다 — 빠른 열기 위에서 Ctrl+Shift+P 가 겹쳐 뜨지 않게", () => {
    expect(suppressesAction(overlayById("quick"), "palette.command")).toBe(true);
  });

  it("Ctrl+Tab 순환은 MRU 가 떠 있는 동안 계속 돌아야 한다", () => {
    expect(suppressesAction(overlayById("mru"), "tabs.mru")).toBe(false);
    expect(suppressesAction(overlayById("mru"), "tabs.mruBack")).toBe(false);
    expect(suppressesAction(overlayById("mru"), "tabs.close")).toBe(true);
  });

  it("주인 없는 오버레이는 전부 막는다", () => {
    for (const id of ["askRun", "undoAsk", "commitView", "mcpb", "import", "tour", "askClose"]) {
      expect(suppressesAction(overlayById(id), "file.save"), id).toBe(true);
    }
  });
});

describe("overlayZ", () => {
  it("표의 z 를 그대로 내준다 — 렌더가 이걸 읽어 간다", () => {
    for (const o of OVERLAYS) expect(overlayZ(o.id), o.id).toBe(o.z);
  });

  it("표에 없는 id 는 조용히 0 을 주지 않고 던진다", () => {
    // 렌더가 zIndex: 0 으로 그려지면 모달이 뒤에 깔려 **보이지 않는 채로** 키를 먹는다.
    // 그 모양은 디버깅이 어렵다 — 차라리 화면이 안 뜨고 오류가 나는 편이 낫다.
    expect(() => overlayZ("없는것")).toThrow();
  });

  it("확장이 던진 물음은 앱의 확인창보다 위다", () => {
    expect(overlayZ("extAsk")).toBeGreaterThan(overlayZ("confirmAsk"));
  });

  it("확인창은 번들 설치창보다 위다 — 예전엔 표만 그랬고 렌더는 반대였다", () => {
    expect(overlayZ("confirmAsk")).toBeGreaterThan(overlayZ("mcpb"));
  });

  it("투어는 가져오기창보다 위다 — 예전엔 렌더에서 둘 다 240 이라 DOM 순서가 정했다", () => {
    expect(overlayZ("tour")).toBeGreaterThan(overlayZ("import"));
  });
});
