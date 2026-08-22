"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StarGraph } from "@/lib/byeoljari/types";
import { computeLayout, orientEdge } from "@/lib/byeoljari/layout";
import { buildFocusGraph } from "@/lib/byeoljari/focus";
import {
  STAR_ELEMENT_COLORS,
  relationTypeLabel,
  directionParticle,
} from "@/lib/byeoljari/display";
import { presentBondFilters, BOND_FILTER_LABEL, type BondFilter } from "@/lib/byeoljari/bond-filter";
import { scaleForCount } from "@/lib/byeoljari/scale";
import { resolveShape, shouldReveal } from "@/lib/byeoljari/shape";
import { inyeonGrade, inyeonReasons, inyeonComment } from "@/lib/byeoljari/inyeon";
import ConstellationCanvas from "./ConstellationCanvas";
import InyeonDetail from "./InyeonDetail";

const LEGEND = (["목", "화", "토", "금", "수"] as const).map(
  (e) => [e, STAR_ELEMENT_COLORS[e]] as const
);

interface Props {
  graph: StarGraph;
  meId: string | null;
}

export default function ConstellationView({ graph, meId }: Props) {
  // focusPath 비어있음 = overview(전체 그래프). 마지막 원소 = 현재 포커스 중심 별(focusId).
  // 별 탭 = 걷기(push) · 나 탭/배경 탭/브레드크럼 "전체" = 리셋. inspected = 포커스 뷰에서 선(엣지) 탭 시 그 쌍만 별도 조회.
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [inspected, setInspected] = useState<[string, string] | null>(null);
  const [listOpenId, setListOpenId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<BondFilter | null>(null);
  const [reveal, setReveal] = useState(false);
  // 성장 리빌 오버레이는 body 로 포털 — 페이지 <main> 의 애니메이션이 만드는
  // 스택 컨텍스트에 갇혀 헤더/하단탭(z-50/z-40) 아래로 깔리는 문제를 피한다.
  const [mounted, setMounted] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const shape = useMemo(() => resolveShape(graph.nodes), [graph.nodes]);
  const focusId = focusPath.length ? focusPath[focusPath.length - 1] : null;

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

  // 새로 뜬 상세(포커스 카드/선 인스펙트/리스트 아코디언)를 뷰로. block:"end" + scroll-mb-20 으로 하단을
  // 고정 하단탭(~5rem) 위에 정렬 — 핵심(골드 "남이 보는 나")이 카드 하단이라 nearest 로는
  // 카드가 뷰포트보다 크면 하단이 안 끌려와 탭에 가린다(실측 확인). smooth 는 미표시 환경에서
  // 무동작이라 즉시 정렬로 둔다(탭 시 바로 노출, 모든 환경 견고).
  useEffect(() => {
    if ((focusId || inspected || listOpenId) && detailRef.current) {
      detailRef.current.scrollIntoView({ block: "end" });
    }
  }, [focusId, inspected, listOpenId]);

  const host = graph.nodes.find((n) => n.isHost) ?? graph.nodes[0];
  const pivotId = meId ?? host?.id ?? null;

  // 포커스 뷰 = buildFocusGraph 부분그래프를 focusId 중심으로 재배치. overview = 전체 그래프 그대로.
  const viewGraph = useMemo(() => (focusId ? buildFocusGraph(focusId, graph) : graph), [focusId, graph]);
  const layout = useMemo(
    () => computeLayout(viewGraph.nodes, focusId ? { centerId: focusId } : undefined),
    [viewGraph.nodes, focusId]
  );
  const sizes = useMemo(() => scaleForCount(viewGraph.nodes.length), [viewGraph.nodes.length]);

  const filterTypes = useMemo(
    () => presentBondFilters(graph.edges, graph.triads),
    [graph.edges, graph.triads]
  );
  const showFilter = !focusId && filterTypes.length >= 1; // 전체 + ≥1 = 칩 2개 이상, 포커스 뷰에선 숨김
  // 사라진 분류를 가리키는 stale 필터는 전체로 폴백.
  const effectiveFilter = !focusId && activeFilter && filterTypes.includes(activeFilter) ? activeFilter : null;

  // pivot↔other 1:1 상세(인연 점수 근거 + 방향 카피). 포커스 카드·선 인스펙트·랭킹 아코디언 공용.
  function detailFor(pId: string, otherId: string) {
    const edge =
      graph.edges.find(
        (e) => (e.a === pId && e.b === otherId) || (e.a === otherId && e.b === pId)
      ) ?? null;
    const oriented = edge ? orientEdge(edge, pId) : null;
    const grade = edge ? inyeonGrade(edge.inyeon) : null;
    const inyeonInfo =
      edge && oriented && grade
        ? {
            score: edge.inyeon,
            grade,
            reasons: inyeonReasons({
              element: oriented.element,
              heavenlyCombo: edge.heavenlyCombo,
              sixCombo: edge.sixCombo,
              triadShared: edge.triadShared,
            }),
            comment: inyeonComment(grade.tone),
          }
        : null;
    const target = graph.nodes.find((n) => n.id === otherId) ?? null;
    return { edge, oriented, inyeonInfo, target };
  }

  // pivot(나) 기준 인연 점수 내림차순 순위. 호스트 낀 엣지는 전부, 게스트끼리는 특별 인연만 온다.
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

  // 지도 아래 카드의 주어(pivot/other) — 선 인스펙트 중이면 그 쌍(나 포함이면 나 pivot, 아니면 게스트끼리),
  // 아니면 포커스 카드(나 ↔ focusId).
  let cardPivot: string | null = null;
  let cardOther: string | null = null;
  let cardPivotIsMe = true;
  if (inspected) {
    const [a, b] = inspected;
    if (a === pivotId || b === pivotId) {
      cardPivot = pivotId;
      cardOther = a === pivotId ? b : a;
      cardPivotIsMe = true;
    } else {
      cardPivot = a;
      cardOther = b;
      cardPivotIsMe = false;
    }
  } else if (focusId && pivotId && focusId !== pivotId) {
    cardPivot = pivotId;
    cardOther = focusId;
    cardPivotIsMe = true;
  }
  const card = cardPivot && cardOther ? detailFor(cardPivot, cardOther) : null;

  function handleNode(id: string) {
    if (id === pivotId) {
      setFocusPath([]);
      setInspected(null);
      return; // 나 탭 → 전체
    }
    if (focusId === id) return; // 이미 중심
    setFocusPath((p) => [...p, id]);
    setInspected(null);
    setListOpenId(null);
  }

  function resetToOverview() {
    setFocusPath([]);
    setInspected(null);
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
                {t === null ? "전체" : BOND_FILTER_LABEL[t]}
              </button>
            );
          })}
        </div>
      )}
      {focusPath.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-eye-purple">
          <button type="button" onClick={resetToOverview} className="underline">
            전체
          </button>
          {focusPath.map((id, i) => {
            const n = graph.nodes.find((x) => x.id === id);
            return (
              <span key={`${id}-${i}`} className="flex items-center gap-1">
                <span aria-hidden>›</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusPath(focusPath.slice(0, i + 1));
                    setInspected(null);
                  }}
                >
                  {n?.name ?? "이 별"}
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "1 / 1" }}>
        <ConstellationCanvas
          graph={viewGraph}
          layout={layout}
          meId={meId}
          transform={{ tx: 0, ty: 0, s: 1 }}
          sizes={sizes}
          activeFilter={effectiveFilter}
          shape={shape}
          focusMode={!!focusId}
          onSelect={handleNode}
          onEdgeSelect={(a, b) => setInspected([a, b])}
          onBackgroundClick={resetToOverview}
        />
      </div>
      {/* 지도 아래 상세 — 포커스 카드(나↔focusId) 또는 선 인스펙트(임의 쌍 하나) */}
      {focusId && card?.target && (
        <div ref={detailRef} className="mt-3 animate-fade-in scroll-mb-20 rounded-2xl bg-cream-warm p-4 shadow">
          <div className="mb-2 flex items-start justify-between">
            <div>
              {cardPivotIsMe ? (
                <>
                  <div className="text-xs text-text-light">{relationTypeLabel(card.target.relationType)}</div>
                  <h3 className="font-display text-lg text-eye-purple">{card.target.name ?? "이 별"}</h3>
                </>
              ) : (
                <h3 className="font-display text-lg text-eye-purple">
                  {graph.nodes.find((n) => n.id === cardPivot)?.name ?? "이 별"} ↔ {card.target.name ?? "이 별"}
                </h3>
              )}
            </div>
            <button
              onClick={() => (inspected ? setInspected(null) : resetToOverview())}
              className="text-sm text-text-light"
            >
              {inspected ? "← 뒤로" : "닫기 ✕"}
            </button>
          </div>
          <InyeonDetail
            target={card.target}
            oriented={card.oriented}
            heavenlyCombo={card.edge?.heavenlyCombo ?? false}
            sixCombo={card.edge?.sixCombo ?? false}
            inyeon={card.inyeonInfo}
            pivotIsMe={cardPivotIsMe}
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
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-text-light">
        <span className="inline-flex items-center gap-1">
          <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke="#F2D78A" strokeWidth="1.5" strokeLinecap="round" /></svg>
          끌림
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke="#F2D78A" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round" /></svg>
          결속
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill="#FBC94D" opacity="0.5" /><circle cx="5" cy="1.5" r="1" fill="#FBC94D" /></svg>
          무리
        </span>
      </div>
      {ranking.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-eye-purple">인연 점수 높은 순</div>
          <div className="space-y-1.5">
            {ranking.map((r, i) => {
              const grade = inyeonGrade(r.inyeon);
              const open = listOpenId === r.id;
              const rowDetail = open && pivotId ? detailFor(pivotId, r.id) : null;
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
                    onClick={() => {
                      setListOpenId((cur) => (cur === r.id ? null : r.id));
                      resetToOverview(); // 리스트 아코디언은 지도를 전체로 되돌려 지도/리스트 상세를 배타로 유지
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition active:scale-[0.99] hover:bg-lilac-soft/40"
                  >
                    <span className="text-sm text-eye-purple">
                      {i + 1}위 · {r.name ?? "이 별"}
                    </span>
                    <span className="text-xs text-text-light">
                      인연 점수 {r.inyeon} · {grade.label}
                    </span>
                  </button>
                  {open && rowDetail?.target && (
                    <div ref={detailRef} className="animate-fade-in scroll-mb-20 px-3 pb-3 pt-1">
                      <InyeonDetail
                        target={rowDetail.target}
                        oriented={rowDetail.oriented}
                        heavenlyCombo={rowDetail.edge?.heavenlyCombo ?? false}
                        sixCombo={rowDetail.edge?.sixCombo ?? false}
                        inyeon={rowDetail.inyeonInfo}
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
