import { test } from "node:test";
import assert from "node:assert/strict";
import { UI_EVENTS, isUiEvent } from "./ui-events.ts";

const MBTI_EVENTS = [
  "saju_mbti_started", "saju_mbti_birth", "saju_mbti_completed",
  "saju_mbti_shared", "saju_mbti_shared_view", "saju_mbti_retry",
] as const;

test("UI_EVENTS — MBTI 이벤트 6종 포함", () => {
  for (const e of MBTI_EVENTS) {
    assert.ok((UI_EVENTS as readonly string[]).includes(e), `missing: ${e}`);
  }
});

test("isUiEvent — MBTI 이벤트 통과, 오타 거부", () => {
  assert.equal(isUiEvent("saju_mbti_completed"), true);
  assert.equal(isUiEvent("saju_mbti_finish"), false);
});

test("UI_EVENTS — 별마루 계측 4종이 등록돼 있다", () => {
  for (const e of [
    "byeolmaru_day_selected",
    "byeolmaru_slot_clicked",
    "byeolmaru_no_profile",
    "byeolmaru_need_login",
  ]) {
    assert.equal(isUiEvent(e), true, `${e} 가 UI_EVENTS 에 없다`);
  }
});

test("UI_EVENTS — 별마루 ② 페이월 이벤트가 등록돼 있다", () => {
  assert.equal(isUiEvent("byeolmaru_gate_shown"), true);
  assert.equal(isUiEvent("byeolmaru_trial_started"), true);
  assert.equal(isUiEvent("byeolmaru_subscribe_clicked"), true);
  assert.equal(isUiEvent("byeolmaru_subscribe_completed"), true);
});

// P5-4 T3 — 미끼 당일 접힘(slot별) 닫기 클릭 계측.
test("UI_EVENTS — 별마루 미끼 닫기(당일 접힘) 이벤트가 등록돼 있다", () => {
  assert.equal(isUiEvent("byeolmaru_gate_dismissed"), true);
});

// P5-3 T5 — 허브 "무료로 더 볼 것" 목록 3종(오늘 타로·사주 MBTI·별 인연 지도) 행 클릭.
test("UI_EVENTS — 별마루 무료 목록 3종 클릭 이벤트가 등록돼 있다", () => {
  assert.equal(isUiEvent("byeolmaru_free_item_clicked"), true);
});

// 2026-10-02 생일 벽 인라인 입력 — 자리별 "클릭 → 저장" 판독.
test("UI_EVENTS — 생일 입력 팝업 이벤트 2종이 등록돼 있다", () => {
  assert.equal(isUiEvent("birth_prompt_clicked"), true);
  assert.equal(isUiEvent("birth_prompt_saved"), true);
});

// 2026-10-03 구매 칸 벽 계측 — 벽 노출 → 카카오 클릭 / 생일 저장 깔때기(surface 로 birth_prompt_* 와 잇는다).
test("UI_EVENTS — 구매 칸 벽 노출·카카오 클릭 이벤트 2종이 등록돼 있다", () => {
  assert.equal(isUiEvent("picker_gate_shown"), true);
  assert.equal(isUiEvent("picker_login_clicked"), true);
});

// 2026-10-04 타로톡 인챗 결제 제안 계측 — 제안 노출 → 탭 (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-7).
test("UI_EVENTS — 인챗 제안 노출·탭 이벤트 2종이 등록돼 있다", () => {
  assert.equal(isUiEvent("inchat_offer_shown"), true);
  assert.equal(isUiEvent("inchat_offer_clicked"), true);
});

// 2026-10-04 Meta AddToCart 원천 = 잔액 부족 확인 모달 노출. /api/event 가 allowlist 로 거르므로 여기 없으면 서버가 버린다.
test("UI_EVENTS — 잔액 부족 모달 노출(paywall_shown)이 등록돼 있다", () => {
  assert.equal(isUiEvent("paywall_shown"), true);
});

// 2026-10-09 메뉴판 반반 고장 감시 — 지갑 조회 실패. /api/event 가 allowlist 로 거르므로 여기 없으면 서버가 버린다.
test("UI_EVENTS — 지갑 조회 실패(wallet_fetch_failed)가 등록돼 있다", () => {
  assert.equal(isUiEvent("wallet_fetch_failed"), true);
});

// 2026-10-05 메뉴판·별경제 계측 — 메뉴 노출 → 상품 탭 → 비교 → 동의 · 맛보기 끝 이어서 깊게 (spec §8).
test("UI_EVENTS — 메뉴판·이어서 깊게 이벤트 6종이 등록돼 있다", () => {
  for (const e of [
    "tarot_menu_viewed",
    "tarot_product_selected",
    "tarot_compare_opened",
    "tarot_compare_confirmed",
    "teaser_upsell_shown",
    "teaser_upsell_clicked",
  ]) {
    assert.equal(isUiEvent(e), true, `${e} 가 UI_EVENTS 에 없다`);
  }
});
