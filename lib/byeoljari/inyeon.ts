// 인연도 점수·등급·근거 — 순수. pairRelation 값 + 삼합 공유로 나↔상대 인연도(0~100).
// 유불리 아님: 상생·상극 동급(강렬한 인연), 비화·미지 오행만 소폭 낮음(잔잔). 특별관계는 가점.
import { elementRelationLabel } from "@/lib/byeoljari/display";

export interface InyeonInput {
  element: string; // 오행관계(나 기준): 비화|생아|아생|극아|아극
  heavenlyCombo: boolean;
  sixCombo: boolean;
  triadShared: boolean; // 나와 상대가 같은 삼합 국 멤버
  tenGodAtoB?: string; // 십신(a→b) — 텍스처 미세 가점용(동점 완화). 없으면 0
  tenGodBtoA?: string; // 십신(b→a)
}

// 십신 텍스처 — 같은 오행관계 안에서도 점수를 흩어 동점을 줄이는 미세 신호(0~9).
// 유불리 아니라 "관계 결의 농도": 정/안정 계열 낮게 · 편/자극 계열 높게. 대칭(양방향 합).
const TEN_GOD_TEXTURE: Record<string, number> = {
  정인: 0, 정관: 1, 정재: 2, 식신: 3, 비견: 4,
  편인: 5, 편재: 6, 상관: 7, 겁재: 8, 편관: 9,
};

/** 0~100 인연도. base(상생·상극 58 · 비화·미지 46) + 천간합25 + 육합15 + 삼합15
 *  + 십신 텍스처(양방향 TEX 합의 절반, 0~9 — 동점 완화), cap 100. */
export function inyeonScore(x: InyeonInput): number {
  let score = ["생아", "아생", "극아", "아극"].includes(x.element) ? 58 : 46;
  if (x.heavenlyCombo) score += 25;
  if (x.sixCombo) score += 15;
  if (x.triadShared) score += 15;
  const tex =
    (TEN_GOD_TEXTURE[x.tenGodAtoB ?? ""] ?? 0) + (TEN_GOD_TEXTURE[x.tenGodBtoA ?? ""] ?? 0);
  score += Math.round(tex / 2);
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
