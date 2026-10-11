import { test } from "node:test";
import assert from "node:assert/strict";
import { PENDING_KEY } from "../emotions.ts";
import { TAROT_SPREAD_KEY, type TarotSpreadSelection } from "./session.ts";
import type { DrawnCard } from "./spreads.ts";
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
  // 진짜 스프레드는 그대로 통과(one_card 만 받는 검사가 아니다)
  s.setItem(PENDING_DRAW_KEY, JSON.stringify({ ...base, spreadType: "reunion_deep_7" }));
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
