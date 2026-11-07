// scripts/agent/shot.sh 가 부른다. 모바일 폭(390×844)으로 열어 PNG 를 찍고 요약 한 줄(JSON)을 낸다.
// 유저UUID 를 주면 그 유저로 로그인한 상태(byeolkong_user_id 쿠키)로 연다.
// BK_SHOT_APP=ios|android 면 앱 웹뷰를 흉내 낸다 — UA 꼬리 + 문서 시작 전 앱 정보 주입(mobile/src/WebScreen.tsx 와 같은 두 근거).
import { createRequire } from "node:module";

const { chromium } = createRequire(`${process.env.BK_PLAYWRIGHT_DIR}/package.json`)("playwright");
const [url, out, userId] = process.argv.slice(2);
const p = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const browser = await chromium.launch({
  headless: true,
  ...(p
    ? {
        proxy: {
          server: `${p.protocol}//${p.host}`,
          username: decodeURIComponent(p.username),
          password: decodeURIComponent(p.password),
          bypass: "localhost,127.0.0.1",
        },
      }
    : {}),
});
const appPlatform = ["ios", "android"].includes(process.env.BK_SHOT_APP ?? "") ? process.env.BK_SHOT_APP : null;
const baseUa = appPlatform ? await (async () => { const c = await browser.newContext(); const pg = await c.newPage(); const ua = await pg.evaluate(() => navigator.userAgent); await c.close(); return ua; })() : null;
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "ko-KR",
  ignoreHTTPSErrors: true,
  ...(appPlatform ? { userAgent: `${baseUa} ByeolkongApp/1.0.0 (${appPlatform})` } : {}),
});
if (appPlatform) {
  await ctx.addInitScript((p) => {
    window.__BYEOLKONG_APP__ = { version: "1.0.0", platform: p, caps: ["push"] };
  }, appPlatform);
}
if (userId) await ctx.addCookies([{ name: "byeolkong_user_id", value: userId, url: new URL(url).origin }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const res = await page.goto(url, { waitUntil: "load", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.screenshot({ path: out });
console.log(JSON.stringify({ status: res.status(), title: await page.title(), finalUrl: page.url(), pageErrors: errors.slice(0, 3) }));
await browser.close();
