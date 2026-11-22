// 스프레드 자리 배치(순수) — 카드 뽑기(CardDrawRitual)와 스프레드 안내 그림(SpreadDiagram)이 같이 쓴다.
// CardDrawRitual 은 "use client" 라 서버 화면이 거기서 값을 가져올 수 없어 여기 둔다.
// 5장(비관계) 3+2 / 6장 2x3 / 7장 3+3+1(중앙) — 행 단위 슬롯 배치. 3장 이하는 한 줄, relationship_5 는 전용 모양(2×2 + 오른쪽 1)
export const MULTI_ROW_SLOT_LAYOUTS: Record<number, number[][]> = {
  5: [[0, 1, 2], [3, 4]],
  6: [[0, 1, 2], [3, 4, 5]],
  7: [[0, 1, 2], [3, 4, 5], [6]],
};
