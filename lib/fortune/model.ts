// lib/fortune/model.ts
// fortune one-shot 모델 정책. 유료 리포트는 luna(구조화 출력으로 형식 안정).
// spec docs/superpowers/specs/2026-08-29-운세리포트-luna-구조화출력-design.md
// 🔴 P6-2(2026-09-20): "daily" 는 이제 별마루 **유료** 오늘 사주다(2탭 무료 데일리는 2026-09-12 폐지).
//    무료 상품 시절 티어링(nano)이 이사할 때 따라오지 않아 유료 리포트 중 이것만 싼 모델을 쓰고 있었다 —
//    스펙 2026-09-19 §6-1 A/B 실측(nano 반복·존댓말 혼입 vs luna 결함 0·더 빠름)으로 luna 로 복구.
import type { FortuneType } from "./types.ts";

// 무료 데일리 저가 모델 — 남은 사용처는 비활성 tarot_daily 뿐.
export const FORTUNE_CHEAP_MODEL = "gpt-5-nano";
// 유료 리포트 모델 — 2026-08-29 sonnet→luna 이관. chat 의 CHAT_MODEL 과 우연히 같은 값이나 의미가 달라 별도 상수.
export const FORTUNE_REPORT_MODEL = "gpt-5.6-luna";

export function fortuneModel(type: FortuneType): string {
  return type === "tarot_daily" ? FORTUNE_CHEAP_MODEL : FORTUNE_REPORT_MODEL;
}
