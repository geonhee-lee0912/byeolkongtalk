import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyKakaoAccessToken } from "./kakao-verify.ts";

const INFO = "https://kapi.kakao.com/v1/user/access_token_info";
const ME = "https://kapi.kakao.com/v2/user/me";
type Call = { url: string; auth: string | null };

function fakeFetch(responses: Record<string, { status: number; body: unknown }>, calls: Call[] = []) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    const r = responses[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
}

test("우리 앱 토큰이면 회원번호·닉네임·프로필을 돌려준다", async () => {
  const calls: Call[] = [];
  const f = fakeFetch(
    {
      [INFO]: { status: 200, body: { id: 4123456789, app_id: 777 } },
      [ME]: {
        status: 200,
        body: { id: 4123456789, kakao_account: { profile: { nickname: "별콩", profile_image_url: "https://k.kakaocdn.net/p.jpg" } } },
      },
    },
    calls,
  );
  assert.deepEqual(await verifyKakaoAccessToken("tok", "777", f), {
    kakaoId: "4123456789",
    nickname: "별콩",
    profileImg: "https://k.kakaocdn.net/p.jpg",
  });
  assert.equal(calls[0].auth, "Bearer tok");
});

test("다른 앱에서 발급된 토큰은 거절한다", async () => {
  const f = fakeFetch({ [INFO]: { status: 200, body: { id: 1, app_id: 999 } } });
  assert.equal(await verifyKakaoAccessToken("tok", "777", f), null);
});

test("토큰 정보 조회가 실패하면 거절한다", async () => {
  const f = fakeFetch({ [INFO]: { status: 401, body: { code: -401 } } });
  assert.equal(await verifyKakaoAccessToken("tok", "777", f), null);
});

test("사용자 정보의 회원번호가 토큰 정보와 다르면 거절한다", async () => {
  const f = fakeFetch({
    [INFO]: { status: 200, body: { id: 1, app_id: 777 } },
    [ME]: { status: 200, body: { id: 2 } },
  });
  assert.equal(await verifyKakaoAccessToken("tok", "777", f), null);
});

test("닉네임이 없으면 별콩이_{회원번호}(기존 웹 콜백과 같은 규칙)", async () => {
  const f = fakeFetch({
    [INFO]: { status: 200, body: { id: 5, app_id: 777 } },
    [ME]: { status: 200, body: { id: 5 } },
  });
  assert.deepEqual(await verifyKakaoAccessToken("tok", "777", f), { kakaoId: "5", nickname: "별콩이_5", profileImg: null });
});

test("빈 토큰·빈 앱 ID 는 호출 없이 거절한다", async () => {
  const calls: Call[] = [];
  const f = fakeFetch({}, calls);
  assert.equal(await verifyKakaoAccessToken("", "777", f), null);
  assert.equal(await verifyKakaoAccessToken("tok", "", f), null);
  assert.equal(calls.length, 0);
});
