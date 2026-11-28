import { test } from "node:test";
import assert from "node:assert/strict";
import { createIapFlow, type ConfirmReply, type IapDeps, type StorePurchase } from "./flow.ts";

/** 손으로 끝내는 약속 — 스토어 창·서버 확인이 어느 순간에 끝나는지 테스트가 정한다 */
function gate<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const ios = (productId: string, transactionId: string, accountToken: string | null = "acc-1"): StorePurchase => ({
  platform: "ios",
  productId,
  transactionId,
  accountToken,
});
const android = (productId: string, purchaseToken: string, accountToken: string | null = "acc-1"): StorePurchase => ({
  platform: "android",
  productId,
  purchaseToken,
  accountToken,
});
const keyOf = (p: StorePurchase) => p.transactionId ?? p.purchaseToken;

const OK: ConfirmReply = { ok: true, stars: 30, bonusStars: 6, balance: 41 };
const err = (status: number, error: string): ConfirmReply => ({ ok: false, status, error });

function setup(over: Partial<IapDeps> = {}, opts: { buyTimeoutMs?: number } = {}) {
  const calls: string[] = [];
  const warns: string[] = [];
  const deps: IapDeps = {
    ensureAccessToken: async () => "A1",
    accountToken: async (access) => {
      calls.push(`token ${access}`);
      return "acc-1";
    },
    fetchProducts: async (ids) => {
      calls.push(`fetch ${ids.join(",")}`);
      return [];
    },
    purchase: async (productId, accountToken) => {
      calls.push(`purchase ${productId} ${accountToken}`);
      return ios(productId, "t1");
    },
    pending: async () => {
      calls.push("pending");
      return [];
    },
    confirm: async (p, access) => {
      calls.push(`confirm ${keyOf(p)} ${access}`);
      return OK;
    },
    finish: async (p) => {
      calls.push(`finish ${keyOf(p)}`);
    },
    warn: (m) => {
      warns.push(m);
    },
    ...over,
  };
  return { flow: createIapFlow(deps, opts), calls, warns };
}

// ① 정상
test("구매 성공 → 서버 확인 → 마무리 → 웹엔 지급 결과", async () => {
  const { flow, calls } = setup();
  const r = await flow.buy("star_30");
  assert.deepEqual(r, { productId: "star_30", ok: true, stars: 30, bonusStars: 6, balance: 41 });
  assert.deepEqual(calls, ["token A1", "purchase star_30 acc-1", "confirm t1 A1", "finish t1"]);
});

// ②
test("사용자가 스토어 창을 닫으면 서버 확인·마무리 없이 cancelled", async () => {
  const { flow, calls, warns } = setup({ purchase: async () => "cancelled" });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "cancelled" });
  assert.ok(!calls.some((c) => c.startsWith("confirm") || c.startsWith("finish")));
  assert.deepEqual(warns, []); // 손님 취소는 기록하지 않는다(스펙 §3 실패 분류)
});

test("승인 대기(가족 승인 등)는 pending — 마무리하지 않는다", async () => {
  const { flow, calls } = setup({ purchase: async () => "pending" });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "pending" });
  assert.ok(!calls.some((c) => c.startsWith("finish")));
});

// ③
test("서버 확인이 네트워크로 실패하면 마무리하지 않고 failed — 다음 실행 때 다시 보낸다", async () => {
  const { flow, calls, warns } = setup({
    confirm: async () => {
      throw new TypeError("Network request failed");
    },
  });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
  assert.ok(!calls.some((c) => c.startsWith("finish")));
  assert.equal(warns.length, 1);
});

// ④
test("account_mismatch 면 마무리하지 않는다(다른 회원으로 산 거래)", async () => {
  const { flow, calls } = setup({ confirm: async () => err(409, "account_mismatch") });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "account_mismatch" });
  assert.ok(!calls.some((c) => c.startsWith("finish")));
});

test("서버 답별 마무리 규칙 — ok·revoked 만 마무리, 나머지는 남겨 둔다", async () => {
  const cases: [ConfirmReply, boolean, string][] = [
    [err(402, "pending"), false, "pending"],
    [err(401, "unauthenticated"), false, "failed"],
    [err(500, "grant_failed"), false, "failed"],
    [err(502, "store_unreachable"), false, "failed"],
    [err(503, "iap_not_configured"), false, "failed"],
    [err(400, "product_mismatch"), false, "failed"],
    [err(400, "unknown_product"), false, "failed"],
    [err(400, "bad_request"), false, "failed"],
    [err(409, "revoked"), true, "failed"],
  ];
  for (const [reply, finishes, reason] of cases) {
    const { flow, calls } = setup({ confirm: async () => reply });
    const r = await flow.buy("star_30");
    assert.deepEqual(r, { productId: "star_30", ok: false, reason }, reply.ok ? "" : reply.error);
    assert.equal(calls.includes("finish t1"), finishes, reply.ok ? "" : reply.error);
  }
});

test("400(상품 불일치 등)은 버그 신호라 경고를 남긴다 — 돈이 나간 거래를 조용히 소비하지 않는다", async () => {
  const { flow, warns } = setup({ confirm: async () => err(400, "product_mismatch") });
  await flow.buy("star_30");
  assert.equal(warns.length, 1);
});

// ⑤
test("미완료 거래 재전송 — 각각 서버 확인, ok 인 것만 마무리", async () => {
  const { flow, calls } = setup({
    pending: async () => [ios("star_10", "t1"), ios("star_30", "t2")],
    confirm: async (p, access) => {
      calls.push(`confirm ${keyOf(p)} ${access}`);
      return p.transactionId === "t1" ? OK : err(500, "grant_failed");
    },
  });
  await flow.resumePending();
  assert.deepEqual(calls, ["token A1", "confirm t1 A1", "finish t1", "confirm t2 A1"]);
});

test("재전송은 지금 회원의 계정 토큰이거나 토큰이 빈 거래만 — 다른 계정 거래는 보내지도 마무리하지도 않는다", async () => {
  const { flow, calls } = setup({
    pending: async () => [ios("star_10", "mine", "ACC-1"), ios("star_10", "other", "acc-2"), android("star_30", "blank", null)],
  });
  await flow.resumePending();
  assert.deepEqual(calls, ["token A1", "confirm mine A1", "finish mine", "confirm blank A1", "finish blank"]);
});

// ⑥
test("로그인 안 됨이면 재전송은 아무것도 부르지 않는다", async () => {
  const { flow, calls } = setup({ ensureAccessToken: async () => null });
  await flow.resumePending();
  await flow.handleStorePurchase(ios("star_10", "t9"));
  assert.deepEqual(calls, []);
});

test("로그인 안 됨이면 구매는 스토어 창을 열지 않고 failed", async () => {
  const { flow, calls } = setup({ ensureAccessToken: async () => null });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
  assert.deepEqual(calls, []);
});

test("재전송 중 토큰 갱신이 네트워크로 실패하면 조용히 그만둔다(던지지 않는다)", async () => {
  const { flow, calls } = setup({
    ensureAccessToken: async () => {
      throw new TypeError("Network request failed");
    },
  });
  await flow.resumePending();
  assert.deepEqual(calls, []);
});

// ⑦
test("구매 진행 중 같은 상품을 또 누르면 같은 결과 — 스토어 창은 한 번", async () => {
  const store = gate<StorePurchase>();
  const { flow, calls } = setup({
    purchase: async (productId) => {
      calls.push(`purchase ${productId}`);
      return store.promise;
    },
  });
  const a = flow.buy("star_30");
  const b = flow.buy("star_30");
  store.resolve(ios("star_30", "t1"));
  const [ra, rb] = await Promise.all([a, b]);
  assert.deepEqual(ra, rb);
  assert.equal(ra.ok, true);
  assert.equal(calls.filter((c) => c.startsWith("purchase")).length, 1);
});

test("구매 진행 중 다른 상품을 누르면 그 상품은 바로 failed — 웹이 그 답을 10분 기다리지 않게", async () => {
  const store = gate<StorePurchase>();
  const { flow } = setup({ purchase: async () => store.promise });
  const a = flow.buy("star_30");
  assert.deepEqual(await flow.buy("star_70"), { productId: "star_70", ok: false, reason: "failed" });
  store.resolve(ios("star_30", "t1"));
  assert.equal((await a).ok, true);
});

// 컨트롤러 판정 2 — 어느 길로 가든 iap.buy 하나에 결과 하나
test("흐름 안에서 무엇이 던져도 failed 결과 하나를 돌려준다", async () => {
  const boom = async () => {
    throw new Error("boom");
  };
  const variants: Partial<IapDeps>[] = [
    { ensureAccessToken: boom },
    { accountToken: boom },
    { purchase: boom },
    // 서버 답이 이상한 모양 — 흐름 안에서 TypeError
    { confirm: async () => undefined as unknown as ConfirmReply },
    // 경고 기록마저 던진다
    {
      purchase: boom,
      warn: () => {
        throw new Error("warn boom");
      },
    },
  ];
  for (const v of variants) {
    const { flow, calls } = setup(v);
    assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
    assert.ok(!calls.some((c) => c.startsWith("finish")));
  }
});

test("스토어 창이 끝내 답이 없으면 시간 제한 뒤 failed — 그 뒤 새 구매는 다시 열린다", async () => {
  let n = 0;
  const { flow, calls } = setup(
    {
      purchase: async (productId) => {
        n++;
        calls.push(`purchase ${productId}`);
        return n === 1 ? new Promise<StorePurchase>(() => {}) : ios(productId, "t2");
      },
    },
    { buyTimeoutMs: 20 },
  );
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
  assert.equal((await flow.buy("star_30")).ok, true);
});

test("시간 제한 뒤에 늦게 온 결제도 서버 확인·마무리까지 간다(별이 사라지지 않게)", async () => {
  const store = gate<StorePurchase>();
  const { flow, calls } = setup({ purchase: async () => store.promise }, { buyTimeoutMs: 20 });
  assert.equal((await flow.buy("star_30")).ok, false);
  store.resolve(ios("star_30", "late"));
  await flush();
  await flush();
  assert.ok(calls.includes("confirm late A1"));
  assert.ok(calls.includes("finish late"));
});

// 컨트롤러 판정 1
test("마무리가 실패해도(구글 '이미 소비됨' 등) 결과는 지급 성공 — 서버 확인은 한 번뿐", async () => {
  const { flow, calls, warns } = setup({
    finish: async () => {
      throw new Error("item-not-owned");
    },
  });
  const r = await flow.buy("star_30");
  assert.equal(r.ok, true);
  assert.equal(calls.filter((c) => c.startsWith("confirm")).length, 1);
  assert.equal(warns.length, 1);
});

// 컨트롤러 판정 6
test("스토어 알림으로 온 거래와 재전송이 같은 거래를 동시에 보면 서버 확인·마무리는 한 번", async () => {
  const server = gate<ConfirmReply>();
  const p = android("star_30", "tok-1");
  const { flow, calls } = setup({
    pending: async () => [android("star_30", "tok-1")],
    confirm: async (q, access) => {
      calls.push(`confirm ${keyOf(q)} ${access}`);
      return server.promise;
    },
  });
  const a = flow.handleStorePurchase(p);
  const b = flow.resumePending();
  await flush();
  server.resolve(OK);
  await Promise.all([a, b]);
  assert.equal(calls.filter((c) => c.startsWith("confirm")).length, 1);
  assert.equal(calls.filter((c) => c.startsWith("finish")).length, 1);
});

test("구매 결과를 기다리는 중 재전송이 같은 거래를 봐도 서버 확인·마무리는 한 번", async () => {
  const server = gate<ConfirmReply>();
  const { flow, calls } = setup({
    pending: async () => [ios("star_30", "t1")],
    confirm: async (q, access) => {
      calls.push(`confirm ${keyOf(q)} ${access}`);
      return server.promise;
    },
  });
  const a = flow.buy("star_30");
  await flush();
  const b = flow.resumePending();
  await flush();
  server.resolve(OK);
  const [r] = await Promise.all([a, b]);
  assert.equal(r.ok, true);
  assert.equal(calls.filter((c) => c.startsWith("confirm")).length, 1);
  assert.equal(calls.filter((c) => c.startsWith("finish")).length, 1);
});

test("확인이 끝난 거래가 다시 오면(재전송) 또 보낸다 — 중복 막기는 진행 중일 때만", async () => {
  const { flow, calls } = setup({ confirm: async (q, a) => (calls.push(`confirm ${keyOf(q)} ${a}`), err(502, "store_unreachable")) });
  await flow.handleStorePurchase(ios("star_10", "t1"));
  await flow.handleStorePurchase(ios("star_10", "t1"));
  assert.equal(calls.filter((c) => c.startsWith("confirm")).length, 2);
});

// 컨트롤러 판정 4 — 계정 토큰은 로그인마다 서버에서, 메모리에만
test("계정 토큰은 같은 로그인 동안 한 번만 받고, 로그아웃·다른 로그인이면 다시 받는다", async () => {
  let access = "A1";
  const { flow, calls } = setup({ ensureAccessToken: async () => access });
  await flow.buy("star_10");
  await flow.buy("star_10");
  assert.equal(calls.filter((c) => c.startsWith("token")).length, 1);
  flow.forgetAccount();
  await flow.buy("star_10");
  assert.equal(calls.filter((c) => c.startsWith("token")).length, 2);
  access = "B1";
  await flow.buy("star_10");
  assert.deepEqual(
    calls.filter((c) => c.startsWith("token")),
    ["token A1", "token A1", "token B1"],
  );
});

test("계정 토큰 받기가 실패하면 다음 구매 때 다시 받는다", async () => {
  let n = 0;
  const { flow } = setup({
    accountToken: async () => {
      if (++n === 1) throw new Error("503");
      return "acc-1";
    },
  });
  assert.equal((await flow.buy("star_10")).ok, false);
  assert.equal((await flow.buy("star_10")).ok, true);
});

// 최종 리뷰 I3 — 앱이 앞으로 돌아올 때마다 재전송한다(구글은 소비 안 된 구매를 다시 알려 주지 않고, 3일 뒤 자동 환불). 겹치면 하나로
test("재전송이 진행 중이면 또 불러도 같은 일 — 스토어 미완료 목록은 한 번만 묻는다", async () => {
  const list = gate<StorePurchase[]>();
  const { flow, calls } = setup({
    pending: async () => {
      calls.push("pending");
      return list.promise;
    },
  });
  const a = flow.resumePending();
  await flush();
  const b = flow.resumePending();
  await flush();
  list.resolve([ios("star_10", "t1")]);
  await Promise.all([a, b]);
  assert.equal(calls.filter((c) => c === "pending").length, 1);
  assert.equal(calls.filter((c) => c.startsWith("confirm")).length, 1);
  // 끝난 뒤엔 다시 돈다
  await flow.resumePending();
  assert.equal(calls.filter((c) => c === "pending").length, 2);
});

// 최종 리뷰 I4 — 안드로이드 '이미 가진 상품'(소비 안 된 지난 구매) = 재전송으로 그 구매를 서버 확인·소비하고 웹에 답한다
test("이미 가진 상품(already_owned) — 재전송을 돌리고, 그 상품이 지급되면 ok", async () => {
  const { flow, calls } = setup({
    purchase: async (productId, accountToken) => {
      calls.push(`purchase ${productId} ${accountToken}`);
      return "already_owned";
    },
    pending: async () => {
      calls.push("pending");
      return [android("star_30", "old-tok")];
    },
  });
  const r = await flow.buy("star_30");
  assert.deepEqual(r, { productId: "star_30", ok: true, stars: 30, bonusStars: 6, balance: 41 });
  assert.deepEqual(calls, ["token A1", "purchase star_30 acc-1", "pending", "confirm old-tok A1", "finish old-tok"]);
});

test("이미 가진 상품인데 재전송이 그 상품을 지급하지 못하면 failed(다음 구매는 다시 열린다)", async () => {
  const { flow, calls } = setup({
    purchase: async () => "already_owned",
    pending: async () => {
      calls.push("pending");
      return [android("star_30", "old-tok")];
    },
    confirm: async () => err(502, "store_unreachable"),
  });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
  assert.ok(calls.includes("pending"));
  assert.ok(!calls.some((c) => c.startsWith("finish")));
  const other = setup({ purchase: async () => "already_owned" }); // 목록에 그 상품이 없음
  assert.deepEqual(await other.flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
});

// 최종 리뷰 I2 — 서버에 스토어 비밀값이 없으면 계정 토큰 GET 이 503 → 스토어 창을 열기 전에 failed(손님이 돈을 내지 않는다)
test("계정 토큰 받기가 503(iap_not_configured)이면 스토어 창을 열지 않고 failed", async () => {
  const { flow, calls } = setup({
    accountToken: async () => {
      throw Object.assign(new Error("iap_not_configured"), { status: 503, code: "iap_not_configured" });
    },
  });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
  assert.ok(!calls.some((c) => c.startsWith("purchase") || c.startsWith("confirm")));
});

// Codex 리뷰 P2 — 스토어 창을 보는 사이 액세스 토큰이 만료될 수 있다. 서버 확인 직전에 토큰을 다시 받는다(같은 회원일 때만)
test("구매와 서버 확인 사이에 토큰이 갱신되면 확인은 새 토큰으로", async () => {
  const tokens = ["A1", "A2"];
  const { flow, calls } = setup({ ensureAccessToken: async () => tokens.shift() ?? "A2" });
  const r = await flow.buy("star_30");
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ["token A1", "purchase star_30 acc-1", "token A2", "confirm t1 A2", "finish t1"]);
});

test("구매와 서버 확인 사이에 다른 회원이 되면 확인도 마무리도 안 한다 / 로그아웃이면 failed", async () => {
  const tokens = ["A1", "B1"];
  const { flow, calls } = setup({
    ensureAccessToken: async () => tokens.shift() ?? "B1",
    accountToken: async (access) => {
      calls.push(`token ${access}`);
      return access === "B1" ? "acc-2" : "acc-1";
    },
  });
  assert.deepEqual(await flow.buy("star_30"), { productId: "star_30", ok: false, reason: "account_mismatch" });
  assert.ok(!calls.some((c) => c.startsWith("confirm") || c.startsWith("finish")));

  const gone = ["A1", null];
  const out = setup({ ensureAccessToken: async () => (gone.length ? gone.shift()! : null) });
  assert.deepEqual(await out.flow.buy("star_30"), { productId: "star_30", ok: false, reason: "failed" });
  assert.ok(!out.calls.some((c) => c.startsWith("confirm") || c.startsWith("finish")));
});

test("재전송도 서버 확인 직전에 토큰을 다시 받는다 — 그사이 다른 회원이면 그 뒤 거래는 보내지 않는다", async () => {
  const tokens = ["A1", "A1", "B1"];
  const { flow, calls } = setup({
    ensureAccessToken: async () => tokens.shift() ?? "B1",
    accountToken: async (access) => {
      calls.push(`token ${access}`);
      return access === "B1" ? "acc-2" : "acc-1";
    },
    pending: async () => [ios("star_10", "t1"), ios("star_30", "t2")],
  });
  await flow.resumePending();
  assert.deepEqual(calls, ["token A1", "confirm t1 A1", "finish t1", "token B1"]);
});

// 컨트롤러 판정 8
test("가격 — 스토어의 현지 통화 문자열 그대로, 스토어가 안 준 상품은 뺀다", async () => {
  const { flow } = setup({
    fetchProducts: async () => [
      { id: "star_10", price: "₩1,500" },
      { id: "star_30", price: "₩4,400" },
      { id: "other", price: "$1" },
    ],
  });
  assert.deepEqual(await flow.products(["star_10", "star_30", "star_70"]), [
    { id: "star_10", price: "₩1,500" },
    { id: "star_30", price: "₩4,400" },
  ]);
});

test("가격 조회가 실패하면 빈 목록(웹은 가격 없음 안내) — 던지지 않는다", async () => {
  const { flow, warns } = setup({
    fetchProducts: async () => {
      throw new Error("billing-unavailable");
    },
  });
  assert.deepEqual(await flow.products(["star_10"]), []);
  assert.equal(warns.length, 1);
});
