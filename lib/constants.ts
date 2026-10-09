// 공용 상수 — 별 패키지 등. v1 (tarot-friend) lib/types.ts 에서 결제 관련만 이식.
import type { MenuArm } from "./tarot/menu-ab.ts";

export interface StarPackage {
  id: string;
  stars: number;
  price: number;
  label: string;
}

/** 판매 패키지 전체 — 반반 비교 두 그룹 진열의 합집합(2026-10 메뉴판·별 경제, 스펙 §3-1 · §9-1).
 *  결제 준비(/api/payment/ready)·승인(/api/payment/confirm)은 이 목록으로 검증한다 — id 마다 별·가격이 고정이라
 *  두 그룹 목록을 함께 받아도 안전하다(그룹은 진열만 가른다). 별당 가격은 클수록 확실히 싸진다(constants.test.ts).
 *  🗓️ 판정 뒤 정리 배포에서 진 쪽 전용 패키지(55·130 또는 150·300)를 지운다. */
export const STAR_PACKAGES: StarPackage[] = [
  { id: "star_10", stars: 10, price: 1000, label: "10별" },
  { id: "star_30", stars: 30, price: 2800, label: "30별" },
  { id: "star_55", stars: 55, price: 4900, label: "55별" },
  { id: "star_70", stars: 70, price: 5900, label: "70별" },
  { id: "star_130", stars: 130, price: 9900, label: "130별" },
  { id: "star_150", stars: 150, price: 11000, label: "150별" },
  { id: "star_300", stars: 300, price: 19900, label: "300별" },
];

/** 상점 진열 — 메뉴판 그룹 10·30·55·70·130 / 옛 그룹 10·30·70·150·300(지금 prod 그대로). '추천'은 둘 다 70. */
export const SHOP_PACKAGE_IDS: Record<MenuArm, readonly string[]> = {
  menu: ["star_10", "star_30", "star_55", "star_70", "star_130"],
  legacy: ["star_10", "star_30", "star_70", "star_150", "star_300"],
};

/** 그 그룹의 상점 진열(별 수 오름차순) */
export function shopPackages(arm: MenuArm): StarPackage[] {
  return STAR_PACKAGES.filter((p) => SHOP_PACKAGE_IDS[arm].includes(p.id));
}

/** 카카오 신규 가입 웰컴 별 — 타로 원카드(옛 그룹 10 · 메뉴판 맛보기 15)·투카드(15)·사주 단품(10) 1회 커버.
 * 2026-07-22 30→20: 결제 66%가 star_10 갭결제(재구매 8%)라 갭을 벌려 star_30(₩2,800) 첫 결제 유도.
 * 2026-09-13 20→15: 웰컴 20 = 별마루 구독 20 이 정확히 일치해 **가입만 하면 첫 달 구독이 공짜**였다
 * (그 사람의 첫 달 매출은 ₩0 인데 nano 원가는 30일치가 나간다). 15 면 구독에 최소 1회 충전이 걸리는데
 * 구독가(20)는 그대로라 체감 인상이 0 이고, 3일 무료 체험이 따로 있어 체험 장벽도 여전히 0 이다.
 * ⚠️ 부수 효과 — 운세 20별 13종이 웰컴 구매 범위 밖으로 나간다. 의도된 것이다(적자 격자의 결제 유도).
 *    사주 계열 첫 경험은 15별 3종이 받고, 상담형 사주(SAJU_READING_COST=20)는 진입이 이미 폐쇄라 무관.
 *    → 2026-10 메뉴판·별경제로 사주 단품이 전부 10별이 되어 다시 웰컴 범위 안이다(미끼 가격, 의도).
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
