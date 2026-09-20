// lib/byeolmaru/paywall-sections.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { SAJU_PAID_SECTIONS, TAROT_PAID_SECTIONS, SAJU_PAID_CHARS, TAROT_PAID_CHARS } from "./paywall-sections.ts";
import { DAILY_SECTIONS } from "@/lib/fortune/daily-report";
import { CARD_REPORT_BLOCKS } from "./card-report.ts";

test("사주 칩은 DAILY_SECTIONS 5개를 품고 고정 라벨·순서까지 그대로다 — 도메인이 늘거나 라벨이 바뀌면 여기서 깨진다", () => {
  assert.deepEqual(SAJU_PAID_SECTIONS, [
    "한 줄 총평",
    "종합운",
    "럭키 3종",
    "들어온 두 글자",
    ...DAILY_SECTIONS.map((s) => s.title),
    "균형",
    "별콩이의 한마디",
  ]);
});

test("타로 칩은 CARD_REPORT_BLOCKS 와 개수·이름이 정확히 같다", () => {
  assert.deepEqual(TAROT_PAID_SECTIONS, CARD_REPORT_BLOCKS.map((b) => b.title));
});

test("분량 숫자는 스펙 §6-2 목표(1,800자)와 같다", () => {
  assert.equal(SAJU_PAID_CHARS, 1800);
  assert.equal(TAROT_PAID_CHARS, 1800);
});

test("두 배열의 마무리 칩은 같은 문구다 — 같은 화면 장치라 문구가 갈리면 안 된다", () => {
  assert.equal(SAJU_PAID_SECTIONS.at(-1), TAROT_PAID_SECTIONS.at(-1));
});
