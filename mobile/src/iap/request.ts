// requestPurchase 가 돌아온 뒤 무엇으로 끝낼지 — store.ts 가 쓴다(순수 모듈 — react-native·expo import 금지, 루트 CI 가 돌린다).
// 결과는 보통 스토어 알림(purchaseUpdatedListener / purchaseErrorListener)으로 온다. 그런데 iOS 는 StoreKit 2 가 '승인 대기'(구입 요청)면
// 알림 없이 requestPurchase 가 nil 로 끝날 수 있다(expo-iap ios/ExpoIapModule.swift requestPurchase) — 그러면 기다리는 구매가 시간 제한(9분)까지
// 웹의 구매 버튼을 막는다. 그래서 iOS 는 반환값으로도 끝낸다: 거래면 그 거래, 비었으면 pending(승인되면 스토어 알림으로 다시 온다).

export type AfterRequest<P> =
  /** 알림이 이미 끝냈거나(안드로이드는 늘) 알림을 기다린다 — 기다리던 약속을 그대로 돌려준다 */
  | { kind: "wait" }
  | { kind: "pending" }
  | { kind: "purchase"; purchase: P };

export function afterRequestPurchase<P>(
  platform: "ios" | "android",
  stillWaiting: boolean,
  returned: P | P[] | null | undefined,
): AfterRequest<P> {
  if (!stillWaiting || platform !== "ios") return { kind: "wait" };
  const purchase = Array.isArray(returned) ? returned[0] : returned;
  return purchase ? { kind: "purchase", purchase } : { kind: "pending" };
}
