// lib/claude/empty-retry.ts
// 빈 응답(0자 end_turn) 뒤 재시도에 붙이는 지시. 같은 입력을 그대로 다시 보내면 모델이 일부러 침묵한
// 경우(유저가 "기다려"를 반복 → 2026-10-18 prod, 두 시도 모두 0자)엔 또 비어 재시도가 쓸모없다.

export const EMPTY_RETRY_NUDGE =
  "[재시도 안내] 직전 시도의 응답이 비어 있었다. 빈 응답은 금지 — 유저가 기다려 달라고 하거나 짧은 말만 보내도 짧게라도 반드시 답한다.";

/** 직전 시도가 빈 완료였으면 동적 시스템 블록 끝에 재시도 지시를 붙인다(정적·캐시 블록은 건드리지 않는다). */
export function systemDynamicForAttempt(systemDynamic: string, prevAttemptEmpty: boolean): string {
  if (!prevAttemptEmpty) return systemDynamic;
  return systemDynamic ? `${systemDynamic}\n\n${EMPTY_RETRY_NUDGE}` : EMPTY_RETRY_NUDGE;
}
