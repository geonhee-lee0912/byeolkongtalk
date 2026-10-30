// scripts/agent/shot.sh 가 부른다. 모바일 폭(390×844)으로 열어 PNG 를 찍고 요약 한 줄(JSON)을 낸다.
// 유저UUID 를 주면 그 유저로 로그인한 상태(byeolkong_user_id 쿠키)로 연다.
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", ignoreHTTPSErrors: true });
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
