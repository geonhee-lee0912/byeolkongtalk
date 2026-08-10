// lib/fortune/model.ts
// fortune one-shot 모델 정책: 무료 데일리는 최저가, 유료 리포트는 sonnet(엄격-형식 신뢰성).
// spec docs/superpowers/specs/2026-08-10-model-tiering-routing-design.md §2.
import type { FortuneType } from "./types.ts";

// 무료 데일리 저가 모델. QA(플랜 Task 7)로 nano 품질 확인 후, 불충분하면 "gpt-5-mini" 로 교체.
export const FORTUNE_CHEAP_MODEL = "gpt-5-nano";

export function fortuneModel(type: FortuneType): string {
  return type === "daily" || type === "tarot_daily" ? FORTUNE_CHEAP_MODEL : "claude-sonnet-5";
}
