// 상품별 "리포트에 담기는 것" 목차 — 랜딩이 읽는 단일 창구.
//
// 🔴 목차가 실제 리포트와 어긋나면 그건 과장 광고다. 그래서 원천을 둘로 나눈다.
//  (a) 공용 12종 — prompt.ts 의 GENERIC_GUIDE_SPEC 에서 **직접 파생**(드리프트 불가)
//  (b) 전용 7종 + MBTI — 여기 손으로 적고 outline.test.ts 가 원천과 대조한다.
//      🔴 원천이 종목마다 다르다. life_full 만 프롬프트가 heading 을 들고(공용 스키마),
//      나머지는 프롬프트가 "money" 같은 **키만** 주고 화면 제목은 렌더러가 붙인다.
//      그래서 테스트는 뷰 소스 파일을 직접 읽어 대조한다 — 프롬프트로 대조하면 화면에
//      없는 문구가 목차에 섞인다(실제로 한 번 그렇게 어긋났다).
import { GENERIC_GUIDE_SPEC } from "./prompt";
import { DAILY_SECTIONS } from "./daily-report";
import type { FortuneType } from "./types";

/** 랜딩을 가진 상품 — 활성 사주 19종 + 무료 사주 MBTI. */
export type LandingKey = Exclude<
  FortuneType,
  "daily" | "good_days" | "tarot_daily" | "tarot_love" | "tarot_money" | "tarot_career" | "tarot_relation"
> | "saju_mbti";

export const LANDING_KEYS: LandingKey[] = [
  "compat", "compat_social", "saju_full", "monthly",
  "nature_self", "talent_path", "user_manual", "element_balance", "life_full",
  "love_self", "love_year", "marriage",
  "wealth_vessel", "wealth_year", "career_timing",
  "fact_bomb", "past_life", "saju_report_card", "life_graph",
  "saju_mbti",
];

/** 전용 템플릿 7종 + MBTI — 손으로 적은 목차(이모지 없이). */
const MANUAL_OUTLINE: Record<string, string[]> = {
  monthly: [
    "이번 달 들어온 두 글자",
    "주차별 흐름",
    ...DAILY_SECTIONS.map((s) => s.title),
    "인간관계·귀인",
    "마음·감정 컨디션",
    "이번 달 실천 포인트",
    "주목할 시기·챙길 점",
  ],
  // 🔴 saju_full 의 표시 제목은 **프롬프트에 없다** — 프롬프트는 "money"·"strength" 같은 키만
  // 주고 화면에 뜨는 제목은 SajuFullReportView 가 붙인다(그 파일의 heading 38개가 정본).
  // 프롬프트 문구로 대조하면 화면에 존재하지 않는 항목("1~12월" 등)이 목차에 섞인다.
  saju_full: [
    "타고난 기질·성격", "나의 강점·빛나는 재능", "조심할 성향·보완점", "오행 밸런스 진단",
    "타고난 적성·어울리는 일", "2026년 큰 흐름·테마", "마음·감정 흐름", "사랑·인연",
    "인간관계·사회", "일·커리어", "재물·금전", "건강·컨디션", "학업·자기계발", "이동·변화",
    "가족·주변", "재물 심층", "일·커리어 심층", "연애 심층", "건강 심층",
    "2026 상반기", "2026 하반기", "1분기 (1~3월)", "2분기 (4~6월)", "3분기 (7~9월)",
    "4분기 (10~12월)", "전환점·변화 포인트", "놓치면 아까운 기회", "조심할 함정",
    "2026 인연 지도", "관계 지도 확장", "올해의 성장 과제", "2026 월별 흐름",
    "주목할 시기", "2026 행운 가이드", "2026 개운법", "오행 활용법", "셀프케어 루틴",
    "올해 이것만은 — 실천 3가지",
  ],
  life_full: [
    "타고난 그릇", "타고난 성격의 뿌리", "오행이 그린 인생 색", "십신으로 본 나",
    "내 사주의 특별한 기운", "인생의 큰 줄기", "타고난 복과 그릇의 크기",
    "인생의 3대 고비와 넘는 법", "인생의 전환점", "평생 화두", "평생의 관계 흐름",
    "평생의 재물 흐름", "평생의 건강 흐름", "평생의 일과 사명", "평생의 배움과 성장",
    "나를 돕는 평생 귀인", "평생 지킬 것 / 내려놓을 것", "평생 개운의 방향",
    "인생을 관통하는 키워드", "나의 운명적 과제",
    "타이밍의 지혜 — 나아갈 때와 물러날 때", "말년과 남길 것",
  ],
  // CompatReportView 의 items 순서 그대로. romantic/social 은 SECTION_LABELS 가 갈린다.
  compat: [
    "오행 케미", "끌림·성격 케미", "갈등 포인트", "잘 통하는 대화법", "장기 전망",
    "관계 성장 포인트", "두 사람 각자의 모습", "관계 시기별 흐름", "다툼과 화해의 기술",
    "애정·거리감 표현법", "서로의 사랑의 언어", "위기 신호와 조기 대응",
    "각자 조심할 습관", "관계에 활기를 더하는 법", "관계를 위한 조언",
  ],
  compat_social: [
    "오행 케미", "성향 케미", "부딪히는 지점", "소통의 결", "관계의 미래",
    "관계 성장 포인트", "두 사람 각자의 모습", "관계 시기별 흐름", "다툼과 화해의 기술",
    "위기 신호와 조기 대응", "각자 조심할 습관", "관계에 활기를 더하는 법", "관계를 위한 조언",
  ],
  // ReportCardView 실제 렌더 순서 = 종합 학점(카드 상단 배지) → 도메인 5개 → 담임 총평(카드
  // 하단) → 별콩이의 한마디. 초안은 담임 총평/종합 학점 위치가 뒤바뀌어 있었다.
  saju_report_card: [
    "종합 학점", "재물운", "애정운", "직업운", "건강운", "인간관계운",
    "담임 총평", "별콩이의 한마디",
  ],
  // LifeGraphView 실제 헤딩. "웅크리며 준비할 시기"는 밸리 카드 제목 — 차트 아래 범례 문구
  // ("웅크리는 시기")와는 다르니 헷갈리지 말 것.
  life_graph: [
    "내 인생 곡선 (대운)", "대운 구간별 해설", "가장 빛나는 시기",
    "웅크리며 준비할 시기", "별콩이의 한마디",
  ],
  // ResultView 실제 DOM 순서. 초안은 "성격"·"타고난 너의 사주 원판" 두 섹션이 통째로 빠졌고
  // "오행 기질"(오행 텍스처 섹션)이 4축 바로 뒤로 잘못 당겨져 있었다(실제로는 궁합 다음).
  // MBTI 결과는 섹션형 리포트가 아니라 한 장짜리 화면이라, 몇 항목은 화면 라벨을 그대로
  // 쓰고(4축·사주 원판·성격) 나머지는 그 블록을 설명하는 말로 적었다.
  saju_mbti: [
    "타고난 팔자 유형", "타고난 너의 4축", "성격", "빛과 그림자",
    "연애할 때의 나", "잘 맞는 유형 / 부딪히는 유형", "오행 기질",
    "타고난 너의 사주 원판", "네가 아는 너 vs 타고난 너",
  ],
};

/** 상품의 리포트 목차. 공용 12종은 프롬프트 원안 파생, 나머지는 손으로 적은 표. */
export function fortuneOutline(key: LandingKey): string[] {
  const spec = (GENERIC_GUIDE_SPEC as Record<string, { sections: readonly { heading: string }[] }>)[key];
  if (spec) return spec.sections.map((s) => s.heading);
  return MANUAL_OUTLINE[key] ?? [];
}

/** "약 5,000자" → `{ value: "5,000", unit: "자" }`. 랜딩이 숫자만 크게 키우려면 갈라야 한다.
 *
 *  🔴 FORTUNE_LENGTH_HINT 의 표기가 바뀌면 여기가 null 을 뱉고 분량 칸이 조용히 사라진다.
 *  outline.test.ts 가 힌트를 가진 전 종목을 훑어 파싱을 강제한다. */
export function splitLengthHint(hint: string | undefined | null): { value: string; unit: string } | null {
  if (!hint) return null;
  const m = hint.match(/^약\s*(.+?)\s*(자)$/);
  return m ? { value: m[1], unit: m[2] } : null;
}
