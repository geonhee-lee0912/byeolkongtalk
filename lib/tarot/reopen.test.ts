import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveAbsTurnCap,
  isEndedAtAbsCap,
  reopenOptions,
  stripTrailingEnd,
  stripEndFromLastAssistant,
  tarotEndState,
} from "./reopen.ts";
import { loadTarotEndState, type ReopenReadingRow } from "./reopen-server.ts";

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

// ── tarotEndState — 투카드(기본 강제 종료선 12). 답 i 는 "답 i", 마지막 답만 끝 문구를 갈아 끼운다 ──
const turns = (n: number, last: string): string[] => [
  ...Array.from({ length: n - 1 }, (_, i) => `답 ${i + 1}`),
  last,
];
const CLOSE = "끝 인사야.\n\n[END]";

test("tarotEndState — 강제 종료선에서 끝 [END] 로 닫혔으면 재개 대상(공백·개행이 남아도, 연장 뒤 다시 닫혀도)", () => {
  assert.deepEqual(tarotEndState(turns(12, CLOSE), "two_card", 0, 0), { ended: true, endedAtAbsCap: true });
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야.\n\n[END]\n"), "two_card", 0, 0), {
    ended: true,
    endedAtAbsCap: true,
  });
  // 연장 1회(+4턴) 뒤 새 선(16)에서 다시 닫힌 대화 — 남은 상품(보조 카드)용으로 다시 재개 대상
  assert.deepEqual(tarotEndState(turns(16, CLOSE), "two_card", 4, 0), { ended: true, endedAtAbsCap: true });
});

test("tarotEndState — 구매 반영 후 값을 넘기면 유효 강제 종료선이 올라가 재개 자격이 조용히 꺼진다(함정 문서화)", () => {
  // 라우트는 CAS·차감 전에 읽은 값을 넘겨야 한다. 연장 후(extra 4 → 16)·보조 카드 후(clarifier 1 → 14)엔 12턴이 '선 아래'다.
  assert.deepEqual(tarotEndState(turns(12, CLOSE), "two_card", 4, 0), { ended: true, endedAtAbsCap: false });
  assert.deepEqual(tarotEndState(turns(12, CLOSE), "two_card", 0, 1), { ended: true, endedAtAbsCap: false });
});

test("tarotEndState — 끝 [END] 뒤에 다른 글자가 붙으면 strip 이 못 지우니 재개 대상이 아니다(차감 전에 막는다)", () => {
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야.\n[END]\n[RECO:continue]"), "two_card", 0, 0), {
    ended: true,
    endedAtAbsCap: false,
  });
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야. [END]."), "two_card", 0, 0), {
    ended: true,
    endedAtAbsCap: false,
  });
});

test("tarotEndState — [END] 가 둘 이상이면(같은 메시지·앞선 메시지) 끝 것만 지워도 닫힌 채라 재개 대상이 아니다", () => {
  assert.deepEqual(tarotEndState(turns(12, "a [END] b\n\n[END]"), "two_card", 0, 0), {
    ended: true,
    endedAtAbsCap: false,
  });
  const earlier = turns(12, CLOSE);
  earlier[3] = "중간 마무리 [END]";
  assert.deepEqual(tarotEndState(earlier, "two_card", 0, 0), { ended: true, endedAtAbsCap: false });
});

test("tarotEndState — 타로가 아니거나(null)·모르는 스프레드면 ended 만 true", () => {
  assert.deepEqual(tarotEndState(turns(12, CLOSE), null, 0, 0), { ended: true, endedAtAbsCap: false });
  assert.deepEqual(tarotEndState(turns(12, CLOSE), "legacy_spread", 0, 0), { ended: true, endedAtAbsCap: false });
});

test("tarotEndState — 강제 종료선 전에 닫힌(자연 마무리) 대화 · [END] 없는 대화 · 빈 대화", () => {
  assert.deepEqual(tarotEndState(turns(9, CLOSE), "two_card", 0, 0), { ended: true, endedAtAbsCap: false });
  assert.deepEqual(tarotEndState(turns(12, "그냥 답이야."), "two_card", 0, 0), {
    ended: false,
    endedAtAbsCap: false,
  });
  assert.deepEqual(tarotEndState([], "two_card", 0, 0), { ended: false, endedAtAbsCap: false });
});

// ── loadTarotEndState — loadTarotEndState 가 쓰는 체인(from → select → eq → eq → order)만 흉내 낸 가짜 service client ──
type FakeResult = { data: { id: string; content: string }[] | null; error: unknown };
function fakeMessages(result: FakeResult) {
  type Chain = {
    select: () => Chain;
    eq: (col: string, val: unknown) => Chain;
    order: () => Promise<FakeResult>;
  };
  const eqs: [string, unknown][] = [];
  const chain: Chain = {
    select: () => chain,
    eq: (col, val) => {
      eqs.push([col, val]);
      return chain;
    },
    order: () => Promise.resolve(result),
  };
  return {
    eqs,
    client: { from: () => chain } as unknown as Parameters<typeof loadTarotEndState>[0],
  };
}
const READING: ReopenReadingRow = {
  id: "r1",
  consultation_type: "tarot",
  spread_type: "two_card",
  extra_turns: 0,
  clarifier_count: 0,
};
const rows12 = turns(12, CLOSE).map((content, i) => ({ id: `m${i + 1}`, content }));

test("loadTarotEndState — 조회가 실패하면 state 없이 error 를 돌려준다(라우트가 차감 전에 500 으로 끊는 근거)", async () => {
  const boom = new Error("db down");
  const { client } = fakeMessages({ data: null, error: boom });
  const out = await loadTarotEndState(client, READING);
  assert.equal(out.state, null);
  assert.equal(out.error, boom);
});

test("loadTarotEndState — 이 리딩의 assistant 메시지로 판정하고 마지막 메시지를 돌려준다", async () => {
  const { client, eqs } = fakeMessages({ data: rows12, error: null });
  const out = await loadTarotEndState(client, READING);
  assert.deepEqual(eqs, [
    ["reading_id", "r1"],
    ["role", "assistant"],
  ]);
  assert.equal(out.error, null);
  assert.deepEqual(out.state, {
    ended: true,
    endedAtAbsCap: true,
    lastAssistant: { id: "m12", content: CLOSE },
  });
});

test("loadTarotEndState — 타로가 아니면 spread_type 이 있어도 endedAtAbsCap=false · null 카운트는 0 으로", async () => {
  const { client } = fakeMessages({ data: rows12, error: null });
  const notTarot = await loadTarotEndState(client, { ...READING, consultation_type: "saju" });
  assert.deepEqual(notTarot.state?.endedAtAbsCap, false);
  assert.deepEqual(notTarot.state?.ended, true);
  const nullCounts = await loadTarotEndState(client, { ...READING, extra_turns: null, clarifier_count: null });
  assert.deepEqual(nullCounts.state?.endedAtAbsCap, true);
});

test("loadTarotEndState — 메시지가 없으면 lastAssistant 는 null", async () => {
  const { client } = fakeMessages({ data: [], error: null });
  const out = await loadTarotEndState(client, READING);
  assert.deepEqual(out.state, { ended: false, endedAtAbsCap: false, lastAssistant: null });
});
