import Image from "next/image";
import {
  type FortuneType,
  FORTUNE_CONFIG,
  fortuneTypeFromTag,
} from "@/lib/fortune/types";

// 아이콘 webp 가 있는 운세 종류 (public/icons/fortune/*.webp).
// 진열되는 종은 전부 보유. 비활성 tarot_* 는 이모지 폴백.
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

/** 운세 종류 아이콘 — 전 지면 공통. 아이콘 보유 종은 webp, 그 외는 이모지 폴백. */
export function FortuneIcon({
  type,
  size,
  className,
}: {
  type: FortuneType | null;
  size: number;
  className?: string;
}) {
  if (type && HAS_ICON.includes(type)) {
    return (
      <Image
        src={`/icons/fortune/${type}.webp`}
        alt=""
        width={size}
        height={size}
        className={className ?? "object-contain"}
      />
    );
  }
  return (
    <span aria-hidden style={{ fontSize: Math.round(size * 0.8) }}>
      {type ? FORTUNE_CONFIG[type].emoji : "✨"}
    </span>
  );
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
