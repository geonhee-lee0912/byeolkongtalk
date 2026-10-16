import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, type SignInDeps } from "./sign-in.ts";
import { identityHash, type AuthProvider } from "./identity-hash.ts";

type UserRow = { id: string; kakao_id: number | null; nickname: string; profile_img: string | null; logins: number };
type IdentityRow = {
  user_id: string;
  provider: AuthProvider;
  provider_user_id: string;
  apple_client_id: string | null;
  apple_refresh_token_enc: string | null;
};

function memory() {
  const s = {
    users: [] as UserRow[],
    identities: [] as IdentityRow[],
    newUserCalls: [] as { userId: string; hash: string }[],
    deleted: [] as string[],
    beforeUserInsert: null as null | (() => void),
    beforeIdentityInsert: null as null | (() => void),
    failUserInsert: false,
  };
  let seq = 0;
  const deps: SignInDeps = {
    async findIdentityUserId(p, id) {
      return s.identities.find((i) => i.provider === p && i.provider_user_id === id)?.user_id ?? null;
    },
    async findLegacyKakaoUserId(id) {
      return s.users.find((u) => u.kakao_id === Number(id))?.id ?? null;
    },
    async insertIdentity(row) {
      s.beforeIdentityInsert?.();
      s.beforeIdentityInsert = null;
      if (s.identities.some((i) => i.provider === row.provider && i.provider_user_id === row.provider_user_id)) {
        return { ok: false, duplicate: true };
      }
      s.identities.push({ ...row });
      return { ok: true };
    },
    async updateIdentityOnLogin(p, id, patch) {
      const i = s.identities.find((x) => x.provider === p && x.provider_user_id === id);
      if (i) Object.assign(i, patch);
    },
    async insertUser(row) {
      s.beforeUserInsert?.();
      s.beforeUserInsert = null;
      if (s.failUserInsert) return { ok: false, duplicate: false };
      if (row.kakao_id !== null && s.users.some((u) => u.kakao_id === row.kakao_id)) return { ok: false, duplicate: true };
      const id = `u${++seq}`;
      s.users.push({ id, ...row, logins: 0 });
      return { ok: true, id };
    },
    async deleteUser(id) {
      s.deleted.push(id);
      s.users = s.users.filter((u) => u.id !== id);
    },
    async updateUserOnLogin(id, patch) {
      const u = s.users.find((x) => x.id === id);
      if (u) {
        Object.assign(u, patch);
        u.logins++;
      }
    },
    async onNewUser(userId, hash) {
      s.newUserCalls.push({ userId, hash });
    },
  };
  return { s, deps };
}

const KAKAO = { provider: "kakao" as const, providerUserId: "4123456789", nickname: "별콩", profileImg: "https://k/p.jpg" };
const APPLE_SUB = "001234.abcd.0987";
const APP_CLIENT = "com.byeolkongtalk.app";

test("새 카카오 회원 — users(kakao_id 숫자)·로그인 수단을 만들고 신규 처리를 카카오 해시로 1번 부른다", async () => {
  const { s, deps } = memory();
  const r = await signIn(KAKAO, deps);
  assert.deepEqual(r, { ok: true, userId: "u1", isNewUser: true });
  assert.equal(s.users[0].kakao_id, 4123456789);
  assert.equal(s.users[0].profile_img, "https://k/p.jpg");
  assert.equal(s.identities[0].provider_user_id, "4123456789");
  assert.deepEqual(s.newUserCalls, [{ userId: "u1", hash: identityHash("kakao", "4123456789") }]);
});

test("다시 로그인 — 같은 회원, 닉네임·프로필 갱신, 신규 처리(웰컴 별) 없음", async () => {
  const { s, deps } = memory();
  await signIn(KAKAO, deps);
  const r = await signIn({ ...KAKAO, nickname: "별콩2", profileImg: null }, deps);
  assert.deepEqual(r, { ok: true, userId: "u1", isNewUser: false });
  assert.equal(s.users[0].nickname, "별콩2");
  assert.equal(s.users[0].profile_img, null);
  assert.equal(s.newUserCalls.length, 1);
});

test("옮겨 담기 전 카카오 회원(users.kakao_id 만 있음) — 로그인 수단을 채우고 신규 처리는 하지 않는다", async () => {
  const { s, deps } = memory();
  s.users.push({ id: "legacy", kakao_id: 4123456789, nickname: "옛", profile_img: null, logins: 0 });
  const r = await signIn(KAKAO, deps);
  assert.deepEqual(r, { ok: true, userId: "legacy", isNewUser: false });
  assert.equal(s.identities.length, 1);
  assert.equal(s.identities[0].user_id, "legacy");
  assert.equal(s.newUserCalls.length, 0);
});

test("새 애플 회원 — kakao_id·프로필 없이 만들고, 로그인 수단에 애플 토큰을 남기고, 애플 해시로 신규 처리", async () => {
  const { s, deps } = memory();
  const r = await signIn(
    { provider: "apple", providerUserId: APPLE_SUB, nickname: "김별콩", profileImg: "ignored", apple: { clientId: APP_CLIENT, refreshTokenEnc: "v1:enc" } },
    deps,
  );
  assert.deepEqual(r, { ok: true, userId: "u1", isNewUser: true });
  assert.equal(s.users[0].kakao_id, null);
  assert.equal(s.users[0].profile_img, null);
  assert.equal(s.identities[0].apple_client_id, APP_CLIENT);
  assert.equal(s.identities[0].apple_refresh_token_enc, "v1:enc");
  assert.deepEqual(s.newUserCalls, [{ userId: "u1", hash: identityHash("apple", APPLE_SUB) }]);
});

test("애플 재로그인 — 새 리프레시 토큰으로 갱신, 닉네임은 그대로", async () => {
  const { s, deps } = memory();
  await signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "김별콩", profileImg: null, apple: { clientId: APP_CLIENT, refreshTokenEnc: "v1:old" } }, deps);
  const r = await signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "별콩이_1234", profileImg: null, apple: { clientId: APP_CLIENT, refreshTokenEnc: "v1:new" } }, deps);
  assert.deepEqual(r, { ok: true, userId: "u1", isNewUser: false });
  assert.equal(s.identities[0].apple_refresh_token_enc, "v1:new");
  assert.equal(s.users[0].nickname, "김별콩");
});

test("애플 재로그인인데 토큰 교환이 실패(null) — 기존 토큰을 지우지 않는다", async () => {
  const { s, deps } = memory();
  await signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "김별콩", profileImg: null, apple: { clientId: APP_CLIENT, refreshTokenEnc: "v1:old" } }, deps);
  await signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "x", profileImg: null, apple: { clientId: APP_CLIENT, refreshTokenEnc: null } }, deps);
  assert.equal(s.identities[0].apple_refresh_token_enc, "v1:old");
});

test("애플 동시 가입 경합 — 로그인 수단이 먼저 생겼으면 방금 만든 회원을 지우고 이긴 쪽으로 로그인", async () => {
  const { s, deps } = memory();
  s.beforeIdentityInsert = () =>
    s.identities.push({ user_id: "winner", provider: "apple", provider_user_id: APPLE_SUB, apple_client_id: null, apple_refresh_token_enc: null });
  const r = await signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "김별콩", profileImg: null }, deps);
  assert.deepEqual(r, { ok: true, userId: "winner", isNewUser: false });
  assert.deepEqual(s.deleted, ["u1"]);
  assert.equal(s.newUserCalls.length, 0);
});

test("카카오 동시 가입 경합 — users.kakao_id 중복이면 이긴 회원으로 로그인", async () => {
  const { s, deps } = memory();
  s.beforeUserInsert = () => s.users.push({ id: "winner", kakao_id: 4123456789, nickname: "먼저", profile_img: null, logins: 0 });
  const r = await signIn(KAKAO, deps);
  assert.deepEqual(r, { ok: true, userId: "winner", isNewUser: false });
  assert.equal(s.newUserCalls.length, 0);
});

test("회원 생성 실패(중복 아님) — user_insert_failed", async () => {
  const { s, deps } = memory();
  s.failUserInsert = true;
  assert.deepEqual(await signIn(KAKAO, deps), { ok: false, reason: "user_insert_failed" });
});
