import { test } from "node:test";
import assert from "node:assert/strict";
import { consultationEntryPath, EMOTION_KEY } from "./consultation-entry.ts";

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
