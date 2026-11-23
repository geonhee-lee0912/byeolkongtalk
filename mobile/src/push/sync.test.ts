import { test } from "node:test";
import assert from "node:assert/strict";
import { createPushSync, type PushSyncDeps } from "./sync.ts";

/** 손으로 끝내는 약속 — 등록이 어느 await 에 서 있을 때 로그아웃이 끼어드는지 정한다 */
function gate<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(over: Partial<PushSyncDeps> = {}) {
  const server = new Set<string>();
  const calls: string[] = [];
  let saved: string | null = null;
  const deps: PushSyncDeps = {
    getExpoToken: async () => "T1",
    post: async (token, access) => {
      calls.push(`post ${token} ${access}`);
      server.add(token);
    },
    del: async (token) => {
      calls.push(`del ${token}`);
      server.delete(token);
    },
    saved: {
      get: async () => saved,
      set: async (t) => {
        saved = t;
      },
      clear: async () => {
        saved = null;
      },
    },
    warn: () => {},
    ...over,
  };
  return { sync: createPushSync(deps), server, calls, saved: () => saved, setSaved: (t: string | null) => (saved = t) };
}

test("로그아웃이 없으면 서버에 등록하고 토큰을 기억한다", async () => {
  const s = setup();
  await s.sync.register(async () => "A1");
  assert.deepEqual(s.calls, ["post T1 A1"]);
  assert.deepEqual([...s.server], ["T1"]);
  assert.equal(s.saved(), "T1");
});

test("로그인 안 됨·토큰 못 받음이면 등록하지 않는다", async () => {
  const a = setup();
  await a.sync.register(async () => null);
  const b = setup({ getExpoToken: async () => null });
  await b.sync.register(async () => "A1");
  assert.deepEqual([...a.calls, ...b.calls], []);
});

test("Expo 토큰을 기다리는 사이 로그아웃하면 서버에 등록하지 않는다(처음 등록이라 기억한 토큰이 없을 때)", async () => {
  const expo = gate<string | null>();
  const s = setup({ getExpoToken: () => expo.promise });
  const reg = s.sync.register(async () => "A1");
  await flush();
  await s.sync.unregister();
  expo.resolve("T1");
  await reg;
  assert.deepEqual(s.calls, []);
  assert.equal(s.server.size, 0);
  assert.equal(s.saved(), null);
});

test("서버 등록 중에 로그아웃하면 등록이 끝난 뒤 그 토큰을 지운다", async () => {
  const posting = gate<void>();
  const server = new Set<string>();
  const s = setup({
    post: async (token) => {
      await posting.promise;
      server.add(token);
    },
    del: async (token) => {
      server.delete(token);
    },
  });
  const reg = s.sync.register(async () => "A1");
  await flush();
  await s.sync.unregister();
  posting.resolve();
  await reg;
  assert.equal(server.size, 0);
  assert.equal(s.saved(), null);
});

test("토큰을 기억하는 중에 로그아웃해도 그 토큰을 지운다", async () => {
  const saving = gate<void>();
  let saved: string | null = null;
  const s = setup({
    saved: {
      get: async () => saved,
      set: async (t) => {
        await saving.promise;
        saved = t;
      },
      clear: async () => {
        saved = null;
      },
    },
  });
  const reg = s.sync.register(async () => "A1");
  await flush();
  await s.sync.unregister(); // 아직 기억 전이라 지울 게 없다
  saving.resolve();
  await reg;
  assert.equal(s.server.size, 0);
  assert.equal(saved, null);
});

test("로그아웃 뒤 다시 로그인하면 새 등록은 그대로 된다", async () => {
  const s = setup();
  await s.sync.unregister();
  await s.sync.register(async () => "A2");
  assert.deepEqual([...s.server], ["T1"]);
  assert.equal(s.saved(), "T1");
});

test("뒤늦게 지우는 게 실패하면 기억한 토큰을 남긴다(다음 로그아웃·reset 때 다시 지운다)", async () => {
  const posting = gate<void>();
  const warned: string[] = [];
  const s = setup({
    post: () => posting.promise,
    del: async () => {
      throw new Error("offline");
    },
    warn: (m) => warned.push(m),
  });
  const reg = s.sync.register(async () => "A1");
  await flush();
  await s.sync.unregister();
  posting.resolve();
  await reg;
  assert.equal(s.saved(), "T1");
  // 로그아웃 때는 기억한 토큰이 아직 없어 지울 게 없었다 — 경고는 뒤늦은 지우기 실패 1번
  assert.equal(warned.length, 1);
});

test("로그아웃 — 기억한 토큰만 서버에서 지우고, 실패하면 기억을 남긴다. 던지지 않는다", async () => {
  const none = setup();
  await none.sync.unregister();
  assert.deepEqual(none.calls, []);

  const some = setup();
  some.setSaved("T9");
  await some.sync.unregister();
  assert.deepEqual(some.calls, ["del T9"]);
  assert.equal(some.saved(), null);

  const fail = setup({
    del: async () => {
      throw new Error("offline");
    },
  });
  fail.setSaved("T9");
  await fail.sync.unregister();
  assert.equal(fail.saved(), "T9");
});

test("등록 실패는 삼킨다(던지지 않는다)", async () => {
  const warned: string[] = [];
  const s = setup({
    post: async () => {
      throw new Error("500");
    },
    warn: (m) => warned.push(m),
  });
  await s.sync.register(async () => "A1");
  assert.equal(s.saved(), null);
  assert.equal(warned.length, 1);
});
