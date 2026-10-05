import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUserTurn } from "./user-turn.ts";
import { clarifierSyntheticMessage } from "./clarifier-message.ts";

// 기존 표는 {asking, closing} 만 고정한다 — closingExplicit(⑥) 은 아래 전용 테스트가 맡는다
const ac = (text: string) => {
  const { asking, closing } = classifyUserTurn(text);
  return { asking, closing };
};

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

  // --- 짧은 입력: 말끝 앞 글자가 없어도(jongseong 의 `if (!ch) return -1` 가드) 예외 없이 중립 ---
  ["지", false, false],
  ["가요", false, false],
  ["니까", false, false],
  ["니까요", false, false],
  ["지ㅋㅋ", false, false],

  // --- '나다' 복합 서술 "~나요" 는 평서 — 물음표가 붙거나 목록 밖 "~나요" 는 질문 ---
  ["계속 생각나요", false, false],
  ["눈물나요", false, false],
  ["화나요", false, false],
  ["생각나요?", true, false],
  ["되나요", true, false],
  ["이거 하나요", true, false],

  // --- 스킨톤 수정자(Emoji_Modifier)·밑줄도 말끝 꼬리다 ---
  ["연락 올까요 \u{1F64F}\u{1F3FD}", true, false], // 합장 이모지 + 스킨톤 수정자
  ["언제 올까 ㅠ_ㅠ", true, false],
];

for (const [text, asking, closing] of cases) {
  test(`classifyUserTurn — "${text}"`, () => {
    assert.deepEqual(ac(text), { asking, closing });
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

// 어휘 핀 — 단독 발화로 각 마무리어(강한 것·약한 것·짧은 동의)가 한 번씩 closing 이 되는지
test("classifyUserTurn — 마무리어 어휘 (단독 발화는 closing)", () => {
  const words = [
    "감사합니다", "고맙습니다", "고마웠어", "또 올게", "갈게", "바이바이", "ㅂㅂ", // 강
    "알겠어", "알았어", "그렇구나", "이해했어", "맞네", "충분해", "이만", "마무리할게", "됐어", "ㅇㅋ", "오키", // 약
    "그래", "네네", "웅", "엉", "넹", // 짧은 동의
  ];
  for (const w of words) assert.deepEqual(ac(w), { asking: false, closing: true }, w);
});

// 어휘 핀 — 질문 어미·요청 어휘가 단독 발화로 asking 이 되는지
test("classifyUserTurn — 질문 어미·요청 어휘 (단독 발화는 asking)", () => {
  for (const w of ["그게 맞니", "그게 말이 되냐", "나한테 마음이 있긴 한 건가", "말해줘", "어떻게 해야 돼", "궁금해", "어때"]) {
    assert.equal(classifyUserTurn(w).asking, true, w);
  }
});

// ☆ 꼬리 (★ 는 이모지 꼬리 루프에 있다)
test("classifyUserTurn — ☆ 꼬리", () => {
  assert.equal(classifyUserTurn("언제쯤 연락 올까☆").asking, true);
});

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

// 계약 핀: 보조 카드 구매 직후 클라가 보내는 synthetic 메시지(lib/tarot/clarifier-message.ts — page.tsx handleClarifierDrawn 이 쓴다)는 asking 이어야 한다.
// 재개한 대화의 이 턴은 대개 자연 마무리선 턴이라 asking 만 keep-open 을 만든다 — 아니면 방금 산 카드 풀이가 곧장 대화를 닫는다.
test("classifyUserTurn — 보조 카드 구매 직후 synthetic 메시지는 asking", () => {
  for (const cardDesc of [
    "'컵 2' (정방향)",
    "카드 한 장", // handleClarifierDrawn 의 cardDesc 폴백
  ]) {
    const msg = clarifierSyntheticMessage(cardDesc);
    assert.equal(classifyUserTurn(msg).asking, true, msg);
  }
});

// ── closingExplicit — keep-open ⑥ 이 쓰는 '명시적 마무리어' 신호 (사용자 결정 2026-10-04: 질문에 대한 '응/네'는 답이다) ──
// closing 은 단독 짧은 동의("응"·"네"·"그래"·"ㅇㅇ")도 마무리 신호로 센다. 그런데 별콩이가 질문으로 끝낸 직후의 "응" 은 마무리가 아니라 대답이다.
// 그 맥락을 아는 쪽(⑥)은 감사·작별·수긍·종결 같은 명시적 마무리어만 마무리로 보는 closingExplicit 을 쓴다. closing 자체는 그대로(가산 변경).
test("classifyUserTurn — closingExplicit: 단독 짧은 동의는 closing 이어도 explicit 이 아니다", () => {
  for (const w of ["응", "네", "네네", "ㅇㅇ", "ㅇㅇㅇ", "그래", "웅", "넹", "엉", " 응 ", "응.", "넹ㅎㅎ", "네~"]) {
    const r = classifyUserTurn(w);
    assert.equal(r.asking, false, `${w} asking`);
    assert.equal(r.closing, true, `${w} closing`);
    assert.equal(r.closingExplicit, false, `${w} closingExplicit`);
  }
});

test("classifyUserTurn — closingExplicit: 감사·작별·수긍·종결 같은 명시적 마무리어는 explicit(= closing)", () => {
  const words = [
    "알겠어", "고마워", "그렇구나", "음 그렇구나", "고마워 별콩아", "감사합니다", "고맙습니다", "고마웠어", "또 올게", "갈게", "잘 자 별콩아", "안녕", "ㅂㅂ", // 강
    "알았어", "이해했어", "맞네", "충분해", "이만", "마무리할게", "됐어", "ㅇㅋ", "오키", // 약
  ];
  for (const w of words) {
    const r = classifyUserTurn(w);
    assert.equal(r.closingExplicit, true, `${w} closingExplicit`);
    assert.equal(r.closing, true, `${w} closing`);
  }
});

test("classifyUserTurn — closingExplicit: 질문·요청이 섞이면 마무리어가 있어도 false, 중립도 false", () => {
  for (const w of ["고마워 어때", "고마워! 근데 언제 연락 올까?", "알겠어 이거 알려줘", "일주일 전쯤", "아니 아직 연락 안 했어", "맞아", "너무 힘들어", ""]) {
    assert.equal(classifyUserTurn(w).closingExplicit, false, JSON.stringify(w));
  }
});

test("classifyUserTurn — closingExplicit 은 closing 의 부분집합이고, 그 차이는 단독 짧은 동의뿐이다(기존 표 전체)", () => {
  const SHORT_AGREE = /^(?:응+|ㅇㅇ+|그래|네+|웅+|넹|엉)[.!~ㅎㅋ\s]*$/; // 헤더가 정의한 '단독 짧은 동의'
  for (const [text] of cases) {
    const r = classifyUserTurn(text);
    if (r.closingExplicit) {
      assert.equal(r.closing, true, `${text} explicit ⇒ closing`);
      assert.equal(r.asking, false, `${text} explicit ⇒ !asking`);
    }
    if (r.closing && !r.closingExplicit) assert.ok(SHORT_AGREE.test(text.trim()), `${text} closing 이지만 explicit 이 아니면 단독 짧은 동의여야 한다`);
  }
});

test("classifyUserTurn — 보조 카드 구매 직후 synthetic 메시지는 마무리 신호가 아니다(closing·closingExplicit 모두 false)", () => {
  const r = classifyUserTurn(clarifierSyntheticMessage("'컵 2' (정방향)"));
  assert.equal(r.closing, false);
  assert.equal(r.closingExplicit, false);
});

// ── 작별 구(句) — keep-open ⑥ 의 명시적 마무리어 확대 (사용자 결정 2026-10-04: 명시적 마무리어는 닫는다) ──
// 재검토에서 흔한 한국어 작별 25개 중 17개가 closingExplicit 이 아니어서, 별콩이가 질문한 직후 "이제 그만할게" 라고 해도 ⑥ 이 대화를 열어 뒀다.
// 그만·여기까지·가볼게·잘게 같은 낱말을 약한 마무리어에 넣으면 "연락 그만할게"·"그 카페 한번 가볼게" 같은 연애 답을 닫으므로 구(句)로 넣고,
// 말끝 창이 아니라 '발화 전체가 [군말…] + 구 (+ 호칭)' 일 때만 센다 — 대상·주어가 붙은 문장은 마무리가 아니다. asking 판정은 그대로(약한 마무리어).
const GOODBYES: string[] = [
  // 오늘은 여기까지
  "오늘은 여기까지 할게", "오늘은 여기까지 할게요", "오늘은 여기까지 할게요 ㅎㅎ", "오늘은 여기까지만 할게!", "여기까지 할게", "오늘은 여기까지",
  "오늘은 여기까지요~", "오늘은 여기까지 하자", "일단 여기까지 할게",
  // 그만 / 끝
  "이제 그만할게", "이제 그만할게요", "그만할래", "그만할래요", "이제 그만 할래~", "음 이제 그만할게요 ㅎㅎ", "그럼 이제 그만할게요", "별콩아 이제 그만할게",
  "이제 끝낼게", "이제 끝낼게요", "이제 끝낼래", "오늘은 끝낼게",
  // 다시 올게 / 다음에 봐
  "나중에 다시 올게", "나중에 다시 올게요", "다음에 다시 올게요~", "다시 올게요", "나중에 올게", "곧 다시 올게",
  "다음에 또 얘기하자", "다음에 또 얘기해요", "다음에 봐", "다음에 봐요", "다음에 봐~", "다음에 보자", "나중에 얘기하자",
  // 잘 있어 / 수고했어
  "잘 있어", "잘 있어요", "잘 있어~", "그럼 잘 있어", "별콩아 잘 있어",
  "수고했어", "수고했어요", "오늘 수고했어", "수고했어 별콩아", "수고하셨어요", "오늘 정말 수고했어요 ㅎㅎ",
  // 잘게 / 쉴게 / 가볼게 / 빠이
  "잘게", "잘게요", "나 잘게", "이제 잘게", "먼저 잘게요", "푹 잘게 ㅎㅎ", "그럼 잘게!",
  "이제 쉴게", "이제 쉴게요", "푹 쉴게요", "나 이제 쉴게", "좀 쉴게",
  "이제 가볼게", "이제 가볼게요", "그럼 가볼게요", "이만 가볼게", "나 가볼게", "들어가볼게", "들어가볼게요", "들어가 볼게요", "이제 들어가볼게",
  "빠이", "빠이빠이", "빠이~", "빠이 별콩아", "빠잇",
  // 존댓말·군말·호칭·주제 표지(나는·저는)가 섞인 변형 — 답 군말(응·네·아니)이 앞에 와도 작별이다
  "그럼 오늘은 여기까지 할게요~", "다음에 봐요 별콩아~", "아니 이제 그만할게", "응 이제 그만할게요", "네 오늘은 여기까지 할게요", "나 이제 그만할래",
  "나 먼저 잘게", "오늘은 이만 잘게", "이제 슬슬 가볼게요", "오늘도 수고했어요", "정말 수고했어", "저는 이제 가볼게요", "나는 이제 쉴게", "저 이제 가볼게요", "그럼 먼저 가볼게요",
  // 고생 / 자야겠다 / 자러 갈게 / 잘래 — 잘 쓰는데 빠져 있던 작별(사용자 결정 2026-10-04)
  "고생했어", "고생했어요", "고생 많았어", "고생 많았어요", "오늘도 고생 많았어요", "고생하셨어요", "별콩아 고생했어", "그럼 고생했어",
  "이제 자야겠다", "이제 자야겠어요", "나 이제 자야겠어", "슬슬 자야겠다", "자야겠다", "자야겠어요", "이제 자러 갈게", "자러 갈게",
  "이제 잘래", "잘래요", "나 이제 잘래", "잘래",
  // 수고해 / 굿밤 / 가야겠다 / 바빠서 이만 / 오늘은 쉴게 — 최종 리뷰가 찾은 빠진 작별(2026-10-05)
  "수고해", "수고해요", "오늘도 수고해", "별콩아 수고해", "수고하세요",
  "굿밤", "굿밤 별콩아", "굿나잇", "굿나잇~", "이제 굿밤",
  "이제 가야겠다", "나 이제 가야겠어", "그럼 이제 가야겠다", "슬슬 가야겠어요", "이만 가야겠어요", "먼저 가야겠다",
  "바빠서 이만", "나 바빠서 이만", "바빠서 이만할게요",
  "오늘은 쉴게", "오늘은 쉴게요", "그럼 오늘은 쉴게", "오늘 쉴게",
];

// 연애 답과 겹치는 모양 — 마무리가 아니다(질문 직후에 닫으면 답을 자르는 쪽이 더 비싸다)
const NOT_GOODBYES: string[] = [
  "이제 그만 연락하래", "이제 그만 만나자고 했어", "연락 그만할게", "그 사람이랑 이제 끝낼게", "이제 연락 안 할래", "이제 그만 잊을게", "그만 만날래", "그만 가볼게 그 얘기는",
  "여기까지 왔는데 어떡해", "여기까지 온 거야", "우리 사이는 여기까지", "이제 여기까지인 것 같아", "여기까지", "오늘은 여기까지 왔어", "오늘은 여기까지 한대",
  "그 카페 한번 가볼게", "가볼게", "한번 가볼게", "내일 그 사람한테 가볼게", "그 사람 보러 가볼게", "응 가볼게", "일단 가볼게",
  "다음에 봐야 할까?", "다음에 봐야 해", "다음에 봐야지", "다음에 봐야겠다", "다음에 보면 말해볼게", "다음에 또 만날 것 같아", "나중에 다시 올게라고 했어", "다시 올 거야", "걔가 다시 올 것 같아",
  "걔는 잘 있어", "응 잘 있어", "그 사람 잘 있어",
  "걔가 수고했어라고 했어", "수고했어 한마디도 못 했어",
  "걔 앞에선 잘게", "그 사람이랑 잘게",
  "연애 쉴게", "쉴게", "이제 연애 쉴게", "끝낼게", "빠이팅",
  // 같은 낱말이 다른 동사·대상과 붙은 연애 문장 — 군말 뒤에 구가 아닌 말이 오면 구가 아니다
  "나 이제 그 사람 안 만날게", "이제 그만 만날게", "나 그만 가볼게 그 사람 집에", "내일 또 연락해볼게", "다음에 또 연락할게", "오늘은 여기까지 해보자",
  "그 사람이 나중에 다시 올게요라고 했어", "이제 그 사람 얘기는 그만할게", "그 얘기는 그만할래", "걔랑은 이제 끝낼게", "나 이제 그 사람 쉴게",
  // 고생·자야겠다·잘래 와 같은 낱말의 연애 답·일상 얘기 — 주어·대상·부정이 붙으면 작별이 아니다
  "걔가 고생 많았대", "요즘 잠을 못 자", "나 진짜 고생했어", "나 고생했어", "고생 많이 했어", "걔도 고생했어", "그 사람 고생했어", "정말 고생했어",
  "걔랑 자야겠다", "혼자 잘래", "안 잘래", "걔랑은 안 잘래", "그 사람 때문에 못 자겠어",
  // 수고해·굿밤·가야겠다·이만·쉴게 가 대상·내용과 붙은 연애 답 — 가야겠다는 가볼게처럼 맥락어(이제·그럼 …)가 있어야 작별이다
  "걔한테 수고해라고 했어", "수고해야지", "걔한테 굿밤 보냈어", "가야겠다", "그 카페 가야겠다", "걔한테 가야겠다", "응 가야겠다",
  "바빠서 연락을 못 했어", "바빠서 이만큼밖에 못 해", "오늘은 연애 쉴게", "오늘은 걔 생각 쉴게",
  // 별콩이 질문의 대답 — "직접 만나보는 건 어때?" → "그럼 가야겠다", "오늘 연락해 볼 거야?" → "아니 오늘은 쉴게" (최종 리뷰 2026-10-05)
  "그럼 가야겠다", "응 그럼 가야겠다", "나 가야겠어", "그러면 가야겠네", "아니 오늘은 쉴게", "응 오늘은 쉴게", "네 오늘은 쉴게요",
];

test("classifyUserTurn — 작별 구는 명시적 마무리어다: closingExplicit·closing 둘 다 true, asking 은 false", () => {
  for (const g of GOODBYES) {
    const r = classifyUserTurn(g);
    assert.equal(r.asking, false, `${g} asking`);
    assert.equal(r.closingExplicit, true, `${g} closingExplicit`);
    assert.equal(r.closing, true, `${g} closing`);
  }
});

test("classifyUserTurn — 연애 답과 겹치는 모양은 마무리가 아니다(closingExplicit false)", () => {
  for (const s of NOT_GOODBYES) assert.equal(classifyUserTurn(s).closingExplicit, false, s);
});

test("classifyUserTurn — 작별 구 표 전체에서도 closingExplicit ⇒ closing && !asking", () => {
  for (const s of [...GOODBYES, ...NOT_GOODBYES]) {
    const r = classifyUserTurn(s);
    if (r.closingExplicit) {
      assert.equal(r.closing, true, `${s} explicit ⇒ closing`);
      assert.equal(r.asking, false, `${s} explicit ⇒ !asking`);
    }
  }
});

test("classifyUserTurn — 작별 구는 약한 마무리어라 asking 을 건드리지 않는다: 긴 고민 끝의 '이제 그만할게' 는 여전히 묻는 중, 앞에 접속어·대상이 붙으면 구가 아니다", () => {
  // 40자 이상 + 약한 마무리어 → 긴 고민 판정이 그대로 asking (강한 마무리어·짧은 동의만 막는다)
  const long = "요즘 그 사람이랑 연락이 뜸해져서 너무 속상하고 힘든데 어떻게 해야 할지 모르겠어서 이제 그만할게";
  assert.ok(long.length >= 40);
  assert.deepEqual({ asking: classifyUserTurn(long).asking, explicit: classifyUserTurn(long).closingExplicit }, { asking: true, explicit: false });
  // 접속어(근데) 뒷말이 본론 — 뒷말이 작별 구면 마무리, 앞말이 구여도 뒷말이 질문이면 질문
  assert.equal(classifyUserTurn("알겠어 근데 이제 그만할게").closingExplicit, true);
  assert.equal(classifyUserTurn("이제 그만할게 근데 하나만 더 물어봐도 돼?").closingExplicit, false);
});

test("classifyUserTurn — 작별 구 판정은 선형이다(8000자 적대적 입력)", () => {
  const inputs = [
    "음 ".repeat(4000),
    "이제 ".repeat(2666) + "x",
    "별콩아 ".repeat(1300) + "잘 있어",
    "오늘은 여기까지 ".repeat(500) + "할게",
    "ㅎ".repeat(8000),
  ];
  const t0 = performance.now();
  for (const s of inputs) classifyUserTurn(s);
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `${inputs.length} adversarial inputs took ${ms.toFixed(0)}ms`);
});

// ── 약한 마무리어도 '발화 전체'일 때만 (사용자 결정 2026-10-04: 질문에 대한 답은 열어 두고, 마무리 신호만 닫는다) ──
// 약한 마무리어(알겠·알았·그렇구나·이해했/됐/돼·맞네·충분·이만·마무리·됐어·ㅇㅋ·오키)는 말끝 15자 창의 부분 문자열로 셌다 — 그래서 별콩이 질문에 대한 '답'이
// ("그 사람이 알겠다고 했어"·"충분히 노력했어"·"이만큼 좋아했는데"·"마무리 짓고 싶어"·"잘 안 됐어") 마무리로 분류돼 ⑥ 이 대화를 닫았다.
// 작별 구와 같은 방식으로 '발화 전체 = [군말…] + 표현 (+ 호칭)' 이고, 연속된 마무리 표현("알겠어 이제 그만할게")은 절마다 마무리 표현이면 센다.
// 강한 마무리어(고마워·감사·갈게·안녕 …)는 그대로(말끝 15자 창).
const WEAK_CLOSERS: string[] = [
  // 알겠 / 알았
  "알겠어", "알겠어요", "알겠습니다", "알겠다", "알겠네", "알겠음", "응 알겠어", "네 알겠습니다", "아 알겠어", "음 알겠어요", "그래 알겠어", "아하 알겠어", "알겠어~",
  "알겠어 ㅎㅎ", "알겠어 별콩아", "알겠어 그럼", "알았어", "알았어요", "알았습니다", "응 알았어",
  // 그렇구나 / 이해 / 맞네
  "그렇구나", "그렇구나~", "아 그렇구나", "음 그렇구나", "아하 그렇구나", "이해했어", "이해했어요", "이해됐어", "이해돼", "이해했습니다", "맞네", "아 맞네", "맞네요",
  // 충분 / 이만 / 마무리 / 됐어
  "충분해", "충분해요", "충분합니다", "이제 충분해", "이만", "그럼 이만", "이만할게", "이만 할게요", "이만 줄일게요", "이만 마칠게",
  "마무리할게", "마무리하자", "이제 마무리할게요", "슬슬 마무리하자", "됐어", "됐어요", "이제 됐어", "응 됐어", "그럼 됐어",
  // ㅇㅋ / 오키
  "ㅇㅋ", "ㅇㅋㅋ", "ㅇㅋㅇㅋ", "오키", "오키오키", "ㅇㅋ~", "응 ㅇㅋ",
  // 연속된 마무리 표현 — 절마다 마무리 표현이면 마무리다
  "알겠어 알겠어", "그렇구나 알겠어", "알겠어 이제 그만할게", "응 알겠어 오늘은 여기까지 할게요", "네 알겠습니다 이만 가볼게요", "알겠어 그럼 이만", "ㅇㅋ 알겠어", "알겠어, 이제 그만할게",
  "알겠어 고마워", // 강한 마무리어와의 조합 — 강한 쪽이 이미 닫는다
  // 감탄사·말줄임·이모지·맞장구가 붙은 변형
  "오 맞네", "맞네 맞네", "아~ 알겠어", "음… 알겠어", "ㅇㅋ😊", "알았어 알았어", "알겠어 그래", "알겠어 그럼요", "이제 이해됐어", "그럼 이만~", "이만 마칠게요 별콩아",
  "알겠어, 그럼 이만 가볼게요 ㅎㅎ", "ㅇㅋ 그럼 이제 그만할게", "그렇구나 이제 알겠어 고마워", "응응 알겠어", "네네 알겠습니다", "넵 알겠습니다",
  "알겠어 알겠어 이제 그만할게", // 3절까지 이어져도 절마다 마무리 표현이면 마무리다
];

// 같은 낱말이 다른 말과 붙은 답 — 마무리가 아니다(질문 직후에 닫으면 답을 자르는 쪽이 더 비싸다)
const WEAK_ANSWERS: string[] = [
  // 코디네이터가 든 6개
  "충분히 노력했어", "그 사람이 알겠다고 했어", "이만큼 좋아했는데", "마무리 짓고 싶어", "걔가 알았다고 하더라", "그 정도면 충분한 것 같아",
  // 같은 모양
  "잘 안 됐어", "연락은 안 됐어", "그 사람이랑은 잘 됐어", "걔 마음은 이해돼", "내가 이해했다고 말했어", "마무리해야 하는데 막막해", "알았다고 했어", "알겠다고 했어",
  "알겠는데 못 하겠어", "이만하면 충분히 했지", "충분한 시간이 필요해", "이해했어도 마음은 안 풀려",
  // 마무리 표현 뒤에 내용이 이어지면 마무리가 아니다
  "아 그렇구나 그럼 기다려볼게", "알겠어 연락 그만할게", "그렇구나 걔가 그런 거구나", "맞네 걔가 그랬네", "알겠어 그 사람한테 연락해볼게", "알겠어 근데 걔는 뭐래",
  // 마무리 표현이 낱말로 든 문장·내용이 이어지는 문장
  "알겠어 그래도 걔가 보고 싶어", "알겠어 그 사람한테 말해볼게", "그렇구나 걔는 날 안 좋아하는 거구나", "맞네 걔는 원래 그랬어", "충분히 생각해봤어", "충분히 이해했어", "충분해 보여",
  "이만큼은 해줬어", "이만하면 됐지", "마무리를 못 짓겠어", "마무리가 안 돼", "됐어 그 사람 얘기는 하기 싫어", "됐어 이제 연락 안 해", "알았어 연락 안 할게",
  "ㅇㅋ 근데 그 사람이 싫대", "ㅇㅋ 그 사람한테 말해볼게", "알겠다고 했는데 마음은 안 풀려", "이해했어 근데 서운해", "그 사람이 이만하재", "걔가 마무리하자고 했어",
  "내가 알겠다고 했어", "그 정도면 충분해", // '그 정도면' 은 군말이 아니다 — 무엇에 대한 충분인지 모르는 답일 수 있어 열어 둔다
  "걔가 안 온대 알겠어", "연락 안 하기로 했어 알았어", // 앞에 내용이 있고 끝에만 마무리 표현 — 절마다 마무리 표현이어야 하므로 아니다
  "알겠는데", "알겠다고", "알았는데", "충분히", "이만큼", "마무리는", // 마무리 표현의 앞머리만 있는 한 낱말(뒷말이 이어질 말) — 끝맺는 꼴이 아니다
];

test("classifyUserTurn — 약한 마무리어는 발화 전체일 때 명시적 마무리어다(군말·존댓말·꼬리·호칭·연속 표현 포함): closingExplicit·closing true, asking false", () => {
  for (const s of WEAK_CLOSERS) {
    const r = classifyUserTurn(s);
    assert.equal(r.asking, false, `${s} asking`);
    assert.equal(r.closingExplicit, true, `${s} closingExplicit`);
    assert.equal(r.closing, true, `${s} closing`);
  }
});

test("classifyUserTurn — 약한 마무리어가 든 '답'은 마무리가 아니다(closingExplicit false)", () => {
  for (const s of WEAK_ANSWERS) assert.equal(classifyUserTurn(s).closingExplicit, false, s);
});

test("classifyUserTurn — 약한 마무리어 표 전체에서도 closingExplicit ⇒ closing && !asking, 답 표는 closing 도 아니다", () => {
  for (const s of [...WEAK_CLOSERS, ...WEAK_ANSWERS]) {
    const r = classifyUserTurn(s);
    if (r.closingExplicit) {
      assert.equal(r.closing, true, `${s} explicit ⇒ closing`);
      assert.equal(r.asking, false, `${s} explicit ⇒ !asking`);
    }
  }
  // 답 표 — 마무리 표현이 낱말로 든 문장은 단독 짧은 동의도 아니므로 closing 도 false (asking 은 따로)
  for (const s of WEAK_ANSWERS) assert.equal(classifyUserTurn(s).closing, false, `${s} closing`);
});

test("classifyUserTurn — 약한 마무리어는 여전히 asking 을 건드리지 않는다: 긴 고민 끝의 '이제 알겠어' 는 묻는 중, 접속어 뒷말이 본론", () => {
  const long = "요즘 그 사람이랑 연락이 뜸해져서 너무 속상하고 힘든데 어떻게 해야 할지 모르겠어서 이제 알겠어";
  assert.ok(long.length >= 40);
  const r = classifyUserTurn(long);
  assert.deepEqual({ asking: r.asking, explicit: r.closingExplicit }, { asking: true, explicit: false });
  assert.equal(classifyUserTurn("그런데 말이야 걔 마음은 알겠어").closingExplicit, false); // 앞에 내용이 있다
  assert.equal(classifyUserTurn("걔 얘기는 됐고 근데 이제 알겠어").closingExplicit, true); // 접속어(근데) 뒷말이 본론
});

test("classifyUserTurn — 마무리 표현 판정은 선형이다(8000자 적대적 입력: 연속 표현·군말 반복)", () => {
  const inputs = [
    "알겠어 ".repeat(1300),
    "응 ".repeat(4000) + "알겠어",
    "ㅇㅋ ".repeat(2000),
    "알겠어 알겠어 알겠어 알겠어 알겠어 알겠어 알겠어 알겠어 알겠어",
    "알겠어".repeat(1300),
    "이제 그만 ".repeat(800) + "할게",
  ];
  const t0 = performance.now();
  for (const s of inputs) classifyUserTurn(s);
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `${inputs.length} adversarial inputs took ${ms.toFixed(0)}ms`);
});
