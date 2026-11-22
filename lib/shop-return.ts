// lib/shop-return.ts — 토스 결제창에서 돌아온 /shop 의 결과 종류(순수 · 클라 세이프).
// successUrl 은 확인 후 /shop?status=success, failUrl 은 /shop?status=fail&code=…&message=… 로 온다(lib/use-toss-payment).
// 디자인 다듬기 상점 ⑥ 가(운영자 11-21): 사용자가 결제창을 직접 닫은 것(PAY_PROCESS_CANCELED)은 '실패'가 아니라 '멈춤'으로 보여 준다
// — 예전엔 빨간 '결제 실패: 사용자에 의해 결제가 취소되었습니다'가 떴다.
export type ShopReturnKind = "success" | "fail" | "cancel";

export function shopReturnKind(status: string | null, code: string | null): ShopReturnKind | null {
  if (status === "success") return "success";
  if (status === "cancel") return "cancel";
  if (status === "fail") return code === "PAY_PROCESS_CANCELED" ? "cancel" : "fail";
  return null;
}

/** 실패 카드 둘째 줄 — 토스가 준 이유. '카드사 답'은 카드사가 거절한 코드에만 붙인다(계좌이체·간편결제 실패까지 카드사 탓이 됐었다) */
export function shopFailReason(code: string | null, message: string | null): string {
  if (!message) return "다시 골라서 해볼래?";
  return code?.startsWith("REJECT_CARD") ? `카드사 답: ${message}` : message;
}
