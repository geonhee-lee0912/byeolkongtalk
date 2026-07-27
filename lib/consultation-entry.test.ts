import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consultationEntryPath,
  isLoggedInClient,
  EMOTION_KEY,
} from "./consultation-entry.ts";

test("로그인 상태면 /concern 직행", () => {
  assert.equal(consultationEntryPath(true), "/concern");
});

test("비로그인이면 /login?next=/concern", () => {
  assert.equal(
    consultationEntryPath(false),
    `/login?next=${encodeURIComponent("/concern")}`
  );
});

test("EMOTION_KEY 는 기존 홈이 쓰는 키와 동일", () => {
  assert.equal(EMOTION_KEY, "byeolkong:emotion");
});

/**
 * isLoggedInClient 는 window·localStorage 전역에 의존한다. node:test 에는 둘 다
 * 없으므로 최소 스텁을 심고 finally 로 반드시 원복한다(다른 테스트로 새지 않게).
 * `stored` = localStorage["byeolkong_user"] 가 담고 있을 원문 (키 없음이면 null).
 */
function withStoredUser(stored: string | null, fn: () => void) {
  const KEYS = ["window", "localStorage"] as const;
  const saved = KEYS.map((k) => Object.getOwnPropertyDescriptor(globalThis, k));

  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => (k === "byeolkong_user" ? stored : null) },
    configurable: true,
    writable: true,
  });

  try {
    fn();
  } finally {
    KEYS.forEach((k, i) => {
      const desc = saved[i];
      if (desc) Object.defineProperty(globalThis, k, desc);
      else Reflect.deleteProperty(globalThis, k);
    });
  }
}

test("유효한 유저 객체면 로그인", () => {
  withStoredUser('{"id":"x"}', () => assert.equal(isLoggedInClient(), true));
});

test("null 저장·키 없음이면 비로그인", () => {
  withStoredUser("null", () => assert.equal(isLoggedInClient(), false));
  withStoredUser(null, () => assert.equal(isLoggedInClient(), false));
});

test("falsy 스칼라(0)는 비로그인 — 홈의 `!user` 판정과 동일해야 한다", () => {
  // `!== null` 로 판정하면 0 이 로그인으로 잡혀 홈(app/page.tsx:81)과 갈린다.
  withStoredUser("0", () => assert.equal(isLoggedInClient(), false));
});

test("깨진 JSON 이면 비로그인", () => {
  withStoredUser("{oops", () => assert.equal(isLoggedInClient(), false));
});
