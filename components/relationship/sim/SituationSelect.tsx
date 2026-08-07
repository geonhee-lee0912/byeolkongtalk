"use client";
import { useState } from "react";
import { getSituations, type SimSituation } from "@/lib/relationship/situations";
import type { RelationshipStatus } from "@/lib/relationship/types";
import StageFrame from "./StageFrame";

// 관계 칩 — 짧은 라벨 + 대표 이모지. 순서는 내 관계를 맨 앞으로(chipOrder).
const ALL_STATUSES: RelationshipStatus[] = ["crush", "dating", "onesided", "breakup"];
const CHIP: Record<RelationshipStatus, { label: string; emoji: string }> = {
  crush: { label: "썸", emoji: "💗" },
  dating: { label: "연애", emoji: "💞" },
  onesided: { label: "짝사랑", emoji: "🌱" },
  breakup: { label: "이별", emoji: "🥀" },
};

interface Props {
  status: RelationshipStatus;
  partnerLabel: string;
  onPick: (situationId: string, userContext: string) => void;
  onClose: () => void;
}

export default function SituationSelect({ status, onPick, onClose }: Props) {
  // 칩 순서 = 내 관계 맨 앞 + 나머지 원래 순서. 기본 선택도 내 관계.
  const chipOrder: RelationshipStatus[] = [status, ...ALL_STATUSES.filter((s) => s !== status)];
  const [chip, setChip] = useState<RelationshipStatus>(status);
  const [picked, setPicked] = useState<SimSituation | null>(null);
  const [ctx, setCtx] = useState("");

  // 선택 관계의 상황 2개 + 직접쓰기(custom은 "any"라 모든 관계 목록에 포함 = 모든 칩에 직접 입력).
  const situations = getSituations(chip);

  if (!picked) {
    return (
      <StageFrame>
        <div className="px-6 pt-5 pb-10 animate-fade-in">
          <header className="flex items-center gap-2 mb-6">
            <button onClick={onClose} className="text-lilac-soft/80 text-sm" aria-label="닫기">‹ 나가기</button>
            <h1 className="flex-1 text-center text-cream-warm font-display text-lg">어떤 상황을 연습해볼까?</h1>
            <span className="w-12" />
          </header>

          {/* 관계 칩 — 내 관계 맨 앞·기본 선택, 탭하면 그 관계 목록으로 교체 */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
            {chipOrder.map((s) => {
              const active = s === chip;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setChip(s)}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    active
                      ? "bg-gold text-night-deep"
                      : "bg-cream-warm/10 text-lilac-soft border border-lilac/25"
                  }`}
                >
                  {CHIP[s].emoji} {CHIP[s].label}
                </button>
              );
            })}
          </div>

          {/* 선택 관계 상황 목록 + 직접쓰기(항상 마지막) */}
          <div className="flex flex-col gap-3">
            {situations.map((s) => {
              const isCustom = s.id === "custom";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setPicked(s);
                    setCtx("");
                  }}
                  className={`w-full text-left rounded-2xl p-4 border transition-colors flex items-start gap-3 ${
                    isCustom
                      ? "bg-cream-warm/[0.05] border-dashed border-lilac/30 hover:border-gold/40"
                      : "bg-cream-warm/[0.07] border-lilac/20 hover:border-gold/40"
                  }`}
                >
                  <span className="text-2xl shrink-0">{s.emoji}</span>
                  <span className="min-w-0">
                    <span className="block font-bold text-cream-warm">{s.label}</span>
                    <span className="block text-[13px] text-lilac-soft/70 mt-0.5">{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </StageFrame>
    );
  }

  // ①-b 라이트 컨텍스트 입력 — 카드/직접쓰기 선택 후.
  const isCustom = picked.id === "custom";
  return (
    <StageFrame>
      <div className="px-6 pt-5 pb-10 animate-fade-in">
        <header className="flex items-center gap-2 mb-6">
          <button onClick={() => setPicked(null)} className="text-lilac-soft/80 text-sm" aria-label="뒤로">‹ 뒤로</button>
          <h1 className="flex-1 text-center text-cream-warm font-display text-lg">
            {picked.emoji} {picked.label}
          </h1>
          <span className="w-12" />
        </header>
        <p className="text-cream-warm font-medium mb-2">{picked.contextPrompt}</p>
        <textarea
          value={ctx}
          onChange={(e) => setCtx(e.target.value.slice(0, 500))}
          placeholder={isCustom ? "상황을 적어줘 (예: 며칠째 답이 뜸해진 썸)" : "한 줄만 적어도 좋아 (건너뛰기 OK)"}
          rows={4}
          className="w-full rounded-xl bg-cream-warm/10 border border-lilac/30 p-3 text-cream-warm placeholder:text-lilac-soft/40 resize-none focus:border-gold/50 outline-none"
        />
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => onPick(picked.id, ctx.trim())}
            disabled={isCustom && !ctx.trim()}
            className="w-full rounded-xl py-3 bg-gold text-night-deep font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            시작하기
          </button>
          {!isCustom && (
            <button onClick={() => onPick(picked.id, "")} className="w-full rounded-xl py-2.5 text-lilac-soft/70 text-sm">
              건너뛰고 바로 시작
            </button>
          )}
          {isCustom && !ctx.trim() && (
            <p className="text-xs text-lilac-soft/60 text-center">직접 쓰기는 상황을 한 줄이라도 적어줘</p>
          )}
        </div>
      </div>
    </StageFrame>
  );
}
