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
      {/* 흰 카드: 위 그림(200) + 아래 글자 칸 — 글자가 그림 위에 겹치지 않게(디자인 다듬기 ② 운영자 B안 11-12).
          좌우 화살표는 뺐다 — 폰은 밀어 넘기기, 위치는 아래 점. 얇은 배너는 가로 그림을 새로 만든 뒤(ROADMAP 나중) */}
      <div
        className="w-full rounded-2xl overflow-hidden bg-white shadow-card"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative w-full" style={{ height: 200 }}>
          <Image
            key={card.img}
            src={card.img}
            alt=""
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className="object-cover"
            priority
          />
        </div>
        <Link
          href={card.href}
          onClick={() => trackBannerClick(card)}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-15 font-bold leading-tight text-eye-purple">{card.title}</p>
            <p className="mt-1 text-12 leading-snug text-text-light">{card.desc}</p>
          </div>
          <span className="btn btn-primary btn-sm shrink-0">{card.cta}</span>
        </Link>
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
