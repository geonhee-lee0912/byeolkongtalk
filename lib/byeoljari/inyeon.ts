// 인연도 점수·등급·근거 — 순수. pairRelation 값 + 삼합 공유로 나↔상대 인연도(0~100).
// 유불리 아님: 상생·상극 동급(강렬한 인연), 비화·미지 오행만 소폭 낮음(잔잔). 특별관계는 가점.
import { elementRelationLabel } from "@/lib/byeoljari/display";

export interface InyeonInput {
  element: string; // 오행관계(나 기준): 비화|생아|아생|극아|아극
  heavenlyCombo: boolean;
  sixCombo: boolean;
  triadShared: boolean; // 나와 상대가 같은 삼합 국 멤버
}

/** 0~100 인연도. 생아·아생·극아·아극 62 · 그 외(비화·미지) 50 + 천간합25 + 육합15 + 삼합15, cap 100. */
export function inyeonScore(x: InyeonInput): number {
  let score = ["생아", "아생", "극아", "아극"].includes(x.element) ? 62 : 50;
  if (x.heavenlyCombo) score += 25;
  if (x.sixCombo) score += 15;
  if (x.triadShared) score += 15;
  return Math.min(score, 100);
}

export interface InyeonGrade {
  label: string;
  tone: "high" | "mid" | "low" | "faint";
}

/** 점수 → 등급(무낙인 톤). */
export function inyeonGrade(score: number): InyeonGrade {
  if (score >= 85) return { label: "하늘이 맺은 인연", tone: "high" };
  if (score >= 70) return { label: "깊은 인연", tone: "mid" };
  if (score >= 55) return { label: "이어진 인연", tone: "low" };
  return { label: "잔잔한 인연", tone: "faint" };
}

/** 점수에 기여한 요소를 별콩이 톤 근거 문구로. 오행 한 줄은 항상 마지막. */
export function inyeonReasons(x: InyeonInput): string[] {
  const r: string[] = [];
  if (x.heavenlyCombo) r.push("✨ 케미 스파크 — 유난히 끌리는 기운");
  if (x.sixCombo) r.push("🔗 결속 — 단단히 묶인 사이");
  if (x.triadShared) r.push("🌟 같은 국 — 함께면 시너지가 나");
  r.push(elementRelationLabel(x.element));
  return r;
}

/** 등급 톤별 별콩이 한마디(종합). */
export function inyeonComment(tone: InyeonGrade["tone"]): string {
  switch (tone) {
    case "high":
      return "이 별자리에서 유독 진하게 엮인 인연이야";
    case "mid":
      return "든든하게 이어진 사이야";
    case "low":
      return "잔잔히 이어진 인연이야";
    default:
      return "잔잔하지만 분명히 이어진 사이야";
  }
}
