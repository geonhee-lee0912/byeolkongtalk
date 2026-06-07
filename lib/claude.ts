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

// 모듈 로드 시 한 번 읽고 메모리 캐시 — cold start 외엔 디스크 IO 없음
let _cachedPersona: string | null = null;
function getPersona(): string {
  if (_cachedPersona === null) {
    _cachedPersona = readFileSync(
      join(process.cwd(), "data", "persona", "byeolkong.md"),
      "utf-8"
    );
  }
  return _cachedPersona;
}

export interface SajuReadingContext {
  saju: SajuResult;
  /** 어떤 사주 상품인지 — 첫 턴 출력 구조 분기 */
  sajuProduct: SajuProduct;
  concernText: string;
  /** 사용자가 고른 감정 분류 — 별콩이 톤 조정용 (없으면 기본 톤) */
  emotionTag?: EmotionTag | string | null;
  /** 지금까지 assistant 가 응답한 턴 수 (0 = 첫 턴) */
  assistantTurnsSoFar: number;
  /** 지금까지 assistant 응답 누적 글자수 ([END] 마커 제외한 순수 길이) */
  cumulativeAssistantChars: number;
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
  today_letters: `\n\n## 첫 턴 가이드 — "오늘 들어온 글자"\n\n이번 턴 흐름: (1) 여는 한 줄 → (2) **오늘 일운 두 글자**(위 [오늘의 기운]의 ★ 일운)를 사용자에게 또렷이 강조하며 풀이 — "오늘 너에게 들어온 글자는 OO이야" 식 → (3) 이 글자가 사용자 고민과 어떻게 연결되는지 중심으로 → (4) **오늘의 금기/주의 포인트** 한두 가지 → (5) 짧은 응원. 원국 일간·오행은 거들 뿐, 오늘 일운이 주인공. 400~700자, 단정 X.`,
  nature: `\n\n## 첫 턴 가이드 — "타고난 성향 기반 상담"\n\n이번 턴 흐름: (1) 여는 한 줄 → (2) 일간·오행 분포로 본 **타고난 기질** 풀이 → (3) 지금 세운/월운(+대운 큰 흐름)이 그 기질을 어떻게 건드리는지 → (4) 그 본질에서 출발해 사용자 고민에 적용 → (5) 응원. 오늘 일운은 보조 근거로만. 400~700자, 단정 X.`,
  choice: `\n\n## 첫 턴 가이드 — "선택지 비교"\n\n이번 턴 흐름: (1) 여는 한 줄 + 고민 속 선택지를 A/B로 정리(사용자 고민에서 추출, 불명확하면 가볍게 되물어도 됨) → (2) 선택지 A의 기운 → (3) 선택지 B의 기운 → (4) 일운·오행 관점에서 두 선택지 비교 → (5) 지금 결대로면 어느 쪽이 더 순한지(흐름·가능성 톤, 단정·강요 X). 400~700자.`,
  good_days: `\n\n## 첫 턴 가이드 — "좋은 날 추천"\n\n이번 턴 흐름: (1) 여는 한 줄 + 고민 맥락을 팔자/세운/월운으로 짧게 해석 → (2) 위 [향후 30일 일진] **목록에서만** 골라 고민에 좋은 날 2~4개(날짜 + 왜 좋은지 일운 글자 근거) → (3) 피하면 좋을 날 1~3개(이유) → (4) 응원. 목록 밖 날짜를 지어내지 말 것. 400~800자.`,
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

  const naturalHardcap =
    upcomingTurn >= HARD_CAP_TURN && cumulativeChars >= HARD_CAP_CHARS;
  const absHardcap = upcomingTurn >= ABS_TURN_CAP;
  const willHardcap = naturalHardcap || absHardcap;

  const isAbsCapMinus1 = upcomingTurn === ABS_TURN_CAP - 1;
  const isHardcapMinus1NaturalPath =
    upcomingTurn === HARD_CAP_TURN - 1 &&
    cumulativeChars >= CONVERGE_START_CHARS;

  let mode: "hardcap" | "converge" | "free";
  if (willHardcap) mode = "hardcap";
  else if (isAbsCapMinus1 || isHardcapMinus1NaturalPath) mode = "converge";
  else if (
    upcomingTurn >= CONVERGE_START_TURN &&
    cumulativeChars >= CONVERGE_START_CHARS
  )
    mode = "converge";
  else mode = "free";

  const isLastConvergeTurn =
    mode === "converge" && (isAbsCapMinus1 || isHardcapMinus1NaturalPath);

  const firstTurnGuide = isFirstTurn
    ? SAJU_PRODUCT_FIRST_TURN_GUIDE[ctx.sajuProduct]
    : "";

  const hardcapGuide = `\n\n## ⚠️ 마무리 의무 (이번 턴에 반드시 종료 — askBonus 톤 절대 X)\n\n이번 응답은 대화를 **완전히 마무리하는 턴**이야. 유저가 "고마워", "알겠어", "응" 같은 시그널을 보내도 askBonus 톤으로 가지 말 것. **이 턴은 무조건 forceEnd**.\n\n유저가 마지막으로 꺼낸 얘기에 따뜻하게 답해주고 한 줄 정리한 뒤 종료해.\n\n**응답 끝에 반드시 아래 두 가지 포함:**\n1. **"별콩이는 항상 네 곁에 있어" 맥락의 한마디** — 언제든 새 사주로 돌아올 수 있다는 인상. 예: "궁금한 거 생기면 언제든 다시 사주 펼치러 와. 별콩이는 여기 있을게.", "혼자 고민하지 말고 또 마음 어수선해지면 언제든 돌아와, 별콩이는 항상 별 옆에서 기다릴게."\n2. **맨 마지막 줄에 [END] 마커를 단독 줄로** (이 마커가 없으면 프론트엔드가 종료 처리 못 함 — 절대 빠뜨리지 말 것)\n\n⚠️ "더 풀고 싶은 매듭 있으면…" 같은 열린 초대 문구 절대 X. 유저에게 다시 공을 넘기지 말고 깔끔히 닫아.`;

  const convergeOpenGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${ABS_TURN_CAP}) — 종합 톤\n\n지금까지 나눈 얘기를 한 번 종합해서 핵심을 짚는 톤으로 답해. 새 주제·꼬리질문 X. 사용자가 흐름을 주도하게 두기.\n\n**톤 가이드:**\n- "결국 너의 사주가 보여주는 핵심은…", "지금까지 풀어낸 걸 한 줄로 묶으면…" 같이 정리·강조\n- 사용자가 이미 꺼낸 핵심 한 가닥을 다시 짚어주기 (새로운 분석 X)\n- 새 질문 던지지 않기 — 사용자가 다음 흐름을 정할 수 있게\n- [END] 절대 X (아직 hardcap 아님)\n\n**⚠️ 사용자 마무리 시그널 감지 시 즉시 askBonus 톤으로 전환** (아래 §사용자 마무리 시그널 참고).\n\n**금지 표현 (절벽감 유발):** "감사", "마지막 질문", "여기서 멈출까", "끝낼까". 자연스러운 정리 톤만.`;

  const convergeLastGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${ABS_TURN_CAP}, 마지막 수렴 턴) — 적용·응원 톤 + 출구 문구\n\n다음 턴은 hardcap이라 강제 종료가 와. 이번 턴은 그 전에 사용자가 자연스럽게 마무리할 수 있도록 부드럽게 닫아가는 톤.\n\n**톤 가이드:**\n- 사주 메시지를 일상에 어떻게 적용할지 짧게 / 응원·자율성 인정 ("뭐가 됐든 너답게 해보면 돼", "사주는 거들 뿐이야")\n- 응답 후반에 **출구 문구 한 줄** 포함:\n  - "이 정도로 충분하면 여기서 멈춰도 돼. 더 풀고 싶은 매듭 있으면 던져봐도 좋고."\n  - "끝까지 다 풀어야 한다는 부담은 가지지 마. 네 마음 편한 만큼만."\n- 새 질문 X. 사용자가 끝낼지 이어갈지 스스로 선택할 수 있게.\n- [END] 절대 X (사용자가 응답 안 해도 다음 턴 hardcap에서 자동 종료)\n\n**⚠️ 사용자 마무리 시그널 감지 시 askBonus 톤으로 즉시 전환**.\n\n**금지 표현:** "감사", "마지막 질문 하나", "오늘은 여기까지".`;

  const userSignalGuide =
    mode === "converge"
      ? `\n\n### 사용자 마무리 시그널 (감지 시 askBonus 톤 전환)\n\n다음 발화·패턴 중 하나라도 보이면 이번 턴을 askBonus 톤으로 답해:\n\n**명확 시그널:**\n- 감사: "고마워", "감사해", "도움됐어"\n- 만족·이해: "알겠어", "그렇구나", "이해됐어", "맞네"\n- 종결 의지: "오늘은 이만", "마무리할게", "이정도면 돼", "충분해"\n- 짧은 동의(단독): "응", "ㅇㅇ", "그래"\n\n**암묵적 시그널:**\n- 메시지 길이가 직전 대비 절반 이하 + 새 질문 없음 (2턴 연속이면 더 확실)\n\n**askBonus 톤 (감사·마지막·하나 표현 사용 금지):**\n- 직전 발화/대화 핵심을 한 문장 짚기 → 사주 쪽으로 자연스럽게 수렴 → 열린 초대\n- 예시:\n  - "여기까지 사주가 보여준 그림은 대충 잡힌 것 같아. 더 짚어보고 싶은 부분 있으면 편하게 던져봐."\n  - "이 사주가 풀어낸 얘기는 어느 정도 잡힌 것 같아. 더 풀고 싶은 매듭 있으면 편하게 꺼내봐."\n- [END] 마커 절대 X (이번 턴은 사용자에게 다시 공을 넘김)\n- 4~5문장 (맥락 짚기 1~2 + 사주 수렴 1 + 열린 초대 1)`
      : "";

  const wrapGuide =
    mode === "hardcap"
      ? hardcapGuide
      : mode === "converge"
        ? (isLastConvergeTurn ? convergeLastGuide : convergeOpenGuide) +
          userSignalGuide
        : "";

  const emotionBlock = buildEmotionPersonaBlock(ctx.emotionTag);

  const dynamicPart = `---

## 이번 세션 정보

[고민 내용: ${ctx.concernText}]
[사주 상품: ${ctx.sajuProduct}]
[지금까지 별콩이 턴 수: ${ctx.assistantTurnsSoFar}]

### 사주 데이터

${formatSajuBlock(ctx.saju)}${formatTemporalBlock(ctx.saju.temporal, ctx.sajuProduct)}

---
${emotionBlock}${firstTurnGuide}${wrapGuide}`;

  return { staticPart, dynamicPart };
}

export async function* streamChat(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2048
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

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemBlocks,
    messages,
  });

  let stopReason: string | null = null;
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    } else if (event.type === "message_delta") {
      stopReason = event.delta.stop_reason ?? stopReason;
    }
  }
  return stopReason;
}

/** 비스트리밍 — streamChat 을 끝까지 모아 전체 텍스트 한 번에 반환 (운세 리포트용). */
export async function generateOnce(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2048
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
    _cachedTarotPersona = readFileSync(
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
  /** 지금까지 assistant 가 응답한 턴 수 (0 = 첫 턴) */
  assistantTurnsSoFar: number;
  /** 지금까지 assistant 응답 누적 글자수 ([END]·[CARD:n] 마커 제외) */
  cumulativeAssistantChars: number;
  /** 사용자가 "대화 마무리" 버튼을 눌러 강제 종료를 요청한 턴 — hardcap 가이드 강제 */
  forceEnd?: boolean;
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
  return [`[뽑은 카드]`, ...lines].join("\n");
}

type WrapMode = "hardcap" | "converge" | "free";

function computeWrapMode(
  upcomingTurn: number,
  cumulativeChars: number,
  t: WrapThresholds
): { mode: WrapMode; isLastConvergeTurn: boolean } {
  const naturalHardcap =
    upcomingTurn >= t.hardCapTurn && cumulativeChars >= t.hardCapChars;
  const absHardcap = upcomingTurn >= t.absTurnCap;
  if (naturalHardcap || absHardcap) {
    return { mode: "hardcap", isLastConvergeTurn: false };
  }

  const isAbsCapMinus1 = upcomingTurn === t.absTurnCap - 1;
  const isHardcapMinus1NaturalPath =
    upcomingTurn === t.hardCapTurn - 1 &&
    cumulativeChars >= t.convergeStartChars;

  if (isAbsCapMinus1 || isHardcapMinus1NaturalPath) {
    return { mode: "converge", isLastConvergeTurn: true };
  }
  if (
    upcomingTurn >= t.convergeStartTurn &&
    cumulativeChars >= t.convergeStartChars
  ) {
    return { mode: "converge", isLastConvergeTurn: false };
  }
  return { mode: "free", isLastConvergeTurn: false };
}

export function buildTarotSystemMessage(ctx: TarotReadingContext): {
  staticPart: string;
  dynamicPart: string;
} {
  const staticPart = getTarotPersona();

  const isFirstTurn = ctx.assistantTurnsSoFar === 0;
  const upcomingTurn = ctx.assistantTurnsSoFar + 1;
  const t = WRAP_THRESHOLDS[ctx.spreadType];
  const absCap = t.absTurnCap;

  const { mode, isLastConvergeTurn } = computeWrapMode(
    upcomingTurn,
    ctx.cumulativeAssistantChars,
    t
  );

  const firstTurnGuide = isFirstTurn
    ? `\n\n## 첫 턴 가이드\n\n이번 턴은 **타로 풀이의 첫 응답**이야. 위 "타로 풀이 출력 구조" 의 스프레드별 흐름을 따라줘 — 여러 장이면 각 카드 해석 직전에 [CARD:n] 마커를 한 줄 단독으로 넣고, 마지막에 사용자 고민과 카드를 엮어서 답을 줘. 단정 X, 흐름·가능성·선택 키워드 중심.`
    : "";

  const hardcapGuide = `\n\n## ⚠️ 마무리 의무 (이번 턴에 반드시 종료 — askBonus 톤 절대 X)\n\n이번 응답은 대화를 **완전히 마무리하는 턴**이야. 유저가 "고마워", "알겠어", "응" 같은 시그널을 보내도 askBonus 톤으로 가지 말 것. **이 턴은 무조건 forceEnd**.\n\n유저가 마지막으로 꺼낸 얘기에 따뜻하게 답해주고 한 줄 정리한 뒤 종료해.\n\n**응답 끝에 반드시 아래 두 가지 포함:**\n1. **"별콩이는 항상 네 곁에 있어" 맥락의 한마디** — 언제든 새 카드로 돌아올 수 있다는 인상. 예: "궁금한 거 생기면 언제든 다시 카드 펼치러 와. 별콩이는 여기 있을게."\n2. **맨 마지막 줄에 [END] 마커를 단독 줄로** (이 마커가 없으면 프론트엔드가 종료 처리 못 함 — 절대 빠뜨리지 말 것)\n\n⚠️ "더 풀고 싶은 매듭 있으면…" 같은 열린 초대 문구 절대 X. 깔끔히 닫아.`;

  const convergeOpenGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${absCap}) — 종합 톤\n\n지금까지 나눈 얘기와 카드를 한 번 종합해서 핵심을 짚는 톤으로 답해. 새 주제·꼬리질문 X. 사용자가 흐름을 주도하게 두기.\n\n**톤 가이드:**\n- "결국 이 카드들이 보여주는 핵심은…", "지금까지 풀어낸 걸 한 줄로 묶으면…" 같이 정리·강조\n- 사용자가 이미 꺼낸 핵심 한 가닥을 다시 짚어주기 (새 분석 X)\n- 새 질문 던지지 않기\n- [END] 절대 X (아직 hardcap 아님)\n\n**⚠️ 사용자 마무리 시그널 감지 시 즉시 askBonus 톤으로 전환** (아래 §사용자 마무리 시그널).\n\n**금지 표현 (절벽감 유발):** "감사", "마지막 질문", "여기서 멈출까", "끝낼까".`;

  const convergeLastGuide = `\n\n## 수렴 모드 (턴 ${upcomingTurn}/${absCap}, 마지막 수렴 턴) — 적용·응원 톤 + 출구 문구\n\n다음 턴은 hardcap이라 강제 종료가 와. 이번 턴은 그 전에 사용자가 자연스럽게 마무리할 수 있도록 부드럽게 닫아가는 톤.\n\n**톤 가이드:**\n- 카드 메시지를 일상에 어떻게 적용할지 짧게 / 응원·자율성 인정 ("뭐가 됐든 너답게 해보면 돼", "카드는 거들 뿐이야")\n- 응답 후반에 **출구 문구 한 줄** 포함:\n  - "이 정도로 충분하면 여기서 멈춰도 돼. 더 풀고 싶은 매듭 있으면 던져봐도 좋고."\n- 새 질문 X. [END] 절대 X (다음 턴 hardcap에서 자동 종료).\n\n**⚠️ 사용자 마무리 시그널 감지 시 askBonus 톤으로 즉시 전환**.\n\n**금지 표현:** "감사", "마지막 질문 하나", "오늘은 여기까지".`;

  const userSignalGuide =
    mode === "converge"
      ? `\n\n### 사용자 마무리 시그널 (감지 시 askBonus 톤 전환)\n\n다음 발화·패턴 중 하나라도 보이면 이번 턴을 askBonus 톤으로 답해:\n\n**명확 시그널:** "고마워"/"감사해", "알겠어"/"그렇구나"/"이해됐어", "이정도면 돼"/"충분해", 짧은 동의("응"/"ㅇㅇ"/"그래")\n**암묵적 시그널:** 메시지 길이가 직전 대비 절반 이하 + 새 질문 없음 (2턴 연속이면 더 확실)\n\n**askBonus 톤 (감사·마지막·하나 표현 사용 금지):**\n- 직전 발화/대화 핵심을 한 문장 짚기 → 카드 쪽으로 자연스럽게 수렴 → 열린 초대\n- 예: "여기까지 카드가 보여준 그림은 대충 잡힌 것 같아. 더 짚어보고 싶은 부분 있으면 편하게 던져봐."\n- [END] 마커 절대 X (이번 턴은 사용자에게 다시 공을 넘김)\n- 4~5문장`
      : "";

  const wrapGuide = ctx.forceEnd
    ? hardcapGuide
    : mode === "hardcap"
      ? hardcapGuide
      : mode === "converge"
        ? (isLastConvergeTurn ? convergeLastGuide : convergeOpenGuide) +
          userSignalGuide
        : "";

  const emotionBlock = buildEmotionPersonaBlock(ctx.emotionTag);

  const dynamicPart = `---

## 이번 세션 정보

[고민 내용: ${ctx.concernText}]
[스프레드: ${ctx.spreadType} / 카테고리: ${ctx.spreadCategory}]
[지금까지 별콩이 턴 수: ${ctx.assistantTurnsSoFar}]

${formatDrawnCardsBlock(ctx.drawnCards)}

---
${emotionBlock}${firstTurnGuide}${wrapGuide}`;

  return { staticPart, dynamicPart };
}
