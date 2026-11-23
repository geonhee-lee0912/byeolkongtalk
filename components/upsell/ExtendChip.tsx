"use client";

import { useEffect } from "react";
import { EXTEND_COST, EXTEND_TURNS } from "@/lib/upsell";
import Icon from "@/components/common/Icon";
import OfferCard from "@/components/reco/OfferCard";

export type ExtendChipState = "idle" | "loading" | "done";

interface Props {
  state: ExtendChipState;
  onTap: () => void;
  /** 노출 계측 — 마운트 1회 */
  onShown?: () => void;
  /** 잠금 — 답이 출력되는 동안·다른 구매 중엔 못 누른다(문구는 그대로 두고 흐리게만) */
  disabled?: boolean;
}

/**
 * 인챗 업셀 — 대화 연장 칩.
 * RECO:extend 마커가 붙은 메시지 바로 아래에 렌더.
 */
export default function ExtendChip({ state, onTap, onShown, disabled }: Props) {
  const done = state === "done";
  const loading = state === "loading";

  // 노출 계측 — 마운트 1회, 아직 안 산(idle) 칩만. 리딩·상품·지면 단위 dedup 은 부모가 한다
  useEffect(() => {
    if (state === "idle") onShown?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모양은 대화 속 제안 카드 하나로(OfferCard — 디자인 다듬기 묶음 2 대화 속 칩 A안, 운영자 11-15)
  return (
    <OfferCard
      icon={{ node: <Icon name="bubble" size={22} /> }}
      title={done ? "이어가는 중" : loading ? "처리 중…" : "별콩이랑 더 얘기하기"}
      badge={`별 ${EXTEND_COST}`}
      sub={done ? `${EXTEND_TURNS}번 더 이야기할 수 있어` : `지금 대화 그대로 ${EXTEND_TURNS}번 더 이어서`}
      onTap={onTap}
      disabled={disabled || loading}
      done={done}
    />
  );
}
