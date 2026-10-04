import { test } from "node:test";
import assert from "node:assert/strict";
import { clarifierSyntheticMessage, isClarifierSyntheticMessage } from "./clarifier-message.ts";

// ⑦ (사용자 결정 2026-10-04): '한 장 더'로 다시 연 직후의 카드 풀이 턴만 열어 두기 가이드를 받는다. 턴 수만으로 찾으면 보조 카드를 대화 중에 일찍 산 리딩이
// 나중에 같은 턴 수를 지날 때도 걸리므로, 그 턴의 유저 말이 구매 직후 클라가 자동으로 보낸 synthetic 메시지인지도 본다.

test("isClarifierSyntheticMessage — 클라가 만드는 문구(카드명·방향 / 카드 설명 폴백)는 true", () => {
  for (const cardDesc of ["'컵 2' (정방향)", "'The Fool' (역방향)", "카드 한 장"]) {
    assert.equal(isClarifierSyntheticMessage(clarifierSyntheticMessage(cardDesc)), true, cardDesc);
  }
});

test("isClarifierSyntheticMessage — 평범한 유저 말·빈 문자열·문구 조각은 false", () => {
  for (const text of [
    "그 사람은 어떻게 생각해?",
    "",
    "방금 보조 카드로",
    "방금 보조 카드로 뽑았어. 봐줘",
    "지금까지 흐름이랑 이어서 봐줘",
    "보조 카드를 더 뽑았어",
  ]) {
    assert.equal(isClarifierSyntheticMessage(text), false, JSON.stringify(text));
  }
});

test("isClarifierSyntheticMessage — 앞뒤에 글자·공백·개행이 더 붙으면 false(앵커)", () => {
  const msg = clarifierSyntheticMessage("'컵 2' (정방향)");
  for (const text of [`${msg} 그리고 궁금한 게 있어`, `먼저 ${msg}`, ` ${msg}`, `${msg} `, `${msg}\n`]) {
    assert.equal(isClarifierSyntheticMessage(text), false, JSON.stringify(text));
  }
});

test("isClarifierSyntheticMessage — 카드 설명이 비면 false(최소 한 글자)", () => {
  assert.equal(isClarifierSyntheticMessage(clarifierSyntheticMessage("")), false);
  assert.equal(isClarifierSyntheticMessage(clarifierSyntheticMessage("a")), true);
});

test("판정은 clarifierSyntheticMessage 와 같은 템플릿에서 나온다 — 카드 설명에 고정 문구가 섞여도 감지되고, 템플릿엔 자리표시가 한 번만 있다(드리프트 가드)", () => {
  for (const cardDesc of ["(정방향)", "'컵 2' (정방향)를", "를 더 뽑았어", "방금 보조 카드로 X"]) {
    assert.equal(isClarifierSyntheticMessage(clarifierSyntheticMessage(cardDesc)), true, cardDesc);
  }
  // 앞·뒤 고정 문구를 템플릿에서 split 으로 뽑으므로 자리표시(${cardDesc})가 정확히 한 번이어야 한다 — 늘리면 판정이 조용히 어긋난다
  assert.equal(clarifierSyntheticMessage("\u0000").split("\u0000").length, 2);
});
