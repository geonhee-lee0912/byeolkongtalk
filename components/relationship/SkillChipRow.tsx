"use client";

// 헤더 아래 스킬 실행 칩 — tarot_draw/compat 은 실제 실행, dialogue(verdict) 는 다음 태스크까지 "준비 중" 토스트.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { listActiveSkills, type RelationshipSkill } from "@/lib/relationship/skills";
import { REL_SKILL_KEY } from "@/lib/relationship/types";

const VERDICT_PLACEHOLDER_MSG = "이 스킬은 곧 열려요 — 준비 중이야";
const PARTNER_BIRTH_MSG = "상대 생년월일을 먼저 등록해줘";
const PASS_REQUIRED_MSG = "패스가 필요해 — 먼저 패스를 확인해줘";
const GENERIC_ERROR_MSG = "지금은 실행할 수 없어. 잠시 후 다시 시도해줄래?";
const NETWORK_ERROR_MSG = "연결이 흔들렸어. 잠시 후 다시 시도해줄래?";

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
  const router = useRouter();
  const skills = listActiveSkills();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  if (skills.length === 0) return null;

  const launchTarotDraw = (skill: RelationshipSkill) => {
    if (!skill.spread) return;
    sessionStorage.setItem(
      REL_SKILL_KEY,
      JSON.stringify({ relationshipId, skillKey: skill.key, spread: skill.spread })
    );
    router.push("/tarot/draw");
  };

  const launchCompat = async (skill: RelationshipSkill) => {
    if (inFlightRef.current) return;
    if (skill.requiresPartnerBirth && !partnerProfileId) {
      setToastMsg(PARTNER_BIRTH_MSG);
      return;
    }
    inFlightRef.current = true;
    setBusyKey(skill.key);
    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "compat",
          profileA: selfProfileId,
          profileB: partnerProfileId,
          relationshipId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        if (data?.code === "INSUFFICIENT_STARS") {
          router.push("/shop");
        } else {
          setToastMsg(PASS_REQUIRED_MSG);
        }
        return;
      }
      if (!res.ok) {
        setToastMsg(GENERIC_ERROR_MSG);
        return;
      }
      // 생성 시점에 이미 별이 차감됨 — 헤더 잔액 즉시 갱신 (기존 궁합 플로우와 동일)
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      router.push(`/fortune/result?id=${data.id}`);
    } catch {
      setToastMsg(NETWORK_ERROR_MSG);
    } finally {
      inFlightRef.current = false;
      setBusyKey(null);
    }
  };

  const handleTap = (skill: RelationshipSkill) => {
    if (busyKey) return;
    if (skill.kind === "tarot_draw") {
      launchTarotDraw(skill);
      return;
    }
    if (skill.kind === "compat") {
      void launchCompat(skill);
      return;
    }
    // dialogue(verdict) — 다음 태스크에서 실제 실행 연결
    setToastMsg(VERDICT_PLACEHOLDER_MSG);
  };

  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {skills.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => handleTap(s)}
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
