import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUserTurn } from "./user-turn.ts";
import { clarifierSyntheticMessage } from "./clarifier-message.ts";

// 계약 핀: 보조 카드 시트가 열려 있는 동안 전송 대기 중이던 말은, 구매 성공 직후 synthetic 턴에 합쳐 **한 턴**으로 보낸다
// (app/tarot/reading/page.tsx handleClarifierDrawn — handleFinish 가 대기 조각 + 마무리 문구를 한 턴으로 보내는 것과 같은 방식).
// 서버는 마지막 유저 말 하나만 저장·분류하므로(chat 라우트) 따로 보내면 앞 조각이 DB 에서 빠진다.
//
// 합친 턴도 asking 이어야 한다 — 꼬리가 synthetic("…이어서 봐줘") 라서 대기 말이 마무리 인사·짧은 동의여도 마무리로 오분류돼
// 방금 산 카드 풀이가 곧장 대화를 닫으면 안 된다. (⑦ — synthetic 와 정확히 일치하는 턴 — 은 합친 턴엔 걸리지 않지만 걸릴 일이 없다:
// 대기 말은 열린 대화에서만 생기고(끝난 대화엔 입력창이 없다), ⑦ 은 강제 종료선에서 다시 연 턴 전용이다. 그래서 여기선 판정하지 않는다.)
const synthetic = clarifierSyntheticMessage("'컵 2' (정방향)");

const queuedCases: string[][] = [
  [], // 대기 말 없음 = synthetic 단독
  ["그 사람은 어떻게 생각해?"],
  ["고마워 별콩아"], // 강한 마무리어
  ["오늘은 여기서 마무리할게"], // 출구 칩 문구
  ["응"], // 짧은 동의
  ["알겠어", "근데 그 사람은?"], // 조각 여러 개 + 접속어
  ["그리고 다음 달은 어떨까"],
  ["힘들어 ㅠㅠ"], // 중립
];

for (const queued of queuedCases) {
  test(`대기 말 + synthetic 을 한 턴으로 합쳐도 asking — ${JSON.stringify(queued)}`, () => {
    const merged = [...queued, synthetic].join("\n");
    assert.equal(classifyUserTurn(merged).asking, true, merged);
  });
}
