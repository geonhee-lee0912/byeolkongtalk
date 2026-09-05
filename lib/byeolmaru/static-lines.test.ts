import { test } from "node:test";
import assert from "node:assert/strict";
import { getCardLine, getSkeletonLine } from "./static-lines.ts";
import { getCardCount } from "@/lib/tarot/cards";
import type { DayTone } from "./day-score.ts";
import type { ElementRelation } from "@/lib/saju/pairing";

const TONES: DayTone[] = ["good", "normal", "caution"];
const RELATIONS: ElementRelation[] = ["생아", "아극", "비화", "아생", "극아"];

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

test("skeleton: 3 tone × 5 relation = 15조합 전부 · 문장 존재 · 금지문자 없음", () => {
  for (const t of TONES) {
    for (const r of RELATIONS) {
      const line = getSkeletonLine(t, r, "2026-09-05");
      assert.ok(line && line.trim().length > 0, `${t}/${r} 존재`);
      assertClean(line, `${t}/${r}`);
    }
  }
});

test("skeleton: 로테이션 결정론 — 같은 (tone,relation,date) 는 늘 같은 문장", () => {
  for (const t of TONES) {
    for (const r of RELATIONS) {
      const a = getSkeletonLine(t, r, "2026-09-05");
      const b = getSkeletonLine(t, r, "2026-09-05");
      assert.equal(a, b, `${t}/${r} 결정론`);
    }
  }
});

test("skeleton: variant 로테이션이 실제로 여러 문장을 커버한다(반복 완화)", () => {
  // 한 조합에서 30일치 날짜를 돌리면 3개 variant 가 모두 나와야 한다(≥3 variant 전제).
  const seen = new Set<string>();
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const line = getSkeletonLine("good", "생아", date);
    if (line) seen.add(line);
  }
  assert.ok(seen.size >= 3, `good/생아 30일 로테이션이 3개 variant 를 다 커버(실제 ${seen.size})`);
});

test("skeleton: 뱅크 밖 조합은 null(호출측 폴백)", () => {
  assert.equal(getSkeletonLine("good", "없는관계" as ElementRelation, "2026-09-05"), null);
});
