import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthSession, type AuthApi, type Tokens, type TokenStore } from "./session.ts";

class AuthErr extends Error {}
const T0 = 1_000_000;

function setup(initialRefresh: string | null = "r0") {
  let stored = initialRefresh;
  let seq = 0;
  const calls = { refresh: [] as string[], handoff: [] as string[], logout: [] as string[], login: 0 };
  const behavior = {
    refresh: "ok" as "ok" | "auth" | "network",
    handoff: "ok" as "ok" | "network",
    logout: "ok" as "ok" | "network",
    store: "ok" as "ok" | "read" | "clear", // 보안 저장소(키체인)가 읽기·지우기에서 실패
  };
  const tokens = (): Tokens => {
    seq++;
    return { accessToken: `a${seq}`, accessExpiresAt: T0 + 3_600_000, refreshToken: `r${seq}` };
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
  const session = createAuthSession({ store, api, isAuthError: (e) => e instanceof AuthErr, now: () => T0 });
  return { session, calls, behavior, stored: () => stored };
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
