import { describe, expect, it } from "vitest";
import {
  ADAPTERS, adapterForServer, riskFor, assetImportId,
  normalizeAssetId, harvestAssetIds, mutatesWhilePlaying, connectConfig, installedConnectConfig,
} from "./adapters";

const overdare = adapterForServer("overdare")!;

describe("adapterForServer", () => {
  it("finds overdare by server name", () => {
    expect(adapterForServer("overdare")?.id).toBe("overdare");
  });
  it("returns undefined for a non-engine MCP server", () => {
    expect(adapterForServer("some-random-mcp")).toBeUndefined();
  });
});

describe("riskFor", () => {
  it("non-engine servers are always safe (preserve no-gate behavior)", () => {
    expect(riskFor("some-random-mcp", "delete_everything")).toBe("safe");
  });
  it("reads are safe", () => {
    for (const t of ["overdare_browse", "overdare_status", "overdare_screenshot",
      "overdare_read_instance", "overdare_script_read", "overdare_assets",
      "overdare_play", "overdare_stop", "overdare_save"]) {
      expect(riskFor("overdare", t)).toBe("safe");
    }
  });
  it("writes/deletes/exec/publish are confirm", () => {
    for (const t of ["overdare_create_instance", "overdare_delete_instance",
      "overdare_script_edit", "overdare_publish", "overdare_rc_python",
      "overdare_asset_import"]) {
      expect(riskFor("overdare", t)).toBe("confirm");
    }
  });
  it("bulk mesh import is gated (always confirmed)", () => {
    expect(riskFor("overdare", "overdare_mesh_bulk_import")).toBe("gated");
  });
  it("unknown overdare tool defaults to safe", () => {
    expect(riskFor("overdare", "overdare_totally_new_tool")).toBe("safe");
  });
});

describe("assetImportId", () => {
  it("extracts assetId from an import call", () => {
    expect(assetImportId("overdare", "overdare_asset_import", { assetId: "ovdrassetid://123456" }))
      .toBe("ovdrassetid://123456");
  });
  it("is null for non-import tools", () => {
    expect(assetImportId("overdare", "overdare_browse", { assetId: "ovdrassetid://1" })).toBeNull();
  });
  it("is null when id missing", () => {
    expect(assetImportId("overdare", "overdare_asset_import", {})).toBeNull();
  });
});

describe("normalizeAssetId", () => {
  it("treats prefixed and bare numeric ids as equal", () => {
    expect(normalizeAssetId("ovdrassetid://987654")).toBe("987654");
    expect(normalizeAssetId("987654")).toBe("987654");
    expect(normalizeAssetId("ovdrassetid://987654")).toBe(normalizeAssetId("987654"));
  });
});

describe("harvestAssetIds", () => {
  it("pulls ids (both forms) out of a catalog result", () => {
    const ids = harvestAssetIds("overdare", "overdare_assets",
      "1. PvP Combat — ovdrassetid://111222\n2. Menu — ovdrassetid://333444");
    expect(ids).toContain("ovdrassetid://111222");
    expect(ids).toContain("111222");
    expect(ids).toContain("333444");
  });
  it("harvests nothing from non-catalog tools", () => {
    expect(harvestAssetIds("overdare", "overdare_browse", "ovdrassetid://999")).toEqual([]);
  });
});

describe("mutatesWhilePlaying", () => {
  it("write/import tools are unsafe while playing", () => {
    expect(mutatesWhilePlaying("overdare", "overdare_create_part")).toBe(true);
    expect(mutatesWhilePlaying("overdare", "overdare_asset_import")).toBe(true);
  });
  it("reads are fine while playing", () => {
    expect(mutatesWhilePlaying("overdare", "overdare_browse")).toBe(false);
    expect(mutatesWhilePlaying("overdare", "overdare_screenshot")).toBe(false);
  });
});

describe("connectConfig", () => {
  it("falls back to the preset when nothing is discovered, filling the project folder", () => {
    const cfg = connectConfig(overdare, undefined, "C:/games/MyWorld");
    expect(cfg.name).toBe("overdare");
    expect(cfg.command).toBe("npx");
    expect(cfg.args).toEqual(["-y", "overdare-mcp"]);
    expect(cfg.env.OVERDARE_PROJECT_DIR).toBe("C:/games/MyWorld");
  });
  it("prefers a discovered config's command/args and merges its env", () => {
    const cfg = connectConfig(overdare,
      { command: "node", args: ["C:/o/dist/index.js"], env: { FOO: "bar" } },
      "D:/World");
    expect(cfg.command).toBe("node");
    expect(cfg.args).toEqual(["C:/o/dist/index.js"]);
    expect(cfg.env.FOO).toBe("bar");
    expect(cfg.env.OVERDARE_PROJECT_DIR).toBe("D:/World");
  });
  it("does not mutate the adapter preset array", () => {
    const before = [...overdare.preset!.args];
    const cfg = connectConfig(overdare, undefined, "X");
    cfg.args.push("mutated");
    expect(overdare.preset!.args).toEqual(before);
  });
});

describe("install spec", () => {
  it("OVERDARE ships an install spec pointing at the creator's GitHub repo", () => {
    expect(overdare.install).toBeDefined();
    expect(overdare.install!.repo).toMatch(/^https:\/\/github\.com\/.+\.git$/);
    expect(overdare.install!.entry).toBe("dist/index.js");
    expect(overdare.install!.creator.name).toBeTruthy();
    expect(overdare.install!.creator.url).toMatch(/^https:\/\/github\.com\//);
  });
});

describe("installedConnectConfig", () => {
  it("runs the built entry file with node and the project env", () => {
    const cfg = installedConnectConfig(overdare, "C:/data/engines/overdare/dist/index.js", "C:/games/W");
    expect(cfg.command).toBe("node");
    expect(cfg.args).toEqual(["C:/data/engines/overdare/dist/index.js"]);
    expect(cfg.env.OVERDARE_PROJECT_DIR).toBe("C:/games/W");
    expect(cfg.name).toBe("overdare");
  });
});

describe("ADAPTERS registry", () => {
  it("every adapter has the required core fields", () => {
    for (const a of ADAPTERS) {
      expect(a.id).toBeTruthy();
      expect(a.serverName).toBeTruthy();
      expect(a.descKey).toBeTruthy();
      expect(a.systemGuide).toBeTruthy();
      expect(a.risk).toBeDefined();
    }
  });
});

describe("connectConfig — folderless engine (generalized interface)", () => {
  // 기본 어댑터는 OVERDARE 하나지만 인터페이스는 폴더 없는 엔진도 표현할 수 있어야 한다.
  // 합성 어댑터(projectEnv 없음)로 그 경로를 검증한다.
  const folderless = { ...overdare, projectEnv: undefined, preset: { command: "uvx", args: ["some-mcp"] }, install: undefined };
  it("uses preset with no project env when nothing discovered and folder is null", () => {
    const cfg = connectConfig(folderless, undefined, null);
    expect(cfg.command).toBe("uvx");
    expect(cfg.args).toEqual(["some-mcp"]);
    expect(cfg.env).toEqual({});
  });
  it("reuses a discovered config verbatim, adding no folder env for a folderless engine", () => {
    const cfg = connectConfig(folderless, { command: "cmd", args: ["/c", "uvx", "some-mcp"], env: {} }, null);
    expect(cfg.command).toBe("cmd");
    expect(cfg.env).toEqual({});
  });
});
