// lib/relationship/memory.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitThreadMessages, RECENT_MSGS, SUMMARY_TRIGGER, buildRelationshipFileBlock } from "./memory.ts";

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
  role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: `m${i}`,
}));

test("짧은 스레드 — 전부 최근창, 요약 없음", () => {
  const r = splitThreadMessages(mk(10), 0);
  assert.equal(r.apiMessages.length, 10);
  assert.deepEqual(r.toSummarize, []);
  assert.equal(r.newSummarizedCount, 0);
});

test("최근창 유지 + 트리거 미달이면 요약 안 함", () => {
  const total = RECENT_MSGS + SUMMARY_TRIGGER - 2; // 짝수 — user-start shift 영향 없이 트리거 직전
  const r = splitThreadMessages(mk(total), 0);
  assert.ok(r.apiMessages.length <= RECENT_MSGS);
  assert.equal(r.apiMessages[0].role, "user");
  assert.deepEqual(r.toSummarize, []);
});

test("최근창은 항상 user 발화로 시작 (Anthropic 첫 메시지 규칙)", () => {
  // 실제 스레드 = past(짝수) + 새 user = 홀수 → slice가 assistant에서 시작할 수 있음
  for (const total of [25, 41, RECENT_MSGS + SUMMARY_TRIGGER + 1]) {
    const r = splitThreadMessages(mk(total), 0);
    assert.equal(r.apiMessages[0].role, "user", `total=${total}`);
  }
});

test("미요약 older가 트리거 도달 → 델타 요약 + 카운트 전진", () => {
  const total = RECENT_MSGS + SUMMARY_TRIGGER;
  const r = splitThreadMessages(mk(total), 0);
  assert.equal(r.apiMessages.length, RECENT_MSGS);
  assert.equal(r.toSummarize.length, SUMMARY_TRIGGER);
  assert.equal(r.newSummarizedCount, SUMMARY_TRIGGER);
});

test("이미 요약된 older는 재요약 안 함", () => {
  const total = RECENT_MSGS + SUMMARY_TRIGGER + 5;
  const r = splitThreadMessages(mk(total), SUMMARY_TRIGGER); // 앞 TRIGGER개 이미 요약
  assert.equal(r.toSummarize.length, 0); // 미요약 older=5 < TRIGGER
});

test("파일 블록 — 호칭/관계/처방 포함", () => {
  const b = buildRelationshipFileBlock(
    { label: "그이", status: "dating", hasSelfBirth: true, hasPartnerBirth: false,
      memo: { prescriptions: [{ text: "먼저 연락해보기", created_at: "x" }] } },
    "지난주 다툼 얘기를 나눴다."
  );
  assert.match(b, /그이/); assert.match(b, /연애 중/);
  assert.match(b, /먼저 연락해보기/); assert.match(b, /지난 대화 요약/);
});
