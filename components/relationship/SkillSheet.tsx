"use client";

import Sheet from "@/components/common/Sheet";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
import type { RelationshipSkill } from "@/lib/relationship/skills";

interface SkillSheetProps {
  skills: RelationshipSkill[];
  busyKey: string | null;
  onLaunch: (key: string) => void;
  onClose: () => void;
}

export default function SkillSheet({ skills, busyKey, onLaunch, onClose }: SkillSheetProps) {
  // 포털·배경막·ESC·스크롤 잠금은 공통 Sheet. 웹 손잡이 줄은 web-only — 앱은 Sheet 손잡이
  return (
    <Sheet
      label="이런 것도 꺼내 쓸 수 있어"
      onClose={onClose}
      z={90}
      align="bottom"
      backdropClassName="bg-night/70 backdrop-blur-sm"
      panelClassName="bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-float-up pb-[max(env(safe-area-inset-bottom),16px)]"
    >
        <div className="web-only flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-17 font-bold text-eye-purple">이런 것도 꺼내 쓸 수 있어</h2>
          <OverlayCloseButton
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light hover:bg-lilac-soft/50"
          >
            ✕
          </OverlayCloseButton>
        </div>
        <div className="px-5 pb-2 flex flex-col gap-2">
          {skills.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onLaunch(s.key)}
              disabled={busyKey === s.key}
              className="flex items-center gap-3 rounded-2xl border border-lilac-mid/25 bg-white px-4 py-3 text-left active:scale-[0.99] transition disabled:opacity-60"
            >
              <span className="text-20" aria-hidden>{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-14 font-bold text-eye-purple">
                  {busyKey === s.key ? "여는 중…" : s.label}
                </p>
                <p className="text-12 text-text-light leading-snug">{s.tagline}</p>
              </div>
              <span className="text-12 font-bold text-accent shrink-0">⭐{s.starCost}</span>
            </button>
          ))}
        </div>
    </Sheet>
  );
}
