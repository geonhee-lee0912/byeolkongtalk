"use client";

// lib/relationship/useSkillLaunch.ts — 스킬 실행 공용 launcher.
// 스킬 시트(⚡ 입력창)와 ThreadChat([SKILL:key] 마커 칩) 양쪽에서 재사용 —
// kind별 실행 경로(tarot_draw/compat/dialogue)를 여기 한 곳에서 관리.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSkill, type RelationshipSkill } from "./skills";
import { REL_SKILL_KEY } from "./types";

const PARTNER_BIRTH_MSG = "상대 생년월일을 먼저 등록해줘";
const PASS_REQUIRED_MSG = "패스가 필요해 — 먼저 패스를 확인해줘";
const GENERIC_ERROR_MSG = "지금은 실행할 수 없어. 잠시 후 다시 시도해줄래?";
const NETWORK_ERROR_MSG = "연결이 흔들렸어. 잠시 후 다시 시도해줄래?";

export interface UseSkillLaunchArgs {
  relationshipId: string;
  selfProfileId: string | null;
  partnerProfileId: string | null;
}

export interface UseSkillLaunchResult {
  /** skillKey 로 실행 (kind 별 분기는 내부에서). */
  launch: (skillKey: string) => void;
  /** 지금 실행 중인 스킬 key (compat/dialogue 는 네트워크 왕복 있음). */
  busyKey: string | null;
  /** 에러/안내 토스트 메시지 (2.2s 후 자동 소멸). */
  toastMsg: string | null;
}

export function useSkillLaunch({
  relationshipId,
  selfProfileId,
  partnerProfileId,
}: UseSkillLaunchArgs): UseSkillLaunchResult {
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const launchTarotDraw = (skill: RelationshipSkill) => {
    if (!skill.spread) return;
    sessionStorage.setItem(
      REL_SKILL_KEY,
      JSON.stringify({ relationshipId, skillKey: skill.key, spread: skill.spread })
    );
    router.push("/tarot/draw");
  };

  const launchCompat = async (skill: RelationshipSkill) => {
    if (skill.requiresPartnerBirth && !partnerProfileId) {
      setToastMsg(PARTNER_BIRTH_MSG);
      return;
    }
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
      setBusyKey(null);
    }
  };

  const launchDialogue = async (skill: RelationshipSkill) => {
    setBusyKey(skill.key);
    try {
      const res = await fetch("/api/relationship/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId }),
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
      // 생성 시점에 이미 별이 차감됨 — 헤더 잔액 즉시 갱신 (compat 플로우와 동일)
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      router.push(`/relationship/verdict/${data.id}`);
    } catch {
      setToastMsg(NETWORK_ERROR_MSG);
    } finally {
      setBusyKey(null);
    }
  };

  const launch = (skillKey: string) => {
    if (inFlightRef.current || busyKey) return;
    const skill = getSkill(skillKey);
    if (!skill || !skill.active) {
      setToastMsg(GENERIC_ERROR_MSG);
      return;
    }
    if (skill.kind === "tarot_draw") {
      launchTarotDraw(skill);
      return;
    }
    inFlightRef.current = true;
    const done = () => {
      inFlightRef.current = false;
    };
    if (skill.kind === "compat") {
      void launchCompat(skill).finally(done);
      return;
    }
    if (skill.kind === "dialogue") {
      void launchDialogue(skill).finally(done);
      return;
    }
    done();
  };

  return { launch, busyKey, toastMsg };
}
