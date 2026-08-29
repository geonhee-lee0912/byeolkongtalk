// lib/fortune/model.ts
// fortune one-shot 모델 정책: 무료 데일리는 최저가(nano), 유료 리포트는 luna(구조화 출력으로 형식 안정).
// spec docs/superpowers/specs/2026-08-29-운세리포트-luna-구조화출력-design.md
import type { FortuneType } from "./types.ts";

// 무료 데일리 저가 모델.
export const FORTUNE_CHEAP_MODEL = "gpt-5-nano";
// 유료 리포트 모델 — 2026-08-29 sonnet→luna 이관. chat 의 CHAT_MODEL 과 우연히 같은 값이나 의미가 달라 별도 상수.
export const FORTUNE_REPORT_MODEL = "gpt-5.6-luna";

export function fortuneModel(type: FortuneType): string {
  return type === "daily" || type === "tarot_daily" ? FORTUNE_CHEAP_MODEL : FORTUNE_REPORT_MODEL;
}
