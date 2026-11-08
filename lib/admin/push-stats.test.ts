import { test } from "node:test";
import assert from "node:assert/strict";
import { askTable, consentTable, label, MOMENT_LABEL, revisitSummary, sendsByDay, sendTotals } from "./push-stats.ts";

test("묻는 순간별 허용률 — 문자열 숫자도 읽고, 순간 순서대로", () => {
  const t = askTable([
    { moment: "byeolmaru_first", kind: "ad", answer: "later", cnt: "1", users: "1" },
    { moment: "first_reading_end", kind: "push", answer: "accepted", cnt: "3", users: "3" },
    { moment: "first_reading_end", kind: "push", answer: "later", cnt: 1, users: 1 },
  ]);
  assert.deepEqual(t.map((r) => [r.moment, r.accepted, r.total, r.acceptRate]), [
    ["first_reading_end", 3, 4, 75],
    ["byeolmaru_first", 0, 1, 0],
  ]);
});

test("광고 동의율 — 물은 순간이 있을 때만, 설정·수신거부는 비율 없음", () => {
  const t = consentTable(
    [
      { event: "grant", source: "first_reading_end", cnt: 2, users: 2 },
      { event: "result_notice", source: "first_reading_end", cnt: 2, users: 2 },
      { event: "withdraw", source: "unsubscribe_button", cnt: 1, users: 1 },
    ],
    [{ moment: "first_reading_end", kind: "push", answer: "accepted", cnt: 8, users: 8 }],
  );
  assert.deepEqual(t[0], { source: "first_reading_end", grant: 2, withdraw: 0, asked: 8, grantRate: 25 });
  assert.deepEqual(t[1], { source: "unsubscribe_button", grant: 0, withdraw: 1, asked: null, grantRate: null });
});

test("종류별 열람률·수신거부율 — 정보성은 수신거부율 없음, 보낸 0 이면 잴 수 없음", () => {
  const rows = [
    { day: "2026-11-09", kind: "morning", klass: "ad", sent: 10, claimed: 10, opened: 3, unsubscribed: 1 },
    { day: "2026-11-10", kind: "morning", klass: "ad", sent: "10", claimed: "10", opened: "1", unsubscribed: "0" },
    { day: "2026-11-10", kind: "revisit", klass: "info", sent: 4, claimed: 4, opened: 2, unsubscribed: 0 },
  ];
  const t = sendTotals(rows);
  assert.deepEqual(t.map((r) => [r.kind, r.klass, r.sent, r.openRate, r.unsubRate]), [
    ["revisit", "info", 4, 50, null],
    ["morning", "ad", 20, 20, 5],
  ]);
  assert.deepEqual(sendsByDay(rows).map((d) => [d.day, d.info, d.ad, d.opened]), [["2026-11-10", 4, 10, 3], ["2026-11-09", 0, 10, 3]]);
});

test("다시 볼 날 — 상태·보낸 비율·간격", () => {
  const s = revisitSummary([
    { status: "sent", gap_days: 3, cnt: 3, users: 3 },
    { status: "skipped", gap_days: 7, cnt: 1, users: 1 },
    { status: "pending", gap_days: 14, cnt: "2", users: "2" },
  ]);
  assert.equal(s.total, 6);
  assert.equal(s.deliveredRate, 75);
  assert.deepEqual(s.gaps, [{ days: 3, cnt: 3 }, { days: 7, cnt: 1 }, { days: 14, cnt: 2 }]);
  assert.equal(revisitSummary([]).deliveredRate, null);
});

test("라벨에 없는 키는 그대로", () => {
  assert.equal(label(MOMENT_LABEL, "first_reading_end"), "첫 상담 끝");
  assert.equal(label(MOMENT_LABEL, "new_moment"), "new_moment");
});
