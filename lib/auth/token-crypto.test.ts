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
  assert.throws(() => decryptSecret("v0:abc", KEY));
});

test("키가 없거나 32바이트가 아니면 throw", () => {
  assert.throws(() => encryptSecret("x", Buffer.alloc(16).toString("base64")));
  assert.throws(() => encryptSecret("x", ""));
});
