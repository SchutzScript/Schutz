// 대화 여러 개 — 색인과 제목 규칙.
//
// 지금까지 대화는 워크스페이스당 **하나**였다. 키 하나에 통째로 저장하고, /new 는 그걸
// 지웠다. 그래서 "최근 항목" 에 띄울 과거 대화가 애초에 존재하지 않았다.
//
// 여기 있는 건 순수 규칙뿐이다 — 색인을 어떻게 정렬하고, 제목을 어떻게 뽑고, 몇 개에서
// 자를지. 저장소도 시계도 만지지 않는다(둘 다 인자로 받는다). engine/·agentTimeline 과
// 같은 규칙이라 브라우저 없이 테스트할 수 있고, "저장이 틀렸나 규칙이 틀렸나" 가 갈린다.

/** 색인 한 줄. 본문은 따로 산다 — 목록을 그리려고 대화 50개를 전부 파싱할 이유가 없다. */
export interface ConvMeta {
  id: string;
  title: string;
  /** epoch ms. 정렬 기준이자 "오늘/어제" 묶음의 기준. */
  updatedAt: number;
  msgCount: number;
}

/** 이 이상은 들고 있지 않는다. 브라우저 저장소는 5MB 안팎이고 대화 하나가 수십 KB 다. */
export const CONV_CAP = 50;

/** 제목은 첫 **사용자** 메시지에서 뽑는다.
 *
 *  에이전트 답변으로 뽑으면 목록이 전부 "네, 확인했습니다…" 로 시작해 서로 구분이 안 된다.
 *  줄바꿈은 공백으로 눕히고(목록은 한 줄이다) 40자에서 자른다. */
export function titleFrom(
  messages: readonly { role?: string; text?: string }[],
  fallback: string,
): string {
  const first = messages.find(m => m.role === "user" && (m.text ?? "").trim());
  const raw = (first?.text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  return raw.length > 40 ? raw.slice(0, 40) + "…" : raw;
}

/** 색인에 하나를 얹거나 갱신하고 최신순으로 정렬한다. 같은 id 는 덮어쓴다. */
export function upsert(index: readonly ConvMeta[], meta: ConvMeta): ConvMeta[] {
  const out = index.filter(c => c.id !== meta.id);
  out.push(meta);
  // updatedAt 이 같으면(같은 밀리초에 두 번 저장) 원래 순서를 뒤집지 않는다 — 목록이
  // 이유 없이 재배열되는 것처럼 보인다.
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c.updatedAt - a.c.updatedAt) || (a.i - b.i))
    .map(x => x.c);
}

/** 상한을 넘으면 오래된 것부터 떨어뜨린다. 떨어진 것들의 본문도 지워야 하므로 함께 돌려준다. */
export function prune(index: readonly ConvMeta[], cap: number = CONV_CAP): { kept: ConvMeta[]; dropped: ConvMeta[] } {
  if (index.length <= cap) return { kept: [...index], dropped: [] };
  return { kept: index.slice(0, cap), dropped: index.slice(cap) };
}

/** 목록을 오늘 / 어제 / 이전으로 나눈다. now 를 받는 이유는 테스트가 결정론적이어야 해서다. */
export function groupByDay(index: readonly ConvMeta[], now: number): { today: ConvMeta[]; yesterday: ConvMeta[]; older: ConvMeta[] } {
  const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const t0 = startOfDay(now);
  const y0 = t0 - 86_400_000;
  const today: ConvMeta[] = [], yesterday: ConvMeta[] = [], older: ConvMeta[] = [];
  for (const c of index) {
    if (c.updatedAt >= t0) today.push(c);
    else if (c.updatedAt >= y0) yesterday.push(c);
    else older.push(c);
  }
  return { today, yesterday, older };
}

/** 저장된 색인을 신뢰하지 않고 걸러낸다 — 손상된 항목 하나가 목록 전체를 죽이면 안 된다. */
export function parseIndex(raw: string | null): ConvMeta[] {
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    if (!Array.isArray(d)) return [];
    return d
      .filter((c: unknown): c is ConvMeta =>
        !!c && typeof c === "object"
        && typeof (c as ConvMeta).id === "string" && !!(c as ConvMeta).id
        && typeof (c as ConvMeta).title === "string"
        && Number.isFinite((c as ConvMeta).updatedAt))
      .map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, msgCount: Number.isFinite(c.msgCount) ? c.msgCount : 0 }));
  } catch {
    return [];
  }
}
