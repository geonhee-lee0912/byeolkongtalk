import { test } from "node:test";
import assert from "node:assert/strict";
import { STAR_PACKAGES } from "./constants.ts";

// 결제 준비·승인 검증에 쓰는 판매 목록
test("STAR_PACKAGES — 판매 패키지 5종", () => {
  assert.deepEqual(
    STAR_PACKAGES.map((p) => [p.id, p.stars, p.price]),
    [
      ["star_10", 10, 1000],
      ["star_30", 30, 2800],
      ["star_70", 70, 5900],
      ["star_150", 150, 11000],
      ["star_300", 300, 19900],
    ]
  );
});

test("id 유일 · 별 수 오름차순(상점 BASE_PER_STAR 가 [0] 을 쓴다)", () => {
  const ids = STAR_PACKAGES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 1; i < STAR_PACKAGES.length; i++) {
    assert.ok(STAR_PACKAGES[i].stars > STAR_PACKAGES[i - 1].stars, STAR_PACKAGES[i].id);
  }
});

test("별당 가격은 클수록 확실히 싸진다(단조 감소)", () => {
  for (let i = 1; i < STAR_PACKAGES.length; i++) {
    const prev = STAR_PACKAGES[i - 1].price / STAR_PACKAGES[i - 1].stars;
    const cur = STAR_PACKAGES[i].price / STAR_PACKAGES[i].stars;
    assert.ok(cur < prev, `${STAR_PACKAGES[i].id}: 별당 ${cur.toFixed(1)} ≥ ${prev.toFixed(1)}`);
  }
});
