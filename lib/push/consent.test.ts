import { test } from "node:test";
import assert from "node:assert/strict";
import { koreanDate, reconfirmState } from "./consent.ts";

test("통지 날짜 — KST, '2026년 11월 6일' 형식", () => {
  assert.equal(koreanDate("2026-11-06T03:00:00Z"), "2026년 11월 6일");
  assert.equal(koreanDate("2026-11-06T15:30:00Z"), "2026년 11월 7일"); // KST 00:30
  assert.equal(koreanDate("2026-12-31T14:59:59Z"), "2026년 12월 31일");
});

test("2년 재확인 — 기한 30일 전부터 팝업, 7일 전부터 푸시", () => {
  const first = "2026-11-08T03:00:00Z";
  const s = (now: string, last: string | null = null) => reconfirmState(first, last, new Date(now));
  assert.equal(s("2028-10-01T00:00:00Z").deadline, "2028-11-08T03:00:00.000Z");
  assert.deepEqual([s("2028-10-09T02:59:00Z").popup, s("2028-10-09T03:00:00Z").popup], [false, true]);
  assert.deepEqual([s("2028-11-01T02:59:00Z").push, s("2028-11-01T03:00:00Z").push], [false, true]);
  // 기한이 지나도(앱도 안 열고 푸시도 못 보냄) 알릴 때까지 남는다
  assert.equal(s("2029-01-01T00:00:00Z").push, true);
});

test("2년 재확인 — 알리고 나면 다음 기한은 최초 동의일 + 4년(알린 날로 다시 세지 않는다)", () => {
  const first = "2026-11-08T03:00:00Z";
  const r = reconfirmState(first, "2028-10-20T00:00:00Z", new Date("2028-11-01T00:00:00Z"));
  assert.equal(r.deadline, "2030-11-08T03:00:00.000Z");
  assert.equal(r.popup, false);
  // 기한 지난 뒤 알렸어도 같은 기한으로 친다
  assert.equal(reconfirmState(first, "2029-01-05T00:00:00Z", new Date("2029-02-01T00:00:00Z")).deadline, "2030-11-08T03:00:00.000Z");
  // 오래전 통지(이전 주기)는 이번 기한을 덮지 않는다
  assert.equal(reconfirmState(first, "2028-10-20T00:00:00Z", new Date("2030-10-15T00:00:00Z")).popup, true);
});
