// 이 언어에 언어 서버가 있는가, 없으면 무엇을 깔아야 하는가.
//
// 지금까지는 설치된 서버만 목록에 있었다. 그래서 gopls 가 없으면 Go 파일은 하이라이트만
// 되고 정의·진단·심볼이 전부 조용히 없었다 — 사용자는 **앱이 원래 그런 줄 안다.**
// 없는 것도 알고 있어야 없다고 말할 수 있다.
//
// 언제 말할지가 그다음 문제다. 파일을 열 때마다 말하면 잔소리가 된다. 언어당 한 번,
// 그리고 정말 그 언어의 파일을 열었을 때만.

export interface ServerRow {
  languageId: string;
  command: string;
  install: string;
  available: boolean;
}

/** 서버가 없어서 알려 줄 만한 언어인가. 아는 언어가 아니면 알릴 것도 없다. */
export function missingFor(catalog: readonly ServerRow[], languageId: string): ServerRow | null {
  const row = catalog.find(r => r.languageId === languageId);
  if (!row || row.available) return null;
  return row;
}

/** 이미 말한 언어를 기억한다. 세션 동안만 — 깔고 나서 다시 켜면 새로 판단해야 한다. */
export function shouldTell(told: ReadonlySet<string>, languageId: string): boolean {
  return !told.has(languageId);
}

/** 화면·에이전트에 함께 쓸 한 줄. 무엇이 없고 무엇을 깔면 되는지 둘 다 있어야 한다. */
export function hintText(row: ServerRow): string {
  return `${row.languageId}: ${row.command} 없음 — ${row.install}`;
}

/**
 * 하이라이트만 되는 언어들. 설정 화면에서 "무엇이 켜져 있나" 를 보여줄 때 쓴다.
 * 이름순으로 고정해 화면이 흔들리지 않게 한다.
 */
export function missingList(catalog: readonly ServerRow[]): ServerRow[] {
  return catalog.filter(r => !r.available).slice().sort((a, b) => a.languageId.localeCompare(b.languageId));
}
