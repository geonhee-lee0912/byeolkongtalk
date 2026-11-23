// 구글 구매 확인 — 앱이 보낸 구매 토큰으로 Google Play Developer API purchases.products.get 에 직접 묻는다(서비스 계정). 스펙 2026-11-23-앱-결제 §3.
// 소비(consume) — 별을 준 뒤 라우트가 consumeGooglePurchase 로 서버에서 소비한다(3일 안에 소비·확인이 없으면 구글이 자동 환불).
// 앱도 finishTransaction({isConsumable:true}) 로 한 번 더 소비하려 하니 '이미 소비됨' 오류를 견뎌야 한다(Task 7).
// 서버 비밀값: GOOGLE_PLAY_SERVICE_ACCOUNT(서비스 계정 JSON 전체 — client_email·private_key).
// 🔴 구매 토큰은 결제 고유 번호·로그·오류 글 어디에도 넣지 않는다(그 토큰이면 누구나 구매를 조회할 수 있다).
import { JWT } from "google-auth-library";
import { IAP_APP_ID, type VerifiedPurchase } from "./verify";

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const TIMEOUT_MS = 10_000;

/** 토큰·fetch 자리 — 테스트는 네트워크 없이 이 둘을 바꿔 끼운다 */
export type GoogleDeps = { accessToken(): Promise<string>; fetch: typeof fetch };

/** purchases.products 응답 중 쓰는 칸(developers.google.com/android-publisher/api-ref/rest/v3/purchases.products) */
type ProductPurchase = {
  /** 0 구매 완료 · 1 취소 · 2 대기 */
  purchaseState?: number;
  /** 0 테스트(라이선스 테스터) · 1 프로모션 · 2 보상형. 일반 구매엔 없다 */
  purchaseType?: number;
  orderId?: string;
  productId?: string;
  obfuscatedExternalAccountId?: string;
};

let jwt: JWT | null = null;
function serviceAccountJwt(): JWT {
  if (!jwt) {
    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
    if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT not set");
    const sa = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT missing client_email/private_key");
    jwt = new JWT({ email: sa.client_email, key: sa.private_key.replace(/\\n/g, "\n"), scopes: [SCOPE] });
  }
  return jwt;
}

const realDeps: GoogleDeps = {
  async accessToken() {
    const { token } = await serviceAccountJwt().getAccessToken(); // 만료 전까지 라이브러리가 재사용한다
    if (!token) throw new Error("google service account: empty access token");
    return token;
  },
  fetch: (input, init) => fetch(input, init),
};

/** 그런 구매가 없거나(400·404·410)·구매 완료인데 주문 id 가 없으면 null. 인증 거절·구글 장애·모르는 상태는 던진다 */
export async function verifyGooglePurchase(productId: string, token: string, deps: GoogleDeps = realDeps): Promise<VerifiedPurchase | null> {
  const url = `${API}/${IAP_APP_ID}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const accessToken = await deps.accessToken();
  let res: Response;
  try {
    res = await deps.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // 원래 오류(주소 = 구매 토큰이 실릴 수 있다)는 버린다
    throw new Error("google purchases.products.get request failed");
  }
  if (res.status === 400 || res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`google purchases.products.get HTTP ${res.status}`);
  const p = (await res.json()) as ProductPurchase;

  const state = p.purchaseState;
  if (state !== 0 && state !== 1 && state !== 2) throw new Error(`google purchases.products.get: unexpected purchaseState ${String(state)}`);
  // 결제 고유 번호는 주문 id 로만 만든다 — 구매 완료인데 없으면 지급할 수 없다(대기·취소는 지급하지 않으니 없어도 된다)
  if (state === 0 && !p.orderId) return null;
  const sandbox = p.purchaseType === 0;
  return {
    store: "google",
    productId: p.productId ?? productId, // 응답에 없을 수 있다 — 그땐 주소에 넣은 상품(구글이 그 상품의 토큰인지 확인했다)
    tid: (sandbox ? "google-test:" : "google:") + (p.orderId ?? ""),
    sandbox,
    accountToken: p.obfuscatedExternalAccountId ? p.obfuscatedExternalAccountId.toLowerCase() : null,
    revoked: state === 1,
    pending: state === 2,
  };
}

/** 별을 준 구매를 소비한다(purchases.products.consume — 소비가 확인을 겸한다). 실패는 던진다 — 라우트가 warn 만 남기고 200 을 준다 */
export async function consumeGooglePurchase(productId: string, token: string, deps: GoogleDeps = realDeps): Promise<void> {
  const url = `${API}/${IAP_APP_ID}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`;
  const accessToken = await deps.accessToken();
  let res: Response;
  try {
    res = await deps.fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // 원래 오류(주소 = 구매 토큰이 실릴 수 있다)는 버린다
    throw new Error("google purchases.products.consume request failed");
  }
  if (!res.ok) throw new Error(`google purchases.products.consume HTTP ${res.status}`);
}
