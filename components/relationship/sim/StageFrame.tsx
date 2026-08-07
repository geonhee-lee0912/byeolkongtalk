"use client";
import type { ReactNode } from "react";

// 시뮬 공통 무대 프레임 — 밤 배경 + 커튼(상단 밸런스 + 양옆 드레이프) + 금색 별.
// 상황 선택·밤 무대·디브리핑이 이 프레임을 공유해 "밤에 커튼 친 작은 무대" 세계관으로 이어진다.
// 스포트라이트·조명 웅덩이는 무대(NightStage)가 자체로 얹는다 — 여기선 공통 무대 배경만.
const STARS = [
  { top: "7%", left: "14%", s: 2, d: 0 },
  { top: "12%", left: "80%", s: 3, d: 0.5 },
  { top: "20%", left: "40%", s: 2, d: 1 },
  { top: "9%", left: "58%", s: 2, d: 1.4 },
  { top: "26%", left: "22%", s: 2, d: 0.8 },
  { top: "31%", left: "72%", s: 3, d: 1.7 },
  { top: "17%", left: "90%", s: 2, d: 2.1 },
];

export default function StageFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative min-h-dvh overflow-hidden bg-gradient-to-b from-night to-night-deep ${className}`}>
      {/* 밤하늘 금색 별 */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        {STARS.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-gold-soft animate-star-twinkle"
            style={{
              top: p.top,
              left: p.left,
              width: p.s,
              height: p.s,
              boxShadow: `0 0 ${p.s * 2}px rgba(232,194,106,0.6)`,
              animationDelay: `${p.d}s`,
            }}
          />
        ))}
      </div>

      {/* 상단 커튼 밸런스(주름 봉) */}
      <div
        className="pointer-events-none absolute top-0 inset-x-0 h-5 z-20"
        aria-hidden
        style={{
          background: "repeating-linear-gradient(90deg,#3a2a63 0px,#241a45 7px,#3a2a63 15px)",
          boxShadow: "inset 0 -6px 10px rgba(0,0,0,0.45)",
          borderBottom: "1px solid rgba(232,194,106,0.15)",
        }}
      />
      {/* 양옆 커튼 드레이프(은은) */}
      <div
        className="pointer-events-none absolute top-5 left-0 bottom-0 w-4 z-20 opacity-80"
        aria-hidden
        style={{
          background: "repeating-linear-gradient(90deg,#2f2153 0px,#1c1436 8px,#2f2153 16px)",
          boxShadow: "inset -8px 0 12px rgba(0,0,0,0.4)",
        }}
      />
      <div
        className="pointer-events-none absolute top-5 right-0 bottom-0 w-4 z-20 opacity-80"
        aria-hidden
        style={{
          background: "repeating-linear-gradient(90deg,#1c1436 0px,#2f2153 8px,#1c1436 16px)",
          boxShadow: "inset 8px 0 12px rgba(0,0,0,0.4)",
        }}
      />

      {/* 콘텐츠 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
