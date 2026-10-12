import { test } from "node:test";
import assert from "node:assert/strict";
import { appleNickname } from "./nickname.ts";

test("애플 이름이 있으면 성+이름(한국식 순서)", () => {
  assert.equal(appleNickname({ familyName: "김", givenName: "별콩" }), "김별콩");
});

test("애플 이름이 없으면 별콩이_ + 4자리", () => {
  assert.equal(appleNickname(null, () => 0.0042), "별콩이_0042");
  assert.equal(appleNickname({ givenName: " ", familyName: "" }, () => 0.9999), "별콩이_9999");
  assert.equal(appleNickname(null, () => 0), "별콩이_0000");
  assert.equal(appleNickname(null, () => 0.99999), "별콩이_9999");
});

test("50자를 넘으면 코드 포인트 단위로 자른다(users.nickname VARCHAR(50)) — 이모지(서로게이트 쌍)를 반으로 가르지 않는다", () => {
  assert.equal(appleNickname({ givenName: "가".repeat(60) }), "가".repeat(50));
  assert.equal(appleNickname({ givenName: "😀".repeat(60) }), "😀".repeat(50));
});

test("이름이 한쪽만 있어도 그대로 쓴다", () => {
  assert.equal(appleNickname({ givenName: "별콩" }), "별콩");
  assert.equal(appleNickname({ familyName: "김" }), "김");
});
