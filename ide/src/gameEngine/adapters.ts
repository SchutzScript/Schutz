/**
 * 엔진(게임·3D) 어댑터 — 순수 데이터 + 위험도 판정.
 *
 * Schutz 는 이미 stdio MCP 호스트다. 창작 엔진(OVERDARE Studio, Blender 등)은 그 위의 MCP
 * 서버 하나일 뿐이라 "연결" 자체는 기존 MCP 경로를 그대로 탄다. 이 파일이 더하는 건 두 가지:
 *  ⑴ 어느 MCP 서버가 "엔진" 인가(그래서 전용 UI·상태·안내를 붙일 대상인가)를 데이터로 안다.
 *  ⑵ 엔진 도구마다 위험도를 매겨, 되돌릴 수 없는/엔진을 망가뜨릴 수 있는 호출 앞에 승인
 *     게이트를 세운다. (일반 MCP 도구는 예전처럼 무게이트 — 어댑터가 없으면 safe 로 떨어진다.)
 *
 * 규칙(engine/types.ts 의 규율을 그대로 따른다): 이 파일은 React·Electron·DOM·window 를
 * import 하지 않는다. 순수 함수·상수만. **두 번째 엔진은 코드가 아니라 ADAPTERS 배열에
 * 항목 하나를 더하는 일이어야 한다.** OVERDARE 는 프로젝트 폴더·재생/정지·asset id 행업 같은
 * 고유 개념이 있고 Blender 는 없다 — 그래서 그런 필드는 전부 선택(optional)으로 둔다.
 */

/** 승인 강도.
 *  safe   : 게이트 없음(읽기·상태·스크린샷·재생/정지·저장).
 *  confirm: 자율성이 'auto' 가 아니면 승인(쓰기·삭제·임의 실행·퍼블리시 등).
 *  gated  : 자율성이 'auto' 여도 항상 승인(엔진을 영구 파손할 수 있는 것). */
export type EngineRisk = "safe" | "confirm" | "gated";

export interface EngineAdapter {
  /** 안정 식별자 — UI·설정 키에 쓴다. */
  id: string;
  /** 사람에게 보이는 이름. */
  label: string;
  /** 이 엔진을 뒤에서 움직이는 MCP 서버 이름(mcp.json 의 키 = discover 의 name). */
  serverName: string;
  /** 지금은 stdio 뿐. 미래에 HTTP MCP 가 나오면 유니온을 넓히고 호스트만 확장한다. */
  transport: "stdio";
  /** 온보딩 카드 설명 문구의 i18n 키. */
  descKey: string;
  /** 모델에게 줄 운영 수칙 — 엔진이 연결돼 있으면 시스템 프롬프트에 붙인다. */
  systemGuide: string;

  /** 프로젝트 경로가 담기는 환경변수 이름. 폴더 개념이 있는 엔진(OVERDARE)만. Blender 는 없음. */
  projectEnv?: string;
  /** 상태·도달성을 확인할 도구(있으면 연결 후 한 번 불러 reachable 판정). 없으면 running=연결로 본다. */
  statusTool?: string;
  /** 뷰포트 스냅샷 도구 — 엔진 뷰가 그림으로 보여준다. */
  screenshotTool?: string;
  /** 씬/트리 조회 도구 — 엔진 뷰가 구조를 보여준다. */
  browseTool?: string;
  /** 저장 도구 — 엔진 뷰의 저장 버튼. */
  saveTool?: string;

  /** 위험도 분류. 목록에 없으면 safe. */
  risk: { confirm: string[]; gated: string[] };

  // ── 아래는 엔진마다 있을 수도, 없을 수도 있는 것들 ──────────────────────────
  /** 검증된 asset id 를 수확할 카탈로그 도구들(OVERDARE 전용). */
  assetCatalogTools?: string[];
  /** asset 을 들여오는 도구 — 미검증 id 면 gated 로 승격(OVERDARE 전용). */
  assetImportTools?: string[];
  /** 재생 중 부르면 엔진을 행업시키는 도구들(OVERDARE 전용). */
  unsafeWhilePlaying?: string[];
  /** 재생/정지 상태를 뒤집는 도구(OVERDARE 전용). */
  playTool?: string;
  stopTool?: string;

  /** 미리 설정 안 한 사용자를 위한 기본 실행 프리셋. 발견된 MCP 설정이 없을 때 이걸로 등록한다. */
  preset?: { command: string; args: string[] };
  /** MCP 서버 자체를 GitHub 에서 가져와 설치하는 정보(npm 빌드 기반). 발견된 설정도 프리셋도
   *  못 쓰는 처음 쓰는 사용자용 — clone → build → 진입 파일. creator 는 설치 화면에 띄운다. */
  install?: {
    repo: string;                          // https://github.com/…/…​.git
    build: string[];                       // 예: ["npm","run","build"]
    entry: string;                         // 설치 디렉터리 기준 진입 파일 (예: "dist/index.js")
    creator: { name: string; url: string };
  };
}

// ── OVERDARE Studio ─────────────────────────────────────────────────────────
// Roblox 류 · Luau 스크립트 · Unreal 기반 UGC 메이커. DataModel 은 Roblox 를 본떴다.
// 잘못된 asset id 로 import 하면 Studio 가 영구 행업 → 카탈로그가 준 id 만 신뢰(auto 여도).
// 재생 중 쓰기도 행업 → play 중 편집을 막는다. 도구 이름은 모두 overdare_ 접두어.

const OVERDARE_WRITE = [
  "overdare_create_instance", "overdare_create_instances", "overdare_create_part",
  "overdare_duplicate_instance", "overdare_move_instance", "overdare_update_instance",
  "overdare_delete_instance", "overdare_instance_delete",
  "overdare_script_add", "overdare_script_edit", "overdare_apply",
  "overdare_asset_import", "overdare_image_import", "overdare_mesh_bulk_import",
];

const OVERDARE: EngineAdapter = {
  id: "overdare",
  label: "OVERDARE Studio",
  serverName: "overdare",
  transport: "stdio",
  descKey: "open.engine.descOverdare",
  systemGuide:
    "[OVERDARE Studio] 게임 엔진이 연결되어 있습니다. 수칙: " +
    "① overdare_browse 로 DataModel 트리를 먼저 읽고, 모든 조작은 노드의 guid 로 지정한다. " +
    "② 편집·임포트 전에 overdare_stop 으로 플레이테스트를 멈춘다(재생 중 쓰면 Studio 가 멈춘다). " +
    "③ asset id 는 절대 추측하지 말고 카탈로그(overdare_assets, overdare_rc_search_assets)에서 " +
    "고른다 — 잘못된 id 는 Studio 를 영구 행업시킨다. ④ 다 됐으면 overdare_save 로 저장한다.",
  projectEnv: "OVERDARE_PROJECT_DIR",
  statusTool: "overdare_status",
  screenshotTool: "overdare_screenshot",
  browseTool: "overdare_browse",
  saveTool: "overdare_save",
  risk: {
    confirm: [
      // 쓰기·삭제 (되돌리기 어려움)
      "overdare_create_instance", "overdare_create_instances", "overdare_create_part",
      "overdare_duplicate_instance", "overdare_move_instance", "overdare_update_instance",
      "overdare_delete_instance", "overdare_instance_delete",
      "overdare_script_add", "overdare_script_edit", "overdare_apply",
      // 임포트 (asset_import 는 미검증 id 면 아래에서 gated 로 승격)
      "overdare_asset_import", "overdare_image_import",
      // 임의 실행 · 원격 제어
      "overdare_rc_call", "overdare_rc_batch", "overdare_rc_property",
      "overdare_rc_python", "overdare_rpc",
      // 바깥으로 나가는·설정을 바꾸는 것
      "overdare_publish", "overdare_set_project",
    ],
    gated: [
      // 200개까지 한 번에 굽는 장시간 벌크 임포트 — 늘 확인.
      "overdare_mesh_bulk_import",
    ],
  },
  assetCatalogTools: ["overdare_assets", "overdare_rc_search_assets"],
  assetImportTools: ["overdare_asset_import"],
  unsafeWhilePlaying: OVERDARE_WRITE,
  playTool: "overdare_play",
  stopTool: "overdare_stop",
  // npm 배포본을 npx 로 실행 — 발견된 설정이 없는(처음 쓰는) 사용자용 폴백.
  preset: { command: "npx", args: ["-y", "overdare-mcp"] },
  // npm 배포본이 없어도 되도록, 제작자 리포에서 직접 가져와 빌드한다.
  install: {
    repo: "https://github.com/Seungpyo1007/overdare-mcp.git",
    build: ["npm", "run", "build"],
    entry: "dist/index.js",
    creator: { name: "Seungpyo1007", url: "https://github.com/Seungpyo1007/overdare-mcp" },
  },
};

// 기본 어댑터는 OVERDARE 하나. 인터페이스는 엔진-무관하게 일반화돼 있어(폴더 없는 엔진,
// 재생/정지 없는 엔진, 설치 없는 엔진 모두 표현 가능) 두 번째 엔진은 여기 배열에 항목 하나를
// 더하는 일이면 된다. (Blender 등은 준비되면 추가한다.)
export const ADAPTERS: readonly EngineAdapter[] = [OVERDARE];

/** MCP 서버 이름으로 엔진 어댑터를 찾는다. 엔진이 아니면 undefined. */
export function adapterForServer(server: string): EngineAdapter | undefined {
  return ADAPTERS.find(a => a.serverName === server);
}

/** 도구 하나의 기본 위험도. 엔진 어댑터가 없는 일반 MCP 서버는 항상 safe(기존 무게이트 동작). */
export function riskFor(server: string, tool: string): EngineRisk {
  const a = adapterForServer(server);
  if (!a) return "safe";
  if (a.risk.gated.includes(tool)) return "gated";
  if (a.risk.confirm.includes(tool)) return "confirm";
  return "safe";
}

/** 이 호출이 asset import 라면 들여오려는 id 문자열을, 아니면 null 을 돌려준다. */
export function assetImportId(server: string, tool: string, input: unknown): string | null {
  const a = adapterForServer(server);
  if (!a || !(a.assetImportTools ?? []).includes(tool)) return null;
  const inp = (input ?? {}) as Record<string, unknown>;
  const raw = inp.assetId ?? inp.id ?? inp.asset_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** asset id 를 비교용으로 정규화 — "ovdrassetid://123" 과 "123" 을 같은 것으로 본다. */
export function normalizeAssetId(id: string): string {
  const m = id.match(/(\d{3,})/);
  return m ? m[1] : id.trim();
}

/** 카탈로그 도구 결과(자유 텍스트)에서 검증된 asset id 를 수확한다.
 *  ovdrassetid://NUMBER 와, 그 안의 긴 숫자(3자리+)를 함께 담아 두 표기 모두로 매칭되게 한다.
 *  (파싱은 게이트를 **완화**하는 데만 쓴다 — 미지의 id 는 늘 gated 로 남는다.) */
export function harvestAssetIds(server: string, tool: string, resultText: string): string[] {
  const a = adapterForServer(server);
  if (!a || !(a.assetCatalogTools ?? []).includes(tool)) return [];
  const out = new Set<string>();
  for (const m of resultText.matchAll(/ovdrassetid:\/\/(\d+)/g)) {
    out.add(m[0]);        // 전체 표기
    out.add(m[1]);        // 숫자만
  }
  return [...out];
}

/** 재생 중 부르면 엔진을 행업시키는 도구인가. */
export function mutatesWhilePlaying(server: string, tool: string): boolean {
  const a = adapterForServer(server);
  return !!a && (a.unsafeWhilePlaying ?? []).includes(tool);
}

export interface EngineConnectCfg { name: string; command: string; args: string[]; env: Record<string, string> }

/** 연결할 때 쓸 최종 MCP 설정을 만든다. 발견된 설정(discovered)이 있으면 그 command/args·env 를
 *  재사용하고(이미 이 기기에 맞음), 없으면 preset 으로 대체한다. 폴더가 필요한 엔진(projectEnv)만
 *  고른 폴더를 env 에 채운다 — Blender 처럼 폴더가 없으면 folder 는 null 이어도 된다. */
export function connectConfig(
  adapter: EngineAdapter,
  discovered: { command: string; args: string[]; env?: Record<string, string> } | undefined,
  folder: string | null,
): EngineConnectCfg {
  const base = discovered ? { command: discovered.command, args: discovered.args } : (adapter.preset ?? { command: "", args: [] });
  const env: Record<string, string> = { ...(discovered?.env ?? {}) };
  if (adapter.projectEnv && folder) env[adapter.projectEnv] = folder;
  return { name: adapter.serverName, command: base.command, args: [...base.args], env };
}

/** GitHub 에서 설치(clone→build)를 마친 뒤, 그 진입 파일을 node 로 실행하도록 등록 설정을 만든다. */
export function installedConnectConfig(adapter: EngineAdapter, entryPath: string, folder: string | null): EngineConnectCfg {
  const env: Record<string, string> = {};
  if (adapter.projectEnv && folder) env[adapter.projectEnv] = folder;
  return { name: adapter.serverName, command: "node", args: [entryPath], env };
}
