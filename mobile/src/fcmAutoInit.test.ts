// 안드로이드 FCM 자동 등록 끄기(운영자 2026-11-22 알림-4B). 루트 CI 엔 expo 가 없다 — 플러그인의 순수 함수와 설정만 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";

const KEY = "firebase_messaging_auto_init_enabled";
const meta = (name: string, value: string) => ({ $: { "android:name": name, "android:value": value } });

test("자동 등록을 끄는 값 하나만 남기고 다른 meta-data 는 그대로 둔다", () => {
  const { turnOffAutoInit } = require("../plugins/withFcmAutoInitOff.js");
  const other = meta("other", "1");
  for (const before of [undefined, [other], [other, meta(KEY, "true")], [other, meta(KEY, "false")]]) {
    const app = { $: { "android:name": ".MainApplication" }, "meta-data": before };
    turnOffAutoInit(app);
    assert.deepEqual(app["meta-data"], [...(before ? [other] : []), meta(KEY, "false")]);
  }
});

// 빠져도 빌드·알림은 그대로라 아무도 모른다 — 처리방침의 'Google 로 가는 때'만 조용히 거짓이 된다
test("앱 설정이 플러그인을 켠다", () => {
  const config = require("../app.config.ts").default;
  assert.ok(config.plugins.includes("./plugins/withFcmAutoInitOff.js"));
});
