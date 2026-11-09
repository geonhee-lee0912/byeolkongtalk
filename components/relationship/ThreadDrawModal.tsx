"use client";

// 인-스레드 카드뽑기 모달 — 스레드를 떠나지 않고 뽑는 의식을 진행한다.
// 가장자리 여백 + dim 으로 뒤 스레드가 비쳐 "화면 이동이 아님"을 계속 신호한다.
// 셸 패턴(portal·shallow history·ESC·스크롤 잠금)은 components/upsell/ClarifierSheet.tsx 와 동일.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { useOverlayEntry } from "@/components/common/use-overlay-entry";
import { SPREAD_INFO, getPositionLabels, type DrawnCard } from "@/lib/tarot/spreads";
import type { RelationshipSkill } from "@/lib/relationship/skills";

interface Props {
  skill: RelationshipSkill;
  /** 확인 완료 → 카드 제출. 성공하면 부모가 모달을 닫는다(실패 시 열린 채로 카드 보존). */
  onSubmit: (cards: DrawnCard[]) => Promise<boolean>;
  onClose: () => void;
}

export default function ThreadDrawModal({ skill, onSubmit, onClose }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<DrawnCard[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // shallow history — OS/브라우저 뒤로가기로 닫기
  useEffect(() => {
    history.pushState({ sheet: "reldraw" }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC + 배경 스크롤 잠금 — 겹창 스택(모양이 Sheet·Dialog 에 안 맞아 스택만). 뽑기 처리 중엔 ESC 로 안 닫힌다
  useOverlayEntry(() => closeModal(), !submitting, 75);

  function closeModal() {
    if (submitting) return;
    if (history.state?.sheet === "reldraw") history.back();
    else onClose();
  }

  const spread = skill.spread!;
  const info = SPREAD_INFO[spread];
  const labels = getPositionLabels(spread, "love", null);

  const openConfirm = (drawn: DrawnCard[]) => {
    setPending(drawn);
    setError(null);
    setBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        const d = await r.json();
        setBalance(typeof d?.balance === "number" ? d.balance : 0);
      } catch {
        setBalance(0);
      }
    })();
  };

  const confirm = () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setError(null);
    void (async () => {
      const ok = await onSubmit(pending);
      if (!ok) {
        // 실패 — 뽑은 카드를 보존하고 모달을 유지한다(다시 뽑게 하지 않음).
        setSubmitting(false);
        setPending(null);
        setError("시작이 안 됐어. 다시 시도해줄래?");
      }
    })();
  };

  if (typeof document === "undefined") return null;

  // z-75 는 의도적으로 낮다 — 공용 StarConfirmModal(z-80)이 이 위에 떠야 결제 확인 버튼을 누를 수 있다(올리면 구매 차단 재발).
  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-stretch justify-center bg-night/70 backdrop-blur-sm p-3 animate-fade-in"
      // 배경 자체를 눌렀을 때만 — 안에 그리는 별 확인 시트의 클릭이 React 트리로 번져 와도 닫지 않는다
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${skill.label} 카드 뽑기`}
    >
      <div
        className="w-full max-w-md bg-cream rounded-3xl border border-lilac-mid/30 shadow-modal overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-17 font-bold text-eye-purple">
            {skill.label}
          </h2>
          <button
            onClick={closeModal}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light hover:bg-lilac-soft/50"
          >
           
          </button>
        </div>

        {error && (
          <p className="text-12 text-red-500 text-center px-5 mb-2">{error}</p>
        )}

        {submitting ? (
          <div className="py-16 text-center text-text-light text-14">
            별콩이가 카드를 펼치는 중…
          </div>
        ) : (
          <CardDrawRitual
            cardCount={info.cardCount}
            slotLabels={labels}
            accent={info.accent}
            ritualLabel={skill.label}
            completeLabel="이 카드로 볼게"
            onComplete={openConfirm}
          />
        )}
      </div>

      {pending && !submitting && (
        <StarConfirmModal
          spreadLabel={skill.label}
          cost={skill.starCost}
          balance={balance}
          loading={balance === null}
          accent={info.accent}
          surface="relationship_skill"
          onConfirm={confirm}
          onCharge={() => router.push(`/shop?need=${skill.starCost}`)}
          onClose={() => setPending(null)}
        />
      )}
    </div>,
    document.body
  );
}
