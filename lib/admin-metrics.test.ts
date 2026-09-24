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
  // result_viewed 는 플랜 B(admin_layer1_guard)에서 코호트 기준으로 교체돼 drift 가 해소됐다 — 아래 별도 테스트.
  for (const key of ["organic_share"] as const) {
    const m = METRICS[key];
    assert.ok(m, `${key} 가 레지스트리에 없다`);
    assert.ok(m.drift && m.drift.length > 0, `${key}: 정의 충돌인데 drift 가 비었다`);
  }
});

test("plan B 에서 해소된 drift 는 남아 있지 않다", () => {
  // result_viewed 리터럴엔 drift 키 자체가 없다(비드리프트 지표의 기존 관행과 동일) — MetricDef 로
  // 승격해야 `.drift` 접근이 타입체크를 통과한다("모든 지표가..." 테스트와 같은 패턴).
  const m: MetricDef = METRICS.result_viewed;
  assert.equal(m.drift, undefined);
  assert.equal(m.source, "admin_layer1_guard / result_viewed");
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

// 🔴 computeGuardrails 는 percent 만 나누고 나머지는 분자를 그대로 값으로 쓴다.
//    GUARDRAILS 에 won·ratio 지표가 들어오면 그 가정이 깨지므로 여기서 먼저 시끄럽게 죽인다.
test("가드레일 6종은 percent 또는 count 단위여야 한다", () => {
  for (const key of GUARDRAILS) {
    const m: MetricDef = METRICS[key];
    assert.ok(
      m.unit === "percent" || m.unit === "count",
      `가드레일 ${key} 의 unit 이 ${m.unit} 이다 — lib/admin/layer1.ts 의 값 선택을 같이 고칠 것`
    );
  }
});
