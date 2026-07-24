// lib/relationship/skills.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RELATIONSHIP_SKILLS, getSkill, listActiveSkills, buildSkillRecapText } from "./skills.ts";

test("v1 스킬 4종 + 가격/kind", () => {
  assert.equal(getSkill("checkin")?.starCost, 45);
  assert.equal(getSkill("deep_feelings")?.kind, "tarot_draw");
  assert.equal(getSkill("compat")?.requiresPartnerBirth, true);
  assert.equal(getSkill("verdict")?.kind, "dialogue");
  assert.equal(getSkill("nope"), null);
});

test("tarot_draw 스킬은 spread 필수", () => {
  for (const s of RELATIONSHIP_SKILLS.filter((x) => x.kind === "tarot_draw"))
    assert.ok(s.spread, `${s.key} needs spread`);
});

test("listActiveSkills = active만 order순", () => {
  const ks = listActiveSkills().map((s) => s.key);
  assert.deepEqual(ks, ["checkin", "deep_feelings", "compat", "verdict"]);
});

test("buildSkillRecapText — 라벨/이모지/요약 반영", () => {
  const t = buildSkillRecapText("compat", "케미 좋음");
  assert.ok(t.includes("우리 궁합"));
  assert.ok(t.includes("💑"));
  assert.ok(t.includes("케미 좋음"));
});

test("buildSkillRecapText — 미지 스킬/빈 요약 폴백", () => {
  const t = buildSkillRecapText("unknown", "");
  assert.ok(t.includes("스킬"));
  assert.ok(t.length > 0);
});
