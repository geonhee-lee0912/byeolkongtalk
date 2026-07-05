import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProductBreakdown,
  type ReadingRow,
  type PaymentRow,
} from "./aggregate.ts";

const readings: ReadingRow[] = [
  // 고민톡 (fortune: 아님)
  { user_id: "u1", consultation_type: "saju", emotion_tag: "내 앞날의 방향이 궁금해", saju_product: "today_letters", stars_spent: 22, created_at: "2026-07-01T00:00:00Z" },
  { user_id: "u2", consultation_type: "tarot", emotion_tag: "그 사람 마음이 궁금해", saju_product: "today_letters", stars_spent: 0, created_at: "2026-07-01T00:00:00Z" },
  // 운세 리포트 (fortune:)
  { user_id: "u1", consultation_type: "saju", emotion_tag: "fortune:daily", saju_product: "today_letters", stars_spent: 0, created_at: "2026-07-02T00:00:00Z" },
  { user_id: "u3", consultation_type: "tarot", emotion_tag: "fortune:tarot_love", saju_product: "today_letters", stars_spent: 5, created_at: "2026-07-02T00:00:00Z" },
];

const payments: PaymentRow[] = [
  { user_id: "u1", amount_won: 2800, package_type: "star_30", status: "completed", created_at: "2026-07-01T00:00:00Z" },
  { user_id: "u2", amount_won: 1000, package_type: "star_10", status: "completed", created_at: "2026-07-01T00:00:00Z" },
  { user_id: "u3", amount_won: 5900, package_type: "star_30", status: "refunded", created_at: "2026-07-01T00:00:00Z" },
];

test("고민톡 — fortune: 제외, emotion_tag×type 그룹", () => {
  const r = buildProductBreakdown(readings, payments);
  // 고민톡 2건 (u1 saju, u2 tarot)
  assert.equal(r.counsel.reduce((a, b) => a + b.count, 0), 2);
  const sajuCounsel = r.counsel.find((c) => c.consultationType === "saju");
  assert.equal(sajuCounsel?.paidCount, 1);
  assert.equal(sajuCounsel?.starsSpent, 22);
});

test("운세 — fortune: 만, kind 별 집계", () => {
  const r = buildProductBreakdown(readings, payments);
  assert.equal(r.fortune.reduce((a, b) => a + b.count, 0), 2);
  const daily = r.fortune.find((f) => f.kind === "daily");
  assert.equal(daily?.count, 1);
  assert.equal(daily?.paidCount, 0);
});

test("별 구매 — completed 만, package_type 그룹 + 매출", () => {
  const r = buildProductBreakdown(readings, payments);
  const total = r.packages.reduce((a, b) => a + b.revenueWon, 0);
  assert.equal(total, 3800); // refunded 제외
  const p30 = r.packages.find((p) => p.packageType === "star_30");
  assert.equal(p30?.count, 1);
  assert.equal(p30?.revenueWon, 2800);
});

import { buildTrends } from "./aggregate.ts";

test("buildTrends — 일자별 가입/리딩/매출 (KST 일자 버킷)", () => {
  const t = buildTrends({
    users: [{ created_at: "2026-07-01T02:00:00Z" }, { created_at: "2026-07-01T14:00:00Z" }],
    readings: [{ created_at: "2026-07-01T05:00:00Z" }],
    payments: [{ created_at: "2026-07-01T05:00:00Z", amount_won: 2800, status: "completed" }],
    days: 2,
    todayKst: "2026-07-02",
  });
  const d1 = t.find((x) => x.date === "2026-07-01");
  assert.equal(d1?.newUsers, 2);
  assert.equal(d1?.readings, 1);
  assert.equal(d1?.revenueWon, 2800);
  // 빈 날짜도 0으로 채워짐
  const d2 = t.find((x) => x.date === "2026-07-02");
  assert.equal(d2?.newUsers, 0);
});
