"use client";

// 토스 결제 훅을 부르는 유일한 자리(그림 없음) — 상점·충전 시트가 브라우저(channel === "toss")일 때만 그리고, 준비 상태를 onChange 로 받는다.
// 🔴 앱 안에선 그리지 않는다 — 그래야 앱에서 토스 SDK·결제창이 한 번도 안 뜬다(애플 3.1.1, lib/shop-in-app.test.ts 가 잠근다).
// 훅은 조건부로 못 부르니 컴포넌트째 안 그린다. 화면에 늘 붙여 두면(시트가 닫혀 있어도) 예전처럼 미리 준비가 끝난다.
import { useEffect } from "react";
import { useTossPayment } from "@/lib/use-toss-payment";

export type TossPayment = ReturnType<typeof useTossPayment>;

export default function TossPaymentBridge({ onChange }: { onChange: (toss: TossPayment) => void }) {
  const { paymentReady, paymentError, startPayment } = useTossPayment();
  useEffect(() => {
    onChange({ paymentReady, paymentError, startPayment });
  }, [paymentReady, paymentError, startPayment, onChange]);
  return null;
}
