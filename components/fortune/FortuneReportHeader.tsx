// /fortune 하위 리포트 페이지(사주/궁합/오늘의운세) 공통 헤더.
// 히어로 영역 대신 /shop 페이지 구조를 따른다: 뒤로 버튼 → 별콩이 이미지 → 타이틀/설명
// → (가격 칩) → "사주 고르기" 라벨 디바이더. 아래에 사주 picker 가 이어짐.
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

interface FortuneReportHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** ⭐ 가격 칩 (오늘의운세처럼 자체 상태칩이 있으면 생략) */
  cost?: number;
  /** 디바이더 라벨 (기본 "사주 고르기") */
  dividerLabel?: string;
  /** 뒤로 버튼 목적지 (기본 /fortune 진열대) */
  backHref?: string;
}

export default function FortuneReportHeader({
  title,
  subtitle,
  cost,
  dividerLabel = "사주 고르기",
  backHref = "/fortune",
}: FortuneReportHeaderProps) {
  return (
    <>
      {/* 최상단 — 뒤로 */}
      <div className="w-full max-w-md mx-auto px-5 pt-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="11.5 3 5 9 11.5 15" />
          </svg>
          <span>뒤로</span>
        </Link>
      </div>

      {/* 별콩이 + 타이틀 + 설명 (히어로 대체) */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mt-2 mb-5">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={92}
          height={92}
          priority
          className="drop-shadow-lg"
        />
        <h1 className="font-display text-[22px] text-eye-purple text-center mt-2 tracking-wide leading-snug">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-text-light text-center mt-1 leading-relaxed">
            {subtitle}
          </p>
        )}
        {typeof cost === "number" && (
          <span className="mt-2 inline-flex items-center rounded-full bg-gold-soft/30 px-2.5 py-1 text-[11px] font-bold text-sub-warm">
            ⭐ {cost}별
          </span>
        )}
      </div>

      {/* 디바이더 — 사주 고르기 (별 대신 라벨) */}
      <div className="w-full max-w-md mx-auto px-5 mb-4 flex items-center gap-3">
        <span className="flex-1 h-px bg-lilac-mid/30" />
        <span className="text-[11px] font-bold text-text-light tracking-[0.15em]">
          {dividerLabel}
        </span>
        <span className="flex-1 h-px bg-lilac-mid/30" />
      </div>
    </>
  );
}
