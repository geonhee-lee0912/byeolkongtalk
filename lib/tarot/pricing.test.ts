import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";
import { tarotPrice } from "./pricing.ts";

const SPREADS = Object.keys(SPREAD_INFO) as SpreadType[];

test("옛 그룹 = SPREAD_INFO.starCost 그대로(지금 prod)", () => {
  for (const s of SPREADS) {
    // 표에 없는 값이 undefined 로 통과하지 않게 — 아래 equal 은 양쪽이 다 undefined 여도 통과한다
    assert.ok(Number.isInteger(tarotPrice(s, "legacy")) && tarotPrice(s, "legacy") > 0, `${s} 가격 없음`);
    assert.equal(tarotPrice(s, "legacy"), SPREAD_INFO[s].starCost, s);
  }
});

test("메뉴판 그룹 — 맛보기 15 · 투 15 · 3장 25 · 깊게(5·6장) 55 · 끝까지(7장) 70 (스펙 §3-2)", () => {
  const byCards: Record<number, number> = { 1: 15, 2: 15, 3: 25, 5: 55, 6: 55, 7: 70 };
  for (const s of SPREADS) {
    // 새 카드 수 스프레드가 생겼는데 표(MENU_PRICE_BY_CARDS)에 안 넣으면 여기서 잡힌다
    assert.ok(Number.isInteger(tarotPrice(s, "menu")) && tarotPrice(s, "menu") > 0, `${s} 가격 없음`);
    assert.equal(tarotPrice(s, "menu"), byCards[SPREAD_INFO[s].cardCount], s);
  }
});

test("투카드·쓰리카드는 두 그룹이 같다", () => {
  for (const s of ["two_card", "three_card"] as SpreadType[]) {
    assert.equal(tarotPrice(s, "menu"), tarotPrice(s, "legacy"), s);
  }
});

// 감시 SQL 의 price2 가 가격표의 두 번째 사본이다 — 나중에 가격을 바꾸고 SQL 을 안 고치면 price_mismatch 가 전부 울린다.
test("감시 쿼리(scripts/menu-ab-daily-check.sql) price2 의 그룹별 기대 가격 = tarotPrice", () => {
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8");
  const tables = new Map<string, Map<number, number>>();
  for (const m of sql.matchAll(/when\s+'(menu|legacy)'\s+then\s+case\s+cards\s+((?:when\s+\d+\s+then\s+\d+\s*)+)end/g)) {
    const byCards = new Map<number, number>();
    for (const w of m[2].matchAll(/when\s+(\d+)\s+then\s+(\d+)/g)) byCards.set(Number(w[1]), Number(w[2]));
    tables.set(m[1], byCards);
  }
  assert.deepEqual([...tables.keys()].sort(), ["legacy", "menu"]);
  for (const arm of ["menu", "legacy"] as const) {
    for (const s of SPREADS) {
      assert.equal(tables.get(arm)!.get(SPREAD_INFO[s].cardCount), tarotPrice(s, arm), `${arm} ${s}`);
    }
  }
});
