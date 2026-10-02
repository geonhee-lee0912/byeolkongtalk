// 궁합 구매 칸(DualSajuPicker)의 순수 판단.
// 정본: docs/superpowers/specs/2026-10-02-궁합-비로그인-막다른길-design.md §3-2

/** 프로필을 (다시) 불러온 뒤 내 사주를 첫 칸에 자동으로 넣을지.
 *  🔴 생일 저장 뒤 재조회도 이 판단을 탄다 — 예전 마운트 코드(내 사주가 있으면 무조건 첫 칸)를 그대로 쓰면,
 *     생일 없는 내 사주를 둘째 칸에 둔 채 생일을 저장했을 때 첫 칸에도 내가 들어가 같은 사람이 두 칸이 된다
 *     (canConfirm 의 slotA !== slotB 에 걸려 "궁합 보기"가 꺼진다).
 *  칸은 비울 수 없고 다른 사람으로 바꾸기만 하므로, "첫 칸이 비었다" = 아직 아무도 안 골랐다. */
export function autoSlotSelf(input: {
  selfId: string | null;
  slotA: string | null;
  slotB: string | null;
}): boolean {
  return input.selfId !== null && input.slotA === null && input.slotB !== input.selfId;
}
