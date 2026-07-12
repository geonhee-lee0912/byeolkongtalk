import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { cancelPayment, confirmPayment, TossPaymentError } from "@/lib/toss";
import { chargeStars } from "@/lib/stars";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { STAR_PACKAGES, FIRST_CHARGE_BONUS_RATE } from "@/lib/constants";
import { sendCapiEvent, capiSignalsFromRequest } from "@/lib/meta-capi";

// 개별 결제 실패가 아니라 상점 계정/키/설정 자체가 막힌 상태 — 전 유저 결제 불능.
// 토스 대시보드 상점 상태 확인 + 고객센터(1544-7772) 문의로만 해소 가능.
// 코드 출처: https://docs.tosspayments.com/reference/error-codes
const MERCHANT_BLOCKED_CODES = [
  "NOT_AVAILABLE_PAYMENT_BY_MERCHANT", // 상점에서 결제 불가 상태
  "UNAUTHORIZED_KEY", // 인증되지 않은 키
  "INVALID_API_KEY", // 잘못된 시크릿 키
  "INVALID_UNREGISTERED_SUBMALL", // 등록되지 않은 서브몰
  "NOT_REGISTERED_BUSINESS", // 등록되지 않은 사업자
  "NOT_FOUND_TERMINAL_ID", // 단말기 번호 없음
];

// 유저/카드사 귀책 결제 거절 — 시스템 오류가 아니라 정상적인 결제 실패.
// 잔액부족·한도초과·정지카드 등. error 로 쌓으면 실제 사고 알림에 묻히므로 warn 으로만 남김.
// 토스 공식 문서에서 확인된 고객측 거절 코드만 등재. 미확인/시스템(PROVIDER_ERROR·FAILED_*)
// 코드는 일부러 제외 → 새 코드는 error 로 남아 운영자가 보고 여기 추가하는 fail-safe 구조.
// 코드 출처: https://docs.tosspayments.com/reference/error-codes
const USER_DECLINE_CODES = [
  "REJECT_ACCOUNT_PAYMENT", // 계좌 잔액 부족
  "REJECT_CARD_PAYMENT", // 카드 결제 거절(한도/잔액)
  "INVALID_REJECT_CARD", // 카드 사용 거절
  "INVALID_STOPPED_CARD", // 정지된 카드
  "INVALID_CARD_LOST_OR_STOLEN", // 분실/도난 카드
  "INVALID_CARD_EXPIRATION", // 카드 유효기간 오류
  "INVALID_CARD_NUMBER", // 카드번호 오류
  "EXCEED_MAX_DAILY_PAYMENT_COUNT", // 일 결제 횟수 초과
  "EXCEED_MAX_PAYMENT_AMOUNT", // 일 결제 금액 초과
  "EXCEED_MAX_MONTHLY_PAYMENT_AMOUNT", // 월 결제 한도 초과
  "NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT", // 할부 미지원 카드/가맹점
  "EXCEED_MAX_AUTH_COUNT", // 최대 인증 횟수 초과
  "INVALID_PASSWORD", // 결제 비밀번호 불일치
];

/**
 * 토스페이먼츠 결제 승인
 * 프론트엔드 successUrl 콜백 → 이 라우트에서 최종 승인 처리
 */
export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  // catch 에서 ALREADY_PROCESSED 재조회에 쓰려고 try 밖으로 hoist.
  let paymentKey: string | null = null;

  try {
    const body = await request.json();
    paymentKey = body.paymentKey ?? null;
    const orderId = body.orderId;
    const amount = body.amount;

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // orderId 형식: order_{packageType}_{timestamp}_{random}
    // packageType 이 'star_80' 처럼 underscore 포함이라 정규식으로 복원.
    const idMatch = orderId.match(/^order_(.+?)_(\d+)_([a-z0-9]+)$/);
    const packageType = idMatch?.[1];

    const pkg = STAR_PACKAGES.find(
      (p) => p.id === packageType || p.id === `star_${packageType}`
    );

    if (!pkg || pkg.price !== amount) {
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // ━━ Idempotency: 같은 paymentKey 가 이미 처리됐다면 중복 호출 방지
    const { data: existing } = await supabase
      .from("payments")
      .select("id, status, stars_given")
      .eq("pg_tid", paymentKey)
      .maybeSingle();

    if (existing?.status === "completed") {
      // 이미 처리된 결제 — 새로고침 등으로 재호출된 케이스. 200 으로 묶어서 반환.
      const { data: bal } = await supabase
        .from("star_balances")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        stars: existing.stars_given,
        bonusStars: 0,
        balance: bal?.balance ?? null,
        paymentKey,
      });
    }

    // 토스 결제 승인 API 호출
    const paymentResult = await confirmPayment(paymentKey, orderId, amount);

    // ━━ 안전망: 토스 응답의 totalAmount/orderId/status 재검증
    if (
      paymentResult.totalAmount !== pkg.price ||
      paymentResult.orderId !== orderId ||
      paymentResult.status !== "DONE"
    ) {
      let refundOk = false;
      try {
        await cancelPayment(paymentKey, "Toss response validation failed");
        refundOk = true;
      } catch {
        // 환불 실패는 아래 logError 에서 처리
      }
      await logError(
        new Error(
          `Toss response mismatch: totalAmount=${paymentResult.totalAmount} (expected ${pkg.price}), orderId=${paymentResult.orderId} (expected ${orderId}), status=${paymentResult.status}`
        ),
        {
          route: "/api/payment/confirm",
          userId,
          extra: {
            paymentKey,
            orderId,
            amount,
            tossAmount: paymentResult.totalAmount,
            severity: refundOk
              ? "PAYMENT_MISMATCH_REFUNDED"
              : "CRITICAL_PAYMENT_MISMATCH_NO_REFUND",
          },
        }
      );
      return NextResponse.json(
        { error: "결제 검증 실패", refunded: refundOk },
        { status: 400 }
      );
    }

    // 결제 기록 저장
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        pg_provider: "tosspayments",
        pg_tid: paymentKey,
        amount_won: amount,
        stars_given: pkg.stars,
        package_type: pkg.id,
        status: "completed",
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      // 토스에는 이미 승인된 결제 → 자동 환불 시도해서 반쪽 결제 사고 방지
      let refundOk = false;
      try {
        await cancelPayment(paymentKey, "DB record save failed");
        refundOk = true;
      } catch (refundErr) {
        await logError(refundErr, {
          route: "/api/payment/confirm",
          userId,
          extra: {
            paymentKey,
            orderId,
            amount,
            severity: "CRITICAL_REFUND_FAILED",
          },
        });
      }

      await logError(payErr ?? new Error("payment insert null"), {
        route: "/api/payment/confirm",
        userId,
        extra: {
          paymentKey,
          orderId,
          amount,
          packageType: pkg.id,
          autoRefunded: refundOk,
          severity: refundOk
            ? "PAYMENT_INSERT_FAILED_REFUNDED"
            : "CRITICAL_PAYMENT_INSERT_FAILED_NO_REFUND",
        },
      });
      return NextResponse.json(
        {
          error: refundOk
            ? "결제는 처리됐지만 기록 저장에 실패해서 자동 환불 처리됐어. 다시 시도해줘"
            : "결제 처리 중 문제가 생겼어. 고객센터로 문의해줘",
          refunded: refundOk,
        },
        { status: 500 }
      );
    }

    // 별 충전
    const charge = await chargeStars(userId, pkg.stars, payment.id);
    if (!charge.success) {
      // 결제는 성공했으나 별 충전 실패 — 운영자 즉시 개입 필요한 사고
      await logError(new Error("chargeStars failed after payment"), {
        route: "/api/payment/confirm",
        userId,
        extra: {
          paymentId: payment.id,
          paymentKey,
          stars: pkg.stars,
          packageType: pkg.id,
          severity: "CRITICAL_PAYMENT_RECONCILE",
        },
      });
    }

    // ━━ 첫 충전 보너스 파밍 방지: kakao 해시 원장에 'first_charge' 1회 청구.
    // 탈퇴→재가입해도 1인 1회. 청구가 처음일 때만 지급(payments count 대신 원장이 권위).
    let bonusStars = 0;
    let bonusBalance: number | null = null;
    if (charge.success) {
      const { data: chargerRow, error: chargerErr } = await supabase
        .from("users")
        .select("kakao_id")
        .eq("id", userId)
        .single();
      if (chargerErr || !chargerRow?.kakao_id) {
        await logError(chargerErr ?? new Error("kakao_id lookup failed for first bonus"), {
          route: "/api/payment/confirm",
          userId,
          extra: { paymentId: payment.id, severity: "FIRST_BONUS_KAKAO_LOOKUP_FAILED" },
        });
      } else {
        // kakao_id(BIGINT)는 안전정수 범위(~10자리)라 양 라우트 모두 JS number → 문자열화 → 해시 일치
        const kakaoIdHash = createHash("sha256").update(String(chargerRow.kakao_id)).digest("hex");
        const { data: firstChargeClaim, error: claimErr } = await supabase
          .from("bonus_claims")
          .upsert(
            { kakao_id_hash: kakaoIdHash, bonus_type: "first_charge" },
            { onConflict: "kakao_id_hash,bonus_type", ignoreDuplicates: true }
          )
          .select("kakao_id_hash");
        if (claimErr) {
          await logError(claimErr, {
            route: "/api/payment/confirm",
            userId,
            extra: { paymentId: payment.id, severity: "FIRST_BONUS_CLAIM_CHECK_FAILED" },
          });
        }
        if (!claimErr && (firstChargeClaim?.length ?? 0) > 0) {
          bonusStars = Math.round(pkg.stars * FIRST_CHARGE_BONUS_RATE);
          const bonus = await chargeStars(
            userId,
            bonusStars,
            `first_bonus:${userId}`,
            "first_charge_bonus"
          );
          if (!bonus.success) {
            // 원장은 이미 청구됨(위 upsert) → 재시도해도 스킵되어 유료 유저가 보너스를
            // 영구히 잃음. 재시도로 복구 불가라 운영자 수동 지급 필요 → CRITICAL.
            await logError(new Error("first charge bonus grant failed after ledger claim"), {
              route: "/api/payment/confirm",
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
    }

    // Meta CAPI 구매 전환. eventId=purchase:{paymentId} 로 중복 제거, value=원화.
    const signals = capiSignalsFromRequest(request);
    void sendCapiEvent({
      eventName: "Purchase",
      userId,
      eventId: `purchase:${payment.id}`,
      value: amount,
      ...signals,
    });

    return NextResponse.json({
      success: true,
      stars: pkg.stars,
      bonusStars,
      balance: bonusBalance ?? charge.balance,
      paymentKey: paymentResult.paymentKey,
    });
  } catch (error) {
    const tossCode = error instanceof TossPaymentError ? error.code : null;
    const merchantBlocked =
      tossCode !== null && MERCHANT_BLOCKED_CODES.includes(tossCode);
    // 유저 귀책 결제 거절은 정상적인 실패 → error 알림에서 제외하고 warn 으로만 기록.
    const userDeclined =
      tossCode !== null && USER_DECLINE_CODES.includes(tossCode);

    const logCtx = ctxFromRequest(request, {
      route: "/api/payment/confirm",
      userId,
      extra: {
        tossErrorCode: tossCode,
        ...(merchantBlocked ? { severity: "CRITICAL_PAYMENT_BLOCKED" } : {}),
      },
    });

    // 이미 토스에서 승인된 결제 — 동시 중복 confirm(레이스) 또는 successUrl 새로고침 재호출.
    // 승자 요청이 payments/stars 를 기록하므로 시스템 오류가 아님. 우리 기록이 있으면
    // 멱등 성공으로 응답하고 warn 으로만 남긴다(pg_tid 유니크라 row 는 항상 1개).
    // 기록이 없으면(결제됐는데 별 미지급 우려) 아래 generic error 경로로 흘려 운영자가 보게 둔다.
    if (tossCode === "ALREADY_PROCESSED_PAYMENT" && paymentKey) {
      const supa = getServiceSupabase();
      const { data: paid } = await supa
        .from("payments")
        .select("stars_given")
        .eq("pg_tid", paymentKey)
        .maybeSingle();
      if (paid) {
        await logWarn(
          `Toss payment already processed (idempotent): ${paymentKey}`,
          logCtx
        );
        const { data: bal } = await supa
          .from("star_balances")
          .select("balance")
          .eq("user_id", userId)
          .maybeSingle();
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          stars: paid.stars_given,
          bonusStars: 0,
          balance: bal?.balance ?? null,
          paymentKey,
        });
      }
    }

    if (userDeclined) {
      await logWarn(`Toss payment declined: ${tossCode}`, logCtx);
    } else {
      await logError(error, logCtx);
    }

    if (error instanceof TossPaymentError) {
      return NextResponse.json(
        {
          // 상점 차단은 토스 원문("상점으로 문의해주세요")이 유저에게 혼란만 줌 → 안내 교체
          error: merchantBlocked
            ? "지금 결제 시스템에 문제가 생겨서 잠시 충전이 어려워. 조금 뒤에 다시 시도해줘"
            : error.message,
          code: error.code,
        },
        { status: merchantBlocked ? 503 : 400 }
      );
    }

    return NextResponse.json(
      { error: "Payment confirmation failed" },
      { status: 500 }
    );
  }
}
