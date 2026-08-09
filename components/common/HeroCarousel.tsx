"use client";

import Image from "next/image";
import Link from "next/link";
import { type TouchEvent, useEffect, useRef, useState } from "react";

type Card = {
  id: string;
  img: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
};

// 캐러셀 카드 인벤토리 (08-02 통합 IA: 소개·첫충전·궁합·시뮬·설문·패스, BANNER_MAX 열어둠).
// 첫 카드만 상태별 결정(신규=intro / 기존=sim). 뒤 카드는 노출 급감이라 순서는 덜 중요.
const CARDS: Card[] = [
  { id: "intro", img: "/carousel/intro.webp", title: "별콩이는 처음이지?", desc: "타로와 사주로 마음의 흐름을 읽어줄게", cta: "시작하기", href: "/concern" },
  { id: "charge", img: "/carousel/charge.webp", title: "첫 충전엔 20% 더", desc: "지금 충전하면 별을 더 얹어줘", cta: "충전하기", href: "/shop" },
  { id: "gonghap", img: "/carousel/gonghap.webp", title: "우리의 사주 궁합은?", desc: "두 사람 생년월일로 보는 인연", cta: "궁합 보기", href: "/fortune/compat" },
  { id: "sim", img: "/carousel/sim.webp", title: "연애 시뮬레이션!", desc: "그 사람과의 여러 상황을 돌려봐", cta: "시작하기", href: "/relationship" },
  { id: "survey", img: "/carousel/survey.webp", title: "별콩톡 설문조사", desc: "내 이야기를 들려주면 별콩별을 줄게", cta: "참여하기", href: "/survey" },
  { id: "pass", img: "/carousel/pass.webp", title: "별콩이와 연애 상담", desc: "별콩이가 너를 계속 기억해줄게", cta: "보러가기", href: "/shop" },
];

// 기존 유저의 첫 카드 시작점(신상품). 첫 카드 이후 노출이 급감하므로 첫 카드가 실질 지렛대.
const SIM_INDEX = CARDS.findIndex((c) => c.id === "sim");

// 클릭 계측 — 목적지에 ?b=<id> 를 붙여 기존 page_views 로 잡는다 (08-02 통합 §1탭)
const bannerHref = (c: Card) => `${c.href}${c.href.includes("?") ? "&" : "?"}b=${c.id}`;

const BAR = "rgba(255,248,240,0.6)"; // 하단 솔리드 바 (전 카드 크림 통일)
const TITLE = "#5A3E8C"; // eye-purple
const DESC = "#7A6BA0"; // text-light

const chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export default function HeroCarousel({ isNewUser }: { isNewUser: boolean | null }) {
  const [i, setI] = useState(0);
  const card = CARDS[i];
  const touched = useRef(false); // 사용자가 캐러셀을 조작하면 자동 첫카드 조정을 멈춘다
  const go = (d: number) => {
    touched.current = true;
    setI((prev) => (prev + d + CARDS.length) % CARDS.length);
  };
  const select = (idx: number) => {
    touched.current = true;
    setI(idx);
  };

  // 기존 유저(이력 있음)는 첫 카드를 신상품(시뮬)으로 — 신규·미조작은 intro 유지 (08-02 통합 §1탭)
  useEffect(() => {
    if (isNewUser === false && !touched.current) setI(SIM_INDEX);
  }, [isNewUser]);

  // 터치 스와이프: 가로 이동이 세로보다 크고 40px 넘을 때만 전환(세로 스크롤·탭과 비충돌)
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  return (
    <section id="hero-carousel" className="w-full max-w-md mx-auto px-4 pt-4">
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{ height: 260 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          key={card.img}
          src={card.img}
          alt=""
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-cover"
          priority
        />

        {/* 바: 좌우·하단으로 16px 오버행(-inset-x-4/-bottom-4) → rounded 클리핑 곡선까지 채움.
            높이는 콘텐츠 기반(pb-7 = 보이는 12px + 클리핑되는 16px). */}
        <Link
          href={bannerHref(card)}
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
            onClick={() => select(idx)}
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
