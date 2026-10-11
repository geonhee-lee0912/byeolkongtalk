import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMOTION_OPTIONS, PENDING_KEY } from "../emotions.ts";
import { TAROT_SPREAD_KEY, type TarotSpreadSelection } from "./session.ts";
import { SPREAD_INFO, type DrawnCard, type SpreadType } from "./spreads.ts";
import {
  EMOTION_KEY,
  PENDING_DRAW_KEY,
  PENDING_DRAW_TTL_MS,
  clearPendingDraw,
  loadPendingDraw,
  matchesSelection,
  parseResume,
  restoreSession,
  resumeHref,
  savePendingDraw,
} from "./pending-draw.ts";

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const sel: TarotSpreadSelection = {
  spreadType: "one_card",
  spreadCategory: "love",
  emotion: "걔 속마음이 궁금해",
  concern: "걔가 요즘 연락이 뜸해서 마음이 쓰여",
  consented: true,
};
const drawn: DrawnCard[] = [{ position: 0, label: "지금 그 사람의 마음", card_id: 6, direction: "upright" }];
const T0 = 1_760_000_000_000;

test("저장 → 불러오기 그대로(동의 표시 포함)", () => {
  const s = memStore();
  savePendingDraw(s, sel, drawn, T0);
  const p = loadPendingDraw(s, T0 + 1000);
  assert.ok(p);
  assert.equal(p.concern, sel.concern);
  assert.equal(p.spreadType, "one_card");
  assert.equal(p.consented, true);
  assert.deepEqual(p.drawnCards, drawn);
});

test("동의 없는 선택은 consented 를 싣지 않는다", () => {
  const s = memStore();
  savePendingDraw(s, { ...sel, consented: undefined }, drawn, T0);
  assert.equal(loadPendingDraw(s, T0)?.consented, undefined);
});

test("7일 지나면 지우고 null", () => {
  const s = memStore();
  savePendingDraw(s, sel, drawn, T0);
  assert.equal(loadPendingDraw(s, T0 + PENDING_DRAW_TTL_MS + 1), null);
  assert.equal(s.m.has(PENDING_DRAW_KEY), false);
});

test("깨진 값·모양이 다른 값은 지우고 null", () => {
  const s = memStore();
  s.setItem(PENDING_DRAW_KEY, "{not json");
  assert.equal(loadPendingDraw(s, T0), null);
  assert.equal(s.m.has(PENDING_DRAW_KEY), false);
  s.setItem(PENDING_DRAW_KEY, JSON.stringify({ v: 1, concern: "x", drawnCards: [] }));
  assert.equal(loadPendingDraw(s, T0), null);
  s.setItem(PENDING_DRAW_KEY, JSON.stringify({ v: 1, emotion: "e", concern: "c", spreadType: "one_card", spreadCategory: "love", savedAt: T0, drawnCards: [{ card_id: 1 }] }));
  assert.equal(loadPendingDraw(s, T0), null);
});

test("모르는 스프레드 종류는 지우고 null — 복원값이 뽑기 화면의 SPREAD_INFO[…] 조회로 곧장 흘러간다", () => {
  const s = memStore();
  const base = { v: 1, emotion: sel.emotion, concern: sel.concern, spreadCategory: "love", savedAt: T0, drawnCards: drawn };
  // 배포로 이름이 바뀌고 남은 저장 · `in` 으로 검사하면 통과하는 프로토타입 키까지
  for (const spreadType of ["legacy_spread", "", "constructor", "toString", "__proto__"]) {
    s.setItem(PENDING_DRAW_KEY, JSON.stringify({ ...base, spreadType }));
    assert.equal(loadPendingDraw(s, T0), null, `spreadType=${JSON.stringify(spreadType)}`);
    assert.equal(s.m.has(PENDING_DRAW_KEY), false, `spreadType=${JSON.stringify(spreadType)} 는 지워야 한다`);
  }
  // 진짜 스프레드는 그대로 통과(one_card 만 받는 검사가 아니다) — 뽑은 장수가 그 스프레드 장수(7장)여야 한다
  const seven = Array.from({ length: SPREAD_INFO.reunion_deep_7.cardCount }, (_, i) => ({ position: i, label: `자리 ${i + 1}`, card_id: i, direction: "upright" }));
  s.setItem(PENDING_DRAW_KEY, JSON.stringify({ ...base, spreadType: "reunion_deep_7", drawnCards: seven }));
  assert.equal(loadPendingDraw(s, T0)?.spreadType, "reunion_deep_7");
});

test("저장소가 던져도(가득 참·차단) 앱이 죽지 않는다", () => {
  const throwing = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("full"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => savePendingDraw(throwing, sel, drawn, T0));
  assert.equal(loadPendingDraw(throwing, T0), null);
  assert.doesNotThrow(() => clearPendingDraw(throwing));
});

test("matchesSelection — 같은 스프레드·같은 고민만", () => {
  const s = memStore();
  savePendingDraw(s, sel, drawn, T0);
  const p = loadPendingDraw(s, T0)!;
  assert.equal(matchesSelection(p, sel), true);
  assert.equal(matchesSelection(p, { ...sel, spreadType: "three_card" }), false);
  assert.equal(matchesSelection(p, { ...sel, concern: "다른 고민이야 열 자 넘게" }), false);
  assert.equal(matchesSelection(p, null), false);
});

test("restoreSession — 기존 화면들이 읽는 sessionStorage 키 셋을 다시 채운다", () => {
  const s = memStore();
  savePendingDraw(s, sel, drawn, T0);
  const session = memStore();
  const restored = restoreSession(session, loadPendingDraw(s, T0)!);
  assert.deepEqual(restored, sel);
  assert.equal(session.getItem(EMOTION_KEY), sel.emotion);
  assert.deepEqual(JSON.parse(session.getItem(PENDING_KEY)!), { emotion: sel.emotion, concern: sel.concern, type: "tarot" });
  assert.deepEqual(JSON.parse(session.getItem(TAROT_SPREAD_KEY)!), sel);
});

test("이어가기 주소 — resume=login|payment|home 만", () => {
  assert.equal(resumeHref("login"), "/tarot/draw?resume=login");
  assert.equal(parseResume("?resume=payment&login=success"), "payment");
  assert.equal(parseResume("?resume=home"), "home");
  assert.equal(parseResume("?resume=evil"), null);
  assert.equal(parseResume(""), null);
});

test("clearPendingDraw 는 키를 지운다", () => {
  const s = memStore();
  savePendingDraw(s, sel, drawn, T0);
  clearPendingDraw(s);
  assert.equal(s.m.has(PENDING_DRAW_KEY), false);
});

// ── 저장값 검증 — 지금 코드 경로(뽑기 화면 · 풀이 요청)가 믿고 읽는 모양만 통과시킨다 ─────────────────────────────

const validRaw: Record<string, unknown> = {
  v: 1,
  emotion: sel.emotion,
  concern: sel.concern,
  spreadType: "one_card",
  spreadCategory: "love",
  consented: true,
  drawnCards: drawn,
  savedAt: T0,
};
const MISSING = Symbol("missing");

/** raw 에 한 필드만 바꿔(MISSING = 키 삭제) 저장소에 넣고 읽는다 */
function loadWith(field: string, value: unknown, base: Record<string, unknown> = validRaw) {
  const s = memStore();
  const raw: Record<string, unknown> = { ...base };
  if (value === MISSING) delete raw[field];
  else raw[field] = value;
  s.setItem(PENDING_DRAW_KEY, JSON.stringify(raw));
  return { s, loaded: loadPendingDraw(s, T0) };
}

function assertRejected(field: string, value: unknown, base?: Record<string, unknown>) {
  const { s, loaded } = loadWith(field, value, base);
  const shown = value === MISSING ? "(빠짐)" : JSON.stringify(value);
  assert.equal(loaded, null, `${field}=${shown} 는 받으면 안 된다`);
  assert.equal(s.m.has(PENDING_DRAW_KEY), false, `${field}=${shown} 로 거른 저장은 지워야 한다 — 남기면 방문마다 같은 검사를 되풀이한다`);
}

test("기준 저장은 통과한다 — 아래 검사들이 '다른 이유로' 떨어지지 않게 하는 대조", () => {
  const s = memStore();
  s.setItem(PENDING_DRAW_KEY, JSON.stringify(validRaw));
  assert.ok(loadPendingDraw(s, T0));
});

test("필수 필드는 빠지거나 타입이 틀리면 지우고 null — 필드마다 표로", () => {
  const table: Array<[string, unknown[]]> = [
    ["v", [MISSING, 2, "1", null, true]],
    ["emotion", [MISSING, 1, null, {}, []]],
    ["concern", [MISSING, 1, null, "", {}]],
    ["spreadType", [MISSING, 1, null, ""]],
    ["spreadCategory", [MISSING, 1, null, {}]],
    ["savedAt", [MISSING, String(T0), null, true]],
    ["drawnCards", [MISSING, "x", {}, null, []]],
  ];
  for (const [field, bad] of table) for (const value of bad) assertRejected(field, value);
});

test("뽑은 카드 한 장의 필드도 빠지거나 타입이 틀리면 지우고 null", () => {
  const card = { position: 0, label: "지금 그 사람의 마음", card_id: 6, direction: "upright" };
  const table: Array<[string, unknown[]]> = [
    ["position", [MISSING, "0", null]],
    ["label", [MISSING, 1, null]],
    ["card_id", [MISSING, "6", null]],
    ["direction", [MISSING, "up", "UPRIGHT", null]],
  ];
  for (const [field, bad] of table) {
    for (const value of bad) {
      const c: Record<string, unknown> = { ...card };
      if (value === MISSING) delete c[field];
      else c[field] = value;
      assertRejected("drawnCards", [c]);
    }
  }
  assert.equal(loadWith("drawnCards", [null]).loaded, null);
  assert.equal(loadWith("drawnCards", ["카드"]).loaded, null);
});

test("consented 는 있으면 boolean 이어야 한다 — 문자열·숫자가 truthy 로 복원돼 선택의 타입(boolean)을 속이지 않게", () => {
  for (const bad of ["true", "false", "yes", 1, 0, null, {}, []]) assertRejected("consented", bad);
  // 없는 건 정상(동의 없이 저장한 판) · boolean 둘 다 정상
  assert.equal(loadWith("consented", MISSING).loaded?.consented, undefined);
  assert.equal(loadWith("consented", true).loaded?.consented, true);
  assert.equal(loadWith("consented", false).loaded?.consented, false);
});

test("뽑은 장수는 그 스프레드의 장수여야 한다 — 스프레드 정의가 바뀐 뒤 남은 저장·손으로 고친 값이 공개 화면 라벨 수·풀이 요청과 어긋나지 않게", () => {
  const cards = (n: number): DrawnCard[] =>
    Array.from({ length: n }, (_, i) => ({ position: i, label: `자리 ${i + 1}`, card_id: i, direction: "upright" as const }));
  for (const spreadType of Object.keys(SPREAD_INFO) as SpreadType[]) {
    const n = SPREAD_INFO[spreadType].cardCount;
    const base = { ...validRaw, spreadType };
    assert.equal(loadWith("drawnCards", cards(n), base).loaded?.drawnCards.length, n, `${spreadType}: ${n}장은 받는다`);
    assertRejected("drawnCards", cards(n - 1), base); // 한 장 모자람(0장 포함)
    assertRejected("drawnCards", cards(n + 1), base); // 한 장 넘침
  }
  // 다른 스프레드의 장수는 안 된다 — 원카드 저장에 3장
  assertRejected("drawnCards", cards(3), { ...validRaw, spreadType: "one_card" });
});

test("모르는 감정 태그·카테고리는 지우고 null — 풀이 요청 서버가 400 으로 되돌리는 값이 로그인 뒤에야 막다른 길로 드러나지 않게", () => {
  // 서버(/api/consultations/tarot)는 현행 태그·카테고리만 받는다. 배포로 이름이 바뀐 뒤 남은 저장(구 태그 포함)은 로그인·결제를 다 마치고서야 거절된다.
  // 프로토타입 키는 설정 조회(getMenu → MENU[태그].items 에서 TypeError)를 직접 죽인다 — spreadType 과 같은 종류의 구멍
  const unknowns = ["", "legacy_tag", "그 사람 마음이 궁금해", "constructor", "toString", "__proto__", "hasOwnProperty"];
  for (const value of unknowns) assertRejected("emotion", value);
  for (const value of ["", "legacy_category", "constructor", "toString", "__proto__", "hasOwnProperty"]) assertRejected("spreadCategory", value);
  // 현행 값은 전부 통과(한 가지 값만 받는 검사가 아니다)
  for (const o of EMOTION_OPTIONS) assert.equal(loadWith("emotion", o.tag).loaded?.emotion, o.tag, o.tag);
  for (const c of ["love", "interpersonal", "career", "decision", "mental", "worry", "default"]) {
    assert.equal(loadWith("spreadCategory", c).loaded?.spreadCategory, c, c);
  }
});

test("7일 기한 — 정확히 7일 전 저장까지 유효 · 1ms 넘으면 만료(지우고 null)", () => {
  assert.equal(PENDING_DRAW_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  const s = memStore();
  savePendingDraw(s, sel, drawn, T0);
  assert.ok(loadPendingDraw(s, T0 + PENDING_DRAW_TTL_MS), "정확히 TTL 전에 저장한 것은 유효");
  assert.equal(s.m.has(PENDING_DRAW_KEY), true, "유효하면 지우지 않는다");
  assert.equal(loadPendingDraw(s, T0 + PENDING_DRAW_TTL_MS + 1), null, "TTL + 1ms 는 만료");
  assert.equal(s.m.has(PENDING_DRAW_KEY), false, "만료면 지운다");
});

// ── 배선 계약 — 소스를 읽어 지키는 것. 주석 속 언급은 배선이 아니니 뺀다(`menu-session.test.ts` 와 같은 관용구) ──────────

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sourceOf = (relFromRepoRoot: string) =>
  stripComments(readFileSync(new URL(`../../${relFromRepoRoot}`, import.meta.url), "utf8"));

test("AuthBootstrap — 로그인 콜백 주소 정리에서 /tarot/draw 를 빼고, 진행 저장을 건드리지 않는다", () => {
  const code = sourceOf("components/auth/AuthBootstrap.tsx");
  const guard = code.search(/pathname\s*===\s*["']\/tarot\/draw["']/);
  const replace = code.indexOf("router.replace(");
  assert.ok(
    guard >= 0,
    "AuthBootstrap 이 /tarot/draw 를 주소 정리에서 안 빼면, 로그인 복귀한 뽑기 화면이 낸 router.push(풀이로 이동)를 이 router.replace 가 버려 화면이 '잠시만…' 에 갇힌다(커밋 227f1ca8)"
  );
  assert.ok(replace >= 0, "router.replace 호출을 못 찾았다 — 이 계약의 기준 줄이 사라졌다면 계약도 같이 고칠 것(빈 스캔 방지)");
  assert.ok(guard < replace, "/tarot/draw 제외는 router.replace 보다 앞에서 return 해야 한다 — 뒤에 있으면 이미 replace 한 뒤다");
  assert.equal(
    /pending[-_]?draw/i.test(code),
    false,
    "AuthBootstrap 은 진행 저장(pending-draw · clearPendingDraw · PENDING_DRAW_KEY)을 건드리면 안 된다 — 로그인 동기화 때 지우면 로그인 직후 방금 뽑은 판이 사라진다(지우는 곳은 풀이 시작·로그아웃·탈퇴뿐)"
  );
});

test("마이페이지 — 로그아웃·탈퇴 둘 다 진행 저장(고민 원문)을 지운다", () => {
  const code = sourceOf("app/mypage/page.tsx");
  const calls = code.match(/clearPendingDraw\(/g)?.length ?? 0;
  assert.ok(
    calls >= 2,
    `clearPendingDraw( 호출이 ${calls}곳이다 — 로그아웃·탈퇴 둘 다 지워야 한다. 안 지우면 공용 기기에 고민 원문이 최대 7일 남고, 다음 사람이 뽑기 화면에서 그 판을 이어 보게 된다(스펙 §10)`
  );
});
