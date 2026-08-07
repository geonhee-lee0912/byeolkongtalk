"use client";
// components/relationship/sim/DollPortrait.tsx — 밤 무대 상단 인형 초상(FE5).
// 진입 시 대형(애니메이션 float) → 대화 시작 후 sticky 소형으로 접힘(collapsed). DollAvatar 재사용.
import DollAvatar from "@/components/relationship/DollAvatar";
import type { RelationshipStatus } from "@/lib/relationship/types";

const STARS = [
  { top: "8%", left: "10%", s: 3, d: 0 },
  { top: "14%", left: "82%", s: 2, d: 0.4 },
  { top: "22%", left: "40%", s: 2, d: 0.8 },
  { top: "6%", left: "60%", s: 3, d: 1.2 },
  { top: "30%", left: "18%", s: 2, d: 0.6 },
  { top: "26%", left: "70%", s: 3, d: 1.5 },
];

export function NightStars() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
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
  );
}

interface DollPortraitProps {
  status: RelationshipStatus;
  label: string;
  collapsed: boolean;
}

export default function DollPortrait({ status, label, collapsed }: DollPortraitProps) {
  return (
    <div
      className={
        collapsed
          ? "flex items-center gap-2"
          : "flex flex-col items-center gap-2 py-6 animate-fade-in"
      }
    >
      <div className={collapsed ? "" : "animate-float"}>
        <DollAvatar kind="partner" status={status} name={label} size={collapsed ? 30 : 80} />
      </div>
      {!collapsed && (
        <>
          <span className="text-cream-warm font-bold">{label}</span>
          <span className="text-[12px] text-gold-soft">🌙 마음이 그린 인형</span>
        </>
      )}
      {collapsed && <span className="text-sm text-cream-warm/90">{label}</span>}
    </div>
  );
}
