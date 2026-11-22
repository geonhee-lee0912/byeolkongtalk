"use client";

import { useEffect } from "react";
import { CLARIFIER_COST } from "@/lib/upsell";
import OfferCard from "@/components/reco/OfferCard";

export type ClarifierChipState = "idle" | "done";

interface Props {
  state: ClarifierChipState;
  onTap: () => void;
  /** 노출 계측 — 마운트 1회 */
  onShown?: () => void;
  /** 잠금 — 답이 출력되는 동안·다른 구매 중엔 못 누른다(문구는 그대로 두고 흐리게만) */
  disabled?: boolean;
}

/**
 * 인챗 업셀 — 보조 카드 한 장 더 뽑기 칩.
 * RECO:tarot:clarifier 마커가 붙은 메시지 바로 아래에 렌더.
 */
export default function ClarifierChip({ state, onTap, onShown, disabled }: Props) {
  const done = state === "done";

  // 노출 계측 — 마운트 1회, 아직 안 산(idle) 칩만. 리딩·상품·지면 단위 dedup 은 부모가 한다
  useEffect(() => {
    if (state === "idle") onShown?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모양은 대화 속 제안 카드 하나로(OfferCard — 디자인 다듬기 묶음 2 대화 속 칩 A안, 운영자 11-15)
  return (
    <OfferCard
      icon={{ src: "/icons/fortune/tarot_counsel.webp" }}
      title={done ? "카드를 이어서 봤어" : "카드 한 장 더 뽑기"}
      badge={`별 ${CLARIFIER_COST}`}
      sub={done ? "지금 카드들과 같이 보고 있어" : "지금 카드들과 이어서 봐줄게"}
      onTap={onTap}
      disabled={disabled}
      done={done}
    />
  );
}
