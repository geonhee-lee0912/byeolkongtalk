import { test } from "node:test";
import assert from "node:assert/strict";
import { profileSaveErrorMessage } from "./profile-save-error.ts";

test("401 — 로그인이 풀렸다(다시 눌러도 안 풀린다)", () => {
  assert.equal(profileSaveErrorMessage(401), "로그인이 풀렸어. 다시 로그인해줄래?");
});

test("409 — 이미 저장된 내 사주(새로고침하면 PATCH 로 열린다)", () => {
  assert.equal(profileSaveErrorMessage(409), "이미 저장된 사주가 있어. 새로고침하고 다시 열어줄래?");
});

test("그 밖(400·403·500·503) — 기본 문구", () => {
  for (const status of [400, 403, 500, 503]) {
    assert.equal(profileSaveErrorMessage(status), "저장을 못 했어. 잠시 후 다시 시도해줄래?");
  }
});
