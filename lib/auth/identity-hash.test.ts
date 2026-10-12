import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { identityHash } from "./identity-hash.ts";

// 2026-07 부터 쌓인 원장 공식 — 이게 바뀌면 탈퇴→재가입한 사람이 웰컴 별을 또 받는다
const legacy = (kakaoId: number) => createHash("sha256").update(String(kakaoId)).digest("hex");

test("카카오 해시는 기존 원장 공식(sha256(String(kakao_id)))과 같다", () => {
  assert.equal(identityHash("kakao", 4123456789), legacy(4123456789));
  assert.equal(identityHash("kakao", "4123456789"), legacy(4123456789));
});

test("애플 해시는 'apple:' 접두가 붙어 같은 문자열의 카카오 해시와 겹치지 않는다", () => {
  assert.notEqual(identityHash("apple", "4123456789"), identityHash("kakao", "4123456789"));
  assert.equal(
    identityHash("apple", "001234.abc.0987"),
    createHash("sha256").update("apple:001234.abc.0987").digest("hex"),
  );
});
