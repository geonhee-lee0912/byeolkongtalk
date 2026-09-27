import { test } from "node:test";
import assert from "node:assert/strict";
import { labelOfRoute, labelOfSpendSource, PRODUCT_LABELS } from "./product-map.ts";

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
  assert.equal(labelOfRoute("lib/claude.summarizeOlder"), "공통");
  assert.equal(labelOfRoute("lib/sensitive.detectSensitiveAsync"), "공통");
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

test("PRODUCT_LABELS 가 표시 순서를 고정한다", () => {
  assert.deepEqual([...PRODUCT_LABELS], ["타로", "사주", "운세", "연애", "별마루", "공통", "기타"]);
});
