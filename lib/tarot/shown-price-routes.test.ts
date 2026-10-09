// 화면이 본 가격 대조(409 price_changed) — 실제 라우트(POST)를 가짜 DB 위에서 돌린다.
// 라우트가 import 하는 supabase·session·stars·logger 를 clarifier-race.fakes.ts 로 바꿔 끼우는 방식은 clarifier-race.test.ts 와 같다.
// 지키는 것: 가격이 어긋나면 잔액 조회·중복 방어·리딩 생성·차감 어느 것보다 먼저 409 로 끝난다(별·행이 안 움직인다) ·
//          어긋나지 않으면(옛 그룹 + 필드 없음 · 메뉴판 + 맞는 값 · 두 그룹 가격이 같은 상품 · 사주 부모) 대조를 지나 다음 단계로 간다.
//          "지났다"는 잔액 0 으로 두고 잔액 확인의 402 로 본다(가짜 DB 는 insert 를 흉내 내지 않는다 — 그 뒤는 이번 변경과 무관).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./clarifier-race.fakes.ts";
import type { Row, World } from "./clarifier-race.fakes.ts";
import { menuArmOf } from "./menu-ab.ts";
import { EMOTION_OPTIONS } from "../emotions.ts";

// ── 라우트 의존성 바꿔 끼우기(clarifier-race.test.ts 와 같다) ──
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

type Post = (request: NextRequest) => Promise<Response>;
type Loaded = { createPost: Post; continuePost: Post; fakes: typeof Fakes };
let loaded: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { POST: createPost } = await import("@/app/api/consultations/tarot/route");
    const { POST: continuePost } = await import("@/app/api/readings/continue/route");
    return { createPost, continuePost, fakes };
  })();
  return loaded;
}

// ── 시나리오 ──
// 그룹은 user_id 끝 글자로 정해진다(짝수 = 메뉴판) — 반반(split) 전제. 스위치를 돌리면 아래 "전제" 테스트가 먼저 깨진다
const MENU_USER = "menu-user-0";
const LEGACY_USER = "legacy-user-1";
const EMOTION = EMOTION_OPTIONS[0].tag;
const PARENT_ID = "parent-1";

type Outcome = { status: number; body: Record<string, unknown>; ops: string[]; world: World };

/** 요청 하나를 끝까지 돌린다 — ops = 라우트가 실제로 부른 DB·별 호출(순서대로) */
async function call(
  route: "create" | "continue",
  userId: string,
  body: Record<string, unknown>,
  opts: { balance?: number; tables?: Record<string, Row[]> } = {},
): Promise<Outcome> {
  const { createPost, continuePost, fakes } = await load();
  const ops: string[] = [];
  const world: World = {
    tables: { readings: [], messages: [], ...structuredClone(opts.tables ?? {}) },
    balances: { [userId]: opts.balance ?? 0 },
    spends: [],
    errors: [],
    warns: [],
    gate: async (_reqId, op) => {
      ops.push(op);
    },
  };
  fakes.setWorld(world);
  try {
    const path = route === "create" ? "/api/consultations/tarot" : "/api/readings/continue";
    const req = new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await fakes.als.run({ reqId: 0, userId }, () => (route === "create" ? createPost : continuePost)(req));
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, ops, world };
  } finally {
    fakes.setWorld(null);
  }
}

const createBody = (spreadType: string, cardCount: number, extra: Record<string, unknown> = {}) => ({
  spreadType,
  spreadCategory: "love",
  emotion: EMOTION,
  concern: "그 사람 마음이 궁금해",
  drawnCards: Array.from({ length: cardCount }, (_, i) => ({
    position: i,
    label: `자리${i + 1}`,
    card_id: i,
    direction: "upright",
  })),
  ...extra,
});

const parentRow = (consultationType: "tarot" | "saju", spreadType: string | null, userId: string): Row => ({
  id: PARENT_ID,
  user_id: userId,
  profile_id: null,
  saju_data: null,
  consultation_type: consultationType,
  spread_type: spreadType,
  spread_category: consultationType === "tarot" ? "love" : null,
  saju_product: null,
  emotion_tag: EMOTION,
  drawn_cards: null,
  has_sensitive: false,
});
/** 부모가 마무리됨([END]) — 이어가기 자격 */
const ENDED: Row[] = [{ id: "m1", reading_id: PARENT_ID, role: "assistant", content: "오늘은 여기까지야.\n\n[END]" }];
const continueBody = (extra: Record<string, unknown> = {}) => ({
  previousReadingId: PARENT_ID,
  mode: "deep",
  concern: "그 뒤로 연락이 없어서 다시 물어볼래",
  ...extra,
});
const withParent = (consultationType: "tarot" | "saju", spreadType: string | null, userId: string) => ({
  readings: [parentRow(consultationType, spreadType, userId)],
  messages: ENDED,
});

const skip = registerHooks ? false : "module.registerHooks 가 없는 Node(< 22.15) — 라우트 의존성을 바꿔 끼울 수 없다";

test("전제 — 반반(split): 시나리오 유저의 그룹(스위치를 돌리면 시나리오를 다시 고를 것)", () => {
  assert.equal(menuArmOf(MENU_USER), "menu");
  assert.equal(menuArmOf(LEGACY_USER), "legacy");
});

// ── 새 리딩(/api/consultations/tarot) ──
test("새 리딩 — 메뉴판 그룹 + 옛 번들(expectedCost 없음) + 가격이 다른 상품(원카드 화면 10 · 서버 15): 409 · DB·별을 하나도 안 건드린다", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1), { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: "price_changed", cost: 15 });
  assert.deepEqual(r.ops, []); // 잔액 조회·중복 방어·리딩 생성·차감 전부 그 전에 끝났다
  assert.deepEqual(r.world.spends, []);
  assert.deepEqual(r.world.tables.readings, []);
});

test("새 리딩 — 메뉴판 그룹 + 화면이 옛 가격(10)을 보냄: 409 · 차감 없음", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1, { expectedCost: 10 }), { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: "price_changed", cost: 15 });
  assert.deepEqual(r.ops, []);
  assert.deepEqual(r.world.spends, []);
});

test("새 리딩 — 메뉴판 그룹 + 화면이 서버 가격(15)을 보냄: 대조를 지나 잔액 확인으로", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1, { expectedCost: 15 }));
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 15);
  assert.deepEqual(r.ops, ["balance"]);
});

test("새 리딩 — 옛 그룹 + 옛 번들(필드 없음): 그대로 통과 — QA 스크립트(기본 유저 = 옛 그룹)가 타는 경로", { skip }, async () => {
  const r = await call("create", LEGACY_USER, createBody("one_card", 1));
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 10);
  assert.deepEqual(r.ops, ["balance"]);
});

test("새 리딩 — 메뉴판 그룹 + 옛 번들 + 두 그룹 가격이 같은 상품(3장 25): 통과", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("three_card", 3));
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 25);
  assert.deepEqual(r.ops, ["balance"]);
});

// ── 이어가기 deep(/api/readings/continue) ──
test("이어가기 deep — 타로 부모(원카드) + 메뉴판 그룹 + 옛 번들(팝업 6 · 서버 9): 409 · 부모 확인만 하고 잔액·생성·차감 전", { skip }, async () => {
  const r = await call("continue", MENU_USER, continueBody(), { balance: 100, tables: withParent("tarot", "one_card", MENU_USER) });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: "price_changed", cost: 9 });
  assert.deepEqual(r.ops, ["select readings", "select messages"]);
  assert.deepEqual(r.world.spends, []);
  assert.equal(r.world.tables.readings.length, 1); // 새 리딩 없음
});

test("이어가기 deep — 타로 부모 + 메뉴판 그룹 + 화면이 서버 가격(9)을 보냄: 통과", { skip }, async () => {
  const r = await call("continue", MENU_USER, continueBody({ expectedCost: 9 }), { tables: withParent("tarot", "one_card", MENU_USER) });
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 9);
  assert.deepEqual(r.ops, ["select readings", "select messages", "balance"]);
});

test("이어가기 deep — 타로 부모 + 옛 그룹 + 옛 번들(필드 없음): 통과(6)", { skip }, async () => {
  const r = await call("continue", LEGACY_USER, continueBody(), { tables: withParent("tarot", "one_card", LEGACY_USER) });
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 6);
});

test("이어가기 deep — 사주 부모는 대조하지 않는다(메뉴판 그룹 · 필드 없음이든 엉뚱한 값이든 통과)", { skip }, async () => {
  for (const extra of [{}, { expectedCost: 999 }]) {
    const r = await call("continue", MENU_USER, continueBody(extra), { tables: withParent("saju", null, MENU_USER) });
    assert.equal(r.status, 402, JSON.stringify({ extra, body: r.body }));
    assert.equal(r.body.required, 12, JSON.stringify(extra));
  }
});
