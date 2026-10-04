import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWrapMode, buildTarotSystemMessage } from "./claude.ts";
import { WRAP_THRESHOLDS } from "./tarot/constants.ts";
import { CLARIFIER_MARKER } from "./tarot/inchat-offer.ts";

const t = WRAP_THRESHOLDS.two_card; // 7/3240/9/3640/12

test("two_card — 6번째 답은 이제 자유 구간(예전 자연 마무리선)", () => {
  assert.equal(computeWrapMode(6, 5000, t).mode, "free");
});

test("two_card — 7번째부터 정리 말투", () => {
  const r = computeWrapMode(7, 3300, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, false);
});

test("two_card — 8번째(자연 마무리선−1)는 마지막 수렴 턴", () => {
  const r = computeWrapMode(8, 3300, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, true);
});

test("two_card — 9번째 + 글자 충족이면 자연 마무리선", () => {
  const r = computeWrapMode(9, 3700, t);
  assert.equal(r.mode, "hardcap");
  assert.equal(r.absHardcap, false);
});

test("two_card — 12번째는 강제 종료선", () => {
  const r = computeWrapMode(12, 100, t);
  assert.equal(r.mode, "hardcap");
  assert.equal(r.absHardcap, true);
});

test("two_card — 9번째라도 글자 미달이면 자연 마무리선 아님(수렴)", () => {
  assert.equal(computeWrapMode(9, 3639, t).mode, "converge");
});

test("two_card — 7번째라도 글자 미달이면 자유 구간", () => {
  assert.equal(computeWrapMode(7, 3239, t).mode, "free");
});

test("two_card — 8번째(마무리선−1)도 글자 미달이면 자유 구간", () => {
  assert.equal(computeWrapMode(8, 3239, t).mode, "free");
});

test("two_card — 11번째(강제 종료선−1)는 글자 무관 마지막 수렴 턴", () => {
  const r = computeWrapMode(11, 100, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, true);
});

const ctxBase = {
  spreadType: "two_card" as const,
  spreadCategory: "love" as const,
  concernText: "그 사람이 다시 연락할까?",
  drawnCards: [
    { position: 0, label: "상황", card_id: 1, direction: "upright" as const },
    { position: 1, label: "조언", card_id: 2, direction: "upright" as const },
  ],
  assistantTurnsSoFar: 8, // 다음 = 9번째 = 자연 마무리선
  cumulativeAssistantChars: 4000,
};

test("buildTarotSystemMessage — 자연 마무리선 + keepOpen 이면 이어가기 가이드, 아니면 기존 마무리 가이드", () => {
  const open = buildTarotSystemMessage({ ...ctxBase, keepOpen: true }).dynamicPart;
  assert.ok(open.includes("## 대화 열어 두기"));
  assert.ok(!open.includes("## 마무리 단계"));
  const close = buildTarotSystemMessage({ ...ctxBase, keepOpen: false }).dynamicPart;
  assert.ok(close.includes("## 마무리 단계"));
});

test("buildTarotSystemMessage — clarifierCandidate 일 때만 '한 장 더' 판단 지시", () => {
  const c = { ...ctxBase, assistantTurnsSoFar: 2, cumulativeAssistantChars: 1500 };
  assert.ok(buildTarotSystemMessage({ ...c, clarifierCandidate: true }).dynamicPart.includes("'카드 한 장 더' 제안 판단"));
  assert.ok(!buildTarotSystemMessage({ ...c, clarifierCandidate: false }).dynamicPart.includes("'카드 한 장 더' 제안 판단"));
});

// ── keep-open · '한 장 더' 지시의 우선순위와 빌더 방어 게이트 (spec 2026-10-04 §3-3·§3-5) ──
// 헤딩은 이모지 없이 부분 문자열로만 본다(⚠️ 의 변형 선택자 유무에 테스트가 흔들리지 않게).
const KEEP_OPEN_HEAD = "## 대화 열어 두기";
const MUST_CLOSE_HEAD = "마무리 의무"; // absHardcapGuide — forceEnd·절대 턴캡
const CRISIS_HEAD = "위기 시그널 감지"; // CRISIS_STAY_GUIDE
const CLARIFIER_HEAD = "'카드 한 장 더' 제안 판단";

type Ctx = Parameters<typeof buildTarotSystemMessage>[0];
const dyn = (ctx: Ctx) => buildTarotSystemMessage(ctx).dynamicPart;
const freeCtx = { ...ctxBase, assistantTurnsSoFar: 2, cumulativeAssistantChars: 1500 }; // 3번째 = 자유 구간
const convergeCtx = { ...ctxBase, assistantTurnsSoFar: 7, cumulativeAssistantChars: 3300 }; // 8번째 = 마지막 수렴 턴

test("keepOpen 은 forceEnd·위기·절대 턴캡 앞에서 물러난다 — 열어 두기 대신 마무리 의무/위기 블록", () => {
  const cases: Array<[string, Ctx, string]> = [
    ["forceEnd", { ...ctxBase, keepOpen: true, forceEnd: true }, MUST_CLOSE_HEAD],
    ["crisisActive", { ...ctxBase, keepOpen: true, crisisActive: true }, CRISIS_HEAD],
    ["절대 턴캡", { ...ctxBase, keepOpen: true, assistantTurnsSoFar: t.absTurnCap - 1 }, MUST_CLOSE_HEAD],
  ];
  for (const [name, ctx, expected] of cases) {
    const d = dyn(ctx);
    assert.ok(!d.includes(KEEP_OPEN_HEAD), `${name}: 열어 두기 가이드가 새면 안 된다`);
    assert.ok(d.includes(expected), `${name}: '${expected}' 블록이 있어야 한다`);
  }
});

test("keepOpen 은 자연 마무리선에서만 — 수렴 턴에서는 무시된다", () => {
  const d = dyn({ ...convergeCtx, keepOpen: true });
  assert.ok(d.includes("## 수렴 모드"), "픽스처가 수렴 턴이어야 이 테스트가 의미 있다");
  assert.ok(!d.includes(KEEP_OPEN_HEAD));
});

test("clarifierCandidate 는 위기·강제 종료·자유 구간 밖에서 빌더가 한 번 더 막는다 (방어 게이트)", () => {
  assert.ok(dyn({ ...freeCtx, clarifierCandidate: true }).includes(CLARIFIER_HEAD), "대조군: 자유 구간 후보 턴엔 있다");
  const cases: Array<[string, Ctx]> = [
    ["crisisActive", { ...freeCtx, clarifierCandidate: true, crisisActive: true }],
    ["forceEnd", { ...freeCtx, clarifierCandidate: true, forceEnd: true }],
    ["수렴 턴", { ...convergeCtx, clarifierCandidate: true }],
    ["자연 마무리선", { ...ctxBase, clarifierCandidate: true }],
    ["절대 턴캡", { ...ctxBase, clarifierCandidate: true, assistantTurnsSoFar: t.absTurnCap - 1 }],
  ];
  for (const [name, ctx] of cases) {
    assert.ok(!dyn(ctx).includes(CLARIFIER_HEAD), `${name}: 결제 제안 지시가 새면 안 된다`);
  }
});

test("'한 장 더' 지시는 서버 마커 상수(CLARIFIER_MARKER)를 그대로 쓴다 — 프롬프트·수리·클라 파서가 한 철자", () => {
  assert.ok(dyn({ ...freeCtx, clarifierCandidate: true }).includes(CLARIFIER_MARKER));
});

test("staticPart 는 플래그 조합과 무관하게 동일하다 (프롬프트 캐시 계약)", () => {
  const base = buildTarotSystemMessage(ctxBase).staticPart;
  assert.ok(base.length > 0);
  const variants: Ctx[] = [
    { ...ctxBase, keepOpen: true },
    { ...ctxBase, forceEnd: true },
    { ...ctxBase, crisisActive: true },
    { ...freeCtx, clarifierCandidate: true },
    { ...ctxBase, keepOpen: true, clarifierCandidate: true },
  ];
  for (const v of variants) {
    assert.equal(buildTarotSystemMessage(v).staticPart, base);
  }
});
