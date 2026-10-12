import { test } from "node:test";
import assert from "node:assert/strict";
import { appleNickname } from "./nickname.ts";

test("애플 이름이 있으면 성+이름(한국식 순서)", () => {
  assert.equal(appleNickname({ familyName: "김", givenName: "별콩" }), "김별콩");
});

test("애플 이름이 없으면 별콩이_ + 4자리", () => {
  assert.equal(appleNickname(null, () => 0.0042), "별콩이_0042");
  assert.equal(appleNickname({ givenName: " ", familyName: "" }, () => 0.9999), "별콩이_9999");
});

test("50자를 넘으면 코드 포인트 단위로 자른다(users.nickname VARCHAR(50))", () => {
  assert.equal(Array.from(appleNickname({ givenName: "가".repeat(60) })).length, 50);
});
