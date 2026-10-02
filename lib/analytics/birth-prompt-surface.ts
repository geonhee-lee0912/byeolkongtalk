// 생일 입력 팝업(BirthPromptButton) 계측의 surface 단일 원천.
//
// 🔴 이 값은 ui_events.meta.surface 로 남아 자리별 "클릭 → 저장" 판독의 키가 된다.
//    한 번 쓰기 시작한 값을 바꾸면 그 자리의 추세가 끊긴다 — 새 자리는 새 값으로 추가할 것.
export const BIRTH_PROMPT_SURFACE = {
  fortunePicker: "fortune_picker",
  fortuneHeader: "fortune_header",
  byeolmaruHub: "byeolmaru_hub",
  byeolmaruDaySaju: "byeolmaru_day_saju",
  byeolmaruDayWoori: "byeolmaru_day_woori",
  byeolmaruDayTarot: "byeolmaru_day_tarot",
} as const;

export type BirthPromptSurface =
  (typeof BIRTH_PROMPT_SURFACE)[keyof typeof BIRTH_PROMPT_SURFACE];
