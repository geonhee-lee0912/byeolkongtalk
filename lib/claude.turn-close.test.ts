import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTurnClose, buildTurnSignalBlock, computeTurnSignals } from "./claude.ts";

const base = {
  prevUserText: "앞선 발화가 여기에 충분히 길게 들어갑니다 정말로요",
  currentUserText: "그 사람은 지금 무슨 생각일까",
  lastTurnEndedWithQuestion: false,
  userShortStreak: false,
};

test("computeTurnClose — 단답 2연속이면 settle (07-12 원 진단 조건)", () => {
  assert.equal(
    computeTurnClose({ ...base, userShortStreak: true, currentUserText: "응" }),
    "settle",
  );
});

test("computeTurnClose — 수렴·마무리 구간이면 settle", () => {
  assert.equal(computeTurnClose({ ...base, wrapMode: "converge" }), "settle");
  assert.equal(computeTurnClose({ ...base, wrapMode: "hardcap" }), "settle");
  assert.equal(computeTurnClose({ ...base, wrapMode: "free" }), "invite");
});

test("computeTurnClose — 유저가 물음표를 쓰면 ask", () => {
  assert.equal(
    computeTurnClose({ ...base, currentUserText: "그럼 언제쯤 연락이 올까?" }),
    "ask",
  );
});

test("computeTurnClose — 발화가 직전보다 20자 이상 길어지면 ask", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      prevUserText: "응 맞아",
      currentUserText:
        "사실 어제 그 사람이 스토리를 올렸는데 내 얘기 같아서 계속 신경 쓰여",
    }),
    "ask",
  );
});

test("computeTurnClose — 첫 풀이인데 고민이 40자 미만이면 ask (C1 대응)", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      prevUserText: null,
      currentUserText: "재결합 가능할까요",
      isFirstTurn: true,
      questionLen: 11,
    }),
    "ask",
  );
});

test("computeTurnClose — 첫 풀이는 고민이 길면 물음표가 있어도 ask 아님 (프로덕션 형태)", () => {
  // 프로덕션에서 첫 턴의 currentUserText 는 고민 본문 그 자체다 — 둘이 같은 문자열이다.
  // 고민 끝의 물음표로 ask 가 뜨면 §6('첫 풀이는 디테일 질문으로 닫지 마')이 무력해진다.
  const concern =
    "세 달 전에 헤어진 남자친구가 있는데 아직 연락은 하고 지내. 다시 만날 수 있을까요?";
  assert.equal(
    computeTurnClose({
      ...base,
      prevUserText: null,
      currentUserText: concern,
      isFirstTurn: true,
      questionLen: concern.length,
    }),
    "invite",
  );
});

test("computeTurnClose — 첫 풀이 짧은 고민은 물음표 유무와 무관하게 ask", () => {
  for (const concern of ["재결합 가능할까요?", "재결합 될까", "언제 연락 올까"]) {
    assert.equal(
      computeTurnClose({
        ...base,
        prevUserText: null,
        currentUserText: concern,
        isFirstTurn: true,
        questionLen: concern.length,
      }),
      "ask",
      `짧은 고민 "${concern}" 이 ask 가 아님`,
    );
  }
});

test("computeTurnClose — 후속 턴에서는 물음표 게이트가 그대로 산다", () => {
  // 첫 턴만 게이트를 끈 것이지 후속 턴 동작은 불변이어야 한다
  assert.equal(
    computeTurnClose({ ...base, currentUserText: "그럼 언제쯤 연락이 올까?" }),
    "ask",
  );
  assert.equal(
    computeTurnClose({
      ...base,
      isFirstTurn: false,
      currentUserText: "그럼 언제쯤 연락이 올까?",
    }),
    "ask",
  );
});

test("computeTurnClose — ask 조건이어도 직전 턴이 질문이면 invite 로 강등", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      currentUserText: "그럼 언제쯤 연락이 올까?",
      lastTurnEndedWithQuestion: true,
    }),
    "invite",
  );
});

test("computeTurnClose — 아무 조건도 안 맞으면 invite (기본값)", () => {
  assert.equal(computeTurnClose(base), "invite");
});

test("computeTurnClose — settle 은 ask 보다 우선", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      currentUserText: "언제 올까?",
      userShortStreak: true,
    }),
    "settle",
  );
});

test("computeTurnClose — prevUserText 가 빈 문자열이면 성장으로 보지 않는다", () => {
  // 직전 발화가 실제로 비어 있는 경우. null 과 같게 취급해야 한다.
  const long = "사실 어제 그 사람이 스토리를 올렸는데 내 얘기 같아서 계속 신경 쓰여";
  assert.equal(
    computeTurnClose({ ...base, prevUserText: "", currentUserText: long }),
    "invite",
  );
  assert.equal(
    computeTurnClose({ ...base, prevUserText: "   ", currentUserText: long }),
    "invite",
  );
  assert.equal(
    computeTurnClose({ ...base, prevUserText: null, currentUserText: long }),
    "invite",
  );
});

test("computeTurnClose — 첫 풀이 고민이 0자여도 ask (가장 극단적인 짧은 고민)", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      prevUserText: null,
      currentUserText: "그냥 그래",
      isFirstTurn: true,
      questionLen: 0,
    }),
    "ask",
  );
});

test("computeTurnClose — 물음표가 문장 중간에 있어도 ask", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      currentUserText: "그게 진짜야? 아무튼 오늘 하루 힘들었어",
    }),
    "ask",
  );
});

test("computeTurnClose — 전각 물음표(？)도 인식한다", () => {
  assert.equal(
    computeTurnClose({ ...base, currentUserText: "정말 그럴까？" }),
    "ask",
  );
});

test("computeTurnClose — 빈 발화·공백만이어도 크래시 없이 invite", () => {
  assert.equal(computeTurnClose({ ...base, currentUserText: "" }), "invite");
  assert.equal(computeTurnClose({ ...base, currentUserText: "   " }), "invite");
});

test("buildTurnSignalBlock — ask 상태는 질문 허용을 명시한다", () => {
  const out = buildTurnSignalBlock({ turnClose: "ask" });
  assert.match(out, /턴 마무리 상태/);
  assert.match(out, /ask/);
  assert.match(out, /내려 —/);
});

test("buildTurnSignalBlock — settle 은 질문·되묻기 둘 다 닫는다", () => {
  const out = buildTurnSignalBlock({ turnClose: "settle" });
  assert.match(out, /settle/);
  assert.match(out, /③/);
});

test("buildTurnSignalBlock — invite 는 물음표 없이 고리만", () => {
  const out = buildTurnSignalBlock({ turnClose: "invite" });
  assert.match(out, /invite/);
  assert.match(out, /②/);
});

test("buildTurnSignalBlock — 상태가 없으면 빈 문자열 (기존 동작 보존)", () => {
  assert.equal(buildTurnSignalBlock(undefined), "");
  assert.equal(buildTurnSignalBlock({}), "");
});

test("buildTurnSignalBlock — settle 은 ①·② 를 명시적으로 닫는다 (누수 차단)", () => {
  const out = buildTurnSignalBlock({ turnClose: "settle" });
  assert.match(out, /여기가 제일 아래야/);
  assert.match(out, /②\(다음 볼거리 예고\)도 쓰지 마/);
});

test("buildTurnSignalBlock — 하강 목록에 ④ 가 포함된다 (연애상담 정본 마무리)", () => {
  assert.match(buildTurnSignalBlock({ turnClose: "ask" }), /②③④/);
  assert.match(buildTurnSignalBlock({ turnClose: "invite" }), /③④/);
});

test("buildTurnSignalBlock — invite 에 실제 고리 예시가 들어 있다", () => {
  const out = buildTurnSignalBlock({ turnClose: "invite" });
  assert.match(out, /들려줘/);
  // "한 장 더 펼쳐서"(타로 전용 문구)는 도메인 누수라 도메인 중립 예시로 교체됨 — 새 문구로 갱신
  assert.match(out, /짚어줄 수 있어/);
});

test("buildTurnSignalBlock — 헤더가 위기 최우선을 명시한다 (안전)", () => {
  assert.match(buildTurnSignalBlock({ turnClose: "settle" }), /§위기가 최우선/);
});

test("buildTurnSignalBlock — turnClose 가 있으면 경고는 처방 없이 근거만", () => {
  const out = buildTurnSignalBlock({
    turnClose: "settle",
    lastTurnEndedWithQuestion: true,
    userShortStreak: true,
  });
  // settle 이 금지한 ②(예고)를 경고줄이 다시 허가하면 안 된다
  assert.doesNotMatch(out, /정리·예고·여백/);
  assert.match(out, /위 상태가 이미 그걸 반영/);
});

test("buildTurnSignalBlock — turnClose 가 없으면 기존 경고 문구 그대로 (하위호환)", () => {
  const out = buildTurnSignalBlock({
    lastTurnEndedWithQuestion: true,
    userShortStreak: true,
  });
  assert.match(out, /이번 턴은 질문으로 마무리하지 마/);
  assert.match(out, /정리·예고·여백으로 부드럽게/);
  assert.doesNotMatch(out, /턴 마무리 상태/);
});

test("computeTurnSignals — ctx 없이 호출해도 기존 필드는 그대로 (하위호환)", () => {
  const s = computeTurnSignals(
    [{ role: "assistant", content: "그렇구나." }],
    "응",
  );
  assert.equal(s.lastTurnEndedWithQuestion, false);
  assert.equal(typeof s.turnClose, "string");
});

test("computeTurnSignals — ctx 를 주면 turnClose 에 반영된다", () => {
  const past = [
    { role: "user", content: "앞선 발화가 여기에 충분히 길게 들어갑니다" },
    { role: "assistant", content: "이 흐름은 열려 있어." },
  ];
  assert.equal(
    computeTurnSignals(past, "그럼 언제쯤 연락이 올까?", { wrapMode: "free" })
      .turnClose,
    "ask",
  );
  assert.equal(
    computeTurnSignals(past, "그럼 언제쯤 연락이 올까?", {
      wrapMode: "converge",
    }).turnClose,
    "settle",
  );
});

test("computeTurnSignals — 첫 턴 짧은 고민은 ask", () => {
  const s = computeTurnSignals([], "재결합 가능할까요", {
    wrapMode: "free",
    isFirstTurn: true,
    questionLen: 11,
  });
  assert.equal(s.turnClose, "ask");
});
