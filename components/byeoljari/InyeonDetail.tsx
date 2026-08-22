"use client";
import type { GraphNode } from "@/lib/byeoljari/types";
import { subjectParticle } from "@/lib/byeoljari/display";
import { relationTenGodCopy } from "@/lib/byeoljari/copy";
import { relationDetail } from "@/lib/byeoljari/relation-detail";

interface Props {
  target: GraphNode;
  oriented: {
    iSeeThem: string;
    theySeeMe: string;
    element: string;
    iSeeThemTenGod: string;
    theySeeMeTenGod: string;
  } | null;
  heavenlyCombo: boolean;
  sixCombo: boolean;
  inyeon: {
    score: number;
    grade: { label: string; tone: string };
    reasons: string[];
    comment: string;
  } | null;
  pivotIsMe?: boolean;
  triadShared?: boolean;
}

/** 1:1 인연 상세 본문(인연 점수 근거 + 줄글/키워드 + 내가/그가 보는 카피 + 잘맞는점/조심). 지도 하단 카드·리스트 아코디언 공용. */
export default function InyeonDetail({ target, oriented, inyeon, pivotIsMe = true, triadShared = false }: Props) {
  const them = target.name ?? "이 별";
  if (!oriented) {
    return (
      <p className="text-sm text-text-light">
        {triadShared ? "같은 결 (삼합) — 함께면 시너지가 나" : "이 별과의 궁합은 아직 볼 수 없어."}
      </p>
    );
  }
  const iSee = relationTenGodCopy(target.relationType, oriented.iSeeThemTenGod) ?? oriented.iSeeThem;
  const theySee = relationTenGodCopy(target.relationType, oriented.theySeeMeTenGod) ?? oriented.theySeeMe;
  const rd = relationDetail(oriented.element);
  return (
    <div className="space-y-3">
      {inyeon && (
        <div className="rounded-xl bg-lilac-soft/40 p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg text-eye-purple">인연 점수 {inyeon.score}</span>
            <span className="text-xs text-eye-purple/70">{inyeon.grade.label}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-eye-purple">
            {inyeon.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-eye-purple">{rd.prose}</p>
      {rd.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rd.keywords.map((k) => (
            <span key={k} className="rounded-full bg-lilac-soft px-2 py-0.5 text-xs text-eye-purple">#{k}</span>
          ))}
        </div>
      )}
      {pivotIsMe && (
        <>
          <div className="rounded-xl bg-white/60 p-3 text-sm">
            <div className="text-text-light">내가 보는 {them}</div>
            <div className="text-eye-purple">{iSee}</div>
          </div>
          {/* 남이 보는 나 = 차별점 = 골드 강조 */}
          <div className="rounded-xl bg-gold-soft/40 p-3 text-sm ring-1 ring-gold">
            <div className="text-text-light">{them}{subjectParticle(them)} 보는 나</div>
            <div className="font-semibold text-eye-purple">{theySee}</div>
          </div>
        </>
      )}
      {(rd.good || rd.caution) && (
        <div className="rounded-xl bg-white/60 p-3 text-sm">
          {rd.good && <div className="text-eye-purple">잘 맞는 점 · {rd.good}</div>}
          {rd.caution && <div className="mt-1 text-text-light">살짝 조심 · {rd.caution}</div>}
        </div>
      )}
    </div>
  );
}
