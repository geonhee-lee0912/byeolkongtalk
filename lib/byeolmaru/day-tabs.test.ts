import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_TABS, parseDayTab } from "./day-tabs.ts";

test("DAY_TABS — 순서는 허브 무료 목록과 같다(사주·타로·우리)", () => {
  assert.deepEqual(
    DAY_TABS.map((t) => t.key),
    ["saju", "tarot", "woori"]
  );
});

// 🔴 신뢰 불가 쿼리로 config 를 조회하다 터진 prod 크래시가 이 저장소에 있다
//    (RECO_DISPLAY[product] → undefined.label, 2026-08-02). 모르는 값은 조용히 기본값으로.
test("parseDayTab — 아는 값만 통과하고 나머지는 전부 saju", () => {
  assert.equal(parseDayTab("saju"), "saju");
  assert.equal(parseDayTab("tarot"), "tarot");
  assert.equal(parseDayTab("woori"), "woori");
  assert.equal(parseDayTab("zzz"), "saju");
  assert.equal(parseDayTab(""), "saju");
  assert.equal(parseDayTab(null), "saju");
  assert.equal(parseDayTab(undefined), "saju");
  assert.equal(parseDayTab(123), "saju");
  assert.equal(parseDayTab({ key: "tarot" }), "saju");
});

test("parseDayTab — 대소문자를 섞어도 통과시키지 않는다(링크는 앱이 만든다)", () => {
  assert.equal(parseDayTab("Tarot"), "saju");
});
