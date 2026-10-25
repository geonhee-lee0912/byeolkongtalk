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

  // 2장 이상은 3열 — 풀이 화면(CardSpreadView)과 같은 배치(5장 3+2 · 6장 3+3 · 7장 3+3+1)
  const single = drawn.length === 1;
  const width = single ? "w-40" : "w-[30%]";
  // 위 폭에 맞춘 이미지 sizes(next/image 가 받을 파일 크기를 고른다) — 폭을 바꾸면 같이 고칠 것.
  // 1장 = w-40 = 160px · 2장 이상 = 칸 30% × 뽑기 화면 래퍼의 안쪽 폭(max-w-md 448px − px-5 40px) → 448px 이하 화면에선 30vw − 12px, 그보다 넓으면 122.4px
  const imgSizes = single ? "160px" : "(max-width: 448px) calc(30vw - 12px), 123px";

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
              {/* 같은 줄 칸 중 라벨 한 곳만 두 줄이 되면(360px 폭의 '상처가 드러나는 방식') 그 칸 카드 이미지만 한 줄(≈12px) 내려가 줄이 어긋난다.
                  그래서 라벨 칸이 줄 높이에서 남는 몫을 받고(flex-1) 글자는 카드 쪽에 붙인다(items-end) — 같은 줄 칸은 높이가 같게 늘어나므로 이미지가 한 선에 선다(전체 높이는 그대로).
                  1장은 같은 줄 칸이 없어 달라지지 않는다. break-keep = 한글 단어 중간에서 줄바꿈하지 않는다 */}
              <p
                className="mb-1 flex flex-1 items-end justify-center text-[10px] font-bold text-center leading-tight break-keep"
                style={{ color: accent }}
              >
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
                  sizes={imgSizes}
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
