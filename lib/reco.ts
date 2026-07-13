// lib/reco.ts — 다음 상담 추천: [RECO:] 마커 파싱 + haiku 태깅 + 표시 메타.
// 순수 유틸(strip/parse/타입/상수)은 lib/reco-utils.ts — 클라이언트 컴포넌트는 그 파일을 import.
import Anthropic from "@anthropic-ai/sdk";

export type {
  RecoProduct,
} from "./reco-utils";
export {
  RECO_PRODUCTS,
  RECO_MARKER_REGEX,
  stripRecoMarkers,
  parseRecoMarker,
} from "./reco-utils";

import type { RecoProduct } from "./reco-utils";
import { RECO_PRODUCTS } from "./reco-utils";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export interface NextReco {
  product: RecoProduct;
  question: string | null;
  hook: string | null;
  source: "marker" | "haiku";
  created_at: string;
}

/** 결과 카드 표시 메타 — 라벨·기본 훅 카피(마커 소스용)·진입 대상. */
export const RECO_DISPLAY: Record<
  RecoProduct,
  { label: string; defaultHook: string; target: "saju" | "tarot" | "continue"; sajuProduct?: string; spreadType?: string }
> = {
  "saju:good_days": {
    label: "사주 · 좋은 날",
    defaultHook: "궁금했던 '그 날'의 결 — 앞으로 30일 흐름은 좋은 날 상담이 짚어줄 수 있어",
    target: "saju",
    sajuProduct: "good_days",
  },
  "saju:nature": {
    label: "사주 · 타고난 결",
    defaultHook: "이 고민의 뿌리 — 타고난 흐름은 사주가 더 깊게 봐줄 수 있어",
    target: "saju",
    sajuProduct: "nature",
  },
  "saju:choice": {
    label: "사주 · 선택의 갈림길",
    defaultHook: "그 선택의 결 — 갈림길은 사주 선택 상담이 같이 봐줄 수 있어",
    target: "saju",
    sajuProduct: "choice",
  },
  "tarot:relationship_5": {
    label: "타로 · 관계 스프레드",
    defaultHook: "그 사람 마음의 결 — 두 사람 자리를 따로 펼치는 관계 카드가 비춰줄 수 있어",
    target: "tarot",
    spreadType: "relationship_5",
  },
  continue: {
    label: "이 고민 이어가기",
    defaultHook: "오늘 못다 푼 매듭 — 지난 맥락 그대로 이어서 볼 수 있어",
    target: "continue",
  },
};

const TAG_SCHEMA = `너는 상담 대화를 읽고 "다음 상담 추천"을 JSON 한 개로만 답하는 분류기다.
출력 형식: {"unresolvedQuestion": string|null, "product": string, "hook": string}
- unresolvedQuestion: 유저가 끝내 답을 못 받은 핵심 질문 (없으면 null)
- product: 다음 중 하나 — "saju:good_days"(날짜·시기 갈증) / "saju:nature"(본질·방향) / "saju:choice"(선택 갈림길) / "tarot:relationship_5"(상대방 속마음) / "continue"(위에 해당 없음, 같은 고민 계속)
- hook: 유저의 미해결 질문을 짚는 한 문장 초대 카피 (반말, 40자 이내, 가격·별 언급 금지)
JSON 외 텍스트 금지.`;

/** [END] 후 fire-and-forget — next_reco 없을 때만 호출할 것. 실패 시 null (조용히). */
export async function tagNextRecoAsync(
  conversationText: string,
  consultationType: "saju" | "tarot"
): Promise<Omit<NextReco, "created_at" | "source"> | null> {
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: TAG_SCHEMA,
      messages: [
        {
          role: "user",
          content: `[상담 종류: ${consultationType}]\n${conversationText.slice(-4000)}`,
        },
      ],
    });
    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const product = (RECO_PRODUCTS as string[]).includes(json.product)
      ? (json.product as RecoProduct)
      : null;
    if (!product) return null;
    return {
      product,
      question: typeof json.unresolvedQuestion === "string" ? json.unresolvedQuestion.slice(0, 120) : null,
      hook: typeof json.hook === "string" ? json.hook.slice(0, 80) : null,
    };
  } catch (e) {
    console.warn("[reco] 태깅 실패 (무시):", e instanceof Error ? e.message : e);
    return null;
  }
}
