import { test } from "node:test";
import assert from "node:assert/strict";
import { datesInRange, kstToday, addDays, toAdSpendRows, type InsightRow } from "./meta-insights.ts";

// 이 모듈의 계약. 핵심 두 가지:
// ① 같은 (날짜·캠페인·세트·광고) 키는 한 행으로 합친다 — ad_spend UNIQUE 위반 방지.
// ② 요청 범위에서 응답이 없는 날은 0원 행을 남긴다 — admin_layer1_pnl 이 "행 0개 = 미입력"으로
//    판정하므로, 이게 없으면 광고를 쉰 날마다 대시보드에 거짓 지연 경고가 뜬다.

test("datesInRange — 양 끝 포함, 월 경계 통과", () => {
  assert.deepEqual(datesInRange("2026-09-29", "2026-10-02"), [
    "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
  ]);
  assert.deepEqual(datesInRange("2026-10-05", "2026-10-05"), ["2026-10-05"]);
});

test("datesInRange — 형식 오류·역순은 throw", () => {
  assert.throws(() => datesInRange("2026-10-5", "2026-10-06"));
  assert.throws(() => datesInRange("2026-10-07", "2026-10-06"));
});

test("kstToday — UTC 15:00 에 KST 날짜가 넘어간다", () => {
  assert.equal(kstToday(new Date("2026-10-09T14:59:59Z")), "2026-10-09");
  assert.equal(kstToday(new Date("2026-10-09T15:00:00Z")), "2026-10-10");
});

test("addDays — 음수·월 경계", () => {
  assert.equal(addDays("2026-10-03", -7), "2026-09-26");
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
});

const row = (o: Partial<InsightRow>): InsightRow => ({
  date_start: "2026-10-04",
  campaign_name: "lead_saju_bm_v1",
  adset_name: "lead_v1",
  ad_name: "saju_v1",
  spend: "100",
  impressions: "10",
  reach: "9",
  inline_link_clicks: "1",
  ...o,
});

test("toAdSpendRows — 필드 매핑: 세트는 이름, 클릭은 링크 클릭, note=api", () => {
  const out = toAdSpendRows([row({ spend: "7798.4" })], ["2026-10-04"]);
  assert.deepEqual(out, [{
    spend_date: "2026-10-04", campaign: "lead_saju_bm_v1", adset: "lead_v1", creative_key: "saju_v1",
    impressions: 10, clicks: 1, spend_won: 7798, reach: 9, note: "api",
  }]);
});

test("toAdSpendRows — 같은 광고 이름이라도 세트가 다르면 별개 행 (10-04 saju_v1 실측)", () => {
  const out = toAdSpendRows(
    [row({ adset_name: "saju_lead_v1", spend: "2172" }), row({ adset_name: "lead_v1", spend: "7798" })],
    ["2026-10-04"],
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.spend_won).sort((a, b) => a - b), [2172, 7798]);
});

test("toAdSpendRows — 완전히 같은 키는 숫자 합산, 반올림은 합산 뒤 한 번", () => {
  const out = toAdSpendRows(
    [row({ spend: "100.4", impressions: "10", reach: "9", inline_link_clicks: "1" }),
     row({ spend: "100.4", impressions: "5", reach: undefined, inline_link_clicks: "2" })],
    ["2026-10-04"],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].spend_won, 201); // 100.4+100.4=200.8 → 201 (각각 반올림하면 200)
  assert.equal(out[0].impressions, 15);
  assert.equal(out[0].reach, 9); // 한쪽 null 은 나머지 값 유지
  assert.equal(out[0].clicks, 3);
});

test("toAdSpendRows — 응답 없는 날은 0원 행(api:no_delivery), 응답 있는 날엔 안 만든다", () => {
  const out = toAdSpendRows([row({ date_start: "2026-10-04" })], ["2026-10-03", "2026-10-04"]);
  const zero = out.filter((r) => r.note === "api:no_delivery");
  assert.deepEqual(zero, [{
    spend_date: "2026-10-03", campaign: "", adset: "", creative_key: "",
    impressions: 0, clicks: 0, spend_won: 0, reach: 0, note: "api:no_delivery",
  }]);
  assert.equal(out.filter((r) => r.spend_date === "2026-10-04").length, 1);
});

test("toAdSpendRows — 범위 밖 날짜가 섞이면 throw (교체 범위 밖을 쓰지 않게)", () => {
  assert.throws(() => toAdSpendRows([row({ date_start: "2026-10-05" })], ["2026-10-04"]));
});

test("toAdSpendRows — 이름 앞뒤 공백 제거, 누락 필드는 빈 문자열/null", () => {
  const out = toAdSpendRows(
    [{ date_start: "2026-10-04", ad_name: " love ", spend: "5" }],
    ["2026-10-04"],
  );
  assert.deepEqual(out[0], {
    spend_date: "2026-10-04", campaign: "", adset: "", creative_key: "love",
    impressions: null, clicks: null, spend_won: 5, reach: null, note: "api",
  });
});
