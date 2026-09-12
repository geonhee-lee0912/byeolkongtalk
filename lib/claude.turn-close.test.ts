import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTurnClose, buildTurnSignalBlock } from "./claude.ts";

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

test("computeTurnClose — 첫 풀이라도 고민이 충분히 길면 ask 아님", () => {
  assert.equal(
    computeTurnClose({
      ...base,
      prevUserText: null,
      currentUserText: "긴 고민",
      isFirstTurn: true,
      questionLen: 150,
    }),
    "invite",
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
  assert.match(out, /내려도 돼/);
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

test("buildTurnSignalBlock — 기존 두 경고는 그대로 남는다 (이중 방어)", () => {
  const out = buildTurnSignalBlock({
    turnClose: "invite",
    lastTurnEndedWithQuestion: true,
    userShortStreak: true,
  });
  assert.match(out, /직전 별콩이 턴이 질문으로 끝났어/);
  assert.match(out, /연속으로 짧아지고 있어/);
});
