"use client";
import type { StarGraph } from "@/lib/byeoljari/types";
import type { Point } from "@/lib/byeoljari/layout";
import {
  starPoints,
  orderByAngle,
  resolveGlyph,
  nodeMatchesFilter,
  edgeMatchesFilter,
} from "@/lib/byeoljari/layout";
import { starColor } from "@/lib/byeoljari/display";
import type { SizeSpec } from "@/lib/byeoljari/scale";
import type { ShapeInfo } from "@/lib/byeoljari/shape";

const DIM = 0.18; // 필터 비해당 요소 흐리기(§6)

interface Props {
  graph: StarGraph;
  layout: Map<string, Point>;
  meId: string | null;
  transform: { tx: number; ty: number; s: number };
  sizes: SizeSpec;
  activeFilter: string | null;
  onSelect: (nodeId: string) => void;
  shape?: ShapeInfo | null; // 은은 배경 형상(없으면 배경 생략)
}

export default function ConstellationCanvas({
  graph,
  layout,
  meId,
  transform,
  sizes,
  activeFilter,
  onSelect,
  shape,
}: Props) {
  // 은은 배경: 중앙 60×60. water-3(거북이)만 다른 신수보다 커서 ~0.9배(54)로 축소.
  const bgSmall = shape ? shape.element === "수" && shape.stage === 3 : false;
  const bgSize = bgSmall ? 54 : 60;
  const bgOff = (100 - bgSize) / 2;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const pos = (id: string) => layout.get(id);

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" role="img" aria-label="별자리 관계망">
      <rect x="0" y="0" width="100" height="100" fill="#1F1735" />
      {/* 은은 배경 형상 — 밤하늘 위·노드/선 아래, 줌 transform 밖(고정 ambient). */}
      {shape && (
        <image
          href={shape.assetSrc}
          x={bgOff}
          y={bgOff}
          width={bgSize}
          height={bgSize}
          opacity={0.1}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <g
        style={{ transition: "transform 420ms cubic-bezier(0.22,0.68,0.28,1)" }}
        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
      >
        {/* 삼합 = 별자리의 심장. 필터와 무관하게 항상 표시(사주 구조라 관계분류와 직교). */}
        {graph.triads.map((t, ti) => {
          const pts = t.memberIds.map(pos).filter(Boolean) as Point[];
          if (pts.length < 3) return null;
          const poly = orderByAngle(pts).map((i) => `${pts[i].x},${pts[i].y}`).join(" ");
          return (
            <polygon
              key={`tri-${ti}`}
              points={poly}
              fill="#E8C26A"
              fillOpacity={0.12}
              stroke="#E8C26A"
              strokeOpacity={0.5}
              strokeWidth={0.5}
            />
          );
        })}

        {/* 관계선 — 게스트 오행색, 천간합/육합은 골드. 필터 비해당은 dim. */}
        {graph.edges.map((e, ei) => {
          const pa = pos(e.a);
          const pb = pos(e.b);
          if (!pa || !pb) return null;
          const na = nodeById.get(e.a);
          const nb = nodeById.get(e.b);
          const colorNode = na?.isHost ? nb : na;
          const gold = e.heavenlyCombo || e.sixCombo;
          const dim = activeFilter && !edgeMatchesFilter(na, nb, activeFilter) ? DIM : 1;
          return (
            <line
              key={`e-${ei}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={gold ? "#F2D78A" : starColor(colorNode?.element ?? "")}
              strokeOpacity={(gold ? 0.85 : 0.4) * dim}
              strokeWidth={gold ? sizes.goldLineWidth : sizes.lineWidth}
              strokeDasharray={e.sixCombo ? "1.5 1" : undefined}
              strokeLinecap="round"
            />
          );
        })}

        {/* 노드 = 순수 별 또는 순수 원(halo 합체 금지). 필터 비해당은 dim. */}
        {graph.nodes.map((n) => {
          const p = pos(n.id);
          if (!p) return null;
          const glyph = resolveGlyph(n, meId);
          const isHost = glyph === "host-star";
          const color = starColor(n.element);
          const nodeOpacity = activeFilter && !nodeMatchesFilter(n, activeFilter) ? DIM : 1;
          return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }} opacity={nodeOpacity}>
              {/* 넉넉한 투명 히트영역 */}
              <circle cx={p.x} cy={p.y} r={sizes.hitR} fill="transparent" />
              {glyph === "me-circle" ? (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={sizes.meR}
                  fill={color}
                  stroke="#FFFFFF"
                  strokeOpacity={0.7}
                  strokeWidth={0.5}
                />
              ) : (
                <polygon
                  points={starPoints(
                    p.x,
                    p.y,
                    isHost ? sizes.hostOuter : sizes.starOuter,
                    isHost ? sizes.hostInner : sizes.starInner
                  )}
                  fill={color}
                  stroke="#F2D78A"
                  strokeOpacity={isHost ? 0.8 : 0}
                  strokeWidth={isHost ? 0.6 : 0}
                  strokeLinejoin="round"
                />
              )}
              {sizes.showLabels && n.name && (
                <text
                  x={p.x}
                  y={p.y + (isHost ? sizes.hostOuter + 3 : sizes.starOuter + 2.5)}
                  textAnchor="middle"
                  fontSize={isHost ? sizes.hostLabelFont : sizes.labelFont}
                  fill="#EDE6D6"
                  fillOpacity={0.9}
                >
                  {n.name}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
