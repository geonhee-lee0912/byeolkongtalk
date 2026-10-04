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
  // 궁금함·요청 표현은 물음표 없이도 묻는 중, 마무리 패턴이 섞이면("봐줘서 고마워") 마무리
  ["그 사람도 그렇게 생각할지 궁금해", true, false],
  ["그 사람 마음 좀 봐줘", true, false],
  ["나 이제 어떡해", true, false],
  ["봐줘서 고마워", false, true],
  // 접속어(근데·그리고…)로 말을 이으면 뒷말이 본론 — "고마워 근데 …" 는 뒷말로 판정
  ["고마워 근데 궁금한 게 있어", true, false],
  ["알겠어 근데 걔 마음 좀 봐줘", true, false],
  ["고마워 근데 별콩아 진짜 고마워", false, true],
  ["그렇구나 그리고 다음 달은 어떨까", true, false],
  // 길이 규칙은 접속어 앞을 포함한 전체 문장 기준, "고마웠~" 도 마무리
  ["그 사람이랑 사귄 지 3개월인데 요즘 연락이 뜸해졌어. 근데 내가 먼저 연락하면 부담스러워할까봐 못 하겠어", true, false],
  ["시험에 또 떨어졌어. 하지만 괜찮은 척하고 있어 그리고 사실 너무 속상해서 잠도 안 와", true, false],
  ["정말 고마웠어", false, true],
  // 마무리어는 말끝 15자 안에서만 — 하소연 중간의 감사 표현은 마무리가 아니다
  ["걔가 그때 내 얘기 들어줘서 정말 고마웠는데 요즘은 연락도 뜸하고 나한테 관심이 없는 것 같아서 너무 서운해", true, false],
  ["고마워 별콩아 덕분에 힘이 났어", false, false],
  // 작별어(갈게·안녕·잘 자…)도 마무리 신호 — 긴 작별 인사도 마무리로 본다
  ["오늘 얘기 정말 고마웠어 덕분에 마음이 많이 편해졌어 이제 푹 자러 갈게 내일 또 보자", false, true],
  ["잘 자 별콩아", false, true],
  ["안녕", false, true],
];

for (const [text, asking, closing] of cases) {
  test(`classifyUserTurn — "${text}"`, () => {
    assert.deepEqual(classifyUserTurn(text), { asking, closing });
  });
}
