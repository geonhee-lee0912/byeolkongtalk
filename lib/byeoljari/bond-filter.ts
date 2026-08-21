// 지도 관계타입 필터(순수). 끌림=천간합 · 결속=육합 · 무리=삼합.
export type BondFilter = "heavenly" | "six" | "triad";

export const BOND_FILTER_LABEL: Record<BondFilter, string> = {
  heavenly: "끌림",
  six: "결속",
  triad: "무리",
};

const ORDER: BondFilter[] = ["heavenly", "six", "triad"];

type EdgeBond = { a: string; b: string; heavenlyCombo: boolean; sixCombo: boolean };

/** 맵에 실제로 존재하는 관계타입만(칩 구성용). 순서 고정. */
export function presentBondFilters(
  edges: Pick<EdgeBond, "heavenlyCombo" | "sixCombo">[],
  triads: { memberIds: string[] }[]
): BondFilter[] {
  return ORDER.filter((f) => {
    if (f === "heavenly") return edges.some((e) => e.heavenlyCombo);
    if (f === "six") return edges.some((e) => e.sixCombo);
    return triads.length > 0;
  });
}

/** 엣지가 현재 필터에서 강조 대상인가. triad면 엣지는 전부 비강조(삼합은 노드로 표시). */
export function edgeActiveForBond(
  edge: Pick<EdgeBond, "heavenlyCombo" | "sixCombo">,
  filter: BondFilter | null
): boolean {
  if (!filter) return true;
  if (filter === "heavenly") return edge.heavenlyCombo;
  if (filter === "six") return edge.sixCombo;
  return false;
}

/** 노드가 현재 필터에서 강조 대상인가. heavenly/six=강조 엣지 끝점, triad=삼합 멤버. */
export function nodeActiveForBond(
  nodeId: string,
  filter: BondFilter | null,
  edges: EdgeBond[],
  triadMemberIds: Set<string>
): boolean {
  if (!filter) return true;
  if (filter === "triad") return triadMemberIds.has(nodeId);
  return edges.some((e) => (e.a === nodeId || e.b === nodeId) && edgeActiveForBond(e, filter));
}
