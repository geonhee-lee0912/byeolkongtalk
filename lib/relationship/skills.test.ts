// lib/relationship/skills.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RELATIONSHIP_SKILLS, getSkill, listActiveSkills } from "./skills.ts";

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
