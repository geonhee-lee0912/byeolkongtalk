"use client";
import type { GraphNode } from "@/lib/byeoljari/types";
import { elementRelationLabel, relationTypeLabel } from "@/lib/byeoljari/display";

interface Props {
  target: GraphNode;
  oriented: { iSeeThem: string; theySeeMe: string; element: string } | null;
  heavenlyCombo: boolean;
  sixCombo: boolean;
  onBack: () => void;
}

export default function OneToOnePanel({ target, oriented, heavenlyCombo, sixCombo, onBack }: Props) {
  const them = target.name ?? "이 별";
  return (
    <div className="absolute inset-x-0 bottom-0 animate-fade-in rounded-t-2xl bg-cream-warm p-5 shadow-2xl">
      <button onClick={onBack} className="mb-3 text-sm text-text-light">
        ← 별자리로
      </button>
      <div className="mb-1 text-xs text-text-light">{relationTypeLabel(target.relationType)}</div>
      <h3 className="font-display text-lg text-eye-purple">{them}</h3>

      {oriented ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-eye-purple">{elementRelationLabel(oriented.element)}</p>
          <div className="rounded-xl bg-white/60 p-3 text-sm">
            <div className="text-text-light">내가 보는 {them}</div>
            <div className="text-eye-purple">{oriented.iSeeThem}</div>
          </div>
          {/* 남이 보는 나 = 스펙 §2 차별점 = 골드 강조 */}
          <div className="rounded-xl bg-gold-soft/40 p-3 text-sm ring-1 ring-gold">
            <div className="text-text-light">{them}가 보는 나</div>
            <div className="font-semibold text-eye-purple">{oriented.theySeeMe}</div>
          </div>
          {(heavenlyCombo || sixCombo) && (
            <div className="flex gap-2">
              {heavenlyCombo && (
                <span className="rounded-full bg-gold/20 px-3 py-1 text-xs text-eye-purple">✨ 케미 스파크</span>
              )}
              {sixCombo && (
                <span className="rounded-full bg-lilac/40 px-3 py-1 text-xs text-eye-purple">🔗 결속</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-light">이 별과의 궁합은 아직 비공개예요.</p>
      )}
    </div>
  );
}
