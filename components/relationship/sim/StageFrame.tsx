"use client";
import type { ReactNode } from "react";

// 시뮬 공통 무대 프레임 — 밤 배경 + 금색 별.
// stage=true(밤 무대·디브리핑): 별 적게 + 달 + 무대 조명(상단 스포트라이트 → 하단 스테이지 플로어·착지 웅덩이).
// stage=false(분류별 목록 = 상황 선택): 조명·달 없이 별만 가득한 밤하늘.
const STARS_STAGE = [
  { top: "7%", left: "14%", s: 2, d: 0 },
  { top: "12%", left: "78%", s: 3, d: 0.5 },
  { top: "20%", left: "40%", s: 2, d: 1 },
  { top: "9%", left: "56%", s: 2, d: 1.4 },
  { top: "26%", left: "22%", s: 2, d: 0.8 },
  { top: "31%", left: "70%", s: 3, d: 1.7 },
  { top: "15%", left: "33%", s: 2, d: 2.1 },
];

const STARS_FIELD = [
  { top: "5%", left: "12%", s: 2, d: 0 },
  { top: "8%", left: "70%", s: 3, d: 0.5 },
  { top: "11%", left: "38%", s: 2, d: 1 },
  { top: "6%", left: "88%", s: 2, d: 1.4 },
  { top: "15%", left: "22%", s: 2, d: 0.3 },
  { top: "18%", left: "58%", s: 3, d: 1.7 },
  { top: "14%", left: "82%", s: 2, d: 2.1 },
  { top: "24%", left: "9%", s: 2, d: 0.8 },
  { top: "27%", left: "44%", s: 2, d: 1.2 },
  { top: "22%", left: "72%", s: 3, d: 0.6 },
  { top: "31%", left: "28%", s: 2, d: 1.9 },
  { top: "35%", left: "62%", s: 2, d: 0.4 },
  { top: "33%", left: "88%", s: 2, d: 1.5 },
  { top: "42%", left: "16%", s: 2, d: 1.1 },
  { top: "45%", left: "50%", s: 2, d: 2.3 },
  { top: "40%", left: "78%", s: 3, d: 0.9 },
  { top: "52%", left: "34%", s: 2, d: 1.6 },
  { top: "55%", left: "68%", s: 2, d: 0.7 },
  { top: "60%", left: "20%", s: 2, d: 2.0 },
  { top: "58%", left: "86%", s: 2, d: 1.3 },
  { top: "68%", left: "44%", s: 2, d: 0.5 },
  { top: "74%", left: "76%", s: 2, d: 1.8 },
  { top: "72%", left: "13%", s: 2, d: 1.0 },
  { top: "82%", left: "56%", s: 2, d: 0.6 },
  { top: "86%", left: "30%", s: 2, d: 2.2 },
  { top: "80%", left: "84%", s: 2, d: 1.4 },
];

export default function StageFrame({
  children,
  className = "",
  stage = false,
}: {
  children: ReactNode;
  className?: string;
  stage?: boolean;
}) {
  const stars = stage ? STARS_STAGE : STARS_FIELD;
  return (
    <div className={`relative min-h-dvh overflow-hidden bg-gradient-to-b from-night to-night-deep ${className}`}>
      {/* 밤하늘 금색 별 */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        {stars.map((p, i) => (
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

      {/* 무대 모드에서만 — 달 + 무대 조명 */}
      {stage && (
        <>
          {/* 상단에서 내려오는 스포트라이트 빛기둥 */}
          <div
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[360px] z-0"
            aria-hidden
            style={{
              background: "linear-gradient(180deg,rgba(255,248,220,0.14),rgba(255,248,220,0.03) 55%,transparent)",
              clipPath: "polygon(38% 0,62% 0,100% 100%,0 100%)",
            }}
          />
          {/* 무대 바닥 — 하단 스테이지 플로어 */}
          <div
            className="pointer-events-none absolute bottom-0 inset-x-0 h-44 z-0"
            aria-hidden
            style={{
              background: "linear-gradient(to top, rgba(159,138,208,0.16), rgba(159,138,208,0.04) 50%, transparent)",
            }}
          />
          {/* 스포트라이트 착지 웅덩이 */}
          <div
            className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 w-[240px] h-9 rounded-[50%] z-0"
            aria-hidden
            style={{ background: "radial-gradient(ellipse, rgba(242,215,138,0.16), transparent 70%)" }}
          />
        </>
      )}

      {/* 콘텐츠 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
