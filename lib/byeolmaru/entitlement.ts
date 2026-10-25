// lib/byeolmaru/entitlement.ts — 별마루 구독/체험 자격 판정.
// 순수 computeEntitlement(테스트 대상) + DB getEntitlement/getEntitlementStrict/startTrial.
import { getServiceSupabase } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { TRIAL_DAYS } from "./constants";

// 값의 원천은 constants.ts(클라 세이프) — 기존 import(테스트)를 깨지 않게 여기서 다시 내보낸다.
// 🔴 클라 컴포넌트는 여기서 가져오지 말 것 — 이 파일은 getServiceSupabase 를 물고 있다(HubBanner 가 그랬다, 2026-10-12 정리).
export { TRIAL_DAYS };

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

type Supa = ReturnType<typeof getServiceSupabase>;

/** 구독·체험 원본을 읽는다 — getEntitlement(느슨)·getEntitlementStrict(엄격)가 같이 쓴다. 에러는 해석하지 않고 돌려준다. */
async function readEntitlementRows(supa: Supa, userId: string) {
  const [{ data: u, error: userErr }, { data: subs, error: subErr }] = await Promise.all([
    // 🔴 maybeSingle — users 행이 없는 쿠키(다른 기기에서 탈퇴 등)는 오류가 아니라 '체험 전·구독 없음'이다. single() 은 0행을
    //    PGRST116 에러로 돌려줘, 그런 요청마다 error 로그가 쌓였다(2026-10-12 검토).
    supa.from("users").select("byeolmaru_trial_started_at").eq("id", userId).maybeSingle(),
    supa.from("byeolmaru_subscriptions").select("expires_at").eq("user_id", userId)
      .gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1),
  ]);
  return {
    input: { trialStartedAt: u?.byeolmaru_trial_started_at ?? null, subscriptionExpiresAt: subs?.[0]?.expires_at ?? null },
    userErr,
    subErr,
  };
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const { input, userErr, subErr } = await readEntitlementRows(getServiceSupabase(), userId);
  // 🔴 DB 에러는 남기기만 한다 — 동작은 그대로(못 읽은 쪽은 '없음' = 체험 전·구독 없음으로 떨어진다). 호출처가 많아
  //    (캘린더·리포트 4종) 여기서 동작을 바꾸지 않는다. 돈이 걸린 구독 라우트만 아래 getEntitlementStrict 를 쓴다.
  //    postgrest-js 는 DB 에러를 throw 하지 않아 호출처 catch 로는 안 잡히고, 예전엔 그대로 삼켜져 '구독자에게 절단선' 같은
  //    오판이 /admin/errors 에 아무 흔적도 없었다.
  if (userErr || subErr) {
    await logError(userErr ?? subErr, {
      route: "lib/byeolmaru/entitlement",
      userId,
      extra: { stage: "get_entitlement", users: userErr?.message ?? null, subscriptions: subErr?.message ?? null },
    });
  }
  return computeEntitlement(input, new Date());
}

/** 엄격 조회 — **구독 라우트 전용**(2026-10-12). 못 읽으면 '없음'으로 떨어뜨리지 않고 던진다.
 *  🔴 supabase-js 는 일시 DB 실패를 throw 가 아니라 { error } 로 돌려줘서, 느슨한 getEntitlement 는 그걸 '체험 전·구독 없음'으로 읽는다.
 *     구독 라우트가 그렇게 읽으면 구독자도 409 판정을 지나 20별이 또 빠지고(30일 이어 붙임), 체험을 쓴 사람은 33일 + 체험 재기록이 된다.
 *     던지면 라우트가 500 purchase_failed + logError 로 끝낸다 — 차감 전이라 별은 그대로다. 다른 호출처는 느슨 그대로다.
 *  supa 는 테스트용 주입 자리다(기본 = service_role). */
export async function getEntitlementStrict(userId: string, supa: Supa = getServiceSupabase()): Promise<Entitlement> {
  const { input, userErr, subErr } = await readEntitlementRows(supa, userId);
  if (userErr || subErr) {
    throw new Error(
      `get_entitlement_failed: users=${userErr?.message ?? "ok"} subscriptions=${subErr?.message ?? "ok"}`,
      { cause: userErr ?? subErr }
    );
  }
  return computeEntitlement(input, new Date());
}

/** 체험 시작 — trial_started_at 이 NULL 일 때만 기록(1회성). 이미 있으면 alreadyUsed.
 *  🔴 DB 에러면 던진다(2026-10-12) — postgrest-js 는 에러를 throw 하지 않고 { error } 로 돌려줘서, 예전엔 기록이 실패해도
 *     data=null → '이미 썼음'으로 성공처럼 돌아갔다(체험 라우트 200 · 구독 라우트 stage:"record_trial" logError 는 죽은 코드).
 *     호출부(체험 라우트·구독 라우트)가 잡아 logError 로 남긴다.
 *  supa 는 테스트용 주입 자리다(기본 = service_role). */
export async function startTrial(
  userId: string,
  supa: Supa = getServiceSupabase()
): Promise<{ started: boolean; alreadyUsed: boolean; trialEndsAt: string }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supa.from("users")
    .update({ byeolmaru_trial_started_at: nowIso })
    .eq("id", userId).is("byeolmaru_trial_started_at", null)
    .select("byeolmaru_trial_started_at");
  if (error) throw error;
  const started = !!data && data.length > 0;
  let startedAt: string = nowIso;
  if (started) {
    // 🔴 UPDATE 가 돌려준 행이 곧 시작 시각이다 — 여기서 또 조회하면 그게 일시 실패했을 때 체험은 열렸는데 던졌다
    //    (사용자는 '체험이 안 열렸어', 구독 라우트엔 거짓 record_trial 에러 — 2026-10-12 검토).
    startedAt = data[0].byeolmaru_trial_started_at ?? nowIso;
  } else {
    // 이미 시작돼 있다(UPDATE 0행) — 그때만 기존 시작 시각을 읽는다
    const { data: cur, error: curErr } = await supa.from("users").select("byeolmaru_trial_started_at").eq("id", userId).single();
    if (curErr) throw curErr;
    startedAt = cur?.byeolmaru_trial_started_at ?? nowIso;
  }
  const trialEndsAt = new Date(new Date(startedAt).getTime() + TRIAL_DAYS * 86400000).toISOString();
  return { started, alreadyUsed: !started, trialEndsAt };
}
