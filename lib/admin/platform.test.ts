import { test } from "node:test";
import assert from "node:assert/strict";
import { platformCounts, platformDailyRows, periodPayerLines, PAYER_SEGMENTS } from "./platform.ts";

test("platformCounts 문자열 숫자 변환·빈 행 0", () => {
  const c = platformCounts({ uv_app: "3", won_toss: "4900" });
  assert.equal(c.uvApp, 3);
  assert.equal(c.wonToss, 4900);
  assert.equal(c.uvWeb, 0);
  assert.equal(platformCounts(undefined).payApple, 0);
});

test("platformDailyRows 빈 날 채움 — dates 순서대로, 없는 날은 0", () => {
  const rows = platformDailyRows(
    [{ d: "2026-11-02", uv_app: 2, signups_web: "5" }],
    ["2026-11-01", "2026-11-02"],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2026-11-01");
  assert.equal(rows[0].uvApp, 0);
  assert.equal(rows[0].signupsWeb, 0);
  assert.equal(rows[1].uvApp, 2);
  assert.equal(rows[1].signupsWeb, 5);
});

test("periodPayerLines 순서 고정·누락 분류 0", () => {
  const { rows } = periodPayerLines([{ segment: "repeat", people: "2", payments: "3", won: "9800" }]);
  assert.deepEqual(rows.map((r) => r.segment), PAYER_SEGMENTS.map(([s]) => s));
  const first = rows.find((r) => r.segment === "new_48h")!;
  assert.equal(first.people, 0);
  assert.equal(first.payments, 0);
  const repeat = rows.find((r) => r.segment === "repeat")!;
  assert.deepEqual([repeat.people, repeat.payments, repeat.won], [2, 3, 9800]);
});

test("periodPayerLines 탈퇴는 사람 합계 제외 — 건·금액은 포함", () => {
  const { rows, total } = periodPayerLines([
    { segment: "new_48h", people: 4, payments: 5, won: 10000 },
    { segment: "withdrawn", people: null, payments: 2, won: 8700 },
  ]);
  assert.equal(rows.find((r) => r.segment === "withdrawn")!.people, null);
  assert.deepEqual(total, { people: 4, payments: 7, won: 18700 });
});

test("periodPayerLines 모르는 분류 무시 — 프로토타입 키 포함", () => {
  const { rows, total } = periodPayerLines([
    { segment: "weird", people: 9, payments: 9, won: 9 },
    { segment: "constructor", people: 9, payments: 9, won: 9 },
  ]);
  assert.equal(rows.length, PAYER_SEGMENTS.length);
  assert.deepEqual(total, { people: 0, payments: 0, won: 0 });
});
