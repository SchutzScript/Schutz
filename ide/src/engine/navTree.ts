// TypeScript 언어 서비스가 주는 navigation tree 를 심볼 목록으로 편다.
//
// Monaco 의 워커 프록시는 `getNavigateToItems`(이름으로 찾기)를 노출하지 않는다.
// 실측하면 "Missing requestHandler or method" 가 난다. 대신 파일별 navigation tree 는
// 주므로, 그것을 모아 워크스페이스 심볼을 만든다.
//
// 여기는 트리를 펴는 일만 한다 — monaco 도 워커도 모른다. 줄·칸 변환은 모델을 쥔
// 쪽이 하고, 이 파일은 오프셋까지만 낸다.

/** TS navigation kind 문자열 → LSP SymbolKind 번호(대략). 화면 아이콘이 그 표를 쓴다. */
export const TS_KIND: Readonly<Record<string, number>> = {
  class: 5, interface: 11, enum: 10, function: 12, method: 6, property: 7,
  variable: 13, const: 14, module: 2, type: 26, alias: 26, constructor: 9, parameter: 13,
  getter: 6, setter: 6, "enum member": 22, "local function": 12, "local class": 5,
};

/** 정의가 아닌 것들. import 로 끌어온 이름은 TS 가 "alias" 로 준다 —
 *  "X 가 어디 정의돼 있지" 에 import 줄을 내미는 것은 답이 아니다.
 *  (실측: applyProposal 을 찾으면 editApply.test.ts 의 import 줄이 첫 결과로 나왔다.) */
const NOT_A_DEFINITION = new Set(["alias", "import"]);

export interface FlatSymbol {
  name: string;
  /** 담고 있는 것들을 점으로 이은 것. 최상위면 빈 문자열. */
  container: string;
  kind: number;
  /** 파일 안 오프셋. 부르는 쪽이 줄·칸으로 바꾼다. */
  offset: number;
}

/**
 * 트리를 펴서 이름이 `query` 를 품은 심볼만 낸다(대소문자 무시).
 *
 * 맨 위 노드는 파일 자신이라(`"app"` / module) 심볼이 아니다. 그 판정을 **부모 개수로
 * 하면 안 된다** — 파일 노드가 부모를 안 남기므로 그 자식들도 부모가 0개가 되어
 * 전부 "맨 위" 로 걸러진다. 실제로 그렇게 만들었다가 결과가 늘 비었다. 깊이로 센다.
 */
export function flattenNavTree(root: unknown, query: string): FlatSymbol[] {
  const q = String(query ?? "").toLowerCase();
  const out: FlatSymbol[] = [];
  walk(root, [], 0);
  // 이름이 정확히 같은 것을 먼저. 부분 일치가 위에 오면 정작 찾던 것을 스크롤해야 한다.
  if (q) out.sort((a, b) => rank(a.name) - rank(b.name));
  return out;

  function rank(name: string): number {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    return 2;
  }

  function walk(node: any, parents: string[], depth: number): void {
    if (!node || typeof node !== "object") return;
    const name = String(node.text ?? "");
    const isFile = depth === 0;
    const kindStr = String(node.kind ?? "");
    if (!isFile && name && !NOT_A_DEFINITION.has(kindStr) && (!q || name.toLowerCase().includes(q))) {
      out.push({
        name,
        container: parents.join("."),
        kind: TS_KIND[kindStr] ?? 0,
        offset: firstOffset(node),
      });
    }
    const next = isFile ? parents : [...parents, name];
    const kids = Array.isArray(node.childItems) ? node.childItems : [];
    for (const c of kids) walk(c, next, depth + 1);
  }
}

/** 테스트 파일인가 — 정의를 찾는 사람은 보통 테스트를 찾는 게 아니다.
 *
 *  TS 의 navigation tree 는 `describe("applyProposal", …)` 같은 블록도 그 문자열을
 *  이름으로 삼아 심볼로 준다. 그래서 "applyProposal 어디 있어" 의 첫 답이 테스트
 *  파일이 되곤 했다(실측). 지우지는 않는다 — 테스트를 찾는 경우도 있으니 뒤로만 민다. */
export function isTestPath(rel: string): boolean {
  return /(^|[\/.])(test|spec)\.[cm]?[jt]sx?$/i.test(rel) || /(^|\/)(__tests__|tests?)\//i.test(rel);
}

/** 심볼이 시작하는 자리. spans 가 없으면 0 — 그래도 파일은 맞으니 버리지 않는다. */
function firstOffset(node: any): number {
  const n = Number(node?.spans?.[0]?.start);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
