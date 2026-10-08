import { test } from "node:test";
import assert from "node:assert/strict";
import { createMonologueHoldFilter, stripLeakedMonologue } from "./monologue-leak.ts";

// 테스트 문장은 전부 지어낸 것이다(리포가 공개라 실사용자 대화를 넣지 않는다). 누출 모양만 QA·prod 사례를 따랐다.
const ANSWER =
  "내가 보기엔 지금은 급하게 결론을 내리기보다, 상대가 보내는 작은 신호를 차분히 살펴보는 쪽이 맞아. " +
  "연락이 뜸해진 건 마음이 식었다기보다 각자 생활의 무게가 커진 흐름에 가까워 보여.";

test("stripLeakedMonologue — 프롬프트 내부 용어('이번 턴 신호')가 섞인 메모는 그 문장 시작부터 끝까지 잘라낸다(QA 10-04 사례 모양)", () => {
  const leak = "- 이번 턴 신호 상태가 질문이라 질문 하나 필요하지만 직전 내 턴 질문? so cannot ask. Good. final concise.";
  const r = stripLeakedMonologue(`${ANSWER}${leak}`);
  assert.equal(r.text, ANSWER);
  assert.equal(r.cut, true);
  assert.equal(r.reason, "jargon");
});

test("stripLeakedMonologue — 다른 내부 용어('턴 마무리 상태'·'직전 별콩이 턴')도 메모다", () => {
  for (const leak of [" 턴 마무리 상태가 여지라서 예고로 닫을게.", "\n직전 별콩이 턴이 질문이었으니 이번엔 질문 금지."]) {
    const r = stripLeakedMonologue(`${ANSWER}${leak}`);
    assert.equal(r.text, ANSWER, leak);
    assert.equal(r.reason, "jargon", leak);
  }
});

test("stripLeakedMonologue — 한국어 답 뒤에 메모 단어(question·answer·user …)가 든 영어가 끝까지 이어지면 잘라낸다", () => {
  for (const leak of [
    " too fast? Let's keep it short, no question at the end.",
    "..finish the answer maybe. Need no question here.",
    " Shame? no. End with summary and space, no question.",
    " least one? We need no question. Maybe finish with 여백.", // 영어 사이 한국어 한 낱말은 메모의 일부다
  ]) {
    const r = stripLeakedMonologue(`${ANSWER}${leak}`);
    assert.equal(r.cut, true, leak);
    assert.equal(r.reason, "english_tail", leak);
    assert.ok(!/[A-Za-z]{3,}/.test(r.text), `${leak} → ${r.text}`);
    assert.ok(r.text.startsWith(ANSWER.slice(0, -2)), leak);
  }
});

test("stripLeakedMonologue — 메모 안의 [END] 는 같이 지우고, 메모 뒤 맨 끝의 [END]·[RECO:…] 는 남긴다(굵게·끝 마침표 꼴도 — 남길 땐 맨 마커로)", () => {
  assert.equal(stripLeakedMonologue(`${ANSWER} Need no [END] because user still open? keep going.`).text, ANSWER);
  assert.equal(stripLeakedMonologue(`${ANSWER} so cannot ask. Good. final concise answer.\n\n[END]`).text, `${ANSWER}\n[END]`);
  assert.equal(stripLeakedMonologue(`${ANSWER} need one more card offer, no question here.\n[RECO:tarot:clarifier]`).text, `${ANSWER}\n[RECO:tarot:clarifier]`);
  assert.equal(stripLeakedMonologue(`${ANSWER} so cannot ask, no question, keep it concise.\n**[END]**`).text, `${ANSWER}\n[END]`);
  assert.equal(stripLeakedMonologue(`${ANSWER} so cannot ask, no question, keep it concise. [END].`).text, `${ANSWER}\n[END]`);
});

test("stripLeakedMonologue — 메모 바로 앞(같은 줄)의 마커는 메모가 아니다 — 남긴다", () => {
  assert.equal(stripLeakedMonologue(`${ANSWER}\n[END] so cannot ask, no question, keep it concise.`).text, `${ANSWER}\n[END]`);
  assert.equal(
    stripLeakedMonologue(`${ANSWER}\n[RECO:tarot:clarifier] so cannot ask, no question, keep it concise.`).text,
    `${ANSWER}\n[RECO:tarot:clarifier]`,
  );
});

test("stripLeakedMonologue — 마지막 정상 문장이 이모지·물결로 끝나면 거기까지는 남긴다", () => {
  for (const end of [" 응원할게 🌟", " 응원할게~", " 응원할게 ☀️", " 응원할게 👩‍❤️‍👨"]) {
    const r = stripLeakedMonologue(`${ANSWER}${end} so cannot ask, no question, keep it concise.`);
    assert.equal(r.text, `${ANSWER}${end}`, end);
  }
});

test("stripLeakedMonologue — 정상 답은 글자 하나 안 바꾼다", () => {
  for (const ok of [
    ANSWER,
    `${ANSWER}\n\n[END]`,
    // 답 중간의 영문 카드명·제목 — 뒤에 한국어 답이 이어진다
    `The Wheel of Fortune 카드가 나온 건 흐름이 바뀌는 지점이라는 뜻이야. ${ANSWER}`,
    `그 노래 'All I Want for Christmas Is You' 를 들으면 그 사람이 떠오른다고 했지. ${ANSWER}`,
    // 끝의 짧은 영어(3단어 이하)
    `${ANSWER} Good luck, 너!`,
    `${ANSWER} You got this.`,
    // 끝의 정상 영어 — 메모 단어가 없다(카드명 나열·응원 문구·노래 추천·짧은 한국어 마무리·번역 병기)
    `${ANSWER}\n🃏 오늘의 카드: The Wheel of Fortune — The Lovers — Ace of Cups`,
    `${ANSWER} You are not alone 🌙`,
    `${ANSWER} You are stronger than you think, trust yourself. 힘내!`,
    `${ANSWER}\n오늘의 노래: All You Need Is Love by The Beatles`,
    `${ANSWER} Trust the timing of your life. (네 인생의 타이밍을 믿어)`,
    // 메모 단어와 겹치는 흔한 영어 응원·번역 — question 은 'no/any/ask question' 꼴만 메모로 본다(리뷰 2026-10-05)
    `${ANSWER} Don't settle for less than you deserve 💜`,
    `${ANSWER} Remember, love is the answer.`,
    `${ANSWER} Never question your worth, okay?`,
    `${ANSWER} The answer is already within you.`,
    `${ANSWER}\nIn English: Your heart already knows the way forward.`,
    `${ANSWER}\n영어로 한 줄: Don't settle for less than you deserve.`,
    // '턴 신호' 가 낱말 속에 든 정상 말 — U턴·유턴·패턴
    `${ANSWER} 그 사람이 유턴 신호를 보낼 가능성도 있어.`,
    `${ANSWER} 그 사람이 U턴 신호를 보낼 수도 있어.`,
    `${ANSWER} 그 사람이 유 턴 신호를 보낼 수도 있어.`,
    `${ANSWER} 같은 패턴 신호가 반복되는지 살펴봐.`,
  ]) {
    const r = stripLeakedMonologue(ok);
    assert.equal(r.text, ok);
    assert.equal(r.cut, false);
  }
});

test("stripLeakedMonologue — 끝 500자보다 앞의 표현은 보지 않는다(앞쪽에서 잘못 걸린 표현이 끝의 진짜 메모를 가리지 않게)", () => {
  const early = `turn_close ${ANSWER}${" 그 마음을 천천히 들여다보면 좋겠어.".repeat(30)}`;
  assert.ok(early.length > 600);
  const r = stripLeakedMonologue(`${early} so cannot ask, no question, keep it concise.`);
  assert.equal(r.cut, true);
  assert.equal(r.reason, "english_tail");
  assert.equal(r.text, early);
});

test("stripLeakedMonologue — 한국어 답이 거의 없으면(영어로 답해 달라는 요청 등) 자르지 않는다", () => {
  const english = "Sure, here is the short reading in English. The cards suggest a slow but steady change, so give it some time.";
  assert.equal(stripLeakedMonologue(english).cut, false);
  assert.equal(stripLeakedMonologue(`응! ${english}`).cut, false);
});

test("stripLeakedMonologue — 코드 블록이 섞인 끝부분은 자르지 않는다(메모가 아니라 다른 결함 — 펜스가 깨진다)", () => {
  const code = `${ANSWER}\n\n\`\`\`python\n# answer the user question\nfor student in students:\n    print(student.name)\n\`\`\``;
  assert.equal(stripLeakedMonologue(code).cut, false);
});

test("stripLeakedMonologue — 잘릴 구간이 500자를 넘으면 메모가 아니라 영어 본문으로 보고 그대로 둔다", () => {
  const longEnglish = ` ${"This part is a long English letter the user asked for, written with care and warmth. ".repeat(7)}`;
  assert.ok(longEnglish.length > 500);
  assert.equal(stripLeakedMonologue(`${ANSWER}${longEnglish}`).cut, false);
});

test("stripLeakedMonologue — 조작된 입력에서도 길이에 비례해 끝난다(클라가 보낸 이력 60개 × 8,000자를 스트림 전에 동기로 처리한다)", () => {
  const shapes = [
    `${ANSWER}${"a, ".repeat(2500)}${"가".repeat(500)}`, // 짧은 단어가 아주 많은 영어
    `${ANSWER}${"a".repeat(8000)}`, // 구분자 없는 긴 영문 '단어'
    `${ANSWER}${" ".repeat(8000)}x`, // 긴 공백(끝 마커 검사)
    `${ANSWER}${"이번".repeat(2000)}`, // 내부 용어 앞부분만 반복
    `${ANSWER}${"[END] ".repeat(1300)}`, // 마커 반복
    // 마커 반복 + 끝에 진짜 메모 — 창 안에 후보가 있어 끝 마커 검사까지 간다(리뷰 2026-10-05: 검사를 끝 200자로 묶기 전 60회 0.8~1.9초)
    `${ANSWER}${"[END] ".repeat(1300)}so cannot ask, no question, keep it concise.`,
    `${ANSWER}${"**[END]**. ".repeat(700)}so cannot ask, no question, keep it concise.`,
  ];
  for (const s of shapes) {
    const t0 = performance.now();
    for (let k = 0; k < 60; k++) stripLeakedMonologue(s);
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${s.slice(ANSWER.length, ANSWER.length + 12)}… 60회 ${Math.round(ms)}ms`);
  }
});

// ── 스트림 보류 필터 ──
function runHold(input: string, size: number) {
  const f = createMonologueHoldFilter();
  let shown = "";
  for (let i = 0; i < input.length; i += size) shown += f.push(input.slice(i, i + size));
  const before = shown; // 스트림이 끝나기 전까지 화면에 나간 글
  const { tail, leak, shownPastCut } = f.flush();
  return { before, shown: shown + tail, leak, shownPastCut };
}
const SIZES = [1, 2, 3, 5, 8, 13, 40, 10_000];

test("createMonologueHoldFilter — 누출 메모는 청크를 어디서 끊든 화면에 한 글자도 안 나가고, 화면 = 저장본 기준 글(공백 차이만)", () => {
  for (const leak of [
    " too fast? Let's keep it short, no question at the end.",
    " Shame? no. End with summary and space, no question.",
    "- 이번 턴 신호 상태가 질문이라 질문 하나 필요하지만 직전 내 턴 질문? so cannot ask. Good. final concise.",
    "\n직전 별콩이 턴이 질문이었으니 이번엔 질문 금지.",
    " so cannot ask, no question, keep it concise.\n\n[END]",
    " need one more card offer, no question here.\n[RECO:tarot:clarifier]",
  ]) {
    for (const size of SIZES) {
      const r = runHold(`${ANSWER}${leak}`, size);
      assert.equal(r.leak.cut, true, leak);
      const ws = (s: string) => s.replace(/s+/g, " ").trim(); // 메모 앞 공백 하나는 먼저 나갈 수 있다(무해)
      assert.equal(ws(r.shown), ws(r.leak.text), `${size}: ${leak}`);
      assert.ok(!/cannot|question|concise|이번 턴|직전/.test(r.before), `${size}: ${r.before}`);
      assert.equal(r.shownPastCut, false, `${size}: ${leak}`);
    }
  }
});

test("createMonologueHoldFilter — 정상 답은 화면에 원문 그대로 나간다(영어 카드명·응원·마커 포함)", () => {
  for (const ok of [
    ANSWER,
    `${ANSWER}\n\n[END]`,
    `[CARD:1] The Wheel of Fortune 카드가 나온 건 흐름이 바뀌는 지점이라는 뜻이야. ${ANSWER}`,
    `${ANSWER} Don't settle for less than you deserve 💜`,
    `${ANSWER} 같은 패턴 신호가 반복되는지 살펴봐. ${ANSWER}`,
    `${ANSWER} 응원할게 👩‍❤️‍👨 You got this.`,
    `${ANSWER} ${"This part is a long English letter the user asked for, written with care and warmth. ".repeat(9)}`,
  ]) {
    for (const size of SIZES) {
      const r = runHold(ok, size);
      assert.equal(r.leak.cut, false, ok);
      assert.equal(r.shown, ok, `${size}: ${ok.slice(0, 40)}`);
    }
  }
});

test("createMonologueHoldFilter — 영어가 섞여도 뒤로 한국어가 이어지면 스트림 도중에 내보낸다(끝까지 붙잡지 않는다)", () => {
  const f = createMonologueHoldFilter();
  const out = f.push(`The Lovers 카드가 나왔어. ${ANSWER}`);
  assert.ok(out.includes("The Lovers"), out);
  // 아주 긴 영어도 끝 500자 남짓만 붙잡는다
  const g = createMonologueHoldFilter();
  const shown = g.push(`${ANSWER} ${"Trust the timing of your life and keep going. ".repeat(40)}`);
  assert.ok(shown.length > ANSWER.length + 1000, String(shown.length));
});

test("createMonologueHoldFilter — 메모와 같은 문장의 한국어가 먼저 나간 건 메모 노출로 세지 않는다", () => {
  const r = runHold(`${ANSWER} 응원할게 so cannot ask, no question, keep it concise.`, 3);
  assert.equal(r.leak.cut, true);
  assert.ok(!/cannot/.test(r.shown), r.shown);
  assert.equal(r.shownPastCut, false);
});
