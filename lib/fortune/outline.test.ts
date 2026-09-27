import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fortuneOutline, LANDING_KEYS, type LandingKey } from "./outline.ts";
import { GENERIC_GUIDE_SPEC, SECTION_GUIDE } from "./prompt.ts";
import { DAILY_SECTIONS } from "./daily-report.ts";

test("20개 상품 전부 목차가 있고 비어있지 않다", () => {
  assert.equal(LANDING_KEYS.length, 20);
  for (const k of LANDING_KEYS) {
    const o = fortuneOutline(k);
    assert.ok(o.length > 0, `${k}: 목차가 비었다`);
    for (const h of o) assert.ok(h.trim().length > 0, `${k}: 빈 제목`);
    assert.ok(!o.some((h) => /^\p{Extended_Pictographic}/u.test(h)), `${k}: 이모지가 남았다`);
  }
});

test("공용 12종은 GENERIC_GUIDE_SPEC 에서 그대로 파생된다", () => {
  for (const [type, spec] of Object.entries(GENERIC_GUIDE_SPEC)) {
    assert.deepEqual(
      fortuneOutline(type as LandingKey),
      spec.sections.map((s) => s.heading),
      `${type}: 목차가 프롬프트 원안과 다르다`
    );
  }
});

test("life_full 의 손으로 적은 제목은 프롬프트 안에 실재한다", () => {
  // life_full 은 공용 스키마라 화면 제목이 곧 LLM 이 받은 heading 이다 → 프롬프트가 정본.
  for (const h of fortuneOutline("life_full")) {
    assert.ok(SECTION_GUIDE.life_full.includes(h), `life_full: "${h}" 가 프롬프트에 없다`);
  }
});

// 🔴 나머지 전용 종목은 **화면 제목을 렌더러가 붙인다** — 프롬프트엔 "money" 같은 키만 있다.
// 그래서 정본은 뷰 소스 파일이고, 여기서 파일을 직접 읽어 대조한다(제목을 바꾸면 테스트가 깨진다).
// descriptive = 화면에 고정 제목이 없는 항목(데이터로 반복 렌더되거나 LLM 출력) — 대조 제외.
const VIEW_SOURCE: Record<string, { file: string; descriptive?: string[] }> = {
  saju_full: { file: "components/fortune/saju-full/SajuFullReportView.tsx" },
  compat: { file: "components/fortune/compat/CompatReportView.tsx" },
  compat_social: { file: "components/fortune/compat/CompatReportView.tsx" },
  monthly: {
    file: "components/fortune/monthly/MonthlyReportView.tsx",
    descriptive: DAILY_SECTIONS.map((s) => s.title), // 도메인 5개는 daily-report.ts 가 원천
  },
  life_graph: {
    file: "components/fortune/LifeGraphView.tsx",
    descriptive: ["대운 구간별 해설"], // 대운 카드는 데이터로 반복 렌더 — 고정 제목이 없다
  },
  saju_report_card: {
    file: "components/fortune/ReportCardView.tsx",
    // 과목 5개는 LLM 출력(프롬프트가 지정) · "종합 학점"은 화면엔 "종합" 배지로만 뜬다
    descriptive: ["재물운", "애정운", "직업운", "건강운", "인간관계운", "종합 학점"],
  },
};

test("렌더러가 제목을 들고 있는 종목은 뷰 소스와 대조한다", () => {
  const root = new URL("../../", import.meta.url);
  for (const [type, cfg] of Object.entries(VIEW_SOURCE)) {
    const src = readFileSync(new URL(cfg.file, root), "utf8");
    for (const h of fortuneOutline(type as LandingKey)) {
      if (cfg.descriptive?.includes(h)) continue;
      assert.ok(src.includes(h), `${type}: "${h}" 가 ${cfg.file} 에 없다`);
    }
  }
});

test("monthly 목차는 DAILY_SECTIONS 5개 도메인을 포함한다", () => {
  const o = fortuneOutline("monthly");
  for (const s of DAILY_SECTIONS) {
    assert.ok(o.includes(s.title), `monthly: "${s.title}" 누락`);
  }
});

test("사주 성적표 과목은 프롬프트가 지정한 그대로다", () => {
  const o = fortuneOutline("saju_report_card");
  for (const d of ["재물운", "애정운", "직업운", "건강운", "인간관계운"]) {
    assert.ok(SECTION_GUIDE.saju_report_card.includes(`"domain": "${d}"`), `프롬프트에 ${d} 없음`);
    assert.ok(o.includes(d), `목차에 ${d} 없음`);
  }
});

test("compat 과 compat_social 은 다른 목차다 — social 엔 연애 전용 2종이 없다", () => {
  const social = fortuneOutline("compat_social");
  assert.ok(!social.includes("애정·거리감 표현법"));
  assert.ok(!social.includes("서로의 사랑의 언어"));
  assert.ok(fortuneOutline("compat").includes("서로의 사랑의 언어"));
});
