// qa/simulator.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSimEvent, buildSimSystemPrompt } from "./simulator.ts";
import type { Case } from "./types.ts";

const baseCase: Case = {
  id: "x",
  product: { kind: "saju", sajuProduct: "today_letters" },
  emotion: "진로·방향이 고민이야",
  seed: {},
  seedConcern: "이직할지 고민이야",
  userPersona: "확답을 강하게 요구하는 사람",
  inputStyle: { tone: "반말, 오타 잦음", habits: ["burst"] },
  maxTurns: 4,
  expects: { mustEnd: true, expectSensitiveHeader: false },
};

test("parseSimEvent: say", () => {
  assert.deepEqual(parseSimEvent('{"type":"say","text":"안녕"}'), {
    type: "say",
    text: "안녕",
  });
});

test("parseSimEvent: 코드펜스 감싸도 파싱", () => {
  const ev = parseSimEvent('```json\n{"type":"stop"}\n```');
  assert.deepEqual(ev, { type: "stop" });
});

test("parseSimEvent: burst texts 배열", () => {
  const ev = parseSimEvent('{"type":"burst","texts":["나","요즘","힘들어"]}');
  assert.deepEqual(ev, { type: "burst", texts: ["나", "요즘", "힘들어"] });
});

test("parseSimEvent: 깨진 JSON이면 fallback stop", () => {
  assert.deepEqual(parseSimEvent("쓰레기"), { type: "stop" });
});

test("buildSimSystemPrompt: 페르소나/말투/습관 주입", () => {
  const p = buildSimSystemPrompt(baseCase);
  assert.ok(p.includes("확답을 강하게 요구하는 사람"));
  assert.ok(p.includes("반말, 오타 잦음"));
  assert.ok(p.includes("burst"));
  assert.ok(p.includes("이직할지 고민이야"));
});
