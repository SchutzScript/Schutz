/** 프로바이더별 선택 가능한 모델 목록 — /model 명령·모델 피커가 공유.
 *  "채널"은 인증 경로에 따라 다르다: Claude 구독/키, ChatGPT 구독(Codex 백엔드), OpenAI 키, Grok, GLM. */

import { t } from "../i18n";

export interface ModelOpt { id: string; label: string }

// 라벨은 **게터**다. 이 배열들은 모듈 로드 시 한 번 평가되므로, `label: t(...)` 로 쓰면
// 시작 언어의 문자열이 그대로 굳는다 — 언어를 바꿔도 /model 목록만 옛말로 남는 버그였다.
// 게터로 두면 읽는 시점(=렌더)에 번역되고, 호출부는 한 줄도 안 바뀐다. 라벨을 다른 곳에
// **복사해 캐시하면** 다시 굳으니 주의 — 지금은 _modelCache 가 id 만 캐시해서 안전하다.
const opt = (id: string, key: string): ModelOpt => ({ id, get label() { return t(key); } });

/** Claude (구독 또는 API 키) — Claude Code가 전환 지원하는 모델군 */
export const CLAUDE_MODELS: ModelOpt[] = [
  opt("claude-opus-4-8", "model.opus48"),
  opt("claude-sonnet-5", "model.sonnet5"),
  opt("claude-haiku-4-5-20251001", "model.haiku45"),
  { id: "claude-fable-5", label: "Fable 5" },
];

/** ChatGPT 구독(Codex 백엔드) — 2026 기준 GPT-5.6 계열. (gpt-5.2/5.3-codex는 폐기됨) */
export const CODEX_MODELS: ModelOpt[] = [
  opt("gpt-5.6-terra", "model.gpt56Terra"),
  opt("gpt-5.6-sol", "model.gpt56Sol"),
  opt("gpt-5.6-luna", "model.gpt56Luna"),
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  opt("gpt-5.4-mini", "model.gpt54Mini"),
];

/** OpenAI API 키 경로 */
export const OPENAI_MODELS: ModelOpt[] = [
  opt("gpt-5.2", "model.gpt52"),
  opt("gpt-5.2-mini", "model.gpt52Mini"),
  { id: "gpt-5.1", label: "GPT-5.1" },
];

export const GROK_MODELS: ModelOpt[] = [
  opt("grok-4", "model.grok4"),
  { id: "grok-4-fast", label: "Grok 4 Fast" },
  { id: "grok-3", label: "Grok 3" },
];

export const GLM_MODELS: ModelOpt[] = [
  opt("glm-4.6", "model.glm46"),
  { id: "glm-4.5", label: "GLM-4.5" },
  opt("glm-4.5-air", "model.glm45Air"),
];
