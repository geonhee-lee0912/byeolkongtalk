import { test } from "node:test";
import assert from "node:assert/strict";
import { RECHARGE_SOURCE } from "./recharge-source.ts";

/**
 * 🔴 로드맵 KPI(scripts/roadmap-kpi-snapshot.sql · admin_roadmap_kpi RPC)가
 * meta->>'source' = 'inchat' 으로 명시 필터한다. 새 지면이 inchat 을 재사용하면
 * "인챗 충전" 지표에 구매 지점 충전이 섞여 조용히 오염된다.
 */
test("inchat 은 인챗 전용 — 다른 지면이 재사용하면 안 된다", () => {
  const others = Object.entries(RECHARGE_SOURCE).filter(([k]) => k !== "inchat");
  assert.ok(others.length > 0, "새 지면 source 가 하나도 없다");
  for (const [key, value] of others) {
    assert.notEqual(value, "inchat", `${key} 가 inchat 을 침범한다`);
  }
});

test("source 값은 서로 겹치지 않는다 — 겹치면 지면별로 갈라 볼 수 없다", () => {
  const values = Object.values(RECHARGE_SOURCE);
  assert.equal(new Set(values).size, values.length);
});

test("inchat 의 값은 'inchat' 그대로 — 바꾸면 기존 KPI 가 0 이 된다", () => {
  assert.equal(RECHARGE_SOURCE.inchat, "inchat");
});

// ── Meta CAPI AddToCart (타로 광고 최적화 이벤트) ──
// 잔액 부족으로 "그 자리" 충전 시트가 열린 순간만 — /shop 진입(source "shop")은 신호가 흐려 제외.
import { rechargeCapiEventId } from "./recharge-source.ts";

const U = "11111111-1111-4111-8111-111111111111";
const NOON_KST = new Date("2026-10-03T03:00:00Z");

test("그 자리 충전 시트(전 source) + 로그인 → 유저·KST 날짜 단위 eventId", () => {
  for (const source of Object.values(RECHARGE_SOURCE)) {
    assert.equal(
      rechargeCapiEventId("recharge_sheet_opened", { source }, U, NOON_KST),
      `atc:${U}:2026-10-03`,
      source
    );
  }
});

test("같은 날 여러 번 열어도 eventId 동일(Meta 중복제거) · KST 자정에 바뀐다", () => {
  const lateUtc = new Date("2026-10-03T14:59:00Z"); // KST 23:59
  const nextKst = new Date("2026-10-03T15:00:00Z"); // KST 다음날 00:00
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", { source: "inchat" }, U, lateUtc), `atc:${U}:2026-10-03`);
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", { source: "inchat" }, U, nextKst), `atc:${U}:2026-10-04`);
});

test("보내지 않는 경우 — shop·미지 source·비로그인·다른 이벤트·meta 불량", () => {
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", { source: "shop" }, U, NOON_KST), null);
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", { source: "evil" }, U, NOON_KST), null);
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", { source: "inchat" }, null, NOON_KST), null);
  assert.equal(rechargeCapiEventId("recharge_package_selected", { source: "inchat" }, U, NOON_KST), null);
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", null, U, NOON_KST), null);
  assert.equal(rechargeCapiEventId("recharge_sheet_opened", { source: ["inchat"] }, U, NOON_KST), null);
});

// ── 2026-10-04 AddToCart 정의 변경: 잔액 부족 모달 노출(paywall_shown)도 같은 id ──
// 시트 열림(하루 1~2건)만으로는 Meta 학습(주 50건) 불가 → 그 앞 단계인 "잔액 부족 확인 모달 노출"로 당긴다.
// 같은 유저·같은 날 paywall → 시트 열림이 이어져도 Meta 에는 1건이어야 한다(id 동일).
test("paywall_shown + 로그인 → 유저·KST 날짜 단위 eventId (surface 무관)", () => {
  assert.equal(
    rechargeCapiEventId("paywall_shown", { cost: 20, balance: 5, surface: "tarot_draw" }, U, NOON_KST),
    `atc:${U}:2026-10-03`
  );
  assert.equal(rechargeCapiEventId("paywall_shown", { surface: "relationship_skill" }, U, NOON_KST), `atc:${U}:2026-10-03`);
  assert.equal(rechargeCapiEventId("paywall_shown", null, U, NOON_KST), `atc:${U}:2026-10-03`);
});

test("paywall_shown 비로그인 → null", () => {
  assert.equal(rechargeCapiEventId("paywall_shown", { cost: 20, balance: 5, surface: "tarot_draw" }, null, NOON_KST), null);
});

test("같은 유저·같은 날 paywall_shown 과 recharge_sheet_opened 는 같은 id (Meta 1건으로 중복 제거)", () => {
  const a = rechargeCapiEventId("paywall_shown", { cost: 20, balance: 5, surface: "tarot_draw" }, U, NOON_KST);
  const b = rechargeCapiEventId("recharge_sheet_opened", { source: "tarot_draw" }, U, NOON_KST);
  assert.ok(a);
  assert.equal(a, b);
});
