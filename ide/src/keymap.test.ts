import { describe, it, expect, beforeEach } from "vitest";
import {
  BINDINGS, chordOf, keyName, isModifierOnly, buildMap, conflictsOf,
  chordFor, getOverrides, setOverride, resetOverrides, displayChord,
} from "./keymap";

// localStorage 가 없는 node 환경 — 최소 구현을 심는다(모듈이 try/catch 로 감싸고 있어
// 없어도 죽지는 않지만, 재정의 저장 경로를 진짜로 시험하려면 있어야 한다).
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

const ev = (o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string; key: string }>) =>
  ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, code: "", key: "", ...o });

beforeEach(() => { resetOverrides(); });

describe("keyName", () => {
  it("글자·숫자는 물리 위치에서 뽑는다", () => {
    expect(keyName("KeyP", "p")).toBe("P");
    expect(keyName("Digit4", "4")).toBe("4");
  });
  it("Alt 가 e.key 를 망가뜨려도 코드로 본다", () => {
    // Alt+F 를 누르면 일부 배열에서 e.key 가 "ƒ" 같은 문자로 온다
    expect(keyName("KeyF", "ƒ")).toBe("F");
  });
  it("기호·특수키 이름", () => {
    expect(keyName("Backquote", "`")).toBe("`");
    expect(keyName("Comma", ",")).toBe(",");
    expect(keyName("Tab", "Tab")).toBe("Tab");
    expect(keyName("F12", "F12")).toBe("F12");
  });
  it("코드를 못 읽으면 key 로 떨어진다", () => {
    expect(keyName("", "q")).toBe("Q");
    expect(keyName("", "Enter")).toBe("Enter");
  });
});

describe("chordOf", () => {
  it("모디파이어 순서는 항상 같다", () => {
    expect(chordOf(ev({ ctrlKey: true, shiftKey: true, code: "KeyP", key: "P" }))).toBe("Mod+Shift+P");
    expect(chordOf(ev({ shiftKey: true, ctrlKey: true, code: "KeyP", key: "P" }))).toBe("Mod+Shift+P");
  });
  it("Cmd 와 Ctrl 은 같은 Mod 로 접힌다", () => {
    expect(chordOf(ev({ metaKey: true, code: "KeyS", key: "s" }))).toBe("Mod+S");
    expect(chordOf(ev({ ctrlKey: true, code: "KeyS", key: "s" }))).toBe("Mod+S");
  });
  it("Shift 가 Alt 앞에 온다 — 사람이 ⇧⌥F 라고 적는 순서", () => {
    expect(chordOf(ev({ shiftKey: true, altKey: true, code: "KeyF", key: "F" }))).toBe("Shift+Alt+F");
  });
  it("모디파이어 없는 F키", () => {
    expect(chordOf(ev({ code: "F5", key: "F5" }))).toBe("F5");
    expect(chordOf(ev({ shiftKey: true, code: "F5", key: "F5" }))).toBe("Shift+F5");
  });
});

describe("isModifierOnly", () => {
  it("모디파이어 키 자체는 화음이 될 수 없다", () => {
    for (const c of ["ControlLeft", "ShiftRight", "AltLeft", "MetaLeft"]) expect(isModifierOnly(c)).toBe(true);
  });
  it("일반 키는 아니다", () => {
    expect(isModifierOnly("KeyA")).toBe(false);
    expect(isModifierOnly("F5")).toBe(false);
  });
});

describe("기본 표", () => {
  it("기본 바인딩끼리 충돌이 없다", () => {
    const seen = new Map<string, string>();
    for (const b of BINDINGS) {
      expect(seen.has(b.def), `${b.def} 가 ${seen.get(b.def)} 와 ${b.id} 에 겹침`).toBe(false);
      seen.set(b.def, b.id);
    }
  });
  it("행동 id 가 중복되지 않는다", () => {
    expect(new Set(BINDINGS.map(b => b.id)).size).toBe(BINDINGS.length);
  });
  it("모든 항목에 라벨 키가 있다", () => {
    for (const b of BINDINGS) expect(b.labelKey.startsWith("key.")).toBe(true);
  });
});

describe("디스패치", () => {
  it("실제 이벤트가 행동으로 풀린다", () => {
    const m = buildMap();
    expect(m.get(chordOf(ev({ ctrlKey: true, shiftKey: true, code: "KeyP", key: "P" })))).toBe("palette.command");
    expect(m.get(chordOf(ev({ ctrlKey: true, code: "KeyS", key: "s" })))).toBe("file.save");
    expect(m.get(chordOf(ev({ ctrlKey: true, shiftKey: true, code: "KeyS", key: "S" })))).toBe("file.saveAll");
    expect(m.get(chordOf(ev({ ctrlKey: true, altKey: true, code: "Digit4", key: "4" })))).toBe("split.four");
    expect(m.get(chordOf(ev({ shiftKey: true, altKey: true, code: "KeyF", key: "F" })))).toBe("editor.format");
    expect(m.get(chordOf(ev({ ctrlKey: true, code: "Backquote", key: "`" })))).toBe("terminal.toggle");
  });
  it("걸리지 않은 화음은 undefined", () => {
    expect(buildMap().get(chordOf(ev({ ctrlKey: true, code: "KeyJ", key: "j" })))).toBeUndefined();
  });
});

describe("재정의", () => {
  it("저장하면 그 화음이 이긴다", () => {
    setOverride("file.save", "Mod+Alt+S");
    expect(chordFor("file.save")).toBe("Mod+Alt+S");
    const m = buildMap();
    expect(m.get("Mod+Alt+S")).toBe("file.save");
    expect(m.get("Mod+S")).toBeUndefined(); // 옛 화음은 비워진다
  });
  it("기본과 같은 값을 주면 재정의로 남기지 않는다", () => {
    setOverride("file.save", "Mod+S");
    expect(getOverrides()["file.save"]).toBeUndefined();
  });
  it("null 이면 기본으로 되돌아간다", () => {
    setOverride("file.save", "Mod+Alt+S");
    setOverride("file.save", null);
    expect(chordFor("file.save")).toBe("Mod+S");
  });
  it("모르는 행동 id 는 읽을 때 걸러진다", () => {
    localStorage.setItem("schutz.keymap", JSON.stringify({ "not.a.real.action": "Mod+Z", "file.save": "Mod+Alt+S" }));
    const ov = getOverrides();
    expect(ov["file.save"]).toBe("Mod+Alt+S");
    expect(Object.keys(ov)).toHaveLength(1);
  });
  it("깨진 JSON 은 빈 재정의로 떨어진다 — 단축키가 통째로 죽지 않게", () => {
    localStorage.setItem("schutz.keymap", "{ not json");
    expect(getOverrides()).toEqual({});
    expect(chordFor("file.save")).toBe("Mod+S");
  });
  it("전체 초기화", () => {
    setOverride("file.save", "Mod+Alt+S");
    resetOverrides();
    expect(getOverrides()).toEqual({});
  });
});

describe("충돌 알림", () => {
  it("이미 쓰는 화음을 집으면 누가 쓰는지 알려준다", () => {
    expect(conflictsOf("Mod+S", "file.new")).toEqual(["file.save"]);
  });
  it("자기 자신은 충돌이 아니다", () => {
    expect(conflictsOf("Mod+S", "file.save")).toEqual([]);
  });
  it("재정의로 생긴 충돌도 잡는다", () => {
    setOverride("file.new", "Mod+S");
    expect(conflictsOf("Mod+S", "file.save")).toEqual(["file.new"]);
  });
});

describe("표시", () => {
  it("Mod 는 플랫폼 이름으로 바뀐다", () => {
    expect(displayChord("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
    expect(displayChord("Mod+Shift+P", true)).toBe("Cmd+Shift+P");
  });
  it("모디파이어 없는 화음은 그대로", () => {
    expect(displayChord("F5", false)).toBe("F5");
  });
});
