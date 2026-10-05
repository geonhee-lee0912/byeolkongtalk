// '카드 한 장 더'(clarifier) 구매 — 같은 리딩에 구매 두 건이 동시에 들어올 때(두 탭·두 기기) 실제 라우트(POST)를 두 번 돌려
// 두 요청의 DB 호출 순서를 가능한 모든 방식으로 섞어 본다(결정적 · 전수). 라우트가 import 하는 supabase·session·stars·logger 는
// resolve 훅으로 ./clarifier-race.fakes.ts 로 바꿔 끼운다 — 라우트 코드 자체는 그대로 돈다.
// 2026-10-04 버그: 슬롯 CAS·차감 뒤 drawn_cards 를 '처음 읽은 배열 + 새 카드'로 통째 덮어써서, 앞 요청이 슬롯을 올린 뒤
// 카드를 쓰기 전에 읽은 뒷 요청이 앞 요청의 카드를 지웠다(별은 두 번 빠지고 카드는 한 장).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./clarifier-race.fakes.ts";
import type { Row, World } from "./clarifier-race.fakes.ts";
import { tarotEndState, type ReopenReadingRow } from "./reopen.ts";
import type { DrawnCard } from "./spreads.ts";
import { CLARIFIER_COST } from "../upsell.ts";

// ── 라우트 의존성 바꿔 끼우기 ──
// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./clarifier-race.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = ["/lib/supabase.ts", "/lib/session.ts", "/lib/stars.ts", "/lib/logger.ts"];

type Route = { POST: (request: NextRequest) => Promise<Response>; fakes: typeof Fakes };
let loaded: Promise<Route> | null = null;
function load(): Promise<Route> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { POST } = await import("@/app/api/consultations/tarot/clarifier/route");
    return { POST, fakes };
  })();
  return loaded;
}

// ── 시나리오 ──
const USER = "u1";
const READING_ID = "r1";
const NAMES = ["A", "B"];
type Card = { card_id: number; direction: "upright" | "reversed" };
const A_CARD: Card = { card_id: 10, direction: "upright" };
const B_CARD: Card = { card_id: 20, direction: "reversed" };
const BASE_CARDS: DrawnCard[] = [
  { position: 0, label: "지금", card_id: 0, direction: "upright" },
  { position: 1, label: "흐름", card_id: 1, direction: "reversed" },
];

/** 투카드 — 기본 강제 종료선 12 */
const reading = (): Row => ({
  id: READING_ID,
  user_id: USER,
  consultation_type: "tarot",
  spread_type: "two_card",
  drawn_cards: structuredClone(BASE_CARDS),
  clarifier_count: 0,
  extra_turns: 0,
  has_sensitive: false,
});
const assistantTurns = (n: number, last: string): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    reading_id: READING_ID,
    role: "assistant",
    content: i === n - 1 ? last : `답 ${i + 1}`,
    created_at: `2026-10-04T00:00:${String(i + 1).padStart(2, "0")}Z`,
  }));
/** 대화 중(5턴) — 채팅 안 '한 장 더' 칩으로 사는 경우 */
const OPEN = assistantTurns(5, "그냥 답이야.");
/** 강제 종료선(12턴)에서 닫힘 — 재개 구매(차감 전 [END] 선점) 경로 */
const CLOSED_AT_CAP = assistantTurns(12, "끝 인사야.\n\n[END]");

interface Scenario {
  messages: Row[];
  balance: number;
  /** 요청마다 고른 카드 — [A, B] (한 장이면 요청 하나) */
  cards: Card[];
  /** 차감이 rpc_error(결과 불명)로 끝난다 */
  spendError?: boolean;
}

// ── 스케줄러 — 두 요청이 모두 DB 호출 앞에서 멈췄을 때만 고른다(그 사이 JS 는 요청 안에서 원자적) ──
type Outcome = { status: number; body: Record<string, unknown> };
type Ready = { reqId: number; op: string };
interface Run {
  outcomes: Outcome[];
  world: World;
  trace: string[];
}

async function quiesce(isQuiet: () => boolean): Promise<void> {
  for (let i = 0; !isQuiet(); i++) {
    if (i > 10_000) throw new Error("요청이 DB 호출도 응답도 아닌 곳에서 멈췄다");
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

const makeRequest = (card: Card) =>
  new NextRequest("http://localhost/api/consultations/tarot/clarifier", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ readingId: READING_ID, card }),
  });

/** choose 는 둘 다 DB 호출 앞에 있을 때만 불린다 — ready 는 reqId 순, 고른 칸의 index 를 돌려준다 */
async function runSchedule(s: Scenario, choose: (ready: Ready[]) => number): Promise<Run> {
  const { POST, fakes } = await load();
  const waiting = new Map<number, { op: string; go: () => void }>();
  const world: World = {
    tables: { readings: [reading()], messages: structuredClone(s.messages) },
    balances: { [USER]: s.balance },
    spends: [],
    errors: [],
    warns: [],
    spendError: s.spendError,
    gate: (reqId, op) => new Promise<void>((go) => void waiting.set(reqId, { op, go })),
  };
  fakes.setWorld(world);
  const trace: string[] = [];
  const outcomes: Outcome[] = [];
  const settled = new Set<number>();
  const runs = s.cards.map((card, reqId) =>
    fakes.als
      .run({ reqId, userId: USER }, () => POST(makeRequest(card)))
      .then(async (res) => {
        outcomes[reqId] = { status: res.status, body: (await res.json()) as Record<string, unknown> };
      })
      .finally(() => settled.add(reqId)),
  );
  try {
    for (;;) {
      await quiesce(() => waiting.size + settled.size === runs.length);
      if (waiting.size === 0) break;
      const ready = [...waiting].sort(([a], [b]) => a - b).map(([reqId, { op }]) => ({ reqId, op }));
      const pick = ready[ready.length === 1 ? 0 : choose(ready)];
      const next = waiting.get(pick.reqId)!;
      waiting.delete(pick.reqId);
      trace.push(`${NAMES[pick.reqId]}:${pick.op}`);
      next.go();
    }
    await Promise.all(runs);
  } finally {
    fakes.setWorld(null);
  }
  return { outcomes, world, trace };
}

// ── 불변식 — 어떤 순서로 섞여도 지켜져야 하는 것 ──
function violations(s: Scenario, run: Run): string[] {
  const out: string[] = [];
  const row = run.world.tables.readings[0];
  const cards = row.drawn_cards as DrawnCard[];
  const ok = run.outcomes.flatMap((o, r) => (o.status === 200 ? [r] : []));
  const paid = run.world.spends.map((x) => x.reqId).sort();
  // ① 돈 = 응답 — 별이 빠진 요청과 200 을 받은 요청이 정확히 같다
  if (paid.join() !== ok.join()) out.push(`차감 [${paid}] ≠ 200 [${ok}]`);
  // ② 200 을 받은 요청의 카드는 최종 drawn_cards 에 정확히 한 장 있고, 응답 drawnCards(클라가 화면을 바꾸는 배열)에도 있다
  for (const r of ok) {
    const id = s.cards[r].card_id;
    const n = cards.filter((c) => c.card_id === id).length;
    if (n !== 1) out.push(`${NAMES[r]} 는 200 인데 최종 카드 ${id} 가 ${n}장`);
    const body = run.outcomes[r].body.drawnCards as DrawnCard[] | undefined;
    if (!body?.some((c) => c.card_id === id)) out.push(`${NAMES[r]} 의 200 응답 drawnCards 에 카드 ${id} 가 없다`);
  }
  // ③ 카드 중복 없음 · position = 배열 순서
  const ids = cards.map((c) => c.card_id);
  if (new Set(ids).size !== ids.length) out.push(`card_id 중복 [${ids}]`);
  if (cards.some((c, i) => c.position !== i)) out.push(`position 어긋남 [${cards.map((c) => c.position)}]`);
  // ④ 보조 카드 수 = clarifier_count — 슬롯과 카드는 한 묶음이다(카드 없는 슬롯도, 슬롯 없는 카드도 없다)
  const extra = cards.length - BASE_CARDS.length;
  if (extra !== row.clarifier_count) out.push(`보조 카드 ${extra}장 ≠ clarifier_count ${row.clarifier_count}`);
  // ⑤ 잔액 = 처음 − 차감 합
  const expected = s.balance - run.world.spends.length * CLARIFIER_COST;
  if (run.world.balances[USER] !== expected) out.push(`잔액 ${run.world.balances[USER]} ≠ ${expected}`);
  // ⑥ 설계된 응답만(200·400·402·409) — DB 오류를 넣지 않았으니 500 도 error 로그도 없어야 한다
  run.outcomes.forEach((o, r) => {
    if (![200, 400, 402, 409].includes(o.status)) out.push(`${NAMES[r]} 예상 밖 ${o.status} ${JSON.stringify(o.body)}`);
  });
  if (run.world.errors.length > 0) out.push(`error 로그 ${run.world.errors.length}건`);
  // ⑦ 종료 상태가 깨끗하다 — 선에 닿은 채 열려 있지도(늦게 온 요청이 영영 409), 올라간 선 아래에서 닫혀 있지도(영영 재개 불가) 않다
  const assistant = run.world.tables.messages
    .filter((m) => m.role === "assistant")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((m) => String(m.content));
  const st = tarotEndState(assistant, row as unknown as ReopenReadingRow);
  if (st.claimInProgress) out.push("선에 닿은 채 열려 있다(claimInProgress)");
  if (st.ended && !st.endedAtAbsCap) out.push("올라간 선 아래에서 닫혔다(재개 불가)");
  return out;
}

/** 두 요청의 DB 호출 순서를 전부(깊이 우선) 돌려 본다 — 같은 순서를 두 번 돌리지 않는다 */
async function explore(s: Scenario) {
  const stack: number[][] = [[]];
  let schedules = 0;
  let bothOk = 0;
  const bad: { problems: string[]; trace: string[] }[] = [];
  while (stack.length > 0) {
    const prefix = stack.pop()!;
    const choices: number[] = [];
    const widths: number[] = [];
    const run = await runSchedule(s, (ready) => {
      const c = choices.length < prefix.length ? prefix[choices.length] : 0;
      choices.push(c);
      widths.push(ready.length);
      return c;
    });
    for (let i = prefix.length; i < choices.length; i++) {
      for (let alt = choices[i] + 1; alt < widths[i]; alt++) stack.push([...choices.slice(0, i), alt]);
    }
    schedules++;
    if (run.outcomes.every((o) => o.status === 200)) bothOk++;
    const problems = violations(s, run);
    if (problems.length > 0) bad.push({ problems, trace: run.trace });
  }
  return { schedules, bothOk, bad };
}

const report = (r: Awaited<ReturnType<typeof explore>>) =>
  r.bad.length === 0
    ? "ok"
    : `${r.bad.length}/${r.schedules} 순서에서 깨짐 — 첫 사례: ${r.bad[0].problems.join(" · ")}\n  순서: ${r.bad[0].trace.join(" → ")}`;

const skip = registerHooks ? false : "module.registerHooks 가 없는 Node(< 22.15) — 라우트 의존성을 바꿔 끼울 수 없다";

// ── 결정적 재현 — 버그가 난 바로 그 순서 ──
test("clarifier 동시 구매 — A 가 슬롯을 올린 뒤(카드는 아직) B 가 읽고 끝까지 가도, 둘 다 200 이면 두 카드가 다 남는다", { skip }, async () => {
  // A 를 첫 readings UPDATE(슬롯 CAS)까지 돌리고 → B 를 끝까지 → A 를 마저. 옛 코드는 여기서 B 의 카드를 A 의 덮어쓰기가 지웠다.
  let aClaimed = false;
  const run = await runSchedule({ messages: OPEN, balance: 100, cards: [A_CARD, B_CARD] }, (ready) => {
    if (!aClaimed) {
      if (ready[0].op === "update readings") aClaimed = true;
      return 0; // A
    }
    return 1; // B
  });
  assert.deepEqual(
    run.outcomes.map((o) => o.status),
    [200, 200],
    run.trace.join(" → "),
  );
  const cards = run.world.tables.readings[0].drawn_cards as DrawnCard[];
  assert.deepEqual(
    cards.map((c) => [c.position, c.card_id]),
    [
      [0, 0],
      [1, 1],
      [2, 10], // A
      [3, 20], // B
    ],
    run.trace.join(" → "),
  );
  assert.equal(run.world.tables.readings[0].clarifier_count, 2);
  assert.equal(run.world.spends.length, 2); // 별 두 번 = 카드 두 장
  assert.deepEqual(violations({ messages: OPEN, balance: 100, cards: [A_CARD, B_CARD] }, run), []);
});

test("clarifier — 차감 결과 불명(rpc_error)은 성공 처리: 카드는 슬롯 CAS 때 이미 붙어 있어 200 · 슬롯 유지 · spend_unknown_granted ERROR", { skip }, async () => {
  const run = await runSchedule({ messages: OPEN, balance: 100, cards: [A_CARD], spendError: true }, () => 0);
  assert.equal(run.outcomes[0].status, 200, JSON.stringify(run.outcomes[0].body));
  const row = run.world.tables.readings[0];
  assert.deepEqual(
    (row.drawn_cards as DrawnCard[]).map((c) => c.card_id),
    [0, 1, 10],
  );
  assert.equal(row.clarifier_count, 1);
  assert.equal(run.world.spends.length, 0); // 실제로는 차감 안 된 경우 — 드문 공짜 구매로 받아들인다(결정 ④)
  assert.equal(run.world.errors.length, 1);
  assert.match(String(run.world.errors[0].err), /spend_unknown_granted/);
});

// ── 전수 탐색 ──
test("clarifier 동시 구매 전수 — 대화 중 · 서로 다른 카드 · 잔액 충분: 어떤 순서든 돈 = 응답 = 카드", { skip }, async () => {
  const r = await explore({ messages: OPEN, balance: 100, cards: [A_CARD, B_CARD] });
  assert.equal(report(r), "ok");
  assert.ok(r.bothOk > 0, "둘 다 200 인 순서가 실제로 탐색돼야 한다(헛돌지 않는다)");
});

test("clarifier 동시 구매 전수 — 강제 종료선 재개 · 서로 다른 카드 · 잔액 충분", { skip }, async () => {
  const r = await explore({ messages: CLOSED_AT_CAP, balance: 100, cards: [A_CARD, B_CARD] });
  assert.equal(report(r), "ok");
  assert.ok(r.bothOk > 0, "둘 다 200 인 순서가 실제로 탐색돼야 한다");
});

test("clarifier 동시 구매 전수 — 같은 카드를 두 탭에서 골라도 한 번만 팔린다(중복 검사가 동시성에서도 성립)", { skip }, async () => {
  for (const messages of [OPEN, CLOSED_AT_CAP]) {
    const r = await explore({ messages, balance: 100, cards: [A_CARD, A_CARD] });
    assert.equal(report(r), "ok");
    assert.equal(r.bothOk, 0, "같은 카드가 두 번 200 을 받으면 안 된다");
  }
});

test("clarifier 동시 구매 전수 — 잔액이 한 장 값뿐이면 하나는 402: 반납이 카드까지 되돌린다(쌓였으면 둘 다 남긴다)", { skip }, async () => {
  for (const messages of [OPEN, CLOSED_AT_CAP]) {
    const r = await explore({ messages, balance: CLARIFIER_COST, cards: [A_CARD, B_CARD] });
    assert.equal(report(r), "ok");
    assert.equal(r.bothOk, 0);
  }
});
