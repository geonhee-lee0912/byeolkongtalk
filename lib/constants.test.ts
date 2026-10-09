import { test } from "node:test";
import assert from "node:assert/strict";
import { STAR_PACKAGES, LEGACY_STAR_PACKAGES, findPackageForConfirm } from "./constants.ts";

// 스펙 2026-10-05-타로톡-메뉴판-별경제 §3-1
test("STAR_PACKAGES — 10·30·55·70·130", () => {
  assert.deepEqual(
    STAR_PACKAGES.map((p) => [p.id, p.stars, p.price]),
    [
      ["star_10", 10, 1000],
      ["star_30", 30, 2800],
      ["star_55", 55, 4900],
      ["star_70", 70, 5900],
      ["star_130", 130, 9900],
    ]
  );
});

test("STAR_PACKAGES — id 유일 · 별 수 오름차순(상점 BASE_PER_STAR 가 [0] 을 쓴다)", () => {
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

test("레거시(star_150·star_300)는 진열 목록에 없다", () => {
  assert.deepEqual(LEGACY_STAR_PACKAGES.map((p) => p.id), ["star_150", "star_300"]);
  for (const l of LEGACY_STAR_PACKAGES) {
    assert.ok(!STAR_PACKAGES.some((p) => p.id === l.id), l.id);
  }
});

test("findPackageForConfirm — 현행·레거시·옛 형식 id, 모르면 undefined", () => {
  assert.equal(findPackageForConfirm("star_55")?.price, 4900);
  assert.equal(findPackageForConfirm("star_150")?.price, 11000);
  assert.equal(findPackageForConfirm("star_300")?.price, 19900);
  assert.equal(findPackageForConfirm("130")?.id, "star_130");
  assert.equal(findPackageForConfirm("star_999"), undefined);
  assert.equal(findPackageForConfirm(undefined), undefined);
});
