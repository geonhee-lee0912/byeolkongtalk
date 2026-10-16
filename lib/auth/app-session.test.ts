import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consumeHandoffCode,
  createHandoffCode,
  issueAppTokens,
  revokeByRefreshToken,
  rotateRefreshToken,
  type AppSessionStore,
  type Platform,
} from "./app-session.ts";
import { verifyAccessToken } from "./app-token.ts";
import { hashSecretToken } from "./secret-token.ts";

process.env.APP_ACCESS_TOKEN_SECRET = "s".repeat(40);
const USER = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";

type RefreshRow = {
  user_id: string;
  family_id: string;
  token_hash: string;
  platform: Platform | null;
  expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
};
type HandoffRow = { code_hash: string; user_id: string; is_new_user: boolean; expires_at: string; used_at: string | null };

// 조건부 UPDATE 를 흉내 낸 메모리 저장소 — 실 저장소(app-session-store.ts)와 같은 계약(원자적 claim)
function memoryStore() {
  const refresh: RefreshRow[] = [];
  const handoff: HandoffRow[] = [];
  const store: AppSessionStore = {
    async insertRefresh(row) {
      refresh.push({ ...row, rotated_at: null, revoked_at: null });
    },
    async claimRefresh(h, nowIso) {
      const r = refresh.find((x) => x.token_hash === h && !x.rotated_at && !x.revoked_at && x.expires_at > nowIso);
      if (!r) return null;
      r.rotated_at = nowIso;
      return { user_id: r.user_id, family_id: r.family_id, platform: r.platform };
    },
    async releaseRefresh(h, rotatedAtIso) {
      const r = refresh.find((x) => x.token_hash === h && x.rotated_at === rotatedAtIso);
      if (r) r.rotated_at = null;
    },
    async findRefresh(h) {
      const r = refresh.find((x) => x.token_hash === h);
      return r ? { family_id: r.family_id, rotated_at: r.rotated_at, revoked_at: r.revoked_at } : null;
    },
    async revokeFamily(fid, nowIso) {
      for (const r of refresh) if (r.family_id === fid && !r.revoked_at) r.revoked_at = nowIso;
    },
    async insertHandoff(row) {
      handoff.push({ ...row, used_at: null });
    },
    async claimHandoff(h, nowIso) {
      const c = handoff.find((x) => x.code_hash === h && !x.used_at && x.expires_at > nowIso);
      if (!c) return null;
      c.used_at = nowIso;
      return { user_id: c.user_id, is_new_user: c.is_new_user };
    },
  };
  return { store, refresh, handoff };
}

const T0 = Date.parse("2026-10-12T00:00:00Z");

test("발급 — 액세스는 그 회원으로 검증되고, DB 엔 리프레시 원본이 아니라 해시가 90일 만료로 남는다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  assert.equal(await verifyAccessToken(t.accessToken, { nowSec: T0 / 1000 + 10 }), USER);
  assert.equal(refresh.length, 1);
  assert.equal(refresh[0].token_hash, hashSecretToken(t.refreshToken));
  assert.notEqual(refresh[0].token_hash, t.refreshToken);
  assert.equal(refresh[0].expires_at, new Date(T0 + 90 * 24 * 60 * 60 * 1000).toISOString());
  assert.equal(refresh[0].platform, "ios");
  assert.equal(t.accessExpiresIn, 3600);
});

test("교체 — 새 토큰은 같은 묶음, 옛 토큰은 교체 표시", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "android", { now: T0 });
  const r = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.userId, USER);
  assert.notEqual(r.tokens.refreshToken, t.refreshToken);
  assert.equal(refresh.length, 2);
  assert.equal(refresh[1].family_id, refresh[0].family_id);
  assert.equal(refresh[1].platform, "android");
  assert.ok(refresh[0].rotated_at);
  // 갱신 라우트(app/api/auth/app/refresh)는 r.tokens 를 그대로 응답한다 — 묶음 ID 같은 내부 값이 섞이지 않게 4칸만
  assert.deepEqual(Object.keys(r.tokens).sort(), ["accessExpiresAt", "accessExpiresIn", "accessToken", "refreshToken"]);
});

test("재사용 — 교체된 옛 토큰이 10초 뒤 다시 오면 묶음 전체를 폐기한다(새 토큰도 못 씀)", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r1.ok, true);
  const reuse = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 20_000 });
  assert.deepEqual(reuse, { ok: false, reason: "reused" });
  if (!r1.ok) return;
  const afterRevoke = await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 21_000 });
  assert.deepEqual(afterRevoke, { ok: false, reason: "invalid" });
});

test("재사용 유예 — 교체 직후(10초 안) 같은 토큰이 또 오면 거절만 하고 묶음은 살린다(이중 전송)", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const dup = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 3000 });
  assert.deepEqual(dup, { ok: false, reason: "invalid" });
  if (!r1.ok) return;
  const next = await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 4000 });
  assert.equal(next.ok, true);
});

test("재사용 경계 — 교체 뒤 정확히 10초까지는 유예(묶음 유지), 10.001초부터 재사용(묶음 폐기)", async () => {
  for (const [dt, reason, latestOk] of [[10_000, "invalid", true], [10_001, "reused", false]] as const) {
    const { store } = memoryStore();
    const t = await issueAppTokens(store, USER, "ios", { now: T0 });
    const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    assert.deepEqual(await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 + dt }), { ok: false, reason }, `+${dt}ms`);
    assert.equal((await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 1000 + dt + 1 })).ok, latestOk, `+${dt}ms 최신 토큰`);
  }
});

test("이미 폐기된 묶음의 옛 토큰은 invalid — 재사용으로 또 세지 않는다(로그아웃 뒤 가짜 경고 방지)", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  await revokeByRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 2000 });
  assert.deepEqual(await rotateRefreshToken(store, t.refreshToken, { now: T0 + 60_000 }), { ok: false, reason: "invalid" });
});

test("기기마다 묶음이 따로 — 한 기기의 재사용 폐기가 같은 회원의 다른 기기를 로그아웃시키지 않는다", async () => {
  const { store } = memoryStore();
  const phone = await issueAppTokens(store, USER, "ios", { now: T0 });
  const tablet = await issueAppTokens(store, USER, "android", { now: T0 });
  assert.notEqual(phone.familyId, tablet.familyId);
  await rotateRefreshToken(store, phone.refreshToken, { now: T0 + 1000 });
  assert.deepEqual(await rotateRefreshToken(store, phone.refreshToken, { now: T0 + 60_000 }), { ok: false, reason: "reused" });
  assert.equal((await rotateRefreshToken(store, tablet.refreshToken, { now: T0 + 61_000 })).ok, true);
});

test("동시 갱신 — 같은 토큰으로 두 요청이 겹치면 하나만 성공한다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const [a, b] = await Promise.all([
    rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 }),
    rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 }),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  // 진 쪽은 유예 안이라 거절만 — 묶음은 살아 있어 이긴 쪽 토큰이 계속 돈다
  assert.deepEqual([a, b].find((r) => !r.ok), { ok: false, reason: "invalid" });
  const winner = [a, b].find((r) => r.ok);
  if (!winner?.ok) return;
  assert.equal((await rotateRefreshToken(store, winner.tokens.refreshToken, { now: T0 + 2000 })).ok, true);
});

test("만료되거나 모르는 리프레시 토큰은 invalid(폐기 없음)", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const expired = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 91 * 24 * 60 * 60 * 1000 });
  assert.deepEqual(expired, { ok: false, reason: "invalid" });
  assert.equal(refresh[0].revoked_at, null);
  assert.deepEqual(await rotateRefreshToken(store, "nope", { now: T0 }), { ok: false, reason: "invalid" });
});

test("교체 중 새 토큰 발급이 실패하면(DB 순간 오류) 옛 토큰을 되살린다 — 다시 시도하면 교체되고 경고·폐기 없음", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const flaky: AppSessionStore = {
    ...store,
    insertRefresh: async () => {
      throw new Error("db blip");
    },
  };
  await assert.rejects(rotateRefreshToken(flaky, t.refreshToken, { now: T0 + 1000 }), /db blip/);
  assert.equal(refresh[0].rotated_at, null);
  const retry = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 30_000 });
  assert.equal(retry.ok, true);
  assert.equal(refresh.filter((r) => r.revoked_at).length, 0);
});

test("서명 비밀값이 잘못된 동안의 갱신도 옛 토큰을 태우지 않는다 — 비밀값을 고치면 그대로 이어진다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const good = process.env.APP_ACCESS_TOKEN_SECRET;
  process.env.APP_ACCESS_TOKEN_SECRET = "short";
  try {
    await assert.rejects(rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 }), /APP_ACCESS_TOKEN_SECRET/);
  } finally {
    process.env.APP_ACCESS_TOKEN_SECRET = good;
  }
  assert.equal((await rotateRefreshToken(store, t.refreshToken, { now: T0 + 600_000 })).ok, true);
});

test("되살리기마저 실패하면 원래 오류를 그대로 올린다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const broken: AppSessionStore = {
    ...store,
    insertRefresh: async () => {
      throw new Error("insert failed");
    },
    releaseRefresh: async () => {
      throw new Error("release failed");
    },
  };
  await assert.rejects(rotateRefreshToken(broken, t.refreshToken, { now: T0 + 1000 }), /insert failed/);
});

test("로그아웃 — 그 묶음을 폐기하면 다시 못 쓴다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await revokeByRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.deepEqual(await rotateRefreshToken(store, t.refreshToken, { now: T0 + 2000 }), { ok: false, reason: "invalid" });
});

test("로그아웃은 묶음 전체 — 옛(교체된) 토큰으로 해도 최신 토큰까지 막힌다, 모르는 토큰은 조용히 지나간다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  await revokeByRefreshToken(store, t.refreshToken, { now: T0 + 2000 });
  assert.deepEqual(await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 3000 }), { ok: false, reason: "invalid" });
  await revokeByRefreshToken(store, "nope", { now: T0 + 4000 });
});

test("교환 코드 — 한 번만, 60초 안에만, 이상한 값은 거절", async () => {
  const { store } = memoryStore();
  const code = await createHandoffCode(store, USER, true, { now: T0 });
  assert.deepEqual(await consumeHandoffCode(store, code, { now: T0 + 1000 }), { userId: USER, isNewUser: true });
  assert.equal(await consumeHandoffCode(store, code, { now: T0 + 2000 }), null);
  const late = await createHandoffCode(store, USER, false, { now: T0 });
  assert.equal(await consumeHandoffCode(store, late, { now: T0 + 61_000 }), null);
  assert.equal(await consumeHandoffCode(store, "", { now: T0 }), null);
  assert.equal(await consumeHandoffCode(store, "x".repeat(101), { now: T0 }), null);
});

test("교환 코드 — 빈 값·100자 넘는 값은 저장소에 묻지도 않는다", async () => {
  const { store } = memoryStore();
  let asked = 0;
  const spy: AppSessionStore = {
    ...store,
    claimHandoff: async (h, n) => {
      asked++;
      return store.claimHandoff(h, n);
    },
  };
  assert.equal(await consumeHandoffCode(spy, "", { now: T0 }), null);
  assert.equal(await consumeHandoffCode(spy, "x".repeat(101), { now: T0 }), null);
  assert.equal(asked, 0);
});
