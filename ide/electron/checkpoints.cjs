// 체크포인트 저장소 — AI 실행 하나가 손댄 파일의 **원본 바이트**를 보관한다.
//
// 왜 메인에 있나: 해시를 렌더러에서 계산하면 인코딩이 어긋나는 순간 가짜 드리프트가
// 무더기로 난다(BOM, 깨진 UTF-8 시퀀스, CRLF). 여기서는 파일을 Buffer 그대로 읽어
// sha256 을 뜨고, 렌더러에는 **해시 문자열만** 건넨다. 되돌릴 때도 저장한 바이트를
// 그대로 쓴다 — utf8 왕복을 한 번도 하지 않는다.
//
// 무엇을 되돌릴지 **판단**하는 로직은 여기 없다. src/engine/checkpoints.ts 에 순수
// 함수로 있고 vitest 가 덮는다. 메인은 사실(디스크 상태)만 모아 주고, 렌더러가 판단해
// 사용자에게 보여준 뒤 확인된 것만 restore 로 되돌려 달라고 한다. 판단이 두 군데에
// 있으면 확인 화면과 실제 동작이 반드시 어긋난다.
//
// 보관 상한(개수·용량)도 같은 이유로 여기 없다 — close 가 헤더 목록을 돌려주면
// 렌더러의 pruneCheckpoints 가 버릴 것을 정하고 drop 을 부른다.

const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

/** 이 크기를 넘는 파일은 원본을 보관하지 않는다 — 되돌리기 대상에서 빠진다(oversize). */
const MAX_BAK_BYTES = 4 * 1024 * 1024;

/** 실행 id 는 디렉터리 이름이 된다. 경로로 쓸 수 없는 것은 애초에 받지 않는다. */
const RUN_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

let store = null;      // userData/checkpoints
let shellRef = null;
let safeJoinRef = null;

/** projectKey — 루트 경로를 그대로 폴더명에 쓰면 Windows 경로 길이·금지문자에 걸린다. */
function keyOf(root) {
  return crypto.createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 16);
}

function dirOf(root, runId) {
  if (!RUN_ID_RE.test(String(runId || ""))) throw new Error("잘못된 실행 id 입니다");
  return path.join(store, keyOf(root), String(runId));
}

function hashOf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** 지금 디스크 상태. 없으면 exists:false — 읽기 실패도 같게 본다(되돌리기가 덮어써도 잃는 게 없다). */
async function diskState(abs) {
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return { exists: false, hash: null };
    if (st.size > MAX_BAK_BYTES) return { exists: true, hash: "oversize:" + st.size };
    return { exists: true, hash: hashOf(await fs.readFile(abs)) };
  } catch {
    return { exists: false, hash: null };
  }
}

async function readMeta(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));
  } catch {
    return null;
  }
}

let tmpSeq = 0;
/** 원자적 쓰기 — 도중에 죽어도 반쪽 meta 가 남지 않는다(main.cjs 의 writeFile 과 같은 방식). */
async function writeAtomic(abs, data) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = abs + "." + process.pid + "." + (++tmpSeq) + ".schutz-tmp";   // 고정 이름이면 동시 쓰기가 서로를 덮는다
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, abs);
  } catch (e) {
    try { await fs.rm(tmp, { force: true }); } catch { /* 임시 파일 정리 실패는 무시 */ }
    throw e;
  }
}

async function saveMeta(dir, meta) {
  await writeAtomic(path.join(dir, "meta.json"), JSON.stringify(meta));
}

function init(ipcMain, deps) {
  const { app, shell, safeJoin } = deps;
  store = path.join(app.getPath("userData"), "checkpoints");
  shellRef = shell;
  safeJoinRef = safeJoin;

  // 파일을 건드리기 **직전** 에 원본을 잡아 둔다. 같은 파일을 여러 번 고쳐도 처음 것이 원본이다.
  ipcMain.handle("schutz:cp:capture", async (_e, root, runId, rel, kind, startedAt, ownerId) => {
    const abs = safeJoinRef(root, rel);      // 워크스페이스 밖은 여기서 막힌다
    const dir = dirOf(root, runId);
    const meta = (await readMeta(dir)) || {
      rootRunId: String(runId), root: path.resolve(root),
      startedAt: Number(startedAt) || 0, open: true, entries: [],
      // 어느 창이 이 실행을 돌리고 있는가. 창을 두 개 띄우면 둘 다 같은 보관함을 보는데,
      // 예전엔 주인 표시가 없어서 **놀고 있는 창이 남의 실행 중인 체크포인트를 닫고 지웠다.**
      owner: String(ownerId || ""), beatAt: Date.now(),
    };
    const already = meta.entries.find(e => e.rel === rel);
    if (already) return { beforeHash: already.beforeHash, oversize: !!already.oversize, first: false };

    const entry = { rel, kind: kind === "create" ? "create" : "modify", beforeHash: null, afterHash: null, bak: null, bytes: 0 };
    if (entry.kind === "modify") {
      try {
        const st = await fs.stat(abs);
        if (st.size > MAX_BAK_BYTES) {
          entry.oversize = true;
        } else {
          const buf = await fs.readFile(abs);
          entry.beforeHash = hashOf(buf);
          entry.bak = meta.entries.length + ".bak";
          entry.bytes = buf.length;
          await fs.mkdir(path.join(dir, "files"), { recursive: true });
          await writeAtomic(path.join(dir, "files", entry.bak), buf);
        }
      } catch {
        // 고치려는 파일이 아직 없다 = 사실은 생성이다. 되돌리기는 삭제여야 한다.
        entry.kind = "create";
      }
    }
    meta.entries.push(entry);
    meta.beatAt = Date.now();
    await saveMeta(dir, meta);
    return { beforeHash: entry.beforeHash, oversize: !!entry.oversize, first: true };
  });

  // 살아 있다는 신호. 긴 턴이라 한동안 파일을 안 건드려도 이 실행이 살아 있음을 남긴다 —
  // 이게 없으면 다른 창이 "오래 조용하다 = 죽었다" 로 오판해 남의 체크포인트를 닫는다.
  ipcMain.handle("schutz:cp:beat", async (_e, root, runId) => {
    const meta = await readMeta(dirOf(root, runId));
    if (!meta || !meta.open) return false;
    meta.beatAt = Date.now();
    await saveMeta(dirOf(root, runId), meta);
    return true;
  });

  // 우리가 쓴 직후의 내용을 기록한다. 이게 나중에 "그 뒤로 누가 고쳤나" 의 기준이 된다.
  ipcMain.handle("schutz:cp:mark", async (_e, root, runId, rel) => {
    const abs = safeJoinRef(root, rel);
    const dir = dirOf(root, runId);
    const meta = await readMeta(dir);
    if (!meta) return { afterHash: null };
    const entry = meta.entries.find(e => e.rel === rel);
    if (!entry) return { afterHash: null };   // 캡처 안 된 것은 만들지 않는다
    const d = await diskState(abs);
    entry.afterHash = d.exists ? d.hash : null;
    meta.beatAt = Date.now();
    await saveMeta(dir, meta);
    return { afterHash: entry.afterHash };
  });

  // 실행이 끝났다. 헤더 목록을 돌려주면 렌더러가 보관 상한을 적용해 drop 을 부른다.
  ipcMain.handle("schutz:cp:close", async (_e, root, runId) => {
    const dir = dirOf(root, runId);
    const meta = await readMeta(dir);
    if (meta) {
      meta.open = false;
      await saveMeta(dir, meta);
    }
    return await listOf(root);
  });

  ipcMain.handle("schutz:cp:list", async (_e, root) => await listOf(root));

  // 되돌리기 확인 화면에 필요한 사실 — 무엇을 잡아 뒀고, 디스크는 지금 어떤가.
  ipcMain.handle("schutz:cp:probe", async (_e, root, runId) => {
    const dir = dirOf(root, runId);
    const meta = await readMeta(dir);
    if (!meta) return null;
    const disk = [];
    for (const e of meta.entries) {
      let abs;
      try { abs = safeJoinRef(root, e.rel); } catch { disk.push([e.rel, { exists: false, hash: null }]); continue; }
      disk.push([e.rel, await diskState(abs)]);
    }
    return {
      entries: meta.entries.map(e => ({
        rel: e.rel, kind: e.kind, beforeHash: e.beforeHash, afterHash: e.afterHash, oversize: !!e.oversize,
      })),
      disk,
      startedAt: meta.startedAt,
    };
  });

  // 확정된 것만 실행한다. 판단은 이미 렌더러에서 끝났지만, 잡아 두지 않은 파일은
  // 여기서도 거부한다 — 렌더러가 무엇을 보내든 캡처 범위 밖은 건드리지 않는다.
  ipcMain.handle("schutz:cp:restore", async (_e, root, runId, actions) => {
    const dir = dirOf(root, runId);
    const meta = await readMeta(dir);
    if (!meta) return { done: [], failed: [{ rel: "*", why: "체크포인트를 찾을 수 없습니다" }] };

    const done = [], failed = [];
    for (const a of Array.isArray(actions) ? actions : []) {
      const entry = meta.entries.find(e => e.rel === a?.rel);
      if (!entry) { failed.push({ rel: String(a?.rel), why: "이 실행이 건드린 파일이 아닙니다" }); continue; }
      try {
        const abs = safeJoinRef(root, entry.rel);
        if (a.action === "delete") {
          if (entry.kind !== "create") throw new Error("만든 파일이 아닙니다");
          await trash(abs);
          done.push(entry.rel);
        } else if (a.action === "restore") {
          if (!entry.bak) throw new Error("보관된 원본이 없습니다");
          const buf = await fs.readFile(path.join(dir, "files", entry.bak));
          await fs.mkdir(path.dirname(abs), { recursive: true });   // 사용자가 폴더째 지웠을 수 있다
          await writeAtomic(abs, buf);
          done.push(entry.rel);
        } else {
          throw new Error("알 수 없는 동작입니다");
        }
      } catch (err) {
        failed.push({ rel: entry.rel, why: (err && err.message) || String(err) });
      }
    }
    return { done, failed };
  });

  ipcMain.handle("schutz:cp:drop", async (_e, root, runId) => {
    await fs.rm(dirOf(root, runId), { recursive: true, force: true });
    return true;
  });
}

/** 삭제는 휴지통 경유 — 되돌리기의 되돌리기가 있어야 한다(P35A 와 같은 규칙). */
async function trash(abs) {
  try {
    await shellRef.trashItem(abs);
    return;
  } catch { /* 휴지통이 없는 환경(일부 리눅스·네트워크 드라이브) 폴백 */ }
  await fs.rm(abs, { force: true });
}

async function listOf(root) {
  const base = path.join(store, keyOf(root));
  let names;
  try { names = await fs.readdir(base); } catch { return []; }
  const out = [];
  for (const name of names) {
    const meta = await readMeta(path.join(base, name));
    if (!meta) continue;
    out.push({
      rootRunId: meta.rootRunId,
      startedAt: meta.startedAt || 0,
      open: !!meta.open,
      owner: meta.owner || "",
      beatAt: meta.beatAt || 0,
      bytes: meta.entries.reduce((n, e) => n + (e.bytes || 0), 0),
      files: meta.entries.length,
      created: meta.entries.filter(e => e.kind === "create").length,
      modified: meta.entries.filter(e => e.kind === "modify").length,
      restorable: meta.entries.filter(e => !e.oversize && e.afterHash !== null).length,
    });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

module.exports = { init };
