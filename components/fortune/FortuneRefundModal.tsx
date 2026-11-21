"use client";

// 생성 오류로 별이 차감됐다 환불된 상황 안내 — 확인 버튼을 누를 때까지 유지(배경 클릭으로 안 닫힘).

import { useEffect, useState } from "react";
import Sheet from "@/components/common/Sheet";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";

export interface FortuneRefundModalProps {
  cost: number;
  label: string;
  onClose: () => void;
}

export default function FortuneRefundModal({ cost, label, onClose }: FortuneRefundModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Sheet label={`${label} 리포트 환불 안내`} onClose={onClose} dismissible={false} z={80}>
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative w-12 h-12 mb-2">
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profile.png" alt="별콩이" className="relative w-full h-full object-contain" />
          </div>
          {/* 제목에 상품 이름을 빼 한 줄로(디자인 다듬기 환불 창 F1, 운영자 11-21) — '이번달 어떤 일들이?'처럼 물음표 이름이면
              문장이 깨지고 두 줄로 넘어갔다. 어떤 상품이었는지는 뒤 화면에 보인다(창 이름 label 에는 남겨 둔다) */}
          <p className="font-display text-17 text-eye-purple leading-tight">
            앗, 리포트를 만들다 문제가 생겼어
          </p>
          <p className="text-13 text-text-light mt-2 leading-relaxed">
            쓴 별 <span className="font-bold text-eye-purple">{cost}개</span>는 다시 돌려놨어.
            <br />
            잠시 후 다시 시도해줄래?
          </p>
        </div>

        <OverlayCloseButton
          className="btn btn-primary btn-lg"
        >
          확인
        </OverlayCloseButton>
    </Sheet>
  );
}
