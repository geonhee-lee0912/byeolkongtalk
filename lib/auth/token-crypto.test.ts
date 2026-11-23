import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "./token-crypto.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");

test("암호화한 값은 원래대로 풀린다", () => {
  const blob = encryptSecret("r.apple.token", KEY);
  assert.match(blob, /^v1:/);
  assert.notEqual(blob, "r.apple.token");
  assert.equal(decryptSecret(blob, KEY), "r.apple.token");
});

test("같은 값도 매번 다르게 암호화된다(IV)", () => {
  assert.notEqual(encryptSecret("x", KEY), encryptSecret("x", KEY));
});

test("변조·다른 키·모르는 형식은 throw", () => {
  const blob = encryptSecret("x", KEY);
  const raw = Buffer.from(blob.slice(3), "base64");
  raw[raw.length - 1] ^= 1;
  assert.throws(() => decryptSecret(`v1:${raw.toString("base64")}`, KEY));
  assert.throws(() => decryptSecret(blob, Buffer.alloc(32, 8).toString("base64")));
  assert.throws(() => decryptSecret(`v2:${blob.slice(3)}`, KEY), /unknown secret format/);
});

test("잘린 값(태그 16바이트 미만)은 throw — 짧은 태그를 받아들이지 않는다", () => {
  const raw = Buffer.from(encryptSecret("", KEY).slice(3), "base64"); // iv 12 + tag 16
  assert.throws(() => decryptSecret(`v1:${raw.subarray(0, 16).toString("base64")}`, KEY));
});

test("키가 없거나 32바이트가 아니면 throw — 운영자가 알아볼 메시지로", () => {
  assert.throws(() => encryptSecret("x", Buffer.alloc(16).toString("base64")), /32 bytes/);
  assert.throws(() => encryptSecret("x", ""), /not set/);
  assert.throws(() => decryptSecret("v1:AAAA", Buffer.alloc(16).toString("base64")), /32 bytes/);
});

test("v1 고정값은 계속 풀린다 — 탈퇴 때까지 몇 년씩 DB 에 남는 저장 형식을 고정", () => {
  assert.equal(decryptSecret("v1:OLC7oXVkVG3en+MlIUvTnMyeLEJ2RgYBFqdE8D4P2kNYgozPy6aaRi8=", KEY), "r.apple.token");
});

test("키 인자를 생략하면 APPLE_TOKEN_ENC_KEY 를 쓴다(실제 호출 경로) — 없으면 throw", () => {
  const saved = process.env.APPLE_TOKEN_ENC_KEY;
  try {
    process.env.APPLE_TOKEN_ENC_KEY = KEY;
    assert.equal(decryptSecret(encryptSecret("r.apple.token")), "r.apple.token");
    delete process.env.APPLE_TOKEN_ENC_KEY;
    assert.throws(() => encryptSecret("x"), /not set/);
    assert.throws(() => decryptSecret("v1:AAAA"), /not set/);
  } finally {
    if (saved === undefined) delete process.env.APPLE_TOKEN_ENC_KEY;
    else process.env.APPLE_TOKEN_ENC_KEY = saved;
  }
});
