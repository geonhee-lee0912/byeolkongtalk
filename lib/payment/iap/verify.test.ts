// 앱 결제 앱 ID(lib/payment/iap/verify.ts iapAppId) — 비우면 운영 번들, IAP_APP_ID 로 dev(.dev 앱) 시험용으로 바꾼다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { iapAppId } from "./verify.ts";

test("iapAppId — IAP_APP_ID 가 없거나 비면 운영 번들 com.byeolkongtalk.app", () => {
  const saved = process.env.IAP_APP_ID;
  try {
    delete process.env.IAP_APP_ID;
    assert.equal(iapAppId(), "com.byeolkongtalk.app");
    process.env.IAP_APP_ID = "";
    assert.equal(iapAppId(), "com.byeolkongtalk.app");
  } finally {
    if (saved === undefined) delete process.env.IAP_APP_ID;
    else process.env.IAP_APP_ID = saved;
  }
});

test("iapAppId — IAP_APP_ID 가 있으면 그 값(부를 때마다 읽는다)", () => {
  const saved = process.env.IAP_APP_ID;
  try {
    process.env.IAP_APP_ID = "com.byeolkongtalk.app.dev";
    assert.equal(iapAppId(), "com.byeolkongtalk.app.dev");
  } finally {
    if (saved === undefined) delete process.env.IAP_APP_ID;
    else process.env.IAP_APP_ID = saved;
  }
});
