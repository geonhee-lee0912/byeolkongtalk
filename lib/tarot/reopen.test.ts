import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveAbsTurnCap,
  isEndedAtAbsCap,
  isClarifierReopenTurn,
  reopenOptions,
  formatReopenHeader,
  parseReopenHeader,
  stripTrailingEnd,
  stripEndFromLastAssistant,
  tarotEndState,
  type ReopenOptions,
  type ReopenReadingRow,
} from "./reopen.ts";
import {
  claimTarotReopen,
  loadTarotEndState,
  reopenTarotReading,
  restoreTarotEnd,
  undoSlotAndRestore,
  type LoadedTarotEndState,
  type ReopenLog,
} from "./reopen-server.ts";

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
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row()), { ended: true, endedAtAbsCap: true, claimInProgress: false });
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야.\n\n[END]\n"), row()), {
    ended: true,
    endedAtAbsCap: true,
    claimInProgress: false,
  });
  // 연장 1회(+4턴) 뒤 새 선(16)에서 다시 닫힌 대화 — 남은 상품(보조 카드)용으로 다시 재개 대상
  assert.deepEqual(tarotEndState(turns(16, CLOSE), row({ extra_turns: 4 })), {
    ended: true,
    endedAtAbsCap: true,
    claimInProgress: false,
  });
});

test("tarotEndState — 구매 반영 후 행을 넘기면 유효 강제 종료선이 올라가 재개 자격이 조용히 꺼진다(함정 문서화)", () => {
  // 라우트는 CAS·차감 전에 읽은 행을 넘겨야 한다. 연장 후(extra 4 → 16)·보조 카드 후(clarifier 1 → 14)엔 12턴이 '선 아래'다.
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ extra_turns: 4 })), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ clarifier_count: 1 })), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
});

test("tarotEndState — 끝 [END] 뒤에 다른 글자가 붙으면 strip 이 못 지우니 재개 대상이 아니다(차감 전에 막는다)", () => {
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야.\n[END]\n[RECO:continue]"), row()), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
  assert.deepEqual(tarotEndState(turns(12, "끝 인사야. [END]."), row()), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
});

test("tarotEndState — [END] 가 둘 이상이면(같은 메시지·앞선 메시지) 끝 것만 지워도 닫힌 채라 재개 대상이 아니다", () => {
  assert.deepEqual(tarotEndState(turns(12, "a [END] b\n\n[END]"), row()), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
  const earlier = turns(12, CLOSE);
  earlier[3] = "중간 마무리 [END]";
  assert.deepEqual(tarotEndState(earlier, row()), { ended: true, endedAtAbsCap: false, claimInProgress: false });
});

test("tarotEndState — 소문자 [end] 가 남아도 재개 대상이 아니다(클라는 대소문자 무시로 감지해 새로고침 때 다시 닫힌다)", () => {
  // 같은 메시지에 소문자·혼합 대소문자 — 끝 [END] 만 지워도 클라가 남은 것을 [END] 로 본다
  assert.deepEqual(tarotEndState(turns(12, "a [end] b\n\n[END]"), row()), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
  assert.deepEqual(tarotEndState(turns(12, "a [End] b\n\n[END]"), row()), {
    ended: true,
    endedAtAbsCap: false,
    claimInProgress: false,
  });
  // 앞선 메시지에 소문자 [end]
  const earlier = turns(12, CLOSE);
  earlier[3] = "중간 마무리 [end]";
  assert.deepEqual(tarotEndState(earlier, row()), { ended: true, endedAtAbsCap: false, claimInProgress: false });
});

test("tarotEndState — 타로가 아니거나(consultation_type)·스프레드가 없거나 모르면 ended 만 true", () => {
  const closed = { ended: true, endedAtAbsCap: false, claimInProgress: false };
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ consultation_type: "saju" })), closed);
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ consultation_type: null })), closed);
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ spread_type: null })), closed);
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ spread_type: "legacy_spread" })), closed);
});

test("tarotEndState — 강제 종료선 전에 닫힌(자연 마무리) 대화 · 진행 중인 대화 · 빈 대화", () => {
  assert.deepEqual(tarotEndState(turns(9, CLOSE), row()), { ended: true, endedAtAbsCap: false, claimInProgress: false });
  assert.deepEqual(tarotEndState(turns(9, "그냥 답이야."), row()), { ended: false, endedAtAbsCap: false, claimInProgress: false });
  assert.deepEqual(tarotEndState([], row()), { ended: false, endedAtAbsCap: false, claimInProgress: false });
});

// claimInProgress — 열려 있는데([END] 없음) 턴 수가 이미 유효 강제 종료선 이상 = 다른 구매가 [END] 를 선점해 진행 중인 틈(또는 복원이 실패한 뒤).
// 구매 라우트는 이 틈에 들어온 늦은 요청을 쓰기 없이 409 로 돌려보낸다.
test("tarotEndState.claimInProgress — 열려 있고 턴 수 ≥ 유효 강제 종료선이면 true(투카드 12, 넘어도)", () => {
  assert.deepEqual(tarotEndState(turns(12, "그냥 답이야."), row()), { ended: false, endedAtAbsCap: false, claimInProgress: true });
  assert.equal(tarotEndState(turns(13, "그냥 답이야."), row()).claimInProgress, true);
  // 선점이 [END] 를 지운 직후의 실제 모양 — 12번째 답이 마무리 인사에서 [END] 만 빠진 상태
  assert.equal(tarotEndState(turns(12, stripTrailingEnd(CLOSE)), row()).claimInProgress, true);
});

test("tarotEndState.claimInProgress — 열려 있고 턴 수 < 유효 강제 종료선이면 false(대화 중 · 선이 올라간 직후)", () => {
  assert.equal(tarotEndState(turns(11, "그냥 답이야."), row()).claimInProgress, false);
  assert.equal(tarotEndState(turns(5, "그냥 답이야."), row()).claimInProgress, false);
  // 연장(+4)으로 선이 16 이 된 뒤 같은 12턴 — 선점한 구매가 CAS 까지 끝낸 상태라 정상적으로 열린 대화다
  assert.equal(tarotEndState(turns(12, "그냥 답이야."), row({ extra_turns: 4 })).claimInProgress, false);
  assert.equal(tarotEndState(turns(12, "그냥 답이야."), row({ clarifier_count: 1 })).claimInProgress, false);
});

test("tarotEndState.claimInProgress — 끝난([END] 있음) 대화는 false(재개 대상이든 아니든)", () => {
  assert.equal(tarotEndState(turns(12, CLOSE), row()).claimInProgress, false); // 강제 종료선에서 닫힘
  assert.equal(tarotEndState(turns(9, CLOSE), row()).claimInProgress, false); // 자연 마무리
  assert.equal(tarotEndState(turns(12, "끝 인사야.\n[END]\n[RECO:continue]"), row()).claimInProgress, false); // 재개 못 하는 모양이어도
});

test("tarotEndState.claimInProgress — 타로가 아니면(사주 등)·스프레드가 없거나 모르면 false", () => {
  const open12 = turns(12, "그냥 답이야.");
  assert.equal(tarotEndState(open12, row({ consultation_type: "saju" })).claimInProgress, false);
  assert.equal(tarotEndState(open12, row({ consultation_type: null })).claimInProgress, false);
  assert.equal(tarotEndState(open12, row({ spread_type: null })).claimInProgress, false);
  assert.equal(tarotEndState(open12, row({ spread_type: "legacy_spread" })).claimInProgress, false); // 무한대 선
  assert.equal(tarotEndState(open12, row({ consultation_type: "saju", spread_type: "two_card" })).claimInProgress, false);
});

test("tarotEndState — 연장·보조 카드 횟수가 null 이면 0 으로 센다", () => {
  assert.deepEqual(tarotEndState(turns(12, CLOSE), row({ extra_turns: null, clarifier_count: null })), {
    ended: true,
    endedAtAbsCap: true,
    claimInProgress: false,
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
    claimInProgress: false,
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

test("loadTarotEndState — 열려 있는데 턴 수 ≥ 강제 종료선이면 claimInProgress 를 그대로 올려 준다(라우트가 이걸로 409)", async () => {
  // 선점이 마지막 답의 [END] 를 지운 직후의 저장 상태 — 12번째 답이 마무리 인사에서 [END] 만 빠졌다
  const openAtCap = turns(12, "끝 인사야.").map((content, i) => ({ id: `m${i + 1}`, content }));
  const { client } = fakeMessages({ data: openAtCap, error: null });
  const out = await loadTarotEndState(client, READING);
  if (out.error) throw out.error;
  assert.equal(out.state.claimInProgress, true);
  assert.equal(out.state.ended, false);
  assert.equal(out.state.endedAtAbsCap, false);
  // 한 턴 모자라면(대화 중) 아니다
  const { client: c2 } = fakeMessages({ data: openAtCap.slice(0, 11), error: null });
  const mid = await loadTarotEndState(c2, READING);
  if (mid.error) throw mid.error;
  assert.equal(mid.state.claimInProgress, false);
});

test("loadTarotEndState — 메시지가 없으면 lastAssistant 는 null", async () => {
  const { client } = fakeMessages({ data: [], error: null });
  const out = await loadTarotEndState(client, READING);
  if (out.error) throw out.error;
  assert.deepEqual(out.state, { ended: false, endedAtAbsCap: false, claimInProgress: false, lastAssistant: null });
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

// ── 쓰기 헬퍼(재개 선점 · 복원) — update 체인(from → update → eq [→ like → select])을 기록하는 가짜 service client ──
// results 를 배열로 주면 from() 호출마다 순서대로 소비한다(선점 → 복원처럼 여러 문장을 쓰는 헬퍼용). 배열이 바닥나면 { error: null }.
type WriteResult = { data?: { id: string }[] | null; error: unknown };
function fakeWrites(results: WriteResult | WriteResult[]) {
  type Chain = {
    update: (payload: unknown) => Chain;
    eq: (col: string, val: unknown) => Chain;
    like: (col: string, pattern: unknown) => Chain;
    select: (cols: string) => Chain;
    then: (resolve: (r: WriteResult) => unknown) => unknown;
  };
  const queue = Array.isArray(results) ? [...results] : null;
  const calls: unknown[][] = [];
  const newChain = (result: WriteResult): Chain => {
    const chain: Chain = {
      update: (payload) => {
        calls.push(["update", payload]);
        return chain;
      },
      eq: (col, val) => {
        calls.push(["eq", col, val]);
        return chain;
      },
      like: (col, pattern) => {
        calls.push(["like", col, pattern]);
        return chain;
      },
      select: (cols) => {
        calls.push(["select", cols]);
        return chain;
      },
      then: (resolve) => resolve(result), // await 하면 result 로 풀린다
    };
    return chain;
  };
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(["from", table]);
        return newChain(queue ? (queue.shift() ?? { error: null }) : (results as WriteResult));
      },
    } as unknown as Parameters<typeof restoreTarotEnd>[0],
  };
}
const updatesOf = (calls: unknown[][]) => calls.filter((c) => c[0] === "update").map((c) => c[1]);

test("restoreTarotEnd — 원문([END] 포함)을 그 메시지 id 에 되돌려 쓴다", async () => {
  const { client, calls } = fakeWrites({ error: null });
  const out = await restoreTarotEnd(client, { id: "m12", content: CLOSE });
  assert.equal(out.error, null);
  assert.deepEqual(calls, [
    ["from", "messages"],
    ["update", { content: CLOSE }],
    ["eq", "id", "m12"],
  ]);
});

test("restoreTarotEnd — DB 오류는 error 로 돌려준다(라우트가 로그 + 수동 보정 필요)", async () => {
  const boom = new Error("db down");
  const { client } = fakeWrites({ error: boom });
  const out = await restoreTarotEnd(client, { id: "m12", content: CLOSE });
  assert.equal(out.error, boom);
});

test("reopenTarotReading — [END] 가 남은 행만 갱신하는 CAS 로 선점한다(끝 [END] 만 제거)", async () => {
  const { client, calls } = fakeWrites({ data: [{ id: "m12" }], error: null });
  const out = await reopenTarotReading(client, { id: "m12", content: CLOSE });
  assert.deepEqual(out, { ok: true });
  assert.deepEqual(calls, [
    ["from", "messages"],
    ["update", { content: "끝 인사야." }],
    ["eq", "id", "m12"],
    ["like", "content", "%[END]%"],
    ["select", "id"],
  ]);
});

test("reopenTarotReading — 동시 요청이 먼저 선점했으면(0행) claim_lost — 진 쪽은 복원하지 않고 차감 전에 멈춘다", async () => {
  const { client } = fakeWrites({ data: [], error: null });
  assert.deepEqual(await reopenTarotReading(client, { id: "m12", content: CLOSE }), { ok: false, reason: "claim_lost" });
  // data 가 null 이어도 선점하지 못한 것이다
  const { client: c2 } = fakeWrites({ data: null, error: null });
  assert.deepEqual(await reopenTarotReading(c2, { id: "m12", content: CLOSE }), { ok: false, reason: "claim_lost" });
});

test("reopenTarotReading — DB 오류는 db_error(원인 error 동봉)로 돌려준다 — claim_lost 와 구분된다", async () => {
  const boom = new Error("db down");
  const { client } = fakeWrites({ data: null, error: boom });
  assert.deepEqual(await reopenTarotReading(client, { id: "m12", content: CLOSE }), { ok: false, reason: "db_error", error: boom });
});

// ── claimTarotReopen — 선점 + restore 클로저(구매 라우트 공용). 로거는 주입한 가짜 ──
const endStateOf = (over: Partial<LoadedTarotEndState> = {}): LoadedTarotEndState => ({
  ended: true,
  endedAtAbsCap: true,
  claimInProgress: false,
  lastAssistant: { id: "m12", content: CLOSE },
  ...over,
});
type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> } | undefined;
/** logs = error 레벨, warns = warn 레벨 — 둘을 따로 받아 로그 레벨까지 단언한다 */
function fakeLog() {
  const logs: { err: unknown; ctx: LogCtx }[] = [];
  const warns: { message: string; ctx: LogCtx }[] = [];
  const log: ReopenLog = {
    tag: "[test]",
    route: "/api/test",
    userId: "u1",
    readingId: "r1",
    logError: async (err, ctx) => {
      logs.push({ err, ctx });
    },
    logWarn: async (message, ctx) => {
      warns.push({ message, ctx });
    },
  };
  return { log, logs, warns };
}

test("claimTarotReopen — 강제 종료선에서 닫힌 대화가 아니면 아무것도 쓰지 않는다(reopened=null · restore 는 no-op)", async () => {
  const { client, calls } = fakeWrites([]);
  const { log, logs } = fakeLog();
  for (const state of [
    endStateOf({ ended: false, endedAtAbsCap: false, claimInProgress: false }), // 진행 중
    endStateOf({ endedAtAbsCap: false, claimInProgress: false }), // 자연 종료·사주 — 끝났지만 강제 종료선 아님
    endStateOf({ lastAssistant: null }), // 방어: 메시지가 없다
  ]) {
    const claim = await claimTarotReopen(client, state, log);
    assert.equal(claim.ok, true);
    if (!claim.ok) return;
    assert.equal(claim.reopened, null);
    await claim.restore();
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(logs, []);
});

test("claimTarotReopen — 선점하면 reopened 를 돌려주고, restore() 가 원문([END] 포함)을 되돌려 쓴다", async () => {
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { error: null }]);
  const { log, logs } = fakeLog();
  const claim = await claimTarotReopen(client, endStateOf(), log);
  assert.equal(claim.ok, true);
  if (!claim.ok) return;
  assert.deepEqual(claim.reopened, { id: "m12", content: CLOSE });
  assert.deepEqual(updatesOf(calls), [{ content: "끝 인사야." }]); // 선점만 나갔고 복원은 부를 때까지 없다
  await claim.restore();
  assert.deepEqual(updatesOf(calls), [{ content: "끝 인사야." }, { content: CLOSE }]);
  assert.deepEqual(logs, []);
});

test("claimTarotReopen — 동시 요청이 먼저 선점했으면 claim_lost: 복원할 게 없고 WARN 으로만 남긴다(설계된 정상 신호 — error 아님)", async () => {
  const { client, calls } = fakeWrites({ data: [], error: null });
  const { log, logs, warns } = fakeLog();
  const claim = await claimTarotReopen(client, endStateOf(), log);
  assert.deepEqual(claim, { ok: false, reason: "claim_lost" });
  assert.equal(updatesOf(calls).length, 1); // 선점 시도 하나뿐 — 복원 UPDATE 는 없다
  assert.deepEqual(logs, []); // error 레벨은 없다 — /admin/errors 에 더블탭마다 쌓이지 않게
  assert.equal(warns.length, 1);
  assert.match(warns[0].message, /reopen_claim_lost.*m12/);
  assert.deepEqual(warns[0].ctx, { route: "/api/test", userId: "u1", extra: { stage: "reopen", readingId: "r1" } });
});

test("claimTarotReopen — DB 오류는 db_error 로 돌려주고 원인 error 를 그대로 로그한다", async () => {
  const boom = new Error("db down");
  const { client } = fakeWrites({ data: null, error: boom });
  const { log, logs } = fakeLog();
  assert.deepEqual(await claimTarotReopen(client, endStateOf(), log), { ok: false, reason: "db_error", error: boom });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].err, boom);
  assert.equal(logs[0].ctx?.extra?.stage, "reopen");
});

test("claimTarotReopen — restore 가 실패하면 console.error(수동 보정 필요) + reopen_restore 로그를 남기고 던지지 않는다", async (t) => {
  const consoleError = t.mock.method(console, "error", () => {});
  const boom = new Error("restore failed");
  const { client } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { error: boom }]);
  const { log, logs } = fakeLog();
  const claim = await claimTarotReopen(client, endStateOf(), log);
  assert.equal(claim.ok, true);
  if (!claim.ok) return;
  await claim.restore(); // 던지지 않는다
  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(String(consoleError.mock.calls[0].arguments[0]), /\[test\] 재개 선점 복원 실패 — 수동 보정 필요/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].err, boom);
  assert.deepEqual(logs[0].ctx, { route: "/api/test", userId: "u1", extra: { stage: "reopen_restore", readingId: "r1", messageId: "m12" } });
});

// ── undoSlotAndRestore — 차감 확정 부족 뒤: 슬롯을 두 카운터 CAS 로 반납하고, 정확히 1행이 깨끗이 되돌아갔을 때만 [END] 를 복원한다 ──
const EXTEND_UNDO = { readingId: "r1", column: "extra_turns", applied: 4, previous: 0, other: { column: "clarifier_count", value: 0 } } as const;
const CLARIFIER_UNDO = { readingId: "r1", column: "clarifier_count", applied: 1, previous: 0, other: { column: "extra_turns", value: 4 } } as const;
const claimAndGet = async (
  client: ReturnType<typeof fakeWrites>["client"],
  log: ReopenLog,
  state: LoadedTarotEndState = endStateOf(),
) => {
  const claim = await claimTarotReopen(client, state, log);
  if (!claim.ok) throw new Error("claim should succeed in this test");
  return claim;
};
const readingsCalls = (calls: unknown[][]) => {
  // from("readings") 문장 하나의 체인만 잘라 낸다
  const i = calls.findIndex((c) => c[0] === "from" && c[1] === "readings");
  if (i < 0) return [];
  let j = i + 1;
  while (j < calls.length && calls[j][0] !== "from") j++;
  return calls.slice(i, j);
};

test("undoSlotAndRestore — 두 카운터 CAS 로 반납하고, 정확히 1행이면 선점한 [END] 를 복원한다(extend)", async () => {
  // 순서: 선점 → 슬롯 반납(1행) → 복원
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [{ id: "r1" }], error: null }, { error: null }]);
  const { log, logs, warns } = fakeLog();
  const claim = await claimAndGet(client, log);
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, log), "rolled_back");
  // 반납 문장 — 절대값 UPDATE 가 아니라 이 요청이 쓴 값(4)과 다른 카운터(clarifier_count=0)를 함께 요구하는 CAS
  assert.deepEqual(readingsCalls(calls), [
    ["from", "readings"],
    ["update", { extra_turns: 0 }],
    ["eq", "id", "r1"],
    ["eq", "extra_turns", 4],
    ["eq", "clarifier_count", 0],
    ["select", "id"],
  ]);
  assert.deepEqual(updatesOf(calls), [{ content: "끝 인사야." }, { extra_turns: 0 }, { content: CLOSE }]); // 복원은 반납 뒤
  assert.deepEqual(logs, []);
  assert.deepEqual(warns, []);
});

test("undoSlotAndRestore — clarifier 쪽은 clarifier_count 를 내리고 extra_turns 를 함께 요구한다", async () => {
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [{ id: "r1" }], error: null }, { error: null }]);
  const { log } = fakeLog();
  const claim = await claimAndGet(client, log);
  assert.equal(await undoSlotAndRestore(client, claim, CLARIFIER_UNDO, log), "rolled_back");
  assert.deepEqual(readingsCalls(calls), [
    ["from", "readings"],
    ["update", { clarifier_count: 0 }],
    ["eq", "id", "r1"],
    ["eq", "clarifier_count", 1],
    ["eq", "extra_turns", 4],
    ["select", "id"],
  ]);
});

test("undoSlotAndRestore — clarifier 는 슬롯과 같은 UPDATE 로 붙인 카드도 같은 반납 UPDATE 로 되돌린다(drawn_cards → 선점 전 배열)", async () => {
  const before = [{ position: 0, label: "지금", card_id: 3, direction: "upright" as const }];
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [{ id: "r1" }], error: null }, { error: null }]);
  const { log } = fakeLog();
  const claim = await claimAndGet(client, log);
  assert.equal(await undoSlotAndRestore(client, claim, { ...CLARIFIER_UNDO, drawnCards: before }, log), "rolled_back");
  // 한 문장 — 슬롯만 내리고 카드는 남기면 '카드는 있는데 슬롯은 반납된' 공짜 카드가 된다
  assert.deepEqual(readingsCalls(calls), [
    ["from", "readings"],
    ["update", { clarifier_count: 0, drawn_cards: before }],
    ["eq", "id", "r1"],
    ["eq", "clarifier_count", 1],
    ["eq", "extra_turns", 4],
    ["select", "id"],
  ]);
  // 읽은 값이 null(옛 행)이면 null 로 되돌린다 — 빈 배열로 바꾸지 않는다
  const w2 = fakeWrites([{ data: [{ id: "r1" }], error: null }]);
  const claim2 = await claimAndGet(w2.client, log, endStateOf({ ended: false, endedAtAbsCap: false }));
  await undoSlotAndRestore(w2.client, claim2, { ...CLARIFIER_UNDO, drawnCards: null }, log);
  assert.deepEqual(updatesOf(w2.calls), [{ clarifier_count: 0, drawn_cards: null }]);
});

test("undoSlotAndRestore — 0행(다른 구매가 위에 쌓임)이면 복원하지 않고 대화를 열어 둔다 — WARN, 호출자는 그래도 402", async () => {
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [], error: null }]);
  const { log, logs, warns } = fakeLog();
  const claim = await claimAndGet(client, log);
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, log), "stacked");
  assert.deepEqual(updatesOf(calls), [{ content: "끝 인사야." }, { extra_turns: 0 }]); // 복원(원문) UPDATE 없음
  assert.deepEqual(logs, []); // error 가 아니라 warn
  assert.equal(warns.length, 1);
  assert.match(warns[0].message, /slot_rollback_stacked/);
  assert.equal(warns[0].ctx?.extra?.stage, "slot_rollback_stacked");
});

test("undoSlotAndRestore — 반납이 오류면 복원하지 않는다(카운터가 올라간 채 [END] 만 되살리면 영영 재개 불가) — ERROR + 수동 보정 필요", async (t) => {
  const consoleError = t.mock.method(console, "error", () => {});
  const boom = new Error("rollback failed");
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: null, error: boom }]);
  const { log, logs, warns } = fakeLog();
  const claim = await claimAndGet(client, log);
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, log), "error");
  assert.deepEqual(updatesOf(calls), [{ content: "끝 인사야." }, { extra_turns: 0 }]); // 복원 UPDATE 없음
  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(String(consoleError.mock.calls[0].arguments[0]), /\[test\] 선점 반납 실패 — 수동 보정 필요/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].err, boom);
  assert.equal(logs[0].ctx?.extra?.stage, "slot_rollback");
  assert.deepEqual(warns, []);
});

test("undoSlotAndRestore — 선점한 게 없는 요청(대화 중 구매·늦게 온 요청)도 슬롯은 반납하고 복원은 하지 않는다", async () => {
  const { client, calls } = fakeWrites([{ data: [{ id: "r1" }], error: null }]);
  const { log } = fakeLog();
  const claim = await claimAndGet(client, log, endStateOf({ ended: false, endedAtAbsCap: false })); // reopened=null
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, log), "rolled_back");
  assert.deepEqual(updatesOf(calls), [{ extra_turns: 0 }]); // 반납만 — 메시지는 건드리지 않는다
});

test("undoSlotAndRestore — 반납은 됐는데 복원이 실패하면 던지지 않고 reopen_restore 를 남긴다(최악은 무료 1턴)", async (t) => {
  t.mock.method(console, "error", () => {});
  const boom = new Error("restore failed");
  const { client } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [{ id: "r1" }], error: null }, { error: boom }]);
  const { log, logs } = fakeLog();
  const claim = await claimAndGet(client, log);
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, log), "rolled_back");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].ctx?.extra?.stage, "reopen_restore");
});

test("undoSlotAndRestore — 반납 CAS 의 행 id 는 SlotUndo.readingId 다: 로그 맥락(log.readingId)이 다른 값이어도 키는 바뀌지 않는다", async () => {
  // log.readingId 가 표시용 값으로 바뀌어도(예: 사람이 읽는 id) 반납이 엉뚱한 행을 겨누거나 조용히 'stacked' 가 되면 안 된다
  const { client, calls } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [{ id: "r1" }], error: null }, { error: null }]);
  const display: ReopenLog = { ...fakeLog().log, readingId: "display-only-id" };
  const claim = await claimAndGet(client, display);
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, display), "rolled_back");
  assert.deepEqual(
    readingsCalls(calls).filter((c) => c[0] === "eq" && c[1] === "id"),
    [["eq", "id", "r1"]],
  );
});

test("undoSlotAndRestore — 로그(경고·오류)의 readingId 는 log.readingId 를 쓴다 — 키와 로그 맥락은 별개", async () => {
  const { client } = fakeWrites([{ data: [{ id: "m12" }], error: null }, { data: [], error: null }]);
  const { log, warns } = fakeLog();
  const display: ReopenLog = { ...log, readingId: "display-only-id" };
  const claim = await claimAndGet(client, display);
  assert.equal(await undoSlotAndRestore(client, claim, EXTEND_UNDO, display), "stacked");
  assert.equal(warns.length, 1);
  assert.equal(warns[0].ctx?.extra?.readingId, "display-only-id");
});

// ── X-Reopen 응답 헤더 — 서버(formatReopenHeader)와 클라(parseReopenHeader)가 한 쌍으로 쓴다 ──
const ALL_OPTIONS: ReopenOptions[] = [
  { extend: true, clarifier: true },
  { extend: true, clarifier: false },
  { extend: false, clarifier: true },
  { extend: false, clarifier: false },
];

test("formatReopenHeader — 가능한 상품만 쉼표로(extend 먼저), 없으면 빈 문자열", () => {
  assert.equal(formatReopenHeader({ extend: true, clarifier: true }), "extend,clarifier");
  assert.equal(formatReopenHeader({ extend: true, clarifier: false }), "extend");
  assert.equal(formatReopenHeader({ extend: false, clarifier: true }), "clarifier");
  assert.equal(formatReopenHeader({ extend: false, clarifier: false }), "");
});

test("parseReopenHeader — null 은 헤더 없음(강제 종료선 종료가 아님), '' 는 강제 종료선 종료지만 재개 상품 없음", () => {
  assert.equal(parseReopenHeader(null), null);
  assert.deepEqual(parseReopenHeader(""), { extend: false, clarifier: false });
});

test("parseReopenHeader — 토큰별로 읽고, 모르는 토큰은 무시하고, 쉼표 뒤 공백을 허용한다", () => {
  assert.deepEqual(parseReopenHeader("extend,clarifier"), { extend: true, clarifier: true });
  assert.deepEqual(parseReopenHeader("extend"), { extend: true, clarifier: false });
  assert.deepEqual(parseReopenHeader("clarifier"), { extend: false, clarifier: true });
  assert.deepEqual(parseReopenHeader("clarifier,extend"), { extend: true, clarifier: true }); // 순서 무관
  assert.deepEqual(parseReopenHeader("extend, clarifier"), { extend: true, clarifier: true });
  assert.deepEqual(parseReopenHeader("extend,future_product,"), { extend: true, clarifier: false }); // 모르는 토큰·빈 토큰 무시
  assert.deepEqual(parseReopenHeader("future_product"), { extend: false, clarifier: false });
  assert.deepEqual(parseReopenHeader("Extend"), { extend: false, clarifier: false }); // 서버가 쓰는 소문자 토큰만 인정
});

test("formatReopenHeader ↔ parseReopenHeader — 모든 조합이 왕복한다", () => {
  for (const ro of ALL_OPTIONS) assert.deepEqual(parseReopenHeader(formatReopenHeader(ro)), ro, JSON.stringify(ro));
});

test("X-Reopen — 빈 값('')은 실제 Headers 를 거쳐도 '헤더 없음'(null)과 구분된다", () => {
  const withEmpty = new Response(null, { headers: { "X-Reopen": formatReopenHeader({ extend: false, clarifier: false }) } });
  assert.deepEqual(parseReopenHeader(withEmpty.headers.get("X-Reopen")), { extend: false, clarifier: false });
  assert.equal(parseReopenHeader(new Response(null).headers.get("X-Reopen")), null);
  // 실제 응답 헤더를 거친 값도 왕복한다
  for (const ro of ALL_OPTIONS) {
    const r = new Response(null, { headers: { "X-Reopen": formatReopenHeader(ro) } });
    assert.deepEqual(parseReopenHeader(r.headers.get("X-Reopen")), ro, JSON.stringify(ro));
  }
});

// ── isClarifierReopenTurn — '한 장 더'(보조 카드)로 강제 종료선에서 다시 연 직후의 카드 풀이 턴 (사용자 결정 2026-10-04 ⑦) ──
// 연장(4턴 더)을 산 리딩은 자연 마무리선이 강제 종료선과 같아(③) 이 턴이 abs−1(마지막 수렴 턴)이 돼 얇은 정리 톤을 받는다 — 유료 카드 풀이가 빈약해진다.
// 구매로 강제 종료선이 +2 오르므로, 이 턴의 assistantTurnsSoFar 는 '구매 전 강제 종료선' = effectiveAbsTurnCap(.., clarifierCount − 1) 이다.
const reopenTurn = (extraTurns: number, clarifierCount: number, assistantTurnsSoFar: number, spreadType = "two_card"): boolean =>
  isClarifierReopenTurn({ spreadType, extraTurns, clarifierCount, assistantTurnsSoFar });

test("isClarifierReopenTurn — 투카드(기본 12): 연장 → 강제 종료선(16) → 보조 카드 이면 새 카드를 읽는 턴(답 16개 뒤)이다", () => {
  assert.equal(reopenTurn(4, 1, 16), true);
  // 한 턴 어긋나면 아니다
  assert.equal(reopenTurn(4, 1, 15), false);
  assert.equal(reopenTurn(4, 1, 17), false);
});

test("isClarifierReopenTurn — 보조 카드(12) → 연장 순서면 연장 직후 턴(답 14개 뒤)은 보조 카드로 연 턴이 아니다", () => {
  assert.equal(reopenTurn(4, 1, 14), false);
});

test("isClarifierReopenTurn — 연장 없이 강제 종료선(12)에서 보조 카드를 산 턴도 true(예전에도 열어 두기로 풀리던 경우)", () => {
  assert.equal(reopenTurn(0, 1, 12), true);
  assert.equal(reopenTurn(0, 1, 11), false);
  assert.equal(reopenTurn(0, 1, 13), false);
});

test("isClarifierReopenTurn — 대화 중에 산 보조 카드·아직 중반인 턴은 아니다", () => {
  assert.equal(reopenTurn(0, 1, 3), false);
  assert.equal(reopenTurn(4, 1, 3), false);
});

test("isClarifierReopenTurn — 두 번째 보조 카드: 연장한 리딩(구매 전 선 12+4+2=18)·연장 안 한 리딩(구매 전 선 14) 모두", () => {
  assert.equal(reopenTurn(4, 2, 18), true);
  assert.equal(reopenTurn(0, 2, 14), true);
  assert.equal(reopenTurn(4, 2, 16), false); // 첫 보조 카드 때의 턴 수는 이제 아니다
});

test("isClarifierReopenTurn — 보조 카드를 안 산 리딩은 어떤 턴 수에서도 false(강제 종료선 −2 같은 값에서도)", () => {
  // 0..24 전부 — clarifierCount 가드가 빠지면 '구매 전 선'(= 현재 선 − 2)이 우연히 같아지는 턴에서 true 가 된다
  for (const spread of ["one_card", "two_card", "relationship_5"]) {
    for (let turns = 0; turns <= 24; turns++) {
      assert.equal(reopenTurn(0, 0, turns, spread), false, `${spread} extra 0 · ${turns}`);
      assert.equal(reopenTurn(4, 0, turns, spread), false, `${spread} extra 4 · ${turns}`);
    }
  }
});

test("isClarifierReopenTurn — 모르는 스프레드는 false(무한대 강제 종료선과는 어떤 턴 수도 같지 않다)", () => {
  assert.equal(reopenTurn(0, 1, 12, "legacy_spread"), false);
  assert.equal(reopenTurn(4, 2, 18, "constructor"), false);
});

test("isClarifierReopenTurn — 정의대로: 어떤 구매 전 강제 종료선 C 에서 보조 카드를 사면 다음 턴(턴 수 C)이 true, 연장으로 연 다음 턴은 false", () => {
  for (const spread of ["one_card", "two_card", "three_card", "relationship_5", "checkin_6", "chakra_7"]) {
    for (const extra of [0, 4]) {
      for (const clar of [0, 1]) {
        const cap = effectiveAbsTurnCap(spread, extra, clar); // 이 선에서 닫힌 대화
        assert.equal(reopenTurn(extra, clar + 1, cap, spread), true, `${spread} extra=${extra} clar=${clar} → 보조 카드 재개`);
        if (extra === 0) {
          // 연장으로 열면 선이 +4 오르고 보조 카드 수는 그대로 — 보조 카드로 연 턴이 아니다
          assert.equal(reopenTurn(extra + 4, clar, cap, spread), false, `${spread} clar=${clar} → 연장 재개`);
        }
      }
    }
  }
});
