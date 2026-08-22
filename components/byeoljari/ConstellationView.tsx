"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StarGraph } from "@/lib/byeoljari/types";
import { computeLayout, orientEdge } from "@/lib/byeoljari/layout";
import { buildFocusGraph, focusSummary } from "@/lib/byeoljari/focus";
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
import { relationRole, elementPair, metaphorProse } from "@/lib/byeoljari/relation-role";
import { useRouter } from "next/navigation";

const LEGEND = (["목", "화", "토", "금", "수"] as const).map(
  (e) => [e, STAR_ELEMENT_COLORS[e]] as const
);

// 인연 점수 등급 칩 색상 — 점수 구간별 색. 전부 밝은 채움이라 1위 다크 행에서도 판독됨.
function gradeChipClass(tone: "high" | "mid" | "low" | "faint"): string {
  switch (tone) {
    case "high":
      return "bg-gold-soft text-eye-purple"; // 골드
    case "mid":
      return "bg-lilac text-eye-purple"; // 라일락
    case "low":
      return "bg-[#CFE9E2] text-[#2E6F60]"; // 세이지
    default:
      return "bg-[#EAE5DC] text-text-light"; // 웜그레이
  }
}

interface Props {
  graph: StarGraph;
  meId: string | null;
}

export default function ConstellationView({ graph, meId }: Props) {
  // focusId null = overview(전체 그래프). 게스트 별 탭 = 포커스 진입, 나 탭/배경 탭/"전체 지도 보기" = 리셋.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [listOpenId, setListOpenId] = useState<string | null>(null);
  const [expandedNeighborId, setExpandedNeighborId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<BondFilter | null>(null);
  const [reveal, setReveal] = useState(false);
  // 성장 리빌 오버레이는 body 로 포털 — 페이지 <main> 의 애니메이션이 만드는
  // 스택 컨텍스트에 갇혀 헤더/하단탭(z-50/z-40) 아래로 깔리는 문제를 피한다.
  const [mounted, setMounted] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  // 포커스 진입(focusId) 자체는 스크롤하지 않는다 — 지도가 화면에서 밀려나면 안 됨.
  // 카드 내부 이웃 행 펼침(expandedNeighborId)만 nearest 로 살짝 보정.
  useEffect(() => {
    if (expandedNeighborId && detailRef.current) {
      detailRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [expandedNeighborId]);

  const host = graph.nodes.find((n) => n.isHost) ?? graph.nodes[0];
  const pivotId = meId ?? host?.id ?? null;
  const myEl = pivotId ? graph.nodes.find((n) => n.id === pivotId)?.element ?? "" : "";
  const isOwner = meId != null && meId === host?.id; // 뷰어=호스트(맵 주인)일 때만 삭제 노출

  // 포커스 뷰 = buildFocusGraph 부분그래프를 focusId 중심으로 재배치. overview = 전체 그래프 그대로.
  const viewGraph = useMemo(() => (focusId ? buildFocusGraph(focusId, graph) : graph), [focusId, graph]);
  const layout = useMemo(
    () => computeLayout(viewGraph.nodes, focusId ? { centerId: focusId } : undefined),
    [viewGraph.nodes, focusId]
  );
  // 전체 그래프 개수 기준 — 포커스 부분그래프 개수로 재계산하면 overview↔focus 전환마다 별 크기가 바뀐다.
  const sizes = useMemo(() => scaleForCount(graph.nodes.length), [graph.nodes.length]);

  const filterTypes = useMemo(
    () => presentBondFilters(graph.edges, graph.triads),
    [graph.edges, graph.triads]
  );
  const showFilter = filterTypes.length >= 1; // 전체 + ≥1 = 칩 2개 이상. 포커스 뷰에서도 유지(분류 참조)
  // 사라진 분류를 가리키는 stale 필터는 전체로 폴백.
  // 필터는 overview 전용(포커스 서브그래프엔 합성 스포크가 있어 dim 이 지저분). 포커스에서 칩 누르면 전체로 나가며 적용
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
        const oriented = orientEdge(e, pivotId);
        const special =
          (e.heavenlyCombo ? 1 : 0) + (e.sixCombo ? 1 : 0) + (e.triadShared ? 1 : 0);
        return {
          id: otherId,
          name: other?.name ?? null,
          element: other?.element ?? "",
          dayType: other?.dayType ?? "",
          relation: oriented?.element ?? "",
          inyeon: e.inyeon,
          special,
        };
      })
      .sort((x, y) => y.inyeon - x.inyeon || y.special - x.special);
  }, [graph.edges, graph.nodes, pivotId]);

  // 지도 아래 카드 — 항상 나 ↔ focusId(포커스 진입 중일 때만).
  const card = focusId && pivotId && focusId !== pivotId ? detailFor(pivotId, focusId) : null;

  // 카드 ② — focusId 기준 이웃 전체(나 제외) + 전체 요약. 포커스 중일 때만.
  const neighbors = focusId
    ? viewGraph.nodes
        .filter((n) => n.id !== focusId && n.id !== pivotId)
        .map((n) => {
          const d = detailFor(focusId, n.id); // edge/oriented/inyeonInfo/target (graph 기준)
          const e = d.edge;
          const tag = e?.heavenlyCombo ? "끌림" : e?.sixCombo ? "결속" : e?.triadShared ? "같은 결" : "같은 결";
          const triadShared = graph.triads.some(
            (t) => t.memberIds.includes(focusId) && t.memberIds.includes(n.id)
          );
          return { id: n.id, name: n.name, tag, triadShared, ...d };
        })
        .sort((a, b) => (b.inyeonInfo?.score ?? 0) - (a.inyeonInfo?.score ?? 0))
    : [];
  const summary = focusId ? focusSummary(focusId, pivotId, graph) : null;
  const focusName = focusId ? (graph.nodes.find((n) => n.id === focusId)?.name ?? "이 별") : "";

  function handleNode(id: string) {
    if (id === pivotId) { setFocusId(null); setExpandedNeighborId(null); return; }
    if (focusId) {                                  // 포커스 중: 이웃 별 탭 → 카드 행 펼침(재포커스 아님)
      if (id !== focusId) setExpandedNeighborId((cur) => (cur === id ? null : id));
      return;
    }
    setFocusId(id); setListOpenId(null); setExpandedNeighborId(null);  // overview 게스트 → 포커스
  }

  function resetToOverview() {
    setFocusId(null);
    setExpandedNeighborId(null);
  }

  async function handleDeleteMember(memberId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/fortune/byeoljari/${graph.shareId}/members/${memberId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        router.refresh();
        window.location.reload(); // 그래프는 클라 fetch라 확실히 재조회
      } else {
        setDeleting(false);
        setConfirmDeleteId(null);
      }
    } catch {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div>
      {/* 형상 엠블럼 헤더 — "{신수이름}자리". shape null(노드0)이면 "우리 별자리" 텍스트만. */}
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
        {shape ? `${shape.name}자리` : "우리 별자리"}
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
                onClick={() => {
                  setActiveFilter(t);
                  if (focusId) resetToOverview(); // 포커스 중 필터 누르면 전체 지도로 나가며 적용
                }}
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
      <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "1 / 1" }}>
        {focusId && (
          <button
            type="button"
            onClick={resetToOverview}
            className="absolute left-2 top-2 z-10 rounded-full bg-cream-warm/90 px-3 py-1 text-xs text-eye-purple shadow"
          >
            ← 전체 지도 보기
          </button>
        )}
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
          onBackgroundClick={resetToOverview}
          onEdgeSelect={(a, b) => {
            const other = a === focusId ? b : a; // spoke 는 focusId 발이라 상대가 이웃
            if (other && other !== pivotId) setExpandedNeighborId((cur) => (cur === other ? null : other));
          }}
        />
      </div>
      {/* 지도 아래 상세 — 포커스 카드(나↔focusId) */}
      {focusId && card?.target && (
        <div ref={detailRef} className="mt-3 animate-fade-in scroll-mb-20 rounded-2xl bg-cream-warm p-4 shadow">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <div className="text-xs text-text-light">{relationTypeLabel(card.target.relationType)}</div>
              <h3 className="font-display text-lg text-eye-purple">{card.target.name ?? "이 별"}</h3>
            </div>
            <button onClick={resetToOverview} className="text-sm text-text-light">
              닫기 ✕
            </button>
          </div>
          <InyeonDetail
            target={card.target}
            oriented={card.oriented}
            heavenlyCombo={card.edge?.heavenlyCombo ?? false}
            sixCombo={card.edge?.sixCombo ?? false}
            inyeon={card.inyeonInfo}
          />
          <div className="mt-4 border-t border-lilac/30 pt-3">
            <div className="mb-1 text-xs font-semibold text-eye-purple">{focusName}의 인연</div>
            {summary && (
              <p className="mb-2 text-sm text-eye-purple">
                {summary.total > 0
                  ? `강하게 엮인 인연 ${summary.total}명 — 끌림 ${summary.chemi} · 결속 ${summary.bond} · 같은 결 ${summary.triad}. ${summary.comment}`
                  : summary.comment}
              </p>
            )}
            <div className="space-y-1.5">
              {neighbors.map((nb) => {
                const open = expandedNeighborId === nb.id;
                return (
                  <div key={nb.id} className={`overflow-hidden rounded-xl bg-white/60 ${open ? "ring-1 ring-lilac" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedNeighborId(open ? null : nb.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <span className="text-sm text-eye-purple">
                        {nb.name ?? "이 별"} <span className="text-xs text-text-light">{nb.tag}</span>
                      </span>
                      {nb.inyeonInfo && (
                        <span className="text-sm font-semibold text-eye-purple">인연 점수 {nb.inyeonInfo.score}</span>
                      )}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 pt-1">
                        <InyeonDetail
                          target={nb.target!}
                          oriented={nb.oriented}
                          heavenlyCombo={nb.edge?.heavenlyCombo ?? false}
                          sixCombo={nb.edge?.sixCombo ?? false}
                          inyeon={nb.inyeonInfo}
                          pivotIsMe={false}
                          triadShared={nb.triadShared}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* 범례 — 크림 박스로 대비 확보. 오행(위) / 선 종류(아래) 구분선으로 분리. */}
      <div className="mt-3 rounded-2xl bg-cream-warm px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-eye-purple">
          {LEGEND.map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-lilac-mid/40" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-lilac-soft pt-2 text-xs text-eye-purple">
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="#F2D78A" strokeWidth="2" strokeLinecap="round" /></svg>
            끌림
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="#A98BEE" strokeWidth="2" strokeDasharray="2 1.5" strokeLinecap="round" /></svg>
            결속
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill="#FBC94D" opacity="0.5" /><circle cx="5" cy="1.5" r="1" fill="#FBC94D" /></svg>
            같은 결
          </span>
        </div>
      </div>
      {ranking.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-eye-purple">인연 점수 높은 순</div>
          <div className="space-y-2">
            {ranking.map((r, i) => {
              const open = listOpenId === r.id;
              const rowDetail = open && pivotId ? detailFor(pivotId, r.id) : null;
              const top = i === 0;
              const grade = inyeonGrade(r.inyeon);
              return (
                <div
                  key={r.id}
                  className={`overflow-hidden rounded-2xl ${top ? "bg-night text-cream-warm" : "bg-cream-warm"}`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      setListOpenId((cur) => (cur === r.id ? null : r.id));
                      setConfirmDeleteId(null);
                      resetToOverview(); // 리스트 아코디언은 지도를 전체로 되돌려 지도/리스트 상세를 배타로 유지
                    }}
                    className={`block w-full px-4 py-3 text-left transition active:scale-[0.99] ${
                      top ? "hover:bg-white/5" : "hover:bg-lilac-soft/40"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${top ? "bg-gold text-night" : "bg-lilac-soft text-eye-purple"}`}>
                        {i + 1}
                      </span>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                        style={{ backgroundColor: STAR_ELEMENT_COLORS[r.element as keyof typeof STAR_ELEMENT_COLORS] ?? "#B8A8D8", color: "#1F1735" }}
                      >
                        {r.element}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${top ? "text-cream-warm" : "text-eye-purple"}`}>
                          {r.name ?? "이 별"}
                        </span>
                        {r.dayType && (
                          <span className={`block truncate text-xs ${top ? "text-lilac-soft" : "text-text-light"}`}>
                            {r.dayType}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block font-display text-lg font-bold leading-none ${top ? "text-gold" : "text-eye-purple"}`}>
                          {r.inyeon}
                        </span>
                        <span className={`mt-0.5 block text-[11px] ${top ? "text-lilac-soft" : "text-text-light"}`}>
                          인연 점수
                        </span>
                      </span>
                    </span>
                    <span className={`mt-2.5 block border-t pt-2.5 ${top ? "border-white/15" : "border-lilac-soft"}`}>
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${gradeChipClass(grade.tone)}`}>
                          {grade.label}
                        </span>
                        <span className={`text-xs ${top ? "text-cream-warm" : "text-eye-purple"}`}>
                          {relationRole(r.relation)} · {elementPair(r.relation, myEl, r.element)}
                        </span>
                      </span>
                      <span className={`mt-1.5 block text-[12.5px] leading-relaxed ${top ? "text-[#D9CFF0]" : "text-eye-purple"}`}>
                        {metaphorProse(r.relation, myEl, r.element)}
                      </span>
                    </span>
                  </button>
                  {open && rowDetail?.target && (
                    <div ref={detailRef} className="animate-fade-in scroll-mb-20 px-4 pb-4 pt-1">
                      <InyeonDetail
                        target={rowDetail.target}
                        oriented={rowDetail.oriented}
                        heavenlyCombo={rowDetail.edge?.heavenlyCombo ?? false}
                        sixCombo={rowDetail.edge?.sixCombo ?? false}
                        inyeon={rowDetail.inyeonInfo}
                        showProse={false}
                      />
                      {isOwner && !rowDetail.target.isHost && (
                        confirmDeleteId === r.id ? (
                          <span className="mt-3 flex items-center gap-2 text-sm">
                            <span className="text-text-light">이 별을 지도에서 지울까?</span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full border border-lilac-mid/40 px-3 py-1 text-xs text-eye-purple"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDeleteMember(r.id)}
                              className="rounded-full bg-[#D85A30] px-3 py-1 text-xs text-white disabled:opacity-50"
                            >
                              {deleting ? "지우는 중…" : "지우기"}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="mt-3 text-xs text-text-light underline underline-offset-2"
                          >
                            지우기
                          </button>
                        )
                      )}
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
