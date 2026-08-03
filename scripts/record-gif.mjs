/**
 * 기능 GIF 녹화 — 실행 중인 앱을 CDP 로 찍어 docs/assets/*.gif 를 만든다.
 *
 * docs/record-demo.md 가 히어로 GIF 를 어떻게 뽑았는지 산문으로 남겼는데, 정작 도구는
 * 저장소 밖에 있어서 사라졌다. 다시 잃지 않도록 이번엔 커밋한다.
 *
 *   node scripts/record-gif.mjs <시나리오이름>
 *   node scripts/record-gif.mjs --list
 *
 * 프레임을 Node 로 꺼내지 않는다. screencast 로 받은 PNG 를 렌더러에 도로 넣고
 * scripts/gifkit.js 가 합성·양자화·차분·인코딩까지 끝내 GIF 하나만 돌려준다 —
 * 이 저장소에는 이미지 라이브러리가 없고, 프레임을 왕복시키면 클립당 수십 MB 가 오간다.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const IDE = path.join(ROOT, "ide");
const OUT = path.join(ROOT, "docs", "assets");
const PORT = 9333;

/** 히어로 GIF 와 달리 기능 클립은 작아야 한다. README 는 볼 때마다 전부 내려받는다. */
const LOOK = {
  width: 900,          // 창 폭(px). 히어로는 1744(2×), 기능 클립은 1×로 충분하다
  margin: 34,
  radius: 12,
  bg: ["#A9BCA9", "#7E9583"],   // 세이지 — 앱보다 밝아야 창이 물체로 보인다
  shadow: "rgba(24,32,22,.45)",
};
const FPS = 12;        // UI 클립에 28fps 는 낭비다. 예산은 용량에 쓴다
const COLORS = 200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 시나리오 ─────────────────────────────────────────────────────────────
 * 각 시나리오는 준비(setup)와 연기(act)로 나뉜다. 캡처는 act 동안에만 돈다 —
 * 준비 장면이 클립에 들어가면 무엇을 보라는 건지 흐려진다. */
const SCENES = {
  "nav-history": {
    title: "Alt+← / Alt+→ 로 자리 되짚기",
    files: {
      "token.ts": Array.from({ length: 40 }, (_, i) => `export const token${i} = ${i};`).join("\n") + "\n",
      "types.ts": Array.from({ length: 30 }, (_, i) => `export type T${i} = { v: ${i} };`).join("\n") + "\n",
    },
    async setup(d) {
      await d.open("token.ts"); await sleep(700);
      await d.gotoLine(32); await sleep(600);
      await d.open("types.ts"); await sleep(900);
    },
    async act(d) {
      await sleep(600);
      await d.key("ArrowLeft", { alt: true, vk: 37 }); await sleep(1400);
      await d.key("ArrowRight", { alt: true, vk: 39 }); await sleep(1400);
    },
  },
  "mode-switch": {
    title: "에디터 ↔ 에이전트 전환",
    files: { "a.ts": "export const a = 1;\n" },
    async setup(d) { await d.open("a.ts"); await sleep(900); },
    async act(d) {
      await sleep(500);
      await d.key("m", { ctrl: true, shift: true, vk: 77 }); await sleep(2000);
      await d.key("m", { ctrl: true, shift: true, vk: 77 }); await sleep(1800);
    },
  },
  "tree-git": {
    title: "트리에서 바뀐 파일이 보인다",
    git: true,
    files: { "kept.ts": "export const kept = 1;\n", "edited.ts": "export const edited = 1;\n" },
    async setup(d) { await d.open("edited.ts"); await sleep(900); },
    async act(d) {
      await d.type(" // touched"); await sleep(700);
      await d.key("s", { ctrl: true, vk: 83 }); await sleep(2600);
    },
  },
};

/* ── CDP ─────────────────────────────────────────────────────────────────── */
function makeDriver(ws, send, ev) {
  const key = async (k, o = {}) => {
    const mod = (o.alt ? 1 : 0) | (o.ctrl ? 2 : 0) | (o.shift ? 8 : 0);
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: o.code ?? k, modifiers: mod, windowsVirtualKeyCode: o.vk, nativeVirtualKeyCode: o.vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: o.code ?? k, modifiers: mod });
    await sleep(220);
  };
  return {
    key,
    ev,
    async type(text) { await send("Input.insertText", { text }); },
    async open(name) {
      await key("p", { code: "KeyP", ctrl: true, vk: 80 });
      await sleep(350);
      await ev("(function(){var i=document.querySelector('input[data-szfocus]');"
        + "var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
        + "s.call(i," + JSON.stringify(name) + ");i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()");
      await sleep(500);
      await key("Enter", { code: "Enter", vk: 13 });
      await sleep(900);
    },
    async gotoLine(n) {
      await key("g", { code: "KeyG", ctrl: true, vk: 71 });
      await sleep(400);
      await send("Input.insertText", { text: String(n) });
      await sleep(250);
      await key("Enter", { code: "Enter", vk: 13 });
      await sleep(400);
    },
  };
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 아직 안 떴다 */ }
    await sleep(500);
  }
  throw new Error("CDP 대상이 안 뜬다");
}

async function record(name) {
  const scene = SCENES[name];
  if (!scene) throw new Error(`모르는 시나리오: ${name}`);

  const proj = path.join(os.tmpdir(), "schutz-gif-" + name);
  fs.rmSync(proj, { recursive: true, force: true });
  fs.mkdirSync(proj, { recursive: true });
  for (const [f, body] of Object.entries(scene.files)) fs.writeFileSync(path.join(proj, f), body);
  if (scene.git) {
    const { execSync } = await import("node:child_process");
    execSync('git init -q && git add -A && git -c user.email=a@b -c user.name=a commit -qm init', { cwd: proj, stdio: "ignore" });
  }

  const el = spawn(path.join(IDE, "node_modules/electron/dist/electron.exe"),
    [IDE, `--remote-debugging-port=${PORT}`], { cwd: IDE, stdio: "ignore" });

  let ws, id = 0;
  const pend = new Map();
  const frames = [];
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async e => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval 실패");
    return r.result.value;
  };

  try {
    ws = new WebSocket(await connect());
    await new Promise(r => ws.addEventListener("open", r));
    ws.addEventListener("message", e => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
      if (m.method === "Page.screencastFrame") {
        frames.push({ data: m.params.data, t: Date.now() });
        void send("Page.screencastFrameAck", { sessionId: m.params.sessionId }).catch(() => {});
      }
    });

    await send("Runtime.enable");
    await send("Page.enable");
    // 배경 창은 한 프레임도 안 그린다 — 이걸 빼면 screencast 가 0장을 돌려준다
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.bringToFront");
    await sleep(1200);

    await ev(`localStorage.setItem("schutz.lastRoot", ${JSON.stringify(proj)});`
      + `localStorage.setItem("schutz.lang","en");localStorage.setItem("schutz.theme","feldgrau");`
      + `localStorage.setItem("schutz.uiMode","editor");1`);
    await send("Page.reload");
    await sleep(7000);
    await send("Page.bringToFront");

    const d = makeDriver(ws, send, ev);
    await scene.setup(d);

    await send("Page.startScreencast", { format: "png", quality: 90, everyNthFrame: 1 });
    const t0 = Date.now();
    await scene.act(d);
    await send("Page.stopScreencast");
    console.log(`  캡처: ${frames.length}장 / ${((Date.now() - t0) / 1000).toFixed(1)}초`);
    if (!frames.length) throw new Error("프레임이 0장이다 — 창이 앞에 없다");

    // 12fps 로 솎는다. UI 클립에 28fps 는 용량만 먹는다.
    const step = 1000 / FPS;
    const picked = [];
    let want = frames[0].t;
    for (const f of frames) { if (f.t >= want) { picked.push(f); want += step; } }
    if (picked[picked.length - 1] !== frames[frames.length - 1]) picked.push(frames[frames.length - 1]);
    console.log(`  솎음: ${picked.length}장`);

    // 장면을 짜는 사람이 "무엇이 찍혔나" 를 눈으로 봐야 한다 — 마지막 장을 따로 남긴다.
    if (process.env.SCHUTZ_GIF_DEBUG) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, name + ".last.png"), Buffer.from(picked[picked.length - 1].data, "base64"));
      console.log("  마지막 장: docs/assets/" + name + ".last.png");
    }
    const kit = fs.readFileSync(path.join(HERE, "gifkit.js"), "utf8");
    await ev(kit + ";1");
    await ev("window.__gifkit.reset();1");
    for (let i = 0; i < picked.length; i++) {
      const delay = i + 1 < picked.length ? picked[i + 1].t - picked[i].t : step;
      await ev(`window.__gifkit.add("data:image/png;base64,${picked[i].data}", ${Math.round(delay)}, ${JSON.stringify(LOOK)})`);
    }
    const b64 = await ev(`window.__gifkit.finish(${COLORS})`);
    if (!b64) throw new Error("인코딩이 빈 결과를 냈다");

    fs.mkdirSync(OUT, { recursive: true });
    const dest = path.join(OUT, name + ".gif");
    fs.writeFileSync(dest, Buffer.from(b64, "base64"));
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`  저장: docs/assets/${name}.gif  ${kb} KB`);
    if (kb > 500) console.log("  ⚠ 500KB 를 넘었다 — 길이를 줄이거나 폭을 낮출 것");
  } finally {
    try { ws?.close(); } catch { /* */ }
    el.kill();
    await sleep(400);
  }
}

const arg = process.argv[2];
if (!arg || arg === "--list") {
  console.log("시나리오:");
  for (const [k, v] of Object.entries(SCENES)) console.log(`  ${k.padEnd(14)} ${v.title}`);
  process.exit(0);
}
const names = arg === "--all" ? Object.keys(SCENES) : [arg];
for (const n of names) {
  console.log(`\n== ${n} — ${SCENES[n]?.title ?? "?"}`);
  await record(n);
}
