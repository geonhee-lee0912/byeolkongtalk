import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLARIFIER_MARKER,
  isClarifierCandidate,
  shouldKeepOpen,
  repairClarifierMarker,
  createEndMarkerFilter,
  finalizeAssistantText,
  type KeepOpenInput,
} from "./inchat-offer.ts";
import { tarotEndState, type ReopenReadingRow } from "./reopen.ts";
import { classifyUserTurn } from "./user-turn.ts";

const base = {
  assistantTurnsSoFar: 2,
  wrapMode: "free" as const,
  crisisActive: false,
  forceEnd: false,
  clarifierCount: 0,
  pastAssistantTexts: ["첫 풀이", "두번째 답"],
  userAsking: true,
  userShortStreak: false,
};

test("isClarifierCandidate — 기본 조건 충족이면 true", () => {
  assert.equal(isClarifierCandidate(base), true);
});

test("isClarifierCandidate — 첫 풀이 턴·정리 구간·위기·마무리 버튼·구매 이력·기제안·질문 아님이면 false", () => {
  assert.equal(isClarifierCandidate({ ...base, assistantTurnsSoFar: 0 }), false);
  assert.equal(isClarifierCandidate({ ...base, wrapMode: "converge" }), false);
  assert.equal(isClarifierCandidate({ ...base, wrapMode: "hardcap" }), false);
  assert.equal(isClarifierCandidate({ ...base, crisisActive: true }), false);
  assert.equal(isClarifierCandidate({ ...base, forceEnd: true }), false);
  assert.equal(isClarifierCandidate({ ...base, clarifierCount: 1 }), false);
  assert.equal(
    isClarifierCandidate({ ...base, pastAssistantTexts: ["답", `제안\n${CLARIFIER_MARKER}`] }),
    false,
  );
  assert.equal(isClarifierCandidate({ ...base, userAsking: false }), false);
});

test("isClarifierCandidate — 첫 풀이 직후(assistantTurnsSoFar=1)부터 후보다(경계 ≥1)", () => {
  assert.equal(isClarifierCandidate({ ...base, assistantTurnsSoFar: 1, pastAssistantTexts: ["첫 풀이"] }), true);
});

test("isClarifierCandidate — 기제안 마커가 이력의 처음·중간·마지막 어디에 있어도 후보에서 뺀다", () => {
  const offered = `제안\n${CLARIFIER_MARKER}`;
  for (const pastAssistantTexts of [
    [offered, "다음 답", "또 다음 답"],
    ["첫 풀이", offered, "또 다음 답"],
    ["첫 풀이", "다음 답", offered],
  ]) {
    assert.equal(isClarifierCandidate({ ...base, assistantTurnsSoFar: 3, pastAssistantTexts }), false);
  }
});

test("isClarifierCandidate — 단답 연속(지친 신호·턴 마무리 '정리')이면 후보가 아니다 (사용자 결정 2026-10-04)", () => {
  assert.equal(isClarifierCandidate({ ...base, userShortStreak: false }), true); // 대조군
  assert.equal(isClarifierCandidate({ ...base, userShortStreak: true }), false);
});

test("shouldKeepOpen — 자연 마무리선 + 묻는 중이면 true, 강제 종료·위기·질문 아님·다른 구간이면 false", () => {
  const k = {
    wrapMode: "hardcap" as const,
    mustEnd: false,
    crisisActive: false,
    userAsking: true,
    lastTurnEndedWithQuestion: false,
    userClosing: false,
  };
  assert.equal(shouldKeepOpen(k), true);
  assert.equal(shouldKeepOpen({ ...k, mustEnd: true }), false);
  assert.equal(shouldKeepOpen({ ...k, crisisActive: true }), false);
  assert.equal(shouldKeepOpen({ ...k, userAsking: false }), false);
  assert.equal(shouldKeepOpen({ ...k, wrapMode: "converge" }), false);
});

// ── ⑥ 별콩이가 직전 턴을 질문으로 끝냈으면 유저 답은 마무리 신호가 아닌 한 '묻는 중'처럼 열어 둔다 (사용자 결정 2026-10-04 ⑥) ──
// 열어 둔 턴의 별콩이는 질문으로 끝낼 수 있다(턴 마무리 '질문'). 그 질문에 유저가 짧게 답했는데("일주일 전쯤") 그 답이 asking 이 아니라고
// 자연 마무리 가이드로 닫으면 '묻고 → 답했더니 → 작별'이 된다. 연쇄는 스스로 끊긴다 — 질문 2연속 금지(computeTurnClose)로 다음 턴은 질문으로 끝나지 않고, 강제 종료선이 상한이다.
const answerTurn = {
  wrapMode: "hardcap" as const,
  mustEnd: false,
  crisisActive: false,
  userAsking: false,
  lastTurnEndedWithQuestion: true,
  userClosing: false,
};

test("shouldKeepOpen ⑥ — 자연 마무리선 + 직전 턴이 질문 + 마무리 신호 아닌 답이면 열어 둔다, 마무리 신호('고마워')면 닫는다", () => {
  assert.equal(shouldKeepOpen(answerTurn), true);
  assert.equal(shouldKeepOpen({ ...answerTurn, userClosing: true }), false);
  // 대조: 직전 턴이 질문이 아니면 예전 그대로(묻지도 않았고 마무리 신호도 없으면 자연 마무리)
  assert.equal(shouldKeepOpen({ ...answerTurn, lastTurnEndedWithQuestion: false }), false);
});

test("shouldKeepOpen ⑥ — 유저가 묻는 중이면 직전 턴·마무리 신호와 무관하게 열어 둔다(기존 규칙 그대로)", () => {
  for (const lastTurnEndedWithQuestion of [false, true]) {
    for (const userClosing of [false, true]) {
      assert.equal(
        shouldKeepOpen({ ...answerTurn, userAsking: true, lastTurnEndedWithQuestion, userClosing }),
        true,
        `lastQ=${lastTurnEndedWithQuestion} closing=${userClosing}`,
      );
    }
  }
});

test("shouldKeepOpen ⑥ — 직전 턴이 질문이어도 강제 종료·위기·자연 마무리선 밖에선 열어 두지 않는다", () => {
  assert.equal(shouldKeepOpen({ ...answerTurn, mustEnd: true }), false);
  assert.equal(shouldKeepOpen({ ...answerTurn, crisisActive: true }), false);
  for (const wrapMode of ["free", "converge"] as const) {
    assert.equal(shouldKeepOpen({ ...answerTurn, wrapMode }), false, wrapMode);
    assert.equal(shouldKeepOpen({ ...answerTurn, wrapMode, userAsking: true }), false, `${wrapMode} asking`);
  }
});

// 마무리 신호 = 명시적 마무리어(classifyUserTurn().closingExplicit) — 질문 직후의 단독 '응/네/그래/ㅇㅇ' 는 마무리가 아니라 대답이다(사용자 결정 2026-10-04 ⑥)
const keepForReply = (text: string, over: Partial<KeepOpenInput> = {}) => {
  const u = classifyUserTurn(text);
  return shouldKeepOpen({ ...answerTurn, userAsking: u.asking, userClosing: u.closingExplicit, ...over });
};

test("shouldKeepOpen ⑥ — 실제 유저 말 분류와 맞물린다: 질문에 대한 답('응'·'네' 같은 예/아니오 대답 포함)은 열어 두고, 명시적 마무리어(감사·수긍)는 닫는다", () => {
  // 별콩이가 "혹시 그 사람이 먼저 연락한 적 있어?" 로 끝낸 직후
  for (const answer of ["일주일 전쯤", "아니 아직 연락 안 했어", "맞아", "그건 잘 모르겠어", "응", "네", "네네", "그래", "ㅇㅇ", "응 있었어"]) {
    assert.equal(keepForReply(answer), true, answer);
  }
  for (const closing of ["고마워 별콩아", "알겠어", "음 그렇구나", "충분해", "잘 자 별콩아", "알겠어 고마워"]) {
    assert.equal(keepForReply(closing), false, closing);
  }
});

test("shouldKeepOpen ⑥ — 질문 직후의 작별 구('오늘은 여기까지 할게'·'이제 그만할게'·'다음에 봐' …)는 명시적 마무리어라 닫고, 같은 낱말이 든 연애 답은 열어 둔다", () => {
  for (const goodbye of [
    "오늘은 여기까지 할게", "이제 그만할게요", "그만할래", "이제 끝낼게", "나중에 다시 올게", "다음에 또 얘기하자", "다음에 봐", "잘 있어", "수고했어",
    "잘게", "이제 쉴게", "이제 가볼게", "들어가볼게", "빠이", "응 이제 그만할게요", "오늘도 수고했어요 ㅎㅎ",
  ]) {
    assert.equal(keepForReply(goodbye), false, goodbye);
  }
  // 대상·주어가 붙은 같은 낱말 — 별콩이가 물은 것에 대한 대답이다
  for (const answer of ["이제 그만 연락하래", "연락 그만할게", "그 카페 한번 가볼게", "여기까지 왔는데 그 사람이 걱정돼", "걔는 잘 있어", "그 사람이랑 이제 끝낼게", "다음에 봐야 해"]) {
    assert.equal(keepForReply(answer), true, answer);
  }
});

test("shouldKeepOpen ⑥ — '응' 은 별콩이가 질문으로 끝낸 직후에만 답이다: 질문이 아니었으면 열 근거가 없어 예전처럼 자연 마무리", () => {
  assert.equal(keepForReply("응", { lastTurnEndedWithQuestion: true }), true);
  assert.equal(keepForReply("응", { lastTurnEndedWithQuestion: false }), false);
  // 질문 직후여도 강제 종료·위기·자연 마무리선 밖이면 여는 규칙은 없다
  assert.equal(keepForReply("응", { mustEnd: true }), false);
  assert.equal(keepForReply("응", { crisisActive: true }), false);
  assert.equal(keepForReply("응", { wrapMode: "converge" }), false);
});

test("repairClarifierMarker — 제안 문구가 있고 마커가 없으면 끝에 붙인다(앞부분은 그대로)", () => {
  const text = "답이야.\n\n이 부분은 카드 한 장 더 펼쳐 보면 더 또렷해져. 지금 얘기 계속해도 되고";
  const out = repairClarifierMarker(text);
  assert.equal(out, `${text}\n${CLARIFIER_MARKER}`);
  assert.ok(out.startsWith(text));
});

test("repairClarifierMarker — 문구 없음·이미 마커 있음이면 그대로", () => {
  assert.equal(repairClarifierMarker("그냥 답이야."), "그냥 답이야.");
  const withMarker = `한 장 더 볼 수 있어\n${CLARIFIER_MARKER}`;
  assert.equal(repairClarifierMarker(withMarker), withMarker);
});

test("repairClarifierMarker — '카드 한 장' 만 있는 마무리 인사·평범한 문장엔 마커를 붙이지 않는다", () => {
  for (const text of [
    "그 마음, 카드 한 장으로 다 풀리진 않지만 오늘은 여기까지 함께 짚어왔어.",
    "지금 카드 한 장의 결은 '내일 확실히 연락'보다는 먼저 서로의 입장을 생각하는 단계야.",
  ]) {
    assert.equal(repairClarifierMarker(text), text);
  }
});

test("repairClarifierMarker — '한 장을 더'·'한장 더' 변형 제안에도 마커를 붙인다", () => {
  for (const text of [
    "이 부분은 카드 한 장을 더 펼쳐 보면 훨씬 또렷해질 수 있어.",
    "한장 더 펼쳐서 볼 수도 있어.",
  ]) {
    assert.equal(repairClarifierMarker(text), `${text}\n${CLARIFIER_MARKER}`);
  }
});

test("repairClarifierMarker — [END] 가 있는(대화를 닫는) 응답엔 마커를 붙이지 않는다 — 끝난 대화에 칩이 떠 400 나는 것 방지 (사용자 결정 2026-10-04)", () => {
  const offer = "답이야.\n\n이 부분은 카드 한 장 더 펼쳐 보면 더 또렷해져. 지금 얘기 계속해도 되고";
  // 클라(lib/tarot/bubbles.ts END_MARKER_REGEX)는 대소문자를 무시하고 위치도 따지지 않는다 — 같은 눈으로 본다
  for (const end of ["[END]", "[end]", "[End]"]) {
    const closing = `${offer}\n\n${end}`;
    assert.equal(repairClarifierMarker(closing), closing, end);
  }
  assert.equal(repairClarifierMarker(`[END]\n${offer}`), `[END]\n${offer}`);
  // 대조: [END] 만 없으면 같은 문장에 마커를 붙인다
  assert.equal(repairClarifierMarker(offer), `${offer}\n${CLARIFIER_MARKER}`);
});

test("마커 판정은 클라(parseAllRecoMarkers)처럼 대소문자를 무시한다 — 기제안 이력·마커 수리 모두", () => {
  for (const variant of ["[RECO:Tarot:Clarifier]", "[reco:tarot:clarifier]"]) {
    // 클라는 이 마커로도 칩을 띄우므로 '대화당 1회' 에 센다
    assert.equal(isClarifierCandidate({ ...base, pastAssistantTexts: ["답", `제안\n${variant}`] }), false);
    // 이미 마커가 있는 응답엔(제안 문구가 있어도) 또 붙이지 않는다
    const text = `한 장 더 볼 수 있어\n${variant}`;
    assert.equal(repairClarifierMarker(text), text);
  }
  // 대조: 다른 칩(extend)의 마커는 '한 장 더' 로 세지 않는다
  assert.equal(isClarifierCandidate({ ...base, pastAssistantTexts: ["답", "더 얘기하기\n[RECO:extend]"] }), true);
});

test("createEndMarkerFilter — 청크 경계에 걸친 [END] 도 지운다", () => {
  const f = createEndMarkerFilter();
  const out = f.push("답이야.\n\n[EN") + f.push("D]") + f.flush();
  assert.equal(out, "답이야.\n\n");
});

test("createEndMarkerFilter — [END] 가 아닌 '[' 는 보존한다", () => {
  const f = createEndMarkerFilter();
  const out = f.push("카드 [CARD:1] 와 [") + f.push("보조]") + f.flush();
  assert.equal(out, "카드 [CARD:1] 와 [보조]");
});

test("createEndMarkerFilter — 한 청크 안의 [END] 를 지운다", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("끝[END]") + f.flush(), "끝");
});

test("createEndMarkerFilter — push 는 붙잡을 꼬리만 남기고 바로 내보낸다(flush 까지 모았다 내보내지 않는다)", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("평범한 문장이야."), "평범한 문장이야."); // "[" 없는 텍스트는 즉시
  assert.equal(f.push("답이야.\n\n[EN"), "답이야.\n\n"); // "[EN" 만 붙잡는다
  assert.equal(f.push("D]"), ""); // 마커가 완성되면 통째로 사라진다
  assert.equal(f.push("카드 [CARD:1] 와 ["), "카드 [CARD:1] 와 "); // 완성된 [CARD:1] 은 바로, 끝의 "[" 만 붙잡는다
  assert.equal(f.push("보조]"), "[보조]"); // [END] 가 아니므로 붙잡았던 "[" 와 함께 나온다
  assert.equal(f.flush(), "");
});

/** s 를 가능한 모든 청크 분할(2^(n-1)가지)로 필터에 흘린 결과들 — 청크 경계가 어디든 결과가 같아야 한다 */
function filterEveryChunking(s: string): string[] {
  // 비트마스크(1 << n)는 32자부터 넘쳐 반복이 0번 돌고 — 단언 없이 통과해 버린다. 짧은 문자열만 받고, 분할을 전부 돌렸는지 확인한다
  assert.ok(s.length >= 1 && s.length <= 20, `전수 분할 검사는 1~20자만 다룬다(받은 길이 ${s.length})`);
  const outs: string[] = [];
  for (let mask = 0; mask < 1 << (s.length - 1); mask++) {
    const f = createEndMarkerFilter();
    let out = "";
    let from = 0;
    for (let i = 1; i <= s.length; i++) {
      if (i === s.length || mask & (1 << (i - 1))) {
        out += f.push(s.slice(from, i));
        from = i;
      }
    }
    outs.push(out + f.flush());
  }
  assert.equal(outs.length, 2 ** (s.length - 1)); // 모든 분할을 실제로 돌렸다
  return outs;
}

test("createEndMarkerFilter — 청크를 어디서 끊어도 결과가 같다(모든 분할)", () => {
  for (const out of filterEveryChunking("답이야.\n[END]끝")) assert.equal(out, "답이야.\n끝");
});

test("createEndMarkerFilter — 지운 자리에서 새로 맞붙은 [END] 도 지운다(한 청크·모든 분할)", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("[E[END]ND]") + f.flush(), "");
  for (const out of filterEveryChunking("[E[END]ND]")) assert.equal(out, "");
  for (const out of filterEveryChunking("a[[END]END]b")) assert.equal(out, "ab");
});

test("createEndMarkerFilter — 스트림이 [END] 앞부분에서 끝나면 flush 가 그대로 내보낸다", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("끝 [EN") + f.flush(), "끝 [EN");
});

// ── finalizeAssistantText — 응답 끝처리(강제 종료 턴 [END] 정규화 · '한 장 더' 마커 수리) ──
// 재개 헤더(X-Reopen)는 모델 출력 전에 나가므로, 저장본이 그 약속의 모양([END] 정확히 하나, 맨 끝)이어야 재개 버튼이 산다.
const END_TAIL = "\n\n[END]";
const mustEndCtx = { mustEnd: true, crisisActive: false, forceEnd: false, clarifierCandidate: false };
const countEnds = (s: string): number => (s.match(/\[END\]/gi) ?? []).length;
const OFFER = "답이야.\n\n이 부분은 카드 한 장 더 펼쳐 보면 더 또렷해져. 지금 얘기 계속해도 되고";
const candidateCtx = { mustEnd: false, crisisActive: false, forceEnd: false, clarifierCandidate: true };

test("finalizeAssistantText (i) — 강제 종료 턴에 [END] 가 하나도 없으면 저장본·스트림 모두 끝에 붙인다", () => {
  for (const forceEnd of [false, true]) {
    assert.deepEqual(finalizeAssistantText("마무리 인사야.", { ...mustEndCtx, forceEnd }), {
      saved: `마무리 인사야.${END_TAIL}`,
      streamTail: END_TAIL,
    });
  }
  // 닫히지 않은 조각("[EN", "[END")은 마커가 아니다 — 새로 붙인다
  for (const partial of ["끝 [EN", "끝 [END"]) {
    assert.deepEqual(finalizeAssistantText(partial, mustEndCtx), { saved: `${partial}${END_TAIL}`, streamTail: END_TAIL }, partial);
  }
});

test("finalizeAssistantText (ii) — 대문자 [END] 가 딱 하나 맨 끝(뒤는 공백뿐)이면 그대로", () => {
  for (const text of ["마무리 인사야.\n\n[END]", "마무리 인사야. [END]", "마무리 인사야.\n\n[END]\n", "마무리 인사야.\n[END]  \n\n", "[END]"]) {
    assert.deepEqual(finalizeAssistantText(text, mustEndCtx), { saved: text, streamTail: "" }, JSON.stringify(text));
  }
  // 비대칭 굵게(`**[END]`)는 '대칭 굵게'가 아니라 건드리지 않는다 — 끝 [END] 하나라 재개 모양은 이미 맞다
  assert.deepEqual(finalizeAssistantText("인사야.\n\n**[END]", mustEndCtx), { saved: "인사야.\n\n**[END]", streamTail: "" });
});

test("finalizeAssistantText (iii) — 소문자·굵게·중복·본문 중간·끝 뒤 글자는 [END] 를 전부 지우고 끝에 하나만, 스트림 꼬리는 없다", () => {
  // [이름, 입력, 기대 saved] — 클라는 이미 종료 마커를 받았으니(대소문자 무시·위치 무관) 스트림엔 아무것도 더 보내지 않는다
  const cases: [string, string, string][] = [
    ["소문자", "인사야.\n\n[end]", "인사야.\n\n[END]"],
    ["혼합 대소문자", "인사야.\n\n[End]\n", "인사야.\n\n[END]"],
    ["굵게", "인사야.\n\n**[END]**", "인사야.\n\n[END]"],
    ["굵게 + 소문자", "인사야.\n\n**[end]**\n", "인사야.\n\n[END]"],
    ["본문 중간", "앞 [END] 뒤", "앞  뒤\n\n[END]"],
    ["중복", "앞 [END] 뒤\n\n[END]", "앞  뒤\n\n[END]"],
    ["셋 이상", "[END] 앞\n\n[end] 중간\n\n[END]", " 앞\n\n 중간\n\n[END]"],
    ["끝 뒤에 다른 마커", "인사야.\n[END]\n[RECO:continue]", "인사야.\n\n[RECO:continue]\n\n[END]"],
    ["끝 뒤에 문장부호", "인사야. [END].", "인사야. .\n\n[END]"],
    ["굵게 + 맨 끝 일반", "**[END]** 앞\n\n[END]", " 앞\n\n[END]"],
  ];
  for (const [name, text, expected] of cases) {
    for (const forceEnd of [false, true]) {
      assert.deepEqual(finalizeAssistantText(text, { ...mustEndCtx, forceEnd }), { saved: expected, streamTail: "" }, `${name} forceEnd=${forceEnd}`);
    }
  }
});

test("finalizeAssistantText — 지운 자리에서 새로 맞붙은 [END] 까지 지운다(한 번 지우고 끝내지 않는다)", () => {
  // "[E[END]ND]" 는 안쪽을 지우면 [END] 가 새로 생긴다 — 굵게 쪽도 마찬가지
  assert.equal(finalizeAssistantText("답이야 [E[END]ND] 끝", mustEndCtx).saved, "답이야  끝\n\n[END]");
  for (const text of ["**[E**[END]**ND]**", "[E[E[END]ND]ND]", "**[E[END]ND]**"]) {
    const { saved, streamTail } = finalizeAssistantText(text, mustEndCtx);
    assert.equal(countEnds(saved), 1, `${text} → ${JSON.stringify(saved)}`);
    assert.ok(saved.endsWith(END_TAIL), text);
    assert.equal(streamTail, "", text);
  }
});

test("finalizeAssistantText — 위기(버튼 아님)로 자동 종료가 억제된 턴은 [END] 를 붙이지도 고치지도 않는다", () => {
  const crisis = { ...mustEndCtx, crisisActive: true };
  for (const text of ["곁에 있을게.", "곁에 있을게.\n\n[END]", "a [END] b [end]", "굵게 **[END]**"]) {
    assert.deepEqual(finalizeAssistantText(text, crisis), { saved: text, streamTail: "" }, JSON.stringify(text));
  }
  // 마무리 버튼은 위기여도 닫는다 — 일반 강제 종료와 같이 처리
  assert.deepEqual(finalizeAssistantText("곁에 있을게.", { ...crisis, forceEnd: true }), {
    saved: `곁에 있을게.${END_TAIL}`,
    streamTail: END_TAIL,
  });
  assert.deepEqual(finalizeAssistantText("a [END] b\n\n[end]", { ...crisis, forceEnd: true }), {
    saved: `a  b${END_TAIL}`,
    streamTail: "",
  });
});

test("finalizeAssistantText — 강제 종료 턴이 아니면 [END] 를 건드리지 않는다(자연 마무리의 모델 [END]·중복도 그대로)", () => {
  for (const crisisActive of [false, true]) {
    for (const text of ["그냥 답이야.", "자연 마무리야.\n\n[END]", "a [END] b\n\n[end]"]) {
      assert.deepEqual(
        finalizeAssistantText(text, { mustEnd: false, crisisActive, forceEnd: false, clarifierCandidate: false }),
        { saved: text, streamTail: "" },
        `crisis=${crisisActive} ${JSON.stringify(text)}`,
      );
    }
  }
});

test("finalizeAssistantText — 후보 턴에서 제안 문구는 있는데 마커가 없으면 마커를 붙이고, 스트림엔 붙인 꼬리만 보낸다", () => {
  const out = finalizeAssistantText(OFFER, candidateCtx);
  assert.equal(out.saved, `${OFFER}\n${CLARIFIER_MARKER}`);
  assert.equal(out.streamTail, `\n${CLARIFIER_MARKER}`);
  assert.equal(OFFER + out.streamTail, out.saved); // 스트림으로 이미 나간 글자 + 꼬리 = 저장본
});

test("finalizeAssistantText — 후보 턴이어도 마커가 이미 있거나·제안 문구가 없거나·[END] 가 있으면 그대로", () => {
  for (const text of [`${OFFER}\n${CLARIFIER_MARKER}`, "그냥 답이야.", `${OFFER}\n\n[END]`, `${OFFER}\n\n[end]`]) {
    assert.deepEqual(finalizeAssistantText(text, candidateCtx), { saved: text, streamTail: "" }, JSON.stringify(text));
  }
  // 후보가 아니면 제안 문구가 있어도 수리하지 않는다
  assert.deepEqual(finalizeAssistantText(OFFER, { ...candidateCtx, clarifierCandidate: false }), { saved: OFFER, streamTail: "" });
});

test("finalizeAssistantText — 강제 종료와 후보가 겹치는 일은 없지만(후보는 free 구간만), 겹치면 종료가 이긴다 — 끝난 대화에 칩을 붙이지 않는다", () => {
  assert.deepEqual(finalizeAssistantText(OFFER, { ...mustEndCtx, clarifierCandidate: true }), {
    saved: `${OFFER}${END_TAIL}`,
    streamTail: END_TAIL,
  });
});

// 재개 판정(tarotEndState)과의 계약 — 헤더가 나가는 강제 종료 턴의 저장본은 [END] 가 정확히 하나·맨 끝이어야 재개된다.
// 투카드(강제 종료선 12): 앞 11턴 + 이번 저장본 = 12턴.
const TWO_CARD_ROW: ReopenReadingRow = {
  id: "r1",
  consultation_type: "tarot",
  spread_type: "two_card",
  extra_turns: 0,
  clarifier_count: 0,
};
const ADVERSARIAL_FINAL_TEXTS = [
  "마무리 인사야.",
  "마무리 인사야.\n\n[END]",
  "마무리 인사야.\n\n[END]\n",
  "인사야.\n\n[end]",
  "인사야.\n\n[End]\n",
  "인사야.\n\n**[END]**",
  "인사야.\n\n**[end]**\n",
  "앞 [END] 뒤",
  "앞 [END] 뒤\n\n[END]",
  "[END] 앞\n\n[END] 뒤\n\n[END]",
  "인사야.\n[END]\n[RECO:continue]",
  "인사야. [END].",
  "**[END]** 앞",
  "[END]",
  "[E[END]ND] 끝",
  "**[E**[END]**ND]**",
  "끝 [EN",
  "끝 [END",
  `${OFFER} [END]\n${CLARIFIER_MARKER}`,
];

test("finalizeAssistantText — 강제 종료 턴의 저장본은 어떤 입력에서도 tarotEndState 가 재개 대상으로 본다(정확히 [END] 하나·맨 끝)", () => {
  for (const text of ADVERSARIAL_FINAL_TEXTS) {
    for (const forceEnd of [false, true]) {
      const { saved, streamTail } = finalizeAssistantText(text, { ...mustEndCtx, forceEnd });
      const label = `${JSON.stringify(text)} forceEnd=${forceEnd} → ${JSON.stringify(saved)}`;
      assert.equal(countEnds(saved), 1, label);
      assert.ok(/\[END\]\s*$/.test(saved), label);
      const turns = [...Array.from({ length: 11 }, (_, i) => `답 ${i + 1}`), saved];
      assert.deepEqual(tarotEndState(turns, TWO_CARD_ROW), { ended: true, endedAtAbsCap: true, claimInProgress: false }, label);
      // 스트림 계약: 꼬리가 있으면 저장본 = 이미 나간 글자 + 꼬리, 꼬리가 없으면 클라는 이미 종료 마커를 받았다
      if (streamTail !== "") assert.equal(saved, text + streamTail, label);
      else assert.ok(countEnds(text) >= 1, label);
      // 멱등 — 한 번 정규화한 저장본을 다시 넣어도 그대로
      assert.deepEqual(finalizeAssistantText(saved, { ...mustEndCtx, forceEnd }), { saved, streamTail: "" }, label);
    }
  }
});
