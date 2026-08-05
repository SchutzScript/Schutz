// 메인이 "UTF-8 이 아니라 안 열었다" 고 답한 것을 사람 말로 바꾼다.
//
// 메인은 IPC 로 `SCHUTZ_ENCODING:<kind>` 라는 코드만 던진다(전자는 언어를 모른다).
// 그 코드를 번역하는 자리가 편집기 안에만 있어서, 같은 오류가 다른 길로 나오면
// 원시 코드가 그대로 보였다. 특히 **에이전트**가 그랬다 — read_file 결과로
// `오류: SCHUTZ_ENCODING:not-utf8` 을 받으면 무슨 일인지 알 수 없어 같은 파일을
// 계속 다시 읽으며 라운드를 태운다. 그래서 한 군데로 모은다.

import { t } from "./i18n";

const PREFIX = "SCHUTZ_ENCODING:";

/** 이 오류가 인코딩 거절인가 — 맞으면 종류, 아니면 null. */
export function encodingKind(raw: string): string | null {
  const s = String(raw ?? "");
  const i = s.indexOf(PREFIX);
  if (i < 0) return null;
  return s.slice(i + PREFIX.length).trim().split(/\s/)[0] || null;
}

/** 사람이 읽을 문장. 인코딩 거절이 아니면 받은 문자열을 그대로 돌려준다. */
export function encodingMessage(raw: string): string {
  const kind = encodingKind(raw);
  if (!kind) return String(raw ?? "");
  if (kind === "binary") return t("enc.binary");
  if (kind === "utf16le" || kind === "utf16be") return t("enc.utf16");
  return t("enc.notUtf8");
}
