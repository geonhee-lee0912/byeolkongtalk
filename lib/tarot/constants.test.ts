import { test } from "node:test";
import assert from "node:assert/strict";
import { WRAP_THRESHOLDS } from "./constants.ts";

// 2026-10-04 +3턴 개편 계약 (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-1):
// convergeStart·자연 마무리선 +3턴/+1,440자(3턴×480), 강제 종료선(absTurnCap)은 불변.
// [convergeStartTurn, convergeStartChars, hardCapTurn, hardCapChars, absTurnCap]
const EXPECTED: Record<string, [number, number, number, number, number]> = {
  one_card: [6, 2840, 8, 3140, 11],
  two_card: [7, 3240, 9, 3640, 12],
  three_card: [9, 3640, 10, 4140, 13],
  relationship_5: [12, 8640, 13, 9140, 15],
  deep_feelings_5: [12, 8640, 13, 9140, 15],
  reunion_5: [12, 8640, 13, 9140, 15],
  new_love_5: [12, 8640, 13, 9140, 15],
  checkin_6: [14, 10140, 15, 10540, 17],
  stay_or_go_6: [14, 10140, 15, 10540, 17],
  readiness_6: [14, 10140, 15, 10540, 17],
  healing_6: [14, 10140, 15, 10540, 17],
  reunion_deep_7: [16, 11540, 17, 12040, 19],
  potential_7: [16, 11540, 17, 12040, 19],
  chakra_7: [16, 11540, 17, 12040, 19],
};

test("WRAP_THRESHOLDS — 2026-10-04 +3턴 표와 정확히 일치", () => {
  assert.deepEqual(Object.keys(WRAP_THRESHOLDS).sort(), Object.keys(EXPECTED).sort());
  for (const [k, expected] of Object.entries(EXPECTED)) {
    const t = WRAP_THRESHOLDS[k as keyof typeof WRAP_THRESHOLDS];
    assert.deepEqual(
      [t.convergeStartTurn, t.convergeStartChars, t.hardCapTurn, t.hardCapChars, t.absTurnCap],
      expected,
      k,
    );
  }
});

test("WRAP_THRESHOLDS — converge < 자연 마무리선 < 강제 종료선", () => {
  for (const [k, t] of Object.entries(WRAP_THRESHOLDS)) {
    assert.ok(t.convergeStartTurn < t.hardCapTurn, `${k} converge<hardCap`);
    assert.ok(t.hardCapTurn < t.absTurnCap, `${k} hardCap<abs`);
    assert.ok(t.convergeStartChars < t.hardCapChars, `${k} chars`);
  }
});
