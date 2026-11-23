// 구글 구매 확인(lib/payment/iap/google.ts) — 네트워크 없이 토큰·fetch 자리만 가짜로 끼워
// Play Developer API purchases.products.get 응답 → VerifiedPurchase 매핑을 잠근다(purchaseState 0/1/2 · purchaseType 0 = 테스트 구매).
import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeGooglePurchase, verifyGooglePurchase, type GoogleDeps } from "./google.ts";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`google.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const TOKEN = "fake-purchase-token/with+odd=chars";
const ORDER_ID = "GPA.0000-0000-0000-00001";
const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function deps(status: number, body: unknown) {
  const calls: { url: string; auth: string | null }[] = [];
  const d: GoogleDeps = {
    accessToken: async () => "test-access-token",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
      return Response.json(body, { status });
    }) as typeof fetch,
  };
  return { d, calls };
}

const purchase = (over: Record<string, unknown> = {}) => ({
  kind: "androidpublisher#productPurchase",
  purchaseState: 0,
  consumptionState: 0,
  orderId: ORDER_ID,
  productId: "star_70",
  obfuscatedExternalAccountId: ACCOUNT,
  ...over,
});

test("구매 완료(purchaseState 0) — google:<주문 id>, 패키지 이름·상품·토큰이 주소에, 서비스 계정 토큰으로 인증", async () => {
  const { d, calls } = deps(200, purchase());
  const v = await verifyGooglePurchase("star_70", TOKEN, d);
  assert.deepEqual(v, {
    store: "google",
    productId: "star_70",
    tid: `google:${ORDER_ID}`,
    sandbox: false,
    accountToken: ACCOUNT,
    revoked: false,
    pending: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.byeolkongtalk.app/purchases/products/star_70/tokens/${encodeURIComponent(TOKEN)}`,
  );
  assert.equal(calls[0].auth, "Bearer test-access-token");
});

test("purchaseState 1(취소) → revoked · 2(대기) → pending", async () => {
  assert.equal((await verifyGooglePurchase("star_70", TOKEN, deps(200, purchase({ purchaseState: 1 })).d))?.revoked, true);
  const p = await verifyGooglePurchase("star_70", TOKEN, deps(200, purchase({ purchaseState: 2 })).d);
  assert.equal(p?.pending, true);
  assert.equal(p?.revoked, false);
});

test("purchaseType 0(라이선스 테스터) → sandbox, tid google-test:<주문 id>", async () => {
  const v = await verifyGooglePurchase("star_70", TOKEN, deps(200, purchase({ purchaseType: 0 })).d);
  assert.equal(v?.sandbox, true);
  assert.equal(v?.tid, `google-test:${ORDER_ID}`);
});

test("응답에 productId 가 없으면 물어본 상품 id(주소에 넣은 것) · 계정 토큰 없으면 null", async () => {
  const v = await verifyGooglePurchase(
    "star_70",
    TOKEN,
    deps(200, purchase({ productId: undefined, obfuscatedExternalAccountId: undefined })).d,
  );
  assert.equal(v?.productId, "star_70");
  assert.equal(v?.accountToken, null);
});

test("구매 완료인데 주문 id 가 없으면 null(결제 고유 번호를 못 만든다 — 구매 토큰은 넣지 않는다)", async () => {
  assert.equal(await verifyGooglePurchase("star_70", TOKEN, deps(200, purchase({ orderId: undefined })).d), null);
});

test("purchaseState 가 0·1·2 가 아니면 던진다(모르는 상태를 지급으로 보지 않는다)", async () => {
  await assert.rejects(verifyGooglePurchase("star_70", TOKEN, deps(200, purchase({ purchaseState: undefined })).d));
  await assert.rejects(verifyGooglePurchase("star_70", TOKEN, deps(200, purchase({ purchaseState: 7 })).d));
});

test("400·404·410(그런 구매 없음·토큰 틀림) → null / 401·403·5xx → 던짐 — 오류 글에 구매 토큰이 없다", async () => {
  for (const status of [400, 404, 410]) {
    assert.equal(await verifyGooglePurchase("star_70", TOKEN, deps(status, { error: {} }).d), null, String(status));
  }
  for (const status of [401, 403, 500, 503]) {
    await assert.rejects(verifyGooglePurchase("star_70", TOKEN, deps(status, { error: {} }).d), (err: Error) => {
      assert.ok(!err.message.includes(TOKEN));
      assert.ok(err.message.includes(String(status)));
      return true;
    });
  }
});

test("네트워크 실패도 던지되 토큰·주소를 오류에 싣지 않는다", async () => {
  const d: GoogleDeps = {
    accessToken: async () => "test-access-token",
    fetch: (async (input: RequestInfo | URL) => {
      throw new TypeError(`fetch failed ${String(input)}`);
    }) as typeof fetch,
  };
  await assert.rejects(verifyGooglePurchase("star_70", TOKEN, d), (err: Error) => {
    assert.ok(!err.message.includes(encodeURIComponent(TOKEN)));
    assert.equal((err as { cause?: unknown }).cause, undefined);
    return true;
  });
});

// ───────────────────────── 소비(consume) ─────────────────────────
// 스펙 §3: 별 지급 뒤 서버에서 consume(3일 안에 안 하면 구글이 자동 환불). 라우트는 실패해도 200 을 주고 warn 만 남긴다(iap-route.test.ts)

function consumeDeps(res: () => Response | Promise<Response>) {
  const calls: { url: string; method: string | undefined; auth: string | null }[] = [];
  const d: GoogleDeps = {
    accessToken: async () => "test-access-token",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, auth: new Headers(init?.headers).get("authorization") });
      return res();
    }) as typeof fetch,
  };
  return { d, calls };
}

test("consume — POST …/products/{상품}/tokens/{토큰}:consume, 서비스 계정 토큰으로, 204 면 끝", async () => {
  const { d, calls } = consumeDeps(() => new Response(null, { status: 204 }));
  await consumeGooglePurchase("star_70", TOKEN, d);
  assert.deepEqual(calls, [
    {
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.byeolkongtalk.app/purchases/products/star_70/tokens/${encodeURIComponent(TOKEN)}:consume`,
      method: "POST",
      auth: "Bearer test-access-token",
    },
  ]);
  // 200 + 빈 JSON 도 성공
  await consumeGooglePurchase("star_70", TOKEN, consumeDeps(() => Response.json({}, { status: 200 })).d);
});

test("consume 실패(HTTP 4xx·5xx · 네트워크) → 던지되 오류 글에 구매 토큰이 없다", async () => {
  for (const status of [400, 401, 500]) {
    await assert.rejects(consumeGooglePurchase("star_70", TOKEN, consumeDeps(() => Response.json({ error: {} }, { status })).d), (err: Error) => {
      assert.equal(err.message, `google purchases.products.consume HTTP ${status}`);
      return true;
    });
  }
  const net = consumeDeps(() => {
    throw new TypeError(`fetch failed ${TOKEN}`);
  });
  await assert.rejects(consumeGooglePurchase("star_70", TOKEN, net.d), (err: Error) => {
    assert.ok(!err.message.includes(TOKEN) && !err.message.includes(encodeURIComponent(TOKEN)));
    assert.equal((err as { cause?: unknown }).cause, undefined);
    return true;
  });
});
