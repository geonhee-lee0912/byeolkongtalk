// 앱 결제 확인 — 앱(StoreKit 2 / Play Billing)이 결제를 마친 뒤 거래 식별자를 앱 토큰과 함께 보낸다. 스펙 2026-11-23-앱-결제 §3.
// 서버가 권위: 앱이 보낸 건 거래 id(애플)·구매 토큰(구글)뿐이고, 상품·계정 토큰·상태는 스토어에 직접 물어 본 값만 믿는다.
// 앱은 ok(지급·already) 또는 revoked 일 때만 거래를 마무리(finish)한다 — 나머지 실패는 다음 실행 때 다시 보낸다(멱등 = payments.pg_tid 유니크).
// 구글은 ok 를 줄 때 서버가 먼저 소비(consume)한다 — 앱의 finishTransaction 은 '이미 소비됨' 오류를 견뎌야 한다(Task 7).
// GET = 이 회원의 스토어 계정 토큰(앱이 결제 때 싣는다). 손님 취소는 이 라우트에 오지 않는다(앱이 조용히 닫는다).
// 🔴 구매 토큰은 로그에 남기지 않는다.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { STAR_PACKAGES } from "@/lib/constants";
import { grantStarPackage } from "@/lib/payment/grant";
import { iapAccountToken } from "@/lib/payment/iap/account-token";
import { verifyAppleTransaction } from "@/lib/payment/iap/apple";
import { consumeGooglePurchase, verifyGooglePurchase } from "@/lib/payment/iap/google";
import { iapConfigured, type VerifiedPurchase } from "@/lib/payment/iap/verify";
import { noStore, parsePlatform, rateLimited, readJson, str } from "@/lib/auth/app-route";

const ROUTE = "/api/payment/iap";

const reply = (body: Record<string, unknown>, status = 200) => noStore(NextResponse.json(body, { status }));
const fail = (error: string, status: number) => reply({ error }, status);

export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return fail("unauthenticated", 401);
  try {
    return reply({ accountToken: iapAccountToken(userId) });
  } catch (err) {
    // APP_ACCESS_TOKEN_SECRET 없음 — 앱 토큰도 못 만드는 설정이라 사실상 쿠키 세션에서만 온다
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId }));
    return fail("iap_not_configured", 503);
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "iap", 20);
  if (limited) return limited;

  const { userId } = await getSession();
  if (!userId) return fail("unauthenticated", 401);

  const body = await readJson(request);
  const platform = parsePlatform(body?.platform);
  const productId = str(body?.productId);
  const transactionId = str(body?.transactionId);
  const purchaseToken = str(body?.purchaseToken);
  if (!platform || !productId || (platform === "ios" ? !transactionId : !purchaseToken)) return fail("bad_request", 400);

  const pkg = STAR_PACKAGES.find((p) => p.id === productId);
  if (!pkg) return fail("unknown_product", 400);

  const logCtx = (extra: Record<string, unknown> = {}) =>
    ctxFromRequest(request, { route: ROUTE, userId, extra: { platform, productId, ...extra } });

  if (!iapConfigured(platform)) {
    await logError(new Error(`IAP not configured for ${platform}`), logCtx());
    return fail("iap_not_configured", 503);
  }

  let purchase: VerifiedPurchase | null;
  try {
    purchase = platform === "ios" ? await verifyAppleTransaction(transactionId) : await verifyGooglePurchase(productId, purchaseToken);
  } catch (err) {
    // 스토어 장애·키 거절·서명 검증 실패 — 앱은 거래를 마무리하지 않고 다음에 다시 보낸다
    await logError(err, logCtx({ step: "store_verify" }));
    return fail("store_unreachable", 502);
  }
  if (!purchase) {
    await logWarn("IAP purchase not found at store", logCtx());
    return fail("bad_request", 400);
  }
  if (purchase.productId !== productId) {
    await logWarn("IAP product mismatch", logCtx({ storeProductId: purchase.productId }));
    return fail("product_mismatch", 400);
  }

  // 결제 중 로그아웃 → 다른 회원으로 로그인한 뒤 재전송된 거래 — 지급도 마무리도 하지 않는다
  if (purchase.accountToken === null) {
    await logWarn("IAP purchase without account token — granted to session user", logCtx({ store: purchase.store }));
  } else if (purchase.accountToken.toLowerCase() !== iapAccountToken(userId)) {
    await logWarn("IAP account token mismatch", logCtx({ store: purchase.store }));
    return fail("account_mismatch", 409);
  }
  if (purchase.pending) return fail("pending", 402);
  if (purchase.revoked) return fail("revoked", 409);

  const grant = await grantStarPackage({
    userId,
    pkg,
    provider: purchase.store,
    tid: purchase.tid,
    amountWon: purchase.sandbox ? 0 : pkg.price,
  });
  // 구글은 별을 준 뒤(200 을 줄 때만) 서버에서 소비한다(스펙 §3 — 3일 안에 안 하면 자동 환불). 실패해도 별은 이미 들어갔으니 warn 만 —
  // 앱의 finishTransaction 이 한 번 더 소비를 시도하고, 그래도 못 하면 다음 재전송(already)에서 다시 소비한다
  const consumeIfGoogle = async () => {
    if (platform !== "android") return;
    try {
      await consumeGooglePurchase(productId, purchaseToken);
    } catch (err) {
      await logWarn(`Google consume failed: ${err instanceof Error ? err.message : "unknown"}`, logCtx({ store: "google", step: "consume" }));
    }
  };

  switch (grant.kind) {
    case "granted":
      await consumeIfGoogle();
      return reply({ ok: true, stars: grant.stars, bonusStars: grant.bonusStars, balance: grant.balance, already: false });
    case "already":
      // 이미 다른 회원이 받은 거래(계정 토큰이 비어 위 대조를 지나온 경우) — 별은 원래 주인에게만. 소비도 안 한다
      if (grant.ownerUserId !== null && grant.ownerUserId !== userId) {
        await logWarn("IAP transaction already granted to another member", logCtx({ store: purchase.store }));
        return fail("account_mismatch", 409);
      }
      await consumeIfGoogle();
      return reply({ ok: true, stars: grant.stars, bonusStars: 0, balance: grant.balance, already: true });
    case "insert_failed":
      await logError(grant.error, logCtx({ step: "payment_insert", store: purchase.store }));
      return fail("grant_failed", 500);
    case "charge_failed":
      // 결제 기록은 남았고 지급 함수가 CRITICAL_PAYMENT_RECONCILE 로그를 남겼다. 다음 재전송의 already 경로가 충전을 다시 시도한다(grant.ts)
      return fail("grant_failed", 500);
  }
}
