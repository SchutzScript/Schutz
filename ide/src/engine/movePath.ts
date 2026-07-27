// 이름 바꾸기 입력 → 옮길 경로.
//
// 트리에서 이름을 고칠 때 `components/Card.tsx` 처럼 슬래시를 넣으면 **이동**이 된다.
// 메인의 renameEntry 는 원래부터 mkdir -p + rename 이라 워크스페이스 안 임의 이동이
// 가능했는데, 부르는 쪽이 basename 만 갈아끼워 늘 같은 부모에 도로 붙였다.
//
// 경로 계산은 조용히 틀리기 좋은 자리다(`..` 로 워크스페이스 탈출, 폴더를 자기 안으로
// 옮기기, 빈 조각). 그래서 App.tsx 밖 순수 함수로 두고 테스트로 덮는다.

export type MoveTarget =
  | { ok: true; to: string }
  | { ok: false; why: MoveError };

export type MoveError =
  | "empty"          // 이름이 비었다
  | "backslash"      // 역슬래시 — 구분자는 / 하나로 통일한다
  | "escape"         // ../ 로 워크스페이스 밖을 가리킨다
  | "into-self"      // 폴더를 자기 자신 안으로 옮기려 한다
  | "same";          // 그대로다 — 할 일이 없다

/**
 * @param rel   지금 경로 (워크스페이스 기준, / 구분)
 * @param input 사용자가 입력한 새 이름. `/` 가 들어가면 이동이고,
 *              `/` 로 시작하면 **워크스페이스 루트** 기준이다.
 */
export function resolveRenameTarget(rel: string, input: string): MoveTarget {
  const raw = input.trim();
  if (!raw) return { ok: false, why: "empty" };
  // 윈도 사용자가 습관적으로 \ 를 친다. 조용히 바꿔 주면 파일명에 진짜 \ 를 쓰려던
  // 경우와 구분이 안 되므로 그냥 알려 준다.
  if (raw.includes("\\")) return { ok: false, why: "backslash" };

  const fromRoot = raw.startsWith("/");
  const parent = fromRoot ? [] : rel.split("/").slice(0, -1);
  const parts = [...parent, ...raw.split("/")];

  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;      // 빈 조각·현재 폴더는 흘려보낸다
    if (p === "..") {
      if (!out.length) return { ok: false, why: "escape" };
      out.pop();
      continue;
    }
    out.push(p);
  }
  if (!out.length) return { ok: false, why: "empty" };

  const to = out.join("/");
  if (to === rel) return { ok: false, why: "same" };
  // 폴더를 자기 안으로 옮기면 원본이 사라진다. rename 이 성공해 버리는 환경도 있다.
  if (to.startsWith(rel + "/")) return { ok: false, why: "into-self" };
  return { ok: true, to };
}

/** 이동인가(부모가 바뀌는가). 토스트 문구를 가르는 데 쓴다. */
export function isMove(rel: string, to: string): boolean {
  const dir = (p: string) => p.split("/").slice(0, -1).join("/");
  return dir(rel) !== dir(to);
}
