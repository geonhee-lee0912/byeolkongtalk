// qa/readings.ts — 사주/타로 reading을 실제 API로 생성.
import { postJson } from "./client.ts";
import { resetRelationship, preseedThreadTurns } from "./seed.ts";
import type { Case } from "./types.ts";
import type { ProfileInput } from "../lib/saju/profile-input.ts";
import { SPREAD_INFO } from "../lib/tarot/spreads.ts";
import { PASS_PLAN_BY_KIND } from "../lib/relationship/types.ts";
import { getSkill } from "../lib/relationship/skills.ts";

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

export async function createRelationshipReading(c: Case): Promise<CreatedReading> {
  if (c.product.kind !== "relationship") throw new Error("not relationship case");
  // 유저당 관계 1개(unique index) → 케이스마다 초기화 후 새로 등록 (상태 격리)
  await resetRelationship();

  const reg = await postJson<{ id?: string; threadReadingId?: string; error?: string }>(
    "/api/relationship",
    { label: "QA상대", status: c.product.status }
  );
  if (reg.status !== 200 || !reg.json.id)
    throw new Error(`[readings] relationship 등록 실패 ${reg.status}: ${JSON.stringify(reg.json)}`);
  const relationshipId = reg.json.id;

  let cost = 0;
  // pass_gate 케이스는 패스 미구매 → 첫 chat 이 402 pass_required
  if (!c.seed.skipPass) {
    const plan = PASS_PLAN_BY_KIND[c.product.passKind];
    const pass = await postJson<{ success?: boolean; error?: string }>(
      "/api/relationship/pass",
      { relationshipId, kind: c.product.passKind }
    );
    if (pass.status !== 200 || !pass.json.success)
      throw new Error(`[readings] 패스 구매 실패 ${pass.status}: ${JSON.stringify(pass.json)}`);
    cost += plan.cost;
  }
  // daily_close 케이스: 오늘자 user 턴 프리시드로 다음 1콜이 소프트캡을 넘게
  if (c.seed.preseedTurns && reg.json.threadReadingId) {
    await preseedThreadTurns(reg.json.threadReadingId, c.seed.preseedTurns);
  }
  // 스레드 chat 은 relationshipId 로 호출 → readingId 필드에 담아 driver 가 사용
  return { readingId: relationshipId, cost };
}

export async function createVerdictReading(c: Case): Promise<CreatedReading> {
  if (c.product.kind !== "verdict") throw new Error("not verdict case");
  await resetRelationship();

  const reg = await postJson<{ id?: string; error?: string }>(
    "/api/relationship",
    { label: "QA상대", status: c.product.status }
  );
  if (reg.status !== 200 || !reg.json.id)
    throw new Error(`[readings] verdict용 relationship 등록 실패 ${reg.status}: ${JSON.stringify(reg.json)}`);
  const relationshipId = reg.json.id;

  const plan = PASS_PLAN_BY_KIND[c.product.passKind];
  const pass = await postJson<{ success?: boolean }>(
    "/api/relationship/pass",
    { relationshipId, kind: c.product.passKind }
  );
  if (pass.status !== 200 || !pass.json.success)
    throw new Error(`[readings] verdict용 패스 구매 실패 ${pass.status}`);

  // 판정 개시(30별 차감)는 driver가 skillStart로 수행. 총 차감 = 패스 + 판정 30.
  const verdictCost = getSkill("verdict")?.starCost ?? 0;
  return { readingId: relationshipId, cost: plan.cost + verdictCost };
}

export function createReading(c: Case): Promise<CreatedReading> {
  switch (c.product.kind) {
    case "saju":
      return createSajuReading(c);
    case "tarot":
      return createTarotReading(c);
    case "relationship":
      return createRelationshipReading(c);
    case "verdict":
      return createVerdictReading(c);
  }
}
