import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUserTurn } from "./user-turn.ts";

const cases: [string, boolean, boolean][] = [
  // [발화, asking, closing]
  ["그 사람 속마음은 어때?", true, false],
  ["그럼 언제쯤 연락 올까", true, false],
  ["나한테 마음이 있긴 한 건지", true, false],
  ["고마워 별콩아", false, true],
  ["응", false, true],
  ["ㅇㅇ", false, true],
  ["알겠어", false, true],
  ["음 그렇구나", false, true],
  ["고마워! 근데 언제 연락 올까?", true, false],
  ["요즘 연락이 뜸해져서 내가 뭘 잘못했나 계속 생각하게 되고 밤에 잠도 잘 못 자고 있어", true, false],
  ["오늘 얘기 정말 고마워 덕분에 마음이 많이 편해졌어 다음에 또 올게 별콩아 진짜로 고마워", false, true],
  ["너무 힘들어", false, false],
  ["", false, false],
  // "~ㄴ지/~ㄹ지" 간접 의문은 질문, 받침이 다른 평서 "~지" 는 중립
  ["연락이 올지", true, false],
  ["그 사람 마음이 괜찮은지", true, false],
  ["알겠어 근데 걔는 날 어떻게 생각하는 건지", true, false],
  ["그렇지", false, false],
  ["좋지 ㅎㅎ", false, false],
];

for (const [text, asking, closing] of cases) {
  test(`classifyUserTurn — "${text}"`, () => {
    assert.deepEqual(classifyUserTurn(text), { asking, closing });
  });
}
