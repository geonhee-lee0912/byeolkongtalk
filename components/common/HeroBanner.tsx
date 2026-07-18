"use client";

// 공유 히어로 배너 — HOME(app/page.tsx)의 다크 그라데이션 + 별 파티클 + 캐릭터 히어로를
// 다른 화면 패밀리에서도 재사용하기 위한 일반화 버전. 팔레트는 gradient prop 으로 화면별 주입
// (lib/heroGradients.ts) — HOME과 동일한 톤을 쓰지 않는다.

import Image from "next/image";
import type { ReactNode } from "react";

interface Particle {
  top: string;
  side: "left" | "right";
  offset: string;
  size: string;
  color: string;
  delay: string;
}

// HOME 히어로의 별 파티클 배치를 그대로 재사용(밀도 동일) — 좌표/딜레이 값 재활용.
const PARTICLES: Particle[] = [
  { top: "8%", side: "left", offset: "18%", size: "w-2 h-2", color: "bg-gold", delay: "0s" },
  { top: "14%", side: "right", offset: "14%", size: "w-1.5 h-1.5", color: "bg-gold-soft", delay: "0.4s" },
  { top: "34%", side: "left", offset: "8%", size: "w-1 h-1", color: "bg-white", delay: "0.8s" },
  { top: "24%", side: "right", offset: "9%", size: "w-1 h-1", color: "bg-gold-soft", delay: "1.2s" },
  { top: "58%", side: "right", offset: "22%", size: "w-1.5 h-1.5", color: "bg-gold", delay: "0.6s" },
  { top: "12%", side: "left", offset: "44%", size: "w-1 h-1", color: "bg-white", delay: "1.6s" },
  { top: "20%", side: "left", offset: "30%", size: "w-1.5 h-1.5", color: "bg-white/90", delay: "0.2s" },
  { top: "46%", side: "right", offset: "12%", size: "w-1 h-1", color: "bg-gold", delay: "1.0s" },
  { top: "52%", side: "left", offset: "14%", size: "w-1 h-1", color: "bg-gold-soft", delay: "1.4s" },
  { top: "70%", side: "left", offset: "26%", size: "w-1 h-1", color: "bg-white", delay: "0.5s" },
];

export interface HeroBannerProps {
  image: string;
  imageAlt?: string;
  imageSize?: number;
  title: ReactNode;
  subtitle?: ReactNode;
  /** CSS background 문자열 — 화면 패밀리별 팔레트 (lib/heroGradients.ts) */
  gradient: string;
  className?: string;
  /** 서브페이지용 — 상하 padding 축소 + 타이틀 폰트 소폭 축소 */
  compact?: boolean;
}

export default function HeroBanner({
  image,
  imageAlt = "별콩이",
  imageSize = 120,
  title,
  subtitle,
  gradient,
  className = "",
  compact = false,
}: HeroBannerProps) {
  return (
    <section
      className={`w-full relative overflow-hidden rounded-b-3xl ${className}`}
      style={{ background: gradient }}
    >
      {/* 별 파티클 + 블러 블롭 */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {PARTICLES.map((p, i) => {
          const style: React.CSSProperties = { top: p.top, animationDelay: p.delay };
          if (p.side === "left") style.left = p.offset;
          else style.right = p.offset;
          return (
            <div
              key={i}
              className={`absolute ${p.size} ${p.color} rounded-full animate-star-twinkle`}
              style={style}
            />
          );
        })}
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-16 w-48 h-48 bg-gold/10 rounded-full blur-3xl" />
      </div>

      <div
        className={`max-w-md mx-auto px-5 relative z-10 animate-fade-in flex flex-col items-center ${
          compact ? "pt-8 pb-7" : "pt-14 pb-10"
        }`}
      >
        <div
          className="relative mb-3 animate-float"
          style={{ width: imageSize, height: imageSize }}
        >
          <Image
            src={image}
            alt={imageAlt}
            fill
            sizes={`${imageSize}px`}
            className="object-contain drop-shadow-lg"
          />
        </div>

        <h1
          className={`font-display text-white leading-snug tracking-wide text-center ${
            compact ? "text-[19px]" : "text-[24px]"
          }`}
          style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}
        >
          {title}
        </h1>

        {subtitle && (
          <p className="mt-2 text-[13px] text-white/80 text-center leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
