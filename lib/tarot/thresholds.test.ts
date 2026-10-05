import { test } from "node:test";
import assert from "node:assert/strict";
import { WRAP_THRESHOLDS, type WrapThresholds } from "./constants.ts";
import { effectiveWrapThresholds } from "./thresholds.ts";
import { effectiveAbsTurnCap } from "./reopen.ts";
import { computeWrapMode } from "../claude.ts";

/** 2026-10-04 사용자 결정 ③ 이전 채팅 라우트의 인라인 식(그대로 옮김) — 연장 없는 리딩은 이 식과 같아야 한다 */
function legacyRouteEffT(base: WrapThresholds, extraTurns: number, clarifierCount: number): WrapThresholds {
  const bonusTurns = extraTurns + clarifierCount * 2;
  const bonusChars = clarifierCount * 800;
  return {
    convergeStartTurn: base.convergeStartTurn + bonusTurns,
    convergeStartChars: base.convergeStartChars + bonusChars,
    hardCapTurn: base.hardCapTurn + bonusTurns,
    hardCapChars: base.hardCapChars + bonusChars,
    absTurnCap: base.absTurnCap + bonusTurns,
  };
}

test("effectiveWrapThresholds — 보너스 없으면 기본 임계치와 같다(상수를 그대로 내주지 않고 복사본)", () => {
  for (const [spread, base] of Object.entries(WRAP_THRESHOLDS)) {
    const t = effectiveWrapThresholds(spread, 0, 0);
    assert.deepEqual(t, base, spread);
    // 상수 객체를 그대로 돌려주면 호출자가 바꿔 전역 임계치가 오염된다
    assert.notEqual(t, base, spread);
  }
});

test("effectiveWrapThresholds — 보조 카드 보너스(+2턴/+800자 per 장)는 예전 라우트 식과 같다", () => {
  for (const [spread, base] of Object.entries(WRAP_THRESHOLDS)) {
    for (const clarifierCount of [0, 1, 2]) {
      assert.deepEqual(
        effectiveWrapThresholds(spread, 0, clarifierCount),
        legacyRouteEffT(base, 0, clarifierCount),
        `${spread} clarifier=${clarifierCount}`,
      );
    }
  }
});

test("effectiveWrapThresholds — 연장 리딩은 예전 식에서 자연 마무리선만 강제 종료선으로 옮긴다(결정 ③). 수렴 시작·글자 임계는 그대로", () => {
  for (const [spread, base] of Object.entries(WRAP_THRESHOLDS)) {
    for (const extraTurns of [1, 4]) {
      for (const clarifierCount of [0, 1, 2]) {
        const legacy = legacyRouteEffT(base, extraTurns, clarifierCount);
        assert.deepEqual(
          effectiveWrapThresholds(spread, extraTurns, clarifierCount),
          { ...legacy, hardCapTurn: legacy.absTurnCap },
          `${spread} extra=${extraTurns} clarifier=${clarifierCount}`,
        );
      }
    }
  }
});

test("effectiveWrapThresholds — 투카드 연장 4턴 = 수렴 11 · 자연 마무리선 16 = 강제 종료선 16", () => {
  assert.deepEqual(effectiveWrapThresholds("two_card", 4, 0), {
    convergeStartTurn: 11,
    convergeStartChars: 3240,
    hardCapTurn: 16,
    hardCapChars: 3640,
    absTurnCap: 16,
  });
  // 연장 + 보조 카드 1장: 턴 +6, 글자 +800
  assert.deepEqual(effectiveWrapThresholds("two_card", 4, 1), {
    convergeStartTurn: 13,
    convergeStartChars: 4040,
    hardCapTurn: 18,
    hardCapChars: 4440,
    absTurnCap: 18,
  });
});

test("투카드 강제 종료선(12)에서 닫힌 뒤 '4턴 더' — 13·14번째는 수렴, 15번째는 마지막 수렴, 16번째에 강제 종료. 자연 마무리선은 없다", () => {
  const t = effectiveWrapThresholds("two_card", 4, 0);
  assert.ok(t);
  const chars = 20_000; // 모든 글자 임계 위
  const at = (turn: number) => computeWrapMode(turn, chars, t);
  assert.deepEqual(at(13), { mode: "converge", isLastConvergeTurn: false, absHardcap: false });
  assert.deepEqual(at(14), { mode: "converge", isLastConvergeTurn: false, absHardcap: false });
  assert.deepEqual(at(15), { mode: "converge", isLastConvergeTurn: true, absHardcap: false });
  assert.deepEqual(at(16), { mode: "hardcap", isLastConvergeTurn: false, absHardcap: true });

  // 대조: ③ 이전 식이었다면 13번째가 자연 마무리선(absHardcap=false 인 hardcap) — 별 10개로 1턴만 사는 구조
  const before = computeWrapMode(13, chars, legacyRouteEffT(WRAP_THRESHOLDS.two_card, 4, 0));
  assert.deepEqual(before, { mode: "hardcap", isLastConvergeTurn: false, absHardcap: false });
});

test("연장 리딩은 어떤 스프레드·보조 카드 수에서도 강제 종료선 전엔 hardcap 이 아니다(자연 마무리선 부재)", () => {
  for (const spread of Object.keys(WRAP_THRESHOLDS)) {
    for (const clarifierCount of [0, 1, 2]) {
      const t = effectiveWrapThresholds(spread, 4, clarifierCount);
      assert.ok(t, spread);
      for (let turn = 1; turn <= t.absTurnCap + 1; turn++) {
        const w = computeWrapMode(turn, 50_000, t);
        assert.equal(w.mode === "hardcap", turn >= t.absTurnCap, `${spread} clarifier=${clarifierCount} turn=${turn}`);
        if (w.mode === "hardcap") assert.equal(w.absHardcap, true, `${spread} turn=${turn} 은 자연이 아니라 강제 종료선이어야 한다`);
      }
    }
  }
});

test("effectiveWrapThresholds — 모르는 스프레드는 undefined(상속 프로퍼티 이름 포함)", () => {
  for (const k of ["legacy_spread", "", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(effectiveWrapThresholds(k, 0, 0), undefined, JSON.stringify(k));
    assert.equal(effectiveWrapThresholds(k, 4, 2), undefined, JSON.stringify(k));
  }
});

test("effectiveAbsTurnCap 은 같은 식에서 나온다 — 모든 스프레드·연장·보조 카드에서 일치, 모르는 스프레드는 무한대", () => {
  for (const spread of Object.keys(WRAP_THRESHOLDS)) {
    for (const extraTurns of [0, 4]) {
      for (const clarifierCount of [0, 1, 2]) {
        assert.equal(
          effectiveAbsTurnCap(spread, extraTurns, clarifierCount),
          effectiveWrapThresholds(spread, extraTurns, clarifierCount)?.absTurnCap,
          `${spread} extra=${extraTurns} clarifier=${clarifierCount}`,
        );
      }
    }
  }
  assert.equal(effectiveAbsTurnCap("legacy_spread", 0, 0), Number.POSITIVE_INFINITY);
  assert.equal(effectiveAbsTurnCap("constructor", 0, 0), Number.POSITIVE_INFINITY); // 예전엔 NaN
});
