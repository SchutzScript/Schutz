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
  /** 다른 도구에서 데려온 대화면 어디서 왔는지. 없으면 여기서 시작한 대화다.
   *
   *  가져온 뒤로는 완전히 내 대화다 — 편집도 이어하기도 된다. 이 값은 목록에 작은
   *  표식을 붙이는 데만 쓴다. 그래야 몇 주 뒤에 "이건 어디서 온 거지" 가 답이 된다. */
  source?: "claude" | "codex";
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

/** 색인을 갱신할 때 **원래 있던 것을 지켜야 하는** 필드를 꺼내온다.
 *
 *  대화를 저장할 때마다 색인 한 줄을 새로 만든다. 시각과 개수는 매번 다시 계산하는 게
 *  맞다. 하지만 두 가지는 다시 계산하면 안 된다.
 *
 *  `source` 는 계산으로 나오지 않는다 — 가져오던 그 순간에만 알 수 있다. 새로 만들면
 *  **저장 한 번에 출처가 지워진다.** 가져온 대화에 한 마디만 더 하면 배지가 사라진다.
 *
 *  `title` 은 가져온 대화에 한해 지킨다. titleFrom 은 첫 사용자 메시지에서 제목을 뽑는데,
 *  가져온 대화는 원본의 **끝부분만** 들고 온 것이라 그 "첫 메시지" 가 대화의 시작이 아니다.
 *  실제로 218MB 대화를 가져왔더니 목록에 붙은 이름이 "재게 ㄱ"(원본이 스스로 가진 제목)
 *  에서 "This session is being continued from a…"(잘린 창의 첫 줄, Claude Code 가 넣은
 *  압축 서문)로 바뀌었다. 원본이 가진 이름이 어떤 추정보다 낫다. */
export function carryOver(index: readonly ConvMeta[], id: string): Partial<Pick<ConvMeta, "source" | "title">> {
  const prev = index.find(c => c.id === id);
  if (!prev || !prev.source) return {};
  return { source: prev.source, ...(prev.title ? { title: prev.title } : {}) };
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
      .map(c => ({
        id: c.id, title: c.title, updatedAt: c.updatedAt,
        msgCount: Number.isFinite(c.msgCount) ? c.msgCount : 0,
        ...(c.source === "claude" || c.source === "codex" ? { source: c.source } : {}),
      }));
  } catch {
    return [];
  }
}
