import { test } from "node:test";
import assert from "node:assert/strict";
import { replayMessages } from "./replay";

const u = (content: string) => ({ role: "user" as const, content });
const a = (content: string) => ({ role: "assistant" as const, content });

test("맨 앞 내 말이 이 고민과 같으면 뺀다(결과 화면 위 '나의 고민'과 겹친다)", () => {
  assert.deepEqual(replayMessages([u("연락이 뜸해졌어"), a("응"), u("더")], "연락이 뜸해졌어"), [a("응"), u("더")]);
});

test("앞뒤 공백은 무시하고 비교한다", () => {
  assert.deepEqual(replayMessages([u(" 고민 \n"), a("응")], "고민"), [a("응")]);
});

test("맨 앞이 고민과 다르거나 별콩이 말이면 그대로 둔다", () => {
  assert.deepEqual(replayMessages([u("다른 말"), a("응")], "고민"), [u("다른 말"), a("응")]);
  assert.deepEqual(replayMessages([a("안녕"), u("고민")], "고민"), [a("안녕"), u("고민")]);
});
