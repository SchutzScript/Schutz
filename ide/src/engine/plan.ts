// 모델이 올린 계획을 화면 상태로 합치는 규칙.
//
// App.tsx 밖에 두는 이유: App.tsx 를 import 하면 monaco·electron 이 딸려와
// vitest 의 node 환경 전제가 깨진다. engine/ 은 import 0 규칙을 지키므로
// vitest.config.ts 의 `src/engine/**/*.test.ts` 글롭에 자동으로 잡힌다.

/** ide/data.ts 의 PlanItem 과 같은 모양. 여기서 다시 적는 이유는 위와 같다 —
 *  data.ts 는 React 를 끌어오는 모듈들과 한 묶음이다. */
export interface PlanStep {
  id: string;
  label: string;
  agent: string;
  st: "pending" | "active" | "done" | "stopped";
}

export const PLAN_MAX = 20;

/** 모델이 보낸 단계 목록을 정리한다 — 빈 라벨 제거, 중복 제거, 상한 적용. */
export function normalizeSteps(raw: unknown): { label: string; done: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { label: string; done: boolean }[] = [];
  for (const x of raw) {
    const label = String((x as any)?.label ?? "").trim();
    if (!label || seen.has(label)) continue;   // 같은 라벨이 둘이면 뒤엣것은 버린다(id 충돌)
    seen.add(label);
    out.push({ label, done: !!(x as any)?.done });
    if (out.length >= PLAN_MAX) break;
  }
  return out;
}

/** 올라온 계획을 기존 상태에 합친다.
 *
 *  통째로 갈아끼우지 않는 이유: 모델은 단계를 끝낼 때마다 전체 목록을 다시 보낸다.
 *  매번 새 배열이면 React key 가 바뀌어 진행 중 스피너가 껌뻑이고, 안 끝난 단계의
 *  애니메이션이 처음부터 다시 돈다. 라벨이 같으면 같은 항목으로 보고 상태만 옮긴다.
 *
 *  "지금 하는 것" 은 모델이 알려주지 않는다 — 안 끝난 것 중 **첫 번째**를 active 로
 *  본다. 사람이 계획을 읽는 방식과 같다. 전부 끝났으면 active 는 없다. */
export function mergePlan(
  prev: PlanStep[],
  steps: { label: string; done: boolean }[],
  agent: string,
): PlanStep[] {
  const byLabel = new Map(prev.map(p => [p.label, p]));
  const firstOpen = steps.findIndex(s => !s.done);
  return steps.map((s, i) => {
    const old = byLabel.get(s.label);
    const st: PlanStep["st"] = s.done ? "done" : i === firstOpen ? "active" : "pending";
    // id 는 라벨에서 뽑아 안정적으로 만든다 — 순서가 바뀌어도 같은 단계면 같은 key 다.
    return {
      id: old?.id ?? "pl:" + i + ":" + s.label.slice(0, 32),
      label: s.label,
      agent: old?.agent ?? agent,
      st,
    };
  });
}

/** 실행이 멈췄을 때 — 진행 중이던 것만 stopped 로. 끝난 것은 끝난 채로 둔다. */
export function stopPlan(prev: PlanStep[]): PlanStep[] {
  return prev.map(p => (p.st === "active" ? { ...p, st: "stopped" as const } : p));
}
