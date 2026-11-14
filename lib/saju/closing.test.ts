import { test } from "node:test";
import assert from "node:assert/strict";
import { extractClosingLine } from "./closing";

const last = (content: string) => [
  { role: "user" as const, content: "고민" },
  { role: "assistant" as const, content },
];

test("기본: 마지막 문단을 그대로 쓴다", () => {
  assert.equal(extractClosingLine(last("앞 문단.\n\n마지막 문단이야.")), "마지막 문단이야.");
});

test("excludeInvite: 초대 문단은 건너뛰고 앞 문단을 쓴다(기존 동작)", () => {
  assert.equal(
    extractClosingLine(last("요약 문단이야.\n\n언제든 다시 와."), { excludeInvite: true }),
    "요약 문단이야."
  );
});

test("excludeInvite: 끝의 '다음엔 … 이어서 보자' 문장을 자른다", () => {
  assert.equal(
    extractClosingLine(
      last("직접 만나 확인하려는 선택이 좋아 보여. 다음엔 그 만남에서 어떤 기류가 흘렀는지 이어서 보자."),
      { excludeInvite: true }
    ),
    "직접 만나 확인하려는 선택이 좋아 보여."
  );
});

test("excludeInvite: '다음에는 … 이어서 같이 볼 수 있어' 도 자른다", () => {
  assert.equal(
    extractClosingLine(
      last("**회복의 여지는 있되, 선을 지키며 천천히**였어. 다음에는 월말 정산이 어떻게 흘렀는지 이어서 같이 볼 수 있어."),
      { excludeInvite: true }
    ),
    "**회복의 여지는 있되, 선을 지키며 천천히**였어."
  );
});

test("excludeInvite: 끝의 '오늘은 여기까지 …' 마무리 문장을 자른다", () => {
  assert.equal(
    extractClosingLine(
      last("상대의 책임 있는 태도도 꼭 확인해야 해. 오늘은 여기까지 함께 정리해둘게."),
      { excludeInvite: true }
    ),
    "상대의 책임 있는 태도도 꼭 확인해야 해."
  );
});

test("excludeInvite: 그 문장뿐인 문단은 건너뛰고 앞 문단을 쓴다", () => {
  assert.equal(
    extractClosingLine(
      last("카드는 네 마음을 지키라고 말해.\n\n그 마음까지 잘 챙겨두고, 다음엔 그 사람이 어떤 태도를 보였는지 이어서 보자."),
      { excludeInvite: true }
    ),
    "카드는 네 마음을 지키라고 말해."
  );
});

test("excludeInvite: 맨 앞의 대답 말투(알겠어. / 응… / ㅠㅠ)를 뗀다", () => {
  const o = { excludeInvite: true };
  assert.equal(extractClosingLine(last("알겠어. 짧게 연락하는 쪽이 무난해."), o), "짧게 연락하는 쪽이 무난해.");
  assert.equal(extractClosingLine(last("응… 그 마음 쉽게 가라앉지 않지."), o), "그 마음 쉽게 가라앉지 않지.");
  assert.equal(extractClosingLine(last("ㅠㅠ 네가 원하는 건 확신이야."), o), "네가 원하는 건 확신이야.");
  assert.equal(extractClosingLine(last("응, 오늘 카드는 열려 있어."), o), "오늘 카드는 열려 있어.");
});

test("excludeInvite: '그래도'·'응원' 처럼 문장 일부인 말은 떼지 않는다", () => {
  const o = { excludeInvite: true };
  assert.equal(extractClosingLine(last("그래도 카드는 희망을 말해."), o), "그래도 카드는 희망을 말해.");
  assert.equal(extractClosingLine(last("응원할게, 너는 잘하고 있어."), o), "응원할게, 너는 잘하고 있어.");
});

test("excludeInvite 없음(사주): 다듬지 않는다", () => {
  assert.equal(
    extractClosingLine(last("알겠어. 좋아 보여. 다음엔 이어서 보자.")),
    "알겠어. 좋아 보여. 다음엔 이어서 보자."
  );
});

test("다듬을 문단이 하나도 안 남으면 마지막 문단을 그대로 쓴다", () => {
  assert.equal(
    extractClosingLine(last("다음엔 그 변화를 이어서 보자."), { excludeInvite: true }),
    "다음엔 그 변화를 이어서 보자."
  );
});
