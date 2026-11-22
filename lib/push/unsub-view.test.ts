import { test } from "node:test";
import assert from "node:assert/strict";
import { unsubCopy } from "./unsub-view.ts";

test("unsubCopy — 처리됨: 껐다 + 안내 알림은 그대로 간다는 설명 + 처리 내역 · 주 버튼 별콩톡으로", () => {
  const c = unsubCopy("done", true);
  assert.equal(c.title, "광고 알림을 껐어");
  assert.match(c.sub, /안내 알림은 그대로/);
  assert.equal(c.showNotice, true);
  assert.deepEqual([c.primary, c.secondary], ["home", "settings"]);
});

test("unsubCopy — 이미 꺼짐(처리됐지만 통지 없음)", () => {
  const c = unsubCopy("done", false);
  assert.equal(c.title, "이미 꺼져 있어");
  assert.equal(c.showNotice, false);
});

test("unsubCopy — 이미 처리됨 · 쓸 수 없는 링크는 설정이 주 버튼 · 오류는 다시 시도", () => {
  assert.equal(unsubCopy("used", false).title, "이미 처리됐어");
  const bad = unsubCopy("bad", false);
  assert.deepEqual([bad.primary, bad.secondary], ["settings", "home"]);
  const err = unsubCopy("error", false);
  assert.deepEqual([err.primary, err.secondary], ["retry", "settings"]);
});

test("unsubCopy — 처리 중엔 버튼 없음", () => {
  const w = unsubCopy("working", false);
  assert.equal(w.primary, null);
  assert.equal(w.secondary, null);
});
