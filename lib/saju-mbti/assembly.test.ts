import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju } from "@/lib/saju/calc";
import { paljaType } from "./mapping.ts";
import { selfType } from "./self-type.ts";
import { matchRate } from "./match.ts";
import { TYPE_CONTENT, MATCH_NARRATIVE } from "./content.ts";
import { QUESTIONS } from "./questions.ts";

test("assembly — 골든 사주 + 첫선택지 답안 → 유효 결과 전개", () => {
  const saju = calcSaju({ year: 1992, month: 9, day: 12, hour: 13, minute: 47, gender: "other" });
  const palja = paljaType(saju);
  assert.equal(palja.code, "음강인단"); // A 골든

  const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options[0].id]));
  const self = selfType(answers);
  assert.equal(self.code, "양강재생"); // B 계약

  const match = matchRate(self.axes, palja.axes); // ★ .axes
  assert.ok(match.matchCount >= 0 && match.matchCount <= 4);
  assert.equal(match.perAxis.length, 4);
  assert.ok(["천명", "절충", "거스름"].includes(match.band));

  assert.ok(TYPE_CONTENT[palja.code], "팔자 content 존재");
  assert.ok(TYPE_CONTENT[self.code], "자아 content 존재");
  assert.ok(MATCH_NARRATIVE[match.band].title, "밴드 서사 존재");
});
