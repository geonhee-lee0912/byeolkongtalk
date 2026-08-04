// 사주 프로필 입력 검증 + DB 행 → SajuInput 변환 (DRY: /api/profiles, /api/readings 공용).

import type { SajuInput, SajuGender } from "@/lib/saju/calc";
import { MBTI_OPTIONS } from "@/lib/relationship/types";

export const VALID_RELATIONS = ["self", "family", "friend", "partner", "other"] as const;
export const VALID_GENDERS = ["male", "female", "other"] as const;

export type RelationType = (typeof VALID_RELATIONS)[number];

export interface ProfileInput {
  displayName: string;
  relationType: RelationType;
  birthDate: string | null; // YYYY-MM-DD 또는 null(P2: 생일 옵션화)
  birthTime: string | null; // HH:MM 또는 null
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: (typeof VALID_GENDERS)[number];
  mbti: string | null; // MBTI 16 중 하나 또는 null(모름)
  personality: string | null; // 자유서술 ≤500자 또는 null(미입력)
}

// 상담/운세 입력 프로필 검증.
// opts.optionalBirth=true 면 생일(및 부속 필드)이 없어도 통과(P2 우리 사이 프로필). 기본(falsy)은 기존 strict 동작 그대로.
export function validateProfile(
  p: unknown,
  opts?: { optionalBirth?: boolean }
): ProfileInput | { error: string } {
  if (!p || typeof p !== "object") return { error: "profile_required" };
  const x = p as Record<string, unknown>;
  const optionalBirth = opts?.optionalBirth === true;

  if (
    typeof x.displayName !== "string" ||
    x.displayName.length < 1 ||
    x.displayName.length > 50
  )
    return { error: "invalid_display_name" };

  if (
    typeof x.relationType !== "string" ||
    !VALID_RELATIONS.includes(x.relationType as RelationType)
  )
    return { error: "invalid_relation_type" };

  // MBTI(양 모드 공통) — 없음/빈값 → null, 있으면 16개 중 하나여야.
  let mbti: string | null = null;
  if (x.mbti !== null && x.mbti !== undefined && x.mbti !== "") {
    if (typeof x.mbti !== "string" || !(MBTI_OPTIONS as readonly string[]).includes(x.mbti))
      return { error: "invalid_mbti" };
    mbti = x.mbti;
  }

  // 성격 자유서술(양 모드 공통) — 없음/빈값 → null, 있으면 문자열 ≤500자.
  let personality: string | null = null;
  if (x.personality !== null && x.personality !== undefined) {
    if (typeof x.personality !== "string") return { error: "invalid_personality" };
    if (x.personality.length > 500) return { error: "invalid_personality" };
    personality = x.personality.length > 0 ? x.personality : null;
  }

  let birthDate: string | null;
  let birthTime: string | null;
  let isLunarInput: boolean;
  let isLeapMonth: boolean;
  let gender: (typeof VALID_GENDERS)[number];

  if (optionalBirth) {
    // 생일 없이도 프로필 존재 가능(P2). 값이 있으면 형식 검증.
    const hasBirth = x.birthDate !== null && x.birthDate !== undefined && x.birthDate !== "";
    if (hasBirth) {
      if (typeof x.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.birthDate))
        return { error: "invalid_birth_date" };
      birthDate = x.birthDate;
      if (x.birthTime === null || x.birthTime === undefined || x.birthTime === "") {
        birthTime = null;
      } else if (typeof x.birthTime !== "string" || !/^\d{2}:\d{2}$/.test(x.birthTime)) {
        return { error: "invalid_birth_time" };
      } else {
        birthTime = x.birthTime;
      }
    } else {
      birthDate = null;
      birthTime = null; // 생일 없으면 시각도 없음
    }
    isLunarInput = x.isLunarInput === true;
    isLeapMonth = x.isLeapMonth === true;
    if (x.gender === null || x.gender === undefined) {
      gender = "other"; // 미입력 기본값
    } else if (
      typeof x.gender !== "string" ||
      !VALID_GENDERS.includes(x.gender as (typeof VALID_GENDERS)[number])
    ) {
      return { error: "invalid_gender" };
    } else {
      gender = x.gender as (typeof VALID_GENDERS)[number];
    }
  } else {
    // strict — 기존 동작 그대로(생일 필수).
    if (typeof x.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.birthDate))
      return { error: "invalid_birth_date" };
    birthDate = x.birthDate;

    if (
      x.birthTime !== null &&
      (typeof x.birthTime !== "string" || !/^\d{2}:\d{2}$/.test(x.birthTime))
    )
      return { error: "invalid_birth_time" };
    birthTime = x.birthTime as string | null;

    if (typeof x.isLunarInput !== "boolean") return { error: "invalid_lunar_flag" };
    if (typeof x.isLeapMonth !== "boolean") return { error: "invalid_leap_flag" };
    isLunarInput = x.isLunarInput;
    isLeapMonth = x.isLeapMonth;

    if (
      typeof x.gender !== "string" ||
      !VALID_GENDERS.includes(x.gender as (typeof VALID_GENDERS)[number])
    )
      return { error: "invalid_gender" };
    gender = x.gender as (typeof VALID_GENDERS)[number];
  }

  return {
    displayName: x.displayName,
    relationType: x.relationType as RelationType,
    birthDate,
    birthTime,
    isLunarInput,
    isLeapMonth,
    gender,
    mbti,
    personality,
  };
}

// DB user_profiles 행(snake_case birth 필드) → calcSaju 입력
export function profileRowToSajuInput(row: {
  birth_date: string;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
}): SajuInput {
  const hasTime = !!row.birth_time;
  return {
    year: Number(row.birth_date.slice(0, 4)),
    month: Number(row.birth_date.slice(5, 7)),
    day: Number(row.birth_date.slice(8, 10)),
    hour: hasTime ? Number(row.birth_time!.slice(0, 2)) : null,
    minute: hasTime ? Number(row.birth_time!.slice(3, 5)) : null,
    isLunar: row.is_lunar_input,
    isLeapMonth: row.is_leap_month,
    gender: row.gender as SajuGender,
  };
}
