import { test } from "node:test";
import assert from "node:assert/strict";
import { welcomeWallLine } from "./welcome-copy.ts";
import { WELCOME_BONUS_STARS } from "../constants.ts";
import { FORTUNE_LIST } from "./types.ts";

test("웰컴 별로 살 수 있는 가격이면 '바로 볼 수 있어'", () => {
  const line = welcomeWallLine(WELCOME_BONUS_STARS, "내 사주로");
  assert.match(line, new RegExp(`웰컴 별 ${WELCOME_BONUS_STARS}개`));
  assert.match(line, /바로 볼 수 있어/);
});

test("웰컴 별보다 비싸면 '바로'라고 하지 않는다", () => {
  const line = welcomeWallLine(WELCOME_BONUS_STARS + 5, "두 사람 궁합을");
  assert.match(line, new RegExp(`웰컴 별 ${WELCOME_BONUS_STARS}개`));
  assert.doesNotMatch(line, /바로/);
  assert.match(line, /두 사람 궁합을 볼 수 있어/);
});

test("진열 중인 전 상품 — '바로'는 웰컴 별 이하 가격에만", () => {
  for (const f of FORTUNE_LIST.filter((x) => x.active && x.cost > 0)) {
    const line = welcomeWallLine(f.cost, "내 사주로");
    assert.equal(/바로/.test(line), f.cost <= WELCOME_BONUS_STARS, `${f.type} (${f.cost}별)`);
  }
});
