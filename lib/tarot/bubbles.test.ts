import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntoBubbles, getLatestCardIndex } from "./bubbles.ts";

test("[CARD:n] 마커로 분할 — 마커 직후 버블에만 카드 이미지", () => {
  const raw = "훅 문단이야.\n\n[CARD:1]\n첫 카드 해석.\n\n이어지는 문단.\n\n[CARD:2]\n둘째 카드 해석.";
  const b = parseIntoBubbles(raw);
  assert.deepEqual(
    b.map((x) => [x.text.slice(0, 4), x.cardIndex, x.showCardImage]),
    [
      ["훅 문단", null, false],
      ["첫 카드", 0, true],
      ["이어지는", 0, false],
      ["둘째 카", 1, true],
    ]
  );
});

test("마커 없으면 문단 버블만 (이미지 없음)", () => {
  const b = parseIntoBubbles("문단 하나.\n\n문단 둘.");
  assert.equal(b.length, 2);
  assert.ok(b.every((x) => x.cardIndex === null && !x.showCardImage));
});

test("[END]·[RECO:]·꼬리 미완성 마커 제거", () => {
  const b = parseIntoBubbles("답이야. [END]\n\n[RECO:saju]\n\n[CARD:");
  assert.equal(b.length, 1);
  assert.equal(b[0].text, "답이야.");
});

test("getLatestCardIndex — 버퍼의 마지막 마커 번호(1-based)", () => {
  assert.equal(getLatestCardIndex("x [CARD:1] y [CARD:3] z"), 3);
  assert.equal(getLatestCardIndex("마커 없음"), null);
});
