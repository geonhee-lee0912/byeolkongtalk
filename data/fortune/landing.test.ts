import { test } from "node:test";
import assert from "node:assert/strict";
import { FORTUNE_LANDING } from "./landing.ts";
import { LANDING_KEYS, fortuneOutline } from "@/lib/fortune/outline";

/** 텍스트 발췌 대신 결과 시각 요소를 미니 프리뷰로 보여주는 종목. */
const VISUAL_ONLY = ["element_balance", "saju_report_card", "life_graph"];

test("20개 상품 카피가 모두 있고 빈 칸이 없다", () => {
  assert.equal(Object.keys(FORTUNE_LANDING).length, 20);
  for (const k of LANDING_KEYS) {
    const c = FORTUNE_LANDING[k];
    assert.ok(c, `${k}: 카피 누락`);
    assert.ok(c.hook.trim().length >= 10, `${k}: hook 이 너무 짧다`);
    assert.ok(c.questions.length >= 3 && c.questions.length <= 4, `${k}: 질문은 3~4개`);
    for (const q of c.questions) assert.ok(q.trim().length > 0, `${k}: 빈 질문`);
    assert.ok(c.minutes.trim().length > 0, `${k}: minutes 누락`);
  }
});

test("시각 3종만 sample 이 null 이다", () => {
  for (const k of LANDING_KEYS) {
    const s = FORTUNE_LANDING[k].sample;
    if (VISUAL_ONLY.includes(k)) assert.equal(s, null, `${k}: 시각 종목은 프리뷰로 대체`);
    else assert.ok(s && s.trim().length >= 40, `${k}: 샘플이 없거나 너무 짧다`);
  }
});

test("단정적 예언 어투를 쓰지 않는다", () => {
  const BANNED = ["할 거야", "될 거야", "틀림없", "반드시", "무조건"];
  for (const k of LANDING_KEYS) {
    const c = FORTUNE_LANDING[k];
    const all = [c.hook, ...c.questions, c.sample ?? ""].join(" ");
    for (const b of BANNED) assert.ok(!all.includes(b), `${k}: 금지 표현 "${b}"`);
  }
});

test("목차가 있는 상품은 질문도 있다 — 빈 지면 금지", () => {
  for (const k of LANDING_KEYS) {
    assert.ok(fortuneOutline(k).length > 0, `${k}: 목차 누락`);
  }
});

test("볼드는 발췌당 최대 1곳 — 강조가 흔해지면 강조가 아니다", () => {
  for (const k of LANDING_KEYS) {
    const s = FORTUNE_LANDING[k].sample;
    if (!s) continue;
    const pairs = (s.match(/\*\*/g)?.length ?? 0) / 2;
    assert.ok(pairs <= 1, `${k}: 볼드 ${pairs}곳`);
  }
});
