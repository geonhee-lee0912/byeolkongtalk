// lib/relationship/draw-thread.ts — 인-스레드 카드뽑기(Phase 3) 순수 로직.
// 스레드에 저장되는 "카드 스트립" 메시지의 직렬화/파싱, 클라가 보낸 카드의 위조 검증(서버 권위),
// 모델 최근창용 치환, 풀이 텍스트의 [CARD:n] 단락 분할.
import { getCard } from "@/lib/tarot/cards";
import type { DrawnCard, SpreadType } from "@/lib/tarot/spreads";
import type { ThreadMsg } from "./memory";

export interface ThreadDraw {
  v: 1;
  skill: string;
  spread: SpreadType;
  cards: DrawnCard[];
}

/** 스트립 메시지 content 직렬화 (assistant 메시지 1건에 그대로 저장). */
export function serializeThreadDraw(input: {
  skill: string;
  spread: SpreadType;
  cards: DrawnCard[];
}): string {
  const payload: ThreadDraw = { v: 1, skill: input.skill, spread: input.spread, cards: input.cards };
  return JSON.stringify(payload);
}

/** 메시지 content 가 스트립이면 파싱, 아니면 null. (렌더 분기 판정용) */
export function tryParseThreadDraw(raw: string): ThreadDraw | null {
  const s = raw.trim();
  if (!s.startsWith("{")) return null;
  try {
    const o = JSON.parse(s) as Partial<ThreadDraw>;
    if (o?.v !== 1) return null;
    if (typeof o.skill !== "string" || typeof o.spread !== "string") return null;
    if (!Array.isArray(o.cards) || o.cards.length === 0) return null;
    return o as ThreadDraw;
  } catch {
    return null;
  }
}

/** 클라가 보낸 drawnCards 검증. 통과하면 label 을 서버 labels 로 재계산해 반환, 실패 시 null. */
export function validateDrawnCards(
  input: unknown,
  cardCount: number,
  labels: string[]
): DrawnCard[] | null {
  if (!Array.isArray(input) || input.length !== cardCount) return null;
  if (labels.length !== cardCount) return null;
  const seen = new Set<number>();
  const out: DrawnCard[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i] as { card_id?: unknown; direction?: unknown };
    const id = c?.card_id;
    if (typeof id !== "number" || !Number.isInteger(id)) return null;
    if (seen.has(id)) return null;
    if (!getCard(id)) return null;
    if (c?.direction !== "upright" && c?.direction !== "reversed") return null;
    seen.add(id);
    out.push({ position: i, card_id: id, direction: c.direction, label: labels[i] });
  }
  return out;
}

/** 스트립 JSON assistant 메시지를 짧은 자연어로 치환(모델이 JSON 을 되뇌지 않게).
 *  role·길이 불변 — 치환이지 필터 아님. 카드 내용은 system 의 [뽑은 카드] 블록으로 들어간다. */
export function redactDrawForModel(rows: ThreadMsg[]): ThreadMsg[] {
  return rows.map((m) => {
    if (m.role !== "assistant") return m;
    const draw = tryParseThreadDraw(m.content);
    if (!draw) return m;
    return {
      role: "assistant",
      content: `(별콩이가 카드를 ${draw.cards.length}장 뽑아서 펼쳐봤어)`,
    };
  });
}

export interface CardSegment {
  /** 1-based 카드 번호. null = 마커 이전(도입부) 세그먼트 */
  cardIndex: number | null;
  text: string;
}

/** 풀이 텍스트를 [CARD:n] 기준으로 분할하고 마커를 제거. 빈 세그먼트는 버린다. */
export function splitByCardMarker(raw: string): CardSegment[] {
  const re = /\[CARD:(\d+)\]/g;
  const segs: CardSegment[] = [];
  let lastIndex = 0;
  let current: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const chunk = raw.slice(lastIndex, m.index).trim();
    if (chunk) segs.push({ cardIndex: current, text: chunk });
    current = Number(m[1]);
    lastIndex = m.index + m[0].length;
  }
  const tail = raw.slice(lastIndex).trim();
  if (tail) segs.push({ cardIndex: current, text: tail });
  return segs.length > 0 ? segs : [{ cardIndex: null, text: raw.trim() }];
}
