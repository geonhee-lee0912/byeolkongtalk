// 앱 결제 서버 호출 — /api/payment/iap(앱 토큰 Bearer). 스펙 2026-11-23-앱-결제 §3. 판단(마무리 여부 등)은 flow.ts.
// 🔴 구매 토큰·계정 토큰은 로그에 남기지 않는다.
import { ApiError, postJson } from "../auth/api";
import type { ConfirmReply, StorePurchase } from "./flow.ts";

const PATH = "/api/payment/iap";

/** 이 회원의 스토어 계정 토큰(애플 appAccountToken · 구글 obfuscatedAccountId 에 싣는다) */
export async function fetchAccountToken(access: string): Promise<string> {
  const d = await postJson(PATH, {}, access, "GET");
  if (typeof d.accountToken !== "string" || !d.accountToken) throw new ApiError(500, "bad_response");
  return d.accountToken;
}

/** 거래 확인·지급. 서버가 답했으면(2xx 든 아니든) 그 답, 네트워크 실패·시간 초과는 던진다 */
export async function confirmPurchase(p: StorePurchase, access: string): Promise<ConfirmReply> {
  const body = p.platform === "ios"
    ? { platform: p.platform, productId: p.productId, transactionId: p.transactionId }
    : { platform: p.platform, productId: p.productId, purchaseToken: p.purchaseToken };
  let d: Record<string, unknown>;
  try {
    d = await postJson(PATH, body, access);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, status: e.status, error: e.code };
    throw e;
  }
  const { stars, bonusStars, balance } = d;
  if (d.ok === true && typeof stars === "number" && typeof bonusStars === "number" && typeof balance === "number") {
    return { ok: true, stars, bonusStars, balance };
  }
  // 2xx 인데 모양이 다르다 — 마무리하지 않는다(flow.ts 가 400 이 아니라 '다음에 다시'로 둔다)
  return { ok: false, status: 200, error: "bad_response" };
}
