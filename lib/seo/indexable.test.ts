// sitemap 과 robots 의 계약 — "사이트맵에 올린 URL 을 robots 가 막지 않는다".
//
// 🔴 이 계약이 없으면 자동 게이트가 **전부 통과한 채로** SEO 가 죽는다. 2026-09-28 에
//    실제로 그랬다: `98d67f80` 이 `/fortune/*` 20 URL 을 sitemap 에 올렸는데 robots 의
//    `Disallow: /fortune` 은 그대로라, 크롤러 눈엔 20개가 전부 "robots.txt 에 의해 차단됨"
//    이었다. tsc·유닛 844·build 가 다 녹색이었고 화면도 멀쩡했다.
import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { INDEXABLE_FORTUNE_PATHS } from "@/lib/seo/indexable";

const asList = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * robots.txt 매칭 규칙: prefix 가 맞는 것들 중 **가장 긴 경로**가 이긴다.
 * 길이가 같으면 allow 우선(Google 규격). 그래서 `Allow: /` 는 `Disallow: /fortune` 을 못 이긴다.
 */
function isBlocked(path: string, allow: string[], disallow: string[]): boolean {
  const longest = (rules: string[]) =>
    rules
      .filter((r) => path.startsWith(r))
      .reduce((max, r) => Math.max(max, r.length), -1);
  return longest(disallow) > longest(allow);
}

function firstRule() {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  return { allow: asList(rule.allow), disallow: asList(rule.disallow) };
}

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://byeolkongtalk.com";

test("sitemap 에 오른 URL 은 robots 가 하나도 막지 않는다", () => {
  const { allow, disallow } = firstRule();
  const blocked = sitemap()
    .map((e) => e.url.slice(BASE.length) || "/")
    .filter((p) => isBlocked(p, allow, disallow));
  assert.deepEqual(
    blocked,
    [],
    `robots 가 막는 sitemap URL: ${blocked.join(", ")}`
  );
});

test("진열 중인 상품 설명 페이지는 /fortune 차단을 뚫고 열려 있다", () => {
  const { allow, disallow } = firstRule();
  assert.ok(
    INDEXABLE_FORTUNE_PATHS.length > 0,
    "진열 상품이 0개면 이 계약이 공허해진다"
  );
  for (const path of INDEXABLE_FORTUNE_PATHS) {
    assert.equal(isBlocked(path, allow, disallow), false, `막힘: ${path}`);
  }
});

test("열어 준 건 상품 경로뿐 — /fortune 트리의 나머지는 그대로 막힌다", () => {
  const { allow, disallow } = firstRule();
  // 결과 화면·타로 상품·별자리 공유는 색인 대상이 아니다.
  for (const path of [
    "/fortune",
    "/fortune/result",
    "/fortune/tarot/tarot_love",
    "/fortune/byeoljari",
    "/fortune/daily",
  ]) {
    assert.equal(isBlocked(path, allow, disallow), true, `열림: ${path}`);
  }
});
