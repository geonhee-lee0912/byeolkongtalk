"use client";
import type { StarGraph } from "@/lib/byeoljari/types";
import type { Point } from "@/lib/byeoljari/layout";
import { starPoints, orderByAngle, resolveGlyph } from "@/lib/byeoljari/layout";
import { starColor } from "@/lib/byeoljari/display";

interface Props {
  graph: StarGraph;
  layout: Map<string, Point>;
  meId: string | null;
  transform: { tx: number; ty: number; s: number };
  onSelect: (nodeId: string) => void;
}

export default function ConstellationCanvas({ graph, layout, meId, transform, onSelect }: Props) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const pos = (id: string) => layout.get(id);

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" role="img" aria-label="별자리 관계망">
      <rect x="0" y="0" width="100" height="100" fill="#1F1735" />
      <g
        style={{ transition: "transform 420ms cubic-bezier(0.22,0.68,0.28,1)" }}
        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
      >
        {/* 삼합 = 별자리의 심장. memberIds 3+ 대응(각도정렬 폴리곤). */}
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

        {/* 관계선 — 게스트 오행색(비호스트 끝점), 천간합/육합은 골드 처리(케미/결속). */}
        {graph.edges.map((e, ei) => {
          const pa = pos(e.a);
          const pb = pos(e.b);
          if (!pa || !pb) return null;
          const na = nodeById.get(e.a);
          const nb = nodeById.get(e.b);
          const colorNode = na?.isHost ? nb : na;
          const gold = e.heavenlyCombo || e.sixCombo;
          return (
            <line
              key={`e-${ei}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={gold ? "#F2D78A" : starColor(colorNode?.element ?? "")}
              strokeOpacity={gold ? 0.85 : 0.4}
              strokeWidth={gold ? 0.8 : 0.4}
              strokeDasharray={e.sixCombo ? "1.5 1" : undefined}
              strokeLinecap="round"
            />
          );
        })}

        {/* 노드 = 순수 별 또는 순수 원(halo 합체 금지, 스펙 §3). */}
        {graph.nodes.map((n) => {
          const p = pos(n.id);
          if (!p) return null;
          const glyph = resolveGlyph(n, meId);
          const isHost = glyph === "host-star";
          const color = starColor(n.element);
          return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
              {/* 넉넉한 투명 히트영역 */}
              <circle cx={p.x} cy={p.y} r={6} fill="transparent" />
              {glyph === "me-circle" ? (
                <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={0.5} />
              ) : (
                <polygon
                  points={starPoints(p.x, p.y, isHost ? 6 : 4, isHost ? 2.6 : 1.7)}
                  fill={color}
                  stroke="#F2D78A"
                  strokeOpacity={isHost ? 0.8 : 0}
                  strokeWidth={isHost ? 0.6 : 0}
                  strokeLinejoin="round"
                />
              )}
              {n.name && (
                <text
                  x={p.x}
                  y={p.y + (isHost ? 9 : 6.5)}
                  textAnchor="middle"
                  fontSize={isHost ? 3.4 : 2.8}
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
