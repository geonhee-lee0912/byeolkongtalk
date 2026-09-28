// lib/byeolmaru/entitlement.ts — 별마루 구독/체험 자격 판정.
// 순수 computeEntitlement(테스트 대상) + DB getEntitlement/startTrial.
import { getServiceSupabase } from "@/lib/supabase";

export const TRIAL_DAYS = 3;

export type Entitlement = {
  entitled: boolean;
  reason: "subscription" | "trial" | "none";
  trialUsed: boolean;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
};

export function computeEntitlement(
  input: { trialStartedAt: string | null; subscriptionExpiresAt: string | null },
  now: Date
): Entitlement {
  const subActive =
    !!input.subscriptionExpiresAt && new Date(input.subscriptionExpiresAt).getTime() > now.getTime();
  if (subActive) {
    return {
      entitled: true, reason: "subscription", trialUsed: !!input.trialStartedAt,
      trialEndsAt: null, subscriptionExpiresAt: input.subscriptionExpiresAt,
    };
  }
  const trialUsed = !!input.trialStartedAt;
  if (trialUsed) {
    const ends = new Date(new Date(input.trialStartedAt as string).getTime() + TRIAL_DAYS * 86400000);
    if (ends.getTime() > now.getTime()) {
      return { entitled: true, reason: "trial", trialUsed: true, trialEndsAt: ends.toISOString(), subscriptionExpiresAt: null };
    }
  }
  return { entitled: false, reason: "none", trialUsed, trialEndsAt: null, subscriptionExpiresAt: null };
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const supa = getServiceSupabase();
  const [{ data: u }, { data: subs }] = await Promise.all([
    supa.from("users").select("byeolmaru_trial_started_at").eq("id", userId).single(),
    supa.from("byeolmaru_subscriptions").select("expires_at").eq("user_id", userId)
      .gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1),
  ]);
  return computeEntitlement(
    { trialStartedAt: u?.byeolmaru_trial_started_at ?? null, subscriptionExpiresAt: subs?.[0]?.expires_at ?? null },
    new Date()
  );
}

/** 체험 시작 — trial_started_at 이 NULL 일 때만 기록(1회성). 이미 있으면 alreadyUsed. */
export async function startTrial(
  userId: string
): Promise<{ started: boolean; alreadyUsed: boolean; trialEndsAt: string }> {
  const supa = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const { data } = await supa.from("users")
    .update({ byeolmaru_trial_started_at: nowIso })
    .eq("id", userId).is("byeolmaru_trial_started_at", null)
    .select("byeolmaru_trial_started_at");
  const started = !!data && data.length > 0;
  const { data: cur } = await supa.from("users").select("byeolmaru_trial_started_at").eq("id", userId).single();
  const startedAt = cur?.byeolmaru_trial_started_at ?? nowIso;
  const trialEndsAt = new Date(new Date(startedAt).getTime() + TRIAL_DAYS * 86400000).toISOString();
  return { started, alreadyUsed: !started, trialEndsAt };
}
