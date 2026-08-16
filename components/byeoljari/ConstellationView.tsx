"use client";
import { useMemo, useState } from "react";
import type { StarGraph } from "@/lib/byeoljari/types";
import { computeLayout, focusTransform, orientEdge } from "@/lib/byeoljari/layout";
import { STAR_ELEMENT_COLORS } from "@/lib/byeoljari/display";
import ConstellationCanvas from "./ConstellationCanvas";
import OneToOnePanel from "./OneToOnePanel";

const LEGEND = (["목", "화", "토", "금", "수"] as const).map(
  (e) => [e, STAR_ELEMENT_COLORS[e]] as const
);

interface Props {
  graph: StarGraph;
  meId: string | null;
}

export default function ConstellationView({ graph, meId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = useMemo(() => computeLayout(graph.nodes), [graph.nodes]);

  const host = graph.nodes.find((n) => n.isHost) ?? graph.nodes[0];
  const pivotId = meId ?? host?.id ?? null;

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
      <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "1 / 1" }}>
        <ConstellationCanvas
          graph={graph}
          layout={layout}
          meId={meId}
          transform={transform}
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
