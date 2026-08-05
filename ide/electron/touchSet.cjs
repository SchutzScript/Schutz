// 워처가 알려 준 경로를 한 번의 알림으로 모으는 자루.
//
// 예전엔 `if (touched.size < MAX_TOUCHED) touched.add(...)` 한 줄이었다. 상한을 넘으면
// **말없이 버렸다.** 앱 자신은 멀쩡하다(새로고침 때 트리를 통째로 다시 읽으니까).
// 손해는 확장의 파일 감시자가 본다 — 브랜치를 갈아타 파일 3000개가 바뀌면 확장은
// 앞의 것만 통보받고 나머지는 영영 모른 채, 자기가 다 안다고 여긴다.
//
// 두 가지를 고친다. 상한을 실제 저장소 크기에 맞게 올리고(2000 → 20000), 그래도
// 넘치면 넘쳤다고 말한다. 조용히 자르는 것만은 안 한다.

const DEFAULT_MAX = 20000;

function makeTouchSet(max = DEFAULT_MAX) {
  let set = new Set();
  let dropped = 0;
  return {
    add(rel) {
      const r = String(rel || "").replace(/\\/g, "/");
      if (!r) return;
      if (set.has(r)) return;
      if (set.size >= max) { dropped++; return; }
      set.add(r);
    },
    get size() { return set.size; },
    /** 상한에 걸려 버린 경로가 있었나 — 있으면 이 알림은 전부가 아니다. */
    get overflowed() { return dropped > 0; },
    get dropped() { return dropped; },
    /** 모은 것을 꺼내고 자루를 비운다. */
    drain() {
      const rels = [...set];
      const info = { rels, overflow: dropped > 0, dropped };
      set = new Set();
      dropped = 0;
      return info;
    },
  };
}

module.exports = { makeTouchSet, DEFAULT_MAX };
