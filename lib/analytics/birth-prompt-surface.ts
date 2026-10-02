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
  // 궁합 구매 칸(DualSajuPicker). ui_events 는 경로를 남기지 않아 두 상품을 값으로 가른다
  // (specs/2026-10-02-궁합-비로그인-막다른길-design.md §3-5).
  compatPicker: "compat_picker",
  compatSocialPicker: "compat_social_picker",
} as const;

export type BirthPromptSurface =
  (typeof BIRTH_PROMPT_SURFACE)[keyof typeof BIRTH_PROMPT_SURFACE];
