// 별 패키지 지급 — 토스 결제 승인(app/api/payment/confirm/route.ts)과 앱 스토어 결제(애플·구글)가 같은 함수로 별을 준다.
// 결제 기록(payments) → 별 충전 → 첫충전 보너스(로그인 수단 해시 원장 1회) 순서. 같은 tid 는 한 번만 지급한다.
// 토스 승인·환불·응답 JSON 은 여기 없다 — INSERT 실패 시 토스 자동 환불은 라우트가 한다(insert_failed 로 돌려준다).
import { getUserIdentities, primaryIdentity } from "@/lib/auth/user-identity";
import { identityHash } from "@/lib/auth/identity-hash";
import { chargeStars } from "@/lib/stars";
import { getServiceSupabase } from "@/lib/supabase";
import { logError, logWarn } from "@/lib/logger";
import { FIRST_CHARGE_BONUS_RATE, type StarPackage } from "@/lib/constants";

export type GrantProvider = "tosspayments" | "apple" | "google";

export type GrantInput = {
  userId: string;
  pkg: StarPackage;
  provider: GrantProvider;
  /** 결제 고유 번호 — payments.pg_tid(유니크). 토스 paymentKey / 애플 transactionId / 구글 주문 id */
  tid: string;
  amountWon: number;
};

export type GrantResult =
  | { kind: "granted"; paymentId: string; stars: number; bonusStars: number; balance: number }
  | { kind: "already"; paymentId: string; stars: number; balance: number }
  | { kind: "insert_failed"; error: unknown }
  | { kind: "charge_failed"; paymentId: string };

// 어드민 에러 화면 연속성 — 토스 라우트가 쓰던 route 값을 그대로 쓴다
const routeOf = (provider: GrantProvider) => (provider === "tosspayments" ? "/api/payment/confirm" : "lib/payment/grant");

async function alreadyResult(userId: string, tid: string): Promise<GrantResult | null> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("payments")
    .select("id, stars_given")
    .eq("pg_tid", tid)
    .maybeSingle();
  if (!existing) return null;
  const { data: bal } = await supabase.from("star_balances").select("balance").eq("user_id", userId).maybeSingle();
  return {
    kind: "already",
    paymentId: existing.id as string,
    stars: existing.stars_given as number,
    balance: (bal?.balance as number | undefined) ?? 0,
  };
}

export async function grantStarPackage(input: GrantInput): Promise<GrantResult> {
  const { userId, pkg, provider, tid, amountWon } = input;
  const route = routeOf(provider);
  const supabase = getServiceSupabase();

  // 이미 처리된 결제(재시도·새로고침) — 별을 다시 주지 않는다
  const prior = await alreadyResult(userId, tid);
  if (prior) return prior;

  // 결제 기록 저장
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      pg_provider: provider,
      pg_tid: tid,
      amount_won: amountWon,
      stars_given: pkg.stars,
      package_type: pkg.id,
      status: "completed",
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    // 동시 호출 경합 — 먼저 들어간 쪽이 지급을 맡는다(pg_tid 유니크). 다시 찾아 already 로.
    if ((payErr as { code?: string } | null)?.code === "23505") {
      const raced = await alreadyResult(userId, tid);
      if (raced) return raced;
    }
    return { kind: "insert_failed", error: payErr ?? new Error("payment insert null") };
  }

  // 별 충전
  const charge = await chargeStars(userId, pkg.stars, payment.id);
  if (!charge.success) {
    // 결제는 성공했으나 별 충전 실패 — 운영자 즉시 개입 필요한 사고
    await logError(new Error("chargeStars failed after payment"), {
      route,
      userId,
      extra: {
        paymentId: payment.id,
        paymentKey: tid,
        stars: pkg.stars,
        packageType: pkg.id,
        severity: "CRITICAL_PAYMENT_RECONCILE",
      },
    });
    return { kind: "charge_failed", paymentId: payment.id };
  }

  // ━━ 첫 충전 보너스 파밍 방지: 로그인 수단 해시 원장에 'first_charge' 1회 청구(lib/auth/identity-hash.ts — 카카오는 옛 공식과 같은 값).
  // 탈퇴→재가입해도 1인 1회. 청구가 처음일 때만 지급(payments count 대신 원장이 권위).
  let bonusStars = 0;
  let bonusBalance: number | null = null;
  let chargerHash: string | null = null;
  let lookupErr: unknown = null;
  try {
    const primary = primaryIdentity(await getUserIdentities(userId));
    if (primary) chargerHash = identityHash(primary.provider, primary.providerUserId);
  } catch (err) {
    lookupErr = err;
  }
  if (!chargerHash) {
    // severity 이름은 어드민 필터 연속성 때문에 그대로 둔다(이제 카카오만이 아니라 로그인 수단 조회)
    await logError(lookupErr ?? new Error("identity lookup failed for first bonus"), {
      route,
      userId,
      extra: { paymentId: payment.id, severity: "FIRST_BONUS_KAKAO_LOOKUP_FAILED" },
    });
  } else {
    const { data: firstChargeClaim, error: claimErr } = await supabase
      .from("bonus_claims")
      .upsert(
        { kakao_id_hash: chargerHash, bonus_type: "first_charge" },
        { onConflict: "kakao_id_hash,bonus_type", ignoreDuplicates: true }
      )
      .select("kakao_id_hash");
    if (claimErr) {
      await logError(claimErr, {
        route,
        userId,
        extra: { paymentId: payment.id, severity: "FIRST_BONUS_CLAIM_CHECK_FAILED" },
      });
    }
    if (!claimErr && (firstChargeClaim?.length ?? 0) > 0) {
      bonusStars = Math.round(pkg.stars * FIRST_CHARGE_BONUS_RATE);
      const bonus = await chargeStars(userId, bonusStars, `first_bonus:${userId}`, "first_charge_bonus");
      if (!bonus.success) {
        // 원장은 이미 청구됨(위 upsert) → 재시도해도 스킵되어 유료 유저가 보너스를
        // 영구히 잃음. 재시도로 복구 불가라 운영자 수동 지급 필요 → CRITICAL.
        await logError(new Error("first charge bonus grant failed after ledger claim"), {
          route,
          userId,
          extra: { paymentId: payment.id, bonusStars, severity: "CRITICAL_FIRST_BONUS_LOST" },
        });
        bonusStars = 0;
      } else if (bonus.idempotent) {
        bonusStars = 0; // 이미 받은 적 있음(레이스/재시도)
      } else {
        bonusBalance = bonus.balance; // 보너스까지 반영된 권위 잔액
      }
    }
  }

  // 이 결제가 준 보너스를 결제 행에 남긴다(환불 회수 때 결제 별 + 보너스를 같이 거두려고). 실패해도 별은 이미 줬다 — 로그만.
  if (bonusStars > 0) {
    const { error: bonusRecErr } = await supabase
      .from("payments")
      .update({ bonus_stars: bonusStars })
      .eq("id", payment.id);
    if (bonusRecErr) {
      await logWarn("payments.bonus_stars 기록 실패 — 별은 이미 지급됨", {
        route,
        userId,
        extra: { paymentId: payment.id, bonusStars, severity: "PAYMENT_BONUS_STARS_RECORD_FAILED" },
      });
    }
  }

  return {
    kind: "granted",
    paymentId: payment.id,
    stars: pkg.stars,
    bonusStars,
    balance: bonusBalance ?? charge.balance,
  };
}
