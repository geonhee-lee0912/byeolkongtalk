import { test } from "node:test";
import assert from "node:assert/strict";
import { fortuneOutline, LANDING_KEYS, type LandingKey } from "./outline.ts";
import { GENERIC_GUIDE_SPEC, SECTION_GUIDE } from "./prompt.ts";
import { DAILY_SECTIONS } from "./daily-report.ts";

test("20개 상품 전부 목차가 있고 비어있지 않다", () => {
  assert.equal(LANDING_KEYS.length, 20);
  for (const k of LANDING_KEYS) {
    const o = fortuneOutline(k);
    assert.ok(o.length > 0, `${k}: 목차가 비었다`);
    for (const h of o) assert.ok(h.trim().length > 0, `${k}: 빈 제목`);
    assert.ok(!o.some((h) => /^\p{Extended_Pictographic}/u.test(h)), `${k}: 이모지가 남았다`);
  }
});

test("공용 12종은 GENERIC_GUIDE_SPEC 에서 그대로 파생된다", () => {
  for (const [type, spec] of Object.entries(GENERIC_GUIDE_SPEC)) {
    assert.deepEqual(
      fortuneOutline(type as LandingKey),
      spec.sections.map((s) => s.heading),
      `${type}: 목차가 프롬프트 원안과 다르다`
    );
  }
});

test("saju_full·life_full 의 손으로 적은 제목은 프롬프트 안에 실재한다", () => {
  for (const t of ["saju_full", "life_full"] as const) {
    for (const h of fortuneOutline(t)) {
      assert.ok(SECTION_GUIDE[t].includes(h), `${t}: "${h}" 가 프롬프트에 없다`);
    }
  }
});

test("monthly 목차는 DAILY_SECTIONS 5개 도메인을 포함한다", () => {
  const o = fortuneOutline("monthly");
  for (const s of DAILY_SECTIONS) {
    assert.ok(o.includes(s.title), `monthly: "${s.title}" 누락`);
  }
});

test("compat 과 compat_social 은 다른 목차다 — social 엔 연애 전용 2종이 없다", () => {
  const social = fortuneOutline("compat_social");
  assert.ok(!social.includes("애정·거리감 표현법"));
  assert.ok(!social.includes("서로의 사랑의 언어"));
  assert.ok(fortuneOutline("compat").includes("서로의 사랑의 언어"));
});
