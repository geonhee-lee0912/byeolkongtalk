// 운세 리포트용 system message 빌더. 정적(페르소나)/동적(데이터+지시) 분리 — claude.ts streamChat 캐싱 규약과 동일.

import { readFileSync } from "fs";
import { join } from "path";
import type { SajuResult } from "@/lib/saju/calc";
import type { FortuneType } from "./types";

let _persona: string | null = null;
function getFortunePersona(): string {
  if (_persona === null) {
    _persona = readFileSync(
      join(process.cwd(), "data", "persona", "byeolkong_fortune.md"),
      "utf-8"
    );
  }
  return _persona;
}

function sajuBlock(saju: SajuResult): string {
  const p = saju.pillars;
  const elementsLine = Object.entries(saju.elementCount)
    .map(([el, n]) => `${el} ${n}`)
    .join(" / ");
  const lines = [
    `[사주판]`,
    `  - 연주: ${p.year.stem}${p.year.branch}`,
    `  - 월주: ${p.month.stem}${p.month.branch}`,
    `  - 일주: ${p.day.stem}${p.day.branch} ★ 일간 = ${saju.dayStem} (${saju.dayElement})`,
    `  - 시주: ${p.hour.stem}${p.hour.branch}${saju.input.hourKnown ? "" : " — 시간 모름, 참고용"}`,
    `  - 오행 분포: ${elementsLine}`,
    `  - 음양: 양 ${saju.yinYangCount.yang} / 음 ${saju.yinYangCount.yin}`,
    `  - 입력: ${saju.input.inputCalendar === "lunar" ? "음력" : "양력"}${saju.input.isLeapMonth ? " 윤달" : ""} / 성별 ${saju.input.gender}`,
  ];
  // 오늘의 일진 — daily 리포트에서 "오늘 들어온 두 글자" 설명에 필수로 사용
  if (saju.temporal) {
    const d = saju.temporal.day;
    lines.push(
      ``,
      `[오늘 들어온 두 글자 — 오늘의 일진]`,
      `  - 오늘의 일주: ${d.stem}${d.branch} (${d.hanja}) / 오행 ${d.element}`,
      `  - 이 두 글자가 위 사주의 일간(${saju.dayStem}, ${saju.dayElement})과 어떻게 어울리는지가 오늘 하루 기운의 핵심.`
    );
  }
  return lines.join("\n");
}

const TODAY_KR = () =>
  new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  });

const THIS_MONTH_KR = () =>
  new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Seoul",
  });

interface FortuneInput {
  saju?: SajuResult;
}

const SECTION_GUIDE: Record<FortuneType, string> = {
  daily: [
    `오늘 날짜: ${"{{TODAY}}"}`,
    ``,
    `위 사주판을 가진 사람의 **오늘 하루** 운세 리포트를 작성해줘.`,
    `이 리포트는 예외적으로 마크다운이 아니라 **아래 JSON 형식 하나만** 출력해. JSON 앞뒤에 설명·인사·코드펜스(\`\`\`) 붙이지 마. 오직 JSON 객체 하나만.`,
    ``,
    `{`,
    `  "stars": <오늘 종합운 1~5 정수. 오늘 일진(${"{{TODAY_PILLAR}}"})과 이 사람 일간의 조화를 정직하게 반영. 매일 4~5만 주지 말 것. 단, 1처럼 겁주는 점수는 지양(보통 2~5).>,`,
    `  "summary": "<오늘 하루를 한 줄로 요약한 따뜻한 총평. 25자 내외.>",`,
    `  "lucky": { "keyword": "<오늘 기운에서 끌어낸 키워드 한 단어>", "color": "<행운 색 이름, 예: 라벤더>", "time": "<좋은 시간대, 예: 오전>" },`,
    `  "intro": "<'오늘 들어온 두 글자'(${"{{TODAY_PILLAR}}"}) 풀이. 그 두 글자가 어떤 기운인지, 그리고 이 사람의 일간·사주와 만나 오늘 하루에 어떤 영향을 주는지 쉽게 풀어줘. 전문 용어는 친구가 알아듣게. 4~5문장.>",`,
    `  "sections": [`,
    `    { "key": "money",  "body": "<재물운. 4~5문장.>" },`,
    `    { "key": "work",   "body": "<직장·업무운. 4~5문장.>" },`,
    `    { "key": "love",   "body": "<애정·인간관계운. 4~5문장.>" },`,
    `    { "key": "health", "body": "<건강·멘탈운. 4~5문장.>" },`,
    `    { "key": "study",  "body": "<학업·공부·문서·이동·변동운. 4~5문장.>" }`,
    `  ],`,
    `  "balance": { "good": "<오늘 하면 좋은 일 한 줄>", "warn": "<오늘 주의할 점 한 줄. 겁주지 말고 따뜻한 대비로.>" },`,
    `  "note": "<별콩이의 한마디. 오늘 챙기면 좋을 따뜻한 응원 1~2문장.>"`,
    `}`,
    ``,
    `[규칙] 모든 문장은 반말 친구 말투. 단정("~할 거야") 금지, 흐름·가능성("~한 흐름이 보여","~해보면 좋아")으로. 각 도메인은 오늘 일진 기운과 연결해서 구체적으로. 좋기만 한 예언 금지 — 챙길 점도 자연스럽게. JSON 문자열 안에서 큰따옴표는 escape(\\")하고 줄바꿈은 넣지 마.`,
  ].join("\n"),
  monthly: [
    `이번 달: ${"{{THIS_MONTH}}"}`,
    ``,
    `위 사주판을 가진 사람의 **이번 한 달** 운세 리포트를 작성해줘.`,
    `이 리포트는 예외적으로 마크다운이 아니라 **아래 JSON 형식 하나만** 출력해. JSON 앞뒤에 설명·인사·코드펜스(\`\`\`) 붙이지 마. 오직 JSON 객체 하나만.`,
    ``,
    `{`,
    `  "stars": <이번 달 종합운 1~5 정수. 이번 달 월건(${"{{THIS_MONTH_PILLAR}}"})과 이 사람 일간의 조화를 정직하게 반영. 매번 4~5만 주지 말 것. 1처럼 겁주는 점수는 지양(보통 2~5).>,`,
    `  "theme": "<이번 달을 관통하는 테마 한 줄. 20자 내외. 예: '매듭을 정리하고 새 흐름을 여는 달'>",`,
    `  "summary": "<이번 달을 한 줄로 요약한 따뜻한 총평. 30자 내외.>",`,
    `  "lucky": { "keyword": "<이번 달 기운에서 끌어낸 키워드 한 단어>", "color": "<행운 색 이름, 예: 라벤더>" },`,
    `  "intro": "<이번 달 들어온 월건 두 글자(${"{{THIS_MONTH_PILLAR}}"}) 풀이. 그 두 글자가 어떤 기운인지, 이 사람의 일간·사주와 만나 이번 한 달에 어떤 흐름을 만드는지 쉽게 풀어줘. 전문 용어는 친구가 알아듣게. 5~6문장.>",`,
    `  "weekly": [`,
    `    { "week": 1, "body": "<이번 달 1주차(상순 초입) 흐름과 조언. 3문장.>" },`,
    `    { "week": 2, "body": "<2주차 흐름과 조언. 3문장.>" },`,
    `    { "week": 3, "body": "<3주차 흐름과 조언. 3문장.>" },`,
    `    { "week": 4, "body": "<4주차(하순 마무리) 흐름과 조언. 3문장.>" }`,
    `  ],`,
    `  "sections": [`,
    `    { "key": "money",  "body": "<이번 달 재물운. 5~6문장.>" },`,
    `    { "key": "work",   "body": "<이번 달 직장·업무운. 5~6문장.>" },`,
    `    { "key": "love",   "body": "<이번 달 애정·인간관계운. 5~6문장.>" },`,
    `    { "key": "health", "body": "<이번 달 건강·멘탈운. 5~6문장.>" },`,
    `    { "key": "study",  "body": "<이번 달 학업·공부·문서·이동·변동운. 5~6문장.>" }`,
    `  ],`,
    `  "timing": { "good": "<이번 달 흐름이 좋은 시기. 상순/중순/하순 같은 정성적 표현으로. 날짜 콕 집지 말 것. 2문장.>", "caution": "<조심하거나 점검하면 좋은 시기. 정성적. 2문장.>" },`,
    `  "balance": { "good": "<이번 달 하면 좋은 일 한 줄>", "warn": "<이번 달 주의할 점 한 줄. 겁주지 말고 따뜻한 대비로.>" },`,
    `  "note": "<별콩이의 한마디. 이번 달 챙기면 좋을 따뜻한 응원 2~3문장.>"`,
    `}`,
    ``,
    `[규칙] 모든 문장은 반말 친구 말투. 단정("~할 거야") 금지, 흐름·가능성("~한 흐름이 보여","~해보면 좋아")으로. 각 도메인·주차는 이번 달 월건 기운과 연결해서 구체적으로. 좋기만 한 예언 금지 — 챙길 점도 자연스럽게. JSON 문자열 안에서 큰따옴표는 escape(\\")하고 줄바꿈은 넣지 마.`,
  ].join("\n"),
  saju_full: [
    `기준 연도: 2026년 (병오년)`,
    ``,
    `위 사주판을 가진 사람의 **2026년 사주 분석** 리포트를 써줘. 타고난 사주를 바탕으로 2026년 한 해 흐름에 초점을 맞춰.`,
    `이건 한 해에 한 번 받는 깊이 있는 프리미엄 리포트야 — 각 섹션을 충분히 깊고 구체적으로 풀어줘. 각 섹션 최소 3~4문장 이상, 월별 흐름 섹션은 가장 길고 구체적으로. 짧게 끊지 말 것.`,
    `아래 섹션을 정확히 이 순서·제목으로:`,
    `## 타고난 기질  (일간·오행 기반 성격 — 2026년을 어떻게 살아갈 사람인지로 연결)`,
    `## 2026년 큰 흐름  (병오년 기운이 이 사주에 주는 한 해 전반 테마)`,
    `## 마음 · 관계  (2026년 사람·인연·감정 흐름)`,
    `## 일 · 재물  (2026년 적성·일·금전 흐름)`,
    `## 건강 · 컨디션  (2026년 체력·건강·생활 리듬에서 챙길 점)`,
    `## 2026년 월별 흐름  (1월부터 12월까지 시기별 흐름·조언 — 가장 길고 구체적으로)`,
    `## 별콩이의 한마디  (2026년 한 해 챙기면 좋을 따뜻한 조언)`,
  ].join("\n"),
  // Phase 1 미사용 (tarot/compat 는 추후 확장)
  tarot_oneshot: `타로 한 장 리딩 리포트를 써줘.`,
  compat: `두 사람 궁합 리포트를 써줘.`,
};

export function buildFortuneSystem(
  type: FortuneType,
  input: FortuneInput
): { staticPart: string; dynamicPart: string } {
  const parts: string[] = [];
  if (input.saju) parts.push(sajuBlock(input.saju));
  parts.push("");
  const todayPillar = input.saju?.temporal
    ? `${input.saju.temporal.day.stem}${input.saju.temporal.day.branch}`
    : "오늘의 일진";
  const thisMonthPillar = input.saju?.temporal
    ? `${input.saju.temporal.month.stem}${input.saju.temporal.month.branch}`
    : "이번 달 월건";
  parts.push(
    SECTION_GUIDE[type]
      .replace("{{TODAY}}", TODAY_KR())
      .replace("{{THIS_MONTH}}", THIS_MONTH_KR())
      .replace("{{TODAY_PILLAR}}", todayPillar)
      .replaceAll("{{THIS_MONTH_PILLAR}}", thisMonthPillar)
  );

  return {
    staticPart: getFortunePersona(),
    dynamicPart: parts.join("\n"),
  };
}

/** 리포트 생성 트리거용 첫 user 메시지 (내용은 형식적 — 실제 지시는 system) */
export const FORTUNE_KICKOFF = "내 운세 리포트 써줘.";
