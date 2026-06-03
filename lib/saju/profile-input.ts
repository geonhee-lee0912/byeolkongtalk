// 사주 프로필 입력 검증 + DB 행 → SajuInput 변환 (DRY: /api/profiles, /api/readings 공용).

import type { SajuInput, SajuGender } from "@/lib/saju/calc";

export const VALID_RELATIONS = ["self", "family", "friend", "partner", "other"] as const;
export const VALID_GENDERS = ["male", "female", "other"] as const;

export type RelationType = (typeof VALID_RELATIONS)[number];

export interface ProfileInput {
  displayName: string;
  relationType: RelationType;
  birthDate: string; // YYYY-MM-DD
  birthTime: string | null; // HH:MM 또는 null
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: (typeof VALID_GENDERS)[number];
}

// 상담/운세 입력 프로필 검증 (기존 readings 라우트와 동작 동일)
export function validateProfile(p: unknown): ProfileInput | { error: string } {
  if (!p || typeof p !== "object") return { error: "profile_required" };
  const x = p as Record<string, unknown>;

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

  if (typeof x.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.birthDate))
    return { error: "invalid_birth_date" };

  if (
    x.birthTime !== null &&
    (typeof x.birthTime !== "string" || !/^\d{2}:\d{2}$/.test(x.birthTime))
  )
    return { error: "invalid_birth_time" };

  if (typeof x.isLunarInput !== "boolean") return { error: "invalid_lunar_flag" };
  if (typeof x.isLeapMonth !== "boolean") return { error: "invalid_leap_flag" };

  if (
    typeof x.gender !== "string" ||
    !VALID_GENDERS.includes(x.gender as (typeof VALID_GENDERS)[number])
  )
    return { error: "invalid_gender" };

  return {
    displayName: x.displayName,
    relationType: x.relationType as RelationType,
    birthDate: x.birthDate,
    birthTime: x.birthTime as string | null,
    isLunarInput: x.isLunarInput,
    isLeapMonth: x.isLeapMonth,
    gender: x.gender as (typeof VALID_GENDERS)[number],
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
