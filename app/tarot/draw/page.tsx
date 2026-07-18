"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  SPREAD_INFO,
  getPositionLabels,
  EMOTION_TO_CATEGORY,
  type DrawnCard,
  type SpreadType,
} from "@/lib/tarot/spreads";
import {
  TAROT_SPREAD_KEY,
  TAROT_DRAW_KEY,
  type TarotSpreadSelection,
  type TarotDrawResult,
} from "@/lib/tarot/session";
import { getSkill, type RelationshipSkill } from "@/lib/relationship/skills";
import { REL_SKILL_KEY, type RelSkillMarker } from "@/lib/relationship/types";
import ProgressSteps from "@/components/concern/ProgressSteps";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";

// "우리 사이" 스킬(tarot_draw) 드로우의 합성 고민 태그 — 연애 존 태그로 고정(카테고리="love" 기본 라벨셋).
const REL_SKILL_EMOTION = "걔 속마음이 궁금해" as const;

/** rel_skill marker → 레지스트리 조회 + spread 일치 검증. 유효하지 않으면 null(일반 플로우로 폴백). */
function resolveRelSkill(
  marker: RelSkillMarker
): { skill: RelationshipSkill; spreadType: SpreadType } | null {
  const skill = getSkill(marker.skillKey);
  if (!skill || skill.kind !== "tarot_draw" || !skill.spread) return null;
  if (skill.spread !== marker.spread) return null;
  return { skill, spreadType: skill.spread };
}

export default function TarotDrawPage() {
  const router = useRouter();
  const [selection, setSelection] = useState<TarotSpreadSelection | null>(null);
  const [relSkill, setRelSkill] = useState<RelSkillMarker | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pendingDrawn, setPendingDrawn] = useState<DrawnCard[] | null>(null);
  // 별 결제 확인 팝업
  const [showConfirm, setShowConfirm] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  // "우리 사이" 스킬 플로우 — 여기서 직접 reading 생성(POST)까지 하므로 자체 제출/에러 상태 필요
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 선택 정보 로드 — "우리 사이" 스킬 marker 우선, 없으면 기존 /tarot 피커 플로우(변경 없음)
  useEffect(() => {
    const skillRaw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(REL_SKILL_KEY)
        : null;
    if (skillRaw) {
      let marker: RelSkillMarker | null = null;
      try {
        marker = JSON.parse(skillRaw) as RelSkillMarker;
      } catch {
        marker = null;
      }
      const resolved = marker ? resolveRelSkill(marker) : null;
      if (marker && resolved) {
        setRelSkill(marker);
        setSelection({
          spreadType: resolved.spreadType,
          spreadCategory: EMOTION_TO_CATEGORY[REL_SKILL_EMOTION],
          emotion: REL_SKILL_EMOTION,
          concern: `우리 사이 · ${resolved.skill.label}`,
        });
        setMounted(true);
        return;
      }
      // 잘못됐거나 오염된 marker — 정리 후 일반 플로우로 폴백
      sessionStorage.removeItem(REL_SKILL_KEY);
    }

    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(TAROT_SPREAD_KEY)
        : null;
    if (!raw) {
      router.replace("/tarot");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as TarotSpreadSelection;
      setSelection(parsed);
      setMounted(true);
    } catch {
      router.replace("/tarot");
    }
  }, [router]);

  const labels = useMemo(
    () =>
      selection
        ? getPositionLabels(
            selection.spreadType,
            selection.spreadCategory,
            selection.emotion
          )
        : [],
    [selection]
  );

  if (!selection || !mounted) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 섞는 중…</p>
      </main>
    );
  }

  const info = SPREAD_INFO[selection.spreadType];
  const accent = info.accent;
  const cardCount = info.cardCount;
  const spreadType = selection.spreadType;

  // 결제 확인 팝업 열기 + 현재 별 잔액 조회
  const openConfirm = () => {
    setShowConfirm(true);
    setSubmitError(null);
    setBalanceLoading(true);
    setBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance");
        const data = await r.json();
        setBalance(typeof data?.balance === "number" ? data.balance : 0);
      } catch {
        setBalance(0);
      } finally {
        setBalanceLoading(false);
      }
    })();
  };

  const goToReading = () => {
    if (!pendingDrawn) return;

    // "우리 사이" 스킬 플로우 — 여기서 직접 reading 생성(relationshipId+skillKey 태깅) 후
    // /tarot/reading?id= 이어하기 경로로 보낸다(그 경로가 메시지 0개면 첫 풀이를 자동 시작함).
    if (relSkill) {
      if (submitting) return;
      setSubmitting(true);
      setSubmitError(null);
      void (async () => {
        try {
          const r = await fetch("/api/consultations/tarot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spreadType: selection.spreadType,
              spreadCategory: selection.spreadCategory,
              emotion: selection.emotion,
              concern: selection.concern,
              drawnCards: pendingDrawn,
              relationshipId: relSkill.relationshipId,
              skillKey: relSkill.skillKey,
            }),
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            setShowConfirm(false);
            if (data?.code === "LOGIN_REQUIRED") {
              router.push("/login?next=/relationship");
              return;
            }
            if (data?.code === "INSUFFICIENT_STARS") {
              router.push("/shop");
              return;
            }
            setSubmitError(
              data?.error === "pass_required"
                ? "패스가 필요해 — 관계 페이지에서 확인해줄래?"
                : "시작이 안 됐어. 잠시 후 다시 시도해줄래?"
            );
            return;
          }
          const data = await r.json();
          sessionStorage.removeItem(REL_SKILL_KEY);
          router.push(`/tarot/reading?id=${data.id}`);
        } catch {
          setShowConfirm(false);
          setSubmitError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        } finally {
          setSubmitting(false);
        }
      })();
      return;
    }

    // 기존 일반 플로우 — 변경 없음 (sessionStorage 로 넘기고 /tarot/reading 이 직접 POST)
    const payload: TarotDrawResult = { ...selection, drawnCards: pendingDrawn };
    sessionStorage.setItem(TAROT_DRAW_KEY, JSON.stringify(payload));
    router.push("/tarot/reading");
  };

  return (
    <main className="flex flex-1 flex-col items-center w-full">
      {/* 단계 인디케이터 */}
      <div className="mt-14 mb-8">
        <ProgressSteps current={3} />
      </div>

      <CardDrawRitual
        cardCount={cardCount}
        slotLabels={labels}
        accent={accent}
        ritualLabel={info.label}
        completeLabel="고민 상담 시작하기"
        relationshipLayout={spreadType === "relationship_5"}
        backLabel="리딩 방법 선택"
        onBack={() => router.push(relSkill ? "/relationship" : "/tarot")}
        onComplete={(drawn) => {
          setPendingDrawn(drawn);
          openConfirm();
        }}
      />

      {showConfirm && (
        <StarConfirmModal
          spreadLabel={info.label}
          cost={info.starCost}
          balance={balance}
          loading={balanceLoading || submitting}
          accent={accent}
          onConfirm={goToReading}
          onCharge={() => router.push("/shop")}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {submitError &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-24 inset-x-0 z-[90] flex justify-center px-8 pointer-events-none">
            <div className="max-w-xs text-center bg-night/90 text-cream text-[12.5px] rounded-full px-4 py-2.5 shadow-lg animate-fade-in">
              {submitError}
            </div>
          </div>,
          document.body
        )}
    </main>
  );
}
