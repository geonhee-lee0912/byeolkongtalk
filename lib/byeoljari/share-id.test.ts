import { test } from "node:test";
import assert from "node:assert/strict";
import { generateShareId } from "./share-id.ts";

test("generateShareId — 기본 길이 10, base62 문자만", () => {
  const id = generateShareId();
  assert.equal(id.length, 10);
  assert.match(id, /^[0-9a-zA-Z]+$/);
});

test("generateShareId — 길이 지정 가능", () => {
  assert.equal(generateShareId(6).length, 6);
});

test("generateShareId — 충돌 없이 다양(1000개 유일)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateShareId());
  assert.equal(seen.size, 1000);
});
