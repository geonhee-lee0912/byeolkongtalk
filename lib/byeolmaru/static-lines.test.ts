import { test } from "node:test";
import assert from "node:assert/strict";
import { getCardLine, getSkeletonLine, getSajuTaste } from "./static-lines.ts";
import skeletonLines from "@/data/byeolmaru/skeleton-lines.json";
import sajuTaste from "@/data/byeolmaru/saju-taste.json";
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

test("skeleton: 3 tone × 5 relation = 15조합 전부 · 조합 문장 존재 · 금지문자 없음", () => {
  for (const t of TONES) {
    for (const r of RELATIONS) {
      const line = getSkeletonLine(t, r, "2026-09-05");
      assert.ok(line && line.trim().length > 0, `${t}/${r} 존재`);
      assert.ok(line.startsWith("오늘은 ") && line.includes("이라, "), `${t}/${r} 조각 조합 템플릿`);
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

test("skeleton: 조각 조합이 30일간 다양한 문장을 낸다(반복 완화)", () => {
  // 조각 조합 = relation 3 × tone 4 = 조합당 12출력. 30일 돌리면 여러 개가 나와야(고정 3보다 다양).
  const seen = new Set<string>();
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const line = getSkeletonLine("good", "생아", date);
    if (line) seen.add(line);
  }
  assert.ok(seen.size >= 5, `good/생아 30일이 5개 이상 다른 문장을 커버(실제 ${seen.size})`);
});

test("skeleton: 조각 뱅크 완전성 — relation 5종·tone 3종 각 ≥3조각", () => {
  const raw = skeletonLines as { relation: Record<string, string[]>; tone: Record<string, string[]> };
  for (const r of RELATIONS) assert.ok((raw.relation[r]?.length ?? 0) >= 3, `relation ${r} ≥3조각`);
  for (const t of TONES) assert.ok((raw.tone[t]?.length ?? 0) >= 3, `tone ${t} ≥3조각`);
});

test("skeleton: 뱅크 밖 조합은 null(호출측 폴백)", () => {
  assert.equal(getSkeletonLine("good", "없는관계" as ElementRelation, "2026-09-05"), null);
});

test("saju-taste: 유효 셀 → 5섹션(전반/연애/일/돈/조언) 전부 non-empty", () => {
  const t = getSajuTaste("good", { love: 70, money: 50, work: 55 }, "생아", "2026-09-05");
  assert.ok(t.overall.trim().length > 0, "overall 존재");
  assert.ok(t.love.trim().length > 0, "love 존재");
  assert.ok(t.work.trim().length > 0, "work 존재");
  assert.ok(t.money.trim().length > 0, "money 존재");
  assert.ok(t.advice.trim().length > 0, "advice 존재");
});

test("saju-taste: tasteBand 임계값 — love 70→high, 50→mid, 40→low 뱅크에서 뽑힘", () => {
  const raw = sajuTaste as { love: Record<string, string[]> };
  const high = getSajuTaste("good", { love: 70, money: 50, work: 50 }, "비화", "2026-09-05");
  assert.ok(raw.love.high.includes(high.love), "70점은 high 뱅크 소속");
  const mid = getSajuTaste("good", { love: 50, money: 50, work: 50 }, "비화", "2026-09-05");
  assert.ok(raw.love.mid.includes(mid.love), "50점은 mid 뱅크 소속");
  const low = getSajuTaste("good", { love: 40, money: 50, work: 50 }, "비화", "2026-09-05");
  assert.ok(raw.love.low.includes(low.love), "40점은 low 뱅크 소속");
});

test("saju-taste: 결정론 — 같은 입력은 늘 같은 결과", () => {
  const a = getSajuTaste("caution", { love: 40, money: 60, work: 45 }, "극아", "2026-09-10");
  const b = getSajuTaste("caution", { love: 40, money: 60, work: 45 }, "극아", "2026-09-10");
  assert.deepEqual(a, b);
});

test("saju-taste: 뱅크 완전성 — tone 3종(overall)·밴드 3종(love/work/money)·relation 5종(advice) 전부 non-empty", () => {
  for (const tone of TONES) {
    const t = getSajuTaste(tone, { love: 50, money: 50, work: 50 }, "비화", "2026-09-05");
    assert.ok(t.overall.trim().length > 0, `overall/${tone} 존재`);
  }
  const bandScores: { band: string; score: number }[] = [
    { band: "high", score: 70 },
    { band: "mid", score: 50 },
    { band: "low", score: 30 },
  ];
  for (const { band, score } of bandScores) {
    const t = getSajuTaste("normal", { love: score, money: score, work: score }, "비화", "2026-09-05");
    assert.ok(t.love.trim().length > 0, `love/${band} 존재`);
    assert.ok(t.work.trim().length > 0, `work/${band} 존재`);
    assert.ok(t.money.trim().length > 0, `money/${band} 존재`);
  }
  for (const relation of RELATIONS) {
    const t = getSajuTaste("normal", { love: 50, money: 50, work: 50 }, relation, "2026-09-05");
    assert.ok(t.advice.trim().length > 0, `advice/${relation} 존재`);
  }
});

test("saju-taste: 경계값 — love 65→high, 64→mid, 45→mid, 44→low", () => {
  const raw = sajuTaste as { love: Record<string, string[]> };
  const at = (score: number) => getSajuTaste("good", { love: score, money: 50, work: 50 }, "비화", "2026-09-05").love;
  assert.ok(raw.love.high.includes(at(65)), "65 = high");
  assert.ok(raw.love.mid.includes(at(64)), "64 = mid");
  assert.ok(raw.love.mid.includes(at(45)), "45 = mid");
  assert.ok(raw.love.low.includes(at(44)), "44 = low");
});

test("saju-taste: 날짜-간 반복 완화 — 밴드 고정 60일에서 각 슬롯이 충분히 바뀐다(avalanche 회귀 가드)", () => {
  // 🔴 salt 나눗셈 버그 회귀 가드: hashDate 가 하루 +1 이라 floor(h/salt) 식은 한 슬롯을 salt 일
  // 고정시켜 같은 문장이 반복됐다(리뷰 실측 money 91%·advice 89%). avalanche 로 흩뿌리면 날짜-간
  // 변경률이 독립 기준(len2≈50%·len3≈67%)에 붙는다. 밴드/톤/관계 고정으로 픽커만 격리 — 25% 미만이면 실패.
  const start = Date.parse("2026-01-01T00:00:00Z");
  const N = 60;
  const KEYS = ["overall", "love", "work", "money", "advice"] as const;
  const changes: Record<(typeof KEYS)[number], number> = { overall: 0, love: 0, work: 0, money: 0, advice: 0 };
  let prev: ReturnType<typeof getSajuTaste> | null = null;
  for (let i = 0; i < N; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const t = getSajuTaste("good", { love: 75, money: 70, work: 72 }, "생아", date);
    if (prev) {
      for (const k of KEYS) {
        if (t[k] !== prev[k]) changes[k]++;
      }
    }
    prev = t;
  }
  for (const k of KEYS) {
    const rate = changes[k] / (N - 1);
    assert.ok(rate >= 0.25, `${k} 날짜-간 변경률 ${(rate * 100).toFixed(0)}% ≥25%(반복 고정 아님)`);
  }
});

test("saju-taste: 반환 5섹션 금지문자 없음", () => {
  const t = getSajuTaste("good", { love: 70, money: 55, work: 60 }, "생아", "2026-09-05");
  for (const [k, v] of Object.entries(t)) assertClean(v, `saju-taste ${k}`);
});
