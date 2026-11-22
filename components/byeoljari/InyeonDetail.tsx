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
  showProse?: boolean;
}

/** 1:1 인연 상세 본문(인연 점수 근거 + 줄글 + 내가/그가 보는 카피 한 박스 + 잘맞는점/조심). 지도 하단 카드·리스트 아코디언 공용. */
export default function InyeonDetail({ target, oriented, inyeon, pivotIsMe = true, triadShared = false, showProse = true }: Props) {
  const them = target.name ?? "이 별";
  if (!oriented) {
    return (
      <p className="text-14 text-text-light">
        {triadShared ? "같은 결 (삼합) — 함께면 시너지가 나" : "이 별과의 궁합은 아직 볼 수 없어."}
      </p>
    );
  }
  const iSee = relationTenGodCopy(target.relationType, oriented.iSeeThemTenGod) ?? oriented.iSeeThem;
  const theySee = relationTenGodCopy(target.relationType, oriented.theySeeMeTenGod) ?? oriented.theySeeMe;
  const rd = relationDetail(oriented.element);
  return (
    <div className="space-y-3">
      {/* 점수는 연보라 칸, 나머지는 상자 없이 얇은 선으로 나눈 한 흐름(디자인 다듬기 인연 별자리 ⑩ D1, 운영자 11-21).
          예전엔 남색 점수 상자(바로 위 지도와 남색 둘) + 카드 속 카드 + 연보라 상자가 따로 떠 있었다 */}
      {inyeon && (
        <div className="rounded-xl bg-lilac-soft/60 p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-17 text-accent">인연 점수 {inyeon.score}</span>
            <span className="text-12 font-bold text-eye-purple">{inyeon.grade.label}</span>
          </div>
          <ul className="mt-1.5 space-y-0.5 text-13 text-eye-purple">
            {inyeon.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {showProse && <p className="text-14 text-eye-purple">{rd.prose}</p>}
      {pivotIsMe && (
        // 내가 보는 X / X가 보는 나 = 한 박스(구분선). "보는 나"는 차별점이라 굵게 강조.
        <div className="border-t border-lilac-soft pt-3 text-14">
          <div className="font-bold text-eye-purple">내가 보는 {them}</div>
          <div className="text-eye-purple">{iSee}</div>
          <div className="mt-2 border-t border-lilac-soft pt-2 font-bold text-eye-purple">
            {them}{subjectParticle(them)} 보는 나
          </div>
          <div className="text-eye-purple">{theySee}</div>
        </div>
      )}
      {(rd.good || rd.caution) && (
        <div className="border-t border-lilac-soft pt-3 text-14">
          {rd.good && <div className="text-eye-purple"><span className="font-bold">잘 맞는 점</span> · {rd.good}</div>}
          {rd.caution && <div className="mt-1 text-text-light"><span className="font-bold">살짝 조심</span> · {rd.caution}</div>}
        </div>
      )}
    </div>
  );
}
