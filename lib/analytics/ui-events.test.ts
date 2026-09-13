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

// M-5 — 이름이 "②-b"(폐지된 출석 보상 태스크 번호)였는데 실제 내용은 날짜 선택·크로스셀
// 클릭 이벤트다. 이름을 실제 내용에 맞게 정정한다(②-b 자체는 이 테스트가 다룬 적 없다).
test("UI_EVENTS — 별마루 날짜 선택·크로스셀 클릭 이벤트가 등록돼 있다", () => {
  assert.equal(isUiEvent("byeolmaru_day_selected"), true);
  assert.equal(isUiEvent("byeolmaru_crosssell_clicked"), true);
});
