"use client";

// 사주 상품 설명 페이지 아래 고정 버튼 — 누르면 사주 고르기 페이지(/fortune/[type]/buy).
// 스크롤해도 아래 탭 바로 위에 붙어 있다(/tarot 의 시작 버튼과 같은 방식). 디자인 다듬기 묶음 4 페이지 나누기, 운영자 11-15.
// 계측은 옛 위 버튼과 같은 fortune_landing_cta_clicked.
import Link from "next/link";
import Icon from "@/components/common/Icon";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function LandingBuyBar({
  href,
  cost,
  trackType,
  label = "사주 골라서 보기",
}: {
  href: string;
  /** 없으면 무료 — 사주 MBTI 는 '무료 · 테스트 시작하기'(디자인 다듬기 사주 MBTI ① L1) */
  cost?: number;
  trackType: string;
  /** 궁합은 '두 사람 골라서 보기' */
  label?: string;
}) {
  return (
    <div className="sticky z-30 bottom-[calc(4rem+env(safe-area-inset-bottom))] w-full max-w-md mx-auto mt-8 px-5 py-3 bg-cream shadow-float-up">
      <Link
        href={href}
        onClick={() => trackUiEvent("fortune_landing_cta_clicked", { meta: { type: trackType } })}
        className="btn btn-primary btn-lg"
      >
        {cost === undefined ? (
          <span>무료</span>
        ) : (
          <span className="inline-flex items-center tabular-nums">
            <Icon name="star" size={16} className="mr-0.5" />
            {cost}
          </span>
        )}
        · {label}
      </Link>
    </div>
  );
}
