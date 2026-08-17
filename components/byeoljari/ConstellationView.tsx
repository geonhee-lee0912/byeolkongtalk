"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { StarGraph } from "@/lib/byeoljari/types";
import { computeLayout, focusPair, orientEdge } from "@/lib/byeoljari/layout";
import {
  STAR_ELEMENT_COLORS,
  RELATION_TYPE_LABEL,
  relationTypeLabel,
  directionParticle,
} from "@/lib/byeoljari/display";
import { scaleForCount } from "@/lib/byeoljari/scale";
import { resolveShape, shouldReveal } from "@/lib/byeoljari/shape";
import { inyeonGrade, inyeonReasons, inyeonComment } from "@/lib/byeoljari/inyeon";
import ConstellationCanvas from "./ConstellationCanvas";
import InyeonDetail from "./InyeonDetail";

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
  const [selection, setSelection] = useState<{ id: string; source: "map" | "list" } | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  // 성장 리빌 오버레이는 body 로 포털 — 페이지 <main> 의 애니메이션이 만드는
  // 스택 컨텍스트에 갇혀 헤더/하단탭(z-50/z-40) 아래로 깔리는 문제를 피한다.
  const [mounted, setMounted] = useState(false);
  const layout = useMemo(() => computeLayout(graph.nodes), [graph.nodes]);
  const sizes = useMemo(() => scaleForCount(graph.nodes.length), [graph.nodes.length]);
  const shape = useMemo(() => resolveShape(graph.nodes), [graph.nodes]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!shape) return;
    const key = `byeoljari:seenStage:${graph.shareId}`;
    const stored = localStorage.getItem(key);
    if (shouldReveal(stored, shape.stage)) setReveal(true);
    localStorage.setItem(key, String(shape.stage)); // 리빌 여부와 무관하게 기준선 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.shareId, shape?.stage]);

  // 오버레이가 열려 있는 동안만 ESC 로 닫기 — ContinuationModal/RecoConfirmModal 패턴 미러.
  useEffect(() => {
    if (!reveal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReveal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal]);

  const host = graph.nodes.find((n) => n.isHost) ?? graph.nodes[0];
  const pivotId = meId ?? host?.id ?? null;

  const filterTypes = useMemo(() => {
    const present = new Set(graph.nodes.filter((n) => !n.isHost).map((n) => n.relationType));
    return RELATION_ORDER.filter((t) => present.has(t));
  }, [graph.nodes]);
  const showFilter = filterTypes.length >= 2;
  // 사라진 분류를 가리키는 stale 필터는 전체로 폴백.
  const effectiveFilter = activeFilter && filterTypes.includes(activeFilter) ? activeFilter : null;

  const sel = selection?.id ?? null;
  const mapSelected = selection?.source === "map";
  const listExpandedId = selection?.source === "list" ? sel : null;

  const target = sel ? graph.nodes.find((n) => n.id === sel) ?? null : null;
  const edge =
    sel && pivotId
      ? graph.edges.find(
          (e) =>
            (e.a === pivotId && e.b === sel) || (e.a === sel && e.b === pivotId)
        ) ?? null
      : null;
  const oriented = edge && pivotId ? orientEdge(edge, pivotId) : null;

  // 선택된 1:1 의 인연도 근거(오행은 pivot 기준 oriented.element, 나머지는 edge).
  const inyeonInfo = useMemo(() => {
    if (!edge || !oriented) return null;
    const grade = inyeonGrade(edge.inyeon);
    return {
      score: edge.inyeon,
      grade,
      reasons: inyeonReasons({
        element: oriented.element,
        heavenlyCombo: edge.heavenlyCombo,
        sixCombo: edge.sixCombo,
        triadShared: edge.triadShared,
      }),
      comment: inyeonComment(grade.tone),
    };
  }, [edge, oriented]);

  // pivot(나) 기준 인연도 내림차순 순위. edge 는 이미 compat_visible 로 필터돼 보이는 관계만.
  const ranking = useMemo(() => {
    if (!pivotId) return [];
    return graph.edges
      .filter((e) => e.a === pivotId || e.b === pivotId)
      .map((e) => {
        const otherId = e.a === pivotId ? e.b : e.a;
        const other = graph.nodes.find((n) => n.id === otherId);
        const special =
          (e.heavenlyCombo ? 1 : 0) + (e.sixCombo ? 1 : 0) + (e.triadShared ? 1 : 0);
        return { id: otherId, name: other?.name ?? null, inyeon: e.inyeon, special };
      })
      .sort((x, y) => y.inyeon - x.inyeon || y.special - x.special);
  }, [graph.edges, graph.nodes, pivotId]);

  const mePt = pivotId ? layout.get(pivotId) : undefined;
  const selPt = sel ? layout.get(sel) : undefined;
  const transform =
    mapSelected && mePt && selPt ? focusPair(mePt, selPt) : { tx: 0, ty: 0, s: 1 };
  const pairIds = mapSelected && pivotId && sel ? [pivotId, sel] : null;

  function handleSelect(id: string, source: "map" | "list") {
    if (id === pivotId) return; // 나 자신과는 1:1 없음
    setSelection((cur) => (cur && cur.id === id && cur.source === source ? null : { id, source }));
  }

  return (
    <div>
      {/* 형상 엠블럼 헤더 — "우리 별자리 · {신수이름}". shape null(노드0)이면 텍스트만. */}
      <h1 className="mb-3 flex items-center justify-center gap-2 font-display text-lg text-eye-purple">
        {shape && (
          <img
            src={shape.assetSrc}
            alt=""
            className="h-9 w-9 object-contain"
            style={
              shape.element === "수" && shape.stage === 3
                ? { transform: "scale(0.9)" }
                : undefined
            }
          />
        )}
        우리 별자리{shape ? ` · ${shape.name}` : ""}
      </h1>
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
          shape={shape}
          highlightPairIds={pairIds}
          onSelect={(id) => handleSelect(id, "map")}
          onBackgroundClick={() => setSelection(null)}
        />
      </div>
      {/* 지도 인터랙션 상세 — 지도 바로 아래(하이라이트와 한눈에) */}
      {mapSelected && target && (
        <div className="mt-3 animate-fade-in rounded-2xl bg-cream-warm p-4 shadow">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <div className="text-xs text-text-light">{relationTypeLabel(target.relationType)}</div>
              <h3 className="font-display text-lg text-eye-purple">{target.name ?? "이 별"}</h3>
            </div>
            <button onClick={() => setSelection(null)} className="text-sm text-text-light">
              닫기 ✕
            </button>
          </div>
          <InyeonDetail
            target={target}
            oriented={oriented}
            heavenlyCombo={edge?.heavenlyCombo ?? false}
            sixCombo={edge?.sixCombo ?? false}
            inyeon={inyeonInfo}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-text-light">
        {LEGEND.map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-lilac-mid/40" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
      {ranking.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-eye-purple">인연이 진한 순</div>
          <div className="space-y-1.5">
            {ranking.map((r, i) => {
              const grade = inyeonGrade(r.inyeon);
              const open = listExpandedId === r.id;
              return (
                <div
                  key={r.id}
                  className={`overflow-hidden rounded-xl ${
                    i === 0 ? "bg-gold-soft/40 ring-1 ring-gold/50" : "bg-cream-warm"
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => handleSelect(r.id, "list")}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition active:scale-[0.99] hover:bg-lilac-soft/40"
                  >
                    <span className="text-sm text-eye-purple">
                      {i + 1}위 · {r.name ?? "이 별"}
                    </span>
                    <span className="text-xs text-text-light">
                      인연도 {r.inyeon} · {grade.label}
                    </span>
                  </button>
                  {open && target && (
                    <div className="animate-fade-in px-3 pb-3 pt-1">
                      <InyeonDetail
                        target={target}
                        oriented={oriented}
                        heavenlyCombo={edge?.heavenlyCombo ?? false}
                        sixCombo={edge?.sixCombo ?? false}
                        inyeon={inyeonInfo}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {shape?.membersToNext != null && shape.nextName && (
        <p className="mt-3 text-center text-sm text-eye-purple">
          ✨ {shape.membersToNext}명 더 오면 {shape.nextName}
          {directionParticle(shape.nextName)} 진화!
        </p>
      )}
      {shape?.stage === 3 && (
        <p className="mt-3 text-center text-sm text-eye-purple">✨ {shape.name} 완성!</p>
      )}
      {reveal && shape && mounted && createPortal(
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-night/80 animate-fade-in"
          onClick={() => setReveal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="형상 진화"
        >
          <img src={shape.assetSrc} alt="" className="h-40 w-40 object-contain" />
          <p className="mt-4 font-display text-xl text-gold">
            {shape.name}
            {directionParticle(shape.name)} 진화했어!
          </p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-lilac-deep px-6 py-2 text-white"
            onClick={() => setReveal(false)}
          >
            닫기
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
