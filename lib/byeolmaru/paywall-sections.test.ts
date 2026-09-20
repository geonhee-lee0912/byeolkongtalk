// lib/byeolmaru/paywall-sections.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { SAJU_PAID_SECTIONS, TAROT_PAID_SECTIONS, SAJU_PAID_CHARS, TAROT_PAID_CHARS } from "./paywall-sections.ts";
import { DAILY_SECTIONS } from "@/lib/fortune/daily-report";
import { CARD_REPORT_BLOCKS } from "./card-report.ts";

test("사주 칩은 DAILY_SECTIONS 5개를 전부 품는다 — 도메인이 늘면 여기서 깨진다", () => {
  for (const s of DAILY_SECTIONS) {
    assert.ok(SAJU_PAID_SECTIONS.includes(s.title), `${s.title} 누락`);
  }
  // 도메인 5 + 고정 5(총평·종합운·럭키·도입·균형) + 한마디 = 11
  assert.equal(SAJU_PAID_SECTIONS.length, DAILY_SECTIONS.length + 6);
});

test("타로 칩은 CARD_REPORT_BLOCKS 와 개수·이름이 정확히 같다", () => {
  assert.deepEqual(TAROT_PAID_SECTIONS, CARD_REPORT_BLOCKS.map((b) => b.title));
});

test("분량 숫자는 스펙 §6-2 목표(1,800자)와 같다", () => {
  assert.equal(SAJU_PAID_CHARS, 1800);
  assert.equal(TAROT_PAID_CHARS, 1800);
});
