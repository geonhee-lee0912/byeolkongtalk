import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyKakaoAccessToken } from "./kakao-verify.ts";

const INFO = "https://kapi.kakao.com/v1/user/access_token_info";
const ME = "https://kapi.kakao.com/v2/user/me";
type Call = { url: string; auth: string | null; hasSignal: boolean };

function fakeFetch(responses: Record<string, { status: number; body: unknown }>, calls: Call[] = []) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization"), hasSignal: init?.signal instanceof AbortSignal });
    const r = responses[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  };
}

const OK_INFO = { status: 200, body: { id: 4123456789, app_id: 777 } };
const OK_ME = {
  status: 200,
  body: { id: 4123456789, kakao_account: { profile: { nickname: "별콩", profile_image_url: "https://k.kakaocdn.net/p.jpg" } } },
};

test("우리 앱 토큰이면 회원번호·닉네임·프로필 — 두 요청 모두 같은 토큰·타임아웃 신호로", async () => {
  const calls: Call[] = [];
  const r = await verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: OK_INFO, [ME]: OK_ME }, calls));
  assert.deepEqual(r, { ok: true, kakaoId: "4123456789", nickname: "별콩", profileImg: "https://k.kakaocdn.net/p.jpg" });
  assert.deepEqual(calls.map((c) => [c.url, c.auth, c.hasSignal]), [
    [INFO, "Bearer tok", true],
    [ME, "Bearer tok", true],
  ]);
});

test("다른 앱에서 발급된 토큰은 app_mismatch(받은 app_id 포함) — 사용자 정보는 묻지 않는다", async () => {
  const calls: Call[] = [];
  const r = await verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 200, body: { id: 1, app_id: 999 } } }, calls));
  assert.deepEqual(r, { ok: false, reason: "app_mismatch", appId: 999 });
  assert.equal(calls.length, 1);
});

test("앱 ID 설정 끝의 공백·개행은 무시한다", async () => {
  const r = await verifyKakaoAccessToken("tok", "777\n", fakeFetch({ [INFO]: OK_INFO, [ME]: OK_ME }));
  assert.equal(r.ok, true);
});

test("카카오가 401·-2 로 거절하면 token_invalid — 본문이 그럴듯해도 상태 코드를 본다", async () => {
  assert.deepEqual(
    await verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 401, body: { code: -401, id: 4123456789, app_id: 777 } } })),
    { ok: false, reason: "token_invalid" },
  );
  assert.deepEqual(
    await verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 400, body: { code: -2 } } })),
    { ok: false, reason: "token_invalid" },
  );
  assert.deepEqual(
    await verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: OK_INFO, [ME]: { status: 401, body: { code: -401 } } })),
    { ok: false, reason: "token_invalid" },
  );
});

test("카카오 쪽 장애(-1·-7·-10 은 400, 5xx)·이상한 응답·네트워크 오류는 throw — 라우트가 500 + 오류 로그", async () => {
  for (const body of [{ code: -1 }, { code: -7 }, { code: -10 }]) {
    await assert.rejects(verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 400, body } })));
  }
  await assert.rejects(verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 503, body: { code: -9798 } } })));
  await assert.rejects(verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 200, body: "{broken" } })));
  await assert.rejects(verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: { status: 200, body: { id: 1 } } })));
  await assert.rejects(verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: OK_INFO, [ME]: { status: 200, body: { id: "x" } } })));
  await assert.rejects(
    verifyKakaoAccessToken("tok", "777", async () => {
      throw new TypeError("fetch failed");
    }),
  );
});

test("두 응답의 회원번호가 다르면 throw(응답이 섞였다)", async () => {
  await assert.rejects(verifyKakaoAccessToken("tok", "777", fakeFetch({ [INFO]: OK_INFO, [ME]: { status: 200, body: { id: 2 } } })));
});

test("닉네임이 없거나 빈 문자열이면 별콩이_{회원번호}(기존 웹 콜백과 같은 규칙)", async () => {
  for (const kakao_account of [undefined, { profile: { nickname: "" } }]) {
    const r = await verifyKakaoAccessToken(
      "tok",
      "777",
      fakeFetch({ [INFO]: { status: 200, body: { id: 5, app_id: 777 } }, [ME]: { status: 200, body: { id: 5, kakao_account } } }),
    );
    assert.deepEqual(r, { ok: true, kakaoId: "5", nickname: "별콩이_5", profileImg: null });
  }
});

test("헤더에 못 싣거나 지나치게 긴 토큰은 카카오에 묻지 않고 token_invalid, 앱 ID 가 숫자가 아니면 throw", async () => {
  const calls: Call[] = [];
  const f = fakeFetch({}, calls);
  for (const bad of ["", "a b", "abc\r\nX-Evil: 1", "한글", "x".repeat(2049)]) {
    assert.deepEqual(await verifyKakaoAccessToken(bad, "777", f), { ok: false, reason: "token_invalid" });
  }
  await assert.rejects(verifyKakaoAccessToken("tok", "", f));
  await assert.rejects(verifyKakaoAccessToken("tok", "undefined", f));
  assert.equal(calls.length, 0);
});
