import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UI_MODES, getUiMode, getGlobalUiMode, setUiMode, clearUiModeFor, applyUiMode,
} from "./uiMode";

// vitest 는 node 환경이라 localStorage/document 가 없다. 이 모듈이 막으려는 실패가
// 정확히 "저장소가 이상할 때 앱이 죽는 것" 이라, 최소 스텁을 직접 세운다.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  (globalThis as any).document = { documentElement: { dataset: {} as Record<string, string> } };
});

const ROOT = "C:/work/repo";

describe("기본값", () => {
  it("아무것도 저장돼 있지 않으면 editor", () => {
    expect(getUiMode()).toBe("editor");
    expect(getGlobalUiMode()).toBe("editor");
  });

  it("쓰레기 값이 들어 있어도 editor 로 떨어진다", () => {
    store.set("schutz.uiMode", "{}[]not-a-mode");
    expect(getGlobalUiMode()).toBe("editor");
  });

  // 새 모드를 목록에만 넣고 UI 를 안 붙이는 실수를 잡는다
  it("목록은 editor·agent 둘뿐", () => {
    expect([...UI_MODES]).toEqual(["editor", "agent"]);
  });
});

describe("전역 ↔ 프로젝트별", () => {
  it("프로젝트 설정이 없으면 전역을 따른다", () => {
    setUiMode("agent");
    expect(getUiMode(ROOT)).toBe("agent");
  });

  it("프로젝트 설정이 전역을 이긴다", () => {
    setUiMode("agent");
    setUiMode("editor", ROOT);
    expect(getGlobalUiMode()).toBe("agent");
    expect(getUiMode(ROOT)).toBe("editor");
  });

  // 프로젝트에서 명시적으로 고른 값이 더 구체적인 의사표시다 — 전역이 덮으면 안 된다
  it("전역을 바꿔도 자기 값을 가진 프로젝트는 안 따라온다", () => {
    setUiMode("editor", ROOT);
    setUiMode("agent");
    expect(getUiMode(ROOT)).toBe("editor");
  });

  it("프로젝트 설정을 지우면 다시 전역을 따른다", () => {
    setUiMode("agent");
    setUiMode("editor", ROOT);
    clearUiModeFor(ROOT);
    expect(getUiMode(ROOT)).toBe("agent");
  });

  it("프로젝트끼리 섞이지 않는다", () => {
    setUiMode("agent", "/a");
    setUiMode("editor", "/b");
    expect(getUiMode("/a")).toBe("agent");
    expect(getUiMode("/b")).toBe("editor");
  });
});

describe("저장소가 막혀 있어도 죽지 않는다", () => {
  it("throw 하는 localStorage 에서도 기본값을 돌려준다", () => {
    (globalThis as any).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(getUiMode(ROOT)).toBe("editor");
    expect(() => setUiMode("agent", ROOT)).not.toThrow();
    expect(() => clearUiModeFor(ROOT)).not.toThrow();
  });

  it("알 수 없는 값을 저장하려 하면 무시한다", () => {
    setUiMode("hologram" as never, ROOT);
    expect(store.size).toBe(0);
  });
});

describe("applyUiMode", () => {
  it("루트에 data-mode 를 찍는다 — 첫 페인트 전 모양 고정용", () => {
    applyUiMode("agent");
    expect((globalThis as any).document.documentElement.dataset.mode).toBe("agent");
  });

  it("document 가 없어도 죽지 않는다", () => {
    delete (globalThis as any).document;
    expect(() => applyUiMode("editor")).not.toThrow();
  });
});
