// 사주 프로필 입력 검증 + DB 행 → SajuInput 변환 (DRY: /api/profiles, /api/readings 공용).
// 🔴 서버 전용 런타임 의존(tyme4ts — calc·canCalcSaju) — 클라이언트는 `import type` 만 쓸 것(값 import 시 번들 ~70KB gzip).

import { calcSaju, canCalcSaju, type SajuInput, type SajuGender, type SajuResult } from "@/lib/saju/calc";
import { isValidBirthDate, isValidBirthTime } from "@/lib/byeoljari/validate";
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
// 생일이 있으면 두 모드 모두 저장 전에 DATE 저장 가능·시각 범위·calcSaju 계산 가능까지 본다(2026-10-02).
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

  // 🔴 저장 전에 "읽을 때 계산되는가"까지 본다. 저장된 행은 GET /api/profiles·별마루·운세가
  //    profileRowToSajuInput → calcSaju 로 다시 계산하는데, tyme4ts 는 없는 날짜에 throw 한다.
  //    예전엔 형식만 보고 저장해 깨진 행이 남았다(relationship 3경로는 조용한 200). 2026-10-02
  if (birthDate !== null) {
    // DATE 컬럼에 들어가는 Y-M-D 인가 — 음력도 그레고리력에 있는 날짜만 저장된다(음력 2/30 → 22008).
    if (!isValidBirthDate(birthDate)) return { error: "invalid_birth_date" };
    // "24:00" 은 정규식을 통과하고 calcSaju 에서 터진다 — 아래 판정이 시각 오류를 날짜 오류로 부르지 않게 먼저.
    if (birthTime !== null && !isValidBirthTime(birthTime)) return { error: "invalid_birth_time" };
    const input = profileRowToSajuInput({
      birth_date: birthDate,
      birth_time: birthTime,
      is_lunar_input: isLunarInput,
      is_leap_month: isLeapMonth,
      gender,
    });
    if (!canCalcSaju(input)) {
      return { error: isLunarInput ? "invalid_lunar_date" : "invalid_birth_date" };
    }
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

// GET 목록용 — 행 하나가 계산에 실패해도(없는 음력 날짜 등) 목록 전체를 500 으로 죽이지 않게.
// 그러면 마이페이지·생일 팝업이 self 를 못 봐 POST→409 루프에 갇힌다. 실패는 error 로 돌려주고, 기록은 호출부 몫.
export function profileRowToSaju(row: {
  birth_date: string | null;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
}): { saju: SajuResult | null; error: Error | null } {
  if (!row.birth_date) return { saju: null, error: null };
  try {
    return { saju: calcSaju(profileRowToSajuInput({ ...row, birth_date: row.birth_date })), error: null };
  } catch (e) {
    return { saju: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
