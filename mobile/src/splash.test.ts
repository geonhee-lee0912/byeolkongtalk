// 안드로이드 12+ 스플래시는 아이콘 칸 288dp 가운데 지름 192dp 원 밖을 가린다(운영자 2026-11-22 "크기만 줄이기").
// 그림이 원을 넘어도 빌드는 성공하고 글자만 잘린다 — 그림이나 폭을 바꾸면 여기서 잡는다.
// 루트 CI 엔 expo 가 없다 — 설정과 그림만 읽는다. 그림 놓는 법은 expo-splash-screen 58 과 같다(폭×폭 칸에 contain, 가운데).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const MASK_RADIUS_DP = 96;
// 흰 바탕과 연보라 번짐은 가려져도 안 보인다 — 선·글자만 잰다
const INK_BELOW = 200;

function splash() {
  const config = require("../app.config.ts").default;
  return config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")[1];
}

test("안드로이드 스플래시의 별콩이·글자가 가림 원 안에 다 들어간다", async () => {
  const options = splash();
  const android = { ...options, ...options.android };
  const file = fileURLToPath(new URL(`../${android.image.replace(/^\.\//, "")}`, import.meta.url));
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let farthest = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.min(data[i], data[i + 1], data[i + 2]) >= INK_BELOW) continue;
      farthest = Math.max(farthest, Math.hypot(x + 0.5 - info.width / 2, y + 0.5 - info.height / 2));
    }
  }
  const dp = (farthest * android.imageWidth) / Math.max(info.width, info.height);
  assert.ok(dp > 0 && dp <= MASK_RADIUS_DP, `가운데에서 ${dp.toFixed(1)}dp — 원 반지름 ${MASK_RADIUS_DP}dp 를 넘는다`);
});

test("아이폰은 가림이 없어 크기 그대로", () => {
  const options = splash();
  assert.equal({ ...options, ...options.ios }.imageWidth, 216);
});
