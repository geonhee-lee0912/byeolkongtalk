import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeResult, decodeResult } from "./share-tokens.ts";

const R = { paljaCode: "음유인생", selfCode: "양강재생", band: "절충" as const, element: "화" as const };

test("share-tokens — 왕복 인코딩 복원", () => {
  assert.deepEqual(decodeResult(encodeResult(R)), R);
});

test("share-tokens — 형식은 인덱스 4토막", () => {
  assert.match(encodeResult(R), /^\d+\.\d+\.\d+\.\d+$/);
});

test("share-tokens — 무효 토큰은 null", () => {
  for (const t of [null, undefined, "", "1.2.3", "16.0.0.0", "0.0.3.0", "0.0.0.5", "a.b.c.d", "-1.0.0.0"]) {
    assert.equal(decodeResult(t as never), null, `${t} 는 null 이어야`);
  }
});
