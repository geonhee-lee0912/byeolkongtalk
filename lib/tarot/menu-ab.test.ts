import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MENU_AB, MENU_LAST_CHARS, armForMode, menuArmOf } from "./menu-ab.ts";
import { getMenu } from "./menu.ts";
import { shopPackages } from "../constants.ts";
import { EMOTION_OPTIONS } from "../emotions.ts";
import { UI_EVENTS } from "../analytics/ui-events.ts";

const uuid = (last: string) => `44444444-4444-4444-8444-44444444444${last}`;

test("user_id 끝 글자 짝수(0 2 4 6 8 a c e) = 메뉴판, 홀수 = 옛 — SQL position(right(id,1) in '02468ace') 와 같은 규칙", () => {
  for (const c of "02468ace") assert.equal(armForMode(uuid(c), "split"), "menu", c);
  for (const c of "13579bdf") assert.equal(armForMode(uuid(c), "split"), "legacy", c);
});

test("대문자 UUID 도 같은 그룹", () => {
  assert.equal(armForMode(uuid("A"), "split"), "menu");
  assert.equal(armForMode(uuid("B"), "split"), "legacy");
});

test("비로그인·빈 값 = 옛 그룹(지금 prod 그대로)", () => {
  assert.equal(armForMode(null, "split"), "legacy");
  assert.equal(armForMode(undefined, "split"), "legacy");
  assert.equal(armForMode("", "split"), "legacy");
});

test("스위치가 'menu'·'legacy' 면 전원 한쪽", () => {
  assert.equal(armForMode(uuid("1"), "menu"), "menu");
  assert.equal(armForMode(null, "menu"), "menu");
  assert.equal(armForMode(uuid("0"), "legacy"), "legacy");
});

test("배포 기본 스위치 = split", () => {
  assert.equal(MENU_AB, "split");
  assert.equal(menuArmOf(uuid("0")), "menu");
  assert.equal(menuArmOf(uuid("1")), "legacy");
});

test("감시 쿼리(scripts/menu-ab-daily-check.sql)의 그룹식이 같은 끝 글자 집합을 쓴다", () => {
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8");
  const sets = [...sql.matchAll(/position\(\s*right\([^)]*\)\s*in\s*'([0-9a-f]+)'\s*\)\s*>\s*0/g)].map((m) => m[1]);
  assert.ok(sets.length > 0, "그룹식을 못 찾았다");
  for (const s of sets) assert.equal(s, MENU_LAST_CHARS);
  // 위 정규식은 모양이 다른 그룹식(예: right(id::text,1) in ('0','2',…))을 못 본다 — 그런 식이 SQL 에 섞여 들어와도 어긋난 채 통과하지 않게,
  // 'menu' 로 가르는 자리(then 'menu') 수와 정규식이 읽은 그룹식 수가 같은지 센다. 그룹식은 기존 모양을 복사해 쓸 것.
  const menuBranches = [...sql.matchAll(/then\s+'menu'/g)].length;
  assert.equal(sets.length, menuBranches, `then 'menu' ${menuBranches}곳 중 ${sets.length}곳만 position(right(…) in '${MENU_LAST_CHARS}') > 0 모양이다 — 다른 모양의 그룹식이 섞였다`);
});

// 감시 SQL 의 cross_arm_packages 는 "상대 그룹 진열에만 있는 패키지" 목록의 사본이다. 진열(lib/constants.ts SHOP_PACKAGE_IDS)을 바꾸고 SQL 을 안 고치면
// 엉뚱한 패키지를 세거나 진짜 교차 결제를 놓친다.
test("감시 쿼리(scripts/menu-ab-daily-check.sql)의 상대 그룹 단독 패키지 목록 = shopPackages 의 그룹별 단독 패키지", () => {
  // 주석 속 같은 문구는 목록이 아니다
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  const lists: Record<string, string[]> = {};
  for (const m of sql.matchAll(/arm\s*=\s*'(menu|legacy)'\s+and\s+package_type\s+in\s*\(([^)]*)\)/g)) {
    lists[m[1]] = [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort();
  }
  const ids = (arm: "menu" | "legacy") => shopPackages(arm).map((p) => p.id);
  const only = (a: "menu" | "legacy", b: "menu" | "legacy") => ids(a).filter((id) => !ids(b).includes(id)).sort();
  // 메뉴판 그룹이 산 것 중 옛 진열에만 있는 것(150·300) / 옛 그룹이 산 것 중 메뉴판 진열에만 있는 것(55·130)
  assert.deepEqual(lists, { menu: only("legacy", "menu"), legacy: only("menu", "legacy") });
});

test("QA 하네스 기본 유저(11111111-…-111111111111)는 옛 그룹 — QA 스크립트가 SPREAD_INFO.starCost(=옛 가격)를 기대한다", () => {
  assert.equal(armForMode("11111111-1111-4111-8111-111111111111", "split"), "legacy");
});

/** 감시 SQL 본문 — 주석을 지우고 줄끝을 LF 로 맞춘다(주석 속 같은 문구는 목록이 아니다) */
const monitorSql = () =>
  readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/--.*$/gm, "");

// 감시 SQL 의 menu_catalog 는 메뉴 카탈로그(lib/tarot/menu.ts getMenu 전체)의 사본이다. 메뉴를 바꾸고 SQL 을 안 고치면
// menu_off_catalog 가 멀쩡한 메뉴판 리딩을 '카탈로그 밖'으로 울리거나(더한 상품) 진짜 폴백을 놓친다(뺀 상품).
test("감시 쿼리(scripts/menu-ab-daily-check.sql)의 menu_catalog = getMenu 전체의 (emotion_tag, spread_type) 32개", () => {
  const block = monitorSql().match(/menu_catalog\s*\(\s*emotion_tag\s*,\s*spread_type\s*\)\s*as\s*\(\s*values\s*\n([\s\S]*?)\n\),/);
  assert.ok(block, "menu_catalog(emotion_tag, spread_type) as (values … ) 블록을 못 찾았다");
  const sqlPairs = [...block[1].matchAll(/\(\s*'([^']*)'\s*,\s*'([a-z0-9_]+)'\s*\)/g)].map((m) => `${m[1]} | ${m[2]}`);
  const menuPairs = EMOTION_OPTIONS.flatMap((o) => getMenu(o.tag)).map((p) => `${p.tag} | ${p.spreadType}`);
  assert.equal(menuPairs.length, 32);
  assert.equal(new Set(sqlPairs).size, sqlPairs.length, "menu_catalog 에 같은 조합이 두 번 있다");
  assert.deepEqual([...sqlPairs].sort(), [...menuPairs].sort());
});

// arm_leak 이 세는 메뉴판 전용 이벤트 이름은 UI_EVENTS 의 사본이다 — 이름이 바뀌거나 오타가 나면 누출이 늘 0 으로 조용히 통과한다
test("감시 쿼리(scripts/menu-ab-daily-check.sql)의 menu_only_events 이름이 모두 UI_EVENTS 에 있다", () => {
  const block = monitorSql().match(/menu_only_events\s*\(\s*event\s*\)\s*as\s*\(\s*values\s*([\s\S]*?)\n\),/);
  assert.ok(block, "menu_only_events(event) as (values … ) 블록을 못 찾았다");
  const names = [...block[1].matchAll(/\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
  assert.ok(names.length > 0, "이벤트 이름을 못 읽었다");
  const known = new Set<string>(UI_EVENTS);
  assert.deepEqual(names.filter((n) => !known.has(n)), [], "UI_EVENTS 에 없는 이벤트 이름");
});
