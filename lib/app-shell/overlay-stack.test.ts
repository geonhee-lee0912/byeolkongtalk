import { test } from "node:test";
import assert from "node:assert/strict";
import { createOverlayStack, onceClose, shouldDismissSheet } from "./overlay-stack.ts";

test("맨 위부터 닫는다 — closeTop 은 마지막에 올린 것만", () => {
  const s = createOverlayStack(() => {});
  const log: string[] = [];
  s.push(() => log.push("a"));
  s.push(() => log.push("b"));
  assert.equal(s.closeTop(), true);
  assert.deepEqual(log, ["b"]);
});

test("빈 스택의 closeTop 은 false", () => {
  assert.equal(createOverlayStack(() => {}).closeTop(), false);
});

test("잠금은 첫 창에서 걸고 마지막이 풀릴 때만 푼다", () => {
  const calls: boolean[] = [];
  const s = createOverlayStack((l) => calls.push(l));
  const ra = s.push(() => {});
  const rb = s.push(() => {});
  rb();
  assert.deepEqual(calls, [true]);
  ra();
  assert.deepEqual(calls, [true, false]);
});

test("제거는 두 번 불러도 한 번만 — 다른 창의 자리를 빼지 않는다", () => {
  const s = createOverlayStack(() => {});
  const ra = s.push(() => {});
  s.push(() => {});
  ra();
  ra();
  assert.equal(s.size(), 1);
});

test("끌어내리기 — 120px 넘으면 닫고, 짧아도 빠르면 닫는다", () => {
  assert.equal(shouldDismissSheet(121, 0), true);
  assert.equal(shouldDismissSheet(119, 0.1), false);
  assert.equal(shouldDismissSheet(30, 0.7), true);
  assert.equal(shouldDismissSheet(20, 2), false); // 24px 미만은 속도가 빨라도 탭으로 본다
  assert.equal(shouldDismissSheet(-50, 3), false); // 위로 끈 것
});

test("onceClose — 연타해도 한 번", () => {
  let n = 0;
  const c = onceClose(() => n++);
  c();
  c();
  assert.equal(n, 1);
});
