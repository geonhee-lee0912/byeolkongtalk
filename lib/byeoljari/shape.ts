// 별자리 형상(오행 신수) 순수 로직. 지배 오행 → 진화 단계 → 에셋/이름/힌트/리빌 판정.
// 전부 순수·방어적(범위 밖 값 폴백). 에셋: public/byeoljari/creatures/{code}-{stage}.png.
import type { FiveElement } from "@/lib/saju/elements";
import type { GraphNode } from "./types";

// 오행 → 에셋 파일 코드
export const ELEMENT_CODE: Record<FiveElement, string> = {
  목: "wood",
  화: "fire",
  토: "earth",
  금: "metal",
  수: "water",
};

// 15 신수 이름 [1단계, 2단계, 3단계]
export const SHAPE_NAME: Record<FiveElement, [string, string, string]> = {
  목: ["청개구리", "이무기", "청룡"],
  화: ["반딧불이", "불새", "봉황"],
  토: ["옥토끼", "사슴", "기린"],
  금: ["흰담비", "눈표범", "백호"],
  수: ["물고기", "가오리", "거북이"],
};

const ELEMENT_ORDER: FiveElement[] = ["목", "화", "토", "금", "수"];

/** 최빈 오행. 동률이면 호스트 오행 우선, 그다음 고정순서(목화토금수). 빈 입력 null. */
export function dominantElement(nodes: GraphNode[]): FiveElement | null {
  if (nodes.length === 0) return null;
  const count = new Map<string, number>();
  for (const n of nodes) count.set(n.element, (count.get(n.element) ?? 0) + 1);
  const host = nodes.find((n) => n.isHost);
  let best: FiveElement = ELEMENT_ORDER[0];
  let bestC = -1;
  for (const e of ELEMENT_ORDER) {
    const c = count.get(e) ?? 0;
    if (c > bestC) {
      best = e;
      bestC = c;
    }
  }
  // 동률 중 호스트 오행이 있으면 그것 우선
  if (host && (count.get(host.element) ?? 0) === bestC) return host.element;
  return best;
}

/** 인원 → 진화 단계. 1~4:1 · 5~14:2 · 15+:3. */
export function evolutionStage(count: number): 1 | 2 | 3 {
  if (count < 5) return 1;
  if (count < 15) return 2;
  return 3;
}

export interface ShapeInfo {
  element: FiveElement;
  stage: 1 | 2 | 3;
  assetSrc: string; // /byeoljari/creatures/wood-3.png
  name: string; // 현재 형상 이름
  nextName: string | null; // 다음 단계 형상 이름(있으면)
  membersToNext: number | null; // 다음 단계까지 남은 인원(있으면)
}

/** 노드 집합 → 형상 정보(엠블럼·배경·힌트·리빌이 소비). 빈 입력 null. */
export function resolveShape(nodes: GraphNode[]): ShapeInfo | null {
  const element = dominantElement(nodes);
  if (!element) return null;
  const stage = evolutionStage(nodes.length);
  const names = SHAPE_NAME[element];
  const THRESH = [5, 15]; // stage1→2, stage2→3
  let nextName: string | null = null;
  let membersToNext: number | null = null;
  if (stage !== 3) {
    // stage!==3 (not <3): TS는 관계연산자로 number-literal union을 narrow 못함 → names[stage] 타입에러
    nextName = names[stage]; // 0-index: stage(1)→names[1]=2단계 이름
    membersToNext = THRESH[stage - 1] - nodes.length;
  }
  return {
    element,
    stage,
    assetSrc: `/byeoljari/creatures/${ELEMENT_CODE[element]}-${stage}.png`,
    name: names[stage - 1],
    nextName,
    membersToNext,
  };
}

/**
 * 성장 리빌 오버레이를 띄울지. storedRaw=localStorage seenStage 원본(없으면 null).
 * 기준선 = 저장값(유효한 1 이상) 아니면 1 → 첫 형상(stage1)은 리빌 안 함.
 * 현재 stage가 기준선 초과면 리빌.
 */
export function shouldReveal(storedRaw: string | null, stage: 1 | 2 | 3): boolean {
  const n = Number(storedRaw);
  const baseline = Number.isFinite(n) && n >= 1 ? n : 1;
  return stage > baseline;
}
