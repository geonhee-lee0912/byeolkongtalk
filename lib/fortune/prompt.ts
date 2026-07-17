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

function sajuBlock(saju: SajuResult, heading = "사주판"): string {
  const p = saju.pillars;
  const elementsLine = Object.entries(saju.elementCount)
    .map(([el, n]) => `${el} ${n}`)
    .join(" / ");
  const lines = [
    `[${heading}]`,
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
    // good_days 리포트 전용 — 세운/월운 + 향후 30일 일진. 이 목록 밖 날짜·간지는 절대 지어내지 말 것.
    if (saju.temporal.dailyLuck?.length) {
      const ty = saju.temporal.year;
      const tm = saju.temporal.month;
      lines.push(
        ``,
        `[지금 흐름의 근거 — 세운·월운]`,
        `  - 올해 세운: ${ty.stem}${ty.branch} (${ty.hanja}) / 오행 ${ty.element}`,
        `  - 이번 달 월운: ${tm.stem}${tm.branch} (${tm.hanja}) / 오행 ${tm.element}`,
        ``,
        `[향후 30일 일진] (good_days 리포트는 이 목록에서만 날짜를 골라 추천 — 목록 밖 날짜·간지 지어내기 금지)`
      );
      for (const dl of saju.temporal.dailyLuck) {
        lines.push(`  - ${dl.date}: ${dl.stem}${dl.branch} / 오행 ${dl.element}`);
      }
    }
  }
  return lines.join("\n");
}

function tarotBlock(cards: TarotDrawnForPrompt[]): string {
  const lines = cards.map((c, i) => {
    const kw =
      c.direction === "upright"
        ? c.uprightKeywords.join(", ")
        : c.reversedKeywords.join(", ");
    const dirKr = c.direction === "upright" ? "정방향" : "역방향";
    return `${i + 1}. [${c.position}] ${c.cardName} (${dirKr}) — 키워드: ${kw}`;
  });
  return [
    "## 뽑힌 타로 카드",
    "아래는 사용자가 직접 뽑은 카드다. position/cardName/direction은 그대로 echo 하고, reading만 새로 작성해라.",
    ...lines,
  ].join("\n");
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

export interface TarotDrawnForPrompt {
  position: string;
  cardName: string;
  direction: "upright" | "reversed";
  uprightKeywords: string[];
  reversedKeywords: string[];
}

interface FortuneInput {
  saju?: SajuResult;
  sajuB?: SajuResult;
  names?: { a: string; b: string };
  tarotCards?: TarotDrawnForPrompt[];
}

function tarotGuide(opts: { domainLabel: string; oneCard?: boolean }): string {
  const { domainLabel, oneCard } = opts;
  const cardsNote = oneCard
    ? "카드는 1장이다. reading은 3~5문장으로 따뜻하게."
    : "카드는 3장이다. 각 카드 reading은 5~6줄(문장 5~6개) 분량으로, 포지션의 의미를 충분히 살려서 풍부하게.";
  const lengthNote = oneCard
    ? "summary와 advice는 각각 2~3문장으로 짧게."
    : "summary는 세 카드를 엮은 종합 해석으로, 각 5~6문장짜리 2개 문단으로 작성하고 두 문단 사이는 빈 줄(\\n\\n)로 구분해라. advice는 3~5문장의 구체적 행동 제안.";
  return [
    `너는 별콩이야. ${domainLabel} 주제로 타로 리포트를 JSON으로만 출력해라.`,
    "마크다운/설명/코드펜스 없이 순수 JSON 객체 하나만 출력해라.",
    cardsNote,
    lengthNote,
    "스키마:",
    `{
  "headline": "한 줄 요약 (15자 내외)",
  "cards": [
    { "position": "주입된 position 그대로", "cardName": "주입된 cardName 그대로", "direction": "upright|reversed (주입값 그대로)", "reading": "이 카드 해석" }
  ],
  "summary": "전체 종합 해석",
  "advice": "구체적인 조언"
}`,
    "cards 배열 길이와 순서는 주입된 '뽑힌 타로 카드'와 정확히 일치시켜라.",
    "필수: headline, cards, summary, advice 네 필드를 모두 포함해라. 특히 advice(구체적 조언) 필드는 자주 빠뜨리기 쉬우니 절대 생략하지 말고 마지막에 반드시 넣어라.",
    "JSON 문자열 안에서 큰따옴표는 escape(\\\")해라. 문단 구분이 필요하면 실제 줄바꿈(엔터)을 넣지 말고 반드시 \\n 두 글자로 써라.",
  ].join("\n");
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
    `기준 연도: 2026년 (병오년 / 丙午)`,
    ``,
    `위 사주판을 가진 사람의 **2026년 사주 분석** 리포트를 작성해줘. 타고난 사주를 바탕으로 2026년 한 해 흐름에 초점을 맞춰.`,
    `이건 1년에 한 번 받는 깊이 있는 프리미엄 리포트야 — 각 항목을 충분히 깊고 구체적으로. 짧게 끊지 말 것.`,
    `이 리포트는 예외적으로 마크다운이 아니라 **아래 JSON 형식 하나만** 출력해. JSON 앞뒤에 설명·인사·코드펜스(\`\`\`) 붙이지 마. 오직 JSON 객체 하나만.`,
    ``,
    `{`,
    `  "theme": "<2026년을 관통하는 테마 한 줄. 20자 내외. 예: '단단히 뿌리내리고 뻗어나가는 해'>",`,
    `  "summary": "<2026 병오년이 이 사주에 주는 핵심 메시지. 큰 그림을 그려주는 따뜻한 요약. 3~4문장.>",`,
    `  "lucky": {`,
    `    "color": "<행운 색 이름, 예: 라벤더>",`,
    `    "direction": "<행운 방향, 예: 동쪽>",`,
    `    "months": "<2026년 행운의 달, 예: '3월 · 8월'>",`,
    `    "keyword": "<2026년 키워드 한 단어, 예: 연결>"`,
    `  },`,
    `  "self": {`,
    `    "nature": "<일간·오행 기반 타고난 기질·성격. 4~5문장.>",`,
    `    "strength": "<강점·빛나는 재능. 4~5문장.>",`,
    `    "caution": "<조심할 성향·보완점. 따뜻한 자기이해 톤. 4~5문장.>",`,
    `    "balance": {`,
    `      "lack": "<오행 밸런스 진단. 어떤 기운이 강하고 부족한지, 보완하면 어떤 점이 좋은지. 3~4문장.>",`,
    `      "supplements": ["<보완 키워드 2~4개. 예: 붉은 계열>", "<예: 남쪽>", "<예: 햇빛 산책>"]`,
    `    },`,
    `    "aptitude": "<타고난 적성·어울리는 일. 기질 기반 커리어 방향. 4~5문장.>"`,
    `  },`,
    `  "year": {`,
    `    "flow": "<2026년 큰 흐름·테마. 병오년 기운이 이 사주에 주는 한 해 전반. 가장 긴 도입 서술. 5~6문장.>",`,
    `    "mind": "<2026년 마음·감정 흐름. 4~5문장.>",`,
    `    "love": "<2026년 사랑·인연. 4~5문장.>",`,
    `    "relationship": "<2026년 인간관계·사회. 4~5문장.>",`,
    `    "career": "<2026년 일·커리어. 4~5문장.>",`,
    `    "wealth": "<2026년 재물·금전. 4~5문장.>",`,
    `    "health": "<2026년 건강·컨디션. 4~5문장.>"`,
    `  },`,
    `  "monthly": [`,
    `    { "month": 1,  "body": "<1월 흐름·조언. 2~3문장.>" },`,
    `    { "month": 2,  "body": "<2월. 2~3문장.>" },`,
    `    { "month": 3,  "body": "<3월. 2~3문장.>" },`,
    `    { "month": 4,  "body": "<4월. 2~3문장.>" },`,
    `    { "month": 5,  "body": "<5월. 2~3문장.>" },`,
    `    { "month": 6,  "body": "<6월. 2~3문장.>" },`,
    `    { "month": 7,  "body": "<7월. 2~3문장.>" },`,
    `    { "month": 8,  "body": "<8월. 2~3문장.>" },`,
    `    { "month": 9,  "body": "<9월. 2~3문장.>" },`,
    `    { "month": 10, "body": "<10월. 2~3문장.>" },`,
    `    { "month": 11, "body": "<11월. 2~3문장.>" },`,
    `    { "month": 12, "body": "<12월. 2~3문장.>" }`,
    `  ],`,
    `  "timing": { "good": "<2026년 흐름이 좋은 달, 예: '4 · 9 · 11월'>", "caution": "<점검하면 좋은 달, 예: '6 · 7월'>" },`,
    `  "actions": ["<올해 이것만은 — 실천 1>", "<실천 2>", "<실천 3>"],`,
    `  "note": "<별콩이의 한마디. 2026 한 해 챙기면 좋을 따뜻한 응원 2~3문장.>"`,
    `}`,
    ``,
    `[규칙] 모든 문장은 반말 친구 말투. 단정("~할 거야") 금지, 흐름·가능성("~한 흐름이 보여","~해보면 좋아")으로. 좋기만 한 예언 금지 — 챙길 점도 자연스럽게. monthly 는 1~12월 전부, actions 는 정확히 3개. JSON 문자열 안에서 큰따옴표는 escape(\\")하고 줄바꿈은 넣지 마.`,
  ].join("\n"),
  good_days: [
    `오늘 날짜: ${"{{TODAY}}"}`,
    ``,
    `위 사주판을 가진 사람을 위한 **좋은 날 리포트**를 작성해줘. 앞으로 30일 동안 언제가 좋고 언제를 조심하면 좋을지 짚어주는 리포트야.`,
    `이 리포트는 JSON이 아니라 **마크다운**으로 작성해. 아래 순서대로 \`## 제목\` 헤딩으로 섹션을 나눠서 써. 헤딩·문장 외에 코드펜스는 쓰지 마.`,
    ``,
    `## 지금 흐름`,
    `이 사람의 일간·오행과 지금 세운·월운이 만나 만드는 요즘 기운을 3~4문장으로 짚어줘. 팔자 요약이 이 섹션의 핵심.`,
    ``,
    `## 좋은 날`,
    `위 [향후 30일 일진] 목록에서만 골라 이 사람에게 좋은 날 3~5개를 뽑아줘. 날짜마다 "OO월 OO일 — 그날 일진 두 글자가 왜 이 사람에게 좋은지"를 한두 문장으로. 목록 밖 날짜·간지는 절대 지어내지 마.`,
    ``,
    `## 조심할 날`,
    `같은 목록에서 조심하면 좋을 날 1~2개를 뽑아줘. 겁주는 톤 대신 "이날은 이런 걸 살짝 챙기면 좋아" 식으로 따뜻하게. 날짜마다 이유 한두 문장.`,
    ``,
    `## 별콩이의 한마디`,
    `이 사람에게 건네는 따뜻한 응원 2~3문장으로 마무리.`,
    ``,
    `[규칙] 모든 문장은 반말 친구 말투. 단정("~한다","~될 거야") 금지, 흐름·가능성("~한 흐름이 보여","~해보면 좋아")으로. 날짜는 반드시 [향후 30일 일진] 목록 안에서만 고르고, 목록에 없는 날짜·간지를 지어내지 마. 좋기만 한 예언 금지 — 조심할 날도 자연스럽게. 마크다운 헤딩(##) 외에 별표(**)나 코드펜스는 쓰지 마.`,
  ].join("\n"),
  tarot_daily: tarotGuide({ domainLabel: "오늘의 운세", oneCard: true }),
  tarot_love: tarotGuide({ domainLabel: "연애운" }),
  tarot_money: tarotGuide({ domainLabel: "금전운" }),
  tarot_career: tarotGuide({ domainLabel: "직장·진로" }),
  tarot_relation: tarotGuide({ domainLabel: "인간관계" }),
  compat: [
    `위 두 사람의 사주판을 바탕으로 **연애·결혼 궁합** 리포트를 작성해줘. 두 일간·오행이 만나 만드는 관계의 흐름이 핵심이야.`,
    `이 리포트는 예외적으로 마크다운이 아니라 **아래 JSON 형식 하나만** 출력해. JSON 앞뒤에 설명·인사·코드펜스(\`\`\`) 붙이지 마. 오직 JSON 객체 하나만.`,
    ``,
    `{`,
    `  "grade": "<천생연분 | 찰떡궁합 | 좋은 인연 | 서로 배우는 인연 | 노력이 필요한 인연 중 정확히 하나. 두 사주 조화를 정직하게 반영하되 낮은 등급도 겁주는 톤은 지양.>",`,
    `  "theme": "<두 사람 관계를 관통하는 한 줄 테마. 20자 내외.>",`,
    `  "summary": "<두 일간·오행이 만나 만드는 관계의 큰 그림. 따뜻한 핵심 요약. 3~4문장.>",`,
    `  "chemistry": "<오행 케미: 첫 번째 사람 일간과 두 번째 사람 일간(및 두 사주 오행)이 상생인지 상극인지, 그게 관계에 어떻게 작용하는지 쉽게 풀이. 5~6문장.>",`,
    `  "attraction": "<끌림·성격 케미: 서로 왜 끌리고 어떤 점이 잘 맞는지. 4~5문장.>",`,
    `  "conflict": "<갈등 포인트: 부딪히기 쉬운 지점·온도차. 겁주지 말고 '이럴 땐 이렇게 이해하면 좋아' 톤. 4~5문장.>",`,
    `  "longterm": "<장기 전망: 시간이 지나며 관계가 어떻게 흐를지, 결혼·장기 관점. 4~5문장.>",`,
    `  "advice": ["<관계를 위한 실천 1>", "<실천 2>", "<실천 3>"],`,
    `  "note": "<별콩이의 한마디. 두 사람에게 건네는 따뜻한 응원 2~3문장.>"`,
    `}`,
    ``,
    `[규칙] 모든 문장은 반말 친구 말투. 단정("~할 거야") 금지, 흐름·가능성("~한 흐름이 보여","~해보면 좋아")으로. 좋기만 한 예언 금지 — 챙길 점도 자연스럽게. advice 는 정확히 3개. grade 는 위 5개 enum 중 하나로만. JSON 문자열 안에서 큰따옴표는 escape(\\")하고 줄바꿈은 넣지 마.`,
  ].join("\n"),
  compat_social: [
    `위 두 사람의 사주판을 바탕으로 **인간 관계 궁합**(친구·가족·동료 등 연애가 아닌 관계) 리포트를 작성해줘. 두 일간·오행이 만나 만드는 관계의 결이 핵심이야. 연애·결혼·이성적 끌림 얘기는 하지 마.`,
    `이 리포트는 예외적으로 마크다운이 아니라 **아래 JSON 형식 하나만** 출력해. JSON 앞뒤에 설명·인사·코드펜스(\`\`\`) 붙이지 마. 오직 JSON 객체 하나만.`,
    ``,
    `{`,
    `  "grade": "<환상의 케미 | 든든한 사이 | 잘 맞는 사이 | 노력하면 좋은 사이 | 서로 다른 결 중 정확히 하나. 두 사주 조화를 정직하게 반영하되 낮은 등급도 겁주는 톤은 지양.>",`,
    `  "theme": "<두 사람 관계를 관통하는 한 줄 테마. 20자 내외.>",`,
    `  "summary": "<두 일간·오행이 만나 만드는 관계의 큰 그림. 따뜻한 핵심 요약. 3~4문장.>",`,
    `  "chemistry": "<오행 케미: 첫 번째 사람 일간과 두 번째 사람 일간(및 두 사주 오행)이 상생인지 상극인지, 그게 관계에 어떻게 작용하는지 쉽게 풀이. 5~6문장.>",`,
    `  "attraction": "<성향 케미: 두 사람 성격·태도가 어떻게 맞물리고 어떤 점에서 잘 통하는지. 4~5문장.>",`,
    `  "conflict": "<부딪히는 지점: 의견·온도차로 어긋나기 쉬운 부분. 겁주지 말고 '이럴 땐 이렇게 이해하면 좋아' 톤. 4~5문장.>",`,
    `  "longterm": "<관계의 미래: 시간이 지나며 이 관계가 어떻게 흐를지, 오래 잘 지내려면. 4~5문장.>",`,
    `  "advice": ["<관계를 위한 실천 1>", "<실천 2>", "<실천 3>"],`,
    `  "note": "<별콩이의 한마디. 두 사람에게 건네는 따뜻한 응원 2~3문장.>"`,
    `}`,
    ``,
    `[규칙] 모든 문장은 반말 친구 말투. 단정("~할 거야") 금지, 흐름·가능성("~한 흐름이 보여","~해보면 좋아")으로. 좋기만 한 예언 금지 — 챙길 점도 자연스럽게. advice 는 정확히 3개. grade 는 위 5개 enum 중 하나로만. 연애·이성 관계 표현 금지. JSON 문자열 안에서 큰따옴표는 escape(\\")하고 줄바꿈은 넣지 마.`,
  ].join("\n"),
};

export function buildFortuneSystem(
  type: FortuneType,
  input: FortuneInput
): { staticPart: string; dynamicPart: string } {
  const parts: string[] = [];
  if ((type === "compat" || type === "compat_social") && input.saju && input.sajuB) {
    const nameA = input.names?.a ?? "첫 번째 사람";
    const nameB = input.names?.b ?? "두 번째 사람";
    parts.push(sajuBlock(input.saju, `첫 번째 사람 사주판 — ${nameA}`));
    parts.push("");
    parts.push(sajuBlock(input.sajuB, `두 번째 사람 사주판 — ${nameB}`));
    parts.push("");
    parts.push("위 두 사람의 일간이 만났을 때 만들어지는 관계가 이 리포트의 핵심이야.");
  } else if (input.saju) {
    parts.push(sajuBlock(input.saju));
  } else if (input.tarotCards) {
    parts.push(tarotBlock(input.tarotCards));
  }
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
