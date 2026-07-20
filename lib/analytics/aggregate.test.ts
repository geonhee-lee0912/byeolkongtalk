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

import { buildFunnel } from "./aggregate.ts";

test("buildFunnel — 소재별 퍼널 + ad_spend 조인 CAC/ROAS", () => {
  const rows = buildFunnel({
    acquisitions: [
      { user_id: "u1", utm_content: "vid_a" },
      { user_id: "u2", utm_content: "vid_a" },
      { user_id: "u3", utm_content: null }, // organic
    ],
    readings: [
      { user_id: "u1" }, { user_id: "u3" },
    ],
    payments: [
      { user_id: "u1", status: "completed", amount_won: 2800 },
      { user_id: "u1", status: "completed", amount_won: 1000 }, // 재결제
    ],
    spend: [{ creative_key: "vid_a", spend_won: 10000 }],
  });
  const a = rows.find((r) => r.creative === "vid_a")!;
  assert.equal(a.signups, 2);
  assert.equal(a.tried, 1);       // u1 만 리딩
  assert.equal(a.firstPaid, 1);   // u1
  assert.equal(a.repaid, 1);      // u1 2건
  assert.equal(a.revenueWon, 3800);
  assert.equal(a.spendWon, 10000);
  assert.equal(a.cac, 5000);      // 10000 / 2
  assert.equal(a.roas, 0.38);     // 3800 / 10000
  const org = rows.find((r) => r.creative === "(organic)")!;
  assert.equal(org.signups, 1);
  assert.equal(org.spendWon, null);
  assert.equal(org.cac, null);
  assert.equal(org.roas, null);
});

test("buildFunnel — allUserIds 로 '(추적 안 됨)' 행 (acquisition 없는 유입)", () => {
  const rows = buildFunnel({
    acquisitions: [{ user_id: "u1", utm_content: "vid_a" }],
    readings: [{ user_id: "u2" }], // 추적 안 된 u2 가 리딩
    payments: [{ user_id: "u2", status: "completed", amount_won: 5900 }], // 추적 안 된 u2 가 결제
    spend: [],
    allUserIds: ["u1", "u2"], // u2 는 acquisitions 에 없음 → 추적 안 됨
  });
  const un = rows.find((r) => r.creative === "(추적 안 됨)")!;
  assert.equal(un.signups, 1);
  assert.equal(un.tried, 1);
  assert.equal(un.firstPaid, 1);
  assert.equal(un.revenueWon, 5900);
  assert.equal(un.spendWon, null);
  assert.equal(un.cac, null);
  assert.equal(rows[rows.length - 1].creative, "(추적 안 됨)"); // 맨 아래 정렬
});

import { buildCohorts } from "./aggregate.ts";

test("buildCohorts — 가입 주차별 누적 LTV(유저 평균) + 리텐션", () => {
  const c = buildCohorts({
    users: [
      { id: "u1", created_at: "2026-06-01T00:00:00Z" }, // 월요일 주차
      { id: "u2", created_at: "2026-06-02T00:00:00Z" },
    ],
    payments: [
      { user_id: "u1", amount_won: 3000, status: "completed", created_at: "2026-06-03T00:00:00Z" }, // week 0
      { user_id: "u1", amount_won: 2000, status: "completed", created_at: "2026-06-10T00:00:00Z" }, // week 1
    ],
    activity: [
      { user_id: "u1", created_at: "2026-06-10T00:00:00Z" }, // D7 재활동
    ],
    weeks: 3,
  });
  assert.equal(c.length, 1); // 같은 주차 코호트 1개
  const wk = c[0];
  assert.equal(wk.cohortSize, 2);
  // week0 누적 3000, week1 누적 5000 → 유저 평균 (2명 기준)
  assert.equal(wk.cumRevenuePerUser[0], 1500); // 3000/2
  assert.equal(wk.cumRevenuePerUser[1], 2500); // 5000/2
});

import { buildStarSpendBreakdown, type StarTxRow, type ReadingInfo } from "./aggregate.ts";

test("buildStarSpendBreakdown: 분류 규칙 (조인 + source 폴백 + 비상품 제외)", () => {
  const reads = new Map<string, ReadingInfo>([
    ["r1", { consultation_type: "saju", emotion_tag: "재회할 수 있을까", relationship_id: null, skill_key: null }],
    ["r2", { consultation_type: "tarot", emotion_tag: null, relationship_id: "rel1", skill_key: "checkin" }], // 연애상담 타로 스킬
    ["r3", { consultation_type: "saju", emotion_tag: "fortune:compat", relationship_id: null, skill_key: null }], // 운세 리포트
  ]);
  const tx: StarTxRow[] = [
    { user_id: "u1", type: "spend", amount: 22, source: "saju_reading", reading_id: "r1", created_at: "" },
    { user_id: "u1", type: "spend", amount: 45, source: "tarot_reading", reading_id: "r2", created_at: "" }, // → relationship
    { user_id: "u2", type: "spend", amount: 40, source: "fortune_compat", reading_id: "r3", created_at: "" }, // → fortune
    { user_id: "u2", type: "spend", amount: 40, source: "fortune_good_days", reading_id: null, created_at: "" }, // reading 없음 → source
    { user_id: "u3", type: "spend", amount: 20, source: "relationship_pass", reading_id: null, created_at: "" }, // → relationship
    { user_id: "u3", type: "spend", amount: 30, source: "rel_skill_verdict", reading_id: null, created_at: "" }, // → relationship
    { user_id: "u1", type: "spend", amount: 5, source: "clarifier", reading_id: "r1", created_at: "" }, // → upsell
    { user_id: "u9", type: "charge", amount: 100, source: "pg", reading_id: null, created_at: "" }, // 제외(charge)
    { user_id: "u9", type: "spend", amount: 999, source: "admin_adjust", reading_id: null, created_at: "" }, // 제외(비상품)
  ];
  const out = buildStarSpendBreakdown(tx, reads);
  const byDomain = (d: string) => out.filter((g) => g.domain === d);
  assert.equal(byDomain("saju").length, 1); // r1 사주 대화
  assert.equal(byDomain("relationship").reduce((s, g) => s + g.count, 0), 3); // checkin 스킬 + 패스 + verdict
  assert.equal(byDomain("fortune").reduce((s, g) => s + g.count, 0), 2); // compat(조인) + good_days(source)
  assert.equal(byDomain("upsell").length, 1); // clarifier
  assert.ok(!out.some((g) => g.product === "pg" || g.product === "admin_adjust")); // 비상품 제외
});

import { buildRelationshipFlow, type RelMsgRow } from "./aggregate.ts";

test("buildRelationshipFlow: 6h 갭 세션 분리 + 방문당 턴", () => {
  const msgs: RelMsgRow[] = [
    { reading_id: "t1", role: "user", created_at: "2026-07-01T01:00:00Z" },
    { reading_id: "t1", role: "user", created_at: "2026-07-01T01:05:00Z" },
    { reading_id: "t1", role: "user", created_at: "2026-07-01T01:10:00Z" },
    { reading_id: "t1", role: "user", created_at: "2026-07-01T08:30:00Z" }, // 7h+ 후 → 새 방문
    { reading_id: "t1", role: "assistant", created_at: "2026-07-01T01:01:00Z" }, // 무시
  ];
  const f = buildRelationshipFlow(msgs);
  assert.equal(f.visits, 2); // 6h 갭으로 2방문
  assert.equal(f.avgTurnsPerVisit, 2); // user 4턴 / 2방문
  assert.equal(f.softCapDays, 0);
});

test("buildRelationshipFlow: 소프트캡(하루 20턴) 도달", () => {
  const msgs: RelMsgRow[] = [];
  for (let i = 0; i < 20; i++) {
    const min = i * 5; // 5분 간격 → 6h 미만, 1방문 20턴
    const hh = String(Math.floor(min / 60)).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    msgs.push({ reading_id: "t1", role: "user", created_at: `2026-07-01T${hh}:${mm}:00Z` });
  }
  const f = buildRelationshipFlow(msgs);
  assert.equal(f.visits, 1);
  assert.equal(f.softCapDays, 1);
});
