import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { monthCells, revisitDateRange, revisitPrefill, revisitSendOn, revisitSendOnFromDate, revisitWindow, shiftMonth } from "./schedule.ts";

test("23:50 KST 에 고르면 KST 날짜로 센다", () => {
  assert.equal(revisitSendOn("3d", new Date("2026-11-06T14:50:00Z")), "2026-11-09"); // KST 11-06 23:50
  assert.equal(revisitSendOn("1w", new Date("2026-11-06T15:10:00Z")), "2026-11-14"); // KST 11-07 00:10
  assert.equal(revisitSendOn("2w", new Date("2026-11-06T03:00:00Z")), "2026-11-20");
});

test("보낼 창 경계", () => {
  const on = "2026-11-09";
  assert.equal(revisitWindow(on, new Date("2026-11-08T23:29:00Z")), "early"); // 08:29
  assert.equal(revisitWindow(on, new Date("2026-11-08T23:30:00Z")), "open"); // 08:30
  assert.equal(revisitWindow(on, new Date("2026-11-09T11:59:00Z")), "open"); // 20:59
  assert.equal(revisitWindow(on, new Date("2026-11-09T12:00:00Z")), "missed"); // 21:00
  assert.equal(revisitWindow(on, new Date("2026-11-10T00:00:00Z")), "missed"); // 다음 날
  assert.equal(revisitWindow(on, new Date("2026-11-07T03:00:00Z")), "early"); // 이틀 전
});

test("달력으로 고를 수 있는 날 — 내일부터 30일 뒤까지(KST)", () => {
  assert.deepEqual(revisitDateRange(new Date("2026-11-06T14:50:00Z")), { min: "2026-11-07", max: "2026-12-06" }); // KST 11-06 23:50
  assert.deepEqual(revisitDateRange(new Date("2026-11-06T15:10:00Z")), { min: "2026-11-08", max: "2026-12-07" }); // KST 11-07 00:10
});

test("달력에서 고른 날 — 범위 안의 진짜 날짜만 받는다", () => {
  const now = new Date("2026-11-06T03:00:00Z"); // KST 11-06 12:00
  assert.equal(revisitSendOnFromDate("2026-11-07", now), "2026-11-07");
  assert.equal(revisitSendOnFromDate("2026-12-06", now), "2026-12-06");
  assert.equal(revisitSendOnFromDate("2026-11-06", now), null); // 오늘은 안 됨(이미 아침 발송이 지났을 수 있다)
  assert.equal(revisitSendOnFromDate("2026-12-07", now), null); // 30일 넘음
  assert.equal(revisitSendOnFromDate("2026-11-31", now), null); // 없는 날
  assert.equal(revisitSendOnFromDate("2026-11-7", now), null);
  assert.equal(revisitSendOnFromDate("내일", now), null);
});

test("달력 한 달 칸 — 1일 앞은 빈칸(null), 그다음 날짜들", () => {
  const g = monthCells("2026-11"); // 2026-11-01 은 일요일
  assert.equal(g[0], "2026-11-01");
  assert.equal(g.length, 30);
  const dec = monthCells("2026-12"); // 2026-12-01 은 화요일 → 앞에 빈칸 둘
  assert.deepEqual(dec.slice(0, 3), [null, null, "2026-12-01"]);
  assert.equal(dec[dec.length - 1], "2026-12-31");
});

test("달 옮기기 — 해를 넘긴다", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
});

test("달·날이 말이 안 되면 터지지 않고 null", () => {
  const now = new Date("2026-11-06T03:00:00Z");
  for (const d of ["2026-13-45", "2026-11-00", "2026-00-10", "2026-12-32"]) assert.equal(revisitSendOnFromDate(d, now), null, d);
});

test("'바꾸기'는 고를 수 있는 날일 때만 미리 골라 둔다 — 당일 예약은 비워 둔다", () => {
  const now = new Date("2026-11-06T03:00:00Z");
  assert.equal(revisitPrefill("2026-11-07", now), "2026-11-07");
  assert.equal(revisitPrefill("2026-11-06", now), null);
  assert.equal(revisitPrefill("2026-11-01", now), null);
  assert.equal(revisitPrefill(null, now), null);
});

test("다시 볼 날 시트의 '바꾸기'가 revisitPrefill 을 쓴다", () => {
  assert.match(readFileSync("components/push/RevisitSheet.tsx", "utf8"), /setPicked\(revisitPrefill\(sendOn, /);
});
