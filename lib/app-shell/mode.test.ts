import { test } from "node:test";
import assert from "node:assert/strict";
import { appModeScript } from "./mode.ts";
import { parseAppUserAgent } from "../app-bridge/protocol.ts";

/** 스크립트를 가짜 전역으로 돌리고 <html> 에 붙은 속성을 돌려준다 */
function run(injected: unknown, ua: string | (() => string)): Record<string, string> {
  const attrs: Record<string, string> = {};
  const documentElement = { setAttribute: (k: string, v: string) => (attrs[k] = v) };
  const navigator = typeof ua === "function" ? { get userAgent() { return ua(); } } : { userAgent: ua };
  new Function("window", "navigator", "document", appModeScript())({ __BYEOLKONG_APP__: injected }, navigator, { documentElement });
  return attrs;
}

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

test("주입값 ios → data-app·data-platform=ios", () => {
  assert.deepEqual(run({ version: "1.0.0", platform: "ios" }, BROWSER), { "data-app": "", "data-platform": "ios" });
});

test("주입값 없고 UA 꼬리 android → platform=android", () => {
  assert.deepEqual(run(undefined, "Mozilla/5.0 (Linux; Android 14) ByeolkongApp/1.0.0 (android)"), {
    "data-app": "",
    "data-platform": "android",
  });
});

test("둘 다 있으면 주입값이 이긴다", () => {
  assert.equal(run({ version: "1.0.0", platform: "ios" }, `${BROWSER} ByeolkongApp/1.0.0 (android)`)["data-platform"], "ios");
});

test("주입값이 모양이 틀리면 UA 로", () => {
  assert.equal(run({ version: 1, platform: "ios" }, `${BROWSER} ByeolkongApp/1.0.0 (android)`)["data-platform"], "android");
});

test("브라우저 UA 만 → 속성 없음", () => {
  assert.deepEqual(run(undefined, BROWSER), {});
});

test("navigator 접근이 던져도 던지지 않는다", () => {
  assert.deepEqual(
    run(undefined, () => {
      throw new Error("boom");
    }),
    {},
  );
});

test("protocol 의 UA 표식과 같은 규칙을 쓴다", () => {
  const samples = [
    `${BROWSER} ByeolkongApp/1.0.0 (ios)`,
    `${BROWSER} ByeolkongApp/1.0.0_5 (android)`,
    `${BROWSER} ByeolkongApp/ (ios)`,
    `${BROWSER} ByeolkongApp/1.0.0 (windows)`,
    `${BROWSER} ByeolkongApp/${"9".repeat(33)} (ios)`,
  ];
  for (const ua of samples) {
    const expected = parseAppUserAgent(ua)?.platform;
    assert.equal(run(undefined, ua)["data-platform"], expected, ua);
  }
});
