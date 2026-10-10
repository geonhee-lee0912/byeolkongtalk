import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAcqPayload,
  parseAcqCookie,
  ACQ_COOKIE,
  FBCLID_MAX_LEN,
  fbcFromAcquisition,
  buildServerAcqCookie,
  acqFromPageView,
} from "./acquisition.ts";

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

// ── fbclid 원문 보존 + CAPI fbc 생성 (2026-10-04) ──
// prod 실측: `_aem_` 접미가 붙은 fbclid 는 접미 뒤가 항상 22자, 전체 ~212자까지 나온다.
// 공통 200자 상한이 저장된 fbclid 2,356개 중 1,689개(72%)를 잘랐다 — 잘린 값으로 만든 fbc 는 Meta 에 "수정된 클릭 ID"다.
const fbclidOf = (len: number) => {
  const tail = "_aem_" + "t".repeat(22);
  return "IwZXh0bgNhZW0" + "x".repeat(len - 13 - tail.length) + tail;
};

test("buildAcqPayload — fbclid 는 200자를 넘어도 자르지 않는다", () => {
  const id = fbclidOf(212);
  assert.equal(buildAcqPayload({ fbclid: id })?.fbclid, id);
});

test("buildAcqPayload — fbclid 도 저장 폭주 방지 상한은 있다", () => {
  const p = buildAcqPayload({ fbclid: "x".repeat(FBCLID_MAX_LEN + 100) });
  assert.equal(p?.fbclid?.length, FBCLID_MAX_LEN);
});

const NOW = new Date("2026-10-04T12:00:00Z");
const row = (o: Partial<Parameters<typeof fbcFromAcquisition>[0]> = {}) => ({
  fbc: null,
  fbclid: fbclidOf(165),
  first_seen_at: "2026-10-04T10:00:00.000Z",
  created_at: "2026-10-04T10:00:23.000Z",
  ...o,
});

test("fbcFromAcquisition — fb.1.<최초 관측 ms>.<fbclid 원문>", () => {
  const r = row();
  assert.equal(
    fbcFromAcquisition(r, NOW),
    `fb.1.${Date.parse("2026-10-04T10:00:00.000Z")}.${r.fbclid}`
  );
});

test("fbcFromAcquisition — 랜딩 때 잡은 _fbc 쿠키가 있으면 그대로 쓴다", () => {
  assert.equal(
    fbcFromAcquisition(row({ fbc: "fb.1.1759572000000.AbC" }), NOW),
    "fb.1.1759572000000.AbC"
  );
});

test("fbcFromAcquisition — 옛 200자 상한에 잘린 fbclid 는 쓰지 않는다", () => {
  assert.equal(fbcFromAcquisition(row({ fbclid: fbclidOf(212).slice(0, 200) }), NOW), null);
});

test("fbcFromAcquisition — 현재 상한에 닿은 fbclid 도 잘렸을 수 있어 쓰지 않는다", () => {
  assert.equal(fbcFromAcquisition(row({ fbclid: "x".repeat(FBCLID_MAX_LEN) }), NOW), null);
});

test("fbcFromAcquisition — 200자를 넘는 온전한 fbclid 는 쓴다", () => {
  const id = fbclidOf(212);
  assert.ok(fbcFromAcquisition(row({ fbclid: id }), NOW)?.endsWith(`.${id}`));
});

test("fbcFromAcquisition — fbclid 도 _fbc 도 없으면 null", () => {
  assert.equal(fbcFromAcquisition(row({ fbclid: null }), NOW), null);
});

test("fbcFromAcquisition — 클라 시계가 앞서 first_seen_at 이 가입보다 늦으면 가입 시각(서버)", () => {
  const r = row({ first_seen_at: "2026-10-05T00:00:00.000Z" });
  assert.equal(fbcFromAcquisition(r, NOW), `fb.1.${Date.parse(r.created_at)}.${r.fbclid}`);
});

test("fbcFromAcquisition — first_seen_at 이 없으면 가입 시각", () => {
  const r = row({ first_seen_at: null });
  assert.equal(fbcFromAcquisition(r, NOW), `fb.1.${Date.parse(r.created_at)}.${r.fbclid}`);
});

test("fbcFromAcquisition — 브라우저 _fbc 쿠키 수명(90일)이 지난 클릭은 보내지 않는다", () => {
  const old = { first_seen_at: "2026-07-05T10:00:00.000Z", created_at: "2026-07-05T10:00:23.000Z" };
  assert.equal(fbcFromAcquisition(row(old), NOW), null);
  assert.equal(fbcFromAcquisition(row({ ...old, fbc: "fb.1.1751709600000.AbC" }), NOW), null);
  const fresh = { first_seen_at: "2026-07-07T10:00:00.000Z", created_at: "2026-07-07T10:00:23.000Z" };
  assert.ok(fbcFromAcquisition(row(fresh), NOW));
});

test("buildServerAcqCookie — 캡처 키 없으면 null", () => {
  assert.equal(buildServerAcqCookie(new URLSearchParams("v=a"), null, undefined, "t"), null);
});

test("buildServerAcqCookie — parseAcqCookie 라운드트립 + 필드", () => {
  const raw = buildServerAcqCookie(
    new URLSearchParams("utm_source=ig&utm_content=c1&fbclid=" + "f".repeat(300) + "&v=love"),
    "https://l.instagram.com/x",
    "fb.1.1.abc",
    "2026-10-10T00:00:00.000Z"
  )!;
  const p = parseAcqCookie(raw)!;
  assert.equal(p.utm_content, "c1");
  assert.equal(p.fbclid?.length, 300);
  assert.equal(p.landing_variant, "love");
  assert.equal(p.referrer, "https://l.instagram.com/x");
  assert.equal(p.fbc, "fb.1.1.abc");
  assert.equal(p.first_seen_at, "2026-10-10T00:00:00.000Z");
  assert.equal(p.capture, "server");
});

test("buildServerAcqCookie — 자사 Referer 는 referrer 제외", () => {
  for (const r of ["https://byeolkongtalk.com/a", "https://dev.byeolkongtalk.com/", "http://localhost:3000/x"]) {
    const p = parseAcqCookie(buildServerAcqCookie(new URLSearchParams("utm_source=a"), r, undefined, "t")!)!;
    assert.equal(p.referrer, undefined);
  }
});

test("acqFromPageView — 행 → 페이로드", () => {
  const p = acqFromPageView({
    utm_source: "ig", utm_medium: null, utm_campaign: "k", utm_content: "c", utm_term: null,
    landing_variant: "v1", referrer: null, created_at: "2026-10-01T00:00:00Z",
  });
  assert.deepEqual(p, { first_seen_at: "2026-10-01T00:00:00Z", utm_source: "ig", utm_campaign: "k", utm_content: "c", landing_variant: "v1" });
});
