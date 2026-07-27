import { describe, it, expect } from "vitest";
import { resolveRenameTarget, isMove } from "./movePath";

const to = (rel: string, input: string) => {
  const r = resolveRenameTarget(rel, input);
  return r.ok ? r.to : "!" + r.why;
};

describe("resolveRenameTarget — 그냥 이름 바꾸기", () => {
  it("같은 폴더에 그대로 둔다", () => {
    expect(to("src/a.ts", "b.ts")).toBe("src/b.ts");
  });
  it("루트 파일도 된다", () => {
    expect(to("a.ts", "b.ts")).toBe("b.ts");
  });
  it("같은 이름은 할 일 없음", () => {
    expect(to("src/a.ts", "a.ts")).toBe("!same");
    expect(to("src/a.ts", "  a.ts  ")).toBe("!same");
  });
});

describe("resolveRenameTarget — 이동", () => {
  it("슬래시를 넣으면 하위 폴더로 옮긴다", () => {
    expect(to("src/a.ts", "components/a.ts")).toBe("src/components/a.ts");
  });
  it("../ 로 위로 올린다", () => {
    expect(to("src/deep/a.ts", "../a.ts")).toBe("src/a.ts");
  });
  it("../ 로 옆 폴더로 옮긴다", () => {
    expect(to("src/ui/a.ts", "../lib/a.ts")).toBe("src/lib/a.ts");
  });
  it("/ 로 시작하면 워크스페이스 루트 기준", () => {
    expect(to("src/deep/a.ts", "/top.ts")).toBe("top.ts");
    expect(to("a.ts", "/lib/a.ts")).toBe("lib/a.ts");
  });
  it("옮기면서 이름도 같이 바꾼다", () => {
    expect(to("src/a.ts", "../docs/README.md")).toBe("docs/README.md");
  });
  it("폴더 통째로 옮긴다", () => {
    expect(to("src/ui", "widgets")).toBe("src/widgets");
  });
});

describe("resolveRenameTarget — 거절", () => {
  it("빈 입력", () => {
    expect(to("a.ts", "")).toBe("!empty");
    expect(to("a.ts", "   ")).toBe("!empty");
    expect(to("a.ts", "///")).toBe("!empty");
    expect(to("a.ts", "/.")).toBe("!empty");
  });
  it("역슬래시는 알려 준다 — 조용히 바꾸면 진짜 \\ 를 쓰려던 경우와 구분이 안 된다", () => {
    expect(to("src/a.ts", "ui\\a.ts")).toBe("!backslash");
  });
  it("../ 로 워크스페이스를 벗어날 수 없다", () => {
    expect(to("a.ts", "../밖.ts")).toBe("!escape");
    expect(to("src/a.ts", "../../밖.ts")).toBe("!escape");
    expect(to("src/a.ts", "/../밖.ts")).toBe("!escape");
  });
  it("폴더를 자기 안으로 옮기지 않는다 — 원본이 사라진다", () => {
    expect(to("src/ui", "ui/ui")).toBe("!into-self");
    expect(to("src", "/src/nested")).toBe("!into-self");
  });
});

describe("resolveRenameTarget — 잡다한 것", () => {
  it("중복 슬래시·./ 는 흘려보낸다", () => {
    expect(to("src/a.ts", "ui//./b.ts")).toBe("src/ui/b.ts");
  });
  it("뒤에 붙은 슬래시는 무시한다", () => {
    expect(to("src/a.ts", "ui/b.ts/")).toBe("src/ui/b.ts");
  });
  it("한글·공백 경로도 그대로 지난다", () => {
    expect(to("문서/글.md", "보관함/옛 글.md")).toBe("문서/보관함/옛 글.md");
  });
});

describe("isMove", () => {
  it("부모가 그대로면 이동이 아니다", () => {
    expect(isMove("src/a.ts", "src/b.ts")).toBe(false);
    expect(isMove("a.ts", "b.ts")).toBe(false);
  });
  it("부모가 바뀌면 이동이다", () => {
    expect(isMove("src/a.ts", "src/ui/a.ts")).toBe(true);
    expect(isMove("src/a.ts", "a.ts")).toBe(true);
  });
});
