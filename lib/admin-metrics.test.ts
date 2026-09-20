import { test } from "node:test";
import assert from "node:assert/strict";
import { METRICS, GUARDRAILS, sampleGate, isMetricKey, isAlerting, type MetricDef } from "./admin-metrics.ts";

test("모든 지표가 정본 정의와 출처를 갖는다", () => {
  for (const [key, m] of Object.entries(METRICS) as [string, MetricDef][]) {
    assert.equal(m.key, key, `${key}: key 가 맵의 키와 다르다`);
    assert.ok(m.label.length > 0, `${key}: label 이 비었다`);
    assert.ok(m.definition.length > 0, `${key}: definition 이 비었다`);
    assert.ok(m.source.length > 0, `${key}: source 가 비었다`);
    assert.ok(m.minSample >= 0, `${key}: minSample 이 음수다`);
  }
});

test("가드레일 6종이 전부 레지스트리에 있고 경보선을 갖는다", () => {
  assert.equal(GUARDRAILS.length, 6);
  for (const key of GUARDRAILS) {
    const m: MetricDef = METRICS[key];
    assert.ok(m, `가드레일 ${key} 가 METRICS 에 없다`);
    assert.ok(
      m.alertBelow !== undefined || m.alertAbove !== undefined,
      `가드레일 ${key} 에 경보선이 없다`
    );
  }
});

test("percent 지표의 경보선은 0~100 안에 있다", () => {
  for (const m of Object.values(METRICS) as MetricDef[]) {
    if (m.unit !== "percent") continue;
    if (m.alertBelow !== undefined) {
      assert.ok(m.alertBelow >= 0 && m.alertBelow <= 100, `${m.key}: alertBelow 범위 밖`);
    }
    if (m.alertAbove !== undefined) {
      assert.ok(m.alertAbove >= 0 && m.alertAbove <= 100, `${m.key}: alertAbove 범위 밖`);
    }
  }
});

test("정의가 충돌했던 지표는 drift 를 명시한다", () => {
  // 2026-09-20 실측에서 정의가 둘로 갈린 것들 — 정본을 골랐고, 현 구현이 다르면 그 사실을 적어둔다.
  for (const key of ["organic_share", "result_viewed"] as const) {
    const m = METRICS[key];
    assert.ok(m, `${key} 가 레지스트리에 없다`);
    assert.ok(m.drift && m.drift.length > 0, `${key}: 정의 충돌인데 drift 가 비었다`);
  }
});

test("sampleGate — 임계 미만이면 숫자를 안 준다", () => {
  const g = sampleGate("byeoljari_k_factor", 12);
  assert.equal(g.show, false);
  assert.equal(g.note, "n=12 · 판단 보류");
});

test("sampleGate — 임계 이상이면 보여준다", () => {
  const g = sampleGate("byeoljari_k_factor", 30);
  assert.equal(g.show, true);
  assert.equal(g.note, undefined);
});

test("sampleGate — minSample 0 이면 항상 보여준다", () => {
  assert.equal(sampleGate("revenue_won", 0).show, true);
});

test("isMetricKey — 모르는 키를 걸러낸다(런타임 문자열 방어)", () => {
  assert.equal(isMetricKey("없는지표"), false);
  assert.equal(isMetricKey("revenue_won"), true);
});

test("isMetricKey — 프로토타입 체인의 이름을 지표로 오인하지 않는다", () => {
  // `in` 연산자는 프로토타입까지 검사해 이것들을 전부 통과시킨다. 런타임 문자열을
  // 거르라고 만든 함수라 여기서 새면 플랜 B 화면에 undefined 가 뜬다.
  for (const fake of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(isMetricKey(fake), false, `${fake} 가 지표 키로 통과했다`);
  }
});

test("isAlerting — 경보선 양쪽과 경계값", () => {
  assert.equal(isAlerting("first_reading_rate", 79.9), true);   // alertBelow 80
  assert.equal(isAlerting("first_reading_rate", 80), false);    // 경계는 경보 아님
  assert.equal(isAlerting("new_error_classes", 1), true);       // alertAbove 0
  assert.equal(isAlerting("new_error_classes", 0), false);
  assert.equal(isAlerting("revenue_won", -999), false);         // 경보선 없는 지표
  assert.equal(isAlerting("first_reading_rate", null), false);  // 값 없음 ≠ 경보
});
