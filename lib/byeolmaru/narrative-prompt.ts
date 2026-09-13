// lib/byeolmaru/narrative-prompt.ts — 별마루 개인화 서술 프롬프트 + 비자격자용 정적 티저.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SajuResult } from "@/lib/saju/calc";
import type { TarotCard } from "@/lib/tarot/cards";
import type { DayCell } from "./calendar.ts";
import type { DayGrade, AxisScores } from "./day-score.ts";
import type { PairDayCell, PairBackdrop } from "./pair-day.ts";
import { PAIR_TONE_LABEL } from "./pair-day.ts";
import { RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";
import { DAY_NAME } from "./day-label.ts";

// 정적 티저(시안 C 첫 줄) — 등급 tone 별. ⑥에서 개인화-forward 훅으로 리파인.
// 🔴 골격 문장(DayDetailCard, tone×relation)과 같은 화면에 인접하므로 "하루 읽기"를 복제하지
//    않는다. 티저는 그 위에서 "네 사주까지 겹치면 더 또렷해진다"고 개인화로 앞당기는 훅.
//    (PremiumBlock 이 이 줄 다음에 자리(slot)별 미끼 — BAIT[slot] 의 제목·칩·꼬리 — 를 붙인다.)
const TEASER_BY_TONE: Record<string, string> = {
  good: "오늘 이 순한 흐름, 네 사주에 겹쳐 보면 어디에 힘을 실으면 좋을지가 달라져.",
  normal: "무난한 오늘도 네 사주로 들여다보면 힘 실을 자리가 따로 보여.",
  caution: "오늘 챙길 결이 네 사주 어디를 건드리는지까지 보면 훨씬 또렷해져.",
};
export function buildTeaserLine(cell: DayCell): string {
  return TEASER_BY_TONE[cell.grade.tone] ?? TEASER_BY_TONE.normal;
}

// core 페르소나(단일 원천) — data/persona/byeolkong_core.md. 도메인 얹기는 fortune 패턴 참조.
function loadCore(): string {
  return readFileSync(path.join(process.cwd(), "data/persona/byeolkong_core.md"), "utf8");
}

// 사주판 요약 — lib/fortune/prompt.ts 의 sajuBlock 과 동일 필드 경로(pillars.*/dayStem/dayElement/
// input.hourKnown). SajuResult 최상위엔 day/year/month/hour 가 없다 — 전부 pillars 밑에 있고,
// 오행은 pillars 가 아니라 dayElement(일간 오행)에만 있다.
function formatPillars(saju: SajuResult): string {
  const p = saju.pillars;
  const hourPart = saju.input.hourKnown ? `${p.hour.stem}${p.hour.branch}` : "시간모름";
  return `일간 ${saju.dayStem}(${saju.dayElement}) · 사주 ${p.year.stem}${p.year.branch} ${p.month.stem}${p.month.branch} ${p.day.stem}${p.day.branch} ${hourPart}`;
}

export function buildNarrativeSystem(saju: SajuResult, cell: DayCell, todayGanji: string): string {
  return [
    loadCore(),
    "",
    "# 별마루 오늘 개인화",
    `너는 '${cell.date}' 하루를 이 사람의 사주로 풀어준다. 오늘 일진은 ${todayGanji}.`,
    `이 사람: ${formatPillars(saju)}. 오늘 등급 ${cell.grade.label}. 축(연애 ${cell.axes.love}·돈 ${cell.axes.money}·일 ${cell.axes.work}).`,
    // P5-1 이월 — 화면 위쪽엔 이미 하루 이름과 한 줄 요약이 떠 있다. 프롬프트가 그걸 모르면 유료
    // 서술이 같은 관계를 처음부터 다시 설명해(무료 요약과 중복) 돈 낸 사람이 같은 말을 두 번 읽는다.
    `화면엔 이미 오늘 이름 '${DAY_NAME[cell.tenGod]}'(${cell.tenGod})과 한 줄 요약이 떠 있다. 그 이름의 뜻을 다시 설명하지 말고, 그게 이 사람의 사주에 구체적으로 어떻게 떨어지는지부터 말해.`,
    "규칙: 3~4문단, 반말, 단정적 예언 금지(흐름·가능성·선택). 첫 문장은 사주 일간과 오늘 일진의 관계로 시작.",
    "마지막은 따뜻한 한 줄. 별표/제목/마커 없이 줄글만.",
  ].join("\n");
}

export const NARRATIVE_KICKOFF = "오늘 내 흐름 풀어줘.";
export const BYEOLMARU_NARRATIVE_MODEL = "gpt-5-nano"; // 원가 최소(daily 와 동일 정책)
export const NARRATIVE_MAX_TOKENS = 900;

// 우리 오늘 서술 — ②-a buildNarrativeSystem 미러(나 1인 → 나+상대 2인). loadCore/formatPillars 공용.
/** PairDayCell → "9월 12일(끌림·네가 리드)" 형식. 관계-타이밍(택일 보완①) 목록용. */
function formatPairGoodDay(c: PairDayCell, partnerName: string): string {
  const md = `${Number(c.date.slice(5, 7))}월 ${Number(c.date.slice(8, 10))}일`;
  const sig: string[] = [];
  if (c.tags.spark) sig.push("끌림");
  if (c.tags.bond) sig.push("결속");
  if (c.tags.lead === "me") sig.push("네가 리드");
  else if (c.tags.lead === "partner") sig.push(`${partnerName} 리드`);
  return sig.length ? `${md}(${sig.join("·")})` : md;
}

export function buildPairNarrativeSystem(
  self: SajuResult,
  partner: SajuResult,
  backdrop: PairBackdrop,
  cell: PairDayCell,
  todayGanji: string,
  partnerName: string,
  goodDays: PairDayCell[] = [],
  status?: RelationshipStatus | null
): string {
  const sig: string[] = [];
  if (cell.tags.spark) sig.push("끌림↑");
  if (cell.tags.bond) sig.push("결속");
  if (cell.tags.friction) sig.push("삐걱");
  if (cell.tags.lead === "me") sig.push("내가 리드");
  else if (cell.tags.lead === "partner") sig.push(`${partnerName}가 리드`);
  // 택일 보완①: 오늘 셀은 제외하고 앞으로의 좋은 날만(오늘 얘기는 본문이 하니까).
  const upcoming = goodDays.filter((c) => c.date !== cell.date);
  const goodList = upcoming.map((c) => formatPairGoodDay(c, partnerName)).join(", ");
  return [
    loadCore(),
    "",
    "# 별마루 우리 오늘",
    `너는 '${cell.date}' 하루, 이 사람과 상대('${partnerName}') 사이의 흐름을 사주로 풀어준다. 오늘 일진은 ${todayGanji}.`,
    `나: ${formatPillars(self)}.`,
    `${partnerName}: ${formatPillars(partner)}.`,
    `너희 결(고정): ${backdrop.labelAtoB} ↔ ${backdrop.labelBtoA}${backdrop.spark ? " · 끌림 있음" : ""}${backdrop.bond ? " · 결속 있음" : ""} · 연월조화 ${backdrop.harmony}.`,
    ...(status ? [`지금 둘은 ${RELATIONSHIP_STATUS_LABELS[status]} 사이 — 이 관계 결을 반영해서 말해.`] : []),
    `오늘 둘 사이 결 ${PAIR_TONE_LABEL[cell.tone]}${sig.length ? ` · 신호 ${sig.join("·")}` : ""}.`,
    // I-4 정정 — goodDays 는 호출부(route.ts)에서 이미 이번 달 말일까지로 클램프돼 들어온다.
    // "앞으로 30일"이라 하면 달력에 없는 다음 달 날짜까지 있는 것처럼 들려 문구를 이번 달 기준으로 바꾼다.
    ...(goodList ? [`이번 달 중 둘 사이 결이 특히 좋은 날: ${goodList}.`] : []),
    "규칙: 3~4문단, 반말, 단정적 예언 금지(흐름·가능성·선택). 첫 문장은 오늘 일진이 둘 사이를 어떻게 건드리는지로 시작. 한쪽을 탓하지 말고 둘의 흐름으로 말할 것." +
      (goodList
        ? " 마무리 즈음에 위 '좋은 날' 목록에서만 골라 1~2개를 관계 타이밍으로 자연스럽게 짚어줘(연락·만남 하기 좋은 결). '이 날 뭘 해라' 식 지시 대신 '이 무렵 결이 잘 맞아' 식 흐름으로. 목록 밖 날짜를 지어내지 마."
        : "") +
      " 마지막은 따뜻한 한 줄. 별표/제목/마커 없이 줄글만.",
  ].join("\n");
}

export const PAIR_NARRATIVE_KICKOFF = "오늘 우리 사이 흐름 풀어줘.";

// 오늘의 카드 서술(유료 리치) — 나 1인 + 오늘 뽑은 타로 1장 + 오늘 사주 흐름(등급·축).
// 무료 정적 taste(getCardTaste, ~350자 비개인화)와의 차별점 = 카드를 이 사람의 사주·오늘 축
// (애정/일)에 얹은 ~800자 개인화 서술. loadCore/formatPillars 공용, buildNarrativeSystem 미러.
export function buildCardNarrativeSystem(
  saju: SajuResult,
  card: TarotCard,
  reversed: boolean,
  todayGanji: string,
  grade: DayGrade,
  axes: AxisScores
): string {
  const orient = reversed ? "역위" : "정위";
  const kw = (reversed ? card.reversed : card.upright).join(", ");
  return [
    loadCore(), "",
    "# 별마루 오늘의 카드",
    `너는 이 사람이 오늘 뽑은 타로 한 장을, 그 사람의 사주와 오늘 흐름에 얹어 풀어준다. 오늘 일진은 ${todayGanji}.`,
    `카드: ${card.name_kr} (${orient}). 키워드: ${kw}.`,
    `이 사람: ${formatPillars(saju)}.`,
    `오늘 등급 ${grade.label}. 축(연애 ${axes.love}·일 ${axes.work}·돈 ${axes.money}).`,
    "분량: 700~900자, 하나로 흐르는 줄글.",
    "이 흐름으로 자연스럽게 이어서 써(각 부분을 라벨로 표시하지 마): 먼저 이 카드가 오늘 건네는 메시지를 네 사주 일간과 오늘 일진의 결로 열고, 이어서 오늘 애정·관계 흐름을 카드 결에 얹고, 그다음 오늘 일·전반 흐름을 오늘 등급과 함께 카드 결에 얹고, 마지막은 따뜻한 한마디로 맺어.",
    "규칙: 반드시 별콩이가 상대에게 직접 말하는 2인칭 '너'로(그 사람을 '이 사람'이라 3인칭으로 부르지 마). 반말, 단정적 예언 금지(흐름·가능성·선택). 첫 문장은 카드와 네 사주 일간·오늘 일진의 관계로 시작. 축 숫자나 '조언'·'메시지' 같은 낱말을 라벨처럼 앞세우지 말고 전부 흐름으로만 녹여. 별표/제목/번호/마커 없이 줄글만.",
  ].join("\n");
}
export const CARD_NARRATIVE_KICKOFF = "오늘 내 카드 풀어줘.";
// 카드 서술은 ~800자 리치라 나/우리 오늘(=900, ~600자)보다 훨씬 넉넉히 잡는다. nano 는 추론모델이라
// max 안에 추론+본문이 함께 카운트되고 추론량이 런마다 출렁인다 — 1800 에선 추론이 큰 런에서 본문이
// ~500자로 눌려 어절 중간 잘림이 실측됐다. daily(4500→~2,100자) 비율 + 추론 편차 헤드룸으로 3000.
// (미생성 토큰은 과금 안 됨 — 상한만 넉넉히, 실분량은 프롬프트의 700~900자 지침이 잡는다.)
export const CARD_NARRATIVE_MAX_TOKENS = 3000;
