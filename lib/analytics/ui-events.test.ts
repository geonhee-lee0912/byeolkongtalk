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
