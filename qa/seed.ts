// qa/seed.ts — 테스트 유저/잔액 보장 + 이전 데이터 정리 (service role).
import { getServiceSupabase } from "../lib/supabase.ts";
import { baseDateForKst, calcTemporalLuck } from "../lib/saju/calc.ts";
import { kstDate } from "../lib/admin-time.ts";
import { PROMPT_VERSION } from "../lib/prompt-version.ts";
import type { SajuProduct } from "../lib/saju/products.ts";
import { config } from "./config.ts";

export async function ensureTestUser(): Promise<void> {
  const db = getServiceSupabase();

  // users upsert (id 고정, kakao_id 음수 센티넬)
  const { error: uErr } = await db.from("users").upsert(
    {
      id: config.TEST_USER_ID,
      kakao_id: config.TEST_KAKAO_ID,
      nickname: config.TEST_NICKNAME,
    },
    { onConflict: "id" }
  );
  if (uErr) throw new Error(`[seed] users upsert 실패: ${uErr.message}`);

  // star_balances upsert
  const { error: bErr } = await db.from("star_balances").upsert(
    { user_id: config.TEST_USER_ID, balance: config.SEED_BALANCE },
    { onConflict: "user_id" }
  );
  if (bErr) throw new Error(`[seed] star_balances upsert 실패: ${bErr.message}`);
}

export async function topUpStars(): Promise<void> {
  const db = getServiceSupabase();
  const { error } = await db
    .from("star_balances")
    .update({ balance: config.SEED_BALANCE })
    .eq("user_id", config.TEST_USER_ID);
  if (error) throw new Error(`[seed] topUp 실패: ${error.message}`);
}

/** 테스트 유저의 이전 readings/messages/sensitive_alerts purge.
 *  readings → messages 는 CASCADE. sensitive_alerts 는 user_id로 직접 삭제. */
export async function cleanTestData(): Promise<void> {
  const db = getServiceSupabase();
  await db.from("sensitive_alerts").delete().eq("user_id", config.TEST_USER_ID);
  // 관계 먼저 삭제 → relationship_passes + 스레드/스킬 readings(→messages) 가 CASCADE.
  // readings 를 user_id 로만 지우면 relationships.thread_reading_id 가 SET NULL 로 남고,
  // 등록이 멱등이라 재실행 시 thread 없는 관계를 재사용해 404 가 난다.
  await db.from("relationships").delete().eq("user_id", config.TEST_USER_ID);
  await db.from("readings").delete().eq("user_id", config.TEST_USER_ID);
}

/** 사주 상담은 종료돼 POST /api/readings 가 410 이다(lib/saju/closed). 끝나지 않은 상담은 마저 할 수 있어 QA 는
 *  그 상태를 바로 심는다 — 일회성 프로필(profile_id 없음), 오늘의 기둥 포함(닫힌 라우트가 저장하던 모양). 별은 안 깎는다. */
export async function seedSajuReading(input: {
  saju: unknown;
  birthYear: number;
  question: string;
  emotion: string;
  sajuProduct: SajuProduct;
}): Promise<string> {
  const db = getServiceSupabase();
  const temporal = calcTemporalLuck(baseDateForKst(kstDate(new Date().toISOString())), input.birthYear, {
    includeMonth: input.sajuProduct === "good_days",
  });
  const { data, error } = await db
    .from("readings")
    .insert({
      user_id: config.TEST_USER_ID,
      consultation_type: "saju",
      question: input.question,
      saju_data: { ...(input.saju as Record<string, unknown>), temporal },
      emotion_tag: input.emotion,
      saju_product: input.sajuProduct,
      stars_spent: 0,
      has_sensitive: false,
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`[seed] 사주 상담 심기 실패: ${error?.message ?? "빈 응답"}`);
  return data.id as string;
}

/** 관계 케이스 간 격리 — 유저당 관계 1개(unique index) 제약 때문에 각 관계/verdict
 *  케이스 생성 전에 기존 관계를 초기화. relationships 삭제 → passes + 스레드/스킬
 *  readings(→messages) CASCADE. */
export async function resetRelationship(): Promise<void> {
  const db = getServiceSupabase();
  await db.from("relationships").delete().eq("user_id", config.TEST_USER_ID);
}

/** daily_close 케이스: 스레드에 오늘자 user/assistant 쌍을 pairCount 만큼 미리 심는다.
 *  splitThreadMessages 가 user-start 를 보장하므로 교대 쌍이어야 Anthropic 호환. 다음 실제
 *  chat 1콜이 "오늘 user 턴 >= DAILY_TURN_CAP" 를 만족해 X-Daily-Cap: reached 를 내게 함. */
export async function preseedThreadTurns(
  threadReadingId: string,
  pairCount: number
): Promise<void> {
  const db = getServiceSupabase();
  const now = Date.now();
  const rows: {
    reading_id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[] = [];
  for (let i = 0; i < pairCount; i++) {
    const base = now - (pairCount - i) * 2000; // 오늘 범위 내, 순서 보존
    rows.push({ reading_id: threadReadingId, role: "user", content: `(QA 프리시드 질문 ${i + 1})`, created_at: new Date(base).toISOString() });
    rows.push({ reading_id: threadReadingId, role: "assistant", content: `(QA 프리시드 답 ${i + 1})`, created_at: new Date(base + 1000).toISOString() });
  }
  const { error } = await db.from("messages").insert(rows);
  if (error) throw new Error(`[seed] preseed 실패: ${error.message}`);
}

export async function getBalance(): Promise<number> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("star_balances")
    .select("balance")
    .eq("user_id", config.TEST_USER_ID)
    .single();
  return data?.balance ?? 0;
}
