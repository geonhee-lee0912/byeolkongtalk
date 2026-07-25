import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serializeThreadDraw,
  tryParseThreadDraw,
  validateDrawnCards,
  redactDrawForModel,
  splitByCardMarker,
} from "./draw-thread.ts";
import type { ThreadMsg } from "./memory.ts";

const labels = ["지금의 나", "지금의 상대", "둘 사이 에너지", "내가 필요한 것", "상대가 필요한 것", "나아갈 방향"];
const cards = labels.map((label, i) => ({ position: i, card_id: i + 1, direction: "upright" as const, label }));

test("serializeThreadDraw ↔ tryParseThreadDraw 왕복", () => {
  const raw = serializeThreadDraw({ skill: "checkin", spread: "checkin_6", cards });
  const parsed = tryParseThreadDraw(raw);
  assert.ok(parsed);
  assert.equal(parsed.skill, "checkin");
  assert.equal(parsed.spread, "checkin_6");
  assert.equal(parsed.cards.length, 6);
  assert.equal(parsed.cards[0].label, "지금의 나");
});

test("tryParseThreadDraw — 일반 텍스트/다른 JSON은 null", () => {
  assert.equal(tryParseThreadDraw("그냥 평범한 답장이야."), null);
  assert.equal(tryParseThreadDraw('{"v":1,"grade":"좋은 인연"}'), null);
});

test("validateDrawnCards — 정상 입력은 label 을 서버 값으로 재계산", () => {
  const input = cards.map((c) => ({ ...c, label: "위조된라벨" }));
  const out = validateDrawnCards(input, 6, labels);
  assert.ok(out);
  assert.equal(out[0].label, "지금의 나");
  assert.equal(out[5].label, "나아갈 방향");
});

test("validateDrawnCards — 장수 불일치/중복/잘못된 방향/미존재 카드는 null", () => {
  assert.equal(validateDrawnCards(cards.slice(0, 5), 6, labels), null);
  const dup = [...cards.slice(0, 5), { ...cards[0] }];
  assert.equal(validateDrawnCards(dup, 6, labels), null);
  const badDir = cards.map((c, i) => (i === 0 ? { ...c, direction: "sideways" } : c));
  assert.equal(validateDrawnCards(badDir, 6, labels), null);
  const badId = cards.map((c, i) => (i === 0 ? { ...c, card_id: 9999 } : c));
  assert.equal(validateDrawnCards(badId, 6, labels), null);
  assert.equal(validateDrawnCards("not-an-array", 6, labels), null);
});

test("redactDrawForModel — 스트립 JSON 을 짧은 자연어로 치환(role·길이 불변)", () => {
  const rows: ThreadMsg[] = [
    { role: "user", content: "카드 뽑아줄래?" },
    { role: "assistant", content: serializeThreadDraw({ skill: "checkin", spread: "checkin_6", cards }) },
  ];
  const out = redactDrawForModel(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].content, "카드 뽑아줄래?");
  assert.equal(out[1].role, "assistant");
  assert.ok(!out[1].content.startsWith("{"));
  assert.ok(out[1].content.includes("6장"));
});

test("splitByCardMarker — [CARD:n] 기준 분할 + 마커 제거", () => {
  const text = "펼쳐볼게.\n\n[CARD:1]\n첫 자리는 이래.\n\n[CARD:2]\n둘째 자리는 이래.";
  const segs = splitByCardMarker(text);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].cardIndex, null);
  assert.equal(segs[0].text, "펼쳐볼게.");
  assert.equal(segs[1].cardIndex, 1);
  assert.ok(segs[1].text.includes("첫 자리"));
  assert.ok(!segs[1].text.includes("[CARD:"));
  assert.equal(segs[2].cardIndex, 2);
});

test("splitByCardMarker — 마커 없으면 단일 세그먼트", () => {
  const segs = splitByCardMarker("마커 없는 평범한 답장");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].cardIndex, null);
});

test("splitByCardMarker — 마커만 있고 본문이 없으면 빈 배열(마커 누출 방지)", () => {
  assert.deepEqual(splitByCardMarker("[CARD:1]"), []);
});

test("splitByCardMarker — 마커 + 공백만 있는 입력도 빈 배열", () => {
  assert.deepEqual(splitByCardMarker("[CARD:1]\n\n   "), []);
});

test("splitByCardMarker — 연속 마커는 본문이 있는 뒤쪽 카드에 귀속(의도된 동작)", () => {
  const segs = splitByCardMarker("[CARD:1][CARD:2]본문");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].cardIndex, 2);
  assert.equal(segs[0].text, "본문");
  assert.ok(!segs[0].text.includes("[CARD:"));
});

test("splitByCardMarker — [WRAP] 이후는 cardIndex null 세그먼트로 분리(칩 없는 종합 파트)", () => {
  const text = "[CARD:1]\n첫 해석\n\n[WRAP]\n종합 흐름과 처방";
  const segs = splitByCardMarker(text);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].cardIndex, 1);
  assert.ok(segs[0].text.includes("첫 해석"));
  assert.ok(!segs[0].text.includes("[CARD:"));
  assert.ok(!segs[0].text.includes("[WRAP]"));
  assert.equal(segs[1].cardIndex, null);
  assert.ok(segs[1].text.includes("종합 흐름과 처방"));
  assert.ok(!segs[1].text.includes("[WRAP]"));
});

test("splitByCardMarker — [WRAP] 만 있고 [CARD:n] 없는 입력", () => {
  const segs = splitByCardMarker("도입부 텍스트\n\n[WRAP]\n종합 텍스트");
  assert.equal(segs.length, 2);
  assert.equal(segs[0].cardIndex, null);
  assert.equal(segs[0].text, "도입부 텍스트");
  assert.equal(segs[1].cardIndex, null);
  assert.equal(segs[1].text, "종합 텍스트");
});

test("splitByCardMarker — [WRAP] 이 맨 끝에 오면 빈 세그먼트를 만들지 않음", () => {
  const segs = splitByCardMarker("[CARD:1]\n첫 해석\n\n[WRAP]");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].cardIndex, 1);
  assert.equal(segs[0].text, "첫 해석");
});
