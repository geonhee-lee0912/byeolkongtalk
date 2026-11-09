"use client";

// 이미 같은 사주로 본 상품을 다시 사려 할 때 — 보관함 유도 + 재생성(force) 선택.
import { useEffect, useState } from "react";
import Sheet from "@/components/common/Sheet";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
import Icon from "@/components/common/Icon";

export default function AlreadyOwnedModal({
  label,
  cost,
  onReview,
  onRegenerate,
  onClose,
}: {
  label: string;
  cost: number;
  onReview: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Sheet label="이미 이 사주로 봤어" onClose={onClose} z={80}>
        <div className="text-center mb-5">
          <p className="font-display text-17 text-eye-purple leading-tight">이미 이 사주로 봤어</p>
          <p className="text-13 text-text-light mt-1.5 leading-relaxed">
            같은 사주로 <b className="text-eye-purple">{label}</b>은(는) 이미 봤어.
            <br />
            보관함에서 다시 볼 수 있어. 새로 뽑으면 별 {cost}개가 다시 들어.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onReview}
            className="btn btn-primary btn-lg"
          >
            보관함에서 보기
          </button>
          <button
            onClick={onRegenerate}
            className="btn btn-text btn-lg"
          >
            그래도 새로 뽑기 · <Icon name="star" size={14} className="inline align-[-2px]" />{cost}
          </button>
          <OverlayCloseButton className="w-full py-2.5 text-13 text-text-light">닫기</OverlayCloseButton>
        </div>
    </Sheet>
  );
}
