/*
 * 경량 스모크 테스트 (vscode 없이).
 *
 * 1) MockProvider 스트림이 기대한 이벤트 순서를 내는지
 * 2) 'vscode' 모듈을 스텁해 activate()가 안 터지고 뷰/커맨드를 모두 등록하는지
 *
 * 실행: node test/smoke.js  (npm run compile 이후)
 */
const assert = require("assert");
const Module = require("module");
const path = require("path");

let failures = 0;
function check(name, fn) {
  return fn()
    .then(() => console.log("  ✓ " + name))
    .catch((e) => {
      failures++;
      console.error("  ✗ " + name + "\n    " + (e && e.message));
    });
}

// ── vscode 스텁 ────────────────────────────────────────────────────────────
const registered = { views: [], commands: [], codeLens: 0 };
const vscodeStub = {
  window: {
    createTextEditorDecorationType: () => ({ dispose() {} }),
    registerWebviewViewProvider: (id) => {
      registered.views.push(id);
      return { dispose() {} };
    },
    createWebviewPanel: () => ({
      webview: { html: "", asWebviewUri: (u) => u, cspSource: "", onDidReceiveMessage() {}, postMessage() {} },
      reveal() {},
      onDidDispose() {},
    }),
    get activeTextEditor() {
      return undefined;
    },
    visibleTextEditors: [],
    showTextDocument: async () => ({}),
  },
  workspace: {
    getConfiguration: () => ({ get: (_k, d) => d }),
    workspaceFolders: [],
    openTextDocument: async () => ({}),
    onDidChangeConfiguration() {},
  },
  languages: {
    registerCodeLensProvider: () => {
      registered.codeLens++;
      return { dispose() {} };
    },
  },
  commands: {
    registerCommand: (id) => {
      registered.commands.push(id);
      return { dispose() {} };
    },
    executeCommand: async () => {},
  },
  Uri: {
    joinPath: (base, ...parts) => {
      const fsPath = path.join(base.fsPath || "", ...parts);
      return { fsPath, toString: () => "file://" + fsPath };
    },
  },
  EventEmitter: class {
    constructor() {
      this.event = () => ({ dispose() {} });
    }
    fire() {}
    dispose() {}
  },
  OverviewRulerLane: { Center: 1, Left: 2 },
  ViewColumn: { One: 1, Beside: 2 },
  Range: class {},
  Position: class {},
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return vscodeStub;
  }
  return origLoad.call(this, request, parent, isMain);
};

// ── 테스트 ──────────────────────────────────────────────────────────────────
async function run() {
  console.log("Schutz smoke test\n");

  await check("MockProvider가 plan→tool→text→edit→done 순서를 낸다", async () => {
    const { MockProvider } = require("../out/ai/providers/mockProvider.js");
    const p = new MockProvider();
    const types = [];
    for await (const ev of p.streamChat({
      messages: [{ role: "user", content: "hi" }],
      context: { activeFile: "a.ts", activeFileText: "function foo() {}\n" },
    })) {
      types.push(ev.type);
    }
    assert.ok(types.includes("plan"), "plan 이벤트 없음");
    assert.ok(types.includes("tool_call"), "tool_call 이벤트 없음");
    assert.ok(types.includes("text"), "text 이벤트 없음");
    assert.ok(types.includes("edit"), "edit 이벤트 없음");
    assert.strictEqual(types[types.length - 1], "done", "마지막이 done 아님");
  });

  await check("MockProvider 편집이 안전한 삽입 패치를 만든다", async () => {
    const { MockProvider } = require("../out/ai/providers/mockProvider.js");
    const p = new MockProvider();
    let patch;
    for await (const ev of p.streamChat({
      messages: [{ role: "user", content: "hi" }],
      context: { activeFile: "a.ts", activeFileText: "const x = 1\nfunction foo(){}\n" },
    })) {
      if (ev.type === "edit") patch = ev.patch;
    }
    assert.ok(patch, "패치 없음");
    assert.ok(patch.edits.length >= 1, "편집 없음");
    // 배너는 순수 삽입(endLine < startLine)
    assert.ok(patch.edits.some((e) => e.endLine < e.startLine), "삽입 편집 없음");
  });

  await check("멀티파일 데모가 파일마다 edit 이벤트를 낸다", async () => {
    const { MockProvider } = require("../out/ai/providers/mockProvider.js");
    const p = new MockProvider();
    const files = ["examples/demo.ts", "examples/user.ts", "examples/greet.ts"];
    const editFiles = [];
    for await (const ev of p.streamChat({
      messages: [{ role: "user", content: "hi" }],
      context: { demoFiles: files },
    })) {
      if (ev.type === "edit") editFiles.push(ev.patch.file);
    }
    assert.deepStrictEqual(editFiles, files, "파일별 edit 불일치: " + editFiles);
  });

  await check("activate()가 뷰 2개·CodeLens·커맨드 8개를 등록한다", async () => {
    const { activate } = require("../out/extension.js");
    const ctx = { subscriptions: [], extensionUri: {} };
    activate(ctx);
    assert.deepStrictEqual(
      registered.views.sort(),
      ["schutz.activity", "schutz.chat"],
      "webview 뷰 등록 불일치: " + registered.views,
    );
    assert.strictEqual(registered.codeLens, 1, "CodeLens 미등록");
    const expected = [
      "schutz.openChat",
      "schutz.runDemo",
      "schutz.runMultiFileDemo",
      "schutz.acceptAll",
      "schutz.rejectAll",
      "schutz.acceptTransaction",
      "schutz.rejectTransaction",
      "schutz.openMultiFileOverview",
    ];
    for (const c of expected) {
      assert.ok(registered.commands.includes(c), "커맨드 미등록: " + c);
    }
    assert.ok(ctx.subscriptions.length > 0, "subscriptions 비어있음");
  });

  await check("loadAstroView가 /_astro 에셋을 webview URI로 재작성 + CSP 주입", async () => {
    const { loadAstroView } = require("../out/webview/astroView.js");
    const extensionUri = { fsPath: path.resolve(__dirname, "..") };
    const webview = {
      cspSource: "vscode-resource:",
      asWebviewUri: (uri) => "https://webview/" + uri.fsPath.replace(/\\/g, "/"),
    };
    const html = loadAstroView(webview, extensionUri, "chat");
    assert.ok(html.includes("Content-Security-Policy"), "CSP 미주입");
    assert.ok(!/(?:href|src)="\/_astro/.test(html), "절대 /_astro 경로가 남아있음");
    assert.ok(html.includes("https://webview/"), "webview URI 재작성 안 됨");
  });

  console.log("");
  if (failures > 0) {
    console.error(`실패 ${failures}건`);
    process.exit(1);
  } else {
    console.log("모든 스모크 테스트 통과 ✓");
  }
}

run();
