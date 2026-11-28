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
      return r ? { family_id: r.family_id, user_id: r.user_id, platform: r.platform, rotated_at: r.rotated_at, revoked_at: r.revoked_at, expires_at: r.expires_at } : null;
    },
    async hasRotationAfter(fid, rotatedAtIso) {
      return refresh.some((x) => x.family_id === fid && x.rotated_at !== null && Date.parse(x.rotated_at) > Date.parse(rotatedAtIso));
    },
    async listLiveRefresh(fid) {
      return refresh
        .filter((x) => x.family_id === fid && !x.rotated_at && !x.revoked_at)
        .map((x) => ({ token_hash: x.token_hash, user_id: x.user_id, platform: x.platform, expires_at: x.expires_at }));
    },
    async revokeUnusedRefresh(h, nowIso) {
      const r = refresh.find((x) => x.token_hash === h && !x.rotated_at && !x.revoked_at);
      if (!r) return false;
      r.revoked_at = nowIso;
      return true;
    },
    async unrevokeRefresh(h, revokedAtIso) {
      const r = refresh.find((x) => x.token_hash === h && x.revoked_at === revokedAtIso);
      if (r) r.revoked_at = null;
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

test("재사용 — 새 토큰이 이미 쓰였는데 교체된 옛 토큰이 10초 뒤 다시 오면 묶음 전체를 폐기한다(최신 토큰도 못 씀)", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  const r2 = await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 5000 });
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  const reuse = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 20_000 });
  assert.deepEqual(reuse, { ok: false, reason: "reused" });
  const afterRevoke = await rotateRefreshToken(store, r2.tokens.refreshToken, { now: T0 + 21_000 });
  assert.deepEqual(afterRevoke, { ok: false, reason: "invalid" });
});

// 앱이 교체 요청을 보낸 뒤 응답을 받기 전에 꺼지면, 서버엔 새 토큰이 생겼는데 기기엔 옛 토큰만 남는다(dev 11-25 실사례).
// 새 토큰이 한 번도 안 쓰였으면 탈취가 아니라 응답 유실로 보고, 안 쓰인 새 토큰만 폐기하고 다시 발급한다(운영자 11-28 B안)
test("응답 유실 — 새 토큰이 안 쓰인 채 옛 토큰이 10초 뒤 다시 오면, 안 쓰인 새 토큰만 폐기하고 같은 묶음으로 다시 발급한다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "android", { now: T0 });
  const lost = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(lost.ok, true);
  if (!lost.ok) return;
  const again = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 8 * 24 * 60 * 60 * 1000 });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.recovered, true);
  assert.equal(again.userId, USER);
  assert.equal(await verifyAccessToken(again.tokens.accessToken, { nowSec: (T0 + 8 * 24 * 60 * 60 * 1000) / 1000 + 10 }), USER);
  assert.deepEqual(Object.keys(again.tokens).sort(), ["accessExpiresAt", "accessExpiresIn", "accessToken", "refreshToken"]);
  // 받지 못한 새 토큰은 폐기, 새로 준 토큰은 같은 묶음·같은 기기 종류, 묶음은 살아 있다
  const lostRow = refresh.find((r) => r.token_hash === hashSecretToken(lost.tokens.refreshToken))!;
  assert.ok(lostRow.revoked_at);
  const fresh = refresh.find((r) => r.token_hash === hashSecretToken(again.tokens.refreshToken))!;
  assert.equal(fresh.family_id, refresh[0].family_id);
  assert.equal(fresh.platform, "android");
  assert.equal(fresh.revoked_at, null);
  assert.deepEqual(await rotateRefreshToken(store, lost.tokens.refreshToken, { now: T0 + 8 * 24 * 60 * 60 * 1000 + 1000 }), { ok: false, reason: "invalid" });
  const next = await rotateRefreshToken(store, again.tokens.refreshToken, { now: T0 + 8 * 24 * 60 * 60 * 1000 + 2000 });
  assert.equal(next.ok && next.recovered, false);
});

test("응답 유실이 거듭되면 거듭 복구한다 — 복구로 준 토큰도 안 쓰였으면 옛 토큰으로 또 받는다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const a = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 60_000 });
  assert.equal(a.ok && a.recovered, true);
  const b = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 120_000 });
  assert.equal(b.ok && b.recovered, true);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(await rotateRefreshToken(store, a.tokens.refreshToken, { now: T0 + 121_000 }), { ok: false, reason: "invalid" });
  assert.equal((await rotateRefreshToken(store, b.tokens.refreshToken, { now: T0 + 122_000 })).ok, true);
});

test("복구로 받은 토큰을 쓴 뒤에 옛 토큰이 오면 재사용 — 묶음 전체 폐기", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const rec = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 60_000 });
  assert.equal(rec.ok, true);
  if (!rec.ok) return;
  const used = await rotateRefreshToken(store, rec.tokens.refreshToken, { now: T0 + 61_000 });
  assert.equal(used.ok, true);
  if (!used.ok) return;
  assert.deepEqual(await rotateRefreshToken(store, t.refreshToken, { now: T0 + 120_000 }), { ok: false, reason: "reused" });
  assert.deepEqual(await rotateRefreshToken(store, used.tokens.refreshToken, { now: T0 + 121_000 }), { ok: false, reason: "invalid" });
});

test("응답 유실이어도 옛 토큰이 만료됐으면 invalid — 다시 발급하지 않고 묶음도 폐기하지 않는다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const late = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 91 * 24 * 60 * 60 * 1000 });
  assert.deepEqual(late, { ok: false, reason: "invalid" });
  assert.equal(refresh.length, 2);
  assert.equal(refresh.filter((r) => r.revoked_at).length, 0);
});

test("복구 경합 — 묶음을 읽은 뒤 폐기 직전에 새 토큰이 쓰이면(조건부 폐기 0행) 재사용으로 본다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  const racing: AppSessionStore = {
    ...store,
    async listLiveRefresh(fid) {
      const rows = await store.listLiveRefresh(fid);
      // 읽은 직후 정상 기기가 새 토큰을 쓴다
      await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 59_000 });
      return rows;
    },
  };
  assert.deepEqual(await rotateRefreshToken(racing, t.refreshToken, { now: T0 + 60_000 }), { ok: false, reason: "reused" });
  assert.equal(refresh.filter((r) => !r.revoked_at).length, 0);
});

test("겹친 복구 — 같은 옛 토큰 요청 둘이 겹쳐 하나가 먼저 복구하면, 진 쪽은 retry 만(앱이 토큰을 지키고 다시 시도, 묶음 폐기 없음) — 이긴 쪽 토큰이 이어진다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  let winner: Awaited<ReturnType<typeof rotateRefreshToken>> | null = null;
  const racing: AppSessionStore = {
    ...store,
    async listLiveRefresh(fid) {
      const rows = await store.listLiveRefresh(fid);
      // 읽은 직후 같은 옛 토큰의 다른 요청이 먼저 복구한다
      winner = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 60_000 });
      return rows;
    },
  };
  assert.deepEqual(await rotateRefreshToken(racing, t.refreshToken, { now: T0 + 60_000 }), { ok: false, reason: "retry" });
  const w = winner as Awaited<ReturnType<typeof rotateRefreshToken>> | null;
  assert.equal(w?.ok && w.recovered, true);
  if (!w?.ok) return;
  assert.equal((await rotateRefreshToken(store, w.tokens.refreshToken, { now: T0 + 61_000 })).ok, true);
  assert.ok(refresh.some((r) => !r.revoked_at));
});

test("살아 있는 토큰이 0개로 보이면(앞 복구가 폐기만 하고 발급 전 등) — 묶음을 폐기하지 않고 새로 발급한다(영구히 retry 에 갇히지 않게)", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const midway: AppSessionStore = { ...store, listLiveRefresh: async () => [] };
  const r = await rotateRefreshToken(midway, t.refreshToken, { now: T0 + 60_000 });
  assert.equal(r.ok && r.recovered, true);
  if (!r.ok) return;
  assert.equal(refresh.filter((x) => x.revoked_at).length, 0);
  assert.equal((await rotateRefreshToken(store, r.tokens.refreshToken, { now: T0 + 61_000 })).ok, true);
});

test("폐기는 반영됐는데 응답이 끊겨 오류로 끝나면 — 그 토큰도 되살린다, 다음 시도는 복구", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const flaky: AppSessionStore = {
    ...store,
    revokeUnusedRefresh: async (h, iso) => {
      await store.revokeUnusedRefresh(h, iso);
      throw new Error("connection reset");
    },
  };
  await assert.rejects(rotateRefreshToken(flaky, t.refreshToken, { now: T0 + 60_000 }), /connection reset/);
  assert.equal(refresh.filter((x) => x.revoked_at).length, 0);
  const retry = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 86_400_000 });
  assert.equal(retry.ok && retry.recovered, true);
});

test("겹친 복구 — 앞 복구가 발급까지 끝낸 뒤 10초 안에 같은 옛 토큰이 또 오면(복구 응답도 못 받고 다시 켬) retry 만 — 앱은 옛 토큰을 지키고, 앞 복구가 준 토큰을 폐기하지 않는다", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const first = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 60_000 });
  assert.equal(first.ok && first.recovered, true);
  if (!first.ok) return;
  assert.deepEqual(await rotateRefreshToken(store, t.refreshToken, { now: T0 + 65_000 }), { ok: false, reason: "retry" });
  assert.equal((await rotateRefreshToken(store, first.tokens.refreshToken, { now: T0 + 66_000 })).ok, true);
});

test("복구 경합 — 첫 확인 뒤 정상 기기가 새 토큰을 써 또 교체하면(옛 토큰 → B 사용 → C), 옛 토큰으로 C 를 빼앗지 못하고 재사용으로 본다", async () => {
  const { store, refresh } = memoryStore();
  const a = await issueAppTokens(store, USER, "ios", { now: T0 });
  const b = await rotateRefreshToken(store, a.refreshToken, { now: T0 + 1000 });
  assert.equal(b.ok, true);
  if (!b.ok) return;
  let c: Awaited<ReturnType<typeof rotateRefreshToken>> | null = null;
  let calls = 0;
  const racing: AppSessionStore = {
    ...store,
    async hasRotationAfter(fid, iso) {
      const r = await store.hasRotationAfter(fid, iso);
      // 첫 확인이 '안 쓰였다'를 본 직후 정상 기기가 B 를 C 로 교체한다(C 의 발급 시각은 10초 유예 밖으로 — 폐기 뒤 두 번째 확인이 잡아야 한다)
      if (calls++ === 0) c = await rotateRefreshToken(store, b.tokens.refreshToken, { now: T0 + 40_000 });
      return r;
    },
  };
  assert.deepEqual(await rotateRefreshToken(racing, a.refreshToken, { now: T0 + 60_000 }), { ok: false, reason: "reused" });
  const cr = c as Awaited<ReturnType<typeof rotateRefreshToken>> | null;
  assert.equal(cr?.ok, true);
  assert.equal(refresh.filter((r) => !r.revoked_at).length, 0);
});

test("폐기 뒤 재확인 조회가 실패해도(DB 순간 오류) 폐기한 새 토큰을 되살린다 — 다시 시도하면 복구된다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  let calls = 0;
  const flaky: AppSessionStore = {
    ...store,
    async hasRotationAfter(fid, iso) {
      if (calls++ === 1) throw new Error("db blip");
      return store.hasRotationAfter(fid, iso);
    },
  };
  await assert.rejects(rotateRefreshToken(flaky, t.refreshToken, { now: T0 + 60_000 }), /db blip/);
  assert.equal(refresh.filter((r) => r.revoked_at).length, 0);
  const retry = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 120_000 });
  assert.equal(retry.ok && retry.recovered, true);
});

test("복구 도중 로그아웃이 끝났으면 — 발급이 실패해도 폐기한 토큰을 되살리지 않는다(로그아웃이 그대로)", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const lost = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(lost.ok, true);
  if (!lost.ok) return;
  const racing: AppSessionStore = {
    ...store,
    insertRefresh: async () => {
      // 폐기 직후 같은 기기 묶음의 로그아웃이 끝나고, 새 토큰 저장은 실패한다
      await revokeByRefreshToken(store, t.refreshToken, { now: T0 + 59_000 });
      throw new Error("db blip");
    },
  };
  await assert.rejects(rotateRefreshToken(racing, t.refreshToken, { now: T0 + 60_000 }), /db blip/);
  assert.equal(refresh.filter((r) => !r.revoked_at).length, 0);
  assert.deepEqual(await rotateRefreshToken(store, lost.tokens.refreshToken, { now: T0 + 61_000 }), { ok: false, reason: "invalid" });
});

test("복구 도중 로그아웃이 끝났으면 — 발급이 성공해도 그 토큰은 못 쓰고 invalid", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const racing: AppSessionStore = {
    ...store,
    insertRefresh: async (row) => {
      await revokeByRefreshToken(store, t.refreshToken, { now: T0 + 59_000 });
      await store.insertRefresh(row);
    },
  };
  assert.deepEqual(await rotateRefreshToken(racing, t.refreshToken, { now: T0 + 60_000 }), { ok: false, reason: "invalid" });
  assert.equal(refresh.filter((r) => !r.revoked_at).length, 0);
});

test("복구 저장이 실제로는 됐는데 오류로 끝나면(응답 끊김) — 다시 시도는 재사용이 아니라 복구, 안 쓰인 토큰이 여럿이어도 전부 폐기하고 하나만 준다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const committedThenFailed: AppSessionStore = {
    ...store,
    insertRefresh: async (row) => {
      await store.insertRefresh(row);
      throw new Error("connection reset");
    },
  };
  await assert.rejects(rotateRefreshToken(committedThenFailed, t.refreshToken, { now: T0 + 60_000 }), /connection reset/);
  assert.equal(refresh.filter((r) => !r.rotated_at && !r.revoked_at).length, 2);
  const retry = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 120_000 });
  assert.equal(retry.ok && retry.recovered, true);
  if (!retry.ok) return;
  const live = refresh.filter((r) => !r.rotated_at && !r.revoked_at);
  assert.deepEqual(live.map((r) => r.token_hash), [hashSecretToken(retry.tokens.refreshToken)]);
});

test("복구 중 새 토큰 발급이 실패하면 폐기한 새 토큰을 되살린다 — 다시 시도하면 복구된다", async () => {
  const { store, refresh } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  const flaky: AppSessionStore = {
    ...store,
    insertRefresh: async () => {
      throw new Error("db blip");
    },
  };
  await assert.rejects(rotateRefreshToken(flaky, t.refreshToken, { now: T0 + 60_000 }), /db blip/);
  assert.equal(refresh.filter((r) => r.revoked_at).length, 0);
  const retry = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 120_000 });
  assert.equal(retry.ok && retry.recovered, true);
});

test("재사용 유예 — 교체 직후(10초 안) 같은 토큰이 또 오면 retry 로 거절만 하고 묶음은 살린다(이중 전송·갱신 중 꺼졌다 바로 다시 켬 — 앱은 토큰을 지킨다)", async () => {
  const { store } = memoryStore();
  const t = await issueAppTokens(store, USER, "ios", { now: T0 });
  const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
  const dup = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 3000 });
  assert.deepEqual(dup, { ok: false, reason: "retry" });
  if (!r1.ok) return;
  const next = await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 4000 });
  assert.equal(next.ok, true);
});

test("재사용 경계 — 새 토큰이 쓰인 뒤라도 교체 뒤 정확히 10초까지는 유예(retry, 묶음 유지), 10.001초부터 재사용(묶음 폐기)", async () => {
  for (const [dt, reason, latestOk] of [[10_000, "retry", true], [10_001, "reused", false]] as const) {
    const { store } = memoryStore();
    const t = await issueAppTokens(store, USER, "ios", { now: T0 });
    const r1 = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    const r2 = await rotateRefreshToken(store, r1.tokens.refreshToken, { now: T0 + 1500 });
    assert.equal(r2.ok, true);
    if (!r2.ok) return;
    assert.deepEqual(await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 + dt }), { ok: false, reason }, `+${dt}ms`);
    assert.equal((await rotateRefreshToken(store, r2.tokens.refreshToken, { now: T0 + 1000 + dt + 1 })).ok, latestOk, `+${dt}ms 최신 토큰`);
  }
});

test("응답 유실 경계 — 새 토큰이 안 쓰였으면 10초까지는 retry 로 거절만(이중 전송), 10.001초부터 복구", async () => {
  for (const [dt, recovered] of [[10_000, false], [10_001, true]] as const) {
    const { store } = memoryStore();
    const t = await issueAppTokens(store, USER, "ios", { now: T0 });
    await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 });
    const r = await rotateRefreshToken(store, t.refreshToken, { now: T0 + 1000 + dt });
    if (recovered) assert.equal(r.ok && r.recovered, true, `+${dt}ms`);
    else assert.deepEqual(r, { ok: false, reason: "retry" }, `+${dt}ms`);
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
  const p1 = await rotateRefreshToken(store, phone.refreshToken, { now: T0 + 1000 });
  assert.equal(p1.ok, true);
  if (!p1.ok) return;
  await rotateRefreshToken(store, p1.tokens.refreshToken, { now: T0 + 2000 });
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
  assert.deepEqual([a, b].find((r) => !r.ok), { ok: false, reason: "retry" });
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
