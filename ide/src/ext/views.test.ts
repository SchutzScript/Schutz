import { describe, it, expect } from "vitest";
import { parseViews, containerTitle, normalizeTreeItem, rowKey, webviewDoc } from "./views";

describe("parseViews", () => {
  it("컨테이너별 목록을 편다", () => {
    expect(parseViews({ views: {
      explorer: [{ id: "a.one", name: "첫째" }],
      myBox: [{ id: "a.two", name: "둘째", type: "webview" }],
    } })).toEqual([
      { id: "a.one", name: "첫째", container: "explorer", webview: false },
      { id: "a.two", name: "둘째", container: "myBox", webview: true },
    ]);
  });

  it("이름이 없으면 id 를 쓴다 — 빈 줄보다 낫다", () => {
    expect(parseViews({ views: { explorer: [{ id: "x" }] } })[0]!.name).toBe("x");
  });

  it("id 가 없는 항목은 버린다 — 가리킬 수가 없다", () => {
    expect(parseViews({ views: { explorer: [{ name: "이름만" }, { id: "  " }] } })).toEqual([]);
  });

  it("type 을 안 적으면 트리다(vscode 기본값)", () => {
    expect(parseViews({ views: { explorer: [{ id: "x", name: "X" }] } })[0]!.webview).toBe(false);
  });

  it("뷰 기여가 없으면 빈 목록", () => {
    expect(parseViews(undefined)).toEqual([]);
    expect(parseViews({ views: null })).toEqual([]);
    expect(parseViews({ views: { explorer: "배열아님" } })).toEqual([]);
  });
});

describe("containerTitle", () => {
  const c = { viewsContainers: { activitybar: [{ id: "myBox", title: "내 상자" }] } };
  it("확장이 만든 컨테이너의 제목을 찾는다", () => expect(containerTitle(c, "myBox")).toBe("내 상자"));
  it("못 찾으면 id 그대로", () => expect(containerTitle(c, "explorer")).toBe("explorer"));
  it("기여가 없어도 안전하다", () => expect(containerTitle(undefined, "explorer")).toBe("explorer"));
});

describe("normalizeTreeItem", () => {
  it("문자열 라벨", () => expect(normalizeTreeItem({ label: "가" }).label).toBe("가"));
  it("{ label } 객체 라벨", () => expect(normalizeTreeItem({ label: { label: "나", highlights: [] } }).label).toBe("나"));

  it("collapsibleState 를 옮긴다", () => {
    expect(normalizeTreeItem({ collapsibleState: 0 }).collapse).toBe("none");
    expect(normalizeTreeItem({ collapsibleState: 1 }).collapse).toBe("collapsed");
    expect(normalizeTreeItem({ collapsibleState: 2 }).collapse).toBe("expanded");
    expect(normalizeTreeItem({}).collapse).toBe("none");
  });

  it("command 는 문자열이거나 객체다", () => {
    expect(normalizeTreeItem({ command: "a.b" }).commandId).toBe("a.b");
    const r = normalizeTreeItem({ command: { command: "a.b", arguments: [1, 2] } });
    expect([r.commandId, r.commandArgs]).toEqual(["a.b", [1, 2]]);
  });

  it("command 가 없으면 키 자체를 안 넣는다", () => {
    expect("commandId" in normalizeTreeItem({ label: "x" })).toBe(false);
  });

  it("MarkdownString 툴팁도 읽는다", () => {
    expect(normalizeTreeItem({ tooltip: { value: "설명" } }).tooltip).toBe("설명");
  });

  it("아무것도 안 돌려줘도 줄은 남는다 — 버리면 트리가 조용히 비어 보인다", () => {
    expect(normalizeTreeItem(undefined)).toMatchObject({ label: "", collapse: "none", commandArgs: [] });
  });
});

describe("rowKey", () => {
  it("부모 경로를 이어 붙인다 — 라벨만 쓰면 이름이 같은 형제가 함께 펴진다", () => {
    expect(rowKey("v", [0, 2])).toBe("v/0.2");
  });
  it("뿌리끼리 안 섞인다", () => {
    expect(rowKey("v", [1])).not.toBe(rowKey("w", [1]));
  });
});

describe("webviewDoc", () => {
  it("acquireVsCodeApi 를 넣는다 — 없으면 웹뷰가 첫 줄에서 죽는다", () => {
    expect(webviewDoc("<p>hi</p>", "v")).toContain("acquireVsCodeApi");
  });

  it("<head> 가 있으면 그 안 맨 앞에 — 확장 스크립트보다 먼저 정의돼야 한다", () => {
    const d = webviewDoc("<html><head><script>acquireVsCodeApi()</script></head></html>", "v");
    expect(d.indexOf("acquireVsCodeApi = function")).toBeLessThan(d.indexOf("<script>acquireVsCodeApi()"));
  });

  it("<html> 만 있으면 head 를 만들어 넣는다", () => {
    expect(webviewDoc("<html><body>x</body></html>", "v")).toMatch(/<html><head><script>/);
  });

  it("조각 HTML 은 앞에 붙인다", () => {
    expect(webviewDoc("<p>x</p>", "v").endsWith("<p>x</p>")).toBe(true);
  });

  it("뷰 id 를 담아 부모가 누가 보냈는지 안다", () => {
    expect(webviewDoc("", "myExt.view")).toContain('"myExt.view"');
  });

  it("빈 HTML 도 다리는 남는다", () => {
    expect(webviewDoc(undefined as any, "v")).toContain("acquireVsCodeApi");
  });

  it("봉투를 캡처 단계에서 가로챈다 — 안 끊으면 웹뷰가 내부 봉투까지 받는다", () => {
    const d = webviewDoc("", "v");
    expect(d).toContain("stopImmediatePropagation");
    // 세 번째 인자 true(캡처)가 있어야 확장 리스너보다 먼저 본다.
    expect(d).toMatch(/addEventListener\("message",[\s\S]*?\}, true\)/);
  });
});
