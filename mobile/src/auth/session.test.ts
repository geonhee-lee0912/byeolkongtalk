import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthSession, type AuthApi, type Tokens, type TokenStore } from "./session.ts";

class AuthErr extends Error {}
const T0 = 1_000_000;

function setup(initialRefresh: string | null = "r0") {
  let stored = initialRefresh;
  let seq = 0;
  let clock = T0;
  const calls = { refresh: [] as string[], handoff: [] as string[], logout: [] as string[], login: 0 };
  const behavior = {
    refresh: "ok" as "ok" | "auth" | "network",
    handoff: "ok" as "ok" | "network",
    logout: "ok" as "ok" | "network",
    store: "ok" as "ok" | "read" | "clear", // 보안 저장소(키체인)가 읽기·지우기에서 실패
  };
  const tokens = (): Tokens => {
    seq++;
    return { accessToken: `a${seq}`, accessExpiresAt: clock + 3_600_000, refreshToken: `r${seq}` };
  };
  const store: TokenStore = {
    getRefresh: async () => {
      if (behavior.store === "read") throw new Error("keychain read");
      return stored;
    },
    setRefresh: async (t) => {
      stored = t;
    },
    clear: async () => {
      if (behavior.store === "clear") throw new Error("keychain delete");
      stored = null;
    },
  };
  const api: AuthApi = {
    async login() {
      calls.login++;
      return { ...tokens(), handoffCode: "h-login", isNewUser: true };
    },
    async refresh(rt) {
      calls.refresh.push(rt);
      await new Promise((r) => setTimeout(r, 5)); // 겹치는 호출이 생기게
      if (behavior.refresh === "auth") throw new AuthErr();
      if (behavior.refresh === "network") throw new Error("network");
      return tokens();
    },
    async handoffCode(at) {
      calls.handoff.push(at);
      if (behavior.handoff === "network") throw new Error("network");
      return "h1";
    },
    async logout(rt) {
      calls.logout.push(rt);
      if (behavior.logout === "network") throw new Error("network");
    },
  };
  const session = createAuthSession({ store, api, isAuthError: (e) => e instanceof AuthErr, now: () => clock });
  return {
    session,
    calls,
    behavior,
    stored: () => stored,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

test("동시에 토큰을 찾아도 갱신은 한 번만 한다(같은 리프레시 토큰을 두 번 보내지 않는다)", async () => {
  const { session, calls } = setup();
  const [a, b] = await Promise.all([session.ensureAccessToken(), session.ensureAccessToken()]);
  assert.equal(calls.refresh.length, 1);
  assert.equal(a, "a1");
  assert.equal(b, "a1");
});

test("앱 실행 — 갱신하고 교환 코드로 연다, 새 리프레시 토큰을 저장한다", async () => {
  const { session, calls, stored } = setup();
  assert.deepEqual(await session.startTarget(), { kind: "handoff", code: "h1" });
  assert.deepEqual(calls.refresh, ["r0"]);
  assert.equal(stored(), "r1");
  assert.deepEqual(calls.handoff, ["a1"]);
});

test("앱 실행 — 저장된 토큰이 없으면 reset(웹뷰 옛 쿠키 정리)", async () => {
  const { session, calls } = setup(null);
  assert.deepEqual(await session.startTarget(), { kind: "reset" });
  assert.equal(calls.refresh.length, 0);
});

test("앱 실행 — 서버가 토큰을 거절(401)하면 기기 토큰을 지우고 reset", async () => {
  const { session, behavior, stored } = setup();
  behavior.refresh = "auth";
  assert.deepEqual(await session.startTarget(), { kind: "reset" });
  assert.equal(stored(), null);
});

test("앱 실행 — 네트워크 문제면 토큰을 지우지 않고 그냥 연다(plain)", async () => {
  const { session, behavior, stored } = setup();
  behavior.refresh = "network";
  assert.deepEqual(await session.startTarget(), { kind: "plain" });
  assert.equal(stored(), "r0");
});

test("앱 실행 — 교환 코드만 실패해도 plain", async () => {
  const { session, behavior } = setup();
  behavior.handoff = "network";
  assert.deepEqual(await session.startTarget(), { kind: "plain" });
});

test("로그인 — 토큰을 저장하고, 곧바로 쓰는 액세스 토큰은 갱신 없이 메모리에서", async () => {
  const { session, calls, stored } = setup(null);
  assert.deepEqual(await session.login({ provider: "kakao", accessToken: "k" }), { handoffCode: "h-login", isNewUser: true });
  assert.equal(stored(), "r1");
  assert.equal(await session.ensureAccessToken(), "a1");
  assert.equal(calls.refresh.length, 0);
});

test("로그아웃 — 기기 토큰을 지우고 서버에 알린다, 서버 실패는 무시", async () => {
  const { session, calls, behavior, stored } = setup();
  behavior.logout = "network";
  await session.logout();
  assert.equal(stored(), null);
  assert.deepEqual(calls.logout, ["r0"]);
  assert.equal(await session.ensureAccessToken(), null);
});

test("로그아웃 — 진행 중인 갱신이 있으면 끝난 뒤 그 새 토큰으로 서버에 알리고, 기기·메모리엔 아무것도 남지 않는다", async () => {
  const { session, calls, stored } = setup();
  const pending = session.ensureAccessToken();
  await session.logout();
  await pending;
  assert.equal(stored(), null);
  assert.deepEqual(calls.logout, ["r1"]);
  assert.equal(await session.ensureAccessToken(), null);
});

// 웹이 로그아웃했는데(메시지를 받았다) 앱이 토큰을 들고 있으면 다음 실행 때 조용히 다시 로그인된다 — 저장소 오류에도 서버 묶음 폐기는 끝까지 간다
test("로그아웃 — 기기 저장소를 못 지워도 던지지 않고 서버엔 알린다(남은 토큰은 서버에서 죽는다)", async () => {
  const { session, calls, behavior } = setup();
  behavior.store = "clear";
  await session.logout();
  assert.deepEqual(calls.logout, ["r0"]);
});

test("로그아웃 — 기기 저장소를 못 읽어도 던지지 않고 지우기는 시도한다(토큰을 모르니 서버엔 못 알린다)", async () => {
  const { session, calls, behavior, stored } = setup();
  behavior.store = "read";
  await session.logout();
  assert.equal(stored(), null);
  assert.deepEqual(calls.logout, []);
});

test("로그아웃 두 번(웹에서 연타하면 메시지가 두 번 온다) — 기기엔 아무것도 안 남고 서버엔 같은 토큰만 간다(서버 로그아웃은 멱등)", async () => {
  const { session, calls, stored } = setup();
  await Promise.all([session.logout(), session.logout()]);
  assert.equal(stored(), null);
  assert.ok(calls.logout.length >= 1 && calls.logout.every((x) => x === "r0"), JSON.stringify(calls.logout));
});

// 로그아웃이 시작된 뒤 들어온 토큰 요청(②~ 의 네이티브 호출 · ①의 '다시 시도')은 로그아웃 뒤에 선다 — 저장소를 읽고 지우는 사이에 끼어든 갱신이
// 옛 토큰을 서버에서 교체해 기기에 다시 써 넣으면, 웹은 로그아웃됐는데 다음 실행 때 앱이 조용히 다시 로그인시킨다
test("로그아웃 도중 시작한 갱신 — 로그아웃이 지운 뒤에 돌아 토큰을 되살리지 않는다(갱신을 보내지도 않는다)", async () => {
  const { session, calls, stored } = setup();
  const out = session.logout();
  const during = session.ensureAccessToken();
  await out;
  assert.equal(await during, null);
  assert.equal(stored(), null);
  assert.deepEqual(calls.refresh, []);
  assert.deepEqual(calls.logout, ["r0"]);
  assert.equal(await session.ensureAccessToken(), null);
});

test("로그아웃을 부른 뒤의 토큰 요청 — 메모리의 옛 액세스 토큰을 내주지 않는다", async () => {
  const { session, calls, stored } = setup();
  assert.equal(await session.ensureAccessToken(), "a1"); // 평소 — 메모리에 유효한 토큰
  const out = session.logout();
  assert.equal(await session.ensureAccessToken(), null);
  await out;
  assert.equal(stored(), null);
  assert.deepEqual(calls.logout, ["r1"]);
});

test("로그아웃을 부른 뒤의 토큰 요청 — 로그아웃 전에 시작한 갱신의 새 토큰(로그아웃이 폐기할 것)을 내주지 않는다", async () => {
  const { session, calls, stored } = setup();
  const before = session.ensureAccessToken(); // 로그아웃 전에 시작한 갱신 — 이걸 부른 쪽은 그 결과를 받는다
  const out = session.logout();
  const after = session.ensureAccessToken();
  await out;
  assert.equal(await before, "a1");
  assert.equal(await after, null);
  assert.equal(stored(), null);
  assert.deepEqual(calls.refresh, ["r0"]);
  assert.deepEqual(calls.logout, ["r1"]);
});

test("갱신이 네트워크로 실패한 뒤에도 — 로그아웃은 기기 토큰을 지우고, 다음 요청은 다시 갱신한다(줄이 끊기지 않는다)", async () => {
  const { session, calls, behavior, stored } = setup();
  behavior.refresh = "network";
  assert.deepEqual(await session.startTarget(), { kind: "plain" });
  behavior.refresh = "ok";
  assert.equal(await session.ensureAccessToken(), "a1");
  await session.logout();
  assert.equal(stored(), null);
  assert.deepEqual(calls.refresh, ["r0", "r0"]);
  assert.deepEqual(calls.logout, ["r1"]);
});

test("갱신 도중 로그인 — 늦게 온 401 이 방금 저장한 로그인 토큰을 지우지 않는다", async () => {
  const { session, behavior, stored } = setup();
  behavior.refresh = "auth";
  const pending = session.ensureAccessToken();
  await session.login({ provider: "kakao", accessToken: "k" });
  assert.equal(await pending, null);
  assert.equal(stored(), "r1");
  assert.equal(await session.ensureAccessToken(), "a1");
});

test("갱신 도중 로그인 — 늦게 끝난 갱신의 옛 토큰이 로그인 토큰을 덮지 않는다", async () => {
  const { session, calls, stored } = setup();
  const pending = session.ensureAccessToken();
  await session.login({ provider: "kakao", accessToken: "k" });
  await pending;
  assert.equal(stored(), "r1");
  assert.equal(await session.ensureAccessToken(), "a1");
  assert.deepEqual(calls.refresh, ["r0"]);
});

test("액세스 토큰은 만료 1분 전까지 메모리에서 쓰고, 그 뒤 첫 요청에 한 번 갱신한다", async () => {
  const { session, calls, tick } = setup();
  assert.equal(await session.ensureAccessToken(), "a1");
  tick(3_600_000 - 61_000);
  assert.equal(await session.ensureAccessToken(), "a1");
  tick(2_000);
  const [x, y] = await Promise.all([session.ensureAccessToken(), session.ensureAccessToken()]);
  assert.equal(x, "a2");
  assert.equal(y, "a2");
  assert.deepEqual(calls.refresh, ["r0", "r1"]);
});
