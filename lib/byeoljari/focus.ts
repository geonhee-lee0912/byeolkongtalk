import type { StarGraph, GraphEdge } from "./types.ts";

/** centerId 중심의 포커스 부분그래프. 이웃 = centerId 와 엣지가 있는 노드 + 같은 삼합 멤버.
 *  엣지 = centerId 발(spoke). 실제 엣지가 있으면 재사용, 삼합-only 이웃은 중립 spoke 합성. */
export function buildFocusGraph(centerId: string, graph: StarGraph): StarGraph {
  const triadMates = new Set<string>();
  graph.triads.forEach((t) => {
    if (t.memberIds.includes(centerId)) t.memberIds.forEach((id) => triadMates.add(id));
  });
  triadMates.delete(centerId);

  const edgePartners = new Set<string>();
  graph.edges.forEach((e) => {
    if (e.a === centerId) edgePartners.add(e.b);
    else if (e.b === centerId) edgePartners.add(e.a);
  });

  const neighborIds = new Set<string>([...edgePartners, ...triadMates]);
  const nodeIds = new Set<string>([centerId, ...neighborIds]);
  const nodes = graph.nodes.filter((n) => nodeIds.has(n.id));

  const edgeByPair = (x: string, y: string): GraphEdge | undefined =>
    graph.edges.find((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x));

  const edges: GraphEdge[] = [];
  neighborIds.forEach((nid) => {
    const real = edgeByPair(centerId, nid);
    if (real) edges.push(real);
    else {
      edges.push({
        a: centerId, b: nid, element: "", labelAtoB: "", labelBtoA: "",
        tenGodAtoB: "", tenGodBtoA: "", inyeon: 0,
        triadShared: true, heavenlyCombo: false, sixCombo: false,
      });
    }
  });

  const triads = graph.triads
    .map((t) => ({ element: t.element, memberIds: t.memberIds.filter((id) => nodeIds.has(id)) }))
    .filter((t) => t.memberIds.length >= 2);

  return { ok: true, shareId: graph.shareId, claimed: graph.claimed, nodes, edges, triads };
}
