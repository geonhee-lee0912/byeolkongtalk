import { test } from "node:test";
import assert from "node:assert/strict";
import { hideTrailingSendMarker } from "./sim-stream.ts";

test("완성된 [SEND:...] 마커는 화면에서 제거(디브리핑은 JSON 이지만 방어적)", () => {
  assert.equal(hideTrailingSendMarker("오늘 잘했어.\n[SEND:연락해봐]"), "오늘 잘했어.");
});

test("스트리밍 중 꼬리가 부분 마커면 그 지점부터 숨김(깜빡임 방지)", () => {
  assert.equal(hideTrailingSendMarker("오늘 잘했어.\n[SE"), "오늘 잘했어.");
  assert.equal(hideTrailingSendMarker("오늘 잘했어.\n[SEND:연락"), "오늘 잘했어.");
});

test("마커 없으면 원문 그대로(뒤 공백만 정리)", () => {
  assert.equal(hideTrailingSendMarker("그냥 대화"), "그냥 대화");
  assert.equal(hideTrailingSendMarker("대괄호 [진짜 대화] 는 건드리지 않음"), "대괄호 [진짜 대화] 는 건드리지 않음");
});
