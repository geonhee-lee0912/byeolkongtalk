import { test } from "node:test";
import assert from "node:assert/strict";
import { createScreenCache, ownerFromStoredUser } from "./screen-cache.ts";

test("비어 있으면 undefined, 쓴 값은 같은 사람에게 그대로 돌아온다", () => {
  let owner: string | null = "A";
  const c = createScreenCache(() => owner);
  assert.equal(c.read("mypage"), undefined);
  c.writeAs(c.owner(), "mypage", { balance: 3 });
  assert.deepEqual(c.read("mypage"), { balance: 3 });
});

test("로그인한 사람이 바뀌면 이전 사람의 기억은 전부 사라진다", () => {
  let owner: string | null = "A";
  const c = createScreenCache(() => owner);
  c.writeAs(c.owner(), "mypage", { balance: 3 });
  c.writeAs(c.owner(), "readings", [1, 2]);
  owner = "B";
  assert.equal(c.read("mypage"), undefined);
  owner = "A";
  assert.equal(c.read("readings"), undefined, "A 로 돌아와도 되살아나지 않는다");
});

test("로그아웃(주인 없음)이면 읽지도 쓰지도 않는다", () => {
  let owner: string | null = "A";
  const c = createScreenCache(() => owner);
  c.writeAs(c.owner(), "mypage", { balance: 3 });
  owner = null;
  assert.equal(c.read("mypage"), undefined);
  c.writeAs(c.owner(), "mypage", { balance: 9 });
  owner = "A";
  assert.equal(c.read("mypage"), undefined);
});

test("주인을 못 읽으면(저장소 막힘) 기억하지 않는다", () => {
  const c = createScreenCache(() => {
    throw new Error("blocked");
  });
  c.writeAs(c.owner(), "mypage", 1);
  assert.equal(c.read("mypage"), undefined);
});

test("주인 = 저장된 로그인 정보의 회원 id — 닉네임만 바뀌어도 같은 사람, 깨진 값·id 없음은 주인 없음", () => {
  assert.equal(ownerFromStoredUser(JSON.stringify({ id: "u1", nickname: "가" })), "u1");
  assert.equal(ownerFromStoredUser(JSON.stringify({ nickname: "가", id: "u1" })), "u1");
  assert.equal(ownerFromStoredUser(JSON.stringify({ nickname: "가" })), null);
  assert.equal(ownerFromStoredUser("{깨짐"), null);
  assert.equal(ownerFromStoredUser(null), null);
});

test("writeAs — 화면을 연 회원과 지금 회원이 같을 때만 기억한다(Codex PR #23 P1: 다른 탭에서 A→B 로 바뀐 뒤 A 화면이 쓰면 버린다)", () => {
  let owner: string | null = "A";
  const c = createScreenCache(() => owner);
  const openedBy = c.owner();
  assert.equal(openedBy, "A");
  owner = "B";
  c.writeAs(openedBy, "readings", ["A의 상담"]);
  assert.equal(c.read("readings"), undefined, "A 의 목록이 B 이름으로 남으면 안 된다");
  c.writeAs("B", "readings", ["B의 상담"]);
  assert.deepEqual(c.read("readings"), ["B의 상담"]);
  c.writeAs(null, "mypage", 1);
  assert.equal(c.read("mypage"), undefined, "연 회원이 없으면(로그인 전) 기억하지 않는다");
});
