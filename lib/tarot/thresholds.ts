// 타로 대화 임계치의 실효값 — 채팅 라우트(수렴·마무리 판정)와 재개 판정(reopen.ts)이 같은 식을 쓰게 하는 단일 원천.
// 순수 함수 · 클라 안전(서버 전용 import 없음).
import { WRAP_THRESHOLDS, type WrapThresholds } from "./constants.ts";
import type { SpreadType } from "./spreads.ts";

/** 업셀 보정 후 실효 임계치 — 채팅 라우트·재개 판정 공용 단일 원천.
 *  보조 카드 1장당 +2턴/+800자, 연장은 +extraTurns 턴.
 *  연장(4턴 더)을 산 리딩은 자연 마무리선을 강제 종료선에 맞춘다(사용자 결정 2026-10-04 ③) — 산 턴은 수렴 말투로 이어지다 마지막 턴에 닫힌다.
 *  (맞추지 않으면 투카드가 13~15번째 턴을 전부 자연 마무리선 위에서 시작해, 묻는 중이 아닌 한 기본이 마무리라 별 10개로 1턴만 사게 된다.)
 *  모르는 스프레드는 undefined — 호출자가 처리한다. */
export function effectiveWrapThresholds(
  spreadType: string,
  extraTurns: number,
  clarifierCount: number,
): WrapThresholds | undefined {
  // 상속 프로퍼티("constructor"·"__proto__" 등)가 걸리지 않게 own 키만 본다
  if (!Object.prototype.hasOwnProperty.call(WRAP_THRESHOLDS, spreadType)) return undefined;
  const base = WRAP_THRESHOLDS[spreadType as SpreadType];
  const bonusTurns = extraTurns + clarifierCount * 2;
  const bonusChars = clarifierCount * 800;
  const absTurnCap = base.absTurnCap + bonusTurns;
  return {
    convergeStartTurn: base.convergeStartTurn + bonusTurns,
    convergeStartChars: base.convergeStartChars + bonusChars,
    hardCapTurn: extraTurns > 0 ? absTurnCap : base.hardCapTurn + bonusTurns,
    hardCapChars: base.hardCapChars + bonusChars,
    absTurnCap,
  };
}
