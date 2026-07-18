"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { RelationshipSkill } from "@/lib/relationship/skills";

interface SkillSheetProps {
  skills: RelationshipSkill[];
  busyKey: string | null;
  onLaunch: (key: string) => void;
  onClose: () => void;
}

export default function SkillSheet({ skills, busyKey, onLaunch, onClose }: SkillSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="이런 것도 꺼내 쓸 수 있어"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-[16px] font-bold text-eye-purple">이런 것도 꺼내 쓸 수 있어</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
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
              <span className="text-[20px]" aria-hidden>{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-bold text-eye-purple">
                  {busyKey === s.key ? "여는 중…" : s.label}
                </p>
                <p className="text-[11.5px] text-text-light leading-snug">{s.tagline}</p>
              </div>
              <span className="text-[12px] font-bold text-lilac-deep shrink-0">⭐{s.starCost}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
