// Claude Code · Codex 가 남긴 대화 기록을 읽는 규칙.
//
// 두 CLI 는 각자 홈 디렉터리에 JSONL 로 대화를 쌓아둔다. 그걸 Schutz 대화로 데려오는 게
// 목적이다. 여기 있는 건 **파싱 규칙뿐**이다 — 파일도 IPC 도 만지지 않는다(문자열을 받는다).
// conversations.ts·agentTimeline.ts 와 같은 규칙이라 브라우저 없이 테스트할 수 있고,
// "파일을 잘못 읽었나 형식을 잘못 읽었나" 가 갈린다.
//
// ── 크기가 설계를 정한다 ────────────────────────────────────────────────────
// 이 기계에서 실측: Claude Code 839개 파일 · 총 1GB · **최대 218MB 짜리 하나**.
// 통째로 파싱하면 렌더러가 죽고, 설령 살아도 Schutz 대화는 localStorage(≈5MB)에 산다.
// 그래서 호출자는 파일의 **꼬리만** 읽어 넘기고, 여기서 다시 상한으로 자른다.
// 잘랐으면 잘랐다고 말한다 — 조용히 버리면 "예전 대화가 사라졌다" 가 된다.
//
// ── 두 형식에서 각각 조심할 것 ───────────────────────────────────────────────
// Claude Code: 도구 **결과**도 `user` 레코드로 들어온다(`tool_result` 블록). 역할로만
//   가르면 셸 출력이 사용자 발언이 된다. `isSidechain` 은 서브에이전트라 본 대화가 아니다.
// Codex: `response_item` 의 user 메시지엔 `<environment_context>` 같은 주입 덩어리가
//   섞인다. 사람이 실제로 친 말은 `event_msg`/`user_message` 쪽이 깨끗하다. 반대로
//   assistant 는 `response_item` 을 쓴다 — `event_msg`/`agent_message` 는 같은 걸 한 번
//   더 흘리는 UI 이벤트라, 둘 다 받으면 답이 두 번씩 나온다.

export type CliAgent = "claude" | "codex";

export const CLI_AGENTS: readonly CliAgent[] = ["claude", "codex"];

/** 목록 한 줄. 파일 **앞부분**만 읽어서 채운다 — 목록 하나 그리려고 218MB 를 볼 이유가 없다. */
export interface CliChatHead {
  id: string;
  title: string;
  /** 그 대화가 돌던 작업 폴더. 지금 워크스페이스와 맞춰 보여주는 데 쓴다. */
  cwd: string;
  branch: string;
}

/** 대화 한 조각. 말과 도구를 한 배열에 섞어 **순서를 보존한다.**
 *
 *  Schutz 는 messages 와 tools 를 따로 들고 `_uid` 로 엮는다(agentTimeline). 여기서 둘을
 *  갈라 내보내면 "어떤 도구가 어떤 말 뒤였는지" 가 파일에만 남고 우리 쪽엔 안 남는다. */
export type CliItem =
  | { kind: "msg"; role: "user" | "ai"; text: string; at: number }
  | { kind: "tool"; name: string; detail: string; at: number };

export interface CliBody {
  items: CliItem[];
  /** 상한에 걸려 앞을 버렸는가. 참이면 화면에 "이전은 생략됨" 을 띄워야 한다. */
  clipped: boolean;
  /** 버린 말의 수. 0 이면 clipped 도 거짓이다. */
  droppedMsgs: number;
}

/** 가져올 말의 최대 수. 넘으면 **최근 것부터** 남긴다 — 대화를 이어가려면 끝이 필요하다. */
export const CLI_MSG_CAP = 200;

/** 가져올 글자 수의 상한. 개수 상한만으로는 부족하다는 걸 실물에서 배웠다.
 *
 *  말 한 마디는 20,000자까지 허용한다(붙여넣은 로그·긴 코드 블록). 200마디면 최악의 경우
 *  4MB 다. Schutz 대화는 localStorage 에 사는데 그 전체가 5MB 안팎이라, 가져오기 한 번이
 *  저장소를 통째로 먹고 **조용히 실패한다** — 실제로 218MB 짜리 대화에서 그렇게 됐다.
 *
 *  600,000자면 아주 긴 대화도 온전히 들어오고, 그런 게 여덟 개 들어와도 할당량 안이다. */
export const CLI_CHAR_CAP = 600_000;

/** 파일 끝에서 읽어올 바이트. 실측으로 정한 값이다.
 *
 *  본문의 대부분은 도구 출력이고 우리는 그걸 버린다. 그래서 "몇 MB 를 읽으면 몇 마디가
 *  나오는가" 는 재 봐야만 안다. 이 기계의 큰 파일 네 개(219·130·90·86MB)에서:
 *
 *      꼬리   2MB → 8~26마디     8MB → 42~77마디
 *            24MB → 102~208마디  64MB → 260~1485마디
 *
 *  24MB 면 상한(200)을 거의 채우면서 파싱이 80ms 안에 끝난다. 64MB 는 200ms 가 들고
 *  IPC 로 넘길 문자열도 그만큼 커지는데, 어차피 상한에서 잘려 나간다. */
export const CLI_TAIL_BYTES = 24 * 1024 * 1024;

/** 목록용으로 파일 **앞**에서 읽을 바이트. 에이전트마다 다른 데는 이유가 있다.
 *
 *  Claude Code 는 제목·cwd 를 파일 맨 앞에 적어서 32KB 면 충분하다(실측 3/3 성공).
 *  Codex 는 첫 레코드가 시스템 프롬프트 전문이라 32KB 로는 **4개 중 4개 다 실패**했다.
 *  256KB 로 올리면 다 잡힌다. 파일 수가 반대라 이 비대칭이 이득이다 — Claude 는 839개,
 *  Codex 는 4개다. 모두 256KB 로 읽으면 목록 한 번에 215MB 를 읽게 된다. */
export const CLI_HEAD_BYTES: Record<CliAgent, number> = {
  claude: 32 * 1024,
  codex: 256 * 1024,
};

/** 도구 줄은 알약 하나라 한 줄을 넘길 수 없다. 셸 출력 전체를 들고 있어봐야 안 보인다. */
const TOOL_DETAIL_MAX = 240;
/** 말 하나의 상한. 붙여넣은 로그 하나가 저장 용량을 다 먹는 걸 막는다. */
const MSG_TEXT_MAX = 20_000;

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/** JSONL 을 줄 단위로 읽는다.
 *
 *  깨진 줄은 **조용히 버린다.** 꼬리부터 읽으면 첫 줄은 거의 항상 반토막이고, 그건 오류가
 *  아니라 예정된 일이다. 여기서 던지면 218MB 파일은 영원히 못 연다. */
function records(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s[0] !== "{") continue;
    try {
      const o: unknown = JSON.parse(s);
      if (o && typeof o === "object" && !Array.isArray(o)) out.push(o as Record<string, unknown>);
    } catch {
      /* 반토막 줄 — 꼬리 읽기의 정상 결과다 */
    }
  }
  return out;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const ms = (v: unknown): number => {
  if (typeof v !== "string" || !v) return 0;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : 0;
};

/** 배열이면 원소 목록, 아니면 빈 목록. 어느 필드든 벤더가 모양을 바꿀 수 있다고 본다. */
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

// ── 제목·경로 (앞부분만 읽는다) ──────────────────────────────────────────────

/** 파일 앞부분에서 제목·작업폴더·브랜치를 건진다.
 *
 *  Claude Code 는 `custom-title`(사용자가 붙인 것)·`ai-title`(자동)을 파일 곳곳에 다시
 *  적는다. 앞에서 **처음 만난 것**을 쓴다 — 마지막 것을 쓰려면 218MB 를 끝까지 읽어야 하고,
 *  제목이 도중에 바뀌는 일은 드물다. 사용자가 붙인 이름이 있으면 그게 이긴다. */
export function parseHead(agent: CliAgent, text: string, fallback: string): CliChatHead {
  const recs = records(text);
  let id = "", title = "", custom = "", cwd = "", branch = "", firstUser = "";

  for (const r of recs) {
    if (agent === "claude") {
      if (!id) id = str(r.sessionId);
      if (!cwd) cwd = str(r.cwd);
      if (!branch) branch = str(r.gitBranch);
      if (r.type === "custom-title" && !custom) custom = str(r.customTitle);
      if (r.type === "ai-title" && !title) title = str(r.aiTitle);
      if (!firstUser && r.type === "user" && !r.isSidechain) {
        const m = r.message as Record<string, unknown> | undefined;
        const c = m?.content;
        if (typeof c === "string") firstUser = c;
      }
    } else {
      if (r.type === "session_meta") {
        const p = (r.payload ?? {}) as Record<string, unknown>;
        if (!id) id = str(p.id);
        if (!cwd) cwd = str(p.cwd);
      }
      // Codex 는 제목을 저장하지 않는다 — 첫 사용자 발언에서 만든다.
      if (!firstUser && r.type === "event_msg") {
        const p = (r.payload ?? {}) as Record<string, unknown>;
        if (p.type === "user_message") firstUser = cleanUserText(str(p.message));
      }
    }
  }

  const pick = custom || title || firstUser;
  const flat = pick.replace(/\s+/g, " ").trim();
  return {
    id,
    title: flat ? (flat.length > 60 ? flat.slice(0, 60) + "…" : flat) : fallback,
    cwd,
    branch,
  };
}

// ── 본문 ────────────────────────────────────────────────────────────────────

/** Codex 가 사용자 턴에 끼워 넣는 기계 블록. 사람이 친 말이 아니다. */
const INJECTED = /^<(environment_context|user_instructions|recommended_plugins|permissions instructions|approval_policy|sandbox_mode)\b/i;

function cleanUserText(s: string): string {
  const t = s.trim();
  if (!t || INJECTED.test(t)) return "";
  return t;
}

/** 도구 호출에서 한 줄 설명을 뽑는다.
 *
 *  입력 전체를 붙이면 알약이 셸 스크립트로 가득 찬다. 사람이 알아보는 필드 하나만 고른다 —
 *  명령이면 명령, 파일이면 경로. 어느 것도 없으면 이름만 남긴다(빈 알약보다 낫다). */
function toolDetail(input: unknown): string {
  if (typeof input === "string") return clamp(input.replace(/\s+/g, " ").trim(), TOOL_DETAIL_MAX);
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  for (const k of ["command", "file_path", "path", "pattern", "query", "notebook_path", "url", "prompt"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return clamp(v.replace(/\s+/g, " ").trim(), TOOL_DETAIL_MAX);
  }
  return "";
}

function pushMsg(items: CliItem[], role: "user" | "ai", text: string, at: number): void {
  const t = text.trim();
  if (!t) return;
  // 같은 화자가 연달아 말하면 한 덩이로 잇는다 — Claude Code 는 한 턴의 산문을 여러
  // 레코드로 쪼개 적어서, 그대로 두면 말풍선이 문장 단위로 흩어진다. 사이에 도구가
  // 끼어 있으면 잇지 않는다(그건 진짜로 나뉜 것이다).
  const last = items[items.length - 1];
  if (last && last.kind === "msg" && last.role === role) {
    last.text = clamp(last.text + "\n\n" + t, MSG_TEXT_MAX);
    return;
  }
  items.push({ kind: "msg", role, text: clamp(t, MSG_TEXT_MAX), at });
}

function readClaude(recs: Record<string, unknown>[], items: CliItem[]): void {
  for (const r of recs) {
    // 서브에이전트의 속말이다 — 본 대화에 섞으면 사용자가 하지 않은 지시가 나타난다.
    if (r.isSidechain === true) continue;
    const type = r.type;
    if (type !== "user" && type !== "assistant") continue;
    const at = ms(r.timestamp);
    const m = r.message as Record<string, unknown> | undefined;
    if (!m) continue;
    const content = m.content;

    if (typeof content === "string") {
      pushMsg(items, type === "user" ? "user" : "ai", content, at);
      continue;
    }
    for (const b of arr(content)) {
      switch (b.type) {
        case "text":
          pushMsg(items, type === "user" ? "user" : "ai", str(b.text), at);
          break;
        case "tool_use":
          items.push({ kind: "tool", name: str(b.name) || "tool", detail: toolDetail(b.input), at });
          break;
        // thinking 은 본문이 비고 서명만 남는다(모델이 돌려준 그대로다). 보여줄 게 없다.
        // tool_result 는 도구 호출에 이미 붙어 있는 정보라 줄을 하나 더 만들지 않는다.
        default:
          break;
      }
    }
  }
}

function readCodex(recs: Record<string, unknown>[], items: CliItem[]): void {
  for (const r of recs) {
    const at = ms(r.timestamp);
    const p = (r.payload ?? {}) as Record<string, unknown>;

    if (r.type === "event_msg") {
      // 사람이 친 말은 여기가 원본이다.
      if (p.type === "user_message") pushMsg(items, "user", cleanUserText(str(p.message)), at);
      continue;
    }
    if (r.type !== "response_item") continue;

    if (p.type === "message" && p.role === "assistant") {
      const text = arr(p.content).map(b => str(b.text)).join("");
      pushMsg(items, "ai", text, at);
      continue;
    }
    // user 역할의 response_item 은 건너뛴다 — event_msg 와 같은 말이 주입 블록과 함께 온다.
    if (p.type === "custom_tool_call" || p.type === "function_call") {
      const name = str(p.name) || "tool";
      const raw = p.input ?? p.arguments;
      items.push({ kind: "tool", name, detail: toolDetail(raw), at });
    }
  }
}

/** 꼬리 텍스트를 대화 조각으로 바꾼다.
 *
 *  상한이 **둘**이다. `cap` 은 말의 수를(도구가 아니라 — 사람이 "200마디" 라고 할 때 세는
 *  건 주고받은 말이지 그 사이에 파일을 몇 번 읽었는지가 아니다), `charCap` 은 글자 수를
 *  센다. 개수만으로는 못 막는다: 200마디가 전부 긴 로그면 4MB 가 되고 저장이 통째로
 *  실패한다. 둘 중 **먼저 걸리는 쪽**에서 자른다.
 *
 *  자르는 방향은 항상 뒤에서 앞이다 — 대화를 이어가려면 끝이 필요하다. 남긴 첫 말보다
 *  앞의 도구는 함께 버린다(주인 없는 도구 줄이 된다). */
export function parseBody(
  agent: CliAgent,
  text: string,
  cap: number = CLI_MSG_CAP,
  charCap: number = CLI_CHAR_CAP,
): CliBody {
  const recs = records(text);
  const all: CliItem[] = [];
  if (agent === "claude") readClaude(recs, all);
  else readCodex(recs, all);

  const total = all.reduce((n, it) => n + (it.kind === "msg" ? 1 : 0), 0);
  if (cap <= 0) return { items: all, clipped: false, droppedMsgs: 0 };

  // 뒤에서부터 걸으며 말을 세고 글자를 더한다. 어느 한쪽이 차면 거기서 멈춘다.
  let seen = 0, chars = 0, cut = 0, hit = false;
  for (let i = all.length - 1; i >= 0; i--) {
    const it = all[i];
    const len = it.kind === "msg" ? it.text.length : it.detail.length;
    // 첫 항목은 상한을 넘더라도 하나는 넣는다 — 아무것도 없는 대화를 만드는 것보다 낫다.
    if (seen > 0 && (chars + len > charCap || (it.kind === "msg" && seen >= cap))) { cut = i + 1; hit = true; break; }
    chars += len;
    if (it.kind === "msg") seen++;
  }
  if (!hit) return { items: all, clipped: false, droppedMsgs: 0 };
  // 자른 자리가 도구 줄 위에 떨어질 수 있다. 그대로 두면 대화가 "Read a.ts" 로 시작한다 —
  // 그 도구를 부른 말은 이미 버려졌으니 주인 없는 줄이다. 첫 말까지 밀어낸다.
  while (cut < all.length && all[cut].kind !== "msg") cut++;
  return { items: all.slice(cut), clipped: true, droppedMsgs: total - seen };
}
