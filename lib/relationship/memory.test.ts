// lib/relationship/memory.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitThreadMessages, RECENT_MSGS, SUMMARY_TRIGGER, buildRelationshipFileBlock, applySkillToMemo, appendSkillLog, cleanSummary, type ThreadMsg } from "./memory.ts";
import type { RelationshipMemo } from "./types.ts";

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

test("applySkillToMemo — skill_log 적립 + pending_skill_recap 세팅 + summary 정규화", () => {
  const out = applySkillToMemo({}, "compat", "r1", "  케미   좋음  ", "2026-07-23T00:00:00Z");
  assert.equal(out.skill_log?.length, 1);
  assert.equal(out.skill_log?.[0].skill, "compat");
  assert.equal(out.skill_log?.[0].reading_id, "r1");
  assert.equal(out.pending_skill_recap?.skill, "compat");
  assert.equal(out.pending_skill_recap?.summary, "케미 좋음");
  assert.equal(out.pending_skill_recap?.created_at, "2026-07-23T00:00:00Z");
});

test("applySkillToMemo — skill_log 최근 20개만 유지", () => {
  let memo: RelationshipMemo = {};
  for (let i = 0; i < 25; i++) memo = applySkillToMemo(memo, "verdict", `r${i}`, `s${i}`, "2026-07-23T00:00:00Z");
  assert.equal(memo.skill_log?.length, 20);
  assert.equal(memo.skill_log?.[0].reading_id, "r5"); // 앞 5개 잘림
});

test("cleanSummary — 짧은 요약은 그대로(공백 정규화만)", () => {
  assert.equal(cleanSummary("  케미   좋음  "), "케미 좋음");
});

test("cleanSummary — 긴 요약은 문장 경계에서 자름(단어 중간 금지)", () => {
  const long =
    "신금 일간인 나는 서늘하고 단단한 결단력을 가진 사람이고, 정화 일간인 상대는 따뜻하게 타오르며 사람을 밝히는 온기를 가진 사람이야. 원래 화가 금을 다루는 관계라 처음엔 서로 낯설 수 있지만, 정화는 신금을 억누르기보다 감싸안는 결이라 시간이 지날수록 편해져.";
  const out = cleanSummary(long);
  assert.ok(out.length <= 161, `too long: ${out.length}`);
  assert.ok(/[.!?…]$/.test(out), `must end on sentence boundary: ${out}`);
  assert.ok(!out.endsWith("억누르"), "must not cut mid-word");
});

test("appendSkillLog — skill_log에 적립하되 pending_skill_recap은 세팅하지 않음", () => {
  const out = appendSkillLog({}, "verdict", "r1", "너 40 : 상대 60 판정", "2026-07-24T00:00:00Z");
  assert.equal(out.skill_log?.length, 1);
  assert.equal(out.skill_log?.[0].skill, "verdict");
  assert.equal(out.skill_log?.[0].reading_id, "r1");
  assert.equal(out.pending_skill_recap, undefined); // 인-스레드 = 복귀 인사 없음
});

test("appendSkillLog — 기존 pending_skill_recap을 건드리지 않음(이동형 스킬 recap 보존)", () => {
  const prev: RelationshipMemo = {
    pending_skill_recap: { skill: "compat", summary: "s", created_at: "t" },
  };
  const out = appendSkillLog(prev, "verdict", "r1", "판정", "2026-07-24T00:00:00Z");
  assert.deepEqual(out.pending_skill_recap, prev.pending_skill_recap);
});

test("appendSkillLog — skill_log는 최근 20개로 제한", () => {
  let memo: RelationshipMemo = {};
  for (let i = 0; i < 25; i++) memo = appendSkillLog(memo, "verdict", `r${i}`, `s${i}`, `t${i}`);
  assert.equal(memo.skill_log?.length, 20);
  assert.equal(memo.skill_log?.[0].reading_id, "r5"); // 오래된 5개 밀려남
});

test("applySkillToMemo(이동형)는 여전히 pending_skill_recap을 세팅 — 회귀 가드", () => {
  const out = applySkillToMemo({}, "compat", "r1", "궁합 요약", "2026-07-24T00:00:00Z");
  assert.ok(out.pending_skill_recap); // 궁합·카드뽑기는 아직 이동형 → recap 유지
});

test("splitThreadMessages — 최근창 경계가 인접 assistant 쌍에 걸려도 user 로 시작", () => {
  const all: ThreadMsg[] = [];
  all.push({ role: "user", content: "u0" }, { role: "assistant", content: "a0" });
  // index 2,3 = 인접 assistant (RECENT_MSGS=24, all.length=26 → recentStart=2 가 여기 걸림)
  all.push({ role: "assistant", content: "lone-1" }, { role: "assistant", content: "lone-2" });
  for (let i = 0; i < 11; i++) all.push({ role: "user", content: `u${i}` }, { role: "assistant", content: `a${i}` });
  const split = splitThreadMessages(all, 0);
  assert.equal(split.apiMessages[0]?.role, "user"); // Anthropic 400 방지
});
