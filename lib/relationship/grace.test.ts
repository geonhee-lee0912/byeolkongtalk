import { test } from "node:test";
import assert from "node:assert/strict";
import { grantSkillGrace, consumeSkillGrace } from "./memory.ts";
import { getSkill } from "./skills.ts";
import type { RelationshipMemo } from "./types.ts";

test("레지스트리 — 카드뽑기 스킬에 graceTurns 설정", () => {
  assert.equal(getSkill("checkin")?.graceTurns, 10);
  assert.equal(getSkill("deep_feelings")?.graceTurns, 8);
});

test("grantSkillGrace — 최초 적립", () => {
  const out = grantSkillGrace({}, "checkin", 10);
  assert.deepEqual(out.skill_grace, { key: "checkin", remaining: 10 });
});

test("grantSkillGrace — 잔여에 누적 가산 + key 는 최신 스킬로", () => {
  const memo: RelationshipMemo = { skill_grace: { key: "checkin", remaining: 3 } };
  const out = grantSkillGrace(memo, "deep_feelings", 8);
  assert.deepEqual(out.skill_grace, { key: "deep_feelings", remaining: 11 });
});

test("grantSkillGrace — turns 0 이하면 변화 없음", () => {
  assert.equal(grantSkillGrace({}, "compat", 0).skill_grace ?? null, null);
});

test("consumeSkillGrace — 1턴 감소", () => {
  const out = consumeSkillGrace({ skill_grace: { key: "checkin", remaining: 2 } });
  assert.deepEqual(out.skill_grace, { key: "checkin", remaining: 1 });
});

test("consumeSkillGrace — 마지막 턴 소진 시 null 전이", () => {
  const out = consumeSkillGrace({ skill_grace: { key: "checkin", remaining: 1 } });
  assert.equal(out.skill_grace, null);
});

test("consumeSkillGrace — 없으면 그대로", () => {
  assert.equal(consumeSkillGrace({}).skill_grace ?? null, null);
});
