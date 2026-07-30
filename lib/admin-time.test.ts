import { test } from "node:test";
import assert from "node:assert/strict";
import * as adminTime from "./admin-time.ts";
import { kstDate, startOfTodayKstIso, daysAgoKstIso } from "./admin-time.ts";

// 이 모듈의 계약을 못박는 테스트. 2026-07-31 이전엔 어드민 트래픽만 오전 10시 롤오버를 써서
// 같은 "오늘"이 화면마다 다른 날을 뜻했고, 그 사실이 실측을 두 번 오독하게 만들었다
// (07-25 UV 63 vs 27, 재방문 실인원 3명 vs 1명). 기준은 이제 KST 자정 하나다.

test("kstDate — KST 자정 경계에서 정확히 날짜가 넘어간다", () => {
  // UTC 15:00 = KST 다음날 00:00. 그 1초 전까지는 전날이어야 한다.
  assert.equal(kstDate("2026-07-01T14:59:59Z"), "2026-07-01", "KST 23:59:59 는 아직 07-01");
  assert.equal(kstDate("2026-07-01T15:00:00Z"), "2026-07-02", "KST 00:00:00 부터 07-02");
});

test("kstDate — 옛 오전 10시 롤오버로는 전날이던 새벽 시각이 이제 당일이다", () => {
  // 07-02 09:30 KST = 07-02T00:30Z. 10시 롤오버 기준으론 07-01 버킷이었다(이게 왜곡의 원천).
  assert.equal(kstDate("2026-07-02T00:30:00Z"), "2026-07-02");
  // 밤 트래픽 피크(22~02시 KST)도 캘린더 날짜 그대로 귀속된다 → Meta·토스·GA 와 대조 가능.
  assert.equal(kstDate("2026-07-01T13:00:00Z"), "2026-07-01", "22:00 KST");
  assert.equal(kstDate("2026-07-01T17:00:00Z"), "2026-07-02", "02:00 KST = 다음날");
});

test("kstDate — SQL 대응식과 같은 값을 낸다 (드리프트 감지)", () => {
  // SQL: (created_at at time zone 'UTC' + interval '9 hours')::date
  // JS 는 UTC 로 +9h 한 뒤 앞 10자를 자르는 것과 동치여야 한다. 한쪽만 바뀌면 화면과 정답지가 갈린다.
  for (const iso of [
    "2026-07-01T00:00:00Z",
    "2026-07-01T14:59:59Z",
    "2026-07-01T15:00:00Z",
    "2026-12-31T15:00:00Z", // 연말 경계
  ]) {
    const expected = new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
    assert.equal(kstDate(iso), expected, iso);
  }
});

test("startOfTodayKstIso — 반환 시각이 KST 자정이고 오늘 버킷과 일치한다", () => {
  const iso = startOfTodayKstIso();
  const kst = new Date(Date.parse(iso) + 9 * 3600000);
  assert.equal(kst.getUTCHours(), 0, "KST 로 옮기면 0시");
  assert.equal(kst.getUTCMinutes(), 0);
  assert.equal(kst.getUTCSeconds(), 0);
  // 경계 자체가 오늘에 속한다 (반개구간 [오늘 0시, 내일 0시) 의 좌변)
  assert.equal(kstDate(iso), kstDate(new Date().toISOString()));
});

test("daysAgoKstIso — 0 은 오늘 자정 · n 은 정확히 n일 전 자정", () => {
  assert.equal(daysAgoKstIso(0), startOfTodayKstIso(), "0 = 오늘 시작");
  // KST 는 DST 가 없어 하루 = 정확히 86400초. 오늘 포함 30일이면 daysAgoKstIso(29).
  assert.equal(
    Date.parse(startOfTodayKstIso()) - Date.parse(daysAgoKstIso(6)),
    6 * 86400000
  );
  assert.equal(kstDate(daysAgoKstIso(29)), kstDate(new Date(Date.now() - 29 * 86400000).toISOString()));
});

test("🔴 기준은 하나다 — 두 번째 '오늘' 정의가 모듈에 다시 들어오지 않게 막는다", () => {
  // 이 테스트가 깨지면 함수를 추가한 것 자체가 문제라는 뜻이 아니라, **그 함수가 새로운 "오늘"
  // 경계를 들여오는지** 의식적으로 판단하고 이 목록을 갱신하라는 뜻이다.
  // (2026-07-29 까지 여기엔 startOfAdminTodayKstIso·adminKstDate·adminDaysAgoKstIso·
  //  ADMIN_TODAY_CUTOFF_HOUR 가 함께 있었고, 그게 화면마다 다른 "오늘"의 원인이었다.)
  assert.deepEqual(Object.keys(adminTime).sort(), [
    "daysAgoKstIso",
    "kstDate",
    "startOfTodayKstIso",
  ]);
});
