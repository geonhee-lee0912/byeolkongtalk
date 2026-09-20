// scripts/p6-2-length-probe.ts — P6-2 실생성 검수(스펙 §9-2·§9-3). DB 무접촉, LLM 만 호출.
// 실행: node --import tsx --env-file=.env.local scripts/p6-2-length-probe.ts
//
// 본다: ①블록별 글자수 vs 목표(±15% 밖이면 프롬프트 문장 수를 ±1) ②블록당 볼드(**) 정확히 1개
//       ③반복도(블록 간 공통 4-gram 비율) ④"오늘" 사용(그날 리포트는 0 이어야) ⑤note 머리말 잔여
//       ⑥그날 리포트의 시제(과거형 어미 — summary/intro 스니펫을 눈으로 확인, 정규식으로 판정하지 않는다)
//
// ⚠️ 실제 유료 API 호출 6건 발생(카드 4장 + 사주 daily 2건, 전부 luna) — 반복 실행하지 말 것.
//
// note 머리말 잔여 체크는 정규식을 새로 만들지 않고 lib/fortune/note-heading.ts 의 stripNoteHeading 을
// raw JSON 의 note 원문(파싱·검증 전)에 그대로 적용해 재사용한다 — 매치가 없으면 그 함수는 trim() 만
// 하고 그대로 반환하므로, "적용 전후가 다르면 머리말이 있었다"로 판정할 수 있다(정규식 중복 없음).
// 파싱된 ai.note/ai.blocks.note 는 이미 stripNoteHeading 을 통과한 값이라 이 체크에 못 쓴다.
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { getCard } from "@/lib/tarot/cards";
import { STEM_ELEMENT } from "@/lib/saju/pairing";
import { toDaySelf } from "@/lib/byeolmaru/calendar";
import { dayFactors, dayScore, dayGrade, axisScores } from "@/lib/byeolmaru/day-score";
import { cardGauge } from "@/lib/byeolmaru/card-gauge";
import { getCardTaste } from "@/lib/byeolmaru/static-lines";
import {
  buildCardReportSystem,
  CARD_REPORT_KICKOFF,
  CARD_REPORT_MODEL,
  CARD_REPORT_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { CARD_REPORT_SCHEMA, CARD_REPORT_BLOCKS, parseCardReportJson } from "@/lib/byeolmaru/card-report";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { parseDailyReportJson } from "@/lib/fortune/daily-report";
import { fortuneResponseFormat } from "@/lib/fortune/response-format";
import { fortuneModel } from "@/lib/fortune/model";
import { MAX_TOKENS_BY_FORTUNE } from "@/lib/fortune/types";
import { generateOnce } from "@/lib/claude";
import { parseReportJson } from "@/lib/fortune/json-recover";
import { stripNoteHeading } from "@/lib/fortune/note-heading";

const TODAY = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
/** 그날(과거) 시제 검증용 — TODAY 의 3일 전. baseDateForKst 의 "로컬 getter = 달력 날짜" 규약을
 *  그대로 재사용한다(calc.ts 의 baseDateForKst/calcDailyLuckRange 주석 참조). */
const PAST_DATE = (() => {
  const d = baseDateForKst(TODAY);
  d.setDate(d.getDate() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

const BIRTH = { year: 1996, month: 4, day: 11, hour: 9, gender: "female" as const, isLunar: false, isLeapMonth: false };

// 🔴 P6-2 Task10(2026-09-20) 1회차 실측 후 love·note 를 조정했다(lib/fortune/prompt.ts SECTION_GUIDE.daily
// 주석 참조) — love 6→5문장(300→250, 초과 경향 2/2), note 3→4문장(150→200, 부족 경향 2/2). 문장수×50 공식은 그대로.
const SAJU_TARGET: Record<string, number> = {
  summary: 30,
  intro: 330,
  love: 250,
  money: 250,
  work: 250,
  health: 200,
  study: 200,
  note: 200,
};
// 🔴 같은 라운드에 caution·move 4→5(200→250, 부족 경향 3~4/4), note 3→4(150→200, 부족 경향 2/4) 조정
// (lib/byeolmaru/card-report.ts CARD_REPORT_BLOCKS 주석 참조). 문장수×50 공식은 그대로.
const CARD_TARGET: Record<string, number> = { place: 400, love: 300, work: 300, mind: 250, caution: 250, move: 250, note: 200 };

function bolds(s: string): number {
  return (s.match(/\*\*[^*]+\*\*/g) ?? []).length;
}
function grams(s: string, n = 4): Set<string> {
  const t = s.replace(/\s+|\*\*/g, "");
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}
/** 블록 쌍 간 공통 4-gram 비율의 최대값(%). 스펙 §6-4 실측 기준 1.3% — 10% 넘으면 반복 의심. */
function maxOverlap(blocks: Record<string, string>): { pair: string; pct: number } {
  const keys = Object.keys(blocks);
  let best = { pair: "", pct: 0 };
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = grams(blocks[keys[i]]);
      const b = grams(blocks[keys[j]]);
      let common = 0;
      for (const g of a) if (b.has(g)) common++;
      const pct = Math.round((100 * common) / Math.min(a.size, b.size));
      if (pct > best.pct) best = { pair: `${keys[i]}×${keys[j]}`, pct };
    }
  }
  return best;
}

/** 글자수/편차/볼드를 찍고, 호출부가 집계할 수 있게 값도 돌려준다(재실행 여부 판단은 §9-3 규칙). */
function row(k: string, s: string, target: number, dayWord: string): { len: number; dev: number; boldCount: number } {
  const len = s.replace(/\*\*/g, "").length;
  const dev = Math.round(((len - target) / target) * 100);
  const boldCount = bolds(s);
  const flag = Math.abs(dev) > 15 ? "⚠" : " ";
  const todayCount = (s.match(/오늘/g) ?? []).length;
  console.log(
    `${flag} ${k.padEnd(8)} ${String(len).padStart(4)}자 / 목표 ${String(target).padStart(3)} (${dev >= 0 ? "+" : ""}${dev}%)  볼드 ${boldCount}  '오늘' ${todayCount}${dayWord === "그날" ? " (그날 리포트: 0 이어야)" : ""}`
  );
  return { len, dev, boldCount };
}

function firstSentence(s: string): string {
  const clean = s.replace(/\*\*/g, "");
  const m = clean.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : clean.slice(0, 60)).trim();
}

/** raw JSON 의 note 원문(파싱 전)에 stripNoteHeading 을 적용해봐서 값이 바뀌면 머리말이 있었던 것. */
function noteHeadingLeftover(raw: string): boolean {
  const o = parseReportJson(raw);
  const note = o?.note;
  if (typeof note !== "string") return false;
  return stripNoteHeading(note) !== note.trim();
}

function countAcross(strings: string[], needle: string): number {
  return strings.reduce((n, s) => n + (s.split(needle).length - 1), 0);
}

// ── 집계 상태 ──────────────────────────────────────────────────────────────
let boldOk = 0;
let boldTotal = 0;
const flagCounts: Record<string, number> = {};
const overlapResults: { sample: string; pair: string; pct: number }[] = [];
const parseFailures: string[] = [];
let pastTodayCount: number | null = null;

function trackBold(boldCount: number): void {
  boldTotal++;
  if (boldCount === 1) boldOk++;
}
function trackFlag(sampleType: "card" | "saju", key: string, dev: number): void {
  if (Math.abs(dev) <= 15) return;
  const k = `${sampleType}:${key}`;
  flagCounts[k] = (flagCounts[k] ?? 0) + 1;
}

/** 블록 목록을 순서대로 row() 찍고 글자수·볼드·플래그를 집계 + 반복도 계산용 맵을 만든다.
 *  card(7블록: place·love·work·mind·caution·move·note)·saju(intro+5섹션+note=7블록) 양쪽이
 *  "블록마다 목표·볼드·반복도를 본다"는 같은 루프라 공유한다. */
function measureBlocks(
  sampleType: "card" | "saju",
  blocks: { key: string; text: string; target: number }[],
  dayWord: string
): { totalChars: number; overlapMap: Record<string, string> } {
  let totalChars = 0;
  const overlapMap: Record<string, string> = {};
  for (const b of blocks) {
    const r = row(b.key, b.text, b.target, dayWord);
    totalChars += r.len;
    trackBold(r.boldCount);
    trackFlag(sampleType, b.key, r.dev);
    overlapMap[b.key] = b.text;
  }
  return { totalChars, overlapMap };
}

async function probeCard(cardId: number, reversed: boolean): Promise<void> {
  const card = getCard(cardId);
  if (!card) {
    console.error(`⚠ getCard(${cardId}) undefined — 스킵`);
    parseFailures.push(`card#${cardId} (마스터 없음)`);
    return;
  }
  const label = `카드 #${cardId} ${card.name_kr}(${card.suit ?? "메이저"}) ${reversed ? "역위" : "정위"}`;
  console.log(`\n=== ${label} ===`);

  const saju = calcSaju(BIRTH);
  const temporal = calcTemporalLuck(baseDateForKst(TODAY), BIRTH.year);
  const f = dayFactors(toDaySelf(saju), {
    stem: temporal.day.stem,
    branch: temporal.day.branch,
    element: STEM_ELEMENT[temporal.day.stem],
  });
  const grade = dayGrade(dayScore(f));
  const axes = axisScores(f);
  const gauge = cardGauge(axes, card, reversed);
  const todayGanji = temporal.day.stem + temporal.day.branch;
  const freeTaste = getCardTaste(cardId, reversed, TODAY);
  const system = buildCardReportSystem({ saju, card, reversed, todayGanji, todayKst: TODAY, grade, axes, gauge, freeTaste });

  const t0 = Date.now();
  let raw: string;
  try {
    raw = await generateOnce(
      system,
      [{ role: "user", content: CARD_REPORT_KICKOFF }],
      CARD_REPORT_MAX_TOKENS,
      { route: "probe" },
      CARD_REPORT_MODEL,
      { name: "card_report", schema: CARD_REPORT_SCHEMA }
    );
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    parseFailures.push(`${label} (호출 에러)`);
    return;
  }
  const sec = (Date.now() - t0) / 1000;
  const ai = parseCardReportJson(raw);
  if (!ai) {
    console.error(`  ⚠ PARSE FAILED — raw 앞 400자:\n${raw.slice(0, 400)}`);
    parseFailures.push(label);
    return;
  }

  const blocks: { key: string; text: string; target: number }[] = CARD_REPORT_BLOCKS.map((b) => ({
    key: b.key,
    text: ai[b.key],
    target: CARD_TARGET[b.key],
  }));
  const { totalChars, overlapMap } = measureBlocks("card", blocks, "오늘");
  const estTokens = Math.round(totalChars / 1.8);
  console.log(`  합계 ${totalChars}자 (목표 1800)  소요 ${sec.toFixed(1)}s  추정 출력토큰 ~${estTokens}(한글 1.8자/토큰 가정)`);
  const ov = maxOverlap(overlapMap);
  overlapResults.push({ sample: label, ...ov });
  console.log(`  최대 블록간 반복 ${ov.pct}% (${ov.pair})`);
  console.log(`  place 첫 문장: ${firstSentence(ai.place)}`);
  console.log(`  note 머리말 잔여: ${noteHeadingLeftover(raw) ? "있음 → stripNoteHeading 이 제거함" : "없음"}`);
}

async function probeSaju(reportDate: string): Promise<void> {
  const dayWord = reportDate === TODAY ? "오늘" : "그날";
  const label = `사주 daily ${reportDate} (${dayWord})`;
  console.log(`\n=== ${label} ===`);

  const saju = calcSaju(BIRTH);
  saju.temporal = calcTemporalLuck(baseDateForKst(reportDate), BIRTH.year);
  const system = buildFortuneSystem("daily", { saju, reportDate, todayKst: TODAY });

  const t0 = Date.now();
  let raw: string;
  try {
    raw = await generateOnce(
      system,
      [{ role: "user", content: FORTUNE_KICKOFF }],
      MAX_TOKENS_BY_FORTUNE.daily,
      { route: "probe" },
      fortuneModel("daily"),
      fortuneResponseFormat("daily")
    );
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    parseFailures.push(`${label} (호출 에러)`);
    return;
  }
  const sec = (Date.now() - t0) / 1000;
  const ai = parseDailyReportJson(raw);
  if (!ai) {
    console.error(`  ⚠ PARSE FAILED — raw 앞 400자:\n${raw.slice(0, 400)}`);
    parseFailures.push(label);
    return;
  }

  row("summary", ai.summary, SAJU_TARGET.summary, dayWord); // 참고용 — summary 는 볼드 지시가 없어 준수율 집계에서 제외
  const blocks: { key: string; text: string; target: number }[] = [
    { key: "intro", text: ai.intro, target: SAJU_TARGET.intro },
    ...ai.sections.map((s) => ({ key: s.key, text: s.body, target: SAJU_TARGET[s.key] })),
    { key: "note", text: ai.note, target: SAJU_TARGET.note },
  ];
  const { totalChars, overlapMap } = measureBlocks("saju", blocks, dayWord);
  const estTokens = Math.round(totalChars / 1.8);
  console.log(`  합계(요약 제외) ${totalChars}자 (목표 1800)  소요 ${sec.toFixed(1)}s  추정 출력토큰 ~${estTokens}(한글 1.8자/토큰 가정)`);
  const ov = maxOverlap(overlapMap);
  overlapResults.push({ sample: label, ...ov });
  console.log(`  최대 블록간 반복 ${ov.pct}% (${ov.pair})`);
  console.log(`  stars=${ai.stars}  balance.good(${ai.balance.good.length}자)="${ai.balance.good}"`);
  console.log(`  balance.warn(${ai.balance.warn.length}자)="${ai.balance.warn}"`);

  const todayCount = countAcross(
    [
      ai.summary,
      ai.intro,
      ai.note,
      ai.lucky.keyword,
      ai.lucky.color,
      ai.lucky.time,
      ai.balance.good,
      ai.balance.warn,
      ...ai.sections.map((s) => s.body),
    ],
    "오늘"
  );
  console.log(`  '오늘' 전체 사용 ${todayCount}회${dayWord === "그날" ? " (그날 리포트: 0 이어야)" : ""}`);
  if (dayWord === "그날") pastTodayCount = todayCount;
  console.log(`  note 머리말 잔여: ${noteHeadingLeftover(raw) ? "있음 → stripNoteHeading 이 제거함" : "없음"}`);

  // 시제 육안 확인용 — "그날"이면 과거형("~였어/~했던")인지, "오늘"이면 그대로인지는 정규식이 아니라
  // 사람이 읽고 판단한다(한국어 어미 변주가 너무 다양해 판정 규칙을 만드는 게 더 위험하다).
  console.log(`  summary: "${ai.summary}"`);
  console.log(`  intro 앞부분: "${ai.intro.slice(0, 150)}${ai.intro.length > 150 ? "…" : ""}"`);
}

function printSummary(): void {
  console.log("\n\n===== 종합 =====");
  console.log(`볼드 준수(정확히 1개) ${boldOk}/${boldTotal}`);
  const flagged = Object.entries(flagCounts).filter(([, n]) => n >= 2);
  console.log(
    flagged.length
      ? `⚠ 같은 블록이 2회 이상 ±15% 밖: ${flagged.map(([k, n]) => `${k}(${n}회)`).join(", ")}`
      : "같은 블록이 2회 이상 ±15% 밖으로 벗어난 사례 없음"
  );
  const globalMax = overlapResults.reduce((m, r) => (r.pct > m.pct ? r : m), { sample: "-", pair: "-", pct: -1 });
  console.log(`전체 최대 블록간 반복도 ${globalMax.pct}% — ${globalMax.sample} (${globalMax.pair})`);
  console.log(`그날 리포트 '오늘' 개수: ${pastTodayCount ?? "측정 안 됨(호출/파싱 실패)"}`);
  console.log(parseFailures.length ? `⚠ 파싱/호출 실패 ${parseFailures.length}건: ${parseFailures.join(" / ")}` : "파싱 실패 없음");
}

async function main(): Promise<void> {
  console.log(`TODAY(KST)=${TODAY}  PAST_DATE(그날)=${PAST_DATE}`);
  await probeCard(0, false); // 바보 정위 — 메이저 all
  await probeCard(16, true); // 탑 역위 — 메이저 all
  await probeCard(36, false); // 컵 에이스 정위 — 연애 +
  await probeCard(70, true); // 펜타클 7 역위 — 돈 -
  await probeSaju(TODAY);
  await probeSaju(PAST_DATE);
  printSummary();
}

main().catch((e) => {
  console.error("probe 실패:", e);
  process.exit(1);
});
