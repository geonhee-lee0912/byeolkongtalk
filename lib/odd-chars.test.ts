// 계약: 모델이 섞어 낸 깨진 글자·광고 토막은 손님에게 안 나간다(운영자 11-22 B). 끝이면 자르고, 가운데면 그 낱말만 고친다.
// 문장은 지어냈거나 QA 봇 대화다(리포가 공개라 실사용자 글을 넣지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { askedForOtherLanguage, createOddCharFilter, generateWithoutOddChars, hasOddChars, scrubOddChars } from "./odd-chars.ts";

const A = "내가 보기엔 옮기는 쪽에 더 힘이 실려.";
const SIZES = [1, 2, 3, 7, 1000];
type Ask = { before: string; token: string; after: string };

async function stream(input: string, size: number, word: string | null = null, known = "") {
  const asked: Ask[] = [];
  const f = createOddCharFilter({
    known,
    repair: async (p) => {
      asked.push(p);
      return word;
    },
  });
  let shown = "";
  for (let i = 0; i < input.length; i += size) shown += await f.push(input.slice(i, i + size));
  const before = shown;
  const end = await f.flush();
  return { before, shown: shown + end.tail, asked, stats: end.stats };
}

test("답 끝의 토막·광고·로마자는 어디서 끊겨 와도 한 글자도 안 나간다", async () => {
  const cases: [string, string][] = [
    [" હજુ", ""],
    ["ефонефон", ""],
    [" ━ 海南天天中彩票", ""],
    ['\treply to=none (javascript) 代 天天中彩票一等奖json_schema\n{"x":""}', ""],
    ["acedorea", ""],
    [" comfy.", ""],
    [" 乐彩", ""],
    [" 动", ""],
    [" છેલ્લ?  \n\n[END]", "\n[END]"],
    [" vals\n[RECO:tarot:clarifier]", "\n[RECO:tarot:clarifier]"],
    ["\n\n[END]\n ેણ", "\n[END]"],
  ];
  for (const [junk, kept] of cases) {
    for (const size of SIZES) {
      const r = await stream(A + junk, size);
      assert.equal(r.shown, A + kept, `${JSON.stringify(junk)} / ${size}`);
      assert.ok(A.startsWith(r.before), `끝나기 전에 샜다: ${JSON.stringify(r.before)}`);
      assert.equal(r.asked.length, 0, "끝 토막은 AI 를 안 부른다");
    }
  }
});

test("문장 가운데는 그 낱말만 고치고 나머지는 한 글자도 안 바꾼다", async () => {
  for (const size of SIZES) {
    const r = await stream(`${A} 단, 조건이 अस्पष्ट하거나 설명과 다른 곳은 빼야 해.\n\n[END]`, size, "불분명");
    assert.equal(r.shown, `${A} 단, 조건이 불분명하거나 설명과 다른 곳은 빼야 해.\n\n[END]`, String(size));
    assert.equal(r.asked.length, 1);
    assert.equal(r.asked[0].token, "अस्पष्ट");
    assert.ok(r.asked[0].before.endsWith("조건이 "));
    assert.ok(r.asked[0].after.startsWith("하거나"));
  }
});

test("위기 안내의 번호는 남는다 — 가운데든 맨 끝이든", async () => {
  for (const size of SIZES) {
    assert.equal((await stream("지금은 телефону 109 누르는 것부터 해줘.", size, "전화로")).shown, "지금은 전화로 109 누르는 것부터 해줘.");
    assert.equal((await stream("지금 바로 눌러. телефону 109", size)).shown, "지금 바로 눌러. 109");
    assert.equal((await stream("지금 바로 눌러 109 ефон", size)).shown, "지금 바로 눌러 109");
  }
});

test("못 고치면 그 낱말만 지운다", async () => {
  for (const size of SIZES) {
    assert.equal((await stream("말하지 않아도 돼. અહીં 있을게.", size)).shown, "말하지 않아도 돼. 있을게.");
    assert.equal(
      (await stream("먼저 넣는 게 맞아. текущ? 현재 제안이 있는지 알려줘.", size)).shown,
      "먼저 넣는 게 맞아. 현재 제안이 있는지 알려줘.",
    );
  }
});

test("긴 광고가 가운데 끼면 고치지 않고 지운다", async () => {
  const r = await stream("흐름이야. 天天中彩票有人 그래서 프로젝트는 이어져.", 3, "당첨");
  assert.equal(r.shown, "흐름이야. 그래서 프로젝트는 이어져.");
  assert.equal(r.asked.length, 0);
});

test("한 답에 가운데와 끝이 같이 있어도 사이 글은 남는다", async () => {
  for (const size of SIZES) {
    const r = await stream("기준이 अस्पष्ट한 곳은 피해. 이직은 가능해. 또렷해져. ━ 海南天天中彩票", size, "불분명");
    assert.equal(r.shown, "기준이 불분명한 곳은 피해. 이직은 가능해. 또렷해져.");
  }
});

test("AI 부름은 한 답에 세 번까지", async () => {
  const r = await stream("가 текущ 나. 다 текущ 라. 마 текущ 바. 사 текущ 아. 자.", 4, "지금");
  assert.equal(r.asked.length, 3);
  assert.equal(hasOddChars(r.shown), false);
});

test("고치기가 터져도 답은 나간다", async () => {
  const f = createOddCharFilter({
    repair: async () => {
      throw new Error("down");
    },
  });
  const out = (await f.push("조건이 текущ 달라서 그래. 괜찮아.")) + (await f.flush()).tail;
  assert.equal(out, "조건이 달라서 그래. 괜찮아.");
});

test("정상 답은 그대로 — 간지·괄호 한자·영어·이모지·마커", async () => {
  for (const ok of [
    A,
    `${A}\n\n[END]`,
    `[CARD:1]\n\n마법사 카드야. ${A}`,
    `${A}\n\n[RECO:tarot:clarifier]`,
    "너의 일간 辛(신)은 金 기운이야. 이걸 복음(伏吟)이라고 해.",
    "제일 좋은 **창**(窓)이야.",
    "The Wheel of Fortune 카드가 나온 건 흐름이 바뀐다는 뜻이야.",
    `${A} Fighting!`,
    `${A} Don't settle for less than you deserve 💜`,
    "카페(café)에서 만나도 좋아 ☺️",
    "네 유형은 INFP",
    "109",
  ]) {
    for (const size of SIZES) assert.equal((await stream(ok, size)).shown, ok, `${ok} / ${size}`);
    assert.equal(scrubOddChars(ok), ok);
  }
});

test("손님이 쓴 글자는 깨진 글자가 아니다", async () => {
  const r = await stream("さくら는 벚꽃이라는 뜻이야.", 3, null, "내 별명 さくら 뜻이 뭐야");
  assert.equal(r.shown, "さくら는 벚꽃이라는 뜻이야.");
});

test("다른 언어로 적어 달라는 말이면 거르지 않는다", () => {
  assert.equal(askedForOtherLanguage("일본어로 고백 한 줄 적어줘"), true);
  assert.equal(askedForOtherLanguage("걔가 일본 여행 갔는데 연락 올까"), false);
});

test("정상 글은 흐르는 동안 나간다 — 끝까지 붙잡지 않는다", async () => {
  const f = createOddCharFilter({ repair: async () => null });
  assert.equal(await f.push("옮기는 쪽에 힘이 실려. 그리"), "옮기는 쪽에 힘이 실려. 그리");
});

test("다음 턴 입력용 — AI 없이 지운다", () => {
  assert.equal(scrubOddChars(`${A} ━ 海南天天中彩票\n[END]`), `${A}\n[END]`);
  assert.equal(scrubOddChars("조건이 अस्पष्ट 하거나 달라."), "조건이 하거나 달라.");
});

test("다음 턴 입력용 — 긴 입력도 바로 끝난다", () => {
  const t0 = performance.now();
  scrubOddChars("가 ж나.".repeat(1300));
  scrubOddChars("ж ".repeat(4000));
  scrubOddChars("가".repeat(8000));
  assert.ok(performance.now() - t0 < 1500, String(performance.now() - t0));
});

test("운세 리포트 — 깨졌으면 한 번 다시, 또 깨지면 글자만 지운다", async () => {
  const run = async (answers: string[], known = "") => {
    let calls = 0;
    const out = await generateWithoutOddChars(async () => answers[calls++], known);
    return { out, calls };
  };
  assert.deepEqual(await run(['{"a":"괜찮아"}']), { out: '{"a":"괜찮아"}', calls: 1 });
  assert.deepEqual(await run(['{"a":"괜찮아 яр"}', '{"a":"괜찮아"}']), { out: '{"a":"괜찮아"}', calls: 2 });
  assert.deepEqual(await run(['{"a":"괜찮아 яр"}', '{"a":"좋아 мая"}']), { out: '{"a":"좋아 "}', calls: 2 });
  assert.deepEqual(await run(['{"a":"さくら야"}'], "이름 さくら"), { out: '{"a":"さくら야"}', calls: 1 });
});

test("운세 리포트 — 다시 만들기가 실패하면 첫 글에서 글자만 지운다", async () => {
  let calls = 0;
  const out = await generateWithoutOddChars(async () => {
    if (calls++) throw new Error("down");
    return '{"a":"좋아 мая"}';
  });
  assert.equal(out, '{"a":"좋아 "}');
});
