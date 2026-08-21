"use client";
import type { StarGraph } from "@/lib/byeoljari/types";
import type { Point } from "@/lib/byeoljari/layout";
import { starPoints, resolveGlyph } from "@/lib/byeoljari/layout";
import { starColor } from "@/lib/byeoljari/display";
import { edgeActiveForBond, nodeActiveForBond, type BondFilter } from "@/lib/byeoljari/bond-filter";
import type { SizeSpec } from "@/lib/byeoljari/scale";
import type { ShapeInfo } from "@/lib/byeoljari/shape";

const DIM = 0.18; // 필터 비해당 요소 흐리기(§6)

// 배경 별가루 — 밤하늘 분위기(고정 좌표, 결정적: Math.random 미사용). 중앙은 노드 영역이라 가장자리 위주.
const STARDUST: { x: number; y: number; r: number; o: number }[] = [
  { x: 8, y: 12, r: 0.5, o: 0.6 }, { x: 22, y: 7, r: 0.35, o: 0.4 }, { x: 40, y: 5, r: 0.45, o: 0.5 },
  { x: 62, y: 8, r: 0.3, o: 0.4 }, { x: 82, y: 6, r: 0.5, o: 0.55 }, { x: 92, y: 20, r: 0.35, o: 0.45 },
  { x: 5, y: 34, r: 0.4, o: 0.5 }, { x: 95, y: 44, r: 0.45, o: 0.5 }, { x: 9, y: 58, r: 0.3, o: 0.4 },
  { x: 91, y: 66, r: 0.4, o: 0.5 }, { x: 6, y: 82, r: 0.5, o: 0.55 }, { x: 26, y: 93, r: 0.35, o: 0.45 },
  { x: 48, y: 96, r: 0.45, o: 0.5 }, { x: 70, y: 94, r: 0.3, o: 0.4 }, { x: 88, y: 89, r: 0.5, o: 0.55 },
  { x: 80, y: 30, r: 0.3, o: 0.4 }, { x: 34, y: 20, r: 0.28, o: 0.35 }, { x: 66, y: 24, r: 0.3, o: 0.4 },
];

interface Props {
  graph: StarGraph;
  layout: Map<string, Point>;
  meId: string | null;
  transform: { tx: number; ty: number; s: number };
  sizes: SizeSpec;
  activeFilter: BondFilter | null;
  onSelect: (nodeId: string) => void;
  shape?: ShapeInfo | null; // 은은 배경 형상(없으면 배경 생략)
  highlightPairIds?: string[] | null; // 지도 선택 시 강조할 쌍(나+상대). 그 외 노드/선은 dim.
  onBackgroundClick?: () => void;     // 빈 공간 탭 → 선택 해제
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
  highlightPairIds,
  onBackgroundClick,
}: Props) {
  // 은은 배경: 중앙 60×60. water-3(거북이)만 다른 신수보다 커서 ~0.9배(54)로 축소.
  const bgSmall = shape ? shape.element === "수" && shape.stage === 3 : false;
  const bgSize = bgSmall ? 72 : 80;
  const bgOff = (100 - bgSize) / 2;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const pos = (id: string) => layout.get(id);
  const triadMemberIds = new Set(graph.triads.flatMap((t) => t.memberIds));

  // 삼합 = 같은 국(局)의 별들. 삼각형 대신 멤버 별을 같은 오행색 링으로 묶어 표시.
  const triadRing = new Map<string, string>();
  graph.triads.forEach((t) =>
    t.memberIds.forEach((id) => triadRing.set(id, starColor(t.element)))
  );

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" role="img" aria-label="별자리 관계망">
      <defs>
        {/* 삼합 glow — 부드러운 번짐 */}
        <filter id="triadGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="#1F1735" onClick={() => onBackgroundClick?.()} />
      {/* 배경 별가루 — 밤하늘 분위기. 줌 transform 밖(고정 ambient). */}
      {STARDUST.map((s, i) => (
        <circle key={`dust-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} pointerEvents="none" />
      ))}
      {/* 은은 배경 형상 — 밤하늘 위·노드/선 아래, 줌 transform 밖(고정 ambient). */}
      {shape && (
        <image
          href={shape.assetSrc}
          x={bgOff}
          y={bgOff}
          width={bgSize}
          height={bgSize}
          opacity={0.13}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        />
      )}
      <g
        style={{ transition: "transform 420ms cubic-bezier(0.22,0.68,0.28,1)" }}
        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
      >
        {/* 관계선 — 게스트 오행색, 천간합/육합은 골드. 필터 비해당은 dim. */}
        {graph.edges.map((e, ei) => {
          const pa = pos(e.a);
          const pb = pos(e.b);
          if (!pa || !pb) return null;
          if (!e.heavenlyCombo && !e.sixCombo) return null; // 오행색 실선(바퀴살) 폐지 — 특별 인연만
          const na = nodeById.get(e.a);
          const nb = nodeById.get(e.b);
          const colorNode = na?.isHost ? nb : na;
          const gold = e.heavenlyCombo || e.sixCombo;
          const dimByFilter = activeFilter != null && !edgeActiveForBond(e, activeFilter);
          const dimByPair =
            highlightPairIds != null &&
            !(highlightPairIds.includes(e.a) && highlightPairIds.includes(e.b));
          const dim = dimByFilter || dimByPair ? DIM : 1;
          return (
            <line
              key={`e-${ei}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={gold ? "#F2D78A" : starColor(colorNode?.element ?? "")}
              strokeOpacity={(gold ? 0.55 : 0.22) * dim}
              strokeWidth={gold ? sizes.goldLineWidth : sizes.lineWidth}
              strokeDasharray={e.sixCombo ? "1.5 1" : undefined}
              strokeLinecap="round"
              style={{ transition: "stroke-opacity 300ms" }}
            />
          );
        })}

        {/* 노드 = 별 또는 원. 삼합 멤버는 오행색 링으로 그룹 표시(삼각형 대체). 필터 비해당은 dim. */}
        {graph.nodes.map((n) => {
          const p = pos(n.id);
          if (!p) return null;
          const glyph = resolveGlyph(n, meId);
          const isHost = glyph === "host-star";
          const color = starColor(n.element);
          const dimByFilter =
            activeFilter != null && !nodeActiveForBond(n.id, activeFilter, graph.edges, triadMemberIds);
          const dimByPair = highlightPairIds != null && !highlightPairIds.includes(n.id);
          const nodeOpacity = dimByFilter || dimByPair ? DIM : 1;
          const ringColor = triadRing.get(n.id);
          const baseR = isHost ? sizes.hostOuter : sizes.starOuter;
          return (
            <g
              key={n.id}
              onClick={() => onSelect(n.id)}
              style={{ cursor: "pointer", transition: "opacity 300ms" }}
              opacity={nodeOpacity}
            >
              {/* 넉넉한 투명 히트영역 */}
              <circle cx={p.x} cy={p.y} r={sizes.hitR} fill="transparent" />
              {/* 삼합 표시 — 같은 국(局): 별 뒤 부드러운 광(glow) + 별 위 작은 점 마커 */}
              {ringColor && (
                <>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={baseR + 1}
                    fill={ringColor}
                    opacity={0.4}
                    filter="url(#triadGlow)"
                  />
                  <circle cx={p.x} cy={p.y - baseR - 1.3} r={0.7} fill={ringColor} />
                </>
              )}
              {glyph === "me-circle" ? (
                // 나 = 원(테두리) — 친구들의 별과 구분
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
                // 호스트·친구 = 통통한 별(inner 비율 0.55). 뾰족함 완화 위해 linejoin round.
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
                  y={p.y + (glyph === "me-circle" ? sizes.meR : baseR) + 4}
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
