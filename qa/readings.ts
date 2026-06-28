// qa/readings.ts — 사주/타로 reading을 실제 API로 생성.
import { postJson } from "./client.ts";
import type { Case } from "./types.ts";
import type { ProfileInput } from "../lib/saju/profile-input.ts";
import { SPREAD_INFO } from "../lib/tarot/spreads.ts";

const DEFAULT_PROFILE: ProfileInput = {
  displayName: "QA봇",
  relationType: "self",
  birthDate: "1995-05-15",
  birthTime: "10:30",
  isLunarInput: false,
  isLeapMonth: false,
  gender: "female",
};

export interface CreatedReading {
  readingId: string;
  cost: number;
}

export async function createSajuReading(c: Case): Promise<CreatedReading> {
  if (c.product.kind !== "saju") throw new Error("not saju case");
  const profile = c.seed.profile ?? DEFAULT_PROFILE;

  // 1) calc — sajuData 산출
  const calc = await postJson<{ saju?: unknown; error?: string }>(
    "/api/consultations/saju/calc",
    {
      year: Number(profile.birthDate.slice(0, 4)),
      month: Number(profile.birthDate.slice(5, 7)),
      day: Number(profile.birthDate.slice(8, 10)),
      hour: profile.birthTime ? Number(profile.birthTime.slice(0, 2)) : null,
      minute: profile.birthTime ? Number(profile.birthTime.slice(3, 5)) : null,
      isLunar: profile.isLunarInput,
      isLeapMonth: profile.isLeapMonth,
      gender: profile.gender,
    }
  );
  if (calc.status !== 200 || !calc.json.saju)
    throw new Error(`[readings] calc 실패 ${calc.status}: ${JSON.stringify(calc.json)}`);

  // 2) readings INSERT + 별 차감
  const r = await postJson<{ id?: string; cost?: number; error?: string; code?: string }>(
    "/api/readings",
    {
      profile,
      save: false,
      sajuData: calc.json.saju,
      question: c.seedConcern,
      emotion: c.emotion,
      sajuProduct: c.product.sajuProduct,
    }
  );
  if (r.status !== 200 || !r.json.id)
    throw new Error(`[readings] saju 생성 실패 ${r.status}: ${JSON.stringify(r.json)}`);
  return { readingId: r.json.id, cost: r.json.cost ?? 0 };
}

export async function createTarotReading(c: Case): Promise<CreatedReading> {
  if (c.product.kind !== "tarot") throw new Error("not tarot case");
  const info = SPREAD_INFO[c.product.spreadType];

  // 결정적 카드 선택 (card_id 0..n-1, 전부 정방향) — QA 재현성 위해 고정
  const drawnCards = Array.from({ length: info.cardCount }, (_, i) => ({
    position: i,
    label: `pos${i}`,
    card_id: i,
    direction: "upright" as const,
  }));

  const r = await postJson<{ id?: string; cost?: number; error?: string }>(
    "/api/consultations/tarot",
    {
      spreadType: c.product.spreadType,
      spreadCategory: c.product.spreadCategory,
      emotion: c.emotion,
      concern: c.seedConcern,
      drawnCards,
    }
  );
  if (r.status !== 200 || !r.json.id)
    throw new Error(`[readings] tarot 생성 실패 ${r.status}: ${JSON.stringify(r.json)}`);
  return { readingId: r.json.id, cost: r.json.cost ?? 0 };
}

export function createReading(c: Case): Promise<CreatedReading> {
  return c.product.kind === "saju" ? createSajuReading(c) : createTarotReading(c);
}
