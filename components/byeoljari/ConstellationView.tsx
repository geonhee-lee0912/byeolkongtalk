"use client";
import { useMemo, useState } from "react";
import type { StarGraph } from "@/lib/byeoljari/types";
import { computeLayout, focusTransform, orientEdge } from "@/lib/byeoljari/layout";
import { STAR_ELEMENT_COLORS, RELATION_TYPE_LABEL, relationTypeLabel } from "@/lib/byeoljari/display";
import { scaleForCount } from "@/lib/byeoljari/scale";
import ConstellationCanvas from "./ConstellationCanvas";
import OneToOnePanel from "./OneToOnePanel";

const LEGEND = (["목", "화", "토", "금", "수"] as const).map(
  (e) => [e, STAR_ELEMENT_COLORS[e]] as const
);
// 관계분류 단일 원천(display.ts) — 순서 고정용. 별도 하드카피 금지(드리프트 방지).
const RELATION_ORDER = Object.keys(RELATION_TYPE_LABEL);

interface Props {
  graph: StarGraph;
  meId: string | null;
}

export default function ConstellationView({ graph, meId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const layout = useMemo(() => computeLayout(graph.nodes), [graph.nodes]);
  const sizes = useMemo(() => scaleForCount(graph.nodes.length), [graph.nodes.length]);

  const host = graph.nodes.find((n) => n.isHost) ?? graph.nodes[0];
  const pivotId = meId ?? host?.id ?? null;

  const filterTypes = useMemo(() => {
    const present = new Set(graph.nodes.filter((n) => !n.isHost).map((n) => n.relationType));
    return RELATION_ORDER.filter((t) => present.has(t));
  }, [graph.nodes]);
  const showFilter = filterTypes.length >= 2;
  // 사라진 분류를 가리키는 stale 필터는 전체로 폴백.
  const effectiveFilter = activeFilter && filterTypes.includes(activeFilter) ? activeFilter : null;

  const target = selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null;
  const edge =
    selectedId && pivotId
      ? graph.edges.find(
          (e) =>
            (e.a === pivotId && e.b === selectedId) || (e.a === selectedId && e.b === pivotId)
        ) ?? null
      : null;
  const oriented = edge && pivotId ? orientEdge(edge, pivotId) : null;

  const p = selectedId ? layout.get(selectedId) : undefined;
  const transform = p ? focusTransform(p, 2) : { tx: 0, ty: 0, s: 1 };

  function handleSelect(id: string) {
    if (id === pivotId) return; // 나 자신과는 1:1 없음
    setSelectedId(id);
  }

  return (
    <div>
      {showFilter && (
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          {[null, ...filterTypes].map((t) => {
            const active = effectiveFilter === t;
            return (
              <button
                key={t ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveFilter(t)}
                className={`rounded-full px-3 py-1 text-xs ${
                  active ? "bg-lilac-deep text-white" : "bg-lilac-soft text-eye-purple"
                }`}
              >
                {t === null ? "전체" : relationTypeLabel(t)}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "1 / 1" }}>
        <ConstellationCanvas
          graph={graph}
          layout={layout}
          meId={meId}
          transform={transform}
          sizes={sizes}
          activeFilter={effectiveFilter}
          onSelect={handleSelect}
        />
        {target && (
          <OneToOnePanel
            target={target}
            oriented={oriented}
            heavenlyCombo={edge?.heavenlyCombo ?? false}
            sixCombo={edge?.sixCombo ?? false}
            onBack={() => setSelectedId(null)}
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-text-light">
        {LEGEND.map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
