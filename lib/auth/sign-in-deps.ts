// signIn() 의 실 DB·부수 작업 — 카카오 웹 콜백(app/api/auth/kakao)에 있던 신규 가입 처리를 그대로 옮겼다(동작 불변).
// route 는 로그 라벨이다(앱 로그인은 '/api/auth/app/kakao' 등으로 남는다).
// 앱 가입도 CAPI CompleteRegistration 을 보낸다(스펙 §7-1) — 앱 이벤트(메타 SDK)로 바꿀지는 ④에서 정한다.
import type { NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { chargeStars } from "@/lib/stars";
import { WELCOME_BONUS_STARS } from "@/lib/constants";
import { sendCapiEvent, capiSignalsFromRequest } from "@/lib/meta-capi";
import { ACQ_COOKIE, parseAcqCookie, acqFromPageView, type AcqPayload } from "@/lib/acquisition";
import type { SignInDeps } from "./sign-in";

const UNIQUE_VIOLATION = "23505";
type Db = ReturnType<typeof getServiceSupabase>;

export function supabaseSignInDeps(request: NextRequest, route: string): SignInDeps {
  const supabase = getServiceSupabase();
  return {
    async findIdentityUserId(provider, providerUserId) {
      const { data, error } = await supabase
        .from("user_identities")
        .select("user_id")
        .eq("provider", provider)
        .eq("provider_user_id", providerUserId)
        .maybeSingle();
      if (error) throw error;
      return (data?.user_id as string | undefined) ?? null;
    },

    async findLegacyKakaoUserId(kakaoId) {
      const { data, error } = await supabase.from("users").select("id").eq("kakao_id", Number(kakaoId)).maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },

    async insertIdentity(row) {
      const { error } = await supabase.from("user_identities").insert({ ...row, last_login_at: new Date().toISOString() });
      if (!error) return { ok: true };
      const duplicate = error.code === UNIQUE_VIOLATION;
      if (!duplicate) {
        await logError(error, { route, userId: row.user_id, extra: { step: "user_identities_insert", provider: row.provider } });
      }
      return { ok: false, duplicate };
    },

    async updateIdentityOnLogin(provider, providerUserId, patch) {
      const { error } = await supabase
        .from("user_identities")
        .update({ ...patch, last_login_at: new Date().toISOString() })
        .eq("provider", provider)
        .eq("provider_user_id", providerUserId);
      if (error) await logError(error, { route, extra: { step: "user_identities_touch", provider } });
    },

    async insertUser(row) {
      const { data, error } = await supabase.from("users").insert(row).select("id").single();
      if (!error && data) return { ok: true, id: data.id as string };
      const duplicate = error?.code === UNIQUE_VIOLATION;
      if (!duplicate) {
        await logError(error ?? new Error("user insert null"), {
          route,
          extra: { kakaoId: row.kakao_id, nickname: row.nickname },
        });
      }
      return { ok: false, duplicate };
    },

    async deleteUser(userId) {
      const { error } = await supabase.from("users").delete().eq("id", userId);
      // 지우지 못한 고아 회원 — 카카오면 다음 로그인 때 '옮겨 담기 전 회원'으로 자가 치유돼 신규 처리(별 잔액 행·웰컴 별·유입·CAPI) 없이 로그인된다
      if (error) await logError(error, { route, userId, extra: { step: "orphan_user_delete", severity: "SIGNUP_ORPHAN_USER" } });
    },

    async updateUserOnLogin(userId, patch) {
      await supabase
        .from("users")
        .update({ ...patch, last_login: new Date().toISOString() })
        .eq("id", userId);
    },

    async onNewUser(userId, identityHashValue) {
      await recordAcquisition(supabase, request, userId, route);

      // 별 잔액 초기화 (신규 유저). RLS 우회 service_role 라 직접 INSERT.
      await supabase.from("star_balances").insert({
        user_id: userId,
        balance: 0,
        total_earned: 0,
        total_spent: 0,
      });

      // 웰컴 별 파밍 방지: 탈퇴해도 남는 원장에 로그인 수단 해시로 1회 청구(lib/auth/identity-hash.ts — 카카오는 옛 공식과 같은 값).
      // upsert(ignoreDuplicates)가 새 row 반환 → 처음 → 지급. 이미 있으면 빈 배열 → 스킵.
      // 청구 판정 에러면 안전하게 스킵(파밍 재개 방지) + 로그.
      const { data: welcomeClaim, error: welcomeClaimErr } = await supabase
        .from("bonus_claims")
        .upsert(
          { kakao_id_hash: identityHashValue, bonus_type: "welcome" },
          { onConflict: "kakao_id_hash,bonus_type", ignoreDuplicates: true }
        )
        .select("kakao_id_hash");
      if (welcomeClaimErr) {
        await logError(welcomeClaimErr, {
          route,
          userId,
          extra: { severity: "WELCOME_CLAIM_CHECK_FAILED" },
        });
      }
      if (!welcomeClaimErr && (welcomeClaim?.length ?? 0) > 0) {
        // charge_stars RPC 멱등 키(welcome:{userId}) — 같은 계정 더블 콜백 방어
        const welcome = await chargeStars(userId, WELCOME_BONUS_STARS, `welcome:${userId}`, "welcome_bonus");
        if (!welcome.success) {
          await logError(new Error("welcome bonus grant failed"), {
            route,
            userId,
            extra: { severity: "WELCOME_BONUS_FAILED" },
          });
        }
      }

      // Meta CAPI 가입 전환 (신규 유저만). eventId=reg:{userId} 로 Pixel/재시도 중복 제거.
      const signals = capiSignalsFromRequest(request);
      void sendCapiEvent({
        eventName: "CompleteRegistration",
        userId,
        eventId: `reg:${userId}`,
        ...signals,
      });
    },
  };
}

// first-touch 유입 출처 저장 (신규 유저 1회). 쿠키 없으면(오가닉) 스킵.
// 어트리뷰션은 로그인의 부수 작업 — 실패해도 가입/로그인을 막지 않도록 swallow + 로그.
async function recordAcquisition(supabase: Db, request: NextRequest, userId: string, route: string): Promise<void> {
  let acq: AcqPayload | null = parseAcqCookie(request.cookies.get(ACQ_COOKIE)?.value);
  let captureSource: "client" | "server" | "pageview" = acq?.capture ?? "client";
  if (!acq) {
    // 안전망: 쿠키가 유실돼도 서버 쿠키(anon_id)는 살아 있다 → 비로그인 page_views 의 최초 유입 행으로 복구.
    try {
      const anonId = request.cookies.get("byeolkong_anon_id")?.value;
      if (anonId) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pv, error: pvErr } = await supabase
          .from("page_views")
          .select("utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_variant,referrer,created_at")
          .eq("anon_id", anonId)
          .is("user_id", null)
          .gte("created_at", since)
          .or("utm_source.not.is.null,utm_content.not.is.null")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (pvErr) {
          await logError(pvErr, { route, extra: { step: "user_acquisition_pageview" } });
        } else if (pv) {
          acq = acqFromPageView(pv);
          captureSource = "pageview";
        }
      }
    } catch (pvCatch) {
      await logError(pvCatch, { route, extra: { step: "user_acquisition_pageview" } });
    }
  }
  if (!acq) return;
  try {
    const acqRow = {
      user_id: userId,
      utm_source: acq.utm_source ?? null,
      utm_medium: acq.utm_medium ?? null,
      utm_campaign: acq.utm_campaign ?? null,
      utm_content: acq.utm_content ?? null,
      utm_term: acq.utm_term ?? null,
      fbclid: acq.fbclid ?? null,
      fbc: acq.fbc ?? null,
      landing_variant: acq.landing_variant ?? null,
      referrer: acq.referrer ?? null,
      first_seen_at: acq.first_seen_at ?? null,
      capture_source: captureSource,
    };
    let { error: acqErr } = await supabase.from("user_acquisition").insert(acqRow);
    if (acqErr?.code === "PGRST204") {
      // 배포 직후 마이그레이션(capture_source 컬럼)이 아직 안 먹은 창 — 컬럼 없이 1회 재시도해 유입 기록을 잃지 않는다.
      const { capture_source: _omit, ...legacyRow } = acqRow;
      void _omit;
      ({ error: acqErr } = await supabase.from("user_acquisition").insert(legacyRow));
    }
    if (acqErr) {
      await logError(acqErr, { route, extra: { step: "user_acquisition" } });
    }
  } catch (acqCatch) {
    await logError(acqCatch, { route, extra: { step: "user_acquisition" } });
  }
}
