import { test } from "node:test";
import assert from "node:assert/strict";
import { splitStarBadge } from "./BadgePill.tsx";

// 가격 알약은 앱 전체가 '✦숫자'(별 그림 + 숫자) — 데이터는 '별 N' 글자로 오므로 그릴 때 나눈다(디자인 다듬기 운세 결과 ⑧ S2, 11-21)
test("splitStarBadge: '별 N' 은 숫자와 뒷말로 나눈다", () => {
  assert.deepEqual(splitStarBadge("별 10"), { cost: "10", rest: "" });
  assert.deepEqual(splitStarBadge("별 10부터"), { cost: "10", rest: "부터" });
});

test("splitStarBadge: 가격이 아닌 알약은 null(글자 그대로)", () => {
  for (const s of ["무료", "타로", "사주", "별마루", "별 다섯"]) assert.equal(splitStarBadge(s), null, s);
});
