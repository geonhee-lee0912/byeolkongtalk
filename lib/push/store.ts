// 푸시 표 저장소 — 전부 service_role. supabase-js 는 DB 에러를 throw 하지 않고 { error } 로 돌려주므로
// 매번 확인해 던진다(확인하지 않으면 실패가 빈 결과로 조용히 지나간다).
// 마지막 인자 db 는 시험에서 가짜 클라이언트를 꽂는 자리다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { devicesOverCap } from "./device-cap.ts";
import type { DispatchStore } from "./dispatch.ts";
import type { AdStatus, AskAnswer, AskKind, AskMoment, AskRecord } from "./asks.ts";
import type { AdConsentRow, SetConsentResult } from "./user-api.ts";
import type { ReconfirmCandidate, ReconfirmStore } from "./reconfirm-job.ts";

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

/** 기기 상한(MAX_ACTIVE_DEVICES_PER_USER)을 넘은 이 회원의 켜진 기기를 끈다 — 방금 등록한 기기는 최근 확인이 가장 늦어 남는다 */
export async function trimUserDevices(userId: string, db: Db = getServiceSupabase()): Promise<void> {
  const { data, error } = await db
    .from("push_devices")
    .select("token, last_seen_at")
    .eq("user_id", userId)
    .is("disabled_at", null)
    .limit(200);
  check(error, "trimUserDevices");
  const over = devicesOverCap((data ?? []).map((r: { token: string; last_seen_at: string }) => ({ token: r.token, lastSeenAt: r.last_seen_at })));
  if (over.length) await disableTokens(over, db);
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

/** 필터가 주소(쿼리 문자열)에 실리니 토큰 수백 개를 한 번에 넣으면 주소 길이 한도를 넘는다 — 100개씩 나눈다 */
const DISABLE_CHUNK = 100;

export async function disableTokens(tokens: string[], db: Db = getServiceSupabase()): Promise<void> {
  const at = new Date().toISOString();
  for (let i = 0; i < tokens.length; i += DISABLE_CHUNK) {
    const { error } = await db.from("push_devices").update({ disabled_at: at }).in("token", tokens.slice(i, i + DISABLE_CHUNK));
    check(error, "disableTokens");
  }
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

export async function listAsks(userId: string, db: Db = getServiceSupabase()): Promise<AskRecord[]> {
  const { data, error } = await db.from("push_asks").select("moment, kind, answer").eq("user_id", userId).order("id");
  check(error, "listAsks");
  return (data ?? []) as AskRecord[];
}

export async function recordAsk(
  userId: string,
  moment: AskMoment,
  kind: AskKind,
  answer: AskAnswer,
  db: Db = getServiceSupabase(),
): Promise<void> {
  const { error } = await db.from("push_asks").insert({ user_id: userId, moment, kind, answer });
  check(error, "recordAsk");
}

export async function getAdConsent(userId: string, db: Db = getServiceSupabase()): Promise<AdConsentRow> {
  const { data, error } = await db
    .from("ad_consents")
    .select("status, first_granted_at, granted_at, last_reconfirm_notice_at")
    .eq("user_id", userId)
    .maybeSingle();
  check(error, "getAdConsent");
  if (!data) return null;
  return {
    status: data.status as "granted" | "withdrawn",
    firstGrantedAt: data.first_granted_at as string,
    grantedAt: data.granted_at as string,
    lastReconfirmNoticeAt: (data.last_reconfirm_notice_at as string | null) ?? null,
  };
}

/** 동의·철회 + 결과 통지 기록(+ 수신거부 표 사용) — 한 트랜잭션(RPC push_set_ad_consent) */
export async function setAdConsent(
  userId: string,
  grant: boolean,
  source: string,
  sendId: number | null = null,
  db: Db = getServiceSupabase(),
): Promise<SetConsentResult> {
  const { data, error } = await db.rpc("push_set_ad_consent", {
    p_user_id: userId,
    p_grant: grant,
    p_source: source,
    p_send_id: sendId,
  });
  check(error, "setAdConsent");
  const r = data as { ok: boolean; reason?: string; changed?: boolean; status?: AdStatus; at?: string } | null;
  if (!r) throw new Error("push store setAdConsent: no data");
  if (!r.ok) return { ok: false, reason: r.reason === "token_invalid" ? "token_invalid" : "token_used" };
  return { ok: true, changed: !!r.changed, status: r.status ?? "none", at: r.at ?? new Date().toISOString() };
}

export async function recordReconfirmNotice(
  userId: string,
  source: "reconfirm_popup" | "reconfirm_push",
  db: Db = getServiceSupabase(),
): Promise<boolean> {
  const { data, error } = await db.rpc("push_record_reconfirm_notice", { p_user_id: userId, p_source: source });
  check(error, "recordReconfirmNotice");
  return data === true;
}

/** 수신거부 표의 발송 — 주인과 정보성/광고 */
export async function sendOwner(sendId: number, db: Db = getServiceSupabase()): Promise<{ userId: string; klass: "info" | "ad" } | null> {
  const { data, error } = await db.from("push_sends").select("user_id, class").eq("id", sendId).maybeSingle();
  check(error, "sendOwner");
  return data ? { userId: data.user_id as string, klass: data.class as "info" | "ad" } : null;
}

/** 유료 구독 중인가(체험 제외) — 별마루 자격 판정을 그대로 쓴다 */
export async function isSubscriber(userId: string): Promise<boolean> {
  return (await getEntitlement(userId)).reason === "subscription";
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
    const { data: retried, error: retryErr } = await db
      .from("push_schedules")
      .update({ send_on: sendOn })
      .eq("user_id", userId)
      .eq("reading_id", readingId)
      .eq("kind", "revisit")
      .eq("status", "pending")
      .select("id");
    check(retryErr, "upsertRevisit(retry)");
    // 쓰기가 확인될 때만 ok — 다른 사용자 소유 행 등으로 0행이면 성공을 답하지 않는다.
    return retried && retried.length > 0 ? "ok" : "already_sent";
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

/** cron 발송용 저장소 — DispatchStore 의 service_role 구현. */
export const supabaseDispatchStore: DispatchStore = {
  async dueRevisits(todayKst) {
    const { data, error } = await getServiceSupabase()
      .from("push_schedules")
      .select("id, user_id, reading_id, send_on, readings(consultation_type)")
      .eq("kind", "revisit")
      .eq("status", "pending")
      .lte("send_on", todayKst)
      .order("send_on")
      .limit(1000);
    check(error, "dueRevisits");
    return (data ?? []).map((r: Record<string, unknown>) => {
      const rd = r.readings as { consultation_type?: string } | { consultation_type?: string }[] | null;
      const ct = (Array.isArray(rd) ? rd[0]?.consultation_type : rd?.consultation_type) ?? "";
      return {
        id: r.id as string,
        userId: r.user_id as string,
        readingId: r.reading_id as string,
        consultationType: ct,
        sendOn: r.send_on as string,
      };
    });
  },
  activeDeviceTokens: (userId) => activeDeviceTokens(userId),
  getRevisitPref: (userId) => getRevisitPref(userId),
  async claimSend(r) {
    const { data, error } = await getServiceSupabase()
      .from("push_sends")
      .insert({ user_id: r.userId, kind: r.kind, class: r.klass, ref_id: r.refId, send_date: r.sendDate })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return null;
      check(error, "claimSend");
    }
    return data ? (data.id as number) : null;
  },
  async deliveredSend(r) {
    const { data, error } = await getServiceSupabase()
      .from("push_sends")
      .select("device_count")
      .eq("user_id", r.userId)
      .eq("kind", r.kind)
      .eq("ref_id", r.refId)
      .eq("send_date", r.sendDate)
      .maybeSingle();
    check(error, "deliveredSend");
    return !!data && (data.device_count as number) > 0;
  },
  async releaseSend(sendId) {
    const { error } = await getServiceSupabase().from("push_sends").delete().eq("id", sendId);
    check(error, "releaseSend");
  },
  async saveTickets(sendId, tickets) {
    const { error } = await getServiceSupabase()
      .from("push_sends")
      .update({ expo_tickets: tickets, device_count: tickets.length })
      .eq("id", sendId);
    check(error, "saveTickets");
  },
  async markSchedule(id, status) {
    const { error } = await getServiceSupabase().from("push_schedules").update({ status }).eq("id", id);
    check(error, "markSchedule");
  },
  disableTokens: (tokens) => disableTokens(tokens),
  async uncheckedReceipts(beforeIso) {
    const { data, error } = await getServiceSupabase()
      .from("push_sends")
      .select("id, sent_at, expo_tickets")
      .is("receipt_checked_at", null)
      .lt("sent_at", beforeIso)
      .order("id")
      .limit(500);
    check(error, "uncheckedReceipts");
    return (data ?? []).map((r: { id: number; sent_at: string; expo_tickets: { id: string; token: string }[] | null }) => ({
      sendId: r.id,
      sentAt: r.sent_at,
      tickets: r.expo_tickets ?? [],
    }));
  },
  async markReceiptsChecked(sendIds) {
    if (sendIds.length === 0) return;
    const { error } = await getServiceSupabase()
      .from("push_sends")
      .update({ receipt_checked_at: new Date().toISOString() })
      .in("id", sendIds);
    check(error, "markReceiptsChecked");
  },
};

/** 2년 재확인 푸시 cron 용 — ReconfirmStore 의 service_role 구현 */
export const supabaseReconfirmStore: ReconfirmStore = {
  async reconfirmCandidates(cutoffIso) {
    // 동의 중인 회원 중 최초 동의가 cutoff 이전 — 행수가 데이터에 비례하니 1000행씩 끝까지 읽는다(Max rows 가 조용히 자른다)
    const out: ReconfirmCandidate[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getServiceSupabase()
        .from("ad_consents")
        .select("user_id, first_granted_at, granted_at, last_reconfirm_notice_at")
        .eq("status", "granted")
        .lte("first_granted_at", cutoffIso)
        .order("user_id")
        .range(from, from + 999);
      check(error, "reconfirmCandidates");
      const rows = (data ?? []) as { user_id: string; first_granted_at: string; granted_at: string; last_reconfirm_notice_at: string | null }[];
      for (const r of rows) {
        out.push({ userId: r.user_id, firstGrantedAt: r.first_granted_at, grantedAt: r.granted_at, lastReconfirmNoticeAt: r.last_reconfirm_notice_at });
      }
      if (rows.length < 1000) return out;
    }
  },
  recordReconfirmNotice: (userId, source) => recordReconfirmNotice(userId, source),
};
