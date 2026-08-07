"use client";
// components/relationship/sim/DollPortrait.tsx — 밤 무대 상단 인형 초상(FE5).
// 진입 시 대형(애니메이션 float) → 대화 시작 후 sticky 소형으로 접힘(collapsed). DollAvatar 재사용.
import DollAvatar from "@/components/relationship/DollAvatar";
import type { RelationshipStatus } from "@/lib/relationship/types";

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
        <div
          className="pointer-events-none w-[120px] h-5 -mt-1.5 rounded-[50%]"
          aria-hidden
          style={{ background: "radial-gradient(ellipse,rgba(232,194,106,0.3),transparent 70%)" }}
        />
      )}
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
