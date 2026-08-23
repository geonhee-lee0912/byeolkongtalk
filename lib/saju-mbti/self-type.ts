import type { AxisKey, Pole } from "./constants.ts";
import { POLES } from "./constants.ts";
import type { AxisResult } from "./mapping.ts";
import { QUESTIONS } from "./questions.ts";

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
    else pole = primary[axis].front >= primary[axis].back ? front : back; // 동점 → 주축 다수결(홀수라 항상 결판)
    const total = f + b;
    axes[axis] = { raw: f - b, pct: total === 0 ? 50 : (f / total) * 100, pole };
  }
  const code = axes.yinYang.pole + axes.strength.pole + axes.wealth.pole + axes.nurture.pole;
  return { axes, code };
}
