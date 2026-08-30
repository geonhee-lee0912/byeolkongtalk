import { test } from "node:test";
import assert from "node:assert/strict";
import { pickExistingReadingId } from "./existing-lookup.ts";

const row = (id: string, profile_id: string | null, saju_data: unknown = null) => ({
  id,
  profile_id,
  saju_data,
  created_at: "",
});

test("단일 프로필: profile_id 일치 시 최신 리딩 id, 없으면 null", () => {
  const rows = [row("r2", "pB"), row("r1", "pA")]; // 최신순 입력
  assert.equal(pickExistingReadingId(rows, { emotionTag: "x", profileId: "pA" }), "r1");
  assert.equal(pickExistingReadingId(rows, { emotionTag: "x", profileId: "pC" }), null);
});

test("궁합: 두 프로필 순서 무관 매칭", () => {
  const rows = [row("c1", "pA", { aId: "pA", bId: "pB" })];
  assert.equal(pickExistingReadingId(rows, { emotionTag: "x", compatPair: { aId: "pA", bId: "pB" } }), "c1");
  assert.equal(pickExistingReadingId(rows, { emotionTag: "x", compatPair: { aId: "pB", bId: "pA" } }), "c1");
  assert.equal(pickExistingReadingId(rows, { emotionTag: "x", compatPair: { aId: "pA", bId: "pC" } }), null);
});

test("궁합: saju_data 에 id 없으면(레거시 행) 매칭 안 됨", () => {
  const rows = [row("c1", "pA", { names: { a: "가", b: "나" } })];
  assert.equal(pickExistingReadingId(rows, { emotionTag: "x", compatPair: { aId: "pA", bId: "pB" } }), null);
});
