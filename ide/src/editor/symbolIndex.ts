// 워크스페이스 심볼 찾기 — 이름으로 정의 자리를 찾는다.
//
// 두 군데서 온다.
//   1. LSP 세션 (pyright 등) — workspace/symbol
//   2. Monaco 의 TS 워커 — 파일별 navigation tree 를 모아서
//
// 2번이 빠져 있었다. Ctrl+T 는 lspClient 만 물어봤는데 TS/JS 는 LSP 세션이 아니라
// Monaco 내장 워커가 맡는다. 그래서 TypeScript 프로젝트에서 Ctrl+T 가 늘 빈 목록이었다.
// 이 저장소 자체가 그렇다.
//
// 색인이 아예 없어서 못 찾은 것과 찾아봤는데 없는 것은 다르다. 그 둘을 갈라서 낸다 —
// 안 그러면 "그런 심볼 없음" 이 "그 언어는 지원 안 함" 을 덮어 버린다.

import monaco from "./monacoSetup";
import * as lspClient from "./lspClient";
import * as projectModels from "./projectModels";
import { flattenNavTree, orderSymbols } from "../engine/navTree";

export interface SymbolHit {
  name: string;
  /** 클래스명 등 담고 있는 것. 없으면 빈 문자열. */
  container: string;
  /** LSP SymbolKind 번호. 모르면 0. */
  kind: number;
  rel: string;
  line: number;
  column: number;
  /** 어디서 왔나 — 한계를 설명할 때 쓴다. */
  from: "ts" | "lsp";
}

export interface SymbolAnswer {
  hits: SymbolHit[];
  /** 실제로 물어본 곳. 비어 있으면 이 워크스페이스에는 심볼 색인이 없다. */
  sources: ("ts" | "lsp")[];
  /** 모델이 너무 많아 다 훑지 못했다 — "없다" 를 단정하면 안 되는 경우. */
  capped: boolean;
  /** 파일이 너무 많아 색인을 아예 만들지 않았다. "이 언어는 지원 안 함" 과 다르다. */
  tooBig: boolean;
  /** 상한에서 잘랐다 — 보여준 것이 전부가 아니다. */
  sliced: boolean;
}

/** 워커가 주는 파일 이름(모델 uri) → 워크스페이스 상대 경로 */
function relOfUri(uri: string): string | null {
  return projectModels.relFor(uri);
}

/** 한 번에 훑을 모델 수. 넘으면 훑다 만 것이므로 그렇다고 말한다. */
export const TS_MODEL_CAP = 400;

async function fromTypescript(query: string, max: number): Promise<{ hits: SymbolHit[]; available: boolean; capped: boolean }> {
  const ts: any = (monaco.languages as any).typescript;
  if (!ts?.getTypeScriptWorker) return { hits: [], available: false, capped: false };
  const models = monaco.editor.getModels()
    .filter(m => !m.isDisposed() && /typescript|javascript/.test(m.getLanguageId()) && projectModels.relFor(m.uri.toString()));
  if (!models.length) return { hits: [], available: false, capped: false };


  // Monaco 의 워커 프록시는 getNavigateToItems 를 노출하지 않는다(실측: "Missing
  // requestHandler or method"). 대신 파일별 navigation tree 를 주므로, 그걸 모아
  // 워크스페이스 심볼을 만든다. 모델은 preload 가 세워 두어 안 연 파일도 들어온다.
  let getWorker: any;
  try { getWorker = await ts.getTypeScriptWorker(); } catch { return { hits: [], available: true, capped: false }; }

  const q = query;
  const scan = models.slice(0, TS_MODEL_CAP);
  const out: SymbolHit[] = [];
  await Promise.all(scan.map(async (m) => {
    if (out.length >= max) return;
    const rel = projectModels.relFor(m.uri.toString());
    if (!rel) return;
    try {
      const client = await getWorker(m.uri);
      const tree = await client.getNavigationTree(m.uri.toString());
      for (const f of flattenNavTree(tree, q)) {
        const pos = m.getPositionAt(f.offset);
        out.push({ name: f.name, container: f.container, kind: f.kind, rel, line: pos.lineNumber, column: pos.column, from: "ts" });
      }
    } catch { /* 이 파일은 건너뛴다 — 워커가 아직 모르거나 파싱 실패 */ }
  }));
  return { hits: out, available: true, capped: models.length > scan.length };
}

async function fromLsp(query: string): Promise<{ hits: SymbolHit[]; available: boolean }> {
  const raw = await lspClient.workspaceSymbols(query).catch(() => []);
  const hits: SymbolHit[] = [];
  for (const s of raw ?? []) {
    const loc = s?.location ?? s;
    const uri = String(loc?.uri ?? "");
    const rel = relOfUri(uri) ?? uriToRel(uri);
    if (!rel) continue;
    const start = loc?.range?.start ?? { line: 0, character: 0 };
    hits.push({
      name: String(s?.name ?? ""),
      container: String(s?.containerName ?? ""),
      kind: Number(s?.kind ?? 0),
      rel,
      line: Number(start.line ?? 0) + 1,
      column: Number(start.character ?? 0) + 1,
      from: "lsp",
    });
  }
  return { hits, available: lspClient.liveSessionCount() > 0 };
}

/** LSP 는 파일 uri 를 그대로 준다 — 모델이 없을 수도 있어 경로에서 직접 뗀다. */
function uriToRel(uri: string): string | null {
  const root = projectModels.currentRootPath();
  if (!root) return null;
  let p = String(uri || "");
  if (/^file:\/\//i.test(p)) {
    try { p = decodeURIComponent(p.replace(/^file:\/\/\/?/i, "")); } catch { /* 망가진 인코딩 */ }
  }
  const a = p.replace(/\\/g, "/").toLowerCase();
  const b = root.replace(/\\/g, "/").toLowerCase();
  if (!a.startsWith(b)) return null;
  return p.replace(/\\/g, "/").slice(root.length).replace(/^\/+/, "") || null;
}

/** 파일이 너무 많아 색인을 아예 안 만든 상태인가. 답을 고를 때 쓴다. */
export function isTooBig(): boolean { return projectModels.isPreloadSkipped(); }

/** 이름으로 심볼을 찾는다. 두 통로에 모두 물어보고 합친다. */
export async function findSymbols(query: string, max = 100): Promise<SymbolAnswer> {
  const q = String(query ?? "").trim();
  if (!q) return { hits: [], sources: [], capped: false, tooBig: false, sliced: false };
  const [ts, lsp] = await Promise.all([fromTypescript(q, max), fromLsp(q)]);
  const sources: ("ts" | "lsp")[] = [];
  if (ts.available) sources.push("ts");
  if (lsp.available) sources.push("lsp");

  // 같은 자리를 두 통로가 다 주면 하나만 남긴다.
  const seen = new Set<string>();
  const hits: SymbolHit[] = [];
  for (const h of [...ts.hits, ...lsp.hits]) {
    const key = h.rel + ":" + h.line + ":" + h.name;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(h);
  }
  // 자르기 전에 전체를 다시 세운다 — 정확 일치가 뒤쪽 파일에 있어도 살아남게.
  const ordered = orderSymbols(hits, q);
  return {
    hits: ordered.slice(0, max),
    sources,
    capped: ts.capped,
    tooBig: projectModels.isPreloadSkipped(),
    sliced: ordered.length > max,
  };
}

// ── 참조 찾기 ───────────────────────────────────────────────────────────────
//
// "이거 누가 쓰지" 는 심볼 찾기의 반대 방향이고, grep 으로는 답이 안 나온다 — 같은
// 이름의 다른 것과 주석까지 다 걸리기 때문이다. TS 워커는 getNavigateToItems 와 달리
// getReferencesAtPosition 을 내준다(실측 확인).

export interface RefHit { rel: string; line: number; column: number }

export interface RefAnswer {
  /** 어느 정의를 기준으로 찾았나. 못 정하면 null. */
  at: { rel: string; line: number; name: string } | null;
  hits: RefHit[];
  /** 이름이 여러 군데 정의돼 있어 고를 수 없었다 — 어디를 뜻하는지 되물어야 한다. */
  ambiguous: { rel: string; line: number }[];
  /** 심볼 색인 자체가 없다. */
  noIndex: boolean;
  /** 참조를 실제로 물어봤는가. false 면 "참조 없음" 이라고 말하면 안 된다 —
   *  안 물어본 것과 물어봤는데 없는 것은 다르다. */
  asked: boolean;
}

/** 이름으로 정의를 찾고, 그 자리에서 참조를 묻는다. */
export async function findReferences(name: string, inFile?: string): Promise<RefAnswer> {
  const q = String(name ?? "").trim();
  if (!q) return { at: null, hits: [], ambiguous: [], noIndex: false, asked: false };

  const found = await findSymbols(q, 50);
  if (!found.sources.length) return { at: null, hits: [], ambiguous: [], noIndex: true, asked: false };

  // 이름이 정확히 같은 것만 남긴다. 부분 일치까지 세면 엉뚱한 것을 기준으로 잡는다.
  let exact = found.hits.filter(h => h.name === q);
  if (inFile) exact = exact.filter(h => h.rel === inFile || h.rel.endsWith("/" + inFile));
  if (!exact.length) return { at: null, hits: [], ambiguous: [], noIndex: false, asked: false };
  if (exact.length > 1) {
    return { at: null, hits: [], ambiguous: exact.map(h => ({ rel: h.rel, line: h.line })), noIndex: false, asked: false };
  }

  const def = exact[0]!;
  const model = projectModels.getByRel(def.rel);
  if (!model || model.isDisposed()) return { at: null, hits: [], ambiguous: [], noIndex: false, asked: false };

  const ts: any = (monaco.languages as any).typescript;
  if (!ts?.getTypeScriptWorker) return { at: { rel: def.rel, line: def.line, name: def.name }, hits: [], ambiguous: [], noIndex: false, asked: false };

  const offset = model.getOffsetAt({ lineNumber: def.line, column: def.column });
  const hits: RefHit[] = [];
  let asked = false;
  try {
    const getWorker = await ts.getTypeScriptWorker();
    const client = await getWorker(model.uri);
    const refs: any[] = await client.getReferencesAtPosition(model.uri.toString(), offset);
    asked = true;   // 물어보는 데 성공했다 — 이제 "없다" 고 말해도 된다
    for (const r of refs ?? []) {
      const rel = projectModels.relFor(String(r?.fileName ?? ""));
      if (!rel) continue;
      const m = projectModels.getByRel(rel);
      if (!m || m.isDisposed()) continue;
      const pos = m.getPositionAt(Number(r?.textSpan?.start ?? 0));
      hits.push({ rel, line: pos.lineNumber, column: pos.column });
    }
  } catch { /* 워커가 아직 모르는 파일 */ }

  return { at: { rel: def.rel, line: def.line, name: def.name }, hits, ambiguous: [], noIndex: false, asked };
}
