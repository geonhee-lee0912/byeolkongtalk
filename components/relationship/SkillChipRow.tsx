"use client";

// 헤더 아래 스킬 미리보기 칩 — 실행은 사이클 2c에서. 지금은 탭하면 안내 토스트만.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { listActiveSkills } from "@/lib/relationship/skills";

const PLACEHOLDER_MSG = "이 스킬은 곧 열려요 — 준비 중이야";

export default function SkillChipRow() {
  const skills = listActiveSkills();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 2200);
    return () => clearTimeout(t);
  }, [showToast]);

  if (skills.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {skills.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setShowToast(true)}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-lilac-mid/30 bg-white px-3 py-1.5 whitespace-nowrap active:scale-[0.97] transition"
          >
            <span aria-hidden>{s.emoji}</span>
            <span className="text-[12px] font-bold text-eye-purple">{s.label}</span>
            <span className="text-[11px] font-bold text-lilac-deep">
              ⭐{s.starCost}
            </span>
          </button>
        ))}
      </div>

      {showToast &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-24 inset-x-0 z-[90] flex justify-center px-8 pointer-events-none">
            <div className="max-w-xs text-center bg-night/90 text-cream text-[12.5px] rounded-full px-4 py-2.5 shadow-lg animate-fade-in">
              {PLACEHOLDER_MSG}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
