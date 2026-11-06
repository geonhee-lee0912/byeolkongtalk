// 푸시 표 저장소 — 전부 service_role. supabase-js 는 DB 에러를 throw 하지 않고 { error } 로 돌려주므로
// 매번 확인해 던진다(확인하지 않으면 실패가 빈 결과로 조용히 지나간다).
// 마지막 인자 db 는 시험에서 가짜 클라이언트를 꽂는 자리다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase";

type Db = SupabaseClient;

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`push store ${what}: ${error.message}`);
}

export async function upsertDevice(
  d: { token: string; userId: string; platform: "ios" | "android"; appVersion: string | null },
  db: Db = getServiceSupabase(),
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from("push_devices").upsert(
    { token: d.token, user_id: d.userId, platform: d.platform, app_version: d.appVersion, last_seen_at: now, disabled_at: null },
    { onConflict: "token" },
  );
  check(error, "upsertDevice");
}

export async function deleteDevice(token: string, db: Db = getServiceSupabase()): Promise<void> {
  const { error } = await db.from("push_devices").delete().eq("token", token);
  check(error, "deleteDevice");
}

export async function activeDeviceTokens(userId: string, db: Db = getServiceSupabase()): Promise<string[]> {
  const { data, error } = await db.from("push_devices").select("token").eq("user_id", userId).is("disabled_at", null);
  check(error, "activeDeviceTokens");
  return (data ?? []).map((r: { token: string }) => r.token);
}

export async function disableTokens(tokens: string[], db: Db = getServiceSupabase()): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await db.from("push_devices").update({ disabled_at: new Date().toISOString() }).in("token", tokens);
  check(error, "disableTokens");
}

export async function getRevisitPref(userId: string, db: Db = getServiceSupabase()): Promise<boolean> {
  const { data, error } = await db.from("push_preferences").select("revisit").eq("user_id", userId).maybeSingle();
  check(error, "getRevisitPref");
  return data ? data.revisit !== false : true;
}

export async function setRevisitPref(userId: string, on: boolean, db: Db = getServiceSupabase()): Promise<void> {
  const { error } = await db
    .from("push_preferences")
    .upsert({ user_id: userId, revisit: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  check(error, "setRevisitPref");
}

export async function listAskMoments(userId: string, db: Db = getServiceSupabase()): Promise<string[]> {
  const { data, error } = await db.from("push_asks").select("moment").eq("user_id", userId);
  check(error, "listAskMoments");
  return (data ?? []).map((r: { moment: string }) => r.moment);
}

export async function recordAsk(
  userId: string,
  moment: "first_reading_end",
  answer: "accepted" | "later" | "os_denied",
  db: Db = getServiceSupabase(),
): Promise<void> {
  const { error } = await db.from("push_asks").insert({ user_id: userId, moment, answer });
  check(error, "recordAsk");
}

export async function getRevisit(
  userId: string,
  readingId: string,
  db: Db = getServiceSupabase(),
): Promise<{ sendOn: string; status: string } | null> {
  const { data, error } = await db
    .from("push_schedules")
    .select("send_on, status")
    .eq("user_id", userId)
    .eq("reading_id", readingId)
    .eq("kind", "revisit")
    .maybeSingle();
  check(error, "getRevisit");
  return data ? { sendOn: data.send_on as string, status: data.status as string } : null;
}

/** pending 이면 send_on 갱신, sent/skipped 면 건드리지 않고 already_sent. 행이 없으면 만든다. */
export async function upsertRevisit(
  userId: string,
  readingId: string,
  sendOn: string,
  db: Db = getServiceSupabase(),
): Promise<"ok" | "already_sent"> {
  const { data: updated, error: upErr } = await db
    .from("push_schedules")
    .update({ send_on: sendOn })
    .eq("user_id", userId)
    .eq("reading_id", readingId)
    .eq("kind", "revisit")
    .eq("status", "pending")
    .select("id");
  check(upErr, "upsertRevisit(update)");
  if (updated && updated.length > 0) return "ok";

  const { error: insErr } = await db
    .from("push_schedules")
    .insert({ user_id: userId, kind: "revisit", reading_id: readingId, send_on: sendOn });
  if (!insErr) return "ok";
  if (insErr.code === "23505") {
    // 이미 행이 있는데 pending 이 아니다(위 update 가 못 건드림) — 또는 동시 삽입 경쟁.
    const cur = await getRevisit(userId, readingId, db);
    if (cur && cur.status !== "pending") return "already_sent";
    const { error: retryErr } = await db
      .from("push_schedules")
      .update({ send_on: sendOn })
      .eq("user_id", userId)
      .eq("reading_id", readingId)
      .eq("kind", "revisit")
      .eq("status", "pending");
    check(retryErr, "upsertRevisit(retry)");
    return "ok";
  }
  check(insErr, "upsertRevisit(insert)");
  return "ok";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 리딩 주인. UUID 모양이 아니거나 없으면 null(호출자는 둘을 같게 다뤄 존재 여부를 흘리지 않는다). */
export async function readingOwner(readingId: string, db: Db = getServiceSupabase()): Promise<string | null> {
  if (!UUID_RE.test(readingId)) return null;
  const { data, error } = await db.from("readings").select("user_id").eq("id", readingId).maybeSingle();
  check(error, "readingOwner");
  return data ? ((data.user_id as string | null) ?? null) : null;
}
