// 설계 §8 — 다시 묻기 상한(거절 종류별 횟수)과 순간별 1회.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAsk, type AskRecord } from "./asks.ts";

const later: AskRecord = { moment: "first_reading_end", kind: "push", answer: "later" };
const acceptedNoAd: AskRecord = { moment: "first_reading_end", kind: "push", answer: "accepted" };
const base = { os: "undetermined" as const, ad: "none" as const, subscriber: false };

test("첫 질문 — 첫 상담 끝은 늘 연다, 한 번만", () => {
  assert.equal(nextAsk({ ...base, moment: "first_reading_end", asks: [] }), "push");
  assert.equal(nextAsk({ ...base, os: "granted", ad: "granted", moment: "first_reading_end", asks: [] }), "push");
  assert.equal(nextAsk({ ...base, moment: "first_reading_end", asks: [later] }), null);
});

test("두 번째 실행 — 첫 질문이 없을 때 한 번. 첫 상담 끝 질문을 받았으면 안 묻는다", () => {
  assert.equal(nextAsk({ ...base, moment: "second_launch", asks: [] }), "push");
  assert.equal(nextAsk({ ...base, moment: "second_launch", asks: [later] }), null);
  assert.equal(nextAsk({ ...base, moment: "second_launch", asks: [{ moment: "second_launch", kind: "push", answer: "later" }] }), null);
  // 이미 알림 켜짐 + 광고도 정함 → 물을 것 없음
  assert.equal(nextAsk({ ...base, os: "granted", ad: "withdrawn", moment: "second_launch", asks: [] }), null);
  assert.equal(nextAsk({ ...base, os: "granted", ad: "none", moment: "second_launch", asks: [] }), "push");
});

test("첫 질문 전에는 다시 묻는 순간이 와도 묻지 않는다", () => {
  for (const moment of ["reading_end", "byeolmaru_first", "birthday"] as const) {
    assert.equal(nextAsk({ ...base, moment, asks: [] }), null, moment);
    assert.equal(nextAsk({ ...base, os: "granted", moment, asks: [] }), null, moment);
  }
});

test("① 나중에 — 리딩 끝·별마루 첫 방문에서 최대 2번", () => {
  assert.equal(nextAsk({ ...base, moment: "reading_end", asks: [later] }), "push");
  assert.equal(nextAsk({ ...base, moment: "byeolmaru_first", asks: [later] }), "push");
  assert.equal(nextAsk({ ...base, moment: "birthday", asks: [later] }), null);
  const two: AskRecord[] = [later, { moment: "reading_end", kind: "push", answer: "later" }, { moment: "byeolmaru_first", kind: "push", answer: "later" }];
  for (const moment of ["reading_end", "byeolmaru_first", "birthday"] as const) assert.equal(nextAsk({ ...base, moment, asks: two }), null, moment);
  // 같은 순간은 한 번만
  assert.equal(nextAsk({ ...base, moment: "reading_end", asks: [later, { moment: "reading_end", kind: "push", answer: "later" }] }), null);
});

test("② 알림은 허용, 광고만 미동의 — 별마루 첫 방문·생일에서 광고만 최대 2번", () => {
  const g = { ...base, os: "granted" as const };
  assert.equal(nextAsk({ ...g, moment: "byeolmaru_first", asks: [acceptedNoAd] }), "ad");
  assert.equal(nextAsk({ ...g, moment: "birthday", asks: [acceptedNoAd] }), "ad");
  assert.equal(nextAsk({ ...g, moment: "reading_end", asks: [acceptedNoAd] }), null);
  const two: AskRecord[] = [acceptedNoAd, { moment: "byeolmaru_first", kind: "ad", answer: "later" }, { moment: "birthday", kind: "ad", answer: "later" }];
  assert.equal(nextAsk({ ...g, moment: "birthday", asks: two }), null);
  // 앞서 알림 켜기로 두 번 다시 물었어도 광고 상한은 따로 센다
  const pushTwice: AskRecord[] = [later, { moment: "reading_end", kind: "push", answer: "later" }, { moment: "byeolmaru_first", kind: "push", answer: "accepted" }];
  assert.equal(nextAsk({ ...g, moment: "birthday", asks: pushTwice }), "ad");
  // 구독자는 별마루에서 광고를 묻지 않는다(아침 흐름이 이미 정보성으로 간다)
  assert.equal(nextAsk({ ...g, subscriber: true, moment: "byeolmaru_first", asks: [acceptedNoAd] }), null);
  assert.equal(nextAsk({ ...g, subscriber: true, moment: "birthday", asks: [acceptedNoAd] }), "ad");
  // 이미 동의했으면 묻지 않는다
  assert.equal(nextAsk({ ...g, ad: "granted", moment: "birthday", asks: [acceptedNoAd] }), null);
});

test("③ OS 거부 — 다시 묻지 않는다(다시 볼 날 고를 때 안내 한 줄만)", () => {
  for (const moment of ["reading_end", "byeolmaru_first", "birthday"] as const) {
    assert.equal(nextAsk({ ...base, os: "denied", moment, asks: [{ moment: "first_reading_end", kind: "push", answer: "os_denied" }] }), null);
  }
});

test("④ 광고 철회 — 먼저 묻지 않는다", () => {
  for (const moment of ["byeolmaru_first", "birthday"] as const) {
    assert.equal(nextAsk({ ...base, os: "granted", ad: "withdrawn", moment, asks: [acceptedNoAd] }), null);
  }
});
