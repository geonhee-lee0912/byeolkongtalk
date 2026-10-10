import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterActiveCreatives, nonAdSignups, spendSourceLabel, summarizeSpends, payRateLines, adSyncAlert, sumSpendClicksByCreative, countPct,
  type PayRateDay,
} from "./daily.ts";

test("spendSourceLabel — 아는 소스는 한글, fortune_* 은 사주 리포트, 모르는 값은 원문(크래시 없음)", () => {
  assert.equal(spendSourceLabel("tarot_reading"), "타로");
  assert.equal(spendSourceLabel("fortune_love_year"), "사주 리포트");
  assert.equal(spendSourceLabel("brand_new_source"), "brand_new_source");
  assert.equal(spendSourceLabel(null), "(출처 없음)");
  // 프로토타입 키로 조회해도 원문이 나와야 한다 (동적 키 config 조회 크래시 클래스)
  assert.equal(spendSourceLabel("constructor"), "constructor");
});

test("summarizeSpends — 순서 유지 · 라벨+금액 · 빈 목록은 빈 문자열", () => {
  assert.equal(
    summarizeSpends([{ source: "tarot_reading", amount: 130 }, { source: "clarifier", amount: 10 }]),
    "타로 130 · 추가 질문 10",
  );
  assert.equal(summarizeSpends([]), "");
});

const day = (d: string, signups: number, payers = 0, p1 = 0, p2 = 0): PayRateDay => ({ d, signups, payers, p1, p2 });

test("payRateLines — 오늘·어제는 진행 중, 7일은 오늘-8 ~ 오늘-2 성숙일만 합산", () => {
  const rows = [
    day("2026-10-01", 100, 99, 99, 0), // 오늘-9: 창 밖
    day("2026-10-02", 10, 2, 1, 1),    // 오늘-8: 포함
    day("2026-10-08", 20, 4, 3, 1),    // 오늘-2: 포함
    day("2026-10-09", 30, 1, 1, 0),    // 어제
    day("2026-10-10", 5, 0, 0, 0),     // 오늘
  ];
  const r = payRateLines(rows, "2026-10-10");
  assert.deepEqual(r.today, { signups: 5, payers: 0, p1: 0, p2: 0, maturing: true });
  assert.deepEqual(r.yesterday, { signups: 30, payers: 1, p1: 1, p2: 0, maturing: true });
  assert.deepEqual(r.mature7, { signups: 30, payers: 6, p1: 4, p2: 2, maturing: false });
});

test("payRateLines — 행이 없는 날은 0", () => {
  const r = payRateLines([], "2026-10-10");
  assert.deepEqual(r.today, { signups: 0, payers: 0, p1: 0, p2: 0, maturing: true });
});

test("countPct — 실인원 + 율, 분모 0 은 —", () => {
  assert.equal(countPct(3, 40), "3명 (7.5%)");
  assert.equal(countPct(0, 0), "—");
});

const NOW = new Date("2026-10-10T03:00:00Z"); // 12:00 KST

test("adSyncAlert — 최신 실행 실패면 실패 신호", () => {
  assert.match(adSyncAlert({ ok: false, error: "Meta insights 실패" }, "2026-10-10T02:30:00Z", NOW) ?? "", /실패/);
});

test("adSyncAlert — 마지막 성공이 2시간 이상 전이면 멈춤 신호, 미만이면 null", () => {
  assert.match(adSyncAlert({ ok: true, error: null }, "2026-10-10T01:00:00Z", NOW) ?? "", /2시간/);
  assert.equal(adSyncAlert({ ok: true, error: null }, "2026-10-10T01:00:01Z", NOW), null);
});

test("adSyncAlert — 진행 중(ok=null)은 마지막 성공 기준으로만 판정, 성공 기록이 없으면 신호", () => {
  assert.equal(adSyncAlert({ ok: null, error: null }, "2026-10-10T02:00:00Z", NOW), null);
  assert.match(adSyncAlert(null, null, NOW) ?? "", /기록 없음/);
});

test("sumSpendClicksByCreative — 별칭 병합 후 지출·클릭 합산, null 은 0, 빈 키 제외", () => {
  const canon = (k: string) => (k === "love_old" ? "love" : k);
  const m = sumSpendClicksByCreative(
    [
      { creative_key: "love", clicks: 3, spend_won: 1000 },
      { creative_key: "love_old", clicks: 2, spend_won: 500 },
      { creative_key: "bm_v1", clicks: null, spend_won: null },
      { creative_key: "", clicks: 9, spend_won: 9 },
    ],
    canon,
  );
  assert.deepEqual(m.get("love"), { spend: 1500, clicks: 5 });
  assert.deepEqual(m.get("bm_v1"), { spend: 0, clicks: 0 });
  assert.equal(m.has(""), false);
});

test("kstTimeLabel — KST 기준 오전/오후 · 자정·정오는 12", async () => {
  const { kstTimeLabel } = await import("./daily.ts");
  assert.equal(kstTimeLabel("2026-10-10T02:05:00Z"), "오전 11:05");
  assert.equal(kstTimeLabel("2026-10-10T10:05:00Z", true), "10/10 오후 7:05");
  assert.equal(kstTimeLabel("2026-10-09T15:00:00Z", true), "10/10 오전 12:00"); // KST 자정
  assert.equal(kstTimeLabel("2026-10-10T03:30:00Z"), "오후 12:30");              // KST 정오
});

test("parseSeenUntil — 마이크로초를 자르지 않고 그대로 · 형식/미래 시각 거부", async () => {
  const { parseSeenUntil } = await import("./daily.ts");
  const now = new Date("2026-10-10T03:00:00Z");
  assert.equal(parseSeenUntil("2026-10-09T15:00:20.623963+00:00", now), "2026-10-09T15:00:20.623963+00:00");
  assert.equal(parseSeenUntil("2026-10-09T15:00:20Z", now), "2026-10-09T15:00:20Z");
  assert.equal(parseSeenUntil("2026-10-09", now), null);             // 오프셋 없는 날짜만
  assert.equal(parseSeenUntil("2026-10-09T15:00:20", now), null);    // 시간대 없음 = 해석이 모호
  assert.equal(parseSeenUntil("2026-10-10T04:00:00Z", now), null);   // 미래
  assert.equal(parseSeenUntil(123, now), null);
});

test("filterActiveCreatives — 게재 목록이 있으면 그 소재만(별칭 병합 비교), 비광고 행은 빠진다", () => {
  const rows = [
    { creative: "tarot" }, { creative: "love" }, { creative: "(organic)" }, { creative: "(추적 안 됨)" },
  ];
  const canon = (k: string) => (k === "새 판매 광고 - 사본" ? "tarot" : k);
  const r = filterActiveCreatives(rows, ["새 판매 광고 - 사본"], canon);
  assert.equal(r.filtered, true);
  assert.deepEqual(r.rows.map((x) => x.creative), ["tarot"]);
  assert.deepEqual(filterActiveCreatives(rows, [], canon), { rows: [], filtered: true });
});

test("filterActiveCreatives — 목록 null 이면 필터 없이 비광고 행만 뺀다", () => {
  const rows = [{ creative: "tarot" }, { creative: "love" }, { creative: "(organic)" }, { creative: "(추적 안 됨)" }];
  const r = filterActiveCreatives(rows, null, (k) => k);
  assert.equal(r.filtered, false);
  assert.deepEqual(r.rows.map((x) => x.creative), ["tarot", "love"]);
});

test("nonAdSignups — 두 특수 행의 가입 수, 없으면 0", () => {
  assert.deepEqual(
    nonAdSignups([{ creative: "tarot", signups: 9 }, { creative: "(추적 안 됨)", signups: 4 }, { creative: "(organic)", signups: 2 }]),
    { untracked: 4, organic: 2 },
  );
  assert.deepEqual(nonAdSignups([{ creative: "tarot", signups: 9 }]), { untracked: 0, organic: 0 });
});
