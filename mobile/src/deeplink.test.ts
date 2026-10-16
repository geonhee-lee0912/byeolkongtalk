import { test } from "node:test";
import assert from "node:assert/strict";
import { pathFromDeepLink } from "./deeplink.ts";

test("byeolkong://open?path=<내부 경로> → 그 경로", () => {
  assert.equal(pathFromDeepLink("byeolkong://open?path=%2Freadings%2Fabc", "byeolkong"), "/readings/abc");
  assert.equal(pathFromDeepLink("byeolkong://open/?path=/fortune", "byeolkong"), "/fortune");
});

test("다른 주소 체계·다른 호스트·바깥 경로·빈 값은 null", () => {
  assert.equal(pathFromDeepLink("byeolkong-dev://open?path=/a", "byeolkong"), null);
  assert.equal(pathFromDeepLink("byeolkong://openx?path=/a", "byeolkong"), null);
  assert.equal(pathFromDeepLink("byeolkong://expo-development-client/?url=http%3A%2F%2F1.2.3.4", "byeolkong"), null);
  assert.equal(pathFromDeepLink("byeolkong://open?path=%2F%2Fevil.example", "byeolkong"), null);
  assert.equal(pathFromDeepLink("byeolkong://open", "byeolkong"), null);
  assert.equal(pathFromDeepLink(null, "byeolkong"), null);
});
