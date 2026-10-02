// 궁합 구매 칸(DualSajuPicker)의 순수 판단.
// 정본: docs/superpowers/specs/2026-10-02-궁합-비로그인-막다른길-design.md §3-2

/** 프로필을 (다시) 불러온 뒤 내 사주를 첫 칸에 자동으로 넣을지.
 *  🔴 생일 저장 뒤 재조회도 이 판단을 탄다 — 예전 마운트 코드(내 사주가 있으면 무조건 첫 칸)를 그대로 쓰면,
 *     생일 없는 내 사주를 둘째 칸에 둔 채 생일을 저장했을 때 첫 칸에도 내가 들어가 같은 사람이 두 칸이 된다
 *     (canConfirm 의 slotA !== slotB 에 걸려 "궁합 보기"가 꺼진다).
 *  칸은 비울 수 없고 다른 사람으로 바꾸기만 하므로, "첫 칸이 비었다" = 첫 칸엔 아직 아무도 안 골랐다
 *  (둘째 칸은 차 있을 수 있다 — 테스트 ⑤). */
export function autoSlotSelf(input: {
  selfId: string | null;
  slotA: string | null;
  slotB: string | null;
}): boolean {
  return input.selfId !== null && input.slotA === null && input.slotB !== input.selfId;
}

/** 활성 칸에 고를 사람이 하나도 없나 — 목록 자리에 큰 "+ 새 사람 입력"을 둘지 정한다.
 *  🔴 내 생년월일을 막 저장한 신규 유저가 바로 이 상태다(목록엔 "반대편 선택됨" 내 사주 한 줄뿐) — 다음 행동이
 *     머리글의 작은 링크 하나면 놓치기 쉽다(리뷰 제안, 사용자 승인 2026-10-02). 자동으로 열지는 않는다.
 *  지금 칸에 이미 고른 사람은 목록에 보이므로 "고를 사람"으로 센다 — 반대편 칸의 사람만 뺀다. */
export function noOneToPick(input: {
  profiles: readonly { id: string }[];
  active: "A" | "B";
  slotA: string | null;
  slotB: string | null;
}): boolean {
  const other = input.active === "A" ? input.slotB : input.slotA;
  return input.profiles.every((p) => p.id === other);
}
