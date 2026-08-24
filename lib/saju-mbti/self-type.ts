import type { AxisKey, Pole } from "./constants.ts";
import { POLES } from "./constants.ts";
import type { AxisResult } from "./mapping.ts";
import { QUESTIONS } from "./questions.ts";

/**
 * 문항 응답에서 산출한 자아 유형.
 *
 * ⚠️ axes[*].pct 는 **자아 원점수 비율**(f/(f+b)×100, 표시 전용)이다.
 * 팔자(PaljaType)의 pct 는 **인구 백분위**라 의미가 다르다 — 같은 축이라도 두 pct 를
 * 크기 비교하지 말 것. 일치율(matchRate)은 pct 가 아니라 극(pole)만 쓴다(스펙 §3·§5).
 * D 결과화면에서 자아·팔자 %막대를 나란히 그릴 때 두 값이 서로 다른 척도임을 주의.
 */
export interface SelfType {
  axes: Record<AxisKey, AxisResult>;
  code: string;
}

const AXES: AxisKey[] = ["yinYang", "strength", "wealth", "nurture"];

export function selfType(answers: Record<string, string>): SelfType {
  // 1) 8극 누적
  const score: Record<string, number> = {};
  // 2) 축별 주축 다수결용(부축 흘림 제외, +2 만)
  const primary: Record<AxisKey, { front: number; back: number }> = {
    yinYang: { front: 0, back: 0 }, strength: { front: 0, back: 0 },
    wealth: { front: 0, back: 0 }, nurture: { front: 0, back: 0 },
  };
  for (const q of QUESTIONS) {
    const chosen = q.options.find((o) => o.id === answers[q.id]);
    if (!chosen) continue;
    const [front, back] = POLES[q.axis];
    for (const [pole, w] of Object.entries(chosen.weights)) {
      score[pole] = (score[pole] ?? 0) + (w as number);
    }
    // 주축(+2) 다수결 집계 — 이 문항의 주축에만
    if ((chosen.weights[front] ?? 0) === 2) primary[q.axis].front++;
    else if ((chosen.weights[back] ?? 0) === 2) primary[q.axis].back++;
  }

  const axes = {} as Record<AxisKey, AxisResult>;
  for (const axis of AXES) {
    const [front, back] = POLES[axis];
    const f = score[front] ?? 0;
    const b = score[back] ?? 0;
    let pole: Pole;
    if (f > b) pole = front;
    else if (f < b) pole = back;
    // 동점(f==b) → 그 축 3문항의 주축(+2) 다수결. 3문항 모두 응답 시 front+back=3(홀수)라 항상 결판.
    // (D/E 가 전 문항 응답을 강제 — 부분 응답이면 짝수가 되어 >= 로 front 편향될 수 있음)
    else pole = primary[axis].front >= primary[axis].back ? front : back;
    const total = f + b;
    axes[axis] = { raw: f - b, pct: total === 0 ? 50 : (f / total) * 100, pole };
  }
  const code = axes.yinYang.pole + axes.strength.pole + axes.wealth.pole + axes.nurture.pole;
  return { axes, code };
}
