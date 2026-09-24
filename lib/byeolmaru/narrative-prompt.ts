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
import type { CardGauge } from "./card-gauge.ts";
import { CARD_REPORT_BLOCKS } from "./card-report.ts";
import type { CardReportBlockKey } from "./card-report.ts";
import { FORTUNE_REPORT_MODEL } from "@/lib/fortune/model";
import { PAIR_REPORT_BLOCKS, type PairReportBlockKey } from "./pair-report.ts";

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
export const BYEOLMARU_NARRATIVE_MODEL = "gpt-5-nano"; // 원가 최소 — 나/우리 오늘 서술 전용. daily 리포트·카드 리포트(luna)와는 별개 정책(P6-2)
export const NARRATIVE_MAX_TOKENS = 900;

// 우리 오늘 서술 — ②-a buildNarrativeSystem 미러(나 1인 → 나+상대 2인). loadCore/formatPillars 공용.
/** PairDayCell → "9월 12일(설렘·네가 리드)" 형식. 관계-타이밍(택일 보완①) 목록용. */
function formatPairGoodDay(c: PairDayCell, partnerName: string): string {
  const md = `${Number(c.date.slice(5, 7))}월 ${Number(c.date.slice(8, 10))}일`;
  const sig: string[] = [];
  if (c.tags.spark) sig.push("설렘");
  if (c.tags.bond) sig.push("척척");
  if (c.tags.lead === "me") sig.push("네가 리드");
  else if (c.tags.lead === "partner") sig.push(`${partnerName} 리드`);
  return sig.length ? `${md}(${sig.join("·")})` : md;
}

// card-report 의 blockSentences 와 같은 이유로 .find() 헬퍼다 — Record 캐스트를 쓰면 오타 키가
// 컴파일을 통과해 런타임 undefined 로만 걸린다.
function pairBlockSentences(key: PairReportBlockKey): number {
  return PAIR_REPORT_BLOCKS.find((x) => x.key === key)!.sentences;
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
  if (cell.tags.spark) sig.push("설렘↑");
  if (cell.tags.bond) sig.push("척척");
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
    `너희 결(고정): ${backdrop.labelAtoB} ↔ ${backdrop.labelBtoA}${backdrop.spark ? " · 설렘 있음" : ""}${backdrop.bond ? " · 척척 있음" : ""} · 연월조화 ${backdrop.harmony}.`,
    ...(status ? [`지금 둘은 ${RELATIONSHIP_STATUS_LABELS[status]} 사이 — 이 관계 결을 반영해서 말해.`] : []),
    // 사실 제약(목록 밖 날짜 금지와 같은 계열) — sig 는 spark/bond/friction/lead 4개를 전부
    // 담는 배열이라 length===0 인 날(30일 중 11일 실측)이 흔하다. 그날은 "여기 적힌 게 전부야"
    // 문장이 가리킬 대상이 없어 어색해지므로, 두 갈래 다 사실 제약을 명시한다(분기는 기존 삼항 그대로).
    `오늘 둘 사이 결 ${PAIR_TONE_LABEL[cell.tone]}${
      sig.length
        ? ` · 신호 ${sig.join("·")}. 여기 적힌 게 오늘 켜진 신호 전부야 — 없는 신호를 만들지 말고, 리드 방향도 적힌 그대로 써.`
        : ". 오늘은 설렘·척척·삐걱·리드 중 켜진 신호가 하나도 없어 — 지어내지 마."
    }`,
    // I-4 정정 — goodDays 는 호출부(route.ts)에서 이미 이번 달 말일까지로 클램프돼 들어온다.
    // "앞으로 30일"이라 하면 달력에 없는 다음 달 날짜까지 있는 것처럼 들려 문구를 이번 달 기준으로 바꾼다.
    ...(goodList ? [`이번 달 중 둘 사이 결이 특히 좋은 날: ${goodList}.`] : []),
    "",
    // 🔴 자유 줄글 → 5블록 JSON(2026-09-24). 블록 경계는 **구 프롬프트가 이미 시키던 순서**
    //    ("일진이 건드리는 지점 → 신호가 나타날 장면 → 고정된 결 → 따뜻한 마무리")를 그대로 쓴 것이라
    //    내용이 달라지지 않는다. 바뀐 건 형식뿐이고, 그 이유는 PaywallCut 절단선이 블러 위에 얹을
    //    섹션 이름을 요구하기 때문이다(lib/byeolmaru/pair-report.ts 머리 주석).
    "출력은 **아래 JSON 하나만**. 앞뒤 설명·코드펜스 금지.",
    "{",
    `  "today": "<🌙 오늘 둘 사이. 오늘 일진 ${todayGanji}이 너희 사이 어디를 건드리는지 — 받쳐주는 지점·걸리는 지점을 근거로. ${pairBlockSentences("today")}문장.>",`,
    `  "scene": "<💗 오늘 벌어질 장면. 위에 적힌 오늘 신호가 실제 하루에서 어떤 장면으로 나타날지 구체적으로 1~2개, 그때 건넬 말·태도까지. ${pairBlockSentences("scene")}문장.>",`,
    `  "grain": "<🧭 너희 고정된 결. 십신 관계·연월조화가 오늘과 겹쳐 어디를 편하게 하고 어디를 걸리게 하는지(오늘 신호가 아니라 **늘 그런 결** 쪽 재료로, 위 두 블록과 겹치지 않게). ${pairBlockSentences("grain")}문장.>",`,
    goodList
      ? `  "timing": "<✨ 둘 사이 타이밍. 위 '좋은 날' 목록에서만 골라 1~2개를 관계 타이밍으로 짚어줘(연락·만남 하기 좋은 결). '이 날 뭘 해라' 식 지시 대신 '이 무렵 결이 잘 맞아' 식 흐름으로. **목록 밖 날짜를 지어내지 마.** ${pairBlockSentences("timing")}문장.>",`
      : `  "timing": "<✨ 둘 사이 타이밍. 이번 달 남은 날 중 특별히 결이 튀는 날은 없어 — **날짜를 지어내지 말고**, 대신 둘 사이가 어떤 리듬일 때 잘 맞는지(어떤 상황·어떤 간격)로 풀어줘. ${pairBlockSentences("timing")}문장.>",`,
    `  "note": "<따뜻한 마무리 ${pairBlockSentences("note")}문장. 제목·머리말('별콩이의 한마디:' 같은 라벨) 없이 본문 문장으로 바로 시작하되, 첫 구절은 다른 블록처럼 굵게.>"`,
    "}",
    "",
    "[규칙] 반말, 단정적 예언 금지(흐름·가능성·선택). 한쪽을 탓하지 말고 둘의 흐름으로 말할 것. 블록마다 **다른 재료**를 써 — 같은 말을 바꿔 쓰며 늘리지 말고 장면과 예시로 채워. 위에 준 신호 낱말을 라벨처럼 앞세우지 말 것. '마무리로'·'정리하면'처럼 글의 구조를 설명하는 말로 블록을 열지 말고 바로 내용으로 들어갈 것. 문장 수는 위에 적은 대로 지켜.",
    "[서식] 각 블록은 **첫 구절(핵심 어구 하나)만 굵게** — 블록당 정확히 1개, 그 외 굵게 금지. 그와 별개로, 블록 본문 중간의 짚고 갈 어구 하나(3~12자)를 `==이렇게==` 로 감싸 하이라이트해 — 블록당 최대 1개, 굵게 한 첫 구절과는 다른 자리에. 딱히 짚을 게 없으면 생략해. 관련된 2~4문장을 한 문단으로 묶고 문단 사이에만 빈 줄(\\n\\n). 불릿·콜아웃·제목·번호 금지. JSON 문자열 안 큰따옴표는 escape(\\\")하고, 줄바꿈은 반드시 \\n 으로 이스케이프(생 줄바꿈 금지).",
  ].join("\n");
}

export const PAIR_NARRATIVE_KICKOFF = "오늘 우리 사이 흐름 풀어줘.";

/** 우리 오늘 유료 리포트 모델 — 사주 daily·오늘 타로와 같은 luna(2026-09-24).
 *
 * 🔴 **왜 nano 에서 올렸나 — 실측 근거.** 같은 서식 지시("각 블록 첫 구절만 굵게")를 두고
 *    luna 인 오늘 사주는 볼드 8개에 반말을 지켰는데, nano 인 우리 오늘은 **볼드 0개 + 존댓말 혼입**
 *    ("있어요"·"작동합니다"·"주세요"·"당신")이었다. 5블록 JSON 으로 바꾸면서 모델이 '리포트 작성'
 *    레지스터로 넘어갔고 nano 가 그걸 못 눌렀다. 프롬프트를 더 세게 쓰는 대신 모델을 맞췄다.
 * 🔴 원가: 입력 4배·출력 3배($0.05/0.4 → $0.2/1.2 per 1M)지만 실액은 생성당 ₩0.7→₩2.3,
 *    구독자 1명 30일 +₩48 수준이다(메모리 실측 "nano 전체가 매출의 4%" 대비 감당 가능).
 * 🔴 `BYEOLMARU_NARRATIVE_MODEL`(nano)은 **나 1인 서술 전용으로 남는다** — 그쪽은 자유 줄글
 *    ~600자라 레지스터가 안 흔들렸다. 둘을 다시 한 상수로 합치지 말 것(용도가 갈렸다). */
export const PAIR_REPORT_MODEL = FORTUNE_REPORT_MODEL;

// 우리 오늘은 P5-5 에서 ~600자 → ~1,200자로 커졌고, 2026-09-24 에 5블록 JSON(1,300자)이 됐다.
// 추론 토큰이 max 안에 함께 카운트되고 런마다 출렁이므로 본문 1,300자(한글 ≈1.8자/토큰 → ≈720토큰)에
// JSON 키·escape 오버헤드와 추론 헤드룸을 얹는다. 카드 리포트(1,800자 → 6000)보다 작은 값이다.
// 미생성 토큰은 과금되지 않는다 — 상한만 넉넉히, 실분량은 블록별 문장 예산이 잡는다.
export const PAIR_NARRATIVE_MAX_TOKENS = 4000;

// ── 오늘 타로 7블록 리포트(유료) — P6-2 ────────────────────────────────────────────────────
// 스펙 2026-09-19 §6-2(7블록·1,800자) §6-3(게이지 정합) §6-4(역할분리) §6-5(볼드 1개).
// 무료(정적 taste ~389자)는 "그 카드가 어떤 카드인지"를 이미 말했다. 유료는 "네 사주·오늘 일진의 어디에
// 떨어지는지"만 말한다 — 같은 카드 한 장을 둘 다 읽으니 의미 중복을 완전히 피하긴 어렵고(실측 §6-4),
// 그래서 무료 원문을 프롬프트에 넣어 "이건 이미 말했다"를 모델이 보게 한다(buildNarrativeSystem 의 DAY_NAME 장치와 같은 원리).

export interface CardReportPromptInput {
  saju: SajuResult;
  card: TarotCard;
  reversed: boolean;
  /** 오늘 일진 한글(예: "병신"). */
  todayGanji: string;
  /** KST 오늘(YYYY-MM-DD). 카드는 오늘만 뽑히므로 대상 날짜 = 오늘. */
  todayKst: string;
  grade: DayGrade;
  axes: AxisScores;
  /** 사주 축 위 카드 보정(card-gauge.ts). 본문이 게이지와 어긋나지 않게 말로 풀어 넣는다. */
  gauge: CardGauge;
  /** 화면에 이미 떠 있는 무료 정적 taste 원문(getCardTaste). 뱅크 미스면 null. */
  freeTaste: string | null;
}

const AXIS_KR: Record<"love" | "money" | "work", string> = { love: "연애", money: "돈", work: "일" };

const GAUGE_AXES = ["love", "money", "work"] as const;

/** 게이지 보정 → 말. "연애 축을 살짝 밀어올려" / "일 축을 살짝 눌러". 0 인 축은 언급하지 않는다.
 *  세 축이 전부 같은 방향(all-도메인 메이저 — card-gauge.ts ALL_DELTA)이면 "연애 축을 살짝
 *  밀어올려, 돈 축을 살짝 밀어올려, 일 축을 살짝 밀어올려"처럼 같은 구절이 3연 반복되므로
 *  그 경우만 한 문장으로 묶는다. 단일 축·0(무변화) 케이스는 그대로 둔다. */
function gaugeLine(g: CardGauge): string {
  const deltas = GAUGE_AXES.map((k) => g[k].delta);
  if (deltas.every((d) => d > 0) || deltas.every((d) => d < 0)) {
    const dir = deltas[0] > 0 ? "살짝 밀어올려" : "살짝 눌러";
    return `이 카드는 오늘 사주 위에서 세 축 모두 ${dir}. 폭은 작다 — 카드가 하루를 뒤집진 않는다.`;
  }
  const parts: string[] = [];
  for (const k of GAUGE_AXES) {
    const d = g[k].delta;
    if (d > 0) parts.push(`${AXIS_KR[k]} 축을 살짝 밀어올려`);
    else if (d < 0) parts.push(`${AXIS_KR[k]} 축을 살짝 눌러`);
  }
  return parts.length ? `이 카드는 오늘 사주 위에서 ${parts.join(", ")}. 폭은 작다 — 카드가 하루를 뒤집진 않는다.` : "이 카드는 오늘 축을 크게 건드리지 않는다.";
}

// CARD_REPORT_BLOCKS(card-report.ts) → key 별 문장 예산 lookup. 플랜 원안 Object.fromEntries(...) as
// Record<string,{sentences:number}> 는 tsc 는 통과하지만(Object.fromEntries 가 오버로드
// `{ [k: string]: CardReportBlockMeta }` 로 해석되고 — any 가 아니다, TS 컴파일러로 실측 —, as 는
// 그 인덱스 시그니처를 값 폭이 겹치는 Record<string,{sentences:number}> 로 좁히는 것뿐이라 캐스트가
// 통과한다), Record 의 키를 string 으로 두면 b.pace 같은 오타도 그대로 타입을 통과해 런타임 undefined
// 로만 걸린다. 대신 인자를
// CardReportBlockKey 로 좁힌 Record 를 시도했더니(더 안전해 보였지만) "인덱스 시그니처 → 특정 리터럴
// 키" 방향은 단일 as 캐스트가 안 먹혀 tsc 가 실제로 에러를 냈다(요구: as unknown as ... 이중 캐스트) —
// 캐스트를 늘리는 대신, 캐스트가 아예 없는 .find() 헬퍼로 바꿔 오타를 컴파일 타임에 잡는다.
function blockSentences(key: CardReportBlockKey): number {
  return CARD_REPORT_BLOCKS.find((x) => x.key === key)!.sentences;
}

export function buildCardReportSystem(i: CardReportPromptInput): string {
  const orient = i.reversed ? "역위" : "정위";
  const kw = (i.reversed ? i.card.reversed : i.card.upright).join(", ");
  return [
    loadCore(), "",
    "# 별마루 오늘 타로 리포트",
    `오늘 날짜: ${i.todayKst}. 오늘 일진은 ${i.todayGanji}.`,
    `너는 이 사람이 오늘 뽑은 타로 한 장을, 그 사람의 사주와 오늘 흐름에 얹어 7블록 리포트로 풀어준다.`,
    `카드: ${i.card.name_kr} (${orient}). 키워드: ${kw}.`,
    `이 사람: ${formatPillars(i.saju)}.`,
    `오늘 등급 ${i.grade.label}. 오늘 사주 축(연애 ${i.axes.love}·돈 ${i.axes.money}·일 ${i.axes.work}) — 참고용이고 본문에 숫자로 쓰지 마.`,
    gaugeLine(i.gauge),
    "",
    // 🔴 P6-4 §5-3① — 구독자 화면에도 taste 가 그대로 남는다(DailyCardBlock). 그래서 "화면엔 무료
    //    소개가 떠 있다"가 다시 참이고, 8c4dab2 가 넣었던 place 완화("카드 성격을 한 호흡에")는
    //    불필요해져 뺐다. taste 를 화면에서 다시 내리면 이 문단부터 같이 고칠 것.
    "[역할] 화면엔 이미 카드 그림·이름·정역·키워드와 아래 무료 소개가 떠 있다:",
    i.freeTaste ? `«${i.freeTaste}»` : "«(무료 소개 없음 — 그래도 카드가 어떤 카드인지는 화면 키워드가 말한다)»",
    "그러니 이 카드의 상징이나 전통 의미를 재설명하지 마. 위 소개와 같은 메시지를 되풀이하지 마. 이 리포트가 할 일은 **이 카드가 네 사주 일간·오늘 일진의 어디에 떨어지는지** — 어디서 받쳐주고 어디서 부딪히는지 — 와, 그래서 오늘 벌어질 장면과 그때의 선택이다.",
    "",
    "출력은 **아래 JSON 하나만**. 앞뒤 설명·코드펜스 금지.",
    "{",
    `  "place": "<🃏 이 카드가 온 자리. 카드의 결(정/역)이 오늘 일진 ${i.todayGanji}·네 일간 ${i.saju.dayStem}(${i.saju.dayElement}) 이 둘 사이 어디에 떨어지는지 — 받쳐주는 지점·부딪히는 지점을 근거로. ${blockSentences("place")}문장.>",`,
    `  "love": "<💗 오늘 애정·관계. 카드 결을 오늘 연애 흐름에 얹어 벌어질 장면 1~2개와 그때 건넬 말·태도. ${blockSentences("love")}문장.>",`,
    `  "work": "<💼 오늘 일·돈. 일터와 돈이 오가는 장면 1~2개, 그때의 선택. ${blockSentences("work")}문장.>",`,
    `  "mind": "<🌙 카드가 비추는 마음. 오늘 네 내면·멘탈 결 — 어떤 마음이 올라오고 어떻게 다루면 좋은지(타로 고유 재료, 위 세 블록과 다른 재료로). ${blockSentences("mind")}문장.>",`,
    `  "caution": "<⚠️ 오늘 조심할 하나. 딱 하나만, 장면으로${i.reversed ? " — 역위라 이 블록이 특히 중요하다" : ""}. 겁주지 말고 따뜻한 대비로. ${blockSentences("caution")}문장.>",`,
    `  "move": "<✨ 오늘의 한 수. 실행 단위 1~2개(언제·무엇을 손에 잡히게). ${blockSentences("move")}문장.>",`,
    `  "note": "<따뜻한 마무리 ${blockSentences("note")}문장. 제목·머리말('○○의 한마디:' 같은 라벨) 없이 본문 문장으로 바로 시작하되, 첫 구절은 다른 블록처럼 굵게.>"`,
    "}",
    "",
    "[규칙] 반드시 별콩이가 상대에게 직접 말하는 2인칭 '너'로(그 사람을 '이 사람'이라 3인칭으로 부르지 마). 반말, 단정적 예언 금지(흐름·가능성·선택). 블록마다 **다른 재료**를 써 — 같은 말을 바꿔 쓰며 늘리지 말고 장면과 예시로 채워(카드 한 장이라 재료가 겹치기 쉬우니 위 각 블록의 재료 지시를 지켜). 축 점수나 게이지 숫자를 본문에 쓰지 마. 문장 수는 위에 적은 대로 지켜.",
    "[서식] 각 블록은 **첫 구절(핵심 어구 하나)만 굵게** — 블록당 정확히 1개, 그 외 굵게 금지. 그와 별개로, 블록 본문 중간의 짚고 갈 어구 하나(3~12자)를 `==이렇게==` 로 감싸 하이라이트해 — 블록당 최대 1개, 굵게 한 첫 구절과는 다른 자리에. 딱히 짚을 게 없으면 생략해. 관련된 2~4문장을 한 문단으로 묶고 문단 사이에만 빈 줄(\\n\\n). 불릿·콜아웃·제목·번호 금지. JSON 문자열 안 큰따옴표는 escape(\\\")하고, 줄바꿈은 반드시 \\n 으로 이스케이프(생 줄바꿈 금지).",
  ].join("\n");
}
export const CARD_REPORT_KICKOFF = "오늘 내 카드 풀어줘.";
/** 오늘 타로는 사주 daily 와 같은 유료 리포트 모델(luna). pair/self 서술의 BYEOLMARU_NARRATIVE_MODEL(nano)과 별개. */
export const CARD_REPORT_MODEL = FORTUNE_REPORT_MODEL;
/** 목표 1,800자(스펙 §6-2 글자수 고정값 — 문장 수(39)에서 파생시키지 말 것, p6-2-length-probe.ts
 *  상단 함정 설명 참조) JSON + 헤드룸. 실측(2026-09-20, P6-2 Task10 조정 후) 평균 ~1,836자·
 *  ~1,010토큰이라 6000 은 여전히 넉넉하다. 미생성 토큰은 과금 없음 — MAX_TOKENS_BY_FORTUNE.daily(6000)와 같은 산정. */
export const CARD_REPORT_MAX_TOKENS = 6000;
