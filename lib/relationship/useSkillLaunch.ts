"use client";

// lib/relationship/useSkillLaunch.ts — 스킬 실행 공용 launcher.
// 스킬 시트(⚡ 입력창)와 ThreadChat([SKILL:key] 마커 칩) 양쪽에서 재사용 —
// kind별 실행 경로(tarot_draw/compat/dialogue)를 여기 한 곳에서 관리.
// 궁합·판정(즉시 차감)은 실행 전 구매 확인 모달을 거친다(pendingSkill). 카드뽑기는 /tarot/draw가 확인.
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
  /** dialogue 스킬(판정)을 스레드 안에서 개시 — ThreadChat이 skillStart 전송을 담당. */
  onInThreadSkill?: (skillKey: string) => void;
}

export interface UseSkillLaunchResult {
  /** skillKey 로 실행. tarot_draw 는 즉시 이동, compat/dialogue 는 구매 확인 모달을 먼저 연다. */
  launch: (skillKey: string) => void;
  /** 지금 실행 중인 스킬 key (compat/dialogue 는 네트워크 왕복 있음). */
  busyKey: string | null;
  /** 에러/안내 토스트 메시지 (2.2s 후 자동 소멸). */
  toastMsg: string | null;
  /** 구매 확인 대기 중인 스킬 (compat/dialogue). null 이면 모달 닫힘. */
  pendingSkill: RelationshipSkill | null;
  /** 확인 모달용 현재 별 잔액 (조회 전 null). */
  confirmBalance: number | null;
  /** 확인 모달 "확인하고 시작" — 실제 실행. */
  confirmLaunch: () => void;
  /** 확인 모달 취소. */
  cancelConfirm: () => void;
}

export function useSkillLaunch({
  relationshipId,
  selfProfileId,
  partnerProfileId,
  onInThreadSkill,
}: UseSkillLaunchArgs): UseSkillLaunchResult {
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingSkill, setPendingSkill] = useState<RelationshipSkill | null>(null);
  const [confirmBalance, setConfirmBalance] = useState<number | null>(null);
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
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      router.push(`/fortune/result?id=${data.id}`);
    } catch {
      setToastMsg(NETWORK_ERROR_MSG);
    } finally {
      setBusyKey(null);
    }
  };

  // 궁합·판정 구매 확인 모달 열기 + 현재 별 잔액 조회
  const openConfirm = (skill: RelationshipSkill) => {
    setPendingSkill(skill);
    setConfirmBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance");
        const data = await r.json();
        setConfirmBalance(typeof data?.balance === "number" ? data.balance : 0);
      } catch {
        setConfirmBalance(0);
      }
    })();
  };

  const runLaunch = (skill: RelationshipSkill) => {
    if (inFlightRef.current || busyKey) return;
    if (skill.kind === "compat") {
      inFlightRef.current = true;
      void launchCompat(skill).finally(() => {
        inFlightRef.current = false;
      });
    } else if (skill.kind === "dialogue") {
      // 인-스레드 개시 — 별도 페이지/차감 없음. 차감은 chat 라우트(skillStart)가 담당.
      onInThreadSkill?.(skill.key);
      cancelConfirm();
    }
  };

  const launch = (skillKey: string) => {
    if (inFlightRef.current || busyKey || pendingSkill) return;
    const skill = getSkill(skillKey);
    if (!skill || !skill.active) {
      setToastMsg(GENERIC_ERROR_MSG);
      return;
    }
    if (skill.kind === "tarot_draw") {
      launchTarotDraw(skill);
      return;
    }
    // compat 은 상대 생년월일 없으면 확인 모달 열기 전에 안내
    if (skill.kind === "compat" && skill.requiresPartnerBirth && !partnerProfileId) {
      setToastMsg(PARTNER_BIRTH_MSG);
      return;
    }
    // compat/dialogue — 즉시 차감이라 구매 확인 모달 먼저
    openConfirm(skill);
  };

  const confirmLaunch = () => {
    const skill = pendingSkill;
    if (!skill) return;
    // 모달을 닫지 않고 실행 — 차감 요청이 도는 동안 모달이 로딩 상태로 남아 피드백을 준다.
    // 성공 시 라우팅으로 언마운트, 실패 시 토스트와 함께 모달이 다시 상호작용 가능.
    runLaunch(skill);
  };

  const cancelConfirm = () => {
    setPendingSkill(null);
    setConfirmBalance(null);
  };

  return {
    launch,
    busyKey,
    toastMsg,
    pendingSkill,
    confirmBalance,
    confirmLaunch,
    cancelConfirm,
  };
}
