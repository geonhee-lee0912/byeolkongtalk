"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";

// 뽑은 카드 공개 — 타로 로그인 전 맛보기(스펙 2026-10-11-타로-로그인전-맛보기 §3 ③).
// 앞면·자리 이름·카드 이름·정/역만 보여 주고 의미는 숨긴다(궁금증 유지).
// 공개 애니메이션이 끝나면 onRevealed 를 한 번 부른다 — 뽑기 화면이 그때 로그인 창을 올리거나(새로 뽑은 판) 이어 간다(복원한 판).
const STEP_MS = 180;
const revealDoneMs = (count: number) => 700 + STEP_MS * count;

export default function CardReveal({
  drawn,
  accent,
  onRevealed,
}: {
  drawn: DrawnCard[];
  accent: string;
  onRevealed: () => void;
}) {
  // 최신 콜백 — 타이머는 마운트 때 한 번 걸고, 부를 땐 가장 최근 렌더의 콜백(최신 상태)을 부른다
  const cbRef = useRef(onRevealed);
  useEffect(() => {
    cbRef.current = onRevealed;
  });
  useEffect(() => {
    const t = setTimeout(() => cbRef.current(), revealDoneMs(drawn.length));
    return () => clearTimeout(t);
  }, [drawn.length]);

  const width = drawn.length === 1 ? "w-40" : drawn.length <= 3 ? "w-[30%]" : "w-[22%]";

  return (
    <div className="w-full flex flex-col items-center">
      <p className="font-display text-[18px] text-eye-purple text-center mb-5">네가 뽑은 카드야</p>
      <div className="w-full flex flex-wrap justify-center gap-3">
        {drawn.map((d, i) => {
          const card = getCard(d.card_id);
          const reversed = d.direction === "reversed";
          return (
            <div
              key={d.position}
              className={`${width} flex flex-col items-center animate-fade-in`}
              style={{ animationDelay: `${i * STEP_MS}ms`, animationFillMode: "both" }}
            >
              <p className="mb-1 text-[10px] font-bold text-center leading-tight" style={{ color: accent }}>
                {d.label}
              </p>
              <div
                className="relative w-full aspect-[2/3] rounded-lg overflow-hidden border-2 shadow-md"
                style={{ borderColor: accent }}
              >
                <Image
                  src={getCardImagePath(d.card_id)}
                  alt={card?.name_kr ?? "타로 카드"}
                  fill
                  sizes="(max-width: 448px) 40vw, 180px"
                  className="object-cover"
                  style={reversed ? { transform: "rotate(180deg)" } : undefined}
                />
              </div>
              <p className="mt-1.5 text-[12px] font-bold text-eye-purple text-center leading-tight">
                {card?.name_kr ?? ""}
              </p>
              <p className="text-[10.5px] text-text-light text-center leading-tight">
                {reversed ? "역방향" : "정방향"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
