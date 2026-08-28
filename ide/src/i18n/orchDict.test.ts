import { describe, it, expect } from "vitest";
import { dict } from "./dict/orch";

// 이 사전의 문구는 화면이 아니라 **모델**이 읽는다. 키가 하나 빠지면 t() 가 키 이름을
// 그대로 돌려주고, 관리자 모델은 "orch.lineSkipFailed" 라는 글자를 결과로 받아
// 사용자에게 요약한다 — 실패가 실패로 안 보이는 가장 나쁜 모양이다.
// 그래서 App.tsx 가 부르는 키와 사전을 맞대어 본다.

/** App.tsx 의 graphReport/planErrorText/씨앗이 실제로 부르는 키 전부. */
const USED = [
  "orch.panelLabel", "orch.panelCount", "orch.panelThen", "orch.panelBlocked", "orch.panelNoResult",
  "orch.noTasks", "orch.tooMany", "orch.badGraph",
  "orch.errCycle", "orch.errUnknownDep", "orch.errSelfDep", "orch.errDupId", "orch.errEmptyId",
  "orch.priorBlock", "orch.priorOne", "orch.priorEmpty",
  "orch.head", "orch.lineDone", "orch.lineEmpty", "orch.lineFailed", "orch.lineAborted",
  "orch.lineSkipFailed", "orch.lineSkipAborted", "orch.lineSkipBlocked", "orch.lineOpen",
] as const;

const LANGS = ["ko", "en", "de", "ja"] as const;

describe("orch 사전", () => {
  it("쓰는 키가 전부 있다", () => {
    expect(USED.filter(k => !(k in dict))).toEqual([]);
  });

  it("안 쓰는 키를 남겨 두지 않는다", () => {
    expect(Object.keys(dict).filter(k => !USED.includes(k as any))).toEqual([]);
  });

  it("4개 언어가 다 있고 빈 문자열이 없다", () => {
    const holes: string[] = [];
    for (const [k, v] of Object.entries(dict)) {
      for (const l of LANGS) if (!String((v as any)[l] ?? "").trim()) holes.push(k + "/" + l);
    }
    expect(holes).toEqual([]);
  });

  // 자리표시자가 언어마다 다르면 그 언어에서만 값이 빠진 채로 모델에게 간다.
  it("자리표시자가 네 언어에서 같다", () => {
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    const bad: string[] = [];
    for (const [k, v] of Object.entries(dict)) {
      const base = JSON.stringify(slots((v as any).ko));
      for (const l of LANGS) if (JSON.stringify(slots((v as any)[l])) !== base) bad.push(k + "/" + l);
    }
    expect(bad).toEqual([]);
  });

  // 못 돈 작업 줄에는 id 와 이유가 반드시 들어가야 한다. 하나라도 빠지면
  // 모델이 "무엇이" 안 됐는지 못 적는다.
  it("못 돈 작업 줄은 id·대상·원인을 다 담는다", () => {
    for (const k of ["orch.lineSkipFailed", "orch.lineSkipAborted", "orch.lineSkipBlocked"]) {
      for (const l of LANGS) {
        const s = (dict[k] as any)[l] as string;
        expect(s, k + "/" + l).toContain("{id}");
        expect(s, k + "/" + l).toContain("{agent}");
        expect(s, k + "/" + l).toContain("{dep}");
      }
    }
  });
});
