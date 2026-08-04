// MCP 번들(.mcpb, 옛 이름 .dxt) 매니페스트 해석.
//
// 번들은 manifest.json 과 서버 코드를 담은 zip 이다. 매니페스트가 "무엇을 어떻게 실행할지"
// 를 적어 두는데, 그 안의 `${__dirname}` `${user_config.X}` 같은 자리를 우리가 채워야
// 실제 명령이 된다. **남이 준 파일이 우리 기계에서 실행할 명령을 정하는 자리**라
// 치환 규칙을 한군데 모아 두고 테스트로 덮는다.
//
// 파일 압축 해제는 메인이 한다(여기엔 IO 가 없다). 이 모듈은 읽고 채우기만 한다.

export interface UserField {
  key: string;
  title: string;
  description: string;
  /** 화면에서 가릴지 — API 키 같은 것 */
  sensitive: boolean;
  required: boolean;
  /** 기본값(문자열로 굳혀 둔다 — 입력칸에 그대로 들어간다) */
  default: string;
  /** 여러 값을 받는 항목(디렉터리 목록 등) */
  multiple: boolean;
}

export interface McpbManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  /** 실행 명령 — 아직 `${…}` 가 남아 있는 날것 */
  raw: { command: string; args: string[]; env: Record<string, string> };
  userConfig: UserField[];
  /** 매니페스트가 광고하는 도구 이름들. 설치 전에 "무엇이 들어오는지" 보여 준다. */
  tools: string[];
  /** 사람에게 알릴 만한 문제(치명적이지 않은 것) */
  warnings: string[];
}

export type ParseResult =
  | { ok: true; manifest: McpbManifest }
  | { ok: false; why: string };

/** 서버 이름은 폴더 이름이자 MCP 설정 키가 된다 — 경로로 쓸 수 없는 것은 받지 않는다. */
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseMcpbManifest(raw: unknown, platform: "win32" | "darwin" | "linux"): ParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, why: "manifest.json 을 읽을 수 없습니다" };
  const m = raw as Record<string, any>;

  // 이름은 폴더가 되고 설정 키가 된다. 여기서 막지 않으면 `../` 가 그대로 경로가 된다.
  const name = str(m.name).trim();
  if (!NAME_RE.test(name)) return { ok: false, why: "번들 이름이 없거나 쓸 수 없는 형태입니다" };

  const server = m.server;
  if (!server || typeof server !== "object") return { ok: false, why: "server 항목이 없습니다" };
  let cfg = server.mcp_config;
  if (!cfg || typeof cfg !== "object") return { ok: false, why: "server.mcp_config 가 없습니다" };

  // 플랫폼별 덮어쓰기 — 윈도만 다른 명령을 쓰는 번들이 흔하다.
  const over = cfg.platform_overrides && cfg.platform_overrides[platform];
  if (over && typeof over === "object") cfg = { ...cfg, ...over };

  const command = str(cfg.command).trim();
  if (!command) return { ok: false, why: "실행할 명령(mcp_config.command)이 없습니다" };

  const args = Array.isArray(cfg.args) ? cfg.args.map(str) : [];
  const env: Record<string, string> = {};
  if (cfg.env && typeof cfg.env === "object") {
    for (const [k, v] of Object.entries(cfg.env)) env[k] = str(v);
  }

  const warnings: string[] = [];
  // 원격에서 코드를 받아 실행하는 번들이 있다. 설치 전에 알린다.
  if (/^(curl|wget|powershell|pwsh|bash|sh|cmd)$/i.test(command)) warnings.push("cmd-shell");
  if (str(m.manifest_version) && !/^0\.|^1\./.test(str(m.manifest_version))) warnings.push("manifest-version");

  return {
    ok: true,
    manifest: {
      name,
      displayName: str(m.display_name) || str(m.displayName) || name,
      version: str(m.version),
      description: str(m.description) || str(m.long_description),
      author: typeof m.author === "object" && m.author ? str(m.author.name) : str(m.author),
      raw: { command, args, env },
      userConfig: readUserConfig(m.user_config),
      tools: Array.isArray(m.tools) ? m.tools.map((t: any) => str(t && t.name)).filter(Boolean) : [],
      warnings,
    },
  };
}

function readUserConfig(uc: unknown): UserField[] {
  if (!uc || typeof uc !== "object") return [];
  const out: UserField[] = [];
  for (const [key, v0] of Object.entries(uc as Record<string, any>)) {
    const v = v0 && typeof v0 === "object" ? v0 : {};
    out.push({
      key,
      title: str(v.title) || key,
      description: str(v.description),
      sensitive: !!v.sensitive,
      required: !!v.required,
      default: v.default === undefined || v.default === null ? "" : String(v.default),
      multiple: !!v.multiple,
    });
  }
  return out;
}

/* ── 템플릿 치환 ─────────────────────────────────────────────────────────── */

export interface TemplateVars {
  /** 번들을 푼 디렉터리 */
  dirname: string;
  home: string;
  sep: string;
  /** 사용자가 채운 값 */
  userConfig: Record<string, string>;
}

/**
 * `${…}` 를 채운다. **모르는 이름은 그대로 둔다** — 빈 문자열로 바꾸면
 * `--key=${user_config.token}` 이 `--key=` 가 되어, 인증이 빠진 채로 조용히 실행된다.
 * 그대로 남겨 두면 서버가 눈에 띄게 실패하고, 우리는 아래 unresolved 로 미리 잡는다.
 */
export function resolveTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\$\{([^}]+)\}/g, (whole, expr: string) => {
    const key = expr.trim();
    if (key === "__dirname") return vars.dirname;
    if (key === "HOME" || key === "userHome") return vars.home;
    if (key === "pathSeparator" || key === "/") return vars.sep;
    if (key.startsWith("user_config.")) {
      const k = key.slice("user_config.".length);
      const v = vars.userConfig[k];
      return v === undefined ? whole : v;
    }
    return whole;
  });
}

export interface ResolvedServer {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** 아직 안 채워진 `${…}` 가 남은 자리 — 있으면 실행하면 안 된다. */
  unresolved: string[];
}

export function resolveServer(m: McpbManifest, vars: TemplateVars): ResolvedServer {
  const command = resolveTemplate(m.raw.command, vars);
  const args = m.raw.args.map(a => resolveTemplate(a, vars));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.raw.env)) env[k] = resolveTemplate(v, vars);

  const unresolved: string[] = [];
  const scan = (s: string) => {
    for (const mt of s.matchAll(/\$\{([^}]+)\}/g)) { const g = mt[1]; if (g) unresolved.push(g.trim()); }
  };
  scan(command); args.forEach(scan); Object.values(env).forEach(scan);
  return { command, args, env, unresolved: [...new Set(unresolved)] };
}

/** 필수인데 비어 있는 항목. 설치 버튼을 잠그는 근거다. */
export function missingRequired(fields: UserField[], values: Record<string, string>): string[] {
  return fields.filter(f => f.required && !String(values[f.key] ?? "").trim()).map(f => f.key);
}

/** 입력칸 초기값 — 기본값이 있으면 채워 둔다. */
export function initialValues(fields: UserField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = f.default;
  return out;
}

/* ── zip 항목 검사 ───────────────────────────────────────────────────────── */

/**
 * zip 안의 경로가 풀어도 되는 것인가(zip-slip 방지).
 *
 * 번들은 인터넷에서 받은 남의 파일이다. `../../.ssh/authorized_keys` 같은 항목이
 * 들어 있으면 압축을 푸는 것만으로 홈 디렉터리를 덮어쓴다. 절대 경로·드라이브 문자·
 * 역슬래시 우회까지 여기서 막는다.
 */
export function safeZipEntry(entryName: string): boolean {
  if (!entryName || entryName.length > 512) return false;
  const p = entryName.replace(/\\/g, "/");
  if (p.startsWith("/")) return false;            // 절대 경로
  if (/^[A-Za-z]:/.test(p)) return false;         // C:\ 같은 드라이브
  if (p.includes("\0")) return false;
  for (const seg of p.split("/")) {
    if (seg === "..") return false;
    if (seg === "." || seg === "") continue;      // ./ 나 끝의 / 는 무해
  }
  return true;
}
