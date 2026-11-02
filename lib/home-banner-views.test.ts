import assert from "node:assert/strict";
import { test } from "node:test";
import { takeBannerView } from "./home-banner-views.ts";

function fakeStore(initial?: string) {
  const data = new Map<string, string>(initial ? [["k", initial]] : []);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

test("세 번까지 보이고 네 번째부터 안 보인다", () => {
  const s = fakeStore();
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(() => takeBannerView(s, "k", "a", 3)),
    [true, true, true, false, false]
  );
});

test("한 번 제한은 처음만 보인다", () => {
  const s = fakeStore();
  assert.deepEqual(
    [1, 2].map(() => takeBannerView(s, "k", "a", 1)),
    [true, false]
  );
});

test("대상이 바뀌면 처음부터 다시 센다", () => {
  const s = fakeStore();
  takeBannerView(s, "k", "a", 1);
  assert.equal(takeBannerView(s, "k", "b", 1), true);
  assert.equal(takeBannerView(s, "k", "b", 1), false);
});

test("저장값이 깨졌으면 처음으로 본다", () => {
  assert.equal(takeBannerView(fakeStore("{깨짐"), "k", "a", 1), true);
  assert.equal(takeBannerView(fakeStore('{"target":"a","count":"많이"}'), "k", "a", 1), true);
});

test("저장소가 던지면 보이는 쪽으로 둔다", () => {
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(takeBannerView(throwing, "k", "a", 1), true);
});
