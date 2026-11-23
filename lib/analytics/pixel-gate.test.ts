import { test } from "node:test";
import assert from "node:assert/strict";
import { pixelAllowed } from "./pixel-gate.ts";

test("Meta 픽셀 — 앱이 아닌 게 확인된 브라우저에서만 불러온다", () => {
  assert.equal(pixelAllowed({ ready: true, app: null }), true);
  // 하이드레이션 첫 그림(앱인지 아직 모름)엔 불러오지 않는다 — 앱에서 한 번이라도 나가지 않게
  assert.equal(pixelAllowed({ ready: false, app: null }), false);
  assert.equal(pixelAllowed({ ready: true, app: { version: "1.0.0", platform: "ios", caps: [] } }), false);
});
