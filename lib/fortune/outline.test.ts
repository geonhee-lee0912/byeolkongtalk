import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fortuneOutline, LANDING_KEYS, splitLengthHint, SAJU_YEAR_OUTLINE_TEMPLATE, type LandingKey } from "./outline.ts";
import { FORTUNE_LENGTH_HINT } from "./types.ts";
import { GENERIC_GUIDE_SPEC, SECTION_GUIDE } from "./prompt.ts";
import { DAILY_SECTIONS } from "./daily-report.ts";

test("21개 상품 전부 목차가 있고 비어있지 않다", () => {
  assert.equal(LANDING_KEYS.length, 21);
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

// 연간 사주 분석은 뷰가 연도 자리를 `${y}` 로 붙인다 — 틀의 `{Y}` 를 그 표기로 바꿔 뷰 소스에서 찾는다.
test("연간 사주 분석 목차 틀은 뷰 소스와 대조된다", () => {
  const root = new URL("../../", import.meta.url);
  const src = readFileSync(new URL("components/fortune/saju-full/SajuFullReportView.tsx", root), "utf8");
  for (const h of SAJU_YEAR_OUTLINE_TEMPLATE) {
    const needle = h.replaceAll("{Y}", "${y}");
    assert.ok(src.includes(needle), `saju 연간: "${needle}" 가 뷰에 없다`);
  }
});

test("2026 목차는 리팩터 전과 같고, 2027 목차엔 2026 이 없다", () => {
  assert.deepEqual(fortuneOutline("saju_full"), [
    "타고난 기질·성격", "나의 강점·빛나는 재능", "조심할 성향·보완점", "오행 밸런스 진단",
    "타고난 적성·어울리는 일", "2026년 큰 흐름·테마", "마음·감정 흐름", "사랑·인연",
    "인간관계·사회", "일·커리어", "재물·금전", "건강·컨디션", "학업·자기계발", "이동·변화",
    "가족·주변", "재물 심층", "일·커리어 심층", "연애 심층", "건강 심층",
    "2026 상반기", "2026 하반기", "1분기 (1~3월)", "2분기 (4~6월)", "3분기 (7~9월)",
    "4분기 (10~12월)", "전환점·변화 포인트", "놓치면 아까운 기회", "조심할 함정",
    "2026 인연 지도", "관계 지도 확장", "올해의 성장 과제", "2026 월별 흐름",
    "주목할 시기", "2026 행운 가이드", "2026 개운법", "오행 활용법", "셀프케어 루틴",
    "올해 이것만은 — 실천 3가지",
  ]);
  const o27 = fortuneOutline("saju_2027");
  assert.ok(o27.includes("2027 상반기"));
  assert.ok(!o27.some((h) => h.includes("2026")));
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

test("분량 힌트가 있는 종목은 전부 숫자/단위로 갈린다", () => {
  let checked = 0;
  for (const k of LANDING_KEYS) {
    const hint = (FORTUNE_LENGTH_HINT as Record<string, string | undefined>)[k];
    if (!hint) continue; // saju_mbti 는 FortuneType 이 아니라 힌트가 없다
    const split = splitLengthHint(hint);
    assert.ok(split, `${k}: "${hint}" 를 못 가른다 — 랜딩 분량 칸이 사라진다`);
    assert.ok(split!.value.trim().length > 0, `${k}: 숫자가 비었다`);
    checked += 1;
  }
  assert.ok(checked >= 19, `분량 힌트를 가진 종목이 ${checked}개뿐 — 표기가 통째로 빠졌나?`);
});

test("splitLengthHint — 형식이 아니면 null (조용히 틀리지 않게)", () => {
  assert.equal(splitLengthHint(undefined), null);
  assert.equal(splitLengthHint("5000"), null);
  assert.deepEqual(splitLengthHint("약 2만 자"), { value: "2만", unit: "자" });
  assert.deepEqual(splitLengthHint("약 5,000자"), { value: "5,000", unit: "자" });
});
