// lib/admin/product-map.ts — 원가(llm_usage.route)와 매출(별 소모 source)을 같은 상품 라벨로 모은다. 순수.
//
// 🔴 왜 코드에 두나 — 이 매핑이 틀리면 "어느 상품이 적자인가"가 통째로 뒤집힌다. SQL 안의
//    CASE 문은 테스트할 수 없지만 여기는 유닛으로 잠긴다. route·source 가 늘면 테스트가 먼저 깨진다.

// 🔴 `공통(매출없음)` 의 괄호는 장식이 아니라 **막대를 읽는 데 필요한 정보**다. 공통(롤링
//    요약·민감 판정)은 매출이 없어 항상 음수인데, 기여 막대에서 실적자 상품과 **같은 주황
//    막대**로 보인다. note 가 말하긴 하지만 그건 371자 문단의 네 번째 caveat 에 11px/35%
//    투명도다 — 막대의 존재 이유가 "한눈에" 인데 그 caveat 은 한눈에 안 들어온다.
//    (라벨 폭은 DivergingBar 의 `w-28`=112px 안에 들어가는 것을 확인했다.)
export const PRODUCT_LABELS = ["타로", "사주", "운세", "연애", "별마루", "공통(매출없음)", "기타"] as const;
export type ProductLabel = (typeof PRODUCT_LABELS)[number];

/**
 * llm_usage.route → 상품 라벨.
 * route 는 API 경로 문자열이거나(`/api/...`), 스트리밍을 안 타는 우회 2곳의 모듈 경로다.
 */
export function labelOfRoute(route: string): ProductLabel {
  if (route.startsWith("/api/consultations/tarot")) return "타로";
  if (route.startsWith("/api/consultations/saju")) return "사주";
  if (route.startsWith("/api/relationship")) return "연애";
  if (route.startsWith("/api/fortune")) return "운세";
  if (route.startsWith("/api/byeolmaru")) return "별마루";
  // 공통 경로 — 종목을 가리지 않고 모든 대화에 얹힌다(롤링 요약 · 민감 2차 판정).
  if (route.startsWith("lib/claude.") || route.startsWith("lib/sensitive.")) return "공통(매출없음)";
  return "기타";
}

/**
 * star_transactions.source → 상품 라벨.
 *
 * 🔴 **domain 이 아니라 source 를 받는다.** `admin_star_spend_breakdown` 의 domain 은 분류
 *    사다리 끝에 `ELSE 'upsell'` 폴백이 있어서, 매칭 안 된 source 가 전부 거기로 떨어진다.
 *    그 폴백에 들어 있는 건 인챗 업셀이 아니다 — 2026-09-27 dev 실측:
 *      relationship_slot 1,800별(전체 4위) · relationship_sim 75 · relationship_sim_suggest 10
 *      · byeolmaru_subscription 20.
 *    domain 기준으로 접으면 **별마루는 매출 0 + 원가 전액 = 영구 적자**로 보이고 타로는 남의
 *    매출을 얹는다. prod 는 아직 5별뿐이라 미미하지만 별마루가 나가는 순간 구독 매출이 통째로
 *    타로로 간다. 계약은 product-map.test.ts.
 *
 * ⚠️ `_` 는 LIKE 의 와일드카드지만 여기는 JS 라 `startsWith` 로 충분하다. SQL 로 옮길 일이
 *    생기면 `left(s,8)='fortune_'` 를 써야 한다(AGENTS.md).
 */
export function labelOfSpendSource(source: string): ProductLabel {
  if (source === "tarot_reading") return "타로";
  if (source === "saju_reading") return "사주";
  if (source.startsWith("fortune_")) return "운세";
  if (source.startsWith("relationship_") || source.startsWith("rel_")) return "연애";
  if (source.startsWith("byeolmaru_")) return "별마루";
  // 진짜 인챗 업셀 2종. 타로/사주 대화 **안에서** 일어나 원가가 그 chat route 에 이미 포함된다 —
  // 매출만 따로 세우면 타로가 실제보다 적자로, 업셀이 순이익으로 보인다(사주 업셀도 여기 섞인다).
  if (source === "clarifier" || source === "extend") return "타로";
  return "기타";
}
