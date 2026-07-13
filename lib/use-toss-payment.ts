"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  loadTossPayments,
  type TossPaymentsPayment,
} from "@tosspayments/tosspayments-sdk";
import type { StarPackage } from "@/lib/constants";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

interface StartPaymentOptions {
  /** 결제 완료 후 돌아올 URL. /로 시작해야 함. 없으면 /shop으로 돌아감. */
  returnTo?: string;
}

interface UseTossPaymentResult {
  /** 결제창 준비 완료 여부 */
  paymentReady: boolean;
  /** SDK 초기화 에러 메시지 */
  paymentError: string | null;
  /** 결제창 열기 — 반환값: 성공 시 true, 유저 취소/에러 시 false */
  startPayment: (pkg: StarPackage, opts?: StartPaymentOptions) => Promise<boolean>;
}

/**
 * 토스 결제창(API 개별 연동) 시작 훅.
 * shop 페이지와 RechargeSheet 양쪽에서 재사용.
 * userId/customerName 은 마운트 시 /api/auth/me 로 자동 조회.
 */
export function useTossPayment(): UseTossPaymentResult {
  const paymentRef = useRef<TossPaymentsPayment | null>(null);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);

  // 사용자 정보 조회
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.isAuthenticated && data.user?.id) {
          setUserId(data.user.id);
          setCustomerName(data.user.nickname ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 토스 결제창 SDK 초기화
  useEffect(() => {
    if (!userId || paymentRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
        if (cancelled) return;
        const p = tossPayments.payment({ customerKey: userId });
        if (cancelled) return;
        paymentRef.current = p;
        setPaymentReady(true);
      } catch (err) {
        console.error("Toss payment init failed", err);
        if (!cancelled) setPaymentError("payment_init_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const startPayment = useCallback(
    async (pkg: StarPackage, opts?: StartPaymentOptions): Promise<boolean> => {
      if (!paymentRef.current) return false;

      try {
        const readyRes = await fetch("/api/payment/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageType: pkg.id,
            stars: pkg.stars,
            amount: pkg.price,
          }),
        });
        if (!readyRes.ok) throw new Error("Payment ready failed");
        const readyData = await readyRes.json();

        const baseUrl = window.location.origin;

        // returnTo 가 있으면 successUrl/failUrl 에 쿼리로 추가
        // 토스가 자체 파라미터(paymentKey/orderId/amount)를 붙이므로 & 로 공존
        const returnToParam =
          opts?.returnTo &&
          opts.returnTo.startsWith("/") &&
          !opts.returnTo.startsWith("//")
            ? `?returnTo=${encodeURIComponent(opts.returnTo)}`
            : "";

        await paymentRef.current.requestPayment({
          method: "CARD",
          amount: { value: readyData.amount, currency: "KRW" },
          orderId: readyData.orderId,
          orderName: readyData.orderName,
          successUrl: `${baseUrl}/shop${returnToParam}`,
          failUrl: `${baseUrl}/shop?status=fail${opts?.returnTo && opts.returnTo.startsWith("/") && !opts.returnTo.startsWith("//") ? `&returnTo=${encodeURIComponent(opts.returnTo)}` : ""}`,
          customerName: customerName ?? undefined,
        });
        return true;
      } catch (error) {
        const err = error as { code?: string; message?: string };
        if (err.code === "USER_CANCEL" || err.code === "STOP") {
          return false;
        }
        throw error;
      }
    },
    [customerName]
  );

  return { paymentReady, paymentError, startPayment };
}
