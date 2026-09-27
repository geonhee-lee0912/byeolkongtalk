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

// ── 2층 `리딩 ▾` 표의 행 정의 ──────────────────────────────────────────────
/**
 * 리딩 표의 한 행이 **무엇을 잴 수 있나** — 라벨 + 지표 적용 가능성.
 *
 * 🔴 `0%` 와 "해당 없음" 은 다르다. `0.0%` 는 "쟀더니 아무도 안 했다" 로 읽히는데 아래 행들은
 *    그 값이 애초에 **생길 수 없다** — 거짓을 정확한 숫자로 찍는 꼴이다. 이 화면은 이미 표본
 *    없음을 `null`→"—" 로 표시하는 규약을 쓰므로(`pct1` 의 den<=0) 같은 규약을 쓴다.
 *
 * 🔴 왜 데이터로 판정하지 않고 코드에 두나 — "이 종목이 [END] 를 쓰나" 를 데이터로 물으면
 *    `bool_or(content LIKE '%[END]%')` 같은 **1비트** 신호가 되는데,
 *    ① 페르소나가 한 번만 삐끗해도 "해당 없음" 이 통째로 "0.6%" 로 뒤집히고,
 *    ② "못 한다" 와 "아직 안 했다" 를 구분 못 한다(신생 대화 종목이 "—" 로 숨는다).
 *    진짜 근거는 데이터가 아니라 **프롬프트 파일과 라우트 존재 여부**에 있다. 그래서 코드에
 *    두고 근거를 인용한다 — SQL 안의 CASE 는 테스트가 안 되지만 여기는 유닛으로 잠긴다.
 */
export interface ReadingRowView {
  label: string;
  /** 대화 종결([END] 마커)이라는 개념이 있나 — 없으면 완료율은 null 이다. */
  ended: boolean;
  /** 결과 화면 열람(`result_viewed_at`)을 찍나 — 안 찍으면 결과 열람은 null 이다. */
  viewed: boolean;
}

interface ReadingBase extends ReadingRowView {
  /** `/fortune` one-shot 리포트가 이 종목으로 저장되나 — 그렇다면 대화 행에 `(대화)` 를 붙여 구분한다. */
  canReport: boolean;
}

// 근거 (2026-09-27 코드 확인):
// - relationship · relationship_sim 은 페르소나가 [END] 를 **금지**한다
//   (`data/persona/byeolkong_relationship.md` "## [END] 마커를 쓰지 않는다" ·
//    `byeolkong_relationship_draw.md` "[END] · [SKILL_DONE] 마커 절대 쓰지 마").
//   결과 화면도 없다 — `result_viewed_at` 은 POST `/api/readings/[id]` 만 찍는데
//   `/relationship` 에는 result 라우트 자체가 없다(빌드 라우트 표 확인).
// - tarot · saju 는 둘 다 [END] 를 쓰고 result 페이지가 그 POST 를 부른다
//   (`app/tarot/result/page.tsx` · `app/(consultations)/saju/result/page.tsx`).
// - canReport 가 tarot·saju 뿐인 근거는 `lib/fortune/types.ts` 의 `base: "saju" | "tarot"` 다
//   (리포트는 그 두 값으로만 readings 에 들어간다).
const READING_BASES = new Map<string, ReadingBase>([
  ["tarot", { label: "타로", ended: true, viewed: true, canReport: true }],
  ["saju", { label: "사주", ended: true, viewed: true, canReport: true }],
  ["relationship", { label: "연애 상담", ended: false, viewed: false, canReport: false }],
  ["relationship_sim", { label: "연애 시뮬", ended: false, viewed: false, canReport: false }],
]);

/**
 * `readings.consultation_type` + one-shot 리포트 여부 → 표시할 행.
 *
 * @param consultationType DB 값이라 **신뢰할 수 없는 동적 키**다.
 * @param isReport `emotion_tag` 가 `fortune:` 로 시작하나(RPC 가 판정해 내려준다).
 */
export function readingRowView(consultationType: string, isReport: boolean): ReadingRowView {
  // 🔴 `.get(k)!` 로 단정하지 않는다 — 동적 키로 config 를 조회하고 키를 검증 안 하는 것이
  //    이 리포의 반복 prod 크래시 클래스다. 모르는 종목은 **숫자를 보여주는 쪽**으로 떨어뜨린다:
  //    틀린 `0%` 는 눈에 띄어 누가 묻지만, 틀린 "—" 는 조용히 숨는다.
  const base = READING_BASES.get(consultationType) ?? {
    label: consultationType,
    ended: true,
    viewed: true,
    canReport: false,
  };
  // `/fortune` one-shot 리포트 — 대화가 없다. assistant 메시지 1건만 남기고 [END] 를 안 쓰며
  // (`app/api/fortune/create/route.ts`), `/fortune/result` 는 GET 만 하고 열람 POST 를 안 부른다.
  if (isReport) return { label: `${base.label}(리포트)`, ended: false, viewed: false };
  return {
    label: base.canReport ? `${base.label}(대화)` : base.label,
    ended: base.ended,
    viewed: base.viewed,
  };
}
