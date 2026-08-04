import { describe, expect, it } from "vitest";
import { TOUR_STEPS, visibleSteps, visiblePos, trackStartIndex, otherMode, TRACK_START, type TourHost } from "./tour";

/** 앱 없이 조건만 흉내낸다 — when 은 host 만 본다. */
const host = (mode: "editor" | "agent", hasWorkspace = true): TourHost => ({
  showLeftTab: () => {}, showTerminal: () => {}, showAsideTab: () => {}, showSide: () => {}, setMode: () => {},
  hasWorkspace: () => hasWorkspace,
  mode: () => mode,
});

describe("모드별 트랙", () => {
  // 예전엔 한 줄짜리 목록이 에이전트 모드에서 절반이 사라져, 모드를 바꿔 고른
  // 사람일수록 덜 배웠다(15단계 중 8개가 통째로 건너뛰어졌다).
  it("두 모드 모두 12~14단계다", () => {
    for (const m of ["editor", "agent"] as const) {
      const n = visibleSteps(host(m)).length;
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(14);
    }
  });

  it("에이전트 모드가 에디터보다 적게 배우지 않는다", () => {
    expect(visibleSteps(host("agent")).length).toBeGreaterThanOrEqual(visibleSteps(host("editor")).length - 1);
  });

  it("각 모드에 그 모드 것만 나온다", () => {
    const ed = visibleSteps(host("editor")).map(s => s.id);
    const ag = visibleSteps(host("agent")).map(s => s.id);
    expect(ed).toContain("rail");
    expect(ed).not.toContain("agChat");
    expect(ag).toContain("agChat");
    expect(ag).not.toContain("rail");
  });

  it("두 모드 다 환영으로 열고 마무리로 닫는다", () => {
    for (const m of ["editor", "agent"] as const) {
      const v = visibleSteps(host(m));
      expect(v[0].id).toBe("welcome");
      expect(v[v.length - 1].id).toBe("done");
    }
  });

  // 에이전트 모드에서 코드가 뜨는 오른쪽 열과 에디터 모드의 편집기는 같은 앵커를 쓴다.
  // 둘이 함께 보이면 같은 자리를 두 번 가리키게 된다.
  it("같은 앵커를 쓰는 editor · agSide 는 함께 나오지 않는다", () => {
    for (const m of ["editor", "agent"] as const) {
      const ids = visibleSteps(host(m)).map(s => s.id);
      expect(ids.includes("editor") && ids.includes("agSide")).toBe(false);
    }
  });

  it("워크스페이스가 없으면 소스 컨트롤 단계를 빼고도 최소 길이를 지킨다", () => {
    const v = visibleSteps(host("editor", false)).map(s => s.id);
    expect(v).not.toContain("git");
    expect(v.length).toBeGreaterThanOrEqual(12);
  });
});

describe("진행 표시", () => {
  // "10 / 21" 이 뜨던 자리다. 21 은 두 트랙을 합친 수라 어느 쪽에서도 도달하지 않는다.
  it("위치가 1부터 보이는 총수까지 빠짐없이 이어진다", () => {
    for (const m of ["editor", "agent"] as const) {
      const h = host(m);
      const v = visibleSteps(h);
      expect(v.map(s => visiblePos(h, s.id))).toEqual(v.map((_, i) => i + 1));
    }
  });

  it("마지막 단계의 위치가 곧 총수다", () => {
    for (const m of ["editor", "agent"] as const) {
      const h = host(m);
      const v = visibleSteps(h);
      expect(visiblePos(h, v[v.length - 1].id)).toBe(v.length);
    }
  });

  it("보이지 않는 단계는 0 을 돌려준다", () => {
    expect(visiblePos(host("editor"), "agChat")).toBe(0);
    expect(visiblePos(host("agent"), "rail")).toBe(0);
  });
});

describe("각본 자체", () => {
  it("단계 id 가 중복되지 않는다", () => {
    const ids = TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("두 트랙 잇기", () => {
  it("트랙 시작점이 실제 단계를 가리킨다", () => {
    expect(trackStartIndex("editor")).toBeGreaterThanOrEqual(0);
    expect(trackStartIndex("agent")).toBeGreaterThanOrEqual(0);
    expect(TOUR_STEPS[trackStartIndex("editor")]!.id).toBe(TRACK_START.editor);
    expect(TOUR_STEPS[trackStartIndex("agent")]!.id).toBe(TRACK_START.agent);
  });

  it("각 트랙의 시작 단계는 그 모드에서 실제로 보인다 — 안 보이면 건너뛰기로 시작한다", () => {
    for (const m of ["editor", "agent"] as const) {
      const step = TOUR_STEPS[trackStartIndex(m)]!;
      expect(!step.when || step.when(host(m)), m).toBe(true);
    }
  });

  it("상대 모드", () => {
    expect(otherMode("editor")).toBe("agent");
    expect(otherMode("agent")).toBe("editor");
  });

  it("건너간 트랙에도 볼 것이 여럿 있다 — 한 단계짜리면 이을 이유가 없다", () => {
    for (const m of ["editor", "agent"] as const) {
      expect(visibleSteps(host(m)).length, m).toBeGreaterThan(5);
    }
  });

  it("두 트랙이 서로를 가리지 않는다 — 같은 단계가 양쪽에 다 보이면 중복이다", () => {
    const e = new Set(visibleSteps(host("editor")).map(s => s.id));
    const a = new Set(visibleSteps(host("agent")).map(s => s.id));
    // 공용 꼬리는 겹치는 게 맞다. 트랙 고유 단계만 배타적이어야 한다.
    expect(e.has("rail")).toBe(true);
    expect(a.has("rail")).toBe(false);
    expect(a.has("agChat")).toBe(true);
    expect(e.has("agChat")).toBe(false);
  });
});
