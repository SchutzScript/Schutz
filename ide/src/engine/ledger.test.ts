import { describe, expect, it } from "vitest";
import { counterIds, fixedClock } from "./ids";
import { DelegationLedger } from "./ledger";
import type { DelegationRequest, RejectReason } from "./types";

function led() {
  return new DelegationLedger({ ids: counterIds(), clock: fixedClock(1000, 10) });
}

const req = (over: Partial<DelegationRequest> = {}): DelegationRequest => ({
  parentRunId: "r1",
  fromAgent: "claude",
  toAgent: "gpt",
  task: "파서를 고쳐줘",
  ...over,
});

describe("DelegationLedger — 시도와 실제를 구분", () => {
  // 예전에는 루프 지역 boolean `delegated` 하나였고, execTool 이 실행되기 **전에** 켜졌다.
  // 그래서 알 수 없는 에이전트·미연결·이미 작업 중 세 오류 모두 "위임함" 으로 집계돼
  // 거짓 주장 가드를 통과했다. 사용자가 가장 방치되기 쉬운 경우가 정확히 거기다.
  const reasons: RejectReason[] = [
    "unknown-agent",
    "self-delegation",
    "not-configured",
    "agent-busy",
    "depth-exceeded",
    "per-turn-cap",
    "concurrency-cap",
    "duplicate-target",
    "cycle",
  ];

  for (const reason of reasons) {
    it(`거절(${reason}) → attempted=true, did=false`, () => {
      const l = led();
      const id = l.request(req(), 1);
      l.reject(id, reason);

      expect(l.attemptedDelegate("r1")).toBe(true);
      expect(l.didDelegate("r1")).toBe(false); // ← 옛 boolean 은 여기서 true 였다
      expect(l.view(id)?.rejection).toBe(reason);
      expect(l.view(id)?.state).toBe("rejected");
    });
  }

  it("started 가 있어야 didDelegate 가 true", () => {
    const l = led();
    const id = l.request(req(), 1);
    expect(l.didDelegate("r1")).toBe(false);
    l.start(id, "r2");
    expect(l.didDelegate("r1")).toBe(true);
  });
});

describe("DelegationLedger — 순서가 어긋난 호출에도 안 깨진다", () => {
  it("start 없이 settle 해도 조용히 무시", () => {
    const l = led();
    const id = l.request(req(), 1);
    expect(() => l.settle(id, { status: "aborted" })).not.toThrow();
    expect(l.view(id)?.state).toBe("settled");
  });

  it("이중 settle 은 두 번째가 무시된다", () => {
    const l = led();
    const id = l.request(req(), 1);
    l.start(id, "r2");
    l.settle(id, { status: "completed", text: "첫 결과", rounds: 2, stopCause: "end" });
    l.settle(id, { status: "failed", message: "늦게 온 실패" });
    expect(l.view(id)?.outcome).toMatchObject({ status: "completed", text: "첫 결과" });
  });

  it("거절된 뒤에는 settle 이 먹지 않는다", () => {
    const l = led();
    const id = l.request(req(), 1);
    l.reject(id, "agent-busy");
    l.settle(id, { status: "completed", text: "x", rounds: 1, stopCause: "end" });
    expect(l.view(id)?.state).toBe("rejected");
    expect(l.view(id)?.outcome).toBeNull();
  });

  it("모르는 id 에 대한 호출은 무시", () => {
    const l = led();
    expect(() => l.reject("없음", "cycle")).not.toThrow();
    expect(() => l.start("없음", "r9")).not.toThrow();
    expect(() => l.settle("없음", { status: "aborted" })).not.toThrow();
  });
});

describe("DelegationLedger — 집계", () => {
  it("pendingFor 는 requested/running 만, allSettled 는 그 반대", () => {
    const l = led();
    const a = l.request(req({ toAgent: "gpt" }), 1);
    const b = l.request(req({ toAgent: "grok" }), 1);
    l.start(a, "r2");
    l.start(b, "r3");
    expect(l.pendingFor("r1")).toHaveLength(2);
    expect(l.allSettled("r1")).toBe(false);

    l.settle(a, { status: "completed", text: "A", rounds: 1, stopCause: "end" });
    l.settle(b, { status: "failed", message: "B 실패" });
    expect(l.pendingFor("r1")).toHaveLength(0);
    expect(l.allSettled("r1")).toBe(true);
  });

  it("openCount 는 전역, targetsFor 는 거절을 제외한다", () => {
    const l = led();
    const a = l.request(req({ toAgent: "gpt" }), 1);
    const b = l.request(req({ toAgent: "grok" }), 1);
    l.start(a, "r2");
    l.reject(b, "agent-busy");

    expect(l.openCount()).toBe(1);
    expect(l.targetsFor("r1")).toEqual(["gpt"]); // 거절된 grok 은 턴 예산을 안 먹는다
  });

  it("events() 는 복사본 — 밖에서 변조해도 원장은 그대로", () => {
    const l = led();
    l.request(req(), 1);
    const snapshot = l.events();
    (snapshot as unknown as unknown[]).length = 0;
    expect(l.events()).toHaveLength(1);
  });
});
