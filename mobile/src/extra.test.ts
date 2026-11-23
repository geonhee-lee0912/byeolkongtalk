import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppExtra } from "./extra.ts";

const DEV = { variant: "development", scheme: "byeolkong-dev", baseUrl: "https://dev.byeolkongtalk.com/" };

test("개발용 — 우회 값은 문자열 그대로, 기준 주소 끝 / 는 뗀다", () => {
  assert.deepEqual(parseAppExtra({ ...DEV, vercelBypass: "s3" }), {
    variant: "development",
    scheme: "byeolkong-dev",
    baseUrl: "https://dev.byeolkongtalk.com",
    vercelBypass: "s3",
  });
});

// app.config.ts 의 null 은 빌드 직렬화에서 {} 가 된다(@expo/config serializeAndEvaluate) — {} 는 참이라 그대로 쓰면 주소·헤더에 실린다
test("우회 값 — 직렬화된 {}·null·빈 값·없음·문자열 아님은 null", () => {
  for (const v of [{}, null, undefined, "", 123]) {
    assert.equal(parseAppExtra({ ...DEV, vercelBypass: v }).vercelBypass, null, String(JSON.stringify(v)));
  }
});

test("운영 — 우회 값이 들어와도 버린다", () => {
  assert.deepEqual(parseAppExtra({ variant: "production", scheme: "byeolkong", baseUrl: "https://byeolkongtalk.com", vercelBypass: "s3" }), {
    variant: "production",
    scheme: "byeolkong",
    baseUrl: "https://byeolkongtalk.com",
    vercelBypass: null,
  });
});

test("baseUrl·scheme 이 없으면 바로 실패한다", () => {
  assert.throws(() => parseAppExtra(undefined));
  assert.throws(() => parseAppExtra({ variant: "development", scheme: "byeolkong-dev" }));
  assert.throws(() => parseAppExtra({ variant: "development", baseUrl: "https://dev.byeolkongtalk.com" }));
});
