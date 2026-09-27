// lib/admin/layer2-types.ts — 2층 드릴다운의 공통 반환 스키마. 순수(타입만).
//
// 🔴 왜 공통 스키마인가 — 2층은 섹션이 8개고 각각 모양이 다르다. 섹션마다 전용 컴포넌트를
//    만들면 8개의 렌더러와 8개의 타입이 생기고, 그 중 하나가 깨져도 다른 7개 화면에서 안 보인다.
//    블록 3종(bars·table·link)으로 좁히면 렌더러가 하나다.
import type { MetricUnit } from "@/lib/admin-metrics";

/** 발산 가로 막대 — +/− 를 위치로도 전달한다(색만으로 부호를 전하지 않는다, 스펙 §8). */
export interface BarsBlock {
  kind: "bars";
  title: string;
  unit: MetricUnit;
  items: { label: string; value: number }[];
  note?: string;
}

export interface TableBlock {
  kind: "table";
  title: string;
  columns: string[];
  /**
   * null 은 화면에서 "—". 빈 문자열과 구분된다.
   *
   * 🔴 **number 를 일부러 뺐다.** 렌더러는 셀을 그대로 찍으므로 raw number 를 넣으면 천단위
   *    구분자가 없는 `173420` 이 되고, 같은 화면의 다른 표는 `formatMetric` 을 거쳐 `173,420`
   *    이 된다 — `lib/admin/format.ts` 헤더가 "치명적"이라고 못박은 그 클래스다(화면마다 표기가
   *    갈리면 두 숫자를 나란히 못 읽는다). 타입을 string 으로 좁히면 **라우트가 반드시 포맷터를
   *    거치도록 tsc 가 강제한다.** 숫자를 넣고 싶으면 `formatMetric(v, unit)` 을 통과시켜라.
   */
  rows: (string | null)[][];
  note?: string;
}

/** 기존 화면으로 내려가는 링크. 2층은 그 화면들을 **삭제하지 않고 목적지로 삼는다**(스펙 §3). */
export interface LinkBlock {
  kind: "link";
  title: string;
  href: string;
  label: string;
}

export type Layer2Block = BarsBlock | TableBlock | LinkBlock;

/** 드릴다운 섹션 키 — 1층의 어느 값을 펼쳤나. */
export const LAYER2_SECTIONS = [
  "contribution",
  "revenue",
  "subscription",
  "signups",
  "readings",
  "uv",
  "d7",
  "withdrawal",
] as const;

export type Layer2Section = (typeof LAYER2_SECTIONS)[number];

export function isLayer2Section(v: string): v is Layer2Section {
  return (LAYER2_SECTIONS as readonly string[]).includes(v);
}

export interface Layer2Response {
  section: Layer2Section;
  blocks: Layer2Block[];
  /** 조회가 일부라도 실패했나 — 빈 결과를 "데이터 없음"으로 위장하지 않는다. */
  failed?: string[];
}
