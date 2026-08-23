// 별자리 순수 렌더 모델 — 레이아웃(노드 배치) + 기하(별 꼭지·줌 변환·각도정렬) + 글리프 판정 + 엣지 방향.
// 전부 순수 함수(부수효과 없음) → 단위 테스트 대상. 컴포넌트는 이 출력을 SVG 로만 옮긴다.
import type { GraphNode, GraphEdge } from "./types.ts";

export interface Point {
  x: number;
  y: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** 호스트 = 중심(50,50), 게스트 = 반지름 34 원 위 등간격(-90°부터). viewBox 0..100 정사각 기준. */
export function computeLayout(
  nodes: GraphNode[],
  opts?: { center?: number; radius?: number; centerId?: string }
): Map<string, Point> {
  const center = opts?.center ?? 50;
  const radius = opts?.radius ?? 34;
  const map = new Map<string, Point>();
  if (nodes.length === 0) return map;

  let centerIdx = opts?.centerId
    ? nodes.findIndex((n) => n.id === opts.centerId)
    : nodes.findIndex((n) => n.isHost);
  if (centerIdx < 0) centerIdx = 0; // 방어: 지정 노드나 호스트 플래그 없으면 첫 노드
  map.set(nodes[centerIdx].id, { x: round(center), y: round(center) });

  const others = nodes.filter((_, i) => i !== centerIdx);
  others.forEach((n, i) => {
    const a = ((-90 + (i * 360) / others.length) * Math.PI) / 180;
    map.set(n.id, {
      x: round(center + radius * Math.cos(a)),
      y: round(center + radius * Math.sin(a)),
    });
  });
  return map;
}

/** 별 폴리곤 점열. 통통한 별은 컴포넌트에서 stroke-linejoin:round 로. */
export function starPoints(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  count = 5,
  rotationDeg = -90
): string {
  const start = (rotationDeg * Math.PI) / 180;
  const step = Math.PI / count; // 외/내 꼭지 반스텝
  const pts: string[] = [];
  for (let i = 0; i < count * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = start + i * step;
    pts.push(`${round(cx + r * Math.cos(a))},${round(cy + r * Math.sin(a))}`);
  }
  return pts.join(" ");
}

/** 노드를 화면 중심으로 끌어와 scale 배 확대하는 <g> 변환값. */
export function focusTransform(
  target: Point,
  scale: number,
  center = 50
): { tx: number; ty: number; s: number } {
  return {
    tx: round(center - scale * target.x),
    ty: round(center - scale * target.y),
    s: scale,
  };
}

/** 두 점(나·상대)의 중점을 화면 중심에 두고, 거리에 맞춰 배율을 정해 둘 다 뷰에 담는 줌 변환.
 *  focusTransform 이 한 점만 중심에 두는 것과 달리 쌍(pair)을 프레이밍한다. */
export function focusPair(
  a: Point,
  b: Point,
  opts?: { margin?: number; maxScale?: number; center?: number }
): { tx: number; ty: number; s: number } {
  const margin = opts?.margin ?? 22; // 쌍 양옆 여백(viewBox 단위) — 라벨/노드 반경 확보
  const maxScale = opts?.maxScale ?? 2;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const s = round(Math.max(1, Math.min(maxScale, 100 / (dist + margin))));
  return focusTransform(mid, s, opts?.center);
}

/** 무게중심 기준 각도 오름차순 인덱스 — 삼합 폴리곤을 자기교차 없이(멤버 3+ 대응). */
export function orderByAngle(points: Point[]): number[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points
    .map((p, i) => ({ i, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((o) => o.i);
}

/** 노드 표현: 주인(host)=원(맵 주인, meId·로그인·기기 무관) / 남의 맵에 참여한 나=강조 별 / 그 외=별. */
export function resolveGlyph(
  node: GraphNode,
  meId: string | null
): "host-circle" | "me-star" | "star" {
  if (node.isHost) return "host-circle"; // 주인 = 원 (항상)
  if (meId && node.id === meId) return "me-star"; // 남의 맵에서 나 = 흰 테두리 강조 별(best-effort)
  return "star";
}

/** 라벨을 지도 중앙 기준 별의 바깥 방향(방사형)에 배치 — 선은 대개 중앙으로 향하므로 겹침 최소.
 *  중앙 노드(호스트)는 방향이 없어 아래로. anchor는 좌우로 정렬(dominant-baseline=central 전제). */
export function radialLabelPos(
  p: Point,
  baseR: number,
  center = 50
): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const dx = p.x - center;
  const dy = p.y - center;
  const len = Math.hypot(dx, dy);
  const gap = baseR + 2.2;
  if (len < 0.5) return { x: round(p.x), y: round(p.y + gap), anchor: "middle" }; // 중앙(호스트) → 아래
  const ux = dx / len;
  const uy = dy / len;
  return {
    x: round(p.x + ux * gap),
    y: round(p.y + uy * gap),
    anchor: ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle",
  };
}

const INVERT: Record<string, string> = {
  생아: "아생",
  아생: "생아",
  극아: "아극",
  아극: "극아",
  비화: "비화",
};

/** a 기준 오행관계를 반대편(b) 기준으로 뒤집는다. */
export function invertElementRelation(rel: string): string {
  return INVERT[rel] ?? rel;
}

/** pivot 입장에서 본 방향 라벨. iSeeThem=내가 보는 상대, theySeeMe=상대가 보는 나(골드 강조 대상).
 *  십신 코드도 같은 방향으로 정렬(카피 조립은 호출부가 관계분류와 함께). */
export function orientEdge(
  edge: GraphEdge,
  pivotId: string
): {
  iSeeThem: string;
  theySeeMe: string;
  element: string;
  iSeeThemTenGod: string;
  theySeeMeTenGod: string;
} | null {
  if (edge.a === pivotId) {
    return {
      iSeeThem: edge.labelAtoB,
      theySeeMe: edge.labelBtoA,
      element: edge.element,
      iSeeThemTenGod: edge.tenGodAtoB,
      theySeeMeTenGod: edge.tenGodBtoA,
    };
  }
  if (edge.b === pivotId) {
    return {
      iSeeThem: edge.labelBtoA,
      theySeeMe: edge.labelAtoB,
      element: invertElementRelation(edge.element),
      iSeeThemTenGod: edge.tenGodBtoA,
      theySeeMeTenGod: edge.tenGodAtoB,
    };
  }
  return null;
}

/** 관계 필터(§6) — 노드가 강조 대상인가. 필터 없으면 전체, 호스트는 항상 강조(중심). */
export function nodeMatchesFilter(node: GraphNode, filter: string | null): boolean {
  if (!filter) return true;
  if (node.isHost) return true;
  return node.relationType === filter;
}

/** 엣지 강조 여부 — 비호스트 끝점의 관계분류가 필터와 일치할 때(호스트는 모든 관계에 매칭돼 제외). */
export function edgeMatchesFilter(
  nodeA: GraphNode | undefined,
  nodeB: GraphNode | undefined,
  filter: string | null
): boolean {
  if (!filter) return true;
  return [nodeA, nodeB].some((n) => n != null && !n.isHost && n.relationType === filter);
}
