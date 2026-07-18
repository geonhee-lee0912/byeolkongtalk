"use client";

// 헤더 아래 스킬 실행 칩 — 실제 실행은 useSkillLaunch 공용 헬퍼로 위임 (kind별 분기는 그쪽에서).
import { createPortal } from "react-dom";
import { listActiveSkills } from "@/lib/relationship/skills";
import { useSkillLaunch } from "@/lib/relationship/useSkillLaunch";

interface SkillChipRowProps {
  relationshipId: string;
  selfProfileId: string | null;
  partnerProfileId: string | null;
}

export default function SkillChipRow({
  relationshipId,
  selfProfileId,
  partnerProfileId,
}: SkillChipRowProps) {
  const skills = listActiveSkills();
  const { launch, busyKey, toastMsg } = useSkillLaunch({
    relationshipId,
    selfProfileId,
    partnerProfileId,
  });

  if (skills.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {skills.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => launch(s.key)}
            disabled={busyKey === s.key}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-lilac-mid/30 bg-white px-3 py-1.5 whitespace-nowrap active:scale-[0.97] transition disabled:opacity-60"
          >
            <span aria-hidden>{s.emoji}</span>
            <span className="text-[12px] font-bold text-eye-purple">
              {busyKey === s.key ? "여는 중…" : s.label}
            </span>
            <span className="text-[11px] font-bold text-lilac-deep">
              ⭐{s.starCost}
            </span>
          </button>
        ))}
      </div>

      {toastMsg &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-24 inset-x-0 z-[90] flex justify-center px-8 pointer-events-none">
            <div className="max-w-xs text-center bg-night/90 text-cream text-[12.5px] rounded-full px-4 py-2.5 shadow-lg animate-fade-in">
              {toastMsg}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
