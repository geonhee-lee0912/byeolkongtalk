import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_TABS, acceptReloadedCalendar, parseDayTab } from "./day-tabs.ts";

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

// 자격이 바뀐 뒤(체험·구독 — byeolmaru:entitlement-changed) 껍데기가 다시 받은 캘린더를 세 탭에 내려줄까.
// 🔴 진입 때와 달리 이미 그려 둔 탭이 있다 — 5xx·본문 깨짐으로 덮으면 세 탭이 통째로 '못 펼쳤어'가 돼
//    읽던 리포트를 잃는다. 401·404 는 '모르는 상태'가 아니라 확정된 상태라 내려준다(각 탭이 판단).
test("acceptReloadedCalendar — 본문 있는 2xx·401·404 만 받고 5xx·본문 깨짐은 버린다", () => {
  assert.equal(acceptReloadedCalendar(200, { today: "2026-10-12" }), true);
  assert.equal(acceptReloadedCalendar(401, null), true); // 세션 만료 — 로그인 벽
  assert.equal(acceptReloadedCalendar(404, { entitled: true }), true); // 생일 없음 — 타로는 자격으로 그린다
  assert.equal(acceptReloadedCalendar(200, null), false); // 본문 깨짐
  assert.equal(acceptReloadedCalendar(500, { error: "internal" }), false);
  assert.equal(acceptReloadedCalendar(504, null), false);
  assert.equal(acceptReloadedCalendar(400, { error: "bad" }), false);
});

// 🔴 본문 없는 404 는 '생일 없음'이 아니다 — 프록시·CDN 이 돌려준 HTML 404(res.json() 이 null 로 떨어진다)를 받아들이면
//    열린 탭 전부가 no_profile 로 바뀌어 읽던 리포트를 잃는다. 404 는 라우트가 자격을 실어 보낸 JSON 일 때만 확정된 상태다
//    (본문이 필요 없는 401 만 예외 — 로그인 벽).
test("acceptReloadedCalendar — 본문 없는 404 는 버린다(라우트가 자격을 실은 404 만 받는다)", () => {
  assert.equal(acceptReloadedCalendar(404, null), false);
  assert.equal(acceptReloadedCalendar(404, undefined), false);
  assert.equal(acceptReloadedCalendar(404, { error: "profile_not_found", entitled: false, trialUsed: true }), true);
  assert.equal(acceptReloadedCalendar(401, undefined), true); // 401 은 본문과 무관하다
});
