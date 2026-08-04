/**
 * 확장의 파일 감시자 — `vscode.workspace.createFileSystemWatcher()`.
 *
 * 예전 셰임은 이랬다:
 *
 *   createFileSystemWatcher: () => ({
 *     onDidCreate: new EventEmitter().event,
 *     onDidChange: new EventEmitter().event,
 *     onDidDelete: new EventEmitter().event,
 *     dispose() {},
 *   }),
 *
 * 아무도 쏘지 않는 이미터 셋이다. 파일이 바뀌면 다시 읽는 확장(설정 파일 감시,
 * 빌드 산출물 추적, 인덱스 갱신)은 **한 번도 깨어나지 않았다.**
 *
 * 정작 경로는 처음부터 있었다. 메인의 `fs.watch(root, {recursive:true})` 는 바뀐
 * 파일 이름을 콜백으로 받아서 무시 규칙에 쓰고는 그대로 버렸고, 렌더러에는 "뭔가
 * 바뀌었다" 라는 빈 신호만 갔다.
 *
 * 순수 모듈이다.
 */

/** vscode 의 GlobPattern 중 실제로 쓰이는 문법만 정규식으로 옮긴다.
 *
 *  `**` 는 경로 구분자를 넘고, `*` 는 넘지 않는다 — 이 둘을 같게 다루면
 *  `*.json` 이 `a/b/c.json` 까지 잡아 확장이 엉뚱한 파일에 반응한다. */
export function globToRegExp(glob: string): RegExp {
  const g = String(glob || "").replace(/\\/g, "/").replace(/^\.\//, "");
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        // `**/` 는 "0개 이상의 디렉터리" 다. 슬래시까지 통째로 선택적이어야
        // `**/*.ts` 가 최상위의 `a.ts` 도 잡는다.
        if (g[i + 1] === "/") { i++; out += "(?:.*/)?"; }
        else out += ".*";
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === "{") out += "(?:";
    else if (c === "}") out += ")";
    else if (c === ",") out += "|";
    else if (c === "[") {
      // 문자 클래스는 그대로 넘긴다. 닫는 괄호가 없으면 평범한 글자로 본다.
      const end = g.indexOf("]", i + 1);
      if (end < 0) out += "\\[";
      else { out += g.slice(i, end + 1); i = end; }
    } else out += c.replace(/[.+^$()|\\]/g, "\\$&");
  }
  return new RegExp("^" + out + "$");
}

export function matchesGlob(re: RegExp, rel: string): boolean {
  return re.test(String(rel || "").replace(/\\/g, "/").replace(/^\/+/, ""));
}

export interface FsDelta {
  created: string[];
  changed: string[];
  deleted: string[];
}

/**
 * 바뀐 경로들을 만들어짐/고쳐짐/지워짐으로 나눈다.
 *
 * `touched` 는 워처가 알려 준 이름들이다. 그 이름만으로는 무슨 일이 있었는지 알 수
 * 없으므로(만들어졌는지 지워졌는지 고쳐졌는지), 앞뒤 트리에 있는지로 판정한다.
 *
 * 워처가 알려 주지 않은 경로도 트리 비교로 잡는다 — 대량 변경(브랜치 전환)에서
 * 개별 알림이 뭉개져도 만들어짐·지워짐은 놓치지 않는다.
 */
export function classify(prev: readonly string[], next: readonly string[], touched: readonly string[]): FsDelta {
  const P = new Set(prev), N = new Set(next);
  const created: string[] = [], changed: string[] = [], deleted: string[] = [];
  const seen = new Set<string>();

  for (const rel of touched) {
    const r = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!r || seen.has(r)) continue;
    seen.add(r);
    if (N.has(r) && !P.has(r)) created.push(r);
    else if (!N.has(r) && P.has(r)) deleted.push(r);
    // 양쪽에 다 있으면 내용이 바뀐 것. 양쪽에 다 없으면 우리가 모르는 파일이
    // 잠깐 생겼다 사라진 것이므로(빌드 임시 파일 등) 아무것도 쏘지 않는다.
    else if (N.has(r) && P.has(r)) changed.push(r);
  }
  for (const r of N) if (!P.has(r) && !seen.has(r)) { seen.add(r); created.push(r); }
  for (const r of P) if (!N.has(r) && !seen.has(r)) { seen.add(r); deleted.push(r); }

  return { created, changed, deleted };
}

export interface WatcherSpec {
  id: string;
  re: RegExp;
  ignoreCreate: boolean;
  ignoreChange: boolean;
  ignoreDelete: boolean;
  fire: (kind: "create" | "change" | "delete", rel: string) => void;
}

/** 델타를 등록된 감시자들에게 나눠 준다.
 *  하나가 던져도 나머지는 받아야 한다 — 남의 확장이 우리 확장을 막으면 안 된다. */
export function dispatch(watchers: Iterable<WatcherSpec>, delta: FsDelta): number {
  let sent = 0;
  const send = (w: WatcherSpec, kind: "create" | "change" | "delete", rels: readonly string[], skip: boolean) => {
    if (skip) return;
    for (const rel of rels) {
      if (!matchesGlob(w.re, rel)) continue;
      try { w.fire(kind, rel); sent++; } catch { /* 확장이 던진 것 */ }
    }
  };
  for (const w of watchers) {
    send(w, "create", delta.created, w.ignoreCreate);
    send(w, "change", delta.changed, w.ignoreChange);
    send(w, "delete", delta.deleted, w.ignoreDelete);
  }
  return sent;
}
