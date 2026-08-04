import { describe, it, expect } from "vitest";
import { flattenDefaults, fullKey, keysInSection, readValue, hasValue, inspectValue, sectionValues, affects } from "./config";

describe("flattenDefaults", () => {
  it("contributes.configuration 이 객체 하나인 꼴", () => {
    expect(flattenDefaults({ configuration: { properties: { "a.b": { type: "string", default: "x" } } } }))
      .toEqual({ "a.b": "x" });
  });

  it("배열 꼴도 받는다 — 한쪽만 처리하면 절반의 확장이 기본값을 잃는다", () => {
    expect(flattenDefaults({ configuration: [
      { properties: { "a.b": { default: 1 } } },
      { properties: { "a.c": { default: 2 } } },
    ] })).toEqual({ "a.b": 1, "a.c": 2 });
  });

  it("default 를 안 적은 항목은 타입별 빈 값으로 채운다", () => {
    expect(flattenDefaults({ configuration: { properties: {
      b: { type: "boolean" }, n: { type: "number" }, s: { type: "string" },
      a: { type: "array" }, o: { type: "object" }, u: {},
    } } })).toEqual({ b: false, n: 0, s: "", a: [], o: {}, u: null });
  });

  it("타입이 배열이면 첫 번째를 쓴다", () => {
    expect(flattenDefaults({ configuration: { properties: { p: { type: ["string", "null"] } } } })).toEqual({ p: "" });
  });

  it("null 을 기본값으로 **적었으면** 그대로 둔다", () => {
    expect(flattenDefaults({ configuration: { properties: { p: { type: "string", default: null } } } })).toEqual({ p: null });
  });

  it("설정 기여가 없으면 빈 객체", () => {
    expect(flattenDefaults(undefined)).toEqual({});
    expect(flattenDefaults({ commands: [] })).toEqual({});
    expect(flattenDefaults({ configuration: { properties: null } })).toEqual({});
  });
});

describe("fullKey / keysInSection", () => {
  it("섹션을 앞에 붙인다", () => expect(fullKey("a.b", "c")).toBe("a.b.c"));
  it("섹션이 없으면 키 그대로", () => {
    expect(fullKey(undefined, "c")).toBe("c");
    expect(fullKey("  ", "c")).toBe("c");
  });
  it("섹션에 속한 키만 짧은 이름으로", () => {
    expect(keysInSection({ "a.b": 1, "a.c": 2, "z.d": 3 }, "a")).toEqual(["b", "c"]);
  });
  it("섹션이 없으면 전부", () => {
    expect(keysInSection({ "a.b": 1, z: 2 })).toEqual(["a.b", "z"]);
  });
  it("접두사가 겹치는 다른 섹션을 끌어오지 않는다", () => {
    expect(keysInSection({ "ab.x": 1, "a.y": 2 }, "a")).toEqual(["y"]);
  });
});

describe("readValue", () => {
  const src = { defaults: { "a.b": "선언값" }, stored: {} as Record<string, any> };

  it("확장이 선언한 기본값을 돌려준다 — 예전엔 늘 인자 기본값이라 undefined 였다", () => {
    expect(readValue(src, "a.b")).toBe("선언값");
  });

  it("사용자 값이 선언값을 이긴다", () => {
    expect(readValue({ ...src, stored: { "a.b": "내값" } }, "a.b")).toBe("내값");
  });

  it("아무 데도 없으면 호출자가 준 기본값", () => {
    expect(readValue(src, "없음", "폴백")).toBe("폴백");
    expect(readValue(src, "없음")).toBeUndefined();
  });

  it("사용자가 false·0·빈 문자열로 바꾼 것도 값이다 — falsy 라고 선언값으로 되돌아가면 안 된다", () => {
    expect(readValue({ defaults: { k: true }, stored: { k: false } }, "k")).toBe(false);
    expect(readValue({ defaults: { k: 5 }, stored: { k: 0 } }, "k")).toBe(0);
    expect(readValue({ defaults: { k: "x" }, stored: { k: "" } }, "k")).toBe("");
  });

  it("사용자가 명시적으로 null·undefined 로 둔 것도 존중한다", () => {
    expect(readValue({ defaults: { k: "x" }, stored: { k: null } }, "k")).toBeNull();
    expect(readValue({ defaults: { k: "x" }, stored: { k: undefined } }, "k")).toBeUndefined();
  });
});

describe("hasValue", () => {
  it("선언만 돼 있어도 있는 것이다 — 늘 false 는 '설정이 없는 환경' 이라는 거짓말이다", () => {
    expect(hasValue({ defaults: { k: 1 }, stored: {} }, "k")).toBe(true);
  });
  it("사용자 값만 있어도 있는 것", () => {
    expect(hasValue({ defaults: {}, stored: { k: 1 } }, "k")).toBe(true);
  });
  it("모르는 키는 없는 것", () => {
    expect(hasValue({ defaults: {}, stored: {} }, "k")).toBe(false);
  });
});

describe("inspectValue", () => {
  it("어느 층에서 온 값인지 나눠 준다", () => {
    expect(inspectValue({ defaults: { k: "d" }, stored: { k: "g" } }, "k"))
      .toEqual({ key: "k", defaultValue: "d", globalValue: "g", workspaceValue: undefined });
  });
  it("사용자가 안 바꿨으면 globalValue 는 undefined", () => {
    expect(inspectValue({ defaults: { k: "d" }, stored: {} }, "k")!.globalValue).toBeUndefined();
  });
  it("모르는 키는 undefined — vscode 도 그렇다", () => {
    expect(inspectValue({ defaults: {}, stored: {} }, "k")).toBeUndefined();
  });
});

describe("sectionValues", () => {
  it("섹션의 값들을 짧은 이름으로 얹는다", () => {
    expect(sectionValues({ defaults: { "e.a": 1, "e.b": 2 }, stored: { "e.b": 9 } }, "e"))
      .toEqual({ a: 1, b: 9 });
  });
  it("점이 더 있는 키는 속성으로 얹지 않는다(get 으로 읽는다)", () => {
    expect(sectionValues({ defaults: { "e.a.b": 1, "e.c": 2 }, stored: {} }, "e")).toEqual({ c: 2 });
  });
  it("다른 섹션은 안 섞인다", () => {
    expect(sectionValues({ defaults: { "e.a": 1, "z.a": 2 }, stored: {} }, "e")).toEqual({ a: 1 });
  });
});

describe("affects", () => {
  it("정확히 같은 키", () => expect(affects(["a.b"], "a.b")).toBe(true));
  it("접두사도 영향받은 것으로 본다 — vscode 규약", () => expect(affects(["a.b.c"], "a.b")).toBe(true));
  it("접두사가 겹치기만 하는 다른 키는 아니다", () => expect(affects(["ab.c"], "a")).toBe(false));
  it("상관없는 키", () => expect(affects(["z"], "a.b")).toBe(false));
  it("빈 질의는 뭐라도 바뀌었으면 참", () => {
    expect(affects(["z"], "")).toBe(true);
    expect(affects([], "")).toBe(false);
  });
});
