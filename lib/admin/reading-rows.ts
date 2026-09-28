// lib/admin/reading-rows.ts — 2층 `리딩 ▾` 표의 한 행이 **무엇을 잴 수 있나.** 순수.
//
// 🔴 왜 product-map.ts 가 아니라 별 파일인가 — 근거는 취향이 아니라 **타입**이다.
//    product-map 의 계약은 `PRODUCT_LABELS` ↔ `labelOfRoute` ↔ `labelOfSpendSource` 삼각형
//    ("원가 라벨과 매출 라벨이 짝을 이룬다")이고 여기는 그 삼각형에 **전혀 참여하지 않는다**
//    — `label` 은 `string` 이지 `ProductLabel` 이 아니고, 공유 상수·타입·헬퍼가 0개다.
//    한 파일에 두면 `"연애"`(ProductLabel)와 `"연애 상담"`(행 라벨) **두 어휘가 공존**해서
//    나중에 "연애 라벨 정리"를 하는 사람이 같은 축으로 오인한다.
//
// 🔴 `0%` 와 "해당 없음" 은 다르다. `0.0%` 는 "쟀더니 아무도 안 했다" 로 읽히는데 아래 행들은
//    그 값이 애초에 **생길 수 없다** — 거짓을 정확한 숫자로 찍는 꼴이다. 이 화면은 이미 표본
//    없음을 `null`→"—" 로 표시하는 규약을 쓰므로(`pct1` 의 den<=0) 같은 규약을 쓴다.
//
// 🔴 왜 데이터로 판정하지 않고 코드에 두나 — "이 종목이 [END] 를 쓰나" 를 데이터로 물으면
//    `bool_or(content LIKE '%[END]%')` 같은 **1비트** 신호가 되는데,
//    ① 페르소나가 한 번만 삐끗해도 "해당 없음" 이 통째로 "0.6%" 로 뒤집히고,
//    ② "못 한다" 와 "아직 안 했다" 를 구분 못 한다(신생 대화 종목이 "—" 로 숨는다).
//    진짜 근거는 데이터가 아니라 **프롬프트 파일·라우트 존재 여부·INSERT 문**에 있다. 그래서
//    코드에 두고 근거를 인용한다 — SQL 안의 CASE 는 테스트가 안 되지만 여기는 유닛으로 잠긴다.
//    ⚠️ 이 선택의 약점은 **반대 방향**이다: 현실이 바뀌었는데 이 표를 안 고치면 실데이터가
//       영원히 "—" 로 숨고 유닛은 상수끼리만 비교하니 **절대 안 깨진다.** 그래서 호출부
//       (app/api/admin/layer2/route.ts)가 "못 잰다고 했는데 값이 있다" 를 런타임에 반증한다.

/** 리딩 표의 한 행 — 라벨 + 각 지표를 이 행에서 **잴 수 있나.** */
export interface ReadingRowView {
  label: string;
  /** 대화 종결([END] 마커)이라는 개념이 있나 — 없으면 완료율은 null 이다. */
  ended: boolean;
  /** 결과 화면 열람(`result_viewed_at`)을 찍나 — 안 찍으면 결과 열람은 null 이다. */
  viewed: boolean;
  /** 이 리딩의 돈이 `readings.stars_spent` 에 담기나 — 안 담기면 유료 건수는 null 이다. */
  paid: boolean;
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
//   (`app/tarot/result/page.tsx:98` · `app/(consultations)/saju/result/page.tsx`).
// - 🔴 paid 가 relationship 만 false 인 근거 — `app/api/relationship/route.ts:232` 가 스레드
//   생성 시 `stars_spent: 0` 을 **하드코딩**한다. 연애 상담의 돈은 패스(`PASS_PLANS`)와 스킬
//   별 소모(`star_transactions`)에 있고 이 컬럼엔 **구조적으로 영원히 안 들어온다.** 0 으로
//   찍으면 "연애 상담 155건인데 매출 0" 으로 읽히는데 실제로 relationship_slot 은 별 소모 4위다.
//   ⚠️ `relationship_sim` 은 **다르다** — `app/api/relationship/sim/route.ts:98` 이
//   `stars_spent: cost`(유료면 `SIM_COST`)를 쓴다. prod 가 전부 0인 건 전부 무료 판이었기
//   때문이고 그건 **참값**이라 그대로 0 으로 보여준다.
const READING_BASES = new Map<string, ReadingBase>([
  ["tarot", { label: "타로", ended: true, viewed: true, paid: true, canReport: true }],
  ["saju", { label: "사주", ended: true, viewed: true, paid: true, canReport: true }],
  [
    "relationship",
    { label: "연애 상담(종결없음)", ended: false, viewed: false, paid: false, canReport: false },
  ],
  [
    "relationship_sim",
    { label: "연애 시뮬(종결없음)", ended: false, viewed: false, paid: true, canReport: false },
  ],
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
    paid: true,
    canReport: false,
  };
  // `/fortune` one-shot 리포트 — 대화가 없다. assistant 메시지 1건만 남기고 [END] 를 안 쓰며
  // (`app/api/fortune/create/route.ts`), `/fortune/result` 는 GET 만 하고 열람 POST 를 안 부른다.
  // 유료 여부는 그대로다 — 리포트도 `stars_spent: effectiveCost` 로 값이 들어간다.
  if (isReport) {
    return { label: `${base.label}(리포트)`, ended: false, viewed: false, paid: base.paid };
  }
  return {
    label: base.canReport ? `${base.label}(대화)` : base.label,
    ended: base.ended,
    viewed: base.viewed,
    paid: base.paid,
  };
}
