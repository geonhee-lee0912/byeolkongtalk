import { test } from "node:test";
import assert from "node:assert/strict";
import { labelOfRoute, labelOfSpendSource, PRODUCT_LABELS, readingRowView } from "./product-map.ts";

// 🔴 여기 쓰인 route 문자열은 **리포에 실제로 존재하는 값**만 쓴다(`grep -o 'route: "[^"]*"'` 로
//    확인, dev llm_usage 실적재 3종 포함). 플랜 원안은 `/api/relationship/sim/turn` ·
//    `/api/fortune/report` 를 썼는데 둘 다 리포에 없는 경로다 — prefix 매칭이라 통과는 하지만
//    "실제 적재값이 전부 매핑된다"는 이 테스트의 주장을 거짓으로 만든다.
test("labelOfRoute — 실제 route 값이 전부 매핑된다", () => {
  assert.equal(labelOfRoute("/api/consultations/tarot/chat"), "타로");
  assert.equal(labelOfRoute("/api/consultations/tarot/clarifier"), "타로");
  assert.equal(labelOfRoute("/api/consultations/saju/chat"), "사주");
  assert.equal(labelOfRoute("/api/relationship/chat"), "연애");
  assert.equal(labelOfRoute("/api/relationship/sim/chat"), "연애");
  assert.equal(labelOfRoute("/api/fortune/create"), "운세");
  assert.equal(labelOfRoute("/api/byeolmaru/pair-narrative"), "별마루");
  assert.equal(labelOfRoute("/api/byeolmaru/daily-report"), "별마루");
  assert.equal(labelOfRoute("/api/byeolmaru/card-narrative"), "별마루");
  assert.equal(labelOfRoute("lib/claude.summarizeOlder"), "공통(매출없음)");
  assert.equal(labelOfRoute("lib/sensitive.detectSensitiveAsync"), "공통(매출없음)");
});

test("labelOfRoute — 모르는 route 는 기타로 (크래시하지 않는다)", () => {
  assert.equal(labelOfRoute("/api/something/new"), "기타");
  assert.equal(labelOfRoute(""), "기타");
});

// 매출 귀속은 **source** 기준이다 — `admin_star_spend_breakdown` 의 domain 이 아니다.
// 그 RPC 의 분류 사다리 끝엔 `ELSE 'upsell'` 폴백이 있고, 거기 떨어지는 것들이 인챗 업셀이 아니다.
test("labelOfSpendSource — 종목별 상품 source 가 제 상품으로 간다", () => {
  assert.equal(labelOfSpendSource("tarot_reading"), "타로");
  assert.equal(labelOfSpendSource("saju_reading"), "사주");
  assert.equal(labelOfSpendSource("fortune_compat"), "운세");
  assert.equal(labelOfSpendSource("fortune_saju_full"), "운세");
  assert.equal(labelOfSpendSource("relationship_pass"), "연애");
  assert.equal(labelOfSpendSource("rel_extend"), "연애");
  assert.equal(labelOfSpendSource("rel_skill_verdict"), "연애");
  assert.equal(labelOfSpendSource("made_up"), "기타");
});

// 🔴 이 테스트가 이 파일의 존재 이유다 — **폴백이 타로로 새는 것을 막는다.**
//    플랜 원안은 `admin_star_spend_breakdown` 의 domain 을 받아 `upsell → 타로` 로 접었다.
//    그런데 그 RPC 의 사다리는 매칭 안 되는 source 를 전부 `ELSE 'upsell'` 로 떨어뜨린다.
//    2026-09-27 dev 실측으로 아래 4개가 거기 있었다(relationship_slot 은 1,800별로 전체 4위).
//    플랜대로면 별마루는 **매출 0 + 원가 전액 = 영구 적자**로, 타로는 남의 매출을 얹고 보인다.
test("labelOfSpendSource — domain 폴백('upsell')에 떨어지던 source 가 타로로 새지 않는다", () => {
  assert.equal(labelOfSpendSource("relationship_slot"), "연애");
  assert.equal(labelOfSpendSource("relationship_sim"), "연애");
  assert.equal(labelOfSpendSource("relationship_sim_suggest"), "연애");
  assert.equal(labelOfSpendSource("byeolmaru_subscription"), "별마루");
});

// 반대편 — 진짜 인챗 업셀 2종은 타로로 합치는 게 맞다. 원가가 그 chat route 에 이미 잡혀 있어
// 매출만 따로 세우면 타로가 실제보다 적자로, 업셀이 순이익으로 보인다.
test("labelOfSpendSource — 진짜 인챗 업셀(clarifier·extend)만 타로로 합쳐진다", () => {
  assert.equal(labelOfSpendSource("clarifier"), "타로");
  assert.equal(labelOfSpendSource("extend"), "타로");
});

// 🔴 **이 파일에서 가장 중요한 테스트다.** 위 테스트들은 두 함수를 *따로* 본다 — 그래서
//    `PRODUCT_LABELS` 에 라벨을 넣고 `labelOfRoute` 만 배선하면 tsc·유닛·build 가 **전부
//    통과하고**, 그 상품은 화면에서 **매출 0 + 원가 전액 = 영구 적자**로 그려진다.
//    반대(source 만 배선)면 원가 없는 **순이익**으로 보인다.
//
//    이건 가설이 아니다 — 플랜 원안의 domain 귀속이 **별마루에 대해 정확히 그 그림을 만들었고**
//    (구독 매출이 통째로 타로로 가서 별마루엔 원가만 남았다) 2026-09-27 dev 실측으로 잡았다.
//    새 상품이 붙을 때 같은 자리에서 재발한다 → 그때 이 테스트가 **먼저** 깨지게 한다.
//    실패 메시지는 "무엇이 안 맞나"가 아니라 **"그래서 화면이 어떻게 거짓말하나"**를 말한다.
const KNOWN_ROUTES = [
  "/api/consultations/tarot/chat",
  "/api/consultations/saju/chat",
  "/api/relationship/chat",
  "/api/fortune/create",
  "/api/byeolmaru/pair-narrative",
  "lib/claude.summarizeOlder",
];
const KNOWN_SOURCES = [
  "tarot_reading",
  "saju_reading",
  "fortune_compat",
  "relationship_pass",
  "byeolmaru_subscription",
];

test("원가 라벨과 매출 라벨이 짝을 이룬다 — 한쪽만 배선된 상품이 없다", () => {
  const cost = new Set(KNOWN_ROUTES.map(labelOfRoute));
  const rev = new Set(KNOWN_SOURCES.map(labelOfSpendSource));
  for (const l of PRODUCT_LABELS) {
    // 이 둘은 구조적으로 짝이 없는 게 정상이다 — 공통은 매출이 없고(종목 무관 원가),
    // 기타는 양쪽의 폴백이라 "아직 분류 안 된 것"을 담는 자리다.
    if (l === "공통(매출없음)" || l === "기타") continue;
    assert.ok(cost.has(l), `${l}: route 매핑 없음 — 매출만 잡히고 원가 0 = 순이익으로 보인다`);
    assert.ok(rev.has(l), `${l}: source 매핑 없음 — 원가만 잡히고 매출 0 = 영구 적자로 보인다`);
  }
});

// ⚠️ 이 테스트는 **계약이 아니라 변경 감지기**다 — 배열 리터럴을 다시 쓴 동어반복이라
//    "route.ts 가 이 순서로 items 를 만든다"는 실제 약속은 검증하지 못한다. 목록이 바뀌면
//    먼저 깨져서 사람 눈을 부르는 게 전부이고, 이름이 그 이상을 약속하면 안 된다.
test("PRODUCT_LABELS 목록이 바뀌면 이 테스트가 먼저 깨진다 (변경 감지기)", () => {
  assert.deepEqual([...PRODUCT_LABELS], ["타로", "사주", "운세", "연애", "별마루", "공통(매출없음)", "기타"]);
});

// ── readingRowView ────────────────────────────────────────────────────────
// 🔴 여기 쓰인 consultation_type 은 **prod 에 실제로 존재하는 4종**이다(2026-09-27 전수:
//    tarot 2,385 · saju 325 · relationship 155 · relationship_sim 20). 새 종목이 생기면
//    이 테스트가 먼저 깨지는 게 아니라 **조용히 폴백**하므로, 폴백 동작 자체를 아래에서 잠근다.
test("readingRowView — 대화형 종목은 완료율·결과열람을 잰다", () => {
  assert.deepEqual(readingRowView("tarot", false), { label: "타로(대화)", ended: true, viewed: true });
  assert.deepEqual(readingRowView("saju", false), { label: "사주(대화)", ended: true, viewed: true });
});

// 페르소나가 [END] 를 금지하고 result 라우트도 없다 → 0% 가 아니라 "해당 없음" 이다.
test("readingRowView — 연애 스레드는 완료·열람 개념이 없다", () => {
  assert.deepEqual(readingRowView("relationship", false), {
    label: "연애 상담",
    ended: false,
    viewed: false,
  });
  assert.deepEqual(readingRowView("relationship_sim", false), {
    label: "연애 시뮬",
    ended: false,
    viewed: false,
  });
});

// one-shot 리포트는 대화가 없다 — 어느 종목에 얹히든 두 지표가 다 사라진다.
test("readingRowView — fortune 리포트는 종목과 무관하게 완료·열람이 없다", () => {
  assert.deepEqual(readingRowView("tarot", true), { label: "타로(리포트)", ended: false, viewed: false });
  assert.deepEqual(readingRowView("saju", true), { label: "사주(리포트)", ended: false, viewed: false });
});

// 🔴 모르는 종목은 **숨기지 않고 보여준다** — 틀린 "—" 는 조용하지만 틀린 0% 는 누가 묻는다.
test("readingRowView — 모르는 종목은 숫자를 보여주는 쪽으로 폴백한다 (크래시하지 않는다)", () => {
  assert.deepEqual(readingRowView("brand_new_type", false), {
    label: "brand_new_type",
    ended: true,
    viewed: true,
  });
  assert.deepEqual(readingRowView("", false), { label: "", ended: true, viewed: true });
  // 모르는 종목에 리포트가 얹혀도 라벨만 붙고 크래시하지 않는다.
  assert.deepEqual(readingRowView("brand_new_type", true), {
    label: "brand_new_type(리포트)",
    ended: false,
    viewed: false,
  });
});
