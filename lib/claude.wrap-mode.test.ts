import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeWrapMode, buildTarotSystemMessage } from "./claude.ts";
import { WRAP_THRESHOLDS } from "./tarot/constants.ts";
import { CLARIFIER_MARKER } from "./tarot/inchat-offer.ts";
import { effectiveWrapThresholds } from "./tarot/thresholds.ts";

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

test("buildTarotSystemMessage — 자연 마무리선 + keepOpen 이면 대화 열어 두기 가이드, 아니면 기존 마무리 가이드", () => {
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
    { ...ctxBase, clarifierReopenTurn: true },
  ];
  for (const v of variants) {
    assert.equal(buildTarotSystemMessage(v).staticPart, base);
  }
});

// ── 열어 두기 턴의 정리 요청 규칙 제외 · 단답 연속(settle) 방어 게이트 ──
const SUMMARY_RULE_HEAD = "### 정리 요청 = 마무리"; // SUMMARY_END_RULE

test("열어 두기 가이드가 선택된 턴엔 정리 요청 규칙(SUMMARY_END_RULE)을 싣지 않는다 — '[END] 없이' 와 '[END] 를 붙여' 가 한 프롬프트에 공존하지 않게", () => {
  const open = dyn({ ...ctxBase, keepOpen: true });
  assert.ok(open.includes(KEEP_OPEN_HEAD), "픽스처가 열어 두기 선택 턴이어야 한다");
  assert.ok(!open.includes(SUMMARY_RULE_HEAD));
  // 규칙을 뺀 대신 정리 요청 처리는 열어 두기 가이드 자체가 맡는다
  assert.ok(open.includes("요약까지만"));
  // 대조: 같은 자연 마무리선이라도 열어 두기가 아니면 규칙은 그대로다
  assert.ok(dyn({ ...ctxBase, keepOpen: false }).includes(SUMMARY_RULE_HEAD));
});

test("keepOpen 이 무시되는 턴(forceEnd·절대 턴캡·수렴·자유)에선 정리 요청 규칙이 그대로 있고 출력이 keepOpen:false 와 바이트까지 같다", () => {
  // 원시 ctx.keepOpen 으로 규칙을 빼면 여기서 깨진다 — '선택된 가이드'로 판단해야 계약(keepOpen 무시)이 지켜진다
  const cases: Array<[string, Ctx]> = [
    ["forceEnd", { ...ctxBase, forceEnd: true }],
    ["절대 턴캡", { ...ctxBase, assistantTurnsSoFar: t.absTurnCap - 1 }],
    ["수렴 턴", convergeCtx],
    ["자유 구간", freeCtx],
  ];
  for (const [name, c] of cases) {
    const withFlag = dyn({ ...c, keepOpen: true });
    assert.ok(withFlag.includes(SUMMARY_RULE_HEAD), `${name}: 정리 요청 규칙이 있어야 한다`);
    assert.equal(withFlag, dyn({ ...c, keepOpen: false }), `${name}: keepOpen 은 출력에 영향이 없어야 한다`);
  }
});

test("clarifierCandidate 는 턴 마무리가 '정리'(단답 연속)면 빌더가 한 번 더 막는다 — 라우트 후보 판정과 같은 결정 (사용자 결정 2026-10-04)", () => {
  assert.ok(!dyn({ ...freeCtx, clarifierCandidate: true, turnSignals: { turnClose: "settle" } }).includes(CLARIFIER_HEAD));
  // 대조: 막는 건 'settle' 하나뿐이다
  for (const turnClose of ["ask", "invite"] as const) {
    assert.ok(dyn({ ...freeCtx, clarifierCandidate: true, turnSignals: { turnClose } }).includes(CLARIFIER_HEAD), turnClose);
  }
});

// ── ⑦ 보조 카드로 다시 연 직후의 카드 풀이 턴 — 모드와 무관하게 열어 두기 가이드 (사용자 결정 2026-10-04 ⑦) ──
// 연장(4턴 더)을 산 리딩은 자연 마무리선이 강제 종료선과 같아(③) 이 턴이 abs−1(마지막 수렴 턴)이 된다 — 유료 카드 풀이가
// 짧은 정리 톤·출구 문구로 얇아지지 않게 한다. 위기·forceEnd·강제 종료선에는 진다.
const CONVERGE_HEAD = "## 수렴 모드";
const LAST_CONVERGE_HEAD = "마지막 수렴 턴"; // convergeLastGuide 헤딩
const NATURAL_HEAD = "## 마무리 단계"; // naturalHardcapGuide
const midConvergeCtx = { ...ctxBase, assistantTurnsSoFar: 6, cumulativeAssistantChars: 3300 }; // 7번째 = 수렴(마지막 아님)

test("clarifierReopenTurn — 마지막 수렴 턴(abs−1)에서도 열어 두기 가이드가 이긴다: 마지막 수렴 가이드·정리 요청 규칙이 없다", () => {
  const before = dyn(convergeCtx); // 8번째 = 마지막 수렴 턴
  assert.ok(before.includes(LAST_CONVERGE_HEAD) && before.includes(SUMMARY_RULE_HEAD), "대조군: 플래그 없으면 마지막 수렴 가이드 + 정리 요청 규칙");
  const d = dyn({ ...convergeCtx, clarifierReopenTurn: true });
  assert.ok(d.includes(KEEP_OPEN_HEAD));
  assert.ok(!d.includes(LAST_CONVERGE_HEAD));
  assert.ok(!d.includes(CONVERGE_HEAD));
  assert.ok(!d.includes(SUMMARY_RULE_HEAD)); // 열어 두기 가이드가 선택된 턴 → 정리 요청 규칙 제외(keepOpenSelected)
});

test("clarifierReopenTurn — 연장 뒤 '한 장 더': 투카드(연장 4 + 보조 1 → 강제 종료선 18)의 카드 풀이 턴(17번째 = abs−1)", () => {
  const eff = effectiveWrapThresholds("two_card", 4, 1);
  assert.ok(eff);
  const c = { ...ctxBase, thresholdOverride: eff, assistantTurnsSoFar: 16, cumulativeAssistantChars: 9000 };
  assert.ok(dyn(c).includes(LAST_CONVERGE_HEAD), "대조군: 플래그가 없으면 abs−1 이라 마지막 수렴 턴(짧은 정리 톤 + 출구 문구)");
  const d = dyn({ ...c, clarifierReopenTurn: true });
  assert.ok(d.includes(KEEP_OPEN_HEAD));
  assert.ok(!d.includes(LAST_CONVERGE_HEAD));
  // 한 턴 뒤(18번째)는 강제 종료선 — 플래그가 남아 있어도 닫는다
  const next = dyn({ ...c, assistantTurnsSoFar: 17, clarifierReopenTurn: true });
  assert.ok(next.includes(MUST_CLOSE_HEAD));
  assert.ok(!next.includes(KEEP_OPEN_HEAD));
});

test("clarifierReopenTurn — 자유·수렴·마지막 수렴·자연 마무리선 어디서든 열어 두기 가이드가 이기고, 자연 마무리선에선 keepOpen 과 바이트까지 같다", () => {
  const modes: Array<[string, Ctx]> = [
    ["자유 구간", freeCtx],
    ["수렴(마지막 아님)", midConvergeCtx],
    ["마지막 수렴", convergeCtx],
    ["자연 마무리선", ctxBase],
  ];
  for (const [name, c] of modes) {
    const d = dyn({ ...c, clarifierReopenTurn: true });
    assert.ok(d.includes(KEEP_OPEN_HEAD), `${name}: 열어 두기 가이드`);
    for (const head of [NATURAL_HEAD, CONVERGE_HEAD, LAST_CONVERGE_HEAD, SUMMARY_RULE_HEAD]) {
      assert.ok(!d.includes(head), `${name}: '${head}' 가 새면 안 된다`);
    }
  }
  assert.equal(dyn({ ...ctxBase, clarifierReopenTurn: true }), dyn({ ...ctxBase, keepOpen: true }));
});

test("clarifierReopenTurn 은 forceEnd·위기·강제 종료선 앞에서 물러난다 — 마무리 의무/위기 블록이 나오고 플래그 없을 때와 바이트까지 같다", () => {
  const cases: Array<[string, Ctx, string]> = [
    ["forceEnd", { ...convergeCtx, forceEnd: true }, MUST_CLOSE_HEAD],
    ["crisisActive", { ...convergeCtx, crisisActive: true }, CRISIS_HEAD],
    ["절대 턴캡", { ...ctxBase, assistantTurnsSoFar: t.absTurnCap - 1 }, MUST_CLOSE_HEAD],
    ["위기 + forceEnd(버튼은 위기여도 닫는다)", { ...convergeCtx, crisisActive: true, forceEnd: true }, MUST_CLOSE_HEAD],
  ];
  for (const [name, c, expected] of cases) {
    const withFlag = dyn({ ...c, clarifierReopenTurn: true });
    assert.ok(!withFlag.includes(KEEP_OPEN_HEAD), `${name}: 열어 두기 가이드가 새면 안 된다`);
    assert.ok(withFlag.includes(expected), `${name}: '${expected}' 블록이 있어야 한다`);
    assert.equal(withFlag, dyn({ ...c, clarifierReopenTurn: false }), `${name}: 플래그는 출력에 영향이 없어야 한다`);
  }
});

test("clarifierReopenTurn 이 없으면(미지정·false) 모든 구간의 출력이 예전 그대로다 — 구간별 기존 가이드가 그대로 나온다", () => {
  const modes: Array<[string, Ctx, string[]]> = [
    ["자유 구간", freeCtx, [SUMMARY_RULE_HEAD]],
    ["수렴(마지막 아님)", midConvergeCtx, [CONVERGE_HEAD, SUMMARY_RULE_HEAD]],
    ["마지막 수렴", convergeCtx, [LAST_CONVERGE_HEAD, SUMMARY_RULE_HEAD]],
    ["자연 마무리선", ctxBase, [NATURAL_HEAD, SUMMARY_RULE_HEAD]],
    ["자연 마무리선 + keepOpen", { ...ctxBase, keepOpen: true }, [KEEP_OPEN_HEAD]],
    ["절대 턴캡", { ...ctxBase, assistantTurnsSoFar: t.absTurnCap - 1 }, [MUST_CLOSE_HEAD]],
    ["forceEnd", { ...ctxBase, forceEnd: true }, [MUST_CLOSE_HEAD]],
    ["위기", { ...ctxBase, crisisActive: true }, [CRISIS_HEAD]],
  ];
  for (const [name, c, heads] of modes) {
    const unset = dyn(c);
    for (const head of heads) assert.ok(unset.includes(head), `${name}: '${head}'`);
    assert.equal(dyn({ ...c, clarifierReopenTurn: false }), unset, name);
  }
});

// ── 열어 두기 가이드 문구 — 질문·답·요청 턴 모두에 맞는다 (⑥ 은 별콩이의 질문에 유저가 '답한' 턴, ⑦ 은 카드 풀이를 '청한' 턴) ──
test("열어 두기 가이드는 유저가 '질문을 던졌다'고 단정하지 않는다 — 질문·답·요청(또는 새 고민)을 건넨 턴 모두에 맞는 문구", () => {
  const d = dyn({ ...ctxBase, keepOpen: true });
  assert.ok(d.includes("## 대화 열어 두기 (유저가 아직 이야기 중)"));
  assert.ok(d.includes("유저가 방금 질문·답·요청(또는 새 고민)을 건넸어."));
  assert.ok(d.includes("이번 턴은 그 말에 먼저 충실히 답하고, 대화는 열어 둬."));
  for (const stale of ["아직 묻는 중", "방금 질문(또는 새 고민)을 던졌어", "그 질문에 먼저 충실히"]) {
    assert.ok(!d.includes(stale), `옛 문구 '${stale}' 가 남으면 안 된다`);
  }
  // 나머지 지시는 그대로 — [END] 금지·작별 인사 금지·마무리 방식은 턴 마무리 상태대로
  assert.ok(d.includes("[END] 마커 금지"));
  assert.ok(d.includes("작별 인사"));
  assert.ok(d.includes("턴 마무리 상태"));
});

// ── 열어 두기 가이드 + 턴 마무리 '정리' — 강제 종료 직전(abs−1)에서 열어 둔 턴이 받는 조합 (capTurnCloseBeforeAbsCap, 사용자 결정 2026-10-04) ──
// 그 턴은 질문·예고 고리 없이 '정리'(③ 소신 정리+여백 / ④ 공감으로 열어두기)로 닫는다. 같은 프롬프트에 열어 두기 가이드([END]·작별 인사 금지,
// 마무리 방식은 "아래 `턴 마무리 상태`대로")가 있으므로 둘이 서로 어긋나지 않아야 한다 — 가이드가 상태보다 위, 상태는 정리 하나, 정리 문구와 그것이 가리키는 ③④ 정의가 작별을 시키지 않는다.
const STATE_MARK = "턴 마무리 상태:"; // 가이드 본문의 "`턴 마무리 상태`대로" 와 달리 콜론이 붙는 건 상태 줄뿐이다
const CLOSING_WORDS = ["[END]", "작별", "오늘은 여기까지", "또 와", "안녕"];

test("열어 두기 가이드 + '정리' 상태는 한 프롬프트에서 어긋나지 않는다 — 가이드가 [END]·작별을 막고 마무리 방식은 아래 상태에 맡기며, 정리는 ③④ 로만 닫고 ①②를 막는다", () => {
  const { staticPart, dynamicPart: d } = buildTarotSystemMessage({ ...ctxBase, keepOpen: true, turnSignals: { turnClose: "settle" } });
  assert.ok(d.includes(KEEP_OPEN_HEAD), "픽스처가 열어 두기 선택 턴이어야 한다");
  // 상태 줄은 정리 하나뿐 — 질문·여지가 같이 오면 서로 다른 지시가 된다
  const stateLines = d.split("\n").filter((l) => l.includes(STATE_MARK));
  assert.equal(stateLines.length, 1);
  const state = stateLines[0];
  assert.ok(state.includes("`정리`"));
  // 가이드가 위, 상태가 아래 — 가이드의 "아래 `턴 마무리 상태`대로" 가 성립한다
  assert.ok(d.indexOf(KEEP_OPEN_HEAD) < d.indexOf(STATE_MARK));
  // 열어 두기 가이드는 [END]·작별을 막고, 정리 상태는 그걸 시키지 않는다(③④ 로 닫고 ①②·예고를 막는다)
  assert.ok(d.includes("[END] 마커 금지") && d.includes("작별 인사"));
  assert.ok(state.includes("③") && state.includes("④") && state.includes("①(질문)도 ②(다음 볼거리 예고)도 쓰지 마"));
  for (const w of CLOSING_WORDS) assert.ok(!state.includes(w), `'정리' 문구가 '${w}' 를 시키면 안 된다`);
  // 정리가 가리키는 ③④ 의 정의(코어 §턴 마무리)가 정적 프롬프트에 있고, 그 정의도 [END]·작별을 시키지 않는다
  const defs = staticPart.split("\n").filter((l) => l.startsWith("- ③") || l.startsWith("- ④"));
  assert.equal(defs.length, 2, "③④ 정의가 하나씩 있어야 한다");
  for (const line of defs) for (const w of CLOSING_WORDS) assert.ok(!line.includes(w), `${line.slice(0, 12)}… 가 '${w}' 를 시키면 안 된다`);
  // 정리 요청 규칙·자연 마무리 가이드가 같이 새지 않는다(열어 두기 가이드가 선택된 턴)
  assert.ok(!d.includes(SUMMARY_RULE_HEAD));
  assert.ok(!d.includes(NATURAL_HEAD));
});

// ── 페르소나 포인터 ↔ 서버 지시 헤딩 계약 (Task 8 리뷰) ──
// data/persona/byeolkong_tarot.md 의 '먼저 제안하는 타이밍은 서버가 정해 줘' 문단은 서버 지시를 헤딩 문구로 가리킨다. 가이드 헤딩을 바꾸면 포인터가
// 조용히 낡아 서버 주도 제안이 닻을 잃는다. 헤딩은 렌더된 가이드에서 뽑아(후보 턴에서만 더해지는 줄 중 첫 ## 헤딩) 문구를 두 번 적지 않는다.
test("페르소나의 '한 장 더' 포인터는 서버 지시 헤딩을 그대로 인용한다", () => {
  const lines = (s: string) => s.split("\n");
  const plain = new Set(lines(dyn(freeCtx)));
  const addedByCandidate = lines(dyn({ ...freeCtx, clarifierCandidate: true })).filter((l) => !plain.has(l));
  const headingLine = addedByCandidate.find((l) => l.startsWith("## "));
  assert.ok(headingLine, "후보 턴 프롬프트가 더하는 줄 중에 ## 헤딩이 있어야 한다");
  const heading = headingLine.replace(/^##\s+/, "").trim();
  assert.ok(heading.length > 0);
  const persona = readFileSync(join(process.cwd(), "data", "persona", "byeolkong_tarot.md"), "utf-8");
  assert.ok(
    persona.includes(heading),
    `페르소나가 서버 지시 헤딩 "${heading}" 을 인용해야 한다 — 가이드 헤딩을 바꿨다면 data/persona/byeolkong_tarot.md 의 포인터도 같이 고칠 것`,
  );
});
