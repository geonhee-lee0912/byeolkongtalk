"use client";
import { useState } from "react";
import { getSituations, type SimSituation } from "@/lib/relationship/situations";
import type { RelationshipStatus } from "@/lib/relationship/types";

interface Props {
  status: RelationshipStatus;
  partnerLabel: string;
  onPick: (situationId: string, userContext: string) => void;
  onClose: () => void;
}

export default function SituationSelect({ status, partnerLabel, onPick, onClose }: Props) {
  const situations = getSituations(status); // 관계별 + any + custom
  const [picked, setPicked] = useState<SimSituation | null>(null);
  const [ctx, setCtx] = useState("");

  if (!picked) {
    return (
      <section className="animate-fade-in">
        <header className="sticky top-0 z-10 bg-gradient-to-br from-night to-night-deep px-4 py-3 flex items-center gap-2">
          <button onClick={onClose} className="text-lilac text-sm" aria-label="닫기">‹ 나가기</button>
          <h1 className="flex-1 text-center text-cream-warm font-display text-lg">어떤 상황을 연습해볼까?</h1>
          <span className="w-12" />
        </header>
        <div className="bg-cream rounded-t-3xl min-h-[70dvh] p-4 grid grid-cols-1 gap-3">
          <p className="text-center text-text-light text-sm mb-1">{partnerLabel} 와의 상황을 골라봐</p>
          {situations.map((s) => (
            <button key={s.id} onClick={() => { setPicked(s); setCtx(""); }}
              className="w-full text-left rounded-2xl p-4 bg-cream-warm border border-lilac-mid/20 hover:border-lilac-deep/40 transition-colors flex items-start gap-3">
              <span className="text-2xl shrink-0">{s.emoji}</span>
              <span className="min-w-0">
                <span className="block font-bold text-eye-purple">{s.label}</span>
                <span className="block text-[13px] text-text-light mt-0.5">{s.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const isCustom = picked.id === "custom";
  return (
    <section className="animate-fade-in">
      <header className="sticky top-0 z-10 bg-gradient-to-br from-night to-night-deep px-4 py-3 flex items-center gap-2">
        <button onClick={() => setPicked(null)} className="text-lilac text-sm" aria-label="뒤로">‹ 뒤로</button>
        <h1 className="flex-1 text-center text-cream-warm font-display text-lg">{picked.emoji} {picked.label}</h1>
        <span className="w-12" />
      </header>
      <div className="bg-cream rounded-t-3xl min-h-[70dvh] p-4">
        <p className="text-eye-purple font-medium mb-2">{picked.contextPrompt}</p>
        <textarea value={ctx} onChange={(e) => setCtx(e.target.value.slice(0, 500))}
          placeholder={isCustom ? "상황을 적어줘 (예: 며칠째 답이 뜸해진 썸)" : "한 줄만 적어도 좋아 (건너뛰기 OK)"} rows={4}
          className="w-full rounded-xl border border-lilac-mid/30 p-3 text-eye-purple resize-none focus:border-lilac-deep outline-none" />
        <div className="mt-4 flex flex-col gap-2">
          <button onClick={() => onPick(picked.id, ctx.trim())} disabled={isCustom && !ctx.trim()}
            className="w-full rounded-xl py-3 bg-lilac-deep text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">시작하기</button>
          {!isCustom && (
            <button onClick={() => onPick(picked.id, "")} className="w-full rounded-xl py-2.5 text-text-light text-sm">건너뛰고 바로 시작</button>
          )}
          {isCustom && !ctx.trim() && <p className="text-xs text-text-light text-center">직접 쓰기는 상황을 한 줄이라도 적어줘</p>}
        </div>
      </div>
    </section>
  );
}
