// 공용 상수 — 별 패키지 등. v1 (tarot-friend) lib/types.ts 에서 결제 관련만 이식.

export interface StarPackage {
  id: string;
  stars: number;
  price: number;
  label: string;
}

export const STAR_PACKAGES: StarPackage[] = [
  { id: "star_10", stars: 10, price: 1000, label: "10별" },
  { id: "star_30", stars: 30, price: 2800, label: "30별" },
  { id: "star_70", stars: 70, price: 5900, label: "70별" },
  { id: "star_150", stars: 150, price: 11000, label: "150별" },
  { id: "star_300", stars: 300, price: 19900, label: "300별" },
];

/** 카카오 신규 가입 웰컴 별 — 타로 원/투(10/15)·사주 15별 3종(팩폭·전생·성적표) 1회 커버.
 * 2026-07-22 30→20: 결제 66%가 star_10 갭결제(재구매 8%)라 갭을 벌려 star_30(₩2,800) 첫 결제 유도.
 * 2026-09-13 20→15: 웰컴 20 = 별마루 구독 20 이 정확히 일치해 **가입만 하면 첫 달 구독이 공짜**였다
 * (그 사람의 첫 달 매출은 ₩0 인데 nano 원가는 30일치가 나간다). 15 면 구독에 최소 1회 충전이 걸리는데
 * 구독가(20)는 그대로라 체감 인상이 0 이고, 3일 무료 체험이 따로 있어 체험 장벽도 여전히 0 이다.
 * ⚠️ 부수 효과 — 운세 20별 13종이 웰컴 구매 범위 밖으로 나간다. 의도된 것이다(적자 격자의 결제 유도).
 *    사주 계열 첫 경험은 15별 3종이 받고, 상담형 사주(SAJU_READING_COST=20)는 진입이 이미 폐쇄라 무관.
 * 근거: specs/2026-07-22-welcome-stars-reduction-design.md · 2026-08-29-적자-종합진단-재화가격-재설계-design.md */
export const WELCOME_BONUS_STARS = 15;
/** 첫 충전 보너스 비율 — 첫 결제 패키지 별의 +20% (반올림). 2026-07-20 마진·재결제 유도로 50%→20% */
export const FIRST_CHARGE_BONUS_RATE = 0.2;

/** 정성 이탈조사 설문 완료 보상 별 — 1인 1회(survey_responses partial unique).
 * 무료별이 변동원가의 93%라 값은 보수적. 응답률 보고 조정 가능하게 상수로 분리.
 * 설계: docs/superpowers/specs/2026-08-09-survey-이탈조사-design.md */
export const SURVEY_REWARD_STARS = 10;

/** 별자리 1개 최대 인원(호스트 포함). 라벨 표시 상한(lib/byeoljari/scale.ts showLabels)과 일치. */
export const MAX_STAR_MAP_MEMBERS = 20;
