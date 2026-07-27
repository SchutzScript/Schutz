// 제안 묶음 → "이번 변경 전체" 요약.
//
// README 의 네 번째 기둥("여러 파일이 움직일 때 전체를 한 화면에")을 채우는 자리다.
// 예전엔 이 요약을 s.files 라는 **별도 상태**로 들고 있었고, 그걸 채우는 addFile 은
// 데모 스크립트에서만 불렸다 — 그래서 실사용에서 늘 비어 있었다.
//
// 여기서는 별도 상태를 두지 않고 **제안에서 직접 유도한다.** 제안이 곧 변경이므로
// 두 곳을 동기화할 일이 없다. 제안이 거절되면 요약에서도 저절로 사라진다.

export interface ChangeInput {
  rel: string;
  agent: string;
  status: "pending" | "accepted" | "rejected" | "failed";
  /** 치환 대상 원문. 빈 문자열이면 새 파일 생성. */
  find: string;
  /** 새 텍스트 */
  replace: string;
}

export interface FileChange {
  rel: string;
  /** 이 파일을 건드린 에이전트들 — 대개 하나지만 병렬 위임에서 둘이 될 수 있다 */
  agents: string[];
  add: number;
  del: number;
  /** 이 파일에 걸린 제안 수 */
  count: number;
  /** 하나라도 pending 이면 pending, 아니면 전부 accepted 일 때만 accepted */
  status: "pending" | "accepted" | "rejected" | "failed";
}

/** 줄 수를 센다. 빈 문자열은 0줄 — "" 를 split 하면 [""] 가 나와 1이 되는 함정을 피한다. */
export function lineCount(s: string): number {
  if (!s) return 0;
  return s.split("\n").length;
}

/** 제안 하나의 증감. 새 파일이면 전부 추가, 지우기면 전부 삭제. */
export function statsOf(p: ChangeInput): { add: number; del: number } {
  return { add: lineCount(p.replace), del: lineCount(p.find) };
}

/** 파일 상태를 합친다 — 하나라도 안 끝났으면 안 끝난 것이다. */
function foldStatus(cur: FileChange["status"], next: ChangeInput["status"]): FileChange["status"] {
  if (cur === "pending" || next === "pending") return "pending";
  if (cur === "failed" || next === "failed") return "failed";
  if (cur === "accepted" || next === "accepted") return "accepted";
  return "rejected";
}

/** 제안 목록 → 파일별 요약. 거절된 것은 빼고 센다 — 되돌린 변경은 변경이 아니다.
 *  순서는 처음 등장한 순서를 지킨다(작업한 순서로 읽힌다). */
export function summarizeChanges(proposals: ChangeInput[]): FileChange[] {
  const byRel = new Map<string, FileChange>();
  for (const p of proposals) {
    if (p.status === "rejected") continue;
    const { add, del } = statsOf(p);
    const cur = byRel.get(p.rel);
    if (!cur) {
      byRel.set(p.rel, { rel: p.rel, agents: [p.agent], add, del, count: 1, status: p.status });
    } else {
      cur.add += add;
      cur.del += del;
      cur.count += 1;
      cur.status = foldStatus(cur.status, p.status);
      if (!cur.agents.includes(p.agent)) cur.agents.push(p.agent);
    }
  }
  return [...byRel.values()];
}

/** 헤더에 쓸 한 줄 총계. */
export function totalOf(files: FileChange[]): { files: number; add: number; del: number } {
  return {
    files: files.length,
    add: files.reduce((n, f) => n + f.add, 0),
    del: files.reduce((n, f) => n + f.del, 0),
  };
}
