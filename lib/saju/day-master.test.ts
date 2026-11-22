import { test } from "node:test";
import assert from "node:assert/strict";
import { dayMasterLine } from "./day-master.ts";

test("일간 한 줄 — 천간 10개 모두 있고, 단정적 예언 말투가 없다", () => {
  for (const s of ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"]) {
    const line = dayMasterLine(s);
    assert.ok(line && line.endsWith("결"), `${s}: ${line}`);
    assert.doesNotMatch(line!, /반드시|무조건|될 거야|생긴다/);
  }
});

test("모르는 글자면 null", () => {
  assert.equal(dayMasterLine("X"), null);
});
