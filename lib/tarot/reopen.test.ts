import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveAbsTurnCap,
  isEndedAtAbsCap,
  reopenOptions,
  stripTrailingEnd,
  stripEndFromLastAssistant,
} from "./reopen.ts";

test("effectiveAbsTurnCap — 기본 + 연장 턴 + 보조 카드×2", () => {
  assert.equal(effectiveAbsTurnCap("two_card", 0, 0), 12);
  assert.equal(effectiveAbsTurnCap("two_card", 4, 1), 18);
});

test("effectiveAbsTurnCap — 모르는 스프레드는 무한대(재개 대상 아님)", () => {
  assert.equal(effectiveAbsTurnCap("legacy_spread", 0, 0), Number.POSITIVE_INFINITY);
});

test("isEndedAtAbsCap — 끝났고 턴 수가 유효 강제 종료선 이상일 때만", () => {
  assert.equal(isEndedAtAbsCap({ ended: true, assistantTurns: 12, effAbsTurnCap: 12 }), true);
  assert.equal(isEndedAtAbsCap({ ended: true, assistantTurns: 9, effAbsTurnCap: 12 }), false);
  assert.equal(isEndedAtAbsCap({ ended: false, assistantTurns: 12, effAbsTurnCap: 12 }), false);
});

test("reopenOptions — 강제 종료 + 비위기 + 한도 여유면 둘 다 true", () => {
  assert.deepEqual(
    reopenOptions({ endedAtAbsCap: true, hasSensitive: false, extraTurns: 0, clarifierCount: 0 }),
    { extend: true, clarifier: true },
  );
});

test("reopenOptions — 한도 소진·위기·강제 종료 아님", () => {
  assert.deepEqual(
    reopenOptions({ endedAtAbsCap: true, hasSensitive: false, extraTurns: 4, clarifierCount: 2 }),
    { extend: false, clarifier: false },
  );
  assert.deepEqual(
    reopenOptions({ endedAtAbsCap: true, hasSensitive: true, extraTurns: 0, clarifierCount: 0 }),
    { extend: false, clarifier: false },
  );
  assert.deepEqual(
    reopenOptions({ endedAtAbsCap: false, hasSensitive: false, extraTurns: 0, clarifierCount: 0 }),
    { extend: false, clarifier: false },
  );
});

test("stripTrailingEnd — 끝 [END] 만 지운다", () => {
  assert.equal(stripTrailingEnd("마무리 인사야.\n\n[END]"), "마무리 인사야.");
  assert.equal(stripTrailingEnd("[END] 가 중간에 있으면 그대로"), "[END] 가 중간에 있으면 그대로");
});

test("stripEndFromLastAssistant — 마지막 assistant 메시지만 정리", () => {
  const msgs = [
    { role: "assistant" as const, content: "첫 답" },
    { role: "user" as const, content: "질문" },
    { role: "assistant" as const, content: "끝 인사\n\n[END]" },
  ];
  const out = stripEndFromLastAssistant(msgs);
  assert.equal(out[2].content, "끝 인사");
  assert.equal(out[0].content, "첫 답");
});

test("stripTrailingEnd — [END] 앞뒤 공백·개행까지 지우고, [END] 가 없으면 본문을 건드리지 않는다", () => {
  assert.equal(stripTrailingEnd("마무리 인사야.\n\n[END]\n"), "마무리 인사야.");
  assert.equal(stripTrailingEnd("마무리 인사야. [END]  "), "마무리 인사야.");
  assert.equal(stripTrailingEnd("마무리 인사야.\n"), "마무리 인사야.\n");
});

test("reopenOptions — 한쪽 한도만 소진돼도 다른 쪽은 열려 있다", () => {
  assert.deepEqual(
    reopenOptions({ endedAtAbsCap: true, hasSensitive: false, extraTurns: 4, clarifierCount: 0 }),
    { extend: false, clarifier: true },
  );
  assert.deepEqual(
    reopenOptions({ endedAtAbsCap: true, hasSensitive: false, extraTurns: 0, clarifierCount: 2 }),
    { extend: true, clarifier: false },
  );
});

test("stripEndFromLastAssistant — 끝에 user 메시지가 있어도 마지막 assistant 만 고르고, 원본은 바꾸지 않는다", () => {
  const msgs = [
    { role: "assistant" as const, content: "끝 인사\n\n[END]" },
    { role: "user" as const, content: "질문 [END]" },
  ];
  const out = stripEndFromLastAssistant(msgs);
  assert.equal(out[0].content, "끝 인사");
  assert.equal(out[1].content, "질문 [END]"); // user 메시지는 손대지 않는다
  assert.equal(msgs[0].content, "끝 인사\n\n[END]"); // 원본 불변 — React 상태를 그대로 넘긴다
  assert.notEqual(out, msgs);
});

test("stripEndFromLastAssistant — assistant 메시지가 없으면 그대로", () => {
  assert.deepEqual(stripEndFromLastAssistant([]), []);
  const onlyUser = [{ role: "user" as const, content: "안녕 [END]" }];
  assert.deepEqual(stripEndFromLastAssistant(onlyUser), onlyUser);
});
