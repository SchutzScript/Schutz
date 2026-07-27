import { describe, it, expect } from "vitest";
import {
  parseMcpbManifest, resolveTemplate, resolveServer, missingRequired,
  initialValues, safeZipEntry, type TemplateVars,
} from "./mcpb";

const base = {
  name: "weather",
  display_name: "날씨",
  version: "1.2.0",
  description: "날씨를 알려 준다",
  author: { name: "누군가" },
  server: {
    type: "node",
    entry_point: "server/index.js",
    mcp_config: { command: "node", args: ["${__dirname}/server/index.js"] },
  },
};
const parse = (o: any, p: "win32" | "darwin" | "linux" = "win32") => parseMcpbManifest(o, p);
const okOf = (o: any, p: "win32" | "darwin" | "linux" = "win32") => {
  const r = parse(o, p);
  if (!r.ok) throw new Error("파싱 실패: " + r.why);
  return r.manifest;
};
const vars = (o: Partial<TemplateVars> = {}): TemplateVars =>
  ({ dirname: "D:/번들/weather", home: "C:/Users/나", sep: "/", userConfig: {}, ...o });

describe("parseMcpbManifest — 기본", () => {
  it("이름·표시이름·판·설명을 읽는다", () => {
    const m = okOf(base);
    expect(m.name).toBe("weather");
    expect(m.displayName).toBe("날씨");
    expect(m.version).toBe("1.2.0");
    expect(m.author).toBe("누군가");
  });
  it("표시이름이 없으면 이름을 쓴다", () => {
    expect(okOf({ ...base, display_name: undefined }).displayName).toBe("weather");
  });
  it("명령과 인자를 날것 그대로 들고 온다", () => {
    expect(okOf(base).raw).toEqual({ command: "node", args: ["${__dirname}/server/index.js"], env: {} });
  });
  it("도구 이름을 모은다 — 설치 전에 뭐가 들어오는지 보여 준다", () => {
    const m = okOf({ ...base, tools: [{ name: "get_forecast" }, { name: "get_alerts" }, {}] });
    expect(m.tools).toEqual(["get_forecast", "get_alerts"]);
  });
});

describe("parseMcpbManifest — 거절", () => {
  it("객체가 아니면", () => {
    expect(parse(null)).toEqual({ ok: false, why: expect.any(String) });
    expect(parse("문자열")).toMatchObject({ ok: false });
  });
  it("이름이 경로로 쓸 수 없으면 — 폴더 이름이 되는 자리다", () => {
    for (const bad of ["", "../탈출", "a/b", ".hidden", "C:", "가나다"]) {
      expect(parse({ ...base, name: bad }).ok).toBe(false);
    }
  });
  it("server 나 mcp_config 가 없으면", () => {
    expect(parse({ ...base, server: undefined }).ok).toBe(false);
    expect(parse({ ...base, server: { type: "node" } }).ok).toBe(false);
  });
  it("실행할 명령이 없으면", () => {
    expect(parse({ ...base, server: { mcp_config: { args: ["x"] } } }).ok).toBe(false);
    expect(parse({ ...base, server: { mcp_config: { command: "  " } } }).ok).toBe(false);
  });
});

describe("parseMcpbManifest — 플랫폼별 덮어쓰기", () => {
  const withOver = {
    ...base,
    server: {
      mcp_config: {
        command: "node", args: ["a"],
        platform_overrides: { win32: { command: "node.exe", args: ["b"] } },
      },
    },
  };
  it("윈도에서는 덮어쓴 것을 쓴다", () => {
    expect(okOf(withOver, "win32").raw).toMatchObject({ command: "node.exe", args: ["b"] });
  });
  it("다른 플랫폼은 원래 것", () => {
    expect(okOf(withOver, "darwin").raw).toMatchObject({ command: "node", args: ["a"] });
  });
});

describe("parseMcpbManifest — 경고", () => {
  it("셸을 직접 부르는 번들은 짚어 둔다", () => {
    expect(okOf({ ...base, server: { mcp_config: { command: "bash", args: ["-c", "curl x | sh"] } } }).warnings)
      .toContain("cmd-shell");
  });
  it("평범한 번들엔 경고가 없다", () => {
    expect(okOf(base).warnings).toEqual([]);
  });
});

describe("user_config", () => {
  const withUc = {
    ...base,
    user_config: {
      api_key: { type: "string", title: "API 키", required: true, sensitive: true },
      units: { type: "string", title: "단위", default: "metric" },
      dirs: { type: "directory", multiple: true },
    },
  };
  it("항목을 읽는다", () => {
    const f = okOf(withUc).userConfig;
    expect(f.map(x => x.key)).toEqual(["api_key", "units", "dirs"]);
    expect(f[0]).toMatchObject({ required: true, sensitive: true, title: "API 키" });
    expect(f[1].default).toBe("metric");
    expect(f[2]).toMatchObject({ title: "dirs", multiple: true });
  });
  it("기본값으로 입력칸을 채운다", () => {
    expect(initialValues(okOf(withUc).userConfig)).toEqual({ api_key: "", units: "metric", dirs: "" });
  });
  it("필수인데 빈 것을 집어낸다", () => {
    const f = okOf(withUc).userConfig;
    expect(missingRequired(f, { api_key: "", units: "metric" })).toEqual(["api_key"]);
    expect(missingRequired(f, { api_key: "  ", units: "" })).toEqual(["api_key"]);
    expect(missingRequired(f, { api_key: "sk-x" })).toEqual([]);
  });
});

describe("resolveTemplate", () => {
  it("__dirname 을 푼 자리로", () => {
    expect(resolveTemplate("${__dirname}/server/index.js", vars()))
      .toBe("D:/번들/weather/server/index.js");
  });
  it("HOME 과 구분자", () => {
    expect(resolveTemplate("${HOME}${pathSeparator}x", vars({ sep: "\\" }))).toBe("C:/Users/나\\x");
  });
  it("user_config 값을 넣는다", () => {
    expect(resolveTemplate("--key=${user_config.api_key}", vars({ userConfig: { api_key: "sk-1" } })))
      .toBe("--key=sk-1");
  });
  it("모르는 이름은 **그대로 둔다** — 빈 값으로 바꾸면 인증이 빠진 채 조용히 돈다", () => {
    expect(resolveTemplate("--key=${user_config.없음}", vars())).toBe("--key=${user_config.없음}");
    expect(resolveTemplate("${뭔지모름}", vars())).toBe("${뭔지모름}");
  });
  it("한 문자열에 여러 개", () => {
    expect(resolveTemplate("${__dirname}/${user_config.a}/${HOME}", vars({ userConfig: { a: "x" } })))
      .toBe("D:/번들/weather/x/C:/Users/나");
  });
});

describe("resolveServer", () => {
  it("명령·인자·환경변수를 모두 채운다", () => {
    const m = okOf({
      ...base,
      server: { mcp_config: { command: "${__dirname}/bin/srv", args: ["--k", "${user_config.k}"], env: { TOKEN: "${user_config.k}" } } },
    });
    const r = resolveServer(m, vars({ userConfig: { k: "비밀" } }));
    expect(r.command).toBe("D:/번들/weather/bin/srv");
    expect(r.args).toEqual(["--k", "비밀"]);
    expect(r.env).toEqual({ TOKEN: "비밀" });
    expect(r.unresolved).toEqual([]);
  });
  it("안 채워진 자리를 모아 준다 — 그대로 실행하면 안 된다", () => {
    const m = okOf({
      ...base,
      server: { mcp_config: { command: "node", args: ["${user_config.a}"], env: { E: "${user_config.b}" } } },
    });
    expect(resolveServer(m, vars()).unresolved).toEqual(["user_config.a", "user_config.b"]);
  });
  it("같은 자리가 여러 번 나와도 한 번만 센다", () => {
    const m = okOf({ ...base, server: { mcp_config: { command: "node", args: ["${user_config.a}", "${user_config.a}"] } } });
    expect(resolveServer(m, vars()).unresolved).toEqual(["user_config.a"]);
  });
});

describe("safeZipEntry — 압축을 푸는 것만으로 밖을 덮어쓰면 안 된다", () => {
  it("평범한 항목은 통과", () => {
    for (const p of ["manifest.json", "server/index.js", "./a/b.txt", "깊이/한글.md", "dir/"]) {
      expect(safeZipEntry(p)).toBe(true);
    }
  });
  it("상위로 올라가는 것은 막는다", () => {
    for (const p of ["../x", "a/../../x", "..\\x", "a/b/../../../x"]) {
      expect(safeZipEntry(p)).toBe(false);
    }
  });
  it("절대 경로·드라이브 문자도 막는다", () => {
    for (const p of ["/etc/passwd", "C:/Windows/x", "c:\\x", "\\\\서버\\공유"]) {
      expect(safeZipEntry(p)).toBe(false);
    }
  });
  it("빈 이름·널바이트·과한 길이", () => {
    expect(safeZipEntry("")).toBe(false);
    expect(safeZipEntry("a\0b")).toBe(false);
    expect(safeZipEntry("a/".repeat(300))).toBe(false);
  });
});
