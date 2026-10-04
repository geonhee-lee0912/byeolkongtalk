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
  // 명시적 질문·요청은 마무리어보다 우선 / 작별어는 뒤에 한글이 붙지 않을 때만(존댓말은 따로)
  ["내일 봐야 하는데 나 어떡해", true, false],
  ["요즘 고민 때문에 밤에 잠을 잘 자지 못해", false, false],
  ["걔 요즘 바이브가 달라졌어", false, false],
  ["안녕히 주무세요", false, true],
  ["잘 자요", false, true],

  // --- 약한 마무리어(됐어·마무리·충분·이만…)는 하소연 속에도 흔해 긴 고민 판정을 막지 못한다 — 막는 건 강한 것(감사·작별)·짧은 동의뿐 ---
  ["걔랑 화해하려고 여러 번 연락도 해보고 만나자고도 했는데 결국 잘 안 됐어", true, false],
  ["일도 연애도 다 엉망인 상태에서 어떻게든 정리하고 마무리해야 하는데 막막해", true, false],

  // --- 존댓말 질문(까요·나요·ㄴ가요)·요청(주세요·줄래) — "가요" 단독("저 이제 가요")은 평서 ---
  ["연락 올까요", true, false],
  ["이거 되나요", true, false],
  ["그 사람 마음인가요", true, false],
  ["지금 연락해도 괜찮은가요", true, false],
  ["저 이제 가요", false, false],
  ["그 사람 마음 봐주세요", true, false],
  ["알려줄래", true, false],

  // --- "~니까(요)" 는 원인 접속 — 받침 ㅂ(합니까·습니까)일 때만 질문 ---
  ["그러니까", false, false],
  ["걔가 그렇게 말하니까", false, false],
  ["그러니까요", false, false], // 존댓말 "-니까요" 도 같은 원인 접속
  ["이게 맞습니까", true, false],

  // --- SHORT_AGREE 꼬리: 망설임 꼬리(…·ㅠ)는 동의가 아니고, 웃음 꼬리(ㅎ·ㅋ)는 동의다 ---
  ["응…", false, false],
  ["네ㅠㅠ", false, false],
  ["넹ㅎㅎ", false, true],

  // --- 접속어 처리: 위 케이스 중 afterLastConjunction 에만 의존하는 것은 일부뿐이라 경계를 따로 고정 ---
  ["고마워 근데 나 아직 불안해", false, false], // 접속어 앞 감사는 버린다 (접속어가 없었다면 closing=true)
  ["그 사람이랑 헤어진 지 한 달인데 아직 마음이 정리가 안 돼서 힘들어 고마워 근데 좀 불안해", true, false], // 15자 창 안의 앞쪽 감사가 긴 고민을 덮지 않는다
  ["그리고 궁금해 근데 그냥 고마워", false, true], // 마지막 접속어 기준 (처음 접속어 기준이면 궁금 때문에 asking)
  ["고마워 근데", false, true], // 접속어 뒤가 비면 전체로 폴백

  // --- 최종 원칙: 명시적 요청·질문은 같은 말 안의 마무리어보다 우선 ---
  ["알겠어 이거 알려줘", true, false],
  ["고마워 어때", true, false],
  ["알려줘서 고마워", false, true], // 인과 -줘서 는 요청이 아니라 감사
  ["말해줘서 고마워", false, true],

  // --- '?' 단독 경로 · 전각 · 접속어 앞 '?' ---
  ["진짜?", true, false],
  ["진짜？", true, false],
  ["진짜? 근데 고마워", true, false], // '?' 는 접속어 앞이어도 센다 (본문 한정 아님)

  // --- 임계값 경계 ---
  ["가".repeat(39), false, false],
  ["가".repeat(40), true, false],
  ["고마워" + "ㅁ".repeat(12), false, true], // 총 15자: 마무리어가 말끝 15자 안
  ["고마워" + "ㅁ".repeat(13), false, false], // 총 16자: 첫 글자가 창 밖

  // --- 작별어 뒤 한글 금지 / 공백 trim ---
  ["안녕하세요 별콩아", false, false],
  ["내일 봐야 해서 걱정이야", false, false], // 요청어 없이도 '내일 봐' 로 걸리면 안 된다
  ["내일 봐", false, true],
  ["내일 보자", false, true],
  [" 응 ", false, true],
  ["   ", false, false],
];

for (const [text, asking, closing] of cases) {
  test(`classifyUserTurn — "${text}"`, () => {
    assert.deepEqual(classifyUserTurn(text), { asking, closing });
  });
}

// 말끝 꼬리(문장부호·ㅠㅜㅋㅎ·공백)는 질문 어미 뒤에서도 질문으로 본다 — 꼬리 문자 집합 전체를 한 번씩
for (const tail of [".", "..", "…", "~", "!", "ㅠㅠ", "ㅜㅜ", "ㅋㅋ", "ㅎㅎ", " ", "  ㅠ ", "\n"]) {
  test(`classifyUserTurn — 질문 어미 + 꼬리 ${JSON.stringify(tail)}`, () => {
    assert.equal(classifyUserTurn("언제쯤 연락 올까" + tail).asking, true);
    assert.equal(classifyUserTurn("연락이 올지" + tail).asking, true);
  });
}

// 이모지·이모티콘 꼬리도 같다 — 서러게이트 쌍(😭)·VS16·ZWJ 시퀀스는 이스케이프로 적어 비가시 문자가 깨지지 않게 한다
for (const tail of [
  "😭", " 🥺", "💕", "♡", "★", "^^", ";;", "ㅡㅡ", "。", "！", "～", "✨🙏",
  "\u2764\uFE0F",
  "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F468}",
]) {
  test(`classifyUserTurn — 질문 어미 + 이모지 꼬리 ${JSON.stringify(tail)}`, () => {
    assert.equal(classifyUserTurn("언제쯤 연락 올까" + tail).asking, true);
    assert.equal(classifyUserTurn("연락이 올지" + tail).asking, true);
  });
}

// 회귀 가드: 8000자(MAX_MESSAGE_LEN) 적대적 입력이 선형 시간이어야 한다 (이차 백트래킹이면 입력당 180~500ms)
test("classifyUserTurn — 8000자 적대적 입력은 선형 시간으로 끝난다", () => {
  const N = 8000;
  const inputs = [
    "까" + " ".repeat(N - 2) + "x",
    "가" + "ㅋ".repeat(N - 2) + "나",
    "올지" + "ㅠ".repeat(N - 3) + "x",
    "가" + "😭".repeat(N / 2 - 2) + "나", // 서러게이트 쌍 꼬리
  ];
  const t0 = performance.now();
  for (const s of inputs) classifyUserTurn(s);
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `${inputs.length} adversarial inputs took ${ms.toFixed(0)}ms`);
});
