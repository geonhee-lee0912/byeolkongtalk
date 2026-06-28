// qa/seed.ts — (stub; full impl in Task 3)
import { getServiceSupabase } from "../lib/supabase.ts";
import { config } from "./config.ts";
export async function getBalance(): Promise<number> {
  const db = getServiceSupabase();
  const { data } = await db.from("star_balances").select("balance").eq("user_id", config.TEST_USER_ID).single();
  return data?.balance ?? 0;
}
