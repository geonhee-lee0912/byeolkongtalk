import Image from "next/image";
import {
  type FortuneType,
  fortuneTypeFromTag,
} from "@/lib/fortune/types";

// 아이콘 webp 가 있는 운세 종류 (public/icons/fortune/*.webp).
// 진열되는 종은 전부 보유. 진열 빠진 tarot_* 는 타로 공용 그림(스펙 2026-11-09 §2.1).
const HAS_ICON: readonly FortuneType[] = [
  // 기존 세트
  "compat",
  "compat_social",
  "saju_full",
  "monthly",
  "good_days",
  "daily",
  // 신규 사주 라인업 15종 (2026-08-30, 마법 도구함 오브제 컨셉)
  "love_self",
  "love_year",
  "marriage",
  "nature_self",
  "talent_path",
  "user_manual",
  "element_balance",
  "life_full",
  "fact_bomb",
  "past_life",
  "saju_report_card",
  "life_graph",
  "wealth_vessel",
  "wealth_year",
  "career_timing",
];

/** 운세 종류 아이콘 — 전 지면 공통. 이모지는 쓰지 않는다. */
export function FortuneIcon({
  type,
  size,
  className,
}: {
  type: FortuneType | null;
  size: number;
  className?: string;
}) {
  const src = !type
    ? "/icons/fortune/tarot_counsel.webp"
    : HAS_ICON.includes(type)
      ? `/icons/fortune/${type}.webp`
      : "/icons/fortune/tarot_daily.webp";
  return <Image src={src} alt="" width={size} height={size} className={className ?? "object-contain"} />;
}

/** emotion_tag 센티넬로부터 아이콘 렌더 (보관함·생성목록 등에서 사용). */
export function FortuneIconByTag({
  emotionTag,
  size,
  className,
}: {
  emotionTag: string | null | undefined;
  size: number;
  className?: string;
}) {
  return (
    <FortuneIcon
      type={fortuneTypeFromTag(emotionTag)}
      size={size}
      className={className}
    />
  );
}
