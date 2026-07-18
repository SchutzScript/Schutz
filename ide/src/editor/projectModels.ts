import monaco, { languageOf } from "./monacoSetup";
import * as lsp from "./lspClient";

/**
 * 프로젝트 파일 모델 스토어 (모듈 싱글턴).
 * 파일간 인텔리전스·진단은 열지 않은 파일도 워커에 살아있어야 하므로,
 * 페인(언마운트로 소멸)이 아니라 이 스토어가 파일-URI 모델을 소유한다.
 */

const TS_EXT = new Set(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]);
const EXCLUDE = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".astro", "release"]);
const MAX_FILES = 500;
const MAX_BYTES = 400_000;

const owned = new Map<string, monaco.editor.ITextModel>(); // uriString → model
const relIndex = new Map<string, string>(); // rel → uriString
const savedContent = new Map<string, string>(); // uriString → 마지막 디스크 내용
let currentRoot: string | null = null;

function uriFor(root: string, rel: string): monaco.Uri {
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "");
  return monaco.Uri.file(base + "/" + rel);
}

export function relFor(uriString: string): string | null {
  if (!currentRoot) return null;
  for (const [rel, u] of relIndex) if (u === uriString) return rel;
  return null;
}

export function getByRel(rel: string): monaco.editor.ITextModel | null {
  const u = relIndex.get(rel);
  if (u) { const m = owned.get(u); if (m && !m.isDisposed()) return m; }
  return null;
}

/** 모델 확보 — 이미 있으면 재사용(중복 URI createModel throw 회피) */
export function ensure(root: string, rel: string, content: string, lang?: string): monaco.editor.ITextModel {
  const uri = uriFor(root, rel);
  const key = uri.toString();
  const existing = monaco.editor.getModel(uri);
  if (existing) { owned.set(key, existing); relIndex.set(rel, key); savedContent.set(key, existing.getValue()); return existing; }
  const language = lang ?? languageOf(rel);
  const model = monaco.editor.createModel(content, language, uri);
  owned.set(key, model);
  relIndex.set(rel, key);
  savedContent.set(key, content);
  // 비-TS 언어(LSP 후보) 모델: 변경 스트림 연결 + 문서 개방.
  // isTsLike는 시간 독립적이라 lspLangs 초기화 레이스와 무관하게 리스너를 붙인다.
  // didOpen/didChange는 세션이 준비되면 발효(그 전엔 no-op), initLsp 후 syncOpenModels가 보정.
  if (!isTsLike(rel)) {
    const us = uri.toString();
    void lsp.didOpen(us, language, content);
    // didChange 는 debounce 하지 않고 즉시 전송 — 디바운스하면 `.`/`(` 직후 즉발되는 completion/signatureHelp 요청이
    // 아직 서버에 반영 안 된 stale 문서로 평가돼 빈/틀린 결과가 나옴(로컬 LSP full-text sync 는 저렴).
    model.onDidChangeContent(() => { if (!model.isDisposed()) void lsp.didChange(us, language, model.getValue()); });
  }
  return model;
}

/** 디스크와 다른(미저장) 모델의 rel 목록 — 크로스파일 리네임 등 */
export function dirtyRels(): string[] {
  const out: string[] = [];
  for (const [rel, key] of relIndex) {
    const m = owned.get(key);
    if (m && !m.isDisposed() && m.getValue() !== (savedContent.get(key) ?? "")) out.push(rel);
  }
  return out;
}
/** 디스크에 저장했음을 기록 */
export function markSaved(root: string, rel: string, content: string): void {
  savedContent.set(uriFor(root, rel).toString(), content);
  externalChanged.delete(rel); // 방금 우리가 썼으니 기준선은 우리 것 — 충돌 해소
}

/** 이 파일의 마지막 디스크(저장) 기준 내용 — 외부 리로드로 갱신될 수 있음. 없으면 undefined */
export function getSaved(root: string, rel: string): string | undefined {
  return savedContent.get(uriFor(root, rel).toString());
}

export function isTsLike(rel: string): boolean {
  return TS_EXT.has((rel.split(".").pop() ?? "").toLowerCase());
}

/** 워크스페이스 TS/JS 파일을 미리 로드 → 파일간 인텔리전스. 캡 초과 시 skipped=true */
export async function preload(
  root: string,
  entries: { rel: string; dir: boolean }[],
  readFile: (root: string, rel: string) => Promise<string>,
  isDirty: (rel: string) => boolean = () => false,
): Promise<{ loaded: number; skipped: boolean }> {
  currentRoot = root;
  const targets = entries.filter(e =>
    !e.dir && isTsLike(e.rel) && !e.rel.split("/").some(seg => EXCLUDE.has(seg)),
  );
  if (targets.length > MAX_FILES) return { loaded: 0, skipped: true };

  let loaded = 0;
  const conc = 8;
  let i = 0;
  async function worker() {
    while (i < targets.length) {
      const t = targets[i++];
      if (isDirty(t.rel)) continue; // 편집 중이면 건너뜀
      try {
        const text = await readFile(root, t.rel);
        if (text.length > MAX_BYTES) continue;
        ensure(root, t.rel, text);
        loaded++;
      } catch { /* 읽기 실패 무시 */ }
    }
  }
  await Promise.all(Array.from({ length: conc }, () => worker()));
  return { loaded, skipped: false };
}

/** 외부에서 디스크가 바뀌었는데 버퍼가 미저장이라 자동 반영할 수 없었던 파일 — rel → 그때의 디스크 내용.
 *  이걸 기록해 두지 않으면 다음 저장이 외부 편집을 조용히 덮어쓴다(사용자는 끝까지 모른다). */
const externalChanged = new Map<string, string>();

/** 디스크 내용으로 모델 갱신 — 미저장(dirty) 아닐 때만 (버퍼 보호) */
export function reload(root: string, rel: string, content: string, isDirty: boolean): void {
  const m = getByRel(rel);
  if (!m) { if (isTsLike(rel)) ensure(root, rel, content); return; }
  const key = uriFor(root, rel).toString();
  const prevSaved = savedContent.get(key);
  // 디스크가 실제로 바뀌었고(이전 기준선과 다름) 버퍼와도 다르면 충돌 — 저장 전에 사용자에게 물어야 한다
  if (isDirty && m.getValue() !== content && prevSaved !== undefined && prevSaved !== content) {
    externalChanged.set(rel, content);
  }
  savedContent.set(key, content); // 디스크 기준 갱신
  if (!isDirty && m.getValue() !== content) { m.setValue(content); externalChanged.delete(rel); }
}

/** 저장 전 확인용 — 외부 변경이 감지된 파일이면 감지 당시의 디스크 내용, 아니면 null */
export function externalChangeOf(rel: string): string | null {
  return externalChanged.get(rel) ?? null;
}
export function clearExternalChange(rel: string): void { externalChanged.delete(rel); }

export function drop(root: string, rel: string): void {
  const uri = uriFor(root, rel);
  const key = uri.toString();
  const m = owned.get(key);
  if (m && !m.isDisposed()) { try { lsp.didClose(key, m.getLanguageId()); } catch { /* */ } m.dispose(); }
  owned.delete(key);
  relIndex.delete(rel);
  savedContent.delete(key);
  externalChanged.delete(rel);
}

/** rel 및 모든 하위 경로(rel + "/...") 모델을 정리 — 디렉터리 삭제/이름변경용.
 *  단일 drop 은 디렉터리(모델 없음) 자신만 지우고 하위 파일 모델을 남겨,
 *  dirtyRels 가 지운 경로를 계속 반환→저장모두(Save All)가 삭제 파일을 재생성하는 버그 방지. */
export function dropUnder(root: string, rel: string): void {
  const prefix = rel + "/";
  for (const r of [...relIndex.keys()]) {
    if (r === rel || r.startsWith(prefix)) drop(root, r);
  }
}

/** rel 및 하위 경로의 모델을 새 경로로 재생성 — 이름변경/이동 시 미저장 버퍼·dirty 델타 보존.
 *  Monaco 모델은 URI 변경 불가라 새 URI 모델(값=버퍼)을 만들고 옛것을 폐기한다.
 *  파일은 renameEntry 로 이미 이동됐으므로 새 경로 디스크 내용 = 옛 savedContent → 그대로 이어 dirty 유지. */
export function rekeyUnder(root: string, oldRel: string, newRel: string): void {
  const prefix = oldRel + "/";
  const targets: string[] = [];
  for (const r of relIndex.keys()) if (r === oldRel || r.startsWith(prefix)) targets.push(r);
  for (const r of targets) {
    const to = r === oldRel ? newRel : newRel + r.slice(oldRel.length);
    const oldKey = uriFor(root, r).toString();
    const m = owned.get(oldKey);
    if (!m || m.isDisposed()) { drop(root, r); continue; }
    const value = m.getValue();
    const saved = savedContent.get(oldKey);
    drop(root, r);                         // 옛 모델 폐기 + lsp.didClose
    ensure(root, to, value);               // 새 URI 모델(값=버퍼) + lsp.didOpen
    if (saved !== undefined) savedContent.set(uriFor(root, to).toString(), saved); // 디스크(=옛 saved) 기준 유지 → dirty 델타 보존
  }
}

/** owned 모델 중 present 집합에 없는 rel 제거 — 외부 삭제/브랜치 전환으로 사라진 파일의 stale 모델·진단·문제패널 항목 정리.
 *  present 가 불완전(트리 truncated)할 때 호출하면 실존 파일 모델을 잘못 지우므로 호출측이 완전할 때만 넘길 것. */
export function dropMissing(root: string, present: Set<string>): void {
  for (const rel of [...relIndex.keys()]) if (!present.has(rel)) drop(root, rel);
}
/** 모든 non-dirty owned 모델을 디스크 내용으로 재로드 — 대량 변경(replace-all)/브랜치 전환 후 열지 않은 preload 모델의 stale 방지 */
export async function reloadAll(root: string, readFile: (r: string, rel: string) => Promise<string>, isDirty: (rel: string) => boolean): Promise<void> {
  for (const rel of [...relIndex.keys()]) {
    if (isDirty(rel)) continue;
    try { const text = await readFile(root, rel); reload(root, rel, text, false); } catch { /* 삭제 등 — dropMissing 이 별도 정리 */ }
  }
}

export function disposeAll(): void {
  for (const m of owned.values()) { try { if (!m.isDisposed()) m.dispose(); } catch { /* */ } }
  owned.clear();
  relIndex.clear();
  savedContent.clear();
  currentRoot = null;
}
