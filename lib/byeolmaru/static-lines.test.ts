import { test } from "node:test";
import assert from "node:assert/strict";
import { getCardLine } from "./static-lines.ts";
import { getCardCount } from "@/lib/tarot/cards";

// 금지 문자 — 화면에 그대로 노출되면 안 되는 것(별콩 화법: 별표·마커·제목).
function assertClean(s: string, where: string) {
  assert.ok(!s.includes("**"), `${where}: 마크다운 별표 금지`);
  assert.ok(!s.includes("[RECO"), `${where}: RECO 마커 금지`);
  assert.ok(!s.startsWith("#"), `${where}: 제목 금지`);
}

test("card-lines: 78카드 전부 · 정/역 비어있지 않음 · 금지문자 없음", () => {
  assert.equal(getCardCount(), 78, "카드 총수 = 뱅크 키 범위 전제");
  for (let id = 0; id < 78; id++) {
    const up = getCardLine(id, false);
    const rv = getCardLine(id, true);
    assert.ok(up && up.trim().length > 0, `card ${id} upright 존재`);
    assert.ok(rv && rv.trim().length > 0, `card ${id} reversed 존재`);
    assertClean(up, `card ${id} upright`);
    assertClean(rv, `card ${id} reversed`);
    assert.notEqual(up, rv, `card ${id} 정/역 다른 문장`);
  }
});

test("card-lines: 뱅크 밖 id 는 null(호출측 폴백)", () => {
  assert.equal(getCardLine(78, false), null);
  assert.equal(getCardLine(-1, true), null);
});
