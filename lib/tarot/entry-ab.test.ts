import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTRY_AB,
  ENTRY_FLOW_KEY,
  ENTRY_LAST_CHARS,
  entryArmForMode,
  entryArmOf,
  entryFeaturesOn,
  entryFeaturesOnFor,
  isNewFlowGuest,
} from "./entry-ab.ts";
import { MENU_AB } from "./menu-ab.ts";

const anon = (last: string) => `55555555-5555-4555-8555-55555555555${last}`;

test("익명 쿠키 끝 글자 짝수(0 2 4 6 8 a c e) = 새 흐름, 홀수 = 옛 흐름 — 메뉴판이 반반이 아닐 때", () => {
  for (const c of "02468ace") assert.equal(entryArmForMode(anon(c), "split", "menu"), "new", c);
  for (const c of "13579bdf") assert.equal(entryArmForMode(anon(c), "split", "menu"), "old", c);
  assert.equal(entryArmForMode(anon("A"), "split", "legacy"), "new"); // 대문자도 같은 그룹
});

test("쿠키 없음·빈 값 = 옛 흐름", () => {
  assert.equal(entryArmForMode(null, "split", "menu"), "old");
  assert.equal(entryArmForMode(undefined, "split", "menu"), "old");
  assert.equal(entryArmForMode("", "split", "menu"), "old");
});

test("스위치가 'new'·'old' 면 전원 한쪽", () => {
  assert.equal(entryArmForMode(anon("1"), "new", "menu"), "new");
  assert.equal(entryArmForMode(anon("0"), "old", "menu"), "old");
});

test("🔴 가드 — 메뉴판이 반반(split)이면 스위치와 무관하게 전원 옛 흐름(로그인 전후 가격 어긋남 방지)", () => {
  assert.equal(entryArmForMode(anon("0"), "split", "split"), "old");
  assert.equal(entryArmForMode(anon("0"), "new", "split"), "old");
});

test("새 장치(진행 저장·회원 충전 왕복 복원)는 스위치가 old 가 아니고 메뉴판이 반반이 아닐 때만", () => {
  assert.equal(entryFeaturesOnFor("old", "menu"), false);
  assert.equal(entryFeaturesOnFor("split", "split"), false);
  assert.equal(entryFeaturesOnFor("split", "menu"), true);
  assert.equal(entryFeaturesOnFor("new", "legacy"), true);
});

test("구현 중 기본 스위치 = old — 켤 때 이 테스트도 같이 고칠 것(지우지 말 것)", () => {
  assert.equal(ENTRY_AB, "old");
  assert.equal(entryArmOf(anon("0")), "old");
  assert.equal(entryFeaturesOn(), false); // 새 장치(진행 저장·회원 충전 왕복 복원)도 꺼진 채 배포된다
});

// 입구 반반은 메뉴판 판정이 끝나 MENU_AB 를 승자로 고정한 뒤에만 켠다 — 둘 다 반반이면 런타임 가드가 입구를 조용히 전원 old 로 막아 2주를 날린다
test("입구 반반을 켰으면 메뉴판 반반은 끝나 있어야 한다(MENU_AB 승자 고정)", () => {
  if (ENTRY_AB !== "old") assert.notEqual(MENU_AB, "split");
});

test("고민 쓰기 안내 키는 고정 문자열", () => {
  assert.equal(ENTRY_FLOW_KEY, "byeolkong:entry_flow");
});

test("isNewFlowGuest — 지갑이 '새 흐름 비로그인'일 때만", () => {
  assert.equal(isNewFlowGuest(null), false);
  assert.equal(isNewFlowGuest(undefined), false);
  assert.equal(isNewFlowGuest({ isGuest: true, entryArm: "new" }), true);
  assert.equal(isNewFlowGuest({ isGuest: false, entryArm: "new" }), false);
  assert.equal(isNewFlowGuest({ isGuest: true, entryArm: "old" }), false);
});

/** SQL 본문 — 주석을 지우고 줄끝을 LF 로 맞춘다(주석 속 같은 문구는 그룹식이 아니다) */
const sqlBody = (f: string) =>
  readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n").replace(/--.*$/gm, "");

test("감시·판정 SQL 의 그룹식이 전부 앱과 같은 규칙(anon_id 끝 글자 · 같은 집합)을 쓴다", () => {
  for (const f of ["scripts/entry-ab-daily-check.sql", "scripts/entry-ab-verdict.sql"]) {
    const sql = sqlBody(f);
    const exprs = [...sql.matchAll(/position\(\s*lower\(\s*right\(\s*([^)]*?)\s*\)\s*\)\s*in\s*'([0-9a-f]+)'\s*\)\s*>\s*0/g)];
    assert.ok(exprs.length > 0, `${f}: 그룹식을 못 찾았다`);
    for (const [, arg, set] of exprs) {
      assert.equal(set, ENTRY_LAST_CHARS, `${f}: 끝 글자 집합이 앱과 다르다`);
      assert.match(arg, /^(\w+\.)?anon_id\s*,\s*1$/, `${f}: anon_id 끝 글자로 가르지 않는다 — ${arg}`);
    }
    // 모양이 다른 그룹식(예: right(x,1) in ('0','2',…))이 섞여도 어긋난 채 통과하지 않게 — 'new' 로 가르는 자리 수 = 위에서 읽은 그룹식 수
    const newBranches = [...sql.matchAll(/then\s+'new'/g)].length;
    assert.equal(exprs.length, newBranches, `${f}: then 'new' ${newBranches}곳 중 ${exprs.length}곳만 같은 모양이다`);
  }
});
