"use client";

// 인챗 인라인 추천 카드 — assistant 말풍선 아래 붙는 다른 상품 추천(사주·타로 관계 카드).
// `continue` product는 이 컴포넌트를 사용하지 않음 (호출측에서 필터).
// 모양은 대화 속 제안 카드 하나로(OfferCard — 디자인 다듬기 묶음 2 대화 속 칩 A안, 운영자 11-15)
import type { RecoProduct } from "@/lib/reco-utils";
import { RECO_DISPLAY } from "@/lib/reco-utils";
import OfferCard from "./OfferCard";
import Icon from "@/components/common/Icon";

interface Props {
  product: RecoProduct;
  onTap: () => void;
}

export default function RecoInlineCard({ product, onTap }: Props) {
  const display = RECO_DISPLAY[product];
  // 방어: enum 밖 product 가 어떤 경로로든 새어들어와도 화면 전체를 죽이지 않는다.
  if (!display) return null;

  return (
    <OfferCard
      icon={display.iconSrc ? { src: display.iconSrc } : { node: <Icon name="sparkle" size={22} /> }}
      title={display.cardTitle ?? display.label}
      badge={display.target === "saju" ? "사주" : display.target === "tarot" ? "타로" : undefined}
      sub="이 고민 그대로 이어서 봐"
      onTap={onTap}
    />
  );
}
