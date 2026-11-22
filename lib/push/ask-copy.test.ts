import { test } from "node:test";
import assert from "node:assert/strict";
import { askCopy } from "./ask-copy.ts";

test("askCopy — 알림까지 묻는 시트는 순간별 질문 그대로", () => {
  assert.deepEqual(askCopy("byeolmaru_first", "push"), { title: "내일 아침에도 알려줄까?", sub: "아침마다 오늘의 흐름을 별콩이가 알려줄게." });
  assert.equal(askCopy("birthday", "push").title, "생일 아침에 운세 보내줄까?");
  assert.equal(askCopy("second_launch", "push").title, "별콩이가 알려줘도 될까?");
});

test("askCopy — 광고 동의만 묻는 시트는 버튼('광고성 정보 수신 동의하기')과 맞는 질문 + 왜 동의가 필요한지(디자인 다듬기 알림 시트 ②)", () => {
  const m = askCopy("byeolmaru_first", "ad");
  assert.equal(m.title, "아침 별 흐름, 알림으로 받아볼래?");
  assert.match(m.sub, /광고 알림/);
  assert.match(m.sub, /동의가 필요해/);
  const b = askCopy("birthday", "ad");
  assert.equal(b.title, "생일 아침 운세, 알림으로 받아볼래?");
  assert.match(b.sub, /동의가 필요해/);
  assert.equal(askCopy("second_launch", "ad").title, "별콩이 소식도 받아볼래?");
});
