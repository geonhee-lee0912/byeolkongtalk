// 계약: 타로 별콩이는 결과 화면에 실제로 있는 버튼만 안내한다(운영자 11-22 "타로만 진행").
// '이어가기'는 08-28 에 결과 화면에서 빠졌는데 안내만 남아 있었다. 새로 뽑으면 지난 대화는 안 이어진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTarotSystemMessage } from "../claude.ts";
import { redrawCard } from "./redraw.ts";

const BUTTON = redrawCard("/tarot", 10).label;
const ctx = {
  spreadType: "two_card" as const,
  spreadCategory: "love" as const,
  concernText: "그 사람이 다시 연락할까?",
  drawnCards: [
    { position: 0, label: "상황", card_id: 1, direction: "upright" as const },
    { position: 1, label: "조언", card_id: 2, direction: "upright" as const },
  ],
  assistantTurnsSoFar: 5, // 다음 = 6번째 = 자연 마무리선
  cumulativeAssistantChars: 4000,
};

const places: [string, () => string][] = [
  ["더 보고 싶다(페르소나)", () => buildTarotSystemMessage(ctx).staticPart],
  ["자연 마무리", () => buildTarotSystemMessage(ctx).dynamicPart],
  ["강제 마무리", () => buildTarotSystemMessage({ ...ctx, forceEnd: true }).dynamicPart],
];

for (const [name, prompt] of places) {
  test(`${name} — 없는 '이어가기' 대신 실제 버튼 이름`, () => {
    const p = prompt();
    assert.ok(p.includes(`결과 화면의 '${BUTTON}'`), BUTTON);
    for (const gone of ["'이어가기'", "'이 고민 이어가기'", "[RECO:continue]", "기억한 채 이어볼 수", "기억한 채 다시 이어갈 수"]) {
      assert.ok(!p.includes(gone), gone);
    }
  });
}
