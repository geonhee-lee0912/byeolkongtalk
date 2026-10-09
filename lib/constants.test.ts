import { test } from "node:test";
import assert from "node:assert/strict";
import { STAR_PACKAGES, SHOP_PACKAGE_IDS, shopPackages } from "./constants.ts";

// 스펙 §3-1 · §9-1 — 판매 목록 = 반반 두 그룹 진열의 합집합(결제 준비·승인 검증)
test("STAR_PACKAGES — 두 그룹 합집합 7종", () => {
  assert.deepEqual(
    STAR_PACKAGES.map((p) => [p.id, p.stars, p.price]),
    [
      ["star_10", 10, 1000],
      ["star_30", 30, 2800],
      ["star_55", 55, 4900],
      ["star_70", 70, 5900],
      ["star_130", 130, 9900],
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

test("상점 진열 — 메뉴판 10·30·55·70·130 / 옛 10·30·70·150·300(지금 prod)", () => {
  assert.deepEqual(shopPackages("menu").map((p) => p.id), ["star_10", "star_30", "star_55", "star_70", "star_130"]);
  assert.deepEqual(shopPackages("legacy").map((p) => p.id), ["star_10", "star_30", "star_70", "star_150", "star_300"]);
});

test("진열 id 는 전부 판매 목록에 있고, 두 진열의 합집합이 판매 목록 전체다", () => {
  const sold = STAR_PACKAGES.map((p) => p.id).sort();
  const shown = [...new Set([...SHOP_PACKAGE_IDS.menu, ...SHOP_PACKAGE_IDS.legacy])].sort();
  assert.deepEqual(shown, sold);
});
