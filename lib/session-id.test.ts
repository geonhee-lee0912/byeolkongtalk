import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSessionId } from "./session-id.ts";

// 서명 없는 세션 쿠키(byeolkong_user_id)의 형식 검증.
// users.id·anon id 는 전부 UUID → 형식 밖 값은 위조/주입이므로 거른다.

test("정상 UUID 는 통과", () => {
  assert.equal(isValidSessionId("3f2a1b4c-0d9e-4a1b-8c2d-1234567890ab"), true);
});

test("대문자 UUID 도 통과(대소문자 무시)", () => {
  assert.equal(isValidSessionId("3F2A1B4C-0D9E-4A1B-8C2D-1234567890AB"), true);
});

test("QA/E2E 주입 센티넬 11111111-… 도 통과", () => {
  assert.equal(isValidSessionId("11111111-1111-4111-8111-111111111111"), true);
});

test("PostgREST 필터 메타문자가 든 값은 거부 (주입 차단)", () => {
  // .or(`target_user_id.eq.${userId},...`) 에 보간되면 필터 식을 바꿀 수 있는 입력들
  assert.equal(isValidSessionId("x,target_user_id.is.null"), false);
  assert.equal(isValidSessionId("00000000-0000-0000-0000-000000000000,x.is.null"), false);
  assert.equal(isValidSessionId("(or(a.eq.1))"), false);
});

test("형식이 틀린 값 거부", () => {
  assert.equal(isValidSessionId("not-a-uuid"), false);
  assert.equal(isValidSessionId("3f2a1b4c0d9e4a1b8c2d1234567890ab"), false); // 하이픈 없음
  assert.equal(isValidSessionId("3f2a1b4c-0d9e-4a1b-8c2d-1234567890ab-extra"), false);
  assert.equal(isValidSessionId(" 3f2a1b4c-0d9e-4a1b-8c2d-1234567890ab"), false); // 앞 공백
  assert.equal(isValidSessionId("zzzzzzzz-0d9e-4a1b-8c2d-1234567890ab"), false); // 비-hex
});

test("빈 값·null·undefined 거부", () => {
  assert.equal(isValidSessionId(""), false);
  assert.equal(isValidSessionId(null), false);
  assert.equal(isValidSessionId(undefined), false);
});
