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
    beforeLegacyLookup: null as null | (() => void),
    failUserInsert: false,
    /** 로그인 수단 insert 가 중복 아닌 이유로 실패(일시 장애 등) */
    failIdentityInsert: false,
  };
  let seq = 0;
  const deps: SignInDeps = {
    async findIdentityUserId(p, id) {
      return s.identities.find((i) => i.provider === p && i.provider_user_id === id)?.user_id ?? null;
    },
    async findLegacyKakaoUserId(id) {
      s.beforeLegacyLookup?.();
      s.beforeLegacyLookup = null;
      // 실 구현은 .eq("kakao_id", Number(id)) — 숫자가 아니면 bigint 변환 오류(22P02)로 throw 한다
      if (!/^\d+$/.test(id)) throw new Error(`invalid input syntax for type bigint: "${id}"`);
      return s.users.find((u) => u.kakao_id === Number(id))?.id ?? null;
    },
    async insertIdentity(row) {
      s.beforeIdentityInsert?.();
      s.beforeIdentityInsert = null;
      if (s.failIdentityInsert) return { ok: false, duplicate: false };
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
      s.identities = s.identities.filter((i) => i.user_id !== id); // user_identities.user_id ON DELETE CASCADE
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
  assert.equal(s.users[0].nickname, "별콩"); // 기존 회원과 똑같이 닉네임·last_login 갱신
  assert.equal(s.users[0].logins, 1);
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
  assert.equal(s.users.length, 1); // 재로그인이 회원을 새로 만들었다 지우는 길로 새지 않는다
  assert.deepEqual(s.deleted, []);
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

test("카카오 동시 가입 — 다른 요청이 방금 만든 회원에 로그인 수단을 먼저 붙였으면(자가 치유) 지우지 않고 이쪽이 신규 처리", async () => {
  const { s, deps } = memory();
  // users 를 만든 직후, 같은 카카오 회원의 다른 요청이 그 회원을 '옮겨 담기 전 회원'으로 보고 로그인 수단을 먼저 붙였다
  s.beforeIdentityInsert = () =>
    s.identities.push({ user_id: "u1", provider: "kakao", provider_user_id: "4123456789", apple_client_id: null, apple_refresh_token_enc: null });
  const r = await signIn(KAKAO, deps);
  assert.deepEqual(r, { ok: true, userId: "u1", isNewUser: true });
  assert.deepEqual(s.deleted, []);
  assert.equal(s.identities.length, 1);
  assert.deepEqual(s.newUserCalls, [{ userId: "u1", hash: identityHash("kakao", "4123456789") }]);
});

test("옮겨 담기 전 카카오 회원 동시 로그인 — 로그인 수단이 그새 채워졌어도(중복) 그 회원으로 로그인", async () => {
  const { s, deps } = memory();
  s.users.push({ id: "legacy", kakao_id: 4123456789, nickname: "옛", profile_img: null, logins: 0 });
  s.beforeIdentityInsert = () =>
    s.identities.push({ user_id: "legacy", provider: "kakao", provider_user_id: "4123456789", apple_client_id: null, apple_refresh_token_enc: null });
  assert.deepEqual(await signIn(KAKAO, deps), { ok: true, userId: "legacy", isNewUser: false });
  assert.equal(s.identities.length, 1);
  assert.equal(s.newUserCalls.length, 0);
});

test("옮겨 담기 전 카카오 회원인데 로그인 수단 채우기가 실패(중복 아님) — identity_insert_failed, 옛 회원은 그대로", async () => {
  const { s, deps } = memory();
  s.users.push({ id: "legacy", kakao_id: 4123456789, nickname: "옛", profile_img: null, logins: 0 });
  s.failIdentityInsert = true;
  assert.deepEqual(await signIn(KAKAO, deps), { ok: false, reason: "identity_insert_failed" });
  assert.deepEqual(s.deleted, []);
  assert.equal(s.users[0].logins, 0);
  assert.equal(s.newUserCalls.length, 0);
});

test("새 회원인데 로그인 수단 저장이 실패(중복 아님) — 방금 만든 회원을 지우고 identity_insert_failed, 신규 처리 없음", async () => {
  const { s, deps } = memory();
  s.failIdentityInsert = true;
  assert.deepEqual(await signIn(KAKAO, deps), { ok: false, reason: "identity_insert_failed" });
  assert.deepEqual(s.deleted, ["u1"]);
  assert.equal(s.users.length, 0);
  assert.equal(s.newUserCalls.length, 0);
});

test("카카오 users 중복인데 이긴 회원을 그새 못 찾음 — user_insert_failed", async () => {
  const { s, deps } = memory();
  s.beforeUserInsert = () => {
    s.users.push({ id: "gone", kakao_id: 4123456789, nickname: "먼저", profile_img: null, logins: 0 });
    s.beforeLegacyLookup = () => {
      s.users = s.users.filter((u) => u.id !== "gone"); // 그 사이 탈퇴
    };
  };
  assert.deepEqual(await signIn(KAKAO, deps), { ok: false, reason: "user_insert_failed" });
  assert.equal(s.newUserCalls.length, 0);
});

test("애플 — 웹(Services ID)으로 가입 후 앱(번들 ID)으로 재로그인하면 client_id·토큰을 짝으로 바꾸고, 교환 실패(null)면 짝을 그대로 둔다", async () => {
  const { s, deps } = memory();
  const WEB_CLIENT = "com.byeolkongtalk.web";
  const apple = (clientId: string, refreshTokenEnc: string | null) =>
    signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "x", profileImg: null, apple: { clientId, refreshTokenEnc } }, deps);
  await apple(WEB_CLIENT, "v1:web");
  await apple(APP_CLIENT, "v1:app");
  assert.equal(s.identities[0].apple_client_id, APP_CLIENT); // revoke 는 토큰을 발급한 client_id 로 해야 한다
  assert.equal(s.identities[0].apple_refresh_token_enc, "v1:app");
  await apple(WEB_CLIENT, null);
  assert.equal(s.identities[0].apple_client_id, APP_CLIENT);
  assert.equal(s.identities[0].apple_refresh_token_enc, "v1:app");
});

test("회원번호가 이상하면 DB 를 건드리기 전에 throw — 카카오 웹 콜백이 /v2/user/me 실패 응답을 받으면 'undefined' 가 온다", async () => {
  // 어떤 deps 도 불리면 안 된다 — deps 의 부수 효과(실 DB 의 bigint 변환 오류)에 기대지 않는다
  const untouchable = new Proxy({} as SignInDeps, {
    get: (_t, name) => async () => {
      throw new Error(`DB 를 건드렸다: ${String(name)}`);
    },
  });
  for (const providerUserId of ["undefined", "", "0", "-1", "12.5", "99999999999999999999"]) {
    await assert.rejects(signIn({ ...KAKAO, providerUserId }, untouchable), /invalid kakao providerUserId/, providerUserId);
  }
  await assert.rejects(signIn({ provider: "apple", providerUserId: "", nickname: "x", profileImg: null }, untouchable), /invalid apple providerUserId/);
});

test("애플 동시 가입에서 진 요청 — 이긴 쪽이 토큰 교환에 실패(null)했어도 진 쪽 토큰을 남긴다(탈퇴 revoke 용)", async () => {
  const { s, deps } = memory();
  // 같은 인가 코드 이중 전송: 먼저 로그인 수단을 만든 요청은 교환에 실패해 토큰이 없다
  s.beforeIdentityInsert = () =>
    s.identities.push({ user_id: "winner", provider: "apple", provider_user_id: APPLE_SUB, apple_client_id: APP_CLIENT, apple_refresh_token_enc: null });
  const r = await signIn({ provider: "apple", providerUserId: APPLE_SUB, nickname: "김별콩", profileImg: null, apple: { clientId: APP_CLIENT, refreshTokenEnc: "v1:mine" } }, deps);
  assert.deepEqual(r, { ok: true, userId: "winner", isNewUser: false });
  assert.equal(s.identities.length, 1);
  assert.equal(s.identities[0].apple_refresh_token_enc, "v1:mine");
});
