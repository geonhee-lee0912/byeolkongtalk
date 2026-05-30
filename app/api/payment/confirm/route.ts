import { NextRequest, NextResponse } from "next/server";
import { cancelPayment, confirmPayment, TossPaymentError } from "@/lib/toss";
import { chargeStars } from "@/lib/stars";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { STAR_PACKAGES } from "@/lib/constants";

/**
 * 토스페이먼츠 결제 승인
 * 프론트엔드 successUrl 콜백 → 이 라우트에서 최종 승인 처리
 */
export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  try {
    const { paymentKey, orderId, amount } = await request.json();

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

    return NextResponse.json({
      success: true,
      stars: pkg.stars,
      balance: charge.balance,
      paymentKey: paymentResult.paymentKey,
    });
  } catch (error) {
    await logError(
      error,
      ctxFromRequest(request, {
        route: "/api/payment/confirm",
        userId,
        extra: {
          tossErrorCode: error instanceof TossPaymentError ? error.code : null,
        },
      })
    );

    if (error instanceof TossPaymentError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Payment confirmation failed" },
      { status: 500 }
    );
  }
}
