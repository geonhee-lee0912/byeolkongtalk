import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEntitlement, getEntitlementStrict, startTrial, TRIAL_DAYS } from "./entitlement.ts";

const NOW = new Date("2026-09-04T12:00:00Z");

test("구독도 체험도 없으면 비자격", () => {
  const e = computeEntitlement({ trialStartedAt: null, subscriptionExpiresAt: null }, NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.reason, "none");
  assert.equal(e.trialUsed, false);
});

test("체험 시작 후 3일 이내면 자격(trial)", () => {
  const started = new Date(NOW.getTime() - 2 * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: started, subscriptionExpiresAt: null }, NOW);
  assert.equal(e.entitled, true);
  assert.equal(e.reason, "trial");
  assert.equal(e.trialUsed, true);
  assert.ok(e.trialEndsAt);
});

test("체험 3일 경과면 비자격이지만 trialUsed=true", () => {
  const started = new Date(NOW.getTime() - (TRIAL_DAYS + 1) * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: started, subscriptionExpiresAt: null }, NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.reason, "none");
  assert.equal(e.trialUsed, true);
});

test("활성 구독이 있으면 체험 여부와 무관하게 자격(subscription)", () => {
  const future = new Date(NOW.getTime() + 10 * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: null, subscriptionExpiresAt: future }, NOW);
  assert.equal(e.entitled, true);
  assert.equal(e.reason, "subscription");
  assert.equal(e.subscriptionExpiresAt, future);
});

test("구독이 우선 — 체험 만료 + 활성 구독이면 subscription", () => {
  const started = new Date(NOW.getTime() - 100 * 86400000).toISOString();
  const future = new Date(NOW.getTime() + 5 * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: started, subscriptionExpiresAt: future }, NOW);
  assert.equal(e.reason, "subscription");
});

// ── DB 를 읽고 쓰는 쪽 — 가짜 supabase 로 **판정**만 본다 ──
// 체인(select·update·eq·is·gt·order·limit) 끝에서 await 하면 `테이블.동사[.single|.maybeSingle]` 키의 응답을 준다.
// 키가 없는 호출은 던진다(= 테스트가 모르는 조회를 코드가 했다). calls 는 불린 키 순서 — '두 번째 조회를 안 했다'를 본다.
type Reply = { data: unknown; error: unknown };
function fakeSupa(replies: Record<string, Reply>) {
  const calls: string[] = [];
  const supa = {
    from(table: string) {
      let verb = "select";
      let terminal = "";
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => { verb = "update"; return chain; },
        eq: () => chain,
        is: () => chain,
        gt: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => { terminal = ".single"; return chain; },
        maybeSingle: () => { terminal = ".maybeSingle"; return chain; },
        then: (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) => {
          const key = `${table}.${verb}${terminal}`;
          calls.push(key);
          const reply = replies[key];
          return reply ? Promise.resolve(reply).then(resolve, reject) : Promise.reject(new Error(`가짜 DB 에 없는 호출: ${key}`)).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return { supa: supa as unknown as SupabaseClient, calls };
}

const H = 3_600_000;
const ok = (data: unknown): Reply => ({ data, error: null });
const fail = (message: string): Reply => ({ data: null, error: { message, code: "08006" } });

// 🔴 구독 라우트는 엄격하게 읽는다 — supabase-js 는 일시 실패를 { error } 로 돌려줘서(throw 가 아니다), 느슨한 getEntitlement 는
//    그걸 '체험 전·구독 없음'으로 읽는다. 그러면 구독자도 409 판정을 지나 20별이 또 빠지고(이어 붙임), 체험을 쓴 사람은 33일 + 체험 재기록이 된다.
test("getEntitlementStrict — 정상 조회는 getEntitlement 와 같은 판정(체험 중)", async () => {
  const startedAt = new Date(Date.now() - H).toISOString();
  const { supa } = fakeSupa({
    "users.select.maybeSingle": ok({ byeolmaru_trial_started_at: startedAt }),
    "byeolmaru_subscriptions.select": ok([]),
  });
  const e = await getEntitlementStrict("u1", supa);
  assert.equal(e.reason, "trial");
  assert.equal(e.trialUsed, true);
});

test("getEntitlementStrict — 활성 구독 행이 있으면 구독 중", async () => {
  const expires = new Date(Date.now() + 5 * 24 * H).toISOString();
  const { supa } = fakeSupa({
    "users.select.maybeSingle": ok({ byeolmaru_trial_started_at: null }),
    "byeolmaru_subscriptions.select": ok([{ expires_at: expires }]),
  });
  const e = await getEntitlementStrict("u1", supa);
  assert.equal(e.reason, "subscription");
  assert.equal(e.subscriptionExpiresAt, expires);
});

test("getEntitlementStrict — users 조회가 DB 에러면 '체험 전'으로 읽지 않고 던진다", async () => {
  const { supa } = fakeSupa({
    "users.select.maybeSingle": fail("users down"),
    "byeolmaru_subscriptions.select": ok([]),
  });
  await assert.rejects(getEntitlementStrict("u1", supa), /get_entitlement_failed.*users=users down/);
});

test("getEntitlementStrict — 구독 조회가 DB 에러면 '구독 없음'으로 읽지 않고 던진다", async () => {
  const { supa } = fakeSupa({
    "users.select.maybeSingle": ok({ byeolmaru_trial_started_at: null }),
    "byeolmaru_subscriptions.select": fail("subs down"),
  });
  await assert.rejects(getEntitlementStrict("u1", supa), /get_entitlement_failed.*subscriptions=subs down/);
});

// 🔴 users 행이 없는 쿠키(다른 기기에서 탈퇴 등)는 에러가 아니다 — .single() 은 0행을 PGRST116 으로 돌려줘 매 호출 error 로그가 쌓였고,
//    엄격 조회에선 던지게 된다. .maybeSingle() 이면 행 없음 = 체험 전·구독 없음(기존 의미)이다.
test("getEntitlementStrict — users 행이 없으면 에러가 아니라 체험 전·구독 없음(.single() 이었으면 PGRST116 으로 던졌다)", async () => {
  const { supa } = fakeSupa({
    "users.select.maybeSingle": ok(null),
    "users.select.single": { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } },
    "byeolmaru_subscriptions.select": ok([]),
  });
  const e = await getEntitlementStrict("ghost", supa);
  assert.equal(e.entitled, false);
  assert.equal(e.trialUsed, false);
});

// 🔴 체험 시작 — UPDATE 가 행을 돌려줬으면 체험은 열린 것이다. 그 뒤 두 번째 조회(.single)가 일시 실패해도 던지면 안 된다
//    (사용자는 '체험이 안 열렸어', 구독 라우트엔 거짓 record_trial 에러).
test("startTrial — UPDATE 가 행을 돌려주면 그 시각이 시작 시각이고 두 번째 조회는 하지 않는다", async () => {
  const startedAt = "2026-10-12T01:02:03.000Z";
  const { supa, calls } = fakeSupa({
    "users.update": ok([{ byeolmaru_trial_started_at: startedAt }]),
    // 두 번째 조회가 불리면 던지도록 실패로 둔다 — 불렸다면 이 테스트가 깨진다
    "users.select.single": fail("second read down"),
  });
  const r = await startTrial("u1", supa);
  assert.deepEqual(r, {
    started: true,
    alreadyUsed: false,
    trialEndsAt: new Date(Date.parse(startedAt) + TRIAL_DAYS * 86_400_000).toISOString(),
  });
  assert.deepEqual(calls, ["users.update"]);
});

test("startTrial — 이미 시작돼 있으면(UPDATE 0행) 그때만 조회해 기존 시작 시각으로 끝 시각을 낸다", async () => {
  const startedAt = "2026-10-10T00:00:00.000Z";
  const { supa, calls } = fakeSupa({
    "users.update": ok([]),
    "users.select.single": ok({ byeolmaru_trial_started_at: startedAt }),
  });
  const r = await startTrial("u1", supa);
  assert.deepEqual(r, {
    started: false,
    alreadyUsed: true,
    trialEndsAt: new Date(Date.parse(startedAt) + TRIAL_DAYS * 86_400_000).toISOString(),
  });
  assert.deepEqual(calls, ["users.update", "users.select.single"]);
});

test("startTrial — UPDATE 가 DB 에러면 던진다(성공·이미 썼음으로 돌려주지 않는다)", async () => {
  const { supa } = fakeSupa({ "users.update": fail("update down") });
  await assert.rejects(startTrial("u1", supa), (e: { message?: string }) => e.message === "update down");
});

test("startTrial — UPDATE 0행인데 기존 시작 시각 조회가 DB 에러면 던진다", async () => {
  const { supa } = fakeSupa({
    "users.update": ok([]),
    "users.select.single": fail("read down"),
  });
  await assert.rejects(startTrial("u1", supa), (e: { message?: string }) => e.message === "read down");
});
