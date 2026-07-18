/** 프로바이더별 선택 가능한 모델 목록 — /model 명령·모델 피커가 공유.
 *  "채널"은 인증 경로에 따라 다르다: Claude 구독/키, ChatGPT 구독(Codex 백엔드), OpenAI 키, Grok, GLM. */

import { t } from "../i18n";

export interface ModelOpt { id: string; label: string }

/** Claude (구독 또는 API 키) — Claude Code가 전환 지원하는 모델군 */
export const CLAUDE_MODELS: ModelOpt[] = [
  { id: "claude-opus-4-8", label: t("model.opus48") },
  { id: "claude-sonnet-5", label: t("model.sonnet5") },
  { id: "claude-haiku-4-5-20251001", label: t("model.haiku45") },
  { id: "claude-fable-5", label: "Fable 5" },
];

/** ChatGPT 구독(Codex 백엔드) — 2026 기준 GPT-5.6 계열. (gpt-5.2/5.3-codex는 폐기됨) */
export const CODEX_MODELS: ModelOpt[] = [
  { id: "gpt-5.6-terra", label: t("model.gpt56Terra") },
  { id: "gpt-5.6-sol", label: t("model.gpt56Sol") },
  { id: "gpt-5.6-luna", label: t("model.gpt56Luna") },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.4-mini", label: t("model.gpt54Mini") },
];

/** OpenAI API 키 경로 */
export const OPENAI_MODELS: ModelOpt[] = [
  { id: "gpt-5.2", label: t("model.gpt52") },
  { id: "gpt-5.2-mini", label: t("model.gpt52Mini") },
  { id: "gpt-5.1", label: "GPT-5.1" },
];

export const GROK_MODELS: ModelOpt[] = [
  { id: "grok-4", label: t("model.grok4") },
  { id: "grok-4-fast", label: "Grok 4 Fast" },
  { id: "grok-3", label: "Grok 3" },
];

export const GLM_MODELS: ModelOpt[] = [
  { id: "glm-4.6", label: t("model.glm46") },
  { id: "glm-4.5", label: "GLM-4.5" },
  { id: "glm-4.5-air", label: t("model.glm45Air") },
];
