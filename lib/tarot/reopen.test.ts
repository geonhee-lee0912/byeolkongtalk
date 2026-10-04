import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveAbsTurnCap,
  isEndedAtAbsCap,
  reopenOptions,
  stripTrailingEnd,
  stripEndFromLastAssistant,
  tarotEndState,
  type ReopenReadingRow,
} from "./reopen.ts";
import { loadTarotEndState, type LoadedTarotEndState } from "./reopen-server.ts";

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

test("stripEndFromLastAssistant(클라) — 마지막 assistant 메시지의 [END] 는 위치와 상관없이 전부 지운다", () => {
  const msgs = [
    { role: "assistant" as const, content: "첫 답 [END]" },
    { role: "user" as const, content: "질문" },
    { role: "assistant" as const, content: "a [END] b\n\n[END]" },
  ];
  const out = stripEndFromLastAssistant(msgs);
  // 서버 저장본은 정규화돼 있어도 클라가 스트리밍으로 들고 있는 사본엔 본문 중간 [END] 가 남을 수 있다 — 하나라도 남으면 클라가 다시 닫힌 걸로 본다
  assert.doesNotMatch(out[2].content, /\[END\]/i);
  assert.equal(out[2].content.replace(/\s+/g, " "), "a b"); // 본문은 그대로, 끝 공백만 다듬는다
  assert.equal(out[0].content, "첫 답 [END]"); // 마지막 assistant 만 손댄다
  assert.equal(msgs[2].content, "a [END] b\n\n[END]"); // 원본 불변
});

test("stripEndFromLastAssistant(클라) — 소문자·혼합 대소문자 [END] 도 지운다(클라 감지가 대소문자 무시)", () => {
  const out = stripEndFromLastAssistant([{ role: "assistant" as const, content: "x [end] y\n[End]\n" }]);
  assert.doesNotMatch(out[0].content, /\[END\]/i);
  assert.equal(out[0].content.replace(/\s+/g, " "), "x y");
});

// ── tarotEndState — 투카드(기본 강제 종료선 12). 답 i 는 "답 i", 마지막 답만 끝 문구를 갈아 끼운다 ──
const turns = (n: number, last: string): string[] => [
  ...Array.from({ length: n - 1 }, (_, i) => `답 ${i + 1}`),
  last,
];
const CLOSE = "끝 인사야.\n\n[END]";
/** 구매 전 readings 행(투카드) — over 로 필드만 바꿔 쓴다 */
const row = (over: Partial<ReopenReadingRow> = {}): ReopenReadingRow => ({
  id: "r1",
  consultation_type: "tarot",
  spread_type: "two_card",
  extra_turns: 0,
  clarifier_count: 0,
  ...over,
});
const READING = row();

test("tarotEndState — 강제 종료선에서 끝 [END] 로 닫혔으면 재개 대상(공백·개행이 남아도, 연장 뒤 다시 닫혀도)", () => {
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row()), { ended: true, endedAtAbsCap: true });
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야.\n\n[END]\n"), row()), {
    ended: true,
    endedAtAbsCap: true,
  });
  // 연장 1회(+4턴) 뒤 새 선(16)에서 다시 닫힌 대화 — 남은 상품(보조 카드)용으로 다시 재개 대상
  assert.deepEqual(tarotEndState(turns(16, CLOSE), row({ extra_turns: 4 })), {
    ended: true,
    endedAtAbsCap: true,
  });
});

test("tarotEndState — 구매 반영 후 행을 넘기면 유효 강제 종료선이 올라가 재개 자격이 조용히 꺼진다(함정 문서화)", () => {
  // 라우트는 CAS·차감 전에 읽은 행을 넘겨야 한다. 연장 후(extra 4 → 16)·보조 카드 후(clarifier 1 → 14)엔 12턴이 '선 아래'다.
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ extra_turns: 4 })), {
    ended: true,
    endedAtAbsCap: false,
  });
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ clarifier_count: 1 })), {
    ended: true,
    endedAtAbsCap: false,
  });
});

test("tarotEndState — 끝 [END] 뒤에 다른 글자가 붙으면 strip 이 못 지우니 재개 대상이 아니다(차감 전에 막는다)", () => {
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야.\n[END]\n[RECO:continue]"), row()), {
    ended: true,
    endedAtAbsCap: false,
  });
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야. [END]."), row()), {
    ended: true,
    endedAtAbsCap: false,
  });
});

test("tarotEndState — [END] 가 둘 이상이면(같은 메시지·앞선 메시지) 끝 것만 지워도 닫힌 채라 재개 대상이 아니다", () => {
  assert.deepEqual(tarotEndState(turns(12, "a [END] b\n\n[END]"), row()), {
    ended: true,
    endedAtAbsCap: false,
  });
  const earlier = turns(12, CLOSE);
  earlier[3] = "중간 마무리 [END]";
  assert.deepEqual(tarotEndState(earlier, row()), { ended: true, endedAtAbsCap: false });
});

test("tarotEndState — 소문자 [end] 가 남아도 재개 대상이 아니다(클라는 대소문자 무시로 감지해 새로고침 때 다시 닫힌다)", () => {
  // 같은 메시지에 소문자·혼합 대소문자 — 끝 [END] 만 지워도 클라가 남은 것을 [END] 로 본다
  assert.deepEqual(tarotEndState(turns(12, "a [end] b\n\n[END]"), row()), {
    ended: true,
    endedAtAbsCap: false,
  });
  assert.deepEqual(tarotEndState(turns(12, "a [End] b\n\n[END]"), row()), {
    ended: true,
    endedAtAbsCap: false,
  });
  // 앞선 메시지에 소문자 [end]
  const earlier = turns(12, CLOSE);
  earlier[3] = "중간 마무리 [end]";
  assert.deepEqual(tarotEndState(earlier, row()), { ended: true, endedAtAbsCap: false });
});

test("tarotEndState — 타로가 아니거나(consultation_type)·스프레드가 없거나 모르면 ended 만 true", () => {
  const closed = { ended: true, endedAtAbsCap: false };
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ consultation_type: "saju" })), closed);
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ consultation_type: null })), closed);
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ spread_type: null })), closed);
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ spread_type: "legacy_spread" })), closed);
});

test("tarotEndState — 강제 종료선 전에 닫힌(자연 마무리) 대화 · [END] 없는 대화 · 빈 대화", () => {
  assert.deepEqual(tarotEndState(turns(9, CLOSE), row()), { ended: true, endedAtAbsCap: false });
  assert.deepEqual(tarotEndState(turns(12, "그냥 답이야."), row()), { ended: false, endedAtAbsCap: false });
  assert.deepEqual(tarotEndState([], row()), { ended: false, endedAtAbsCap: false });
});

test("tarotEndState — 연장·보조 카드 횟수가 null 이면 0 으로 센다", () => {
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ extra_turns: null, clarifier_count: null })), {
    ended: true,
    endedAtAbsCap: true,
  });
});

// ── loadTarotEndState — 쓰는 체인(from → select → eq → eq → order)만 흉내 낸 가짜 service client ──
type FakeResult = { data: { id: string; content: string }[] | null; error: unknown };
function fakeMessages(result: FakeResult) {
  type Chain = {
    select: () => Chain;
    eq: (col: string, val: unknown) => Chain;
    order: (col: string, opts: unknown) => Promise<FakeResult>;
  };
  const eqs: [string, unknown][] = [];
  const orders: [string, unknown][] = [];
  const chain: Chain = {
    select: () => chain,
    eq: (col, val) => {
      eqs.push([col, val]);
      return chain;
    },
    order: (col, opts) => {
      orders.push([col, opts]);
      return Promise.resolve(result);
    },
  };
  return {
    eqs,
    orders,
    client: { from: () => chain } as unknown as Parameters<typeof loadTarotEndState>[0],
  };
}
const rows12 = turns(12, CLOSE).map((content, i) => ({ id: `m${i + 1}`, content }));

test("loadTarotEndState — 조회가 실패하면 state 없이 error 를 돌려준다(라우트가 차감 전에 500 으로 끊는 근거)", async () => {
  const boom = new Error("db down");
  const { client } = fakeMessages({ data: null, error: boom });
  const out = await loadTarotEndState(client, READING);
  assert.equal(out.state, null);
  assert.equal(out.error, boom);
});

test("loadTarotEndState — 이 리딩의 assistant 메시지를 시간 오름차순으로 읽어 판정하고 마지막 메시지를 돌려준다", async () => {
  const { client, eqs, orders } = fakeMessages({ data: rows12, error: null });
  const out = await loadTarotEndState(client, READING);
  assert.deepEqual(eqs, [
    ["reading_id", "r1"],
    ["role", "assistant"],
  ]);
  // 정렬 방향이 뒤집히면 '마지막 메시지' 가 엉뚱한 행이 된다
  assert.deepEqual(orders, [["created_at", { ascending: true }]]);
  if (out.error) throw out.error;
  assert.deepEqual(out.state, {
    ended: true,
    endedAtAbsCap: true,
    lastAssistant: { id: "m12", content: CLOSE },
  });
});

test("loadTarotEndState — 행의 값으로 판정한다(타로 아님 · 구매 후 값이면 재개 자격 없음)", async () => {
  const { client } = fakeMessages({ data: rows12, error: null });
  const notTarot = await loadTarotEndState(client, { ...READING, consultation_type: "saju" });
  if (notTarot.error) throw notTarot.error;
  assert.equal(notTarot.state.ended, true);
  assert.equal(notTarot.state.endedAtAbsCap, false);
  const afterPurchase = await loadTarotEndState(client, { ...READING, extra_turns: 4 });
  if (afterPurchase.error) throw afterPurchase.error;
  assert.equal(afterPurchase.state.endedAtAbsCap, false);
});

test("loadTarotEndState — 메시지가 없으면 lastAssistant 는 null", async () => {
  const { client } = fakeMessages({ data: [], error: null });
  const out = await loadTarotEndState(client, READING);
  if (out.error) throw out.error;
  assert.deepEqual(out.state, { ended: false, endedAtAbsCap: false, lastAssistant: null });
});

test("loadTarotEndState — select 에서 빠진 컬럼(undefined)이 있으면 조회 전에 error 로 막는다(라우트가 차감 전에 500)", async () => {
  const { client, eqs } = fakeMessages({ data: rows12, error: null });
  // 라우트의 reading 은 untyped(any) 라 타입이 못 잡는다 — spread_type·clarifier_count 를 select 에서 빠뜨린 경우
  const partial = { id: "r1", consultation_type: "tarot", extra_turns: 0 } as unknown as ReopenReadingRow;
  const out = await loadTarotEndState(client, partial);
  assert.equal(out.state, null);
  assert.match(String(out.error), /reopen_row_missing_columns: spread_type, clarifier_count/);
  assert.deepEqual(eqs, []); // 조회 자체를 안 했다
});

test("loadTarotEndState — null 은 DB 값이라 빠진 컬럼이 아니다", async () => {
  const { client } = fakeMessages({ data: rows12, error: null });
  const out = await loadTarotEndState(client, {
    id: "r1",
    consultation_type: null,
    spread_type: null,
    extra_turns: null,
    clarifier_count: null,
  });
  if (out.error) throw out.error;
  assert.equal(out.state.endedAtAbsCap, false);
});

test("loadTarotEndState — 반환형이 판별 유니온이라 error 만 확인하면 state 가 non-null 로 좁혀진다(구조분해 포함, tsc 가 검증)", async () => {
  const { client } = fakeMessages({ data: rows12, error: null });

  const { state, error } = await loadTarotEndState(client, READING);
  // @ts-expect-error — error 를 확인하기 전엔 state 가 null 일 수 있어 non-null 로 쓸 수 없다
  const unchecked: LoadedTarotEndState = state;
  void unchecked;
  if (error) throw error;
  // 구조분해해도 error 확인만으로 좁혀진다. 이 줄이 컴파일 에러면 반환 유니온이 무너진 것 — 실패 쪽 error 를 unknown 으로 두면 안 좁혀진다
  const checked: LoadedTarotEndState = state;
  assert.equal(checked.endedAtAbsCap, true);

  const out = await loadTarotEndState(client, READING);
  if (out.error) throw out.error;
  const checkedWhole: LoadedTarotEndState = out.state; // 구조분해 안 한 형태도 동일
  assert.equal(checkedWhole.ended, true);
});
