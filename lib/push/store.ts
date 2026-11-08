// 푸시 표 저장소 — 전부 service_role. supabase-js 는 DB 에러를 throw 하지 않고 { error } 로 돌려주므로
// 매번 확인해 던진다(확인하지 않으면 실패가 빈 결과로 조용히 지나간다).
// 마지막 인자 db 는 시험에서 가짜 클라이언트를 꽂는 자리다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase";
import { computeEntitlement, getEntitlement } from "@/lib/byeolmaru/entitlement";
import type { DispatchStore } from "./dispatch.ts";
import type { AdStatus, AskAnswer, AskKind, AskMoment, AskRecord } from "./asks.ts";
import type { AdConsentRow, SetConsentResult } from "./user-api.ts";
import type { ReconfirmCandidate, ReconfirmStore } from "./reconfirm-job.ts";
import { laterOf, type DeviceGroup, type FactsStore, type PushFacts } from "./facts.ts";
import type { ProfileRow } from "./today-flow.ts";
import type { ResumeStore } from "./comeback-job.ts";
import { fortuneTypeFromTag } from "@/lib/fortune/types";

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

// ── 단계 3·4 cron 판정 재료(FactsStore) ───────────────────────────────────────────

/** 한 묶음(회원 100명 이하) 조회가 Max rows(1000)에 닿으면 조용히 잘린다 — 위기 신호처럼 빠지면 안 되는 값이 섞여 있어 던진다 */
function rowsOrThrow<T>(data: T[] | null, error: { message: string } | null, what: string): T[] {
  check(error, what);
  const rows = data ?? [];
  if (rows.length >= 1000) throw new Error(`push store ${what}: 1000 rows — chunk too large, refusing partial data`);
  return rows;
}

export const supabaseFactsStore: FactsStore = {
  async activeDevices() {
    const out = new Map<string, DeviceGroup>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getServiceSupabase()
        .from("push_devices")
        .select("token, user_id, last_seen_at")
        .is("disabled_at", null)
        .order("token")
        .range(from, from + 999);
      check(error, "activeDevices");
      const rows = (data ?? []) as { token: string; user_id: string; last_seen_at: string | null }[];
      for (const r of rows) {
        const g = out.get(r.user_id) ?? { tokens: [], lastSeenAt: null };
        g.tokens.push(r.token);
        g.lastSeenAt = laterOf(g.lastSeenAt, r.last_seen_at);
        out.set(r.user_id, g);
      }
      if (rows.length < 1000) return out;
    }
  },

  async facts(userIds, now, todayKst) {
    const db = getServiceSupabase();
    const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const [prefs, consents, users, subs, alerts, sensitive, opens, sends, profiles, devices, wakes] = await Promise.all([
      db.from("push_preferences").select("user_id, morning").in("user_id", userIds),
      db.from("ad_consents").select("user_id, status").in("user_id", userIds),
      db.from("users").select("id, byeolmaru_trial_started_at").in("id", userIds),
      db.from("byeolmaru_subscriptions").select("user_id, expires_at").in("user_id", userIds).gt("expires_at", now.toISOString()),
      db.from("sensitive_alerts").select("user_id").in("user_id", userIds).gte("created_at", since30),
      db.from("readings").select("user_id").in("user_id", userIds).eq("has_sensitive", true).gte("created_at", since30),
      db.from("push_app_opens").select("user_id, last_open_at").in("user_id", userIds),
      db.from("push_sends").select("user_id, kind, class").in("user_id", userIds).eq("send_date", todayKst),
      db.from("user_profiles").select("user_id, birth_date, birth_time, is_lunar_input, is_leap_month, gender").in("user_id", userIds).eq("is_primary", true),
      db.from("push_devices").select("user_id, last_seen_at").in("user_id", userIds),
      db.from("push_sends").select("user_id, ref_id").in("user_id", userIds).eq("kind", "wake").gte("sent_at", since30),
    ]);
    const prefRows = rowsOrThrow(prefs.data as { user_id: string; morning: boolean }[] | null, prefs.error, "facts.prefs");
    const consentRows = rowsOrThrow(consents.data as { user_id: string; status: string }[] | null, consents.error, "facts.consents");
    const userRows = rowsOrThrow(users.data as { id: string; byeolmaru_trial_started_at: string | null }[] | null, users.error, "facts.users");
    const subRows = rowsOrThrow(subs.data as { user_id: string; expires_at: string }[] | null, subs.error, "facts.subs");
    const alertRows = rowsOrThrow(alerts.data as { user_id: string }[] | null, alerts.error, "facts.alerts");
    const sensitiveRows = rowsOrThrow(sensitive.data as { user_id: string }[] | null, sensitive.error, "facts.sensitive");
    const openRows = rowsOrThrow(opens.data as { user_id: string; last_open_at: string }[] | null, opens.error, "facts.opens");
    const sendRows = rowsOrThrow(sends.data as { user_id: string; kind: string; class: "info" | "ad" }[] | null, sends.error, "facts.sends");
    const profileRows = rowsOrThrow(profiles.data as (ProfileRow & { user_id: string })[] | null, profiles.error, "facts.profiles");
    const deviceRows = rowsOrThrow(devices.data as { user_id: string; last_seen_at: string | null }[] | null, devices.error, "facts.devices");
    const wakeRows = rowsOrThrow(wakes.data as { user_id: string; ref_id: string }[] | null, wakes.error, "facts.wakes");

    const crisis = new Set([...alertRows, ...sensitiveRows].map((r) => r.user_id));
    const out = new Map<string, PushFacts>();
    for (const id of userIds) {
      const u = userRows.find((r) => r.id === id);
      const sub = subRows.filter((r) => r.user_id === id).map((r) => r.expires_at).sort().pop() ?? null;
      const ent = computeEntitlement({ trialStartedAt: u?.byeolmaru_trial_started_at ?? null, subscriptionExpiresAt: sub }, now);
      const deviceSeen = deviceRows.filter((r) => r.user_id === id).reduce<string | null>((a, r) => laterOf(a, r.last_seen_at), null);
      const p = profileRows.find((r) => r.user_id === id);
      out.set(id, {
        morningPref: prefRows.find((r) => r.user_id === id)?.morning !== false,
        adConsent: consentRows.find((r) => r.user_id === id)?.status === "granted",
        subscription: ent.reason === "subscription" ? "paid" : ent.reason === "trial" ? "trial" : "none",
        crisisWithin30d: crisis.has(id),
        lastOpenAt: laterOf(openRows.find((r) => r.user_id === id)?.last_open_at ?? null, deviceSeen),
        sendsToday: sendRows.filter((r) => r.user_id === id).map((r) => ({ kind: r.kind, klass: r.class })),
        profile: p
          ? { birth_date: p.birth_date, birth_time: p.birth_time, is_lunar_input: p.is_lunar_input, is_leap_month: p.is_leap_month, gender: p.gender }
          : null,
        wakeRefsSent: wakeRows.filter((r) => r.user_id === id).map((r) => r.ref_id),
      });
    }
    return out;
  },
};

/** 앱을 연 시각을 남긴다(웹 PushGate 가 앱 안에서 부른다) */
export async function recordAppOpen(userId: string, db: Db = getServiceSupabase()): Promise<void> {
  const { error } = await db
    .from("push_app_opens")
    .upsert({ user_id: userId, last_open_at: new Date().toISOString() }, { onConflict: "user_id" });
  check(error, "recordAppOpen");
}

/** 알림을 누르고 연 시각 — 그 회원의 발송이고 처음 연 것만 */
export async function markSendOpened(userId: string, sendId: number, db: Db = getServiceSupabase()): Promise<void> {
  const { error } = await db
    .from("push_sends")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", sendId)
    .eq("user_id", userId)
    .is("opened_at", null);
  check(error, "markSendOpened");
}

export async function getMorningPref(userId: string, db: Db = getServiceSupabase()): Promise<boolean> {
  const { data, error } = await db.from("push_preferences").select("morning").eq("user_id", userId).maybeSingle();
  check(error, "getMorningPref");
  return data ? data.morning !== false : true;
}

export async function setMorningPref(userId: string, on: boolean, db: Db = getServiceSupabase()): Promise<void> {
  const { error } = await db
    .from("push_preferences")
    .upsert({ user_id: userId, morning: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  check(error, "setMorningPref");
}

/** 이어가기 cron 용 — 가장 최근의 (운세가 아닌) 타로 상담과 그 대화 상태. 홈 이어가기 버튼(app/page.tsx)과 같은 대상 */
export const supabaseResumeStore: ResumeStore = {
  async latestTarot(userId) {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("readings")
      .select("id, emotion_tag")
      .eq("user_id", userId)
      .eq("consultation_type", "tarot")
      .order("created_at", { ascending: false })
      .limit(20);
    check(error, "latestTarot");
    const r = (data ?? []).find((x: { emotion_tag: string | null }) => !fortuneTypeFromTag(x.emotion_tag));
    if (!r) return null;
    const [lastUser, endRow] = await Promise.all([
      db.from("messages").select("created_at").eq("reading_id", r.id).eq("role", "user").order("created_at", { ascending: false }).limit(1),
      // [END] 마커 — '['·']' 는 LIKE 의 특수문자가 아니다(% · _ 만)
      db.from("messages").select("id").eq("reading_id", r.id).eq("role", "assistant").like("content", "%[END]%").limit(1),
    ]);
    check(lastUser.error, "latestTarot.lastUser");
    check(endRow.error, "latestTarot.ended");
    return {
      readingId: r.id as string,
      ended: (endRow.data ?? []).length > 0,
      lastUserAt: ((lastUser.data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null,
    };
  },
};
