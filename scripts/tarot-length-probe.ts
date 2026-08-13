// scripts/tarot-length-probe.ts — TEMP reproduction asset. Run: npx tsx scripts/tarot-length-probe.ts
//
// 목적: 타로 대표 스프레드 6종의 "첫 풀이"를 실제 chat 모델(gpt-5.6-luna, OpenAI 어댑터)로 생성해
// 산문 글자수를 측정하는 일회성 프로브 — "타로 재정리(luna 재튠)" 플랜 Task 1 의 baseline 측정
// 도구. 이후 태스크(byeolkong_tarot.md 재튠 등)가 분량 조정 전/후를 이 스크립트로 비교 재실측한다.
//
// ⚠️ 실제 luna API 호출 6건 발생(비용/시간) — 반복 실행하지 말 것.
//
// system 조립은 프로덕션 첫 풀이 경로(app/api/consultations/tarot/chat/route.ts)가 쓰는
// buildTarotSystemMessage(lib/claude.ts, export 됨)를 그대로 재사용한다 — 라우트 로직을 복제하지
// 않는다. 모델 호출도 streamChat(lib/claude.ts)을 그대로 재사용해 OpenAI 어댑터의
// reasoning_effort/max_tokens 등을 프로덕션과 100% 정합시킨다(어댑터 직접 호출 X).
//
// Baseline (2026-08-13 실측, 1회 실행 — 전부 완결 응답, max_tokens 절단 0건):
//   one_card          (1장)  산문 816자  목표 400~900        → 밴드 안(상단 91%)
//   two_card          (2장)  산문 958자  목표 400~900        → 상한 +58자(+6.4%) 초과
//   three_card        (3장)  산문 1,813자 목표 1,300~1,700   → 상한 +113자(+6.6%) 초과
//   deep_feelings_5   (5장)  산문 3,075자 목표 2,300~2,750   → 상한 +325자(+11.8%) 초과
//   checkin_6         (6장)  산문 5,506자 목표 2,700~3,200   → 상한 +2,306자(+72.1%) 초과 ⚠️ 이상치
//   chakra_7          (7장)  산문 4,330자 목표 3,300~3,800   → 상한 +530자(+13.9%) 초과
// → 예상과 반대 방향: "미달 스프레드 견인 상향"이 필요할 거란 플랜의 가정과 달리, 6종 전부
//   밴드 안이거나 초과이며 미달은 0건. checkin_6 만 나머지(6~14% 초과)와 다른 규모(72%)로 튀는
//   이상치 — 6장 카드마다 💫 파트가 3~4문장 지침을 크게 넘겨(카드당 체감 5~7문장) 누적된 것으로
//   보이나 n=1 단발 실행이라 확정 아님(재실행 검증 필요, 이 스크립트는 비용상 반복 실행 금지 주석
//   참고). max_tokens=3600 캡 근접(3600 tok × 1.6자/tok 관행치 ≈ 5,760자 이론 상한)이지만 stop_reason
//   은 6건 전부 non-max_tokens(완결 응답) — 절단이 아니라 luna 가 실제로 다 쓰고 스스로 멈췄다.
// 형식 관측: 5장 이상 3종(deep_feelings_5·checkin_6·chakra_7) 전부 🃏/💫/🔗 3라벨 골격 정상 출력
//   (골격 생략 없음). **볼드** 마크다운은 6종 전부 0건(평문 렌더 규칙 위반 없음). 플랜이 우려한
//   두 형식 이탈(골격 생략·볼드 사용) 모두 이번 baseline 에서는 관측되지 않음 — luna 의 실제
//   이탈 지점은 형식이 아니라 "분량 과다"(특히 checkin_6) 쪽으로 보인다. 후속 태스크(재튠) 판단은
//   이 관측을 반영해 재검토할 것 — 방향 전환은 이 태스크 범위 밖이라 별도 확인 필요.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTarotSystemMessage, streamChat, computeTurnSignals } from "@/lib/claude";
import { CHAT_MODEL } from "@/lib/claude/model-registry";
import {
  getPositionLabels,
  type SpreadType,
  type SpreadCategory,
  type DrawnCard,
} from "@/lib/tarot/spreads";
import type { EmotionTag } from "@/lib/emotions";

// .env.local 값이 따옴표로 감싸져 있을 수 있음(예: OPENAI_API_KEY="sk-...") — 벗겨내지 않으면
// 따옴표 문자가 키에 섞여 들어가 401 로 실패한다 (scripts/fortune-length-probe.ts 와 동일 패턴).
// 🔴 키 값은 절대 로그하거나 길이/문자 단위로 들여다보지 않는다 — process.env 에 대입해
// openai 어댑터(lib/claude/adapters/openai.ts)의 lazy client()가 그대로 집어가게만 한다.
const rawKeyValue = readFileSync(join(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("OPENAI_API_KEY="))
  ?.slice("OPENAI_API_KEY=".length)
  .trim();
const key =
  rawKeyValue && rawKeyValue.length >= 2 && rawKeyValue[0] === rawKeyValue[rawKeyValue.length - 1] && (rawKeyValue[0] === '"' || rawKeyValue[0] === "'")
    ? rawKeyValue.slice(1, -1)
    : rawKeyValue;
if (!key) {
  console.error("no OPENAI_API_KEY");
  process.exit(1);
}
process.env.OPENAI_API_KEY = key;

// ===== 대표 스프레드 6종 fixture =====
// category/tag 는 lib/tarot/spreads.ts 의 TAG_SPREADS 실제 큐레이션과 정합되게 골랐다 —
// 예: deep_feelings_5 는 실제로 "걔 속마음이 궁금해" 태그 밑에 큐레이션된 스프레드다.

interface SpreadFixture {
  spread: SpreadType;
  category: SpreadCategory;
  tag: EmotionTag;
  concern: string;
}

const SPREADS: SpreadFixture[] = [
  {
    spread: "one_card",
    category: "love",
    tag: "걔 속마음이 궁금해",
    concern: "3개월째 썸타는 사람이 있는데 요즘 연락이 뜸해져서 그 사람 진짜 마음이 어떤지 궁금해",
  },
  {
    spread: "two_card",
    category: "love",
    tag: "걔 속마음이 궁금해",
    concern: "3개월째 썸타는 사람이 있는데 요즘 연락이 뜸해져서 그 사람 진짜 마음이 어떤지 궁금해",
  },
  {
    spread: "three_card",
    category: "love",
    tag: "걔 속마음이 궁금해",
    concern: "3개월째 썸타는 사람이 있는데 요즘 연락이 뜸해져서 그 사람 진짜 마음이 어떤지 궁금해",
  },
  {
    spread: "deep_feelings_5",
    category: "love",
    tag: "걔 속마음이 궁금해",
    concern: "3개월째 썸타는 사람이 있는데 요즘 연락이 뜸해져서 그 사람 진짜 마음이 어떤지 궁금해",
  },
  {
    spread: "checkin_6",
    category: "love",
    tag: "요즘 우리, 예전 같지 않아",
    concern: "6개월째 만나는 사람인데 요즘 예전만큼 살갑지 않아서 마음이 식은 건 아닌지 걱정돼",
  },
  {
    spread: "chakra_7",
    category: "mental",
    tag: "그냥 별콩이한테 털어놓고 싶어",
    concern: "요즘 이유 없이 마음이 붕 뜨고 불안해서 그냥 지금 내 마음 상태가 어떤지 들여다보고 싶어",
  },
];

// 실재 카드(lib/tarot/cards.ts, 메이저 아르카나 0~6 — data/tarot_card_data.json 로 실존 확인) 중
// 앞쪽 7장을 그대로 씀. 정/역 교차로 방향도 섞는다.
const CARD_IDS = [0, 1, 2, 3, 4, 5, 6];

function buildDrawnCards(spread: SpreadType, category: SpreadCategory, tag: EmotionTag): DrawnCard[] {
  const labels = getPositionLabels(spread, category, tag);
  return labels.map((label, i): DrawnCard => ({
    position: i + 1,
    label,
    card_id: CARD_IDS[i],
    direction: i % 2 === 0 ? "upright" : "reversed",
  }));
}

// 카드 수 그룹별 첫 풀이 목표 자수 (byeolkong_tarot.md:90-96)
const TARGET_BAND: Record<number, string> = {
  1: "400~900",
  2: "400~900",
  3: "1,300~1,700",
  5: "2,300~2,750",
  6: "2,700~3,200",
  7: "3,300~3,800",
};

async function main() {
  for (const { spread, category, tag, concern } of SPREADS) {
    const drawnCards = buildDrawnCards(spread, category, tag);

    const systemMessage = buildTarotSystemMessage({
      spreadType: spread,
      spreadCategory: category,
      concernText: concern,
      drawnCards,
      emotionTag: tag,
      turnSignals: computeTurnSignals([], concern),
      assistantTurnsSoFar: 0,
      cumulativeAssistantChars: 0,
      continuation: undefined,
      forceEnd: false,
      crisisActive: false,
      extendAvailable: true,
      thresholdOverride: undefined,
    });

    // route.ts:226-227 과 동일 규칙 — 첫 풀이 + 5장 이상만 3600 상향, 나머진 streamChat 기본값(2660).
    const maxTokens = drawnCards.length >= 5 ? 3600 : undefined;

    // 프로덕션 첫 턴 유저 메시지 = concern 그 자체
    // (app/tarot/reading/page.tsx: `sendMessage([{ role: "user", content: parsed.concern }], ...)`).
    const apiMessages = [{ role: "user" as const, content: concern }];

    try {
      const gen = streamChat(
        systemMessage,
        apiMessages,
        maxTokens,
        { route: "scripts/tarot-length-probe" },
        CHAT_MODEL
      );
      let raw = "";
      let r = await gen.next();
      while (!r.done) {
        raw += r.value;
        r = await gen.next();
      }
      const truncated = r.value === "max_tokens";

      const hasSkeleton = /🃏/.test(raw) && /💫/.test(raw) && /🔗/.test(raw);
      const hasBold = /\*\*[^*]+\*\*/.test(raw);

      console.log(`\n===== ${spread} (${drawnCards.length}장) =====`);
      console.log(
        `산문 ${raw.length}자  목표 ${TARGET_BAND[drawnCards.length]}자${truncated ? "  ⚠️TRUNCATED(측정값 불신)" : ""}`
      );
      if (drawnCards.length >= 5) {
        console.log(`골격(🃏/💫/🔗 3라벨): ${hasSkeleton ? "O" : "X"}`);
      }
      console.log(`볼드(**) 사용: ${hasBold ? "O — 위반(평문 렌더 규칙 이탈)" : "X"}`);
      console.log(`--- 원문 ---\n${raw}\n`);
    } catch (err) {
      console.error(`${spread} ERROR`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((e) => {
  console.error("probe 실패:", e);
  process.exit(1);
});
