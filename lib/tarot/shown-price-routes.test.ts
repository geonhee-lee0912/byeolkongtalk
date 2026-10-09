// 화면이 본 가격 대조(409 PRICE_CHANGED) — 실제 라우트(POST)를 가짜 DB 위에서 돌린다.
// 라우트가 import 하는 supabase·session·stars·logger 를 clarifier-race.fakes.ts 로 바꿔 끼우는 방식은 clarifier-race.test.ts 와 같다.
// 지키는 것: 가격이 어긋나면 잔액 조회·중복 방어·리딩 생성·차감 어느 것보다 먼저 409 로 끝난다(별·행이 안 움직인다 · WARN 한 줄) ·
//          어긋나지 않으면(옛 그룹 + 필드 없음 · 메뉴판 + 맞는 값 · 두 그룹 가격이 같은 상품 · 사주 부모) 대조를 지나 다음 단계로 간다(WARN 없음).
//          "지났다"는 잔액 0 으로 두고 잔액 확인의 402 로 본다(가짜 DB 는 insert 를 흉내 내지 않는다 — 그 뒤는 이번 변경과 무관).
// 맨 아래는 화면 쪽 계약 — expectedCost 를 싣는 세 자리(소스로 묶는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { join } from "node:path";
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

/** 409 응답 — error = 옛 번들이 data.error 를 그대로 찍는 사용자 문구 · code = 새 화면이 판단하는 값 */
const priceChanged = (cost: number) => ({ error: "가격이 바뀌었어 — 다시 확인해줘", code: "PRICE_CHANGED", cost });
/** 막을 때 남기는 WARN(설계된 정상 신호) — 메시지가 error_logs fingerprint 의 씨앗이라 바꾸면 어드민 묶음도 바뀐다 */
const WARN_MESSAGE = "PRICE_CHANGED: 화면이 본 가격과 서버 가격이 달라 차감 전에 막았다(409)";
/** 막을 때 남는 WARN 한 줄(가짜 logWarn 이 받은 그대로) — user_id 로 그룹을 세고, 화면 값(판정과 같은 정규화 · 없으면 "missing")과 서버 가격을 남긴다 */
const warnOnce = (route: string, userId: string, extra: Record<string, unknown>) => [
  { reqId: 0, message: WARN_MESSAGE, ctx: { route, userId, extra } },
];

const skip = registerHooks ? false : "module.registerHooks 가 없는 Node(< 22.15) — 라우트 의존성을 바꿔 끼울 수 없다";

test("전제 — 반반(split): 시나리오 유저의 그룹(스위치를 돌리면 시나리오를 다시 고를 것)", () => {
  assert.equal(menuArmOf(MENU_USER), "menu");
  assert.equal(menuArmOf(LEGACY_USER), "legacy");
});

// ── 새 리딩(/api/consultations/tarot) ──
test("새 리딩 — 메뉴판 그룹 + 옛 번들(expectedCost 없음) + 가격이 다른 상품(원카드 화면 10 · 서버 15): 409 · DB·별을 하나도 안 건드린다", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1), { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, priceChanged(15));
  assert.deepEqual(r.ops, []); // 잔액 조회·중복 방어·리딩 생성·차감 전부 그 전에 끝났다
  assert.deepEqual(r.world.spends, []);
  assert.deepEqual(r.world.tables.readings, []);
  assert.deepEqual(
    r.world.warns,
    warnOnce("/api/consultations/tarot", MENU_USER, { spread: "one_card", arm: "menu", expected: "missing", cost: 15 }),
  );
});

test("새 리딩 — 메뉴판 그룹 + 화면이 옛 가격(10)을 보냄: 409 · 차감 없음", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1, { expectedCost: 10 }), { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, priceChanged(15));
  assert.deepEqual(r.ops, []);
  assert.deepEqual(r.world.spends, []);
  assert.deepEqual(
    r.world.warns,
    warnOnce("/api/consultations/tarot", MENU_USER, { spread: "one_card", arm: "menu", expected: 10, cost: 15 }),
  );
});

test("새 리딩 — 옛 그룹 유저가 어긋난 숫자(메뉴판 가격 15)를 보냄: 409 — 숫자가 오면 그룹과 무관하게 그 값이어야 한다", { skip }, async () => {
  const r = await call("create", LEGACY_USER, createBody("one_card", 1, { expectedCost: 15 }), { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, priceChanged(10));
  assert.deepEqual(r.ops, []);
  assert.deepEqual(
    r.world.warns,
    warnOnce("/api/consultations/tarot", LEGACY_USER, { spread: "one_card", arm: "legacy", expected: 15, cost: 10 }),
  );
});

test("새 리딩 — 숫자가 아닌 expectedCost(\"15\")는 없는 것: 메뉴판 원카드면 409 · WARN 의 expected 도 판정처럼 \"missing\"", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1, { expectedCost: "15" }), { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.world.warns[0]?.ctx?.extra?.expected, "missing");
});

test("새 리딩 — 이어가기(fresh · previousReadingId)도 부모 검증보다 먼저 409: 없는 부모여도 부모 조회조차 안 한다(DB 호출 0)", { skip }, async () => {
  const body = createBody("one_card", 1, { previousReadingId: "no-such-parent", continuationMode: "fresh" });
  const r = await call("create", MENU_USER, body, { balance: 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body)); // 부모를 먼저 봤다면 400 invalid_previous_reading
  assert.deepEqual(r.body, priceChanged(15));
  assert.deepEqual(r.ops, []);
  assert.deepEqual(r.world.spends, []);
});

test("새 리딩 — 메뉴판 그룹 + 화면이 서버 가격(15)을 보냄: 대조를 지나 잔액 확인으로", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("one_card", 1, { expectedCost: 15 }));
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 15);
  assert.deepEqual(r.ops, ["balance"]);
  assert.deepEqual(r.world.warns, []);
});

test("새 리딩 — 옛 그룹 + 옛 번들(필드 없음): 그대로 통과 — QA 스크립트(기본 유저 = 옛 그룹)가 타는 경로", { skip }, async () => {
  const r = await call("create", LEGACY_USER, createBody("one_card", 1));
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 10);
  assert.deepEqual(r.ops, ["balance"]);
  assert.deepEqual(r.world.warns, []);
});

test("새 리딩 — 메뉴판 그룹 + 옛 번들 + 두 그룹 가격이 같은 상품(3장 25): 통과", { skip }, async () => {
  const r = await call("create", MENU_USER, createBody("three_card", 3));
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 25);
  assert.deepEqual(r.ops, ["balance"]);
  assert.deepEqual(r.world.warns, []);
});

// ── 이어가기 deep(/api/readings/continue) ──
test("이어가기 deep — 타로 부모(원카드) + 메뉴판 그룹 + 옛 번들(팝업 6 · 서버 9): 409 · 부모 확인만 하고 잔액·생성·차감 전", { skip }, async () => {
  const r = await call("continue", MENU_USER, continueBody(), { balance: 100, tables: withParent("tarot", "one_card", MENU_USER) });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body, priceChanged(9));
  assert.deepEqual(r.ops, ["select readings", "select messages"]);
  assert.deepEqual(r.world.spends, []);
  assert.equal(r.world.tables.readings.length, 1); // 새 리딩 없음
  // 이어가기는 부모 spread·mode 까지
  assert.deepEqual(
    r.world.warns,
    warnOnce("/api/readings/continue", MENU_USER, { spread: "one_card", mode: "deep", arm: "menu", expected: "missing", cost: 9 }),
  );
});

test("이어가기 deep — 타로 부모 + 메뉴판 그룹 + 화면이 서버 가격(9)을 보냄: 통과", { skip }, async () => {
  const r = await call("continue", MENU_USER, continueBody({ expectedCost: 9 }), { tables: withParent("tarot", "one_card", MENU_USER) });
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 9);
  assert.deepEqual(r.ops, ["select readings", "select messages", "balance"]);
  assert.deepEqual(r.world.warns, []);
});

test("이어가기 deep — 타로 부모 + 옛 그룹 + 옛 번들(필드 없음): 통과(6)", { skip }, async () => {
  const r = await call("continue", LEGACY_USER, continueBody(), { tables: withParent("tarot", "one_card", LEGACY_USER) });
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.required, 6);
  assert.deepEqual(r.world.warns, []);
});

test("이어가기 deep — 사주 부모는 대조하지 않는다(메뉴판 그룹 · 필드 없음이든 엉뚱한 값이든 통과)", { skip }, async () => {
  for (const extra of [{}, { expectedCost: 999 }]) {
    const r = await call("continue", MENU_USER, continueBody(extra), { tables: withParent("saju", null, MENU_USER) });
    assert.equal(r.status, 402, JSON.stringify({ extra, body: r.body }));
    assert.equal(r.body.required, 12, JSON.stringify(extra));
    assert.deepEqual(r.world.warns, [], JSON.stringify(extra));
  }
});

// ── 계약: 화면이 본 가격(expectedCost)을 싣는 세 자리 ──
// 이 필드가 리팩터로 빠지면 서버는 그 요청을 "옛 번들"로 보고 옛 그룹 가격과 대조한다 → 메뉴판 유저의 1·5·6·7장(이어가기 deep 도)이
// 전부 409 → 카드 다시 뽑기 → 또 409 로 돈다(돈은 안 빠지지만 그 상품을 영영 못 산다). tsc·빌드·유닛은 필드가 빠져도 다 통과하고
// 옛 그룹·투카드·3장은 멀쩡해서 눈으로도 늦게 잡힌다 — 그래서 소스로 묶는다.
const ROOT = join(import.meta.dirname, "..", "..");
/** 주석 속 언급은 싣는 게 아니다 — 지우고 본다(pricing.test.ts 와 같은 규칙) */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const source = (rel: string) => stripComments(readFileSync(join(ROOT, rel), "utf8"));

/** src[open] 의 여는 괄호와 짝인 닫는 괄호 사이(안쪽) — 문자열 속 괄호는 건너뛴다 */
function inside(src: string, open: number): string {
  const close: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (close[ch]) stack.push(close[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`짝 괄호를 못 찾았다(위치 ${open})`);
}

/** 객체 리터럴 안쪽에 expectedCost 가 속성 이름으로 있는가(`parsed.expectedCost` 같은 값 읽기는 아니다 · 줄임 표기 포함) */
const hasExpectedCostKey = (objectBody: string) => /(?:^|[{,\s])expectedCost\s*[:,}]|(?:^|[{,\s])expectedCost\s*$/.test(objectBody);

/** fetch("<url>", …) 호출의 body: JSON.stringify({…}) 안쪽 */
function fetchJsonBody(src: string, url: string): string {
  const at = src.indexOf(`fetch(${JSON.stringify(url)},`);
  assert.ok(at >= 0, `fetch(${JSON.stringify(url)}, …) 를 못 찾았다 — 호출 모양이 바뀌었으면 이 계약도 같이 고칠 것`);
  const args = inside(src, src.indexOf("(", at));
  const s = args.indexOf("JSON.stringify(");
  assert.ok(s >= 0, `fetch(${url}) 의 body 가 JSON.stringify(…) 가 아니다`);
  return inside(args, s + "JSON.stringify".length);
}

test("계약 — 뽑기 화면은 TAROT_DRAW_KEY 에 쓰는 payload 에 expectedCost 를 싣는다", () => {
  const src = source("app/tarot/draw/page.tsx");
  assert.match(
    src,
    /sessionStorage\.setItem\(TAROT_DRAW_KEY,\s*JSON\.stringify\(payload\)\)/,
    "TAROT_DRAW_KEY 에 payload 를 쓰는 자리를 못 찾았다 — 모양이 바뀌었으면 이 계약도 같이 고칠 것",
  );
  const decl = src.indexOf("const payload");
  assert.ok(decl >= 0, "payload 선언을 못 찾았다");
  assert.ok(hasExpectedCostKey(inside(src, src.indexOf("{", decl))), "TAROT_DRAW_KEY payload 에 expectedCost 가 없다");
});

test("계약 — 대화 화면은 리딩 생성 POST(/api/consultations/tarot) 본문에 expectedCost 를 싣는다", () => {
  const body = fetchJsonBody(source("app/tarot/reading/page.tsx"), "/api/consultations/tarot");
  assert.ok(hasExpectedCostKey(body), "리딩 생성 POST 본문에 expectedCost 가 없다");
});

test("계약 — 이어가기 팝업은 continue POST(/api/readings/continue) 본문에 expectedCost 를 싣는다", () => {
  const body = fetchJsonBody(source("components/continuation/ContinuationModal.tsx"), "/api/readings/continue");
  assert.ok(hasExpectedCostKey(body), "이어가기 POST 본문에 expectedCost 가 없다");
});
