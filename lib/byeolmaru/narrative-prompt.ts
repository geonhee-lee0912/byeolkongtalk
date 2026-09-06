// lib/byeolmaru/narrative-prompt.ts — 별마루 개인화 서술 프롬프트 + 비자격자용 정적 티저.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SajuResult } from "@/lib/saju/calc";
import type { TarotCard } from "@/lib/tarot/cards";
import type { DayCell } from "./calendar.ts";
import type { PairDayCell, PairBackdrop } from "./pair-day.ts";
import { PAIR_TONE_LABEL } from "./pair-day.ts";

// 정적 티저(시안 C 첫 줄) — 등급 tone 별. ⑥에서 개인화-forward 훅으로 리파인.
// 🔴 골격 문장(DayDetailCard, tone×relation)과 같은 화면에 인접하므로 "하루 읽기"를 복제하지
//    않는다. 티저는 그 위에서 "네 사주까지 겹치면 더 또렷해진다"고 개인화로 앞당기는 훅.
//    (PremiumBlock 이 이 줄 다음에 "이어서 별콩이가 네 월·시 기둥까지…" 블러를 잇는다.)
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
  goodDays: PairDayCell[] = []
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
    `오늘 둘 사이 결 ${PAIR_TONE_LABEL[cell.tone]}${sig.length ? ` · 신호 ${sig.join("·")}` : ""}.`,
    ...(goodList ? [`앞으로 30일 중 둘 사이 결이 특히 좋은 날: ${goodList}.`] : []),
    "규칙: 3~4문단, 반말, 단정적 예언 금지(흐름·가능성·선택). 첫 문장은 오늘 일진이 둘 사이를 어떻게 건드리는지로 시작. 한쪽을 탓하지 말고 둘의 흐름으로 말할 것." +
      (goodList
        ? " 마무리 즈음에 위 '좋은 날' 목록에서만 골라 1~2개를 관계 타이밍으로 자연스럽게 짚어줘(연락·만남 하기 좋은 결). '이 날 뭘 해라' 식 지시 대신 '이 무렵 결이 잘 맞아' 식 흐름으로. 목록 밖 날짜를 지어내지 마."
        : "") +
      " 마지막은 따뜻한 한 줄. 별표/제목/마커 없이 줄글만.",
  ].join("\n");
}

export const PAIR_NARRATIVE_KICKOFF = "오늘 우리 사이 흐름 풀어줘.";

// 오늘의 카드 서술 — 나 1인 + 오늘 뽑은 타로 1장. loadCore/formatPillars 공용.
export function buildCardNarrativeSystem(saju: SajuResult, card: TarotCard, reversed: boolean, todayGanji: string): string {
  const orient = reversed ? "역위" : "정위";
  const kw = (reversed ? card.reversed : card.upright).join(", ");
  return [
    loadCore(), "",
    "# 별마루 오늘의 카드",
    `너는 이 사람이 오늘 뽑은 타로 한 장을 그 사람의 사주로 풀어준다. 오늘 일진은 ${todayGanji}.`,
    `카드: ${card.name_kr} (${orient}). 키워드: ${kw}.`,
    `이 사람: ${formatPillars(saju)}.`,
    "규칙: 2~3문단, 반말, 단정적 예언 금지(흐름·가능성·선택). 카드 의미를 오늘 이 사람의 흐름에 얹어. 마지막은 따뜻한 한 줄. 별표/제목/마커 없이 줄글만.",
  ].join("\n");
}
export const CARD_NARRATIVE_KICKOFF = "오늘 내 카드 풀어줘.";
