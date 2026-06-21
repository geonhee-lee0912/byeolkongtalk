// 토스페이먼츠 서버 유틸 — v1 (tarot-friend) 에서 이식.

const TOSS_API_URL = "https://api.tosspayments.com/v1";

function getAuthHeader(): string {
  const secretKey = process.env.TOSS_SECRET_KEY!;
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

/**
 * 주문 ID 생성 (토스 규격: 영문·숫자·-·_ / 6~64자)
 */
export function generateOrderId(userId: string, packageType: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `order_${packageType}_${timestamp}_${random}`;
}

/**
 * 결제 승인 (successUrl 콜백 후 서버에서 호출)
 */
export async function confirmPayment(
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<TossPaymentResult> {
  const res = await fetch(`${TOSS_API_URL}/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new TossPaymentError(data.code, data.message);
  }

  return data;
}

/**
 * 결제 조회
 */
export async function getPayment(paymentKey: string): Promise<TossPaymentResult> {
  const res = await fetch(`${TOSS_API_URL}/payments/${paymentKey}`, {
    headers: { Authorization: getAuthHeader() },
  });

  return res.json();
}

/**
 * 결제 취소
 */
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string
): Promise<TossPaymentResult> {
  const res = await fetch(`${TOSS_API_URL}/payments/${paymentKey}/cancel`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cancelReason }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new TossPaymentError(
      data?.code ?? "CANCEL_FAILED",
      data?.message ?? "결제 취소 실패"
    );
  }
  return data;
}

// ===== Types =====

export interface TossPaymentResult {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  method: string;
  requestedAt: string;
  approvedAt: string;
  [key: string]: unknown;
}

export class TossPaymentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TossPaymentError";
  }
}
