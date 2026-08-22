// 일간(일주 천간) + 월지 → 사람 유형 라벨. 순수. calcSaju().dayStem·pillars.month.branch(한글 단일자) 입력.
// 천간 "신"(辛)=보석형 / 지지 "신"(申)=가을 — 맵이 분리돼 충돌 없음.
const ARCHETYPE: Record<string, string> = {
  갑: "큰나무형",
  을: "화초형",
  병: "태양형",
  정: "등불형",
  무: "큰산형",
  기: "텃밭형",
  경: "원석형",
  신: "보석형",
  임: "큰바다형",
  계: "이슬형",
};

const SEASON: Record<string, string> = {
  인: "봄",
  묘: "봄",
  진: "봄",
  사: "여름",
  오: "여름",
  미: "여름",
  신: "가을",
  유: "가을",
  술: "가을",
  해: "겨울",
  자: "겨울",
  축: "겨울",
};

/** "여름 큰산형". 계절 미상이면 유형만, 일간 미상이면 "별 유형". */
export function dayType(dayStem: string, monthBranch: string): string {
  const arche = ARCHETYPE[dayStem] ?? "별 유형";
  const season = SEASON[monthBranch];
  return season ? `${season}의 ${arche}` : arche;
}
