// qa/seed.ts — 테스트 유저/잔액 보장 + 이전 데이터 정리 (service role).
import { getServiceSupabase } from "../lib/supabase.ts";
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
  await db.from("readings").delete().eq("user_id", config.TEST_USER_ID);
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
