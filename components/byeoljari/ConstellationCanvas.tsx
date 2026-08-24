"use client";
import type { StarGraph } from "@/lib/byeoljari/types";
import type { Point } from "@/lib/byeoljari/layout";
import { starPoints, resolveGlyph, orderByAngle, radialLabelPos } from "@/lib/byeoljari/layout";
import { starColor, BOND_COLOR } from "@/lib/byeoljari/display";
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
  activeTriadGroup?: number | null; // "같은 결" 하위 칩 선택 — 그 삼합 그룹만 격리 표시
  onSelect: (nodeId: string) => void;
  shape?: ShapeInfo | null; // 은은 배경 형상(없으면 배경 생략)
  highlightPairIds?: string[] | null; // 지도 선택 시 강조할 쌍(나+상대). 그 외 노드/선은 dim.
  onBackgroundClick?: () => void;     // 빈 공간 탭 → 선택 해제
  focusMode?: boolean;                // 포커스 뷰 — 중립선 표시 + 필터 dim off + 선 탭 가능
  onEdgeSelect?: (a: string, b: string) => void; // 포커스 뷰에서 선 탭 시
}

export default function ConstellationCanvas({
  graph,
  layout,
  meId,
  transform,
  sizes,
  activeFilter,
  activeTriadGroup = null,
  onSelect,
  shape,
  highlightPairIds,
  onBackgroundClick,
  focusMode = false,
  onEdgeSelect,
}: Props) {
  // 은은 배경: 중앙 60×60. water-3(거북이)만 다른 신수보다 커서 ~0.9배(54)로 축소.
  const bgSmall = shape ? shape.element === "수" && shape.stage === 3 : false;
  const bgSize = bgSmall ? 74 : 82;
  const bgOff = (100 - bgSize) / 2;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const pos = (id: string) => layout.get(id);
  const triadMemberIds = new Set(
    activeTriadGroup != null && graph.triads[activeTriadGroup]
      ? graph.triads[activeTriadGroup].memberIds
      : graph.triads.flatMap((t) => t.memberIds)
  );

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" role="img" aria-label="별자리 관계망">
      <defs>
        {/* 끌림(천간합) 골드 글로우 — 반짝 강조 */}
        <filter id="goldGlow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        {/* 배경 신수 글로우 — 크기 줄인 신수의 가시성 보완(은은한 번짐) */}
        <filter id="shapeGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="#1F1735" onClick={() => onBackgroundClick?.()} />
      {/* 배경 별가루 — 밤하늘 분위기. 줌 transform 밖(고정 ambient). */}
      {STARDUST.map((s, i) => (
        <circle key={`dust-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} pointerEvents="none" />
      ))}
      {/* 은은 배경 형상 — 밤하늘 위·노드/선 아래, 줌 transform 밖(고정 ambient). */}
      {shape && (
        <>
          {/* 글로우 레이어(번짐) — 신수 뒤에서 은은히 빛나 가시성↑ */}
          <image
            href={shape.assetSrc}
            x={bgOff}
            y={bgOff}
            width={bgSize}
            height={bgSize}
            opacity={0.12}
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
            filter="url(#shapeGlow)"
            style={{ mixBlendMode: "screen" }}
          />
          {/* 본체 */}
          <image
            href={shape.assetSrc}
            x={bgOff}
            y={bgOff}
            width={bgSize}
            height={bgSize}
            opacity={0.08}
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
            style={{ mixBlendMode: "screen" }}
          />
        </>
      )}
      <g
        style={{ transition: "transform 420ms cubic-bezier(0.22,0.68,0.28,1)" }}
        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
      >
        {/* 관계선 — 게스트 오행색, 천간합/육합은 골드. 필터 비해당은 dim. */}
        {graph.edges.map((e) => {
          const pa = pos(e.a);
          const pb = pos(e.b);
          if (!pa || !pb) return null;
          if (!focusMode && !e.heavenlyCombo && !e.sixCombo) return null; // 오행색 실선(바퀴살) 폐지 — 특별 인연만(포커스 뷰는 예외)
          const na = nodeById.get(e.a);
          const nb = nodeById.get(e.b);
          const colorNode = na?.isHost ? nb : na;
          const special = e.heavenlyCombo || e.sixCombo;
          const dimByFilter = !focusMode && activeFilter != null && !edgeActiveForBond(e, activeFilter);
          const dimByPair =
            highlightPairIds != null &&
            !(highlightPairIds.includes(e.a) && highlightPairIds.includes(e.b));
          const dim = dimByFilter || dimByPair ? DIM : 1;
          return (
            <g key={`${e.a}-${e.b}`}>
              {focusMode && (
                <line
                  x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke="transparent" strokeWidth={3} strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                  onClick={() => onEdgeSelect?.(e.a, e.b)}
                />
              )}
              {e.heavenlyCombo && !focusMode && (
                <line
                  x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke={BOND_COLOR.heavenly}
                  strokeOpacity={0.4 * dim}
                  strokeWidth={sizes.lineWidth * 2.4}
                  strokeLinecap="round"
                  filter="url(#goldGlow)"
                />
              )}
              <line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={e.heavenlyCombo ? BOND_COLOR.heavenly : e.sixCombo ? BOND_COLOR.six : focusMode ? "#B8A8D8" : starColor(colorNode?.element ?? "")}
                strokeOpacity={(special ? 0.85 : focusMode ? 0.4 : 0.22) * dim}
                strokeWidth={sizes.lineWidth}
                strokeDasharray={e.sixCombo && !e.heavenlyCombo ? "2 1.5" : undefined}
                strokeLinecap="round"
                style={{ transition: "stroke-opacity 300ms" }}
              />
            </g>
          );
        })}

        {/* 같은 결(삼합) — 멤버를 같은 오행색 선(폴리곤)으로 연결. 별 위 점 마커 대체. overview 전용
            (포커스는 buildFocusGraph 합성 스포크가 담당). 별 뒤에 그려 노드가 위로 오게. */}
        {!focusMode &&
          graph.triads.map((t, ti) => {
            if (activeFilter != null && activeFilter !== "triad") return null; // 끌림/결속 필터 시 같은 결 숨김
            if (activeTriadGroup != null && ti !== activeTriadGroup) return null; // 하위 칩 선택 시 그 그룹만
            const pts = t.memberIds
              .map((id) => pos(id))
              .filter((p): p is Point => p != null);
            if (pts.length < 2) return null;
            const order = orderByAngle(pts);
            const points = order.map((i) => `${pts[i].x},${pts[i].y}`).join(" ");
            return (
              <polygon
                key={`triad-${ti}`}
                points={points}
                fill="none"
                stroke={BOND_COLOR.triad}
                strokeOpacity={0.82}
                strokeWidth={sizes.lineWidth}
                strokeLinejoin="round"
              />
            );
          })}

        {/* 노드 = 주인 원(host-circle) / 나 강조 별(me-star) / 별. */}
        {graph.nodes.map((n) => {
          const p = pos(n.id);
          if (!p) return null;
          const glyph = resolveGlyph(n, meId);
          const isHostCircle = glyph === "host-circle";
          const isMeStar = glyph === "me-star";
          const color = starColor(n.element);
          const dimByFilter =
            !focusMode && activeFilter != null && !nodeActiveForBond(n.id, activeFilter, graph.edges, triadMemberIds);
          const dimByPair = highlightPairIds != null && !highlightPairIds.includes(n.id);
          const nodeOpacity = dimByFilter || dimByPair ? DIM : 1;
          const baseR = isHostCircle ? sizes.hostOuter : sizes.starOuter;
          const labelPos = radialLabelPos(p, baseR);
          return (
            <g
              key={n.id}
              onClick={() => onSelect(n.id)}
              style={{ cursor: "pointer", transition: "opacity 300ms" }}
              opacity={nodeOpacity}
            >
              {/* 넉넉한 투명 히트영역 */}
              <circle cx={p.x} cy={p.y} r={sizes.hitR} fill="transparent" />
              {isHostCircle ? (
                // 주인 = 원(오행색). 테두리 대신 뒤 골드 글로우로 구분.
                <>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={sizes.hostOuter + 1.8}
                    fill={BOND_COLOR.heavenly}
                    opacity={0.55}
                    filter="url(#goldGlow)"
                  />
                  <circle cx={p.x} cy={p.y} r={sizes.hostOuter} fill={color} />
                </>
              ) : (
                // 나(me-star)=흰 테두리 강조 별 / 그 외=별
                <polygon
                  points={starPoints(p.x, p.y, sizes.starOuter, sizes.starInner)}
                  fill={color}
                  stroke={isMeStar ? "#FFFFFF" : "none"}
                  strokeOpacity={isMeStar ? 0.9 : 0}
                  strokeWidth={isMeStar ? 0.7 : 0}
                  strokeLinejoin="round"
                />
              )}
              {sizes.showLabels && n.name && (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor={labelPos.anchor}
                  dominantBaseline="central"
                  fontSize={isHostCircle ? sizes.hostLabelFont : sizes.labelFont}
                  fontWeight={isHostCircle ? 700 : 400}
                  fill="#EDE6D6"
                  fillOpacity={0.95}
                  stroke={isHostCircle ? "none" : "#1F1735"}
                  strokeWidth={isHostCircle ? 0 : 0.6}
                  strokeOpacity={isHostCircle ? 0 : 0.85}
                  paintOrder="stroke"
                  style={{ strokeLinejoin: "round" }}
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
