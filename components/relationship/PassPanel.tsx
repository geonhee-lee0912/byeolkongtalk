"use client";

import { useState } from "react";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  PASS_PLANS,
  type PassPlan,
} from "@/lib/relationship/types";
import PassConfirmModal from "@/components/relationship/PassConfirmModal";
import Icon from "@/components/common/Icon";

interface PassPanelProps {
  relationshipId: string;
  /** 보유 별 — 넘겨주면 상단에 표기(선택). 없으면 표기 생략. */
  balance?: number;
  onPurchased: () => void;
}

export default function PassPanel({
  relationshipId,
  balance,
  onPurchased,
}: PassPanelProps) {
  // 플랜 탭 시 즉시구매 대신 확인 모달을 먼저 띄운다 — 실제 구매는 모달 안에서.
  const [selectedPlan, setSelectedPlan] = useState<PassPlan | null>(null);

  return (
    <div className="card-inner">
      <div className="flex items-center justify-between mb-3">
        <p className="text-14 font-bold text-eye-purple">패스 선택하기</p>
        {typeof balance === "number" && (
          <span className="text-12 text-text-light">
            <Icon name="star" size={14} className="inline align-[-2px]" />보유 {balance}별
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {PASS_PLANS.map((p) => (
          <button
            key={p.kind}
            type="button"
            onClick={() => setSelectedPlan(p)}
            className="btn btn-secondary btn-md justify-between text-left"
          >
            <span className="text-14 font-bold text-eye-purple">
              {p.label}
            </span>
            <span className="text-14 font-bold text-accent">
              <Icon name="star" size={14} className="inline align-[-2px]" />{p.cost}별
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gold/50 bg-gold-soft/20 p-3">
        <p className="text-12 text-eye-purple leading-relaxed">
          패스가 있는 동안 하루 대략 <b>{DAILY_TURN_CAP}번</b> 대화 · 다 쓰면{" "}
          <b>{EXTEND_COST}별</b>마다 <b>{EXTEND_TURNS}번</b>씩 횟수 제한 없이
          연장 · 매일 자정 초기화
        </p>
      </div>

      {selectedPlan && (
        <PassConfirmModal
          relationshipId={relationshipId}
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onPurchased={() => {
            setSelectedPlan(null);
            onPurchased();
          }}
        />
      )}
    </div>
  );
}
