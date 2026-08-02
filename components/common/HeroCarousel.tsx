"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Card = {
  img: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
};

// 캐러셀 카드 인벤토리 (T1 IA 확정: 소개·첫충전·궁합·시뮬·설문·패스).
// 첫 카드(소개)는 신규 유저용. 실제 서버 상태별 첫 카드 결정은 구현 시 배선.
const CARDS: Card[] = [
  { img: "/carousel/intro.png", title: "별콩이는 처음이지?", desc: "타로와 사주로 마음의 흐름을 읽어줄게", cta: "시작하기", href: "/concern" },
  { img: "/carousel/charge.png", title: "첫 충전엔 20% 더", desc: "지금 충전하면 별을 더 얹어줘", cta: "충전하기", href: "/shop" },
  { img: "/carousel/gonghap.png", title: "우리의 사주 궁합은?", desc: "두 사람 생년월일로 보는 인연", cta: "궁합 보기", href: "/fortune/compat" },
  { img: "/carousel/sim.png", title: "연애 시뮬레이션!", desc: "그 사람과의 여러 상황을 돌려봐", cta: "시작하기", href: "/relationship" },
  { img: "/carousel/survey.png", title: "별콩톡 설문조사", desc: "내 이야기를 들려주면 별콩별을 줄게", cta: "참여하기", href: "#" },
  { img: "/carousel/pass.png", title: "별콩이와 연애 상담", desc: "별콩이가 너를 계속 기억해줄게", cta: "보러가기", href: "/shop" },
];

const BAR = "rgba(255,248,240,0.6)"; // 하단 솔리드 바 (전 카드 크림 통일)
const TITLE = "#5A3E8C"; // eye-purple
const DESC = "#7A6BA0"; // text-light

const chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export default function HeroCarousel() {
  const [i, setI] = useState(0);
  const card = CARDS[i];
  const go = (d: number) => setI((prev) => (prev + d + CARDS.length) % CARDS.length);

  return (
    <section id="hero-carousel" className="w-full max-w-md mx-auto px-4 pt-4">
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: 260 }}>
        <Image
          key={card.img}
          src={card.img}
          alt=""
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-cover"
          priority
          unoptimized
        />

        {/* 바: 좌우·하단으로 16px 오버행(-inset-x-4/-bottom-4) → rounded 클리핑 곡선까지 채움.
            높이는 콘텐츠 기반(pb-7 = 보이는 12px + 클리핑되는 16px). */}
        <Link
          href={card.href}
          className="absolute -inset-x-4 -bottom-4 top-auto flex items-center justify-between gap-3 px-8 pt-3 pb-7"
          style={{ background: BAR }}
        >
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight" style={{ color: TITLE }}>
              {card.title}
            </p>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: DESC }}>
              {card.desc}
            </p>
          </div>
          <span className="shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-bold text-white" style={{ background: "#9F8AD0" }}>
            {card.cta}
          </span>
        </Link>

        <button
          onClick={() => go(-1)}
          aria-label="이전 배너"
          className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/55 text-eye-purple shadow-sm backdrop-blur-sm active:scale-95"
        >
          {chevron}
        </button>
        <button
          onClick={() => go(1)}
          aria-label="다음 배너"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 rotate-180 items-center justify-center rounded-full bg-white/55 text-eye-purple shadow-sm backdrop-blur-sm active:scale-95"
        >
          {chevron}
        </button>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {CARDS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            aria-label={`${idx + 1}번 배너로 이동`}
            className={
              idx === i
                ? "h-1.5 w-4 rounded-full bg-lilac-deep transition-all"
                : "h-1.5 w-1.5 rounded-full bg-lilac transition-all"
            }
          />
        ))}
      </div>
    </section>
  );
}
