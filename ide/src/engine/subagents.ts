// 서브에이전트 — 플러그인·프로젝트·사용자가 정의한 **인격**.
//
// 여기서 갈리는 게 하나 있다. 이 앱의 "에이전트" 는 지금까지 **프로바이더**였다
// (claude/gpt/grok/glm — 어떤 모델을 쓰나). 서브에이전트는 그것과 층이 다르다:
// 이름·설명·지침·쓸 수 있는 도구를 가진 인격이고, **어떤 프로바이더 위에서든** 돈다.
//
// 그래서 위임 대상 id 를 하나의 이름 공간으로 합쳐야 한다. 프로바이더 id 와 서브에이전트
// 이름이 겹칠 수 있으므로 서브에이전트는 접두어를 붙인다(`@`). 그 규칙과 "그래서 어떤
// 프로바이더로 태울 것인가" 를 여기 모아 두고 테스트로 덮는다 — App.tsx 에 흩으면
// 로스터에 광고한 이름과 실제로 부를 수 있는 이름이 어긋난다(전에 그 버그가 있었다).

export interface SubagentDef {
  id: string;            // "plugin:name" 또는 "name"
  name: string;
  description: string;
  /** 빈 배열이면 제한 없음 */
  tools: string[];
  /** 프론트매터의 model — 프로바이더 id 이거나 별칭이거나 빈 값 */
  model: string;
  prompt: string;
  source: "user" | "project" | "plugin";
  owner: string | null;
}

/** 위임 대상으로 쓰는 이름. 프로바이더 id 와 절대 안 겹치게 접두어를 둔다. */
export const SUB_PREFIX = "@";

export function targetIdOf(a: SubagentDef): string {
  return SUB_PREFIX + a.id;
}

export function isSubagentTarget(target: string): boolean {
  return target.startsWith(SUB_PREFIX);
}

export function findSubagent(list: readonly SubagentDef[], target: string): SubagentDef | null {
  if (!isSubagentTarget(target)) return null;
  const id = target.slice(SUB_PREFIX.length);
  return list.find(a => a.id === id) ?? null;
}

/**
 * 이 서브에이전트를 어떤 프로바이더로 태울까.
 *
 * frontmatter 의 `model` 은 Claude Code 관례라 `sonnet`·`opus`·`haiku` 같은 말이 온다.
 * 그건 우리 프로바이더 id 가 아니다 — 아는 말은 옮겨 주고, 모르면 **부른 쪽과 같은
 * 프로바이더**로 태운다. 여기서 아무 프로바이더나 고르면 사용자가 연결하지도 않은
 * 모델로 돈다(그리고 요금이 그쪽으로 나간다).
 */
export function providerFor(
  a: SubagentDef,
  configured: readonly string[],
  caller: string,
): string | null {
  if (!configured.length) return null;
  const want = a.model.trim().toLowerCase();
  const alias: Record<string, string> = {
    sonnet: "claude", opus: "claude", haiku: "claude", claude: "claude",
    gpt: "gpt", openai: "gpt", o3: "gpt", "gpt-5": "gpt",
    grok: "grok", xai: "grok",
    glm: "glm", zhipu: "glm",
  };
  const mapped = alias[want] ?? (configured.includes(want) ? want : "");
  if (mapped && configured.includes(mapped)) return mapped;
  if (configured.includes(caller)) return caller;
  return configured[0] ?? null;   // 위에서 빈 목록을 걸렀지만, 타입도 그걸 알아야 한다
}

/**
 * 이 서브에이전트에게 줄 도구.
 *
 * `tools` 가 비어 있으면 전부 준다(Claude Code 와 같은 규약). 값이 있으면 **그것만**
 * 준다 — 다만 이름이 하나도 안 맞으면 전부 막힌 채로 돌아 아무 일도 못 하므로,
 * 그때는 제한을 무시하고 전부 준다. 조용히 아무 도구도 없는 에이전트를 만드느니
 * 제한이 안 먹었다고 보고하는 편이 낫다(matched 로 알려 준다).
 */
export function filterTools<T extends { name: string }>(
  all: readonly T[],
  allowed: readonly string[],
): { tools: T[]; applied: boolean } {
  if (!allowed.length) return { tools: [...all], applied: false };
  const want = new Set(allowed.map(s => s.trim()).filter(Boolean));
  const kept = all.filter(t => want.has(t.name));
  if (!kept.length) return { tools: [...all], applied: false };
  return { tools: kept, applied: true };
}

/** 매니저 프롬프트에 실을 로스터 한 줄씩. 설명이 없으면 이름만. */
export function rosterLines(list: readonly SubagentDef[]): string[] {
  return list.map(a => {
    const where = a.owner ? ` (${a.owner})` : a.source === "project" ? " (프로젝트)" : "";
    return a.description ? `${targetIdOf(a)}${where} — ${a.description}` : `${targetIdOf(a)}${where}`;
  });
}

/** 위임받은 서브에이전트가 자기 지침을 시스템 프롬프트 뒤에 붙인다. */
export function personaSystem(a: SubagentDef): string {
  const head = `\n\n당신은 "${a.name}" 입니다.` + (a.description ? ` ${a.description}` : "");
  return a.prompt.trim() ? head + "\n" + a.prompt.trim() : head;
}
