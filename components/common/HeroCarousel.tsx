"use client";

import Image from "next/image";
import Link from "next/link";
import { type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { type Audience, type Card, visibleCards, startIndex } from "./hero-cards";

const AUTO_MS = 5000; // 자동 넘김 간격
const RESUME_MS = 8000; // 사용자 조작 후 자동 롤링 재개까지 대기

// 클릭 계측 — ui_events 에 banner_clicked{slot} 로 기록한다 (08-02 통합 §1탭).
// 과거 ?b=<id> 를 URL 에 붙였으나 page_views 는 쿼리를 저장하지 않아 DB 에 도달하지 못했다.
// 클릭 자체를 재는 편이 PV 프록시보다 정확하고, 광고 축(utm_content)과도 섞이지 않는다.
const trackBannerClick = (c: Card) => trackUiEvent("banner_clicked", { meta: { slot: c.id } });

const BAR = "rgba(255,248,240,0.6)"; // 하단 솔리드 바 (전 카드 크림 통일)
const TITLE = "#5A3E8C"; // eye-purple
const DESC = "#7A6BA0"; // text-light

const chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export default function HeroCarousel({ audience }: { audience: Audience | null }) {
  const cards = useMemo(() => visibleCards(audience), [audience]);
  const [i, setI] = useState(0);
  const touched = useRef(false); // 사용자가 조작하면 관객별 첫카드 배치를 멈춘다 (영구)
  const lastWasUser = useRef(false); // 직전 카드 변경이 사용자 조작발인지 (자동 틱마다 리셋)
  const card = cards[i] ?? cards[0]; // 관객 축소로 i 가 범위를 벗어나면 첫 카드로 폴백
  const go = (d: number) => {
    touched.current = true;
    lastWasUser.current = true;
    setI((prev) => (prev + d + cards.length) % cards.length);
  };
  const select = (idx: number) => {
    touched.current = true;
    lastWasUser.current = true;
    setI(idx);
  };

  // 관객 확정 시 시작 카드 배치(미조작 한정) + 카드 축소 시 i 클램프
  useEffect(() => {
    if (audience === null) return;
    if (!touched.current) setI(startIndex(audience, cards));
    else setI((prev) => (prev >= cards.length ? cards.length - 1 : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  // 자동 넘김: i 변화에 재무장. 조작발이면 RESUME_MS 후, 자동이면 AUTO_MS 후 다음 카드.
  // prefers-reduced-motion 이거나 카드 1장 이하면 비활성.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (cards.length <= 1) return;
    const delay = lastWasUser.current ? RESUME_MS : AUTO_MS;
    const id = setTimeout(() => {
      lastWasUser.current = false;
      setI((prev) => (prev + 1) % cards.length);
    }, delay);
    return () => clearTimeout(id);
  }, [i, cards.length]);

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
          href={card.href}
          onClick={() => trackBannerClick(card)}
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
        {cards.map((_, idx) => (
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
