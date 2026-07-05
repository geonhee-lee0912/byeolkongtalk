import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAcqPayload, parseAcqCookie, ACQ_COOKIE } from "./acquisition.ts";

test("buildAcqPayload — utm 없으면 null", () => {
  assert.equal(buildAcqPayload({}), null);
  assert.equal(buildAcqPayload({ foo: "bar" }), null);
});

test("buildAcqPayload — utm 하나라도 있으면 페이로드", () => {
  const p = buildAcqPayload({ utm_content: "vid_a", utm_source: "meta" });
  assert.equal(p?.utm_content, "vid_a");
  assert.equal(p?.utm_source, "meta");
  assert.equal(p?.utm_medium, undefined);
});

test("buildAcqPayload — fbclid 만 있어도 페이로드", () => {
  const p = buildAcqPayload({ fbclid: "abc" });
  assert.equal(p?.fbclid, "abc");
});

test("buildAcqPayload — 값 길이 200자로 cap", () => {
  const p = buildAcqPayload({ utm_campaign: "x".repeat(500) });
  assert.equal(p?.utm_campaign?.length, 200);
});

test("parseAcqCookie — 유효 JSON 라운드트립", () => {
  const p = buildAcqPayload({ utm_content: "vid_a" })!;
  const raw = encodeURIComponent(JSON.stringify(p));
  const parsed = parseAcqCookie(raw);
  assert.equal(parsed?.utm_content, "vid_a");
});

test("parseAcqCookie — 깨진 값이면 null", () => {
  assert.equal(parseAcqCookie("%%%not-json"), null);
  assert.equal(parseAcqCookie(undefined), null);
});

test("ACQ_COOKIE 이름", () => {
  assert.equal(ACQ_COOKIE, "byeolkong_acq");
});
