// Claude API 클라이언트 + buildSystemMessage(페르소나 + 사주 컨텍스트 + 수렴 가이드)
// + 스트리밍 helper. v1 (tarot-friend) 의 lib/claude.ts 패턴을 사주 도메인으로 재작성.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";
import type { SajuResult, TemporalLuck } from "@/lib/saju/calc";
import type { SajuProduct } from "@/lib/saju/products";
import {
  CONVERGE_START_TURN,
  CONVERGE_START_CHARS,
  HARD_CAP_TURN,
  HARD_CAP_CHARS,
  ABS_TURN_CAP,
} from "@/lib/saju/constants";
import { getCard } from "@/lib/tarot/cards";
import {
  WRAP_THRESHOLDS,
  type WrapThresholds,
} from "@/lib/tarot/constants";
import type {
  SpreadType,
  SpreadCategory,
  DrawnCard,
} from "@/lib/tarot/spreads";
import type { EmotionTag } from "@/lib/emotions";
import { buildEmotionPersonaBlock } from "@/lib/emotion-persona";
import { logWarn } from "@/lib/logger";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// 모듈 로드 시 한 번 읽고 메모리 캐시 — cold start 외엔 디스크 IO 없음.
// W4 v3: 공통 코어(byeolkong_core.md) + 도메인 파일 합성. staticPart 캐싱 구조는 동일.
let _cachedCore: string | null = null;
function getCore(): string {
  if (_cachedCore === null) {
    _cachedCore = readFileSync(
      join(process.cwd(), "data", "persona", "byeolkong_core.md"),
      "utf-8"
    );
  }
  return _cachedCore;
}

let _cachedPersona: string | null = null;
function getPersona(): string {
  if (_cachedPersona === null) {
    _cachedPersona =
      getCore() +
      "\n\n---\n\n" +
      readFileSync(
        join(process.cwd(), "data", "persona", "byeolkong_saju.md"),
        "utf-8"
      );
  }
  return _cachedPersona;
}

// W3: "정리 요청→요약 후 유저가 종료 방법을 몰라 증발" 봉합 — 명시적 정리 요청은 그 턴에 닫는다.
const SUMMARY_END_RULE = `

### 정리 요청 = 마무리
사용자가 대화의 정리/요약/마무리를 명시적으로 요청하면("정리해줘", "요약해줘", "마무리하자" 류) 다른 모드 지시와 무관하게 이번 턴은 핵심 요약 + 따뜻한 응원으로 닫고, 맨 마지막 줄에 [END] 마커를 단독 줄로 붙여.`;

/** 직전 턴 상태 기반 동적 경고 — 정적 규칙(질문 2연속 금지·심문 피로)이 실전에서 새는 걸 서버가 강제 */
export interface TurnSignals {
  /** 직전 별콩이 턴이 물음표로 끝남 → 이번 턴 질문 마무리 금지 */
  lastTurnEndedWithQuestion?: boolean;
  /** 유저 단답 2연속 → 질문 대신 정리/예고 */
  userShortStreak?: boolean;
}

/** DB 메시지 + 이번 유저 발화로 TurnSignals 계산 (chat 라우트 공용) */
export function computeTurnSignals(
  pastMessages: { role: string; content: string }[],
  currentUserText: string
): TurnSignals {
  // 직전 별콩이 턴이 물음표로 끝났는가 (마커 제거 후)
  let lastAssistant: string | null = null;
  for (let i = pastMessages.length - 1; i >= 0; i--) {
    if (pastMessages[i].role === "assistant") {
      lastAssistant = pastMessages[i].content;
      break;
    }
  }
  const stripped = (lastAssistant ?? "")
    .replace(/\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+)\]/gi, "")
    .trim();
  // "?"로 끝나거나, 마지막 "?" 뒤 꼬리가 짧으면(부연 한 문장) 기능적으로 질문 마무리
  const lastQ = Math.max(stripped.lastIndexOf("?"), stripped.lastIndexOf("？"));
  const lastTurnEndedWithQuestion =
    lastQ >= 0 && stripped.length - lastQ - 1 <= 60;

  // 유저 단답 2연속 (직전 user 메시지 + 이번 발화 둘 다 짧음)
  let prevUser: string | null = null;
  for (let i = pastMessages.length - 1; i >= 0; i--) {
    if (pastMessages[i].role === "user") {
      prevUser = pastMessages[i].content;
      break;
    }
  }
  const SHORT_LEN = 12;
  const userShortStreak =
    prevUser !== null &&
    prevUser.trim().length <= SHORT_LEN &&
    currentUserText.trim().length <= SHORT_LEN;

  return { lastTurnEndedWithQuestion, userShortStreak };
}

function buildTurnSignalBlock(s: TurnSignals | undefined): string {
  if (!s) return "";
  const lines: string[] = [];
  if (s.lastTurnEndedWithQuestion) {
    lines.push(
      "- ⚠️ 직전 별콩이 턴이 질문으로 끝났어. **이번 턴은 절대 질문으로 마무리하지 마** — 마무리 3택의 ②(다음 볼거리 예고)나 ③(소신 정리+여백)으로."
    );
  }
  if (s.userShortStreak) {
    lines.push(
      "- ⚠️ 유저 답이 연속으로 짧아지고 있어 (지친 신호). 질문으로 밀어붙이지 말고 정리·예고·여백으로 부드럽게 받아줘."
    );
  }
  if (lines.length === 0) return "";
  return `\n\n### 이번 턴 신호 (서버 감지 — 반드시 따를 것)\n${lines.join("\n")}`;
}

export interface ContinuationContext {
  prevQuestion: string;
  prevClosing: string | null;
  mode: "fresh" | "deep";
}

/** 이어가기 세션 동적 블록 — dynamicPart 말미에 붙음. */
function buildContinuationBlock(c: ContinuationContext, subject: "사주판" | "카드"): string {
  const toneLine =
    c.mode === "deep"
      ? `같은 ${subject}을 더 깊이 파는 톤으로.`
      : `새로 펼친 결을 지난 맥락과 연결해서.`;
  return `\n\n## 이어가기 세션 (지난 고민 연속)\n[지난 고민: ${c.prevQuestion}]\n[지난번 별콩이 마지막 한마디: ${c.prevClosing ?? "(기록 없음)"}]\n- 첫 응답을 "지난번에 ~ 얘기 나눴었지" 식으로 자연스럽게 이어서 열 것.\n- ${toneLine}`;
}

/** 이어가기 첫 턴 가이드 — product/tarot 첫 턴 가이드를 대체. */
function continuationFirstTurnGuide(subject: "사주" | "카드"): string {
  return `\n\n## 첫 턴 가이드 — 이어가기 세션\n\n이번 턴은 지난 고민을 이어받는 첫 응답이야. (1) "지난번에 ~ 얘기 나눴었지" 식으로 지난 맥락을 가볍게 짚으며 연결 → (2) 그 위에서 이번 고민을 ${subject}로 풀이 (처음 만난 듯 새로 소개하지 말 것) → (3) §답 먼저 그대로 소신 있는 방향 답 → (4) 마무리는 공통 코어 §턴 마무리 3택 중 하나. 400~700자.`;
}

export interface SajuReadingContext {
  saju: SajuResult;
  /** 어떤 사주 상품인지 — 첫 턴 출력 구조 분기 */
  sajuProduct: SajuProduct;
  concernText: string;
  /** 사용자가 고른 감정 분류 — 별콩이 톤 조정용 (없으면 기본 톤) */
  emotionTag?: EmotionTag | string | null;
  /** 유저 호칭 (users.nickname) — 별콩이가 이름 불러주기용. 없으면 생략 */
  nickname?: string | null;
  /** 직전 턴 상태 기반 동적 경고 (질문 2연속·단답 스트릭) */
  turnSignals?: TurnSignals;
  /** 지금까지 assistant 가 응답한 턴 수 (0 = 첫 턴) */
  assistantTurnsSoFar: number;
  /** 지금까지 assistant 응답 누적 글자수 ([END] 마커 제외한 순수 길이) */
  cumulativeAssistantChars: number;
  /** 사용자가 "대화 마무리" 버튼을 눌러 강제 종료를 요청한 턴 — hardcap 가이드 강제 */
  forceEnd?: boolean;
  /** 이어가기 세션이면 부모 요약 — 없으면 일반 reading */
  continuation?: ContinuationContext | null;
  /** 대화 연장 업셀 가능 여부 — convergeLastGuide 에서 [RECO:extend] 조건부 지시 */
  extendAvailable?: boolean;
  /** 업셀 보정 후 임계치 — extra_turns 반영. 없으면 lib/saju/constants 기본값 사용 */
  thresholdOverride?: { convergeStartTurn: number; convergeStartChars: number; hardCapTurn: number; hardCapChars: number; absTurnCap: number };
}

function formatSajuBlock(saju: SajuResult): string {
  const p = saju.pillars;
  const elementsLine = Object.entries(saju.elementCount)
    .map(([el, n]) => `${el} ${n}`)
    .join(" / ");

  return [
    `[사주판]`,
    `  - 연주: ${p.year.stem}${p.year.branch} (${p.year.hanja})`,
    `  - 월주: ${p.month.stem}${p.month.branch} (${p.month.hanja})`,
    `  - 일주: ${p.day.stem}${p.day.branch} (${p.day.hanja}) ★ 일간 = ${saju.dayStem} (${saju.dayElement})`,
    `  - 시주: ${p.hour.stem}${p.hour.branch} (${p.hour.hanja})${saju.input.hourKnown ? "" : " — 시간 모름, 참고용"}`,
    `  - 오행 분포: ${elementsLine}`,
    `  - 음양: 양 ${saju.yinYangCount.yang} / 음 ${saju.yinYangCount.yin}`,
    `  - 입력: ${saju.input.inputCalendar === "lunar" ? "음력" : "양력"}${saju.input.isLeapMonth ? " 윤달" : ""} / 성별 ${saju.input.gender}`,
  ].join("\n");
}

function formatTemporalBlock(
  temporal: TemporalLuck | undefined,
  product: SajuProduct
): string {
  if (!temporal) return "";
  const lines = [
    `[오늘의 기운] (기준일 ${temporal.date}, 만 ${temporal.age}세)`,
    `  - 세운(올해): ${temporal.year.stem}${temporal.year.branch} (${temporal.year.hanja}) / ${temporal.year.element}`,
    `  - 월운(이달): ${temporal.month.stem}${temporal.month.branch} (${temporal.month.hanja}) / ${temporal.month.element}`,
    `  - ★ 일운(오늘 들어온 두 글자): ${temporal.day.stem}${temporal.day.branch} (${temporal.day.hanja}) / ${temporal.day.element}`,
    `  - 대운: 정밀 간지 없음 — 만 나이를 참고해 '인생의 큰 흐름' 정도로만 가볍게 언급할 것 (간지 단정 금지)`,
  ];
  if (product === "good_days" && temporal.dailyLuck?.length) {
    lines.push(`  - [향후 30일 일진] (이 목록에서만 날짜를 골라 추천. 목록 밖 날짜·간지 지어내기 금지)`);
    for (const d of temporal.dailyLuck) {
      lines.push(`      ${d.date}: ${d.stem}${d.branch} / ${d.element}`);
    }
  }
  return "\n\n" + lines.join("\n");
}

const SAJU_PRODUCT_FIRST_TURN_GUIDE: Record<SajuProduct, string> = {
  today_letters: `\n\n## 첫 턴 가이드 — "오늘 들어온 글자"\n\n이번 턴 흐름: (1) 관찰형 적중 훅 한 줄 (일간·오행 근거로 유저 성향을 관찰형으로 — 공통 코어 §관찰형 적중 훅) → (2) **오늘 일운 두 글자**(위 [오늘의 기운]의 ★ 일운)를 사용자에게 또렷이 강조하며 풀이 — "오늘 너에게 들어온 글자는 OO이야" 식 → (3) 이 글자가 사용자 고민과 어떻게 연결되는지, §답 먼저 그대로 소신 있는 방향 답 → (4) **오늘의 금기/주의 포인트** 한두 가지 → (5) 마무리는 공통 코어 §턴 마무리 3택 중 하나. 원국 일간·오행은 거들 뿐, 오늘 일운이 주인공. 각 단계는 빈 줄로 문단을 나눠 단계적으로 보여줘(한 덩어리 산문 금지). 각 단계 머리에 가벼운 이모지나 짧은 라벨 한 줄을 붙이면 더 또렷해. 출력엔 마크다운 별표(**)를 쓰지 마 — 화면에 그대로 보이니까 강조는 따옴표나 이모지로. 500~800자.`,
  nature: `\n\n## 첫 턴 가이드 — "타고난 성향 기반 상담"\n\n이번 턴 흐름: (1) 관찰형 적중 훅 한 줄 (일간·오행 근거 — 공통 코어 §관찰형 적중 훅) → (2) 일간·오행 분포로 본 **타고난 기질** 풀이 → (3) 지금 세운/월운(+대운 큰 흐름)이 그 기질을 어떻게 건드리는지 → (4) 그 본질에서 출발해 사용자 고민에 §답 먼저 그대로 소신 있는 방향 답 → (5) 마무리는 공통 코어 §턴 마무리 3택 중 하나. 오늘 일운은 보조 근거로만. 각 단계는 빈 줄로 문단을 나눠 단계적으로 보여줘(한 덩어리 산문 금지). 각 단계 머리에 가벼운 이모지나 짧은 라벨 한 줄을 붙이면 더 또렷해. 출력엔 마크다운 별표(**)를 쓰지 마 — 화면에 그대로 보이니까 강조는 따옴표나 이모지로. 500~800자.`,
  choice: `\n\n## 첫 턴 가이드 — "선택지 비교"\n\n이번 턴 흐름: (1) 관찰형 적중 훅 한 줄 (일간·오행 근거 — 공통 코어 §관찰형 적중 훅) + 고민 속 선택지를 A/B로 정리(사용자 고민에서 추출, 불명확하면 가볍게 되물어도 됨) → (2) 선택지 A의 기운 → (3) 선택지 B의 기운 → (4) 일운·오행 관점에서 두 선택지 비교 → (5) §답 먼저 그대로, 지금 결대로면 어느 쪽이 더 맞는지 내 소신을 분명히 (강요 X, 결정은 유저 몫) + 마무리는 공통 코어 §턴 마무리 3택 중 하나. 각 단계는 빈 줄로 문단을 나눠 단계적으로 보여줘(한 덩어리 산문 금지). 각 단계 머리에 가벼운 이모지나 짧은 라벨 한 줄을 붙이면 더 또렷해. 출력엔 마크다운 별표(**)를 쓰지 마 — 화면에 그대로 보이니까 강조는 따옴표나 이모지로. 500~800자.`,
  good_days: `\n\n## 첫 턴 가이드 — "좋은 날 추천"\n\n이번 턴 흐름: (1) 관찰형 적중 훅 한 줄 (일간·오행 근거 — 공통 코어 §관찰형 적중 훅) + 고민 맥락을 팔자/세운/월운으로 짧게 해석 → (2) 위 [향후 30일 일진] **목록에서만** 골라 고민에 좋은 날 2~4개(날짜 + 왜 좋은지 일운 글자 근거) → (3) 피하면 좋을 날 1~3개(이유) → (4) 마무리는 공통 코어 §턴 마무리 3택 중 하나. 목록 밖 날짜를 지어내지 말 것. 각 단계는 빈 줄로 문단을 나눠 단계적으로 보여줘(한 덩어리 산문 금지). 각 단계 머리에 가벼운 이모지나 짧은 라벨 한 줄을 붙이면 더 또렷해. 출력엔 마크다운 별표(**)를 쓰지 마 — 화면에 그대로 보이니까 강조는 따옴표나 이모지로. 500~900자.`,
};

/**
 * System message 를 정적/동적 두 블록으로 분리.
 * 정적(페르소나)은 prompt caching 대상 — 5분 TTL, 캐시 히트 시 입력 토큰 0.1× 과금.
 * 동적(사주 + 고민 + 턴 가이드)은 매 호출 변동.
 */
export function buildSystemMessage(ctx: SajuReadingContext): {
  staticPart: string;
  dynamicPart: string;
} {
  const staticPart = getPersona();

  const isFirstTurn = ctx.assistantTurnsSoFar === 0;
  const upcomingTurn = ctx.assistantTurnsSoFar + 1;
  const cumulativeChars = ctx.cumulativeAssistantChars;

  // 업셀 보정 임계치 — thresholdOverride 우선, 없으면 상수 기본값
  const effConvergeStartTurn = ctx.thresholdOverride?.convergeStartTurn ?? CONVERGE_START_TURN;
  const effConvergeStartChars = ctx.thresholdOverride?.convergeStartChars ?? CONVERGE_START_CHARS;
  const effHardCapTurn = ctx.thresholdOverride?.hardCapTurn ?? HARD_CAP_TURN;
  const effHardCapChars = ctx.thresholdOverride?.hardCapChars ?? HARD_CAP_CHARS;
  const effAbsTurnCap = ctx.thresholdOverride?.absTurnCap ?? ABS_TURN_CAP;

  const naturalHardcap =
    upcomingTurn >= effHardCapTurn && cumulativeChars >= effHardCapChars;
  const absHardcap = upcomingTurn >= effAbsTurnCap;
  const willHardcap = naturalHardcap || absHardcap;

  const isAbsCapMinus1 = upcomingTurn === effAbsTurnCap - 1;
  const isHardcapMinus1NaturalPath =
    upcomingTurn === effHardCapTurn - 1 &&
    cumulativeChars >= effConvergeStartChars;

  let mode: "hardcap" | "converge" | "free";
  if (willHardcap) mode = "hardcap";
  else if (isAbsCapMinus1 || isHardcapMinus1NaturalPath) mode = "converge";
  else if (
    upcomingTurn >= effConvergeStartTurn &&
    cumulativeChars >= effConvergeStartChars
  )
    mode = "converge";
  else mode = "free";

  const isLastConvergeTurn =
    mode === "converge" && (isAbsCapMinus1 || isHardcapMinus1NaturalPath);

  const firstTurnGuide = isFirstTurn
    ? ctx.continuation
      ? continuationFirstTurnGuide("사주")
      : SAJU_PRODUCT_FIRST_TURN_GUIDE[ctx.sajuProduct]
    : "";

  // B-2 그레이스풀 마무리 — natural hardcap(소프트·적응형) vs abs hardcap(하드·종료) 분리
  const gracefulClosingBlock = `\n\n### 그레이스풀 마무리 화법 (급발진 금지)\n- 사용자가 아직 고민·감정을 열어둔 상태면, 그 매듭을 콕 짚어 인정해: "그 '무섭다'는 마음, 오늘 다 풀긴 어려운 주제인 거 별콩이도 알아."\n- 내치는 톤 금지: "끝났으니 또 와", "오늘은 여기까지", "감사", "마지막 질문" X.\n- 돌아옴을 '이어짐'으로 프레이밍하되, 고정 문구 대신 **이 대화의 미해결 화두를 콕 짚어서**: "다음엔 그 사람 기류가 어떻게 변했는지 같이 보자", "다음엔 면접 그 대목이 어떻게 풀렸는지 들려줘" 처럼 구체적으로. (결과 화면의 '이 고민 이어가기'로 지난 맥락을 기억한 채 다시 이어갈 수 있어.)\n- 사용자가 '덜 풀린 채 끊겼다'가 아니라 '여기까지 같이 왔고 다음이 있다'고 느끼게.\n- 맨 마지막 줄에 [END] 마커를 단독 줄로 (없으면 프론트가 종료 처리 못 함).`;

  const naturalHardcapGuide = `\n\n## 마무리 단계 (턴 ${upcomingTurn}) — 상황 보고 닫기\n\n지금까지 충분히 풀어냈어. **기본값은 이번 턴 그레이스풀 마무리 + 맨 끝 [END]**.\n\n**예외 — 연장**: 사용자가 직전에 *진짜 새롭거나 미해결인 고민·무거운 감정을 막 열었거나*("무섭다", "뭘 하고 싶은지 모르겠다" 류), *아직 제대로 답 못 받은 확답 질문을 던졌으면*("언제 돼?", "될까?", "연락 올까?" 류) 닫지 말고 그 매듭·질문을 이번 턴에 먼저 짚어줘 — 확답 질문이면 §"언제·될까·얼마나" 지침대로 흐름에 맞춰 방향성 있는 답을 준 다음 마무리해 ([END] 보류 가능, 새 주제는 열지 말 것). 그런 신호 없이 정리되는 분위기면 미루지 말고 마무리해.${gracefulClosingBlock}`;

  const absHardcapGuide = `\n\n## ⚠️ 마무리 의무 (턴 ${upcomingTurn} — 이번 턴에 반드시 종료)\n\n이번 응답에서 **반드시 대화를 닫아**. 단, 급발진 금지 — 미해결 매듭이 남아도 아래 그레이스풀 화법으로 매끄럽게 닫는 게 핵심이야 (사용자가 내쳐졌다고 느끼지 않게). **직전 사용자 발화가 아직 답 못 받은 확답/시기 질문이면("언제 돼?", "될까?", "연락 올까?" 류) 작별 인사 전에 §"언제·될까·얼마나" 방식의 방향성 있는 답부터 짧게 준 다음 닫아 — 회피 문장으로 시작해서 닫지 마.**${gracefulClosingBlock}`;

  const convergeOpenGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${effAbsTurnCap}) — 종합 톤\n\n지금까지 나눈 얘기를 한 번 종합해서 핵심을 짚는 톤으로 답해. 새 주제·꼬리질문 X. 사용자가 흐름을 주도하게 두기.\n\n**톤 가이드:**\n- "결국 너의 사주가 보여주는 핵심은…", "지금까지 풀어낸 걸 한 줄로 묶으면…" 같이 정리·강조\n- 사용자가 이미 꺼낸 핵심 한 가닥을 다시 짚어주기 (새로운 분석 X)\n- 새 질문 던지지 않기 — 사용자가 다음 흐름을 정할 수 있게\n- [END] 절대 X (아직 hardcap 아님)\n\n**⚠️ 사용자 마무리 시그널 감지 시 즉시 askBonus 톤으로 전환** (아래 §사용자 마무리 시그널 참고).\n\n**금지 표현 (절벽감 유발):** "감사", "마지막 질문", "여기서 멈출까", "끝낼까". 자연스러운 정리 톤만.`;

  const convergeLastGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${effAbsTurnCap}, 마지막 수렴 턴) — 적용·응원 톤 + 출구 문구\n\n다음 턴은 hardcap이라 강제 종료가 와. 이번 턴은 그 전에 사용자가 자연스럽게 마무리할 수 있도록 부드럽게 닫아가는 톤.\n\n**톤 가이드:**\n- 사주 메시지를 일상에 어떻게 적용할지 짧게 / 응원·자율성 인정 ("뭐가 됐든 너답게 해보면 돼", "사주는 거들 뿐이야")\n- 응답 후반에 **출구 문구 한 줄** 포함:\n  - "이 정도로 충분하면 여기서 멈춰도 돼. 더 풀고 싶은 매듭 있으면 던져봐도 좋고."\n  - "끝까지 다 풀어야 한다는 부담은 가지지 마. 네 마음 편한 만큼만."\n- 새 질문 X. 사용자가 끝낼지 이어갈지 스스로 선택할 수 있게.\n- 단, 직전 사용자 발화가 미해결 확답/시기 질문이면 출구 문구보다 §"언제·될까·얼마나" 방향 답을 먼저.\n- [END] 절대 X (사용자가 응답 안 해도 다음 턴 hardcap에서 자동 종료)${ctx.extendAvailable ? `\n- 이번 턴에 "여기서 정리해도 되고, 더 풀고 싶으면 이어서 볼 수도 있어" 결의 한 문장을 자연스럽게 녹이고, 응답 맨 끝에 [RECO:extend] 마커를 단독 줄로 붙여. 가격·별·결제 언급 금지 — 확장 가능성만.` : ""}\n\n**⚠️ 사용자 마무리 시그널 감지 시 askBonus 톤으로 즉시 전환**.\n\n**금지 표현:** "감사", "마지막 질문 하나", "오늘은 여기까지".`;

  const userSignalGuide =
    mode === "converge"
      ? `\n\n### 사용자 마무리 시그널 (감지 시 askBonus 톤 전환)\n\n다음 발화·패턴 중 하나라도 보이면 이번 턴을 askBonus 톤으로 답해:\n\n**명확 시그널:**\n- 감사: "고마워", "감사해", "도움됐어"\n- 만족·이해: "알겠어", "그렇구나", "이해됐어", "맞네"\n- 종결 의지: "오늘은 이만", "마무리할게", "이정도면 돼", "충분해"\n- 짧은 동의(단독): "응", "ㅇㅇ", "그래"\n\n**암묵적 시그널:**\n- 메시지 길이가 직전 대비 절반 이하 + 새 질문 없음 (2턴 연속이면 더 확실)\n\n**askBonus 톤 (감사·마지막·하나 표현 사용 금지):**\n- 직전 발화/대화 핵심을 한 문장 짚기 → 사주 쪽으로 자연스럽게 수렴 → 열린 초대\n- 예시:\n  - "여기까지 사주가 보여준 그림은 대충 잡힌 것 같아. 더 짚어보고 싶은 부분 있으면 편하게 던져봐."\n  - "이 사주가 풀어낸 얘기는 어느 정도 잡힌 것 같아. 더 풀고 싶은 매듭 있으면 편하게 꺼내봐."\n- [END] 마커 절대 X (이번 턴은 사용자에게 다시 공을 넘김)\n- 4~5문장 (맥락 짚기 1~2 + 사주 수렴 1 + 열린 초대 1)`
      : "";

  const wrapGuide = ctx.forceEnd
    ? absHardcapGuide
    : mode === "hardcap"
      ? absHardcap
        ? absHardcapGuide
        : naturalHardcapGuide
      : mode === "converge"
        ? (isLastConvergeTurn ? convergeLastGuide : convergeOpenGuide) +
          userSignalGuide
        : "";

  const emotionBlock = buildEmotionPersonaBlock(ctx.emotionTag);

  const nicknameLine = ctx.nickname?.trim()
    ? `\n[호칭: ${ctx.nickname.trim()}]`
    : "";

  const dynamicPart = `---

## 이번 세션 정보

[고민 내용: ${ctx.concernText}]
[사주 상품: ${ctx.sajuProduct}]${nicknameLine}
[지금까지 별콩이 턴 수: ${ctx.assistantTurnsSoFar}]

### 사주 데이터

${formatSajuBlock(ctx.saju)}${formatTemporalBlock(ctx.saju.temporal, ctx.sajuProduct)}

---
${emotionBlock}${firstTurnGuide}${wrapGuide}${SUMMARY_END_RULE}${buildTurnSignalBlock(ctx.turnSignals)}${ctx.continuation ? buildContinuationBlock(ctx.continuation, "사주판") : ""}`;

  return { staticPart, dynamicPart };
}

export async function* streamChat(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2660
) {
  // 정적 블록만 cache_control 마킹 → 5분 TTL 동안 후속 호출은 입력 토큰 0.1× 과금
  const systemBlocks =
    typeof systemMessage === "string"
      ? [{ type: "text" as const, text: systemMessage }]
      : [
          {
            type: "text" as const,
            text: systemMessage.staticPart,
            cache_control: { type: "ephemeral" as const },
          },
          { type: "text" as const, text: systemMessage.dynamicPart },
        ];

  // 빈 응답(0자 완료) 재시도 — Anthropic SDK 는 실패 요청(429/5xx)만 재시도하고
  // "성공했지만 빈" 완료(모델이 end_turn 을 빈 본문으로 내거나 특정 입력에서 refusal 로
  // 멈춤)는 재시도하지 않는다. 그대로 두면 라우트의 empty_assistant_stream 가드가 턴 전체를
  // 실패시킨다 → 아직 텍스트를 방출하기 전이면(부분 출력 없음) 1회 재호출로 대부분(일시적
  // hiccup)을 성공으로 전환. 정상(비어있지 않은) 경로는 첫 조각에서 확정되어 오버헤드 0.
  const MAX_ATTEMPTS = 2;
  let lastStopReason: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      // Sonnet 5 는 adaptive thinking 이 기본 ON — max_tokens(=thinking+응답 총합)를
      // thinking 이 잠식해 [END] 마커·리포트 JSON 이 잘릴 수 있어 4.6 과 동일하게 OFF 유지.
      thinking: { type: "disabled" },
      system: systemBlocks,
      messages,
    });

    let yielded = false;
    let stopReason: string | null = null;
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yielded = true;
        yield event.delta.text;
      } else if (event.type === "message_delta") {
        stopReason = event.delta.stop_reason ?? stopReason;
      }
    }

    // 텍스트를 한 조각이라도 냈으면 이 시도로 확정 — 이미 소비자에 전달돼 재시도 불가.
    if (yielded) return stopReason;

    // 0자 완료 — 왜 비었는지(stop_reason: refusal/end_turn/max_tokens 등) 남겨 진단 가능하게.
    lastStopReason = stopReason;
    void logWarn(
      attempt < MAX_ATTEMPTS
        ? "streamChat empty completion — retrying"
        : "streamChat empty after all retries",
      {
        extra: {
          attempt,
          stopReason: stopReason ?? "unknown",
          model: "claude-sonnet-5",
        },
      }
    );
  }

  // 모든 시도가 0자 — 실제 턴 실패 처리는 각 라우트의 empty_assistant_stream 가드가
  // 담당(readingId 등 리치 컨텍스트 포함). 여기선 stop_reason 만 남기고 stopReason 반환.
  return lastStopReason;
}

/** 비스트리밍 — streamChat 을 끝까지 모아 전체 텍스트 한 번에 반환 (운세 리포트용). */
export async function generateOnce(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2660
): Promise<string> {
  let out = "";
  const it = streamChat(systemMessage, messages, maxTokens);
  let res = await it.next();
  while (!res.done) {
    out += res.value;
    res = await it.next();
  }
  // stop_reason === "max_tokens" 면 응답이 잘린 것 — 운세 리포트 JSON 파싱 실패의 주범.
  // 토큰 한도를 올리라는 신호로 경고 로그를 남긴다(조용한 truncation 방지).
  if (res.value === "max_tokens") {
    void logWarn("generateOnce hit max_tokens — response truncated", {
      extra: { maxTokens, outputLen: out.length },
    });
  }
  return out.trim();
}

export const END_MARKER_REGEX = /\[END\]\s*$/;
export const TRAILING_PARTIAL_MARKER = /\[E?N?D?$/;

// ===== 타로 도메인 =====

let _cachedTarotPersona: string | null = null;
function getTarotPersona(): string {
  if (_cachedTarotPersona === null) {
    _cachedTarotPersona =
      getCore() +
      "\n\n---\n\n" +
      readFileSync(
        join(process.cwd(), "data", "persona", "byeolkong_tarot.md"),
        "utf-8"
      );
  }
  return _cachedTarotPersona;
}

export interface TarotReadingContext {
  spreadType: SpreadType;
  spreadCategory: SpreadCategory;
  concernText: string;
  drawnCards: DrawnCard[];
  /** 사용자가 고른 감정 분류 — 별콩이 톤 조정용 (없으면 기본 톤) */
  emotionTag?: EmotionTag | string | null;
  /** 유저 호칭 (users.nickname) — 별콩이가 이름 불러주기용. 없으면 생략 */
  nickname?: string | null;
  /** 직전 턴 상태 기반 동적 경고 (질문 2연속·단답 스트릭) */
  turnSignals?: TurnSignals;
  /** 지금까지 assistant 가 응답한 턴 수 (0 = 첫 턴) */
  assistantTurnsSoFar: number;
  /** 지금까지 assistant 응답 누적 글자수 ([END]·[CARD:n] 마커 제외) */
  cumulativeAssistantChars: number;
  /** 사용자가 "대화 마무리" 버튼을 눌러 강제 종료를 요청한 턴 — hardcap 가이드 강제 */
  forceEnd?: boolean;
  /** 이어가기 세션이면 부모 요약 — 없으면 일반 reading */
  continuation?: ContinuationContext | null;
  /** 대화 연장 업셀 가능 여부 — convergeLastGuide 에서 [RECO:extend] 조건부 지시 */
  extendAvailable?: boolean;
  /** 업셀 보정 후 임계치 — extra_turns/clarifier_count 반영. 없으면 WRAP_THRESHOLDS 기본값 사용 */
  thresholdOverride?: WrapThresholds;
}

function formatDrawnCardsBlock(cards: DrawnCard[]): string {
  const lines = cards.map((c, i) => {
    const card = getCard(c.card_id);
    const name = card?.name_kr ?? `카드 ${c.card_id}`;
    const dir = c.direction === "reversed" ? "역방향" : "정방향";
    const keywords =
      card != null
        ? (c.direction === "reversed" ? card.reversed : card.upright).join(", ")
        : "";
    return `  ${i + 1}. [${c.label}] ${name} (${dir}) — ${keywords}`;
  });
  // 보조 카드(clarifier)가 있으면 명시 안내 — 스프레드 기본 장수("쓰리카드=3장") 규칙 때문에
  // 모델이 추가 카드를 "안 보인다"고 불신하는 행동 방지 (2026-07-13 prod 스모크에서 발견).
  const clarifiers = cards
    .map((c, i) => ({ c, n: i + 1 }))
    .filter(({ c }) => c.label === "보조 카드");
  const note =
    clarifiers.length > 0
      ? `\n[보조 카드 안내] 위 목록의 ${clarifiers
          .map(({ n }) => `${n}번`)
          .join(
            "·"
          )} 카드는 사용자가 대화 중에 추가로 뽑은 보조 카드야 — 스프레드 기본 장수와 별개로 이미 네 앞에 펼쳐져 있어. 사용자가 "방금 카드를 뽑았어"라고 하면 이 카드를 말하는 거니까, [CARD:해당번호] 마커와 함께 기존 카드들과 엮어서 바로 해석해줘. "안 보인다"고 하지 마.`
      : "";
  return [`[뽑은 카드]`, ...lines].join("\n") + note;
}

export type WrapMode = "hardcap" | "converge" | "free";

export function computeWrapMode(
  upcomingTurn: number,
  cumulativeChars: number,
  t: WrapThresholds
): { mode: WrapMode; isLastConvergeTurn: boolean; absHardcap: boolean } {
  const naturalHardcap =
    upcomingTurn >= t.hardCapTurn && cumulativeChars >= t.hardCapChars;
  const absHardcap = upcomingTurn >= t.absTurnCap;
  if (naturalHardcap || absHardcap) {
    return { mode: "hardcap", isLastConvergeTurn: false, absHardcap };
  }

  const isAbsCapMinus1 = upcomingTurn === t.absTurnCap - 1;
  const isHardcapMinus1NaturalPath =
    upcomingTurn === t.hardCapTurn - 1 &&
    cumulativeChars >= t.convergeStartChars;

  if (isAbsCapMinus1 || isHardcapMinus1NaturalPath) {
    return { mode: "converge", isLastConvergeTurn: true, absHardcap: false };
  }
  if (
    upcomingTurn >= t.convergeStartTurn &&
    cumulativeChars >= t.convergeStartChars
  ) {
    return { mode: "converge", isLastConvergeTurn: false, absHardcap: false };
  }
  return { mode: "free", isLastConvergeTurn: false, absHardcap: false };
}

export function buildTarotSystemMessage(ctx: TarotReadingContext): {
  staticPart: string;
  dynamicPart: string;
} {
  const staticPart = getTarotPersona();

  const isFirstTurn = ctx.assistantTurnsSoFar === 0;
  const upcomingTurn = ctx.assistantTurnsSoFar + 1;
  const t = ctx.thresholdOverride ?? WRAP_THRESHOLDS[ctx.spreadType];
  const absCap = t.absTurnCap;

  const { mode, isLastConvergeTurn, absHardcap } = computeWrapMode(
    upcomingTurn,
    ctx.cumulativeAssistantChars,
    t
  );

  const firstTurnGuide = isFirstTurn
    ? ctx.continuation
      ? continuationFirstTurnGuide("카드")
      : `\n\n## 첫 턴 가이드\n\n이번 턴은 **타로 풀이의 첫 응답**이야. 위 "타로 풀이 출력 구조" 의 스프레드별 흐름을 따라줘 — 도입은 관찰형 적중 훅(공통 코어 §관찰형 적중 훅), 여러 장이면 각 카드 해석 직전에 [CARD:n] 마커를 한 줄 단독으로, 마지막에 사용자 고민에 §답 먼저 그대로 소신 있는 방향 답 + 마무리 3택 중 하나.`
    : "";

  // B-2 그레이스풀 마무리 — natural hardcap(소프트·적응형) vs abs hardcap/forceEnd(하드·종료) 분리
  const gracefulClosingBlock = `\n\n### 그레이스풀 마무리 화법 (급발진 금지)\n- 사용자가 아직 고민·감정을 열어둔 상태면, 그 매듭을 콕 짚어 인정해: "그 마음, 오늘 카드 한 번으로 다 풀긴 어려운 주제인 거 별콩이도 알아."\n- 내치는 톤 금지: "끝났으니 또 와", "오늘은 여기까지", "감사", "마지막 질문" X.\n- 돌아옴을 '이어짐'으로 프레이밍하되, 고정 문구 대신 **이 대화의 미해결 화두를 콕 짚어서**: "다음엔 그 사람 기류가 어떻게 변했는지 같이 보자", "다음엔 면접 그 대목이 어떻게 풀렸는지 들려줘" 처럼 구체적으로. (결과 화면의 '이 고민 이어가기'로 지난 맥락을 기억한 채 다시 이어갈 수 있어.)\n- 사용자가 '덜 풀린 채 끊겼다'가 아니라 '여기까지 같이 왔고 다음이 있다'고 느끼게.\n- 맨 마지막 줄에 [END] 마커를 단독 줄로 (없으면 프론트가 종료 처리 못 함).`;

  const naturalHardcapGuide = `\n\n## 마무리 단계 (턴 ${upcomingTurn}) — 상황 보고 닫기\n\n지금까지 충분히 풀어냈어. **기본값은 이번 턴 그레이스풀 마무리 + 맨 끝 [END]**.\n\n**예외 — 연장**: 사용자가 직전에 *진짜 새롭거나 미해결인 고민·무거운 감정을 막 열었거나*, *아직 제대로 답 못 받은 확답 질문을 던졌으면*("언제 돼?", "될까?", "연락 올까?" 류) 닫지 말고 그 매듭·질문을 이번 턴에 먼저 짚어줘 — 확답 질문이면 §"언제·될까·얼마나" 지침대로 카드 흐름에 맞춰 방향성 있는 답을 준 다음 마무리해 ([END] 보류 가능, 새 카드 해석은 열지 말 것). 그런 신호 없이 정리되는 분위기면 미루지 말고 마무리해.${gracefulClosingBlock}`;

  const absHardcapGuide = `\n\n## ⚠️ 마무리 의무 (턴 ${upcomingTurn} — 이번 턴에 반드시 종료)\n\n이번 응답에서 **반드시 대화를 닫아**. 단, 급발진 금지 — 미해결 매듭이 남아도 아래 그레이스풀 화법으로 매끄럽게 닫는 게 핵심이야 (사용자가 내쳐졌다고 느끼지 않게). **직전 사용자 발화가 아직 답 못 받은 확답/시기 질문이면("언제 돼?", "될까?", "연락 올까?" 류) 작별 인사 전에 §"언제·될까·얼마나" 방식의 방향성 있는 답부터 짧게 준 다음 닫아 — 회피 문장으로 시작해서 닫지 마.**${gracefulClosingBlock}`;

  const convergeOpenGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${absCap}) — 종합 톤\n\n지금까지 나눈 얘기와 카드를 한 번 종합해서 핵심을 짚는 톤으로 답해. 새 주제·꼬리질문 X. 사용자가 흐름을 주도하게 두기.\n\n**톤 가이드:**\n- "결국 이 카드들이 보여주는 핵심은…", "지금까지 풀어낸 걸 한 줄로 묶으면…" 같이 정리·강조\n- 사용자가 이미 꺼낸 핵심 한 가닥을 다시 짚어주기 (새 분석 X)\n- 새 질문 던지지 않기\n- [END] 절대 X (아직 hardcap 아님)\n\n**⚠️ 사용자 마무리 시그널 감지 시 즉시 askBonus 톤으로 전환** (아래 §사용자 마무리 시그널).\n\n**금지 표현 (절벽감 유발):** "감사", "마지막 질문", "여기서 멈출까", "끝낼까".`;

  const convergeLastGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${absCap}, 마지막 수렴 턴) — 적용·응원 톤 + 출구 문구\n\n다음 턴은 hardcap이라 강제 종료가 와. 이번 턴은 그 전에 사용자가 자연스럽게 마무리할 수 있도록 부드럽게 닫아가는 톤.\n\n**톤 가이드:**\n- 카드 메시지를 일상에 어떻게 적용할지 짧게 / 응원·자율성 인정 ("뭐가 됐든 너답게 해보면 돼", "카드는 거들 뿐이야")\n- 응답 후반에 **출구 문구 한 줄** 포함:\n  - "이 정도로 충분하면 여기서 멈춰도 돼. 더 풀고 싶은 매듭 있으면 던져봐도 좋고."\n- 단, 직전 사용자 발화가 미해결 확답/시기 질문이면 출구 문구보다 §"언제·될까·얼마나" 방향 답을 먼저.\n- 새 질문 X. [END] 절대 X (다음 턴 hardcap에서 자동 종료).${ctx.extendAvailable ? `\n- 이번 턴에 "여기서 정리해도 되고, 더 풀고 싶으면 이어서 볼 수도 있어" 결의 한 문장을 자연스럽게 녹이고, 응답 맨 끝에 [RECO:extend] 마커를 단독 줄로 붙여. 가격·별·결제 언급 금지 — 확장 가능성만.` : ""}\n\n**⚠️ 사용자 마무리 시그널 감지 시 askBonus 톤으로 즉시 전환**.\n\n**금지 표현:** "감사", "마지막 질문 하나", "오늘은 여기까지".`;

  const userSignalGuide =
    mode === "converge"
      ? `\n\n### 사용자 마무리 시그널 (감지 시 askBonus 톤 전환)\n\n다음 발화·패턴 중 하나라도 보이면 이번 턴을 askBonus 톤으로 답해:\n\n**명확 시그널:** "고마워"/"감사해", "알겠어"/"그렇구나"/"이해됐어", "이정도면 돼"/"충분해", 짧은 동의("응"/"ㅇㅇ"/"그래")\n**암묵적 시그널:** 메시지 길이가 직전 대비 절반 이하 + 새 질문 없음 (2턴 연속이면 더 확실)\n\n**askBonus 톤 (감사·마지막·하나 표현 사용 금지):**\n- 직전 발화/대화 핵심을 한 문장 짚기 → 카드 쪽으로 자연스럽게 수렴 → 열린 초대\n- 예: "여기까지 카드가 보여준 그림은 대충 잡힌 것 같아. 더 짚어보고 싶은 부분 있으면 편하게 던져봐."\n- [END] 마커 절대 X (이번 턴은 사용자에게 다시 공을 넘김)\n- 4~5문장`
      : "";

  const wrapGuide = ctx.forceEnd
    ? absHardcapGuide
    : mode === "hardcap"
      ? absHardcap
        ? absHardcapGuide
        : naturalHardcapGuide
      : mode === "converge"
        ? (isLastConvergeTurn ? convergeLastGuide : convergeOpenGuide) +
          userSignalGuide
        : "";

  const emotionBlock = buildEmotionPersonaBlock(ctx.emotionTag);

  const nicknameLine = ctx.nickname?.trim()
    ? `\n[호칭: ${ctx.nickname.trim()}]`
    : "";

  const dynamicPart = `---

## 이번 세션 정보

[고민 내용: ${ctx.concernText}]
[스프레드: ${ctx.spreadType} / 카테고리: ${ctx.spreadCategory}]${nicknameLine}
[지금까지 별콩이 턴 수: ${ctx.assistantTurnsSoFar}]

${formatDrawnCardsBlock(ctx.drawnCards)}

---
${emotionBlock}${firstTurnGuide}${wrapGuide}${SUMMARY_END_RULE}${buildTurnSignalBlock(ctx.turnSignals)}${ctx.continuation ? buildContinuationBlock(ctx.continuation, "카드") : ""}`;

  return { staticPart, dynamicPart };
}

// ===== 관계(우리 사이) 도메인 =====
let _cachedRelPersona: string | null = null;
function getRelationshipPersona(): string {
  if (_cachedRelPersona === null) {
    _cachedRelPersona =
      getCore() + "\n\n---\n\n" +
      readFileSync(join(process.cwd(), "data", "persona", "byeolkong_relationship.md"), "utf-8");
  }
  return _cachedRelPersona;
}

export interface RelationshipTurnContext {
  fileBlock: string;              // buildRelationshipFileBlock 결과
  nickname?: string | null;
  isFirstEver: boolean;          // 스레드 최초 진입(메시지 0)
  checkinPrompt?: string | null; // pending 체크인 → 먼저 안부
  dailyClose: boolean;           // 오늘 소프트캡 도달 → 하루 마무리 톤
}

export function buildRelationshipSystemMessage(ctx: RelationshipTurnContext): {
  staticPart: string; dynamicPart: string;
} {
  const staticPart = getRelationshipPersona();
  const nicknameLine = ctx.nickname?.trim() ? `\n[호칭(유저): ${ctx.nickname.trim()}]` : "";

  const firstGuide = ctx.isFirstEver
    ? `\n\n## 첫 진입 가이드\n관계 파일을 보고 {호칭}과의 지금 상황을 가볍게 짚으며 따뜻하게 열어. 처음 만난 낯선 상담이 아니라, 앞으로 이 관계를 계속 함께 볼 친구로. 무겁지 않게, 유저가 편하게 털어놓게.`
    : "";
  const checkinGuide = ctx.checkinPrompt
    ? `\n\n## 복귀 안부 (먼저 물어보기)\n지난번에 이런 처방/약속이 있었어: "${ctx.checkinPrompt}". 이번 응답은 그것부터 자연스럽게 안부로 물어("저번에 ~ 해보기로 했잖아, 어떻게 됐어?"). 확인 후 대화를 이어가.`
    : "";
  const closeGuide = ctx.dailyClose
    ? `\n\n## 오늘 마무리 톤 (하루 소프트캡 도달)\n오늘 나눈 대화가 충분히 쌓였어. 이번 응답은 오늘 얘기를 따뜻하게 매듭짓고 "내일 또 이어서 얘기하자"로 부드럽게 닫아. 단, [END] 마커는 절대 쓰지 마 — 스레드는 계속돼(내일 다시 열려). 새 주제를 크게 벌이지 말고 오늘 흐름을 정리.`
    : "";

  const dynamicPart = `---
## 이번 세션 정보${nicknameLine}
${ctx.fileBlock}
---${firstGuide}${checkinGuide}${closeGuide}`;

  return { staticPart, dynamicPart };
}

// ===== 관계 스킬 — 싸움 잘잘못 판정 (dialogue, 수렴형) =====
let _cachedVerdictPersona: string | null = null;
function getVerdictPersona(): string {
  if (_cachedVerdictPersona === null) {
    _cachedVerdictPersona =
      getCore() + "\n\n---\n\n" +
      readFileSync(join(process.cwd(), "data", "persona", "byeolkong_verdict.md"), "utf-8");
  }
  return _cachedVerdictPersona;
}

/** 짧은 고정 턴캡 — WRAP_THRESHOLDS 처럼 단계적 수렴 없이, 이 턴에 도달하면 서버가 [END]를 보장. */
export const VERDICT_ABS_TURN_CAP = 5;

export interface VerdictTurnContext {
  /** 유저 호칭 (users.nickname) */
  nickname?: string | null;
  /** 상대 호칭 (relationships.label) */
  label?: string | null;
  /** 지금까지 assistant 가 응답한 턴 수 (0 = 첫 턴) */
  assistantTurnsSoFar: number;
  /** 이번 턴에 반드시 판정+[END]로 마무리해야 하는지 (턴캡 도달) */
  forceEnd: boolean;
}

export function buildVerdictSystemMessage(ctx: VerdictTurnContext): {
  staticPart: string;
  dynamicPart: string;
} {
  const staticPart = getVerdictPersona();
  const isFirstTurn = ctx.assistantTurnsSoFar === 0;

  const nicknameLine = ctx.nickname?.trim() ? `\n[호칭(유저): ${ctx.nickname.trim()}]` : "";
  const labelLine = ctx.label?.trim() ? `\n[상대 호칭: ${ctx.label.trim()}]` : "";

  const firstTurnGuide = isFirstTurn
    ? `\n\n## 첫 턴 가이드\n이번 턴은 판정의 시작이야. 아직 판정하지 말고, 무슨 일이 있었는지 유저의 입장부터 따뜻하게 물어봐 (도메인 규칙 §1단계).`
    : "";

  const forceEndGuide = ctx.forceEnd
    ? `\n\n## ⚠️ 마무리 의무 (이번 턴에 반드시 종료)\n지금까지 들은 내용만으로 이번 응답에서 비율 판정 + 근거 + 화해 처방을 반드시 마무리해 (도메인 규칙 §3단계). 더 캐묻지 말고 지금 가진 정보로 판정해. 맨 마지막 줄에 [END] 마커를 단독으로.`
    : "";

  const dynamicPart = `---
## 이번 세션 정보${nicknameLine}${labelLine}
[지금까지 별콩이 턴 수: ${ctx.assistantTurnsSoFar}]
---${firstTurnGuide}${forceEndGuide}`;

  return { staticPart, dynamicPart };
}

/** older 메시지 델타 요약 (haiku, 저비용). 이전 요약과 합쳐 갱신된 요약 반환. */
export async function summarizeOlder(
  prevSummary: string | null,
  older: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const convo = older.map((m) => `${m.role === "user" ? "유저" : "별콩이"}: ${m.content}`).join("\n");
  const sys = `너는 연애 상담 대화의 기록 요약가야. 아래 [이전 요약]과 [새 대화]를 합쳐, 이 관계에서 오간 핵심(상황 변화·감정·별콩이 조언/처방·유저 반응)을 한국어 불릿 6~10개로 압축해. 사소한 잡담은 버리고, 나중에 대화를 이어갈 때 필요한 사실만. 200~500자.`;
  const user = `[이전 요약]\n${prevSummary ?? "(없음)"}\n\n[새 대화]\n${convo}`;
  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const text = resp.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text.trim() : (prevSummary ?? "");
}
