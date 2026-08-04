/**
 * 확장 설정 — `vscode.workspace.getConfiguration()`.
 *
 * 예전 셰임은 이랬다:
 *
 *   getConfiguration: (_section?) => ({
 *     get: (_key, def) => def,          // 늘 인자로 준 기본값
 *     has: () => false,                 // 늘 "없다"
 *     update: () => Promise.resolve(),  // 아무 데도 안 쓴다
 *     inspect: () => undefined,
 *   })
 *
 * `get(key, def)` 만 보면 그럴듯한데, 확장은 **기본값을 인자로 안 준다.** 자기
 * package.json 의 `contributes.configuration` 에 이미 적어 뒀기 때문이다. 그래서
 * `cfg.get("material-icon-theme.folders.theme")` 는 vscode 에서 `"specific"` 인데
 * 여기서는 `undefined` 였다. 확장은 설정이 꺼져 있다고 판단하고 기능을 접거나,
 * undefined 를 그대로 쓰다 뒤에서 터진다.
 *
 * `has()` 가 늘 거짓인 것도 같은 종류다 — "설정이 하나도 없는 환경" 이라는 거짓말이다.
 *
 * 순수 모듈이다.
 */

/** package.json 의 contributes.configuration 에서 `키 → 기본값` 을 모은다.
 *
 *  configuration 은 객체 하나일 수도, 배열일 수도 있다(vscode 가 둘 다 받는다).
 *  배열만 처리하거나 객체만 처리하면 절반의 확장이 조용히 기본값을 잃는다. */
export function flattenDefaults(contributes: any): Record<string, any> {
  const out: Record<string, any> = {};
  const cfg = contributes?.configuration;
  const blocks = Array.isArray(cfg) ? cfg : (cfg ? [cfg] : []);
  for (const b of blocks) {
    const props = b?.properties;
    if (!props || typeof props !== "object") continue;
    for (const [key, spec] of Object.entries<any>(props)) {
      // default 를 안 적은 항목도 있다. 그때 vscode 는 타입별 빈 값을 준다 —
      // 없는 키로 두면 `get(k)` 가 undefined 라 "설정 안 됨" 과 구별되지 않는다.
      out[key] = "default" in (spec || {}) ? spec.default : emptyFor(spec?.type);
    }
  }
  return out;
}

function emptyFor(type: any): any {
  const t = Array.isArray(type) ? type[0] : type;
  switch (t) {
    case "boolean": return false;
    case "number": case "integer": return 0;
    case "string": return "";
    case "array": return [];
    case "object": return {};
    default: return null;
  }
}

/** `getConfiguration("a.b").get("c")` → `"a.b.c"`. 섹션이 없으면 키 그대로. */
export function fullKey(section: string | undefined, key: string): string {
  const s = (section || "").trim();
  return s ? s + "." + key : key;
}

/** 이 섹션에 속하는 키들을 섹션을 뗀 이름으로 돌려준다.
 *  vscode 의 설정 객체는 값을 **속성으로도** 노출한다(`cfg.folders.theme` 처럼
 *  점 없는 첫 조각까지). 여기서는 평평한 키만 다룬다. */
export function keysInSection(all: Record<string, any>, section?: string): string[] {
  const s = (section || "").trim();
  if (!s) return Object.keys(all);
  const p = s + ".";
  return Object.keys(all).filter(k => k.startsWith(p)).map(k => k.slice(p.length));
}

export interface ConfigSource {
  /** package.json 이 선언한 기본값. */
  defaults: Record<string, any>;
  /** 사용자가 바꾼 값. */
  stored: Record<string, any>;
}

/** 값 하나. 사용자 값 → 선언된 기본값 → 호출자가 준 기본값 순. */
export function readValue(src: ConfigSource, key: string, callerDefault?: any): any {
  if (Object.prototype.hasOwnProperty.call(src.stored, key)) return src.stored[key];
  if (Object.prototype.hasOwnProperty.call(src.defaults, key)) return src.defaults[key];
  return callerDefault;
}

/** 이 키를 우리가 아는가. 사용자가 안 바꿨어도 **선언돼 있으면 있는 것**이다. */
export function hasValue(src: ConfigSource, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(src.stored, key)
    || Object.prototype.hasOwnProperty.call(src.defaults, key);
}

export interface Inspected {
  key: string;
  defaultValue: any;
  globalValue: any;
  workspaceValue: undefined;
}

/** vscode 의 inspect(). 어느 층에서 온 값인지 확장이 구분하게 해 준다. */
export function inspectValue(src: ConfigSource, key: string): Inspected | undefined {
  if (!hasValue(src, key)) return undefined;
  return {
    key,
    defaultValue: src.defaults[key],
    globalValue: Object.prototype.hasOwnProperty.call(src.stored, key) ? src.stored[key] : undefined,
    // 워크스페이스별 설정은 아직 없다. undefined 로 두면 "이 층엔 값이 없다" 는
    // 정확한 답이 된다 — 거짓으로 채우는 것보다 낫다.
    workspaceValue: undefined,
  };
}

/** 섹션 하나를 평평한 `{ 짧은키: 값 }` 으로. 설정 객체에 속성으로 얹을 때 쓴다. */
export function sectionValues(src: ConfigSource, section?: string): Record<string, any> {
  const out: Record<string, any> = {};
  const seen = new Set([...Object.keys(src.defaults), ...Object.keys(src.stored)]);
  for (const short of keysInSection(Object.fromEntries([...seen].map(k => [k, 1])), section)) {
    // 첫 조각만 얹는다. `folders.theme` 은 `cfg.folders` 가 객체여야 하는데,
    // 그건 확장이 `get("folders.theme")` 으로도 읽을 수 있어 굳이 만들지 않는다.
    if (short.includes(".")) continue;
    out[short] = readValue(src, fullKey(section, short));
  }
  return out;
}

/** 설정 하나가 바뀌었을 때 `affectsConfiguration(x)` 가 참이어야 하는가.
 *  vscode 는 **접두사**로 본다 — `a.b` 가 바뀌면 `a` 도 영향을 받은 것이다. */
export function affects(changedKeys: readonly string[], query: string): boolean {
  const q = (query || "").trim();
  if (!q) return changedKeys.length > 0;
  return changedKeys.some(k => k === q || k.startsWith(q + "."));
}
