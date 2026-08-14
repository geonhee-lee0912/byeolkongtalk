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
  // 칩 순서 = 안내('intro') 맨 앞 + 내 관계 + 나머지. 진입 기본은 안내 칩(설명부터 보임).
  const chipOrder: (RelationshipStatus | "intro")[] = ["intro", status, ...ALL_STATUSES.filter((s) => s !== status)];
  const [chip, setChip] = useState<RelationshipStatus | "intro">("intro");
  const [picked, setPicked] = useState<SimSituation | null>(null);
  const [ctx, setCtx] = useState("");

  // 선택 관계의 상황 2개 + 직접쓰기. 안내 칩이면 상황 목록 없음(설명 블록만).
  const situations = chip === "intro" ? [] : getSituations(chip);

  if (!picked) {
    return (
      <StageFrame>
        <div className="px-6 pt-8 pb-10 animate-fade-in">
          <button onClick={onClose} className="text-lilac-soft/60 text-xs mb-2" aria-label="닫기">‹ 나가기</button>
          <h1 className="text-center text-cream-warm font-display text-lg mb-5">어떤 상황을 연습해볼까?</h1>

          {/* 관계 칩 — 내 관계 맨 앞·기본 선택, 탭하면 그 관계 목록으로 교체 */}
          <div className="flex flex-wrap gap-2 mb-5">
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
                  {s === "intro" ? "🎭 이게 뭐야?" : `${CHIP[s].emoji} ${CHIP[s].label}`}
                </button>
              );
            })}
          </div>

          {/* 안내 칩이면 설명(고도화 가이드), 아니면 상황 목록 + 직접쓰기 */}
          {chip === "intro" ? (
            <div className="rounded-2xl bg-cream-warm/[0.07] border border-lilac/20 p-4 text-cream-warm animate-fade-in">
              <p className="font-bold mb-1">🎭 연애 시뮬이 뭐야?</p>
              <p className="text-[13.5px] text-lilac-soft/90 leading-relaxed">
                네가 그린 <b className="text-cream-warm">그 사람 인형</b>과 <b className="text-cream-warm">여러 가지 상황</b>을 미리 연습하는 리허설이야.
                별콩이가 상황을 여럿 준비해두지만, <b className="text-cream-warm">원하면 네가 직접 상황을 적어도 돼!</b>
              </p>
              <p className="text-[13.5px] text-lilac-soft/90 leading-relaxed mt-2">
                인형은 <b className="text-cream-warm">네가 다듬을수록 더 그 사람처럼</b> 돼 — 이렇게 키워:
              </p>
              <ul className="text-[13px] text-lilac-soft/85 leading-relaxed mt-1 space-y-1">
                <li>· 대화 중 인형 대사에 <b className="text-cream-warm">👍 / 👎</b>로 “실제론 이래” 알려주기</li>
                <li>· <b className="text-cream-warm">디브리핑</b>에서 “걔는 사실 이런 사람” 한 줄 적어주기</li>
                <li>· 걔 <b className="text-cream-warm">기본 정보</b>(MBTI·성격)를 프로필에 채워두기</li>
              </ul>
              <p className="text-[13.5px] text-lilac-soft/90 leading-relaxed mt-2">
                안 채워도 쓸 순 있지만, 그만큼 <b className="text-cream-warm">실제 걔와는 많이 달라질 수밖에 없어.</b>{" "}
                몇 판 쌓여야 진짜 걔 같아지니까, <b className="text-gold-soft">처음 몇 판은 무료</b>로 부담 없이 만들어봐.
              </p>
              <button type="button" onClick={() => setChip(status)} className="mt-3 w-full rounded-xl py-2.5 bg-gold text-night-deep font-bold text-sm">
                상황 고르러 가기 →
              </button>
            </div>
          ) : (
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
          )}
        </div>
      </StageFrame>
    );
  }

  // ①-b 라이트 컨텍스트 입력 — 카드/직접쓰기 선택 후.
  const isCustom = picked.id === "custom";
  return (
    <StageFrame>
      <div className="px-6 pt-8 pb-10 animate-fade-in">
        <button onClick={() => setPicked(null)} className="text-lilac-soft/60 text-xs mb-2" aria-label="뒤로">‹ 뒤로</button>
        <h1 className="text-center text-cream-warm font-display text-lg mb-5">
          {picked.emoji} {picked.label}
        </h1>
        <p className="text-cream-warm font-medium mb-2">{picked.contextPrompt}</p>
        <textarea
          value={ctx}
          onChange={(e) => setCtx(e.target.value.slice(0, 500))}
          placeholder={isCustom ? "상황을 적어줘 (예: 며칠째 답이 뜸해진 썸)" : "자세하게 적을수록 정확한 시뮬레이션 상황을 만들 수 있어"}
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
