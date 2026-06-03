# 사주 프로필 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `user_profiles`를 영속 정본 저장소로 만들어 계정 사주를 한 번 입력하면 상담/운세에서 자동 로드하고, 마이페이지에서 지인 사주 CRUD를 제공하며, 팔자판을 항상 시주-left로 정렬한다.

**Architecture:** `user_profiles`가 정본(계정 사주 = self/primary 1행, 지인 = 그 외 N행). 상담/운세는 기존 `profile_id`를 재사용해 중복 INSERT를 제거한다. 팔자판은 저장하지 않고 표시 시 서버가 `calcSaju()`로 재계산한다. 신규 `/api/profiles` 라우트가 CRUD를 담당하고, 마이페이지 프로필 카드/지인 목록과 상담 진입 피커가 이를 소비한다.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Supabase (PostgreSQL, dev 브랜치), `lib/saju/calc.ts` (manseryeok 결정적 계산).

**검증 환경 주의:** 이 저장소에는 테스트 러너가 없다. 각 태스크의 검증은 `npx tsc --noEmit` + `npm run build`, UI 태스크는 추가로 dev 서버 수동 확인이다. 표준 TDD(red/green) 대신 컴파일·빌드·수동 확인 게이트를 사용한다.

**배포 주의 (사용자 표준):** 커밋은 명시 요청 시에만. 배포는 `git push origin dev` 후 `git push origin dev:main` fast-forward. 스테이징은 파일명으로 개별 add (`git add .`/`-A` 금지). `.serena/`, `.vercel`, `.gitignore`, 시크릿 제외. dev Supabase만 사용, prod DB 직접 변경 금지.

---

## File Structure

생성:
- `supabase/migrations/20260610000000_readings_profile_set_null.sql` — readings.profile_id FK CASCADE → SET NULL
- `lib/saju/profile-input.ts` — `validateProfile` 추출 + `profileRowToSajuInput` 헬퍼 (DRY)
- `app/api/profiles/route.ts` — GET(목록) / POST(생성)
- `app/api/profiles/[id]/route.ts` — PATCH(수정) / DELETE(삭제)
- `components/saju/ProfileForm.tsx` — 이름·관계 + SajuInputForm 래퍼
- `components/saju/ProfilePicker.tsx` — 저장된 프로필 선택 + 새로 입력

수정:
- `components/saju/SajuInputForm.tsx` — `initial` prefill + `submitLabel` props 추가 (edit/profile 재사용)
- `components/saju/SajuBoard.tsx` — 시주-left 순서 반전
- `components/saju/SajuBoardCompact.tsx` — 시주-left 순서 반전
- `app/api/readings/route.ts` — `validateProfile` import 교체 + `profileId` 재사용 분기 + 일회성(profile_id null) 분기
- `app/api/fortune/create/route.ts` — `profileId` 수용 분기
- `app/mypage/page.tsx` — 프로필 카드 DB 전환 + 지인 목록 섹션
- `app/(consultations)/saju/page.tsx` — ProfilePicker 진입 통합
- `app/fortune/[type]/page.tsx` — ProfilePicker 진입 통합

---

## Task 1: readings FK CASCADE → SET NULL 마이그레이션

**배경:** 현재 `readings.profile_id` FK는 `ON DELETE CASCADE` (`20260605000000_saju_core.sql:37`). 이대로 지인 프로필을 삭제하면 그 사람 과거 풀이 + 메시지가 cascade 삭제된다. `readings.saju_data`에 사주 스냅샷이 이미 있으므로 SET NULL로 바꿔 과거 풀이를 보존한다.

**Files:**
- Create: `supabase/migrations/20260610000000_readings_profile_set_null.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 프로필 삭제 시 과거 readings 보존 (saju_data 스냅샷 이미 보유) — CASCADE → SET NULL
-- 기존 제약 이름은 Postgres 기본 명명 규칙(readings_profile_id_fkey).
ALTER TABLE readings
  DROP CONSTRAINT IF EXISTS readings_profile_id_fkey;

ALTER TABLE readings
  ADD CONSTRAINT readings_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
```

- [ ] **Step 2: dev 브랜치 적용 확인**

dev Supabase 브랜치는 push 시 마이그레이션 자동 동기화된다. 로컬에서 SQL 문법만 검토(괄호/세미콜론). prod DB 직접 변경 금지.
Expected: 파일이 기존 타임스탬프(최신 `20260609000000`)보다 큰 순서로 정렬됨.

- [ ] **Step 3: 커밋 (사용자 승인 시)**

```bash
git add supabase/migrations/20260610000000_readings_profile_set_null.sql
git commit -m "사주 프로필 — readings.profile_id FK CASCADE→SET NULL (지인 삭제 시 과거 풀이 보존)"
```

---

## Task 2: profile-input.ts — validateProfile 추출 + SajuInput 변환 헬퍼

**배경:** `app/api/readings/route.ts:79-149`의 `validateProfile`/상수를 공용 모듈로 추출해 신규 `/api/profiles`와 `/api/readings` 양쪽에서 재사용한다(DRY). 추가로 DB 프로필 행 → `SajuInput` 변환 헬퍼를 둬서 표시용 `calcSaju` 호출을 표준화한다.

**Files:**
- Create: `lib/saju/profile-input.ts`

- [ ] **Step 1: 모듈 작성 (검증 + 변환)**

`readings/route.ts`의 기존 검증 로직을 그대로 옮기고(동작 동일), DB 행 변환 헬퍼를 추가한다.

```typescript
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
```

- [ ] **Step 2: readings/route.ts에서 중복 제거 (import 교체)**

`app/api/readings/route.ts`에서 로컬 `VALID_RELATIONS`/`VALID_GENDERS`/`ProfileInput`/`validateProfile` 정의(79-149행)를 삭제하고 import로 교체한다. (POST 본문의 `validateProfile(body.profile)` 호출부는 그대로 동작.)

기존 16행 근처 import 블록에 추가:
```typescript
import { validateProfile, type ProfileInput } from "@/lib/saju/profile-input";
```
그리고 79-149행의 `const VALID_RELATIONS`, `const VALID_GENDERS`, `interface ProfileInput`, `function validateProfile` 정의를 모두 삭제. (POST에서 사용하는 `profileValidated`/`profile` 흐름은 변경 없음.)

> 주의: 같은 파일 18행 `VALID_EMOTIONS`는 `EMOTION_OPTIONS` 기반으로 별개다 — 삭제하지 말 것.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (readings 라우트가 새 import를 정상 참조).

- [ ] **Step 4: 커밋 (사용자 승인 시)**

```bash
git add lib/saju/profile-input.ts app/api/readings/route.ts
git commit -m "사주 프로필 — validateProfile 공용 모듈 추출 + SajuInput 변환 헬퍼 (DRY)"
```

---

## Task 3: /api/profiles 라우트 (GET 목록 / POST 생성)

**배경:** 본인 프로필 목록을 표시용 사주와 함께 반환하고, 계정/지인 프로필을 생성한다. self/primary는 user당 1개(partial unique index)이므로 self 중복 생성은 409로 막는다.

**Files:**
- Create: `app/api/profiles/route.ts`

- [ ] **Step 1: GET + POST 작성**

```typescript
// 본인 사주 프로필 정본 CRUD (목록/생성). 표시용 사주는 서버 calcSaju 재계산.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { calcSaju } from "@/lib/saju/calc";
import {
  validateProfile,
  profileRowToSajuInput,
} from "@/lib/saju/profile-input";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  display_name: string;
  relation_type: string;
  birth_date: string;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
  is_primary: boolean;
  created_at: string;
}

function serializeProfile(row: ProfileRow) {
  const saju = calcSaju(profileRowToSajuInput(row));
  return {
    id: row.id,
    displayName: row.display_name,
    relationType: row.relation_type,
    birthDate: row.birth_date,
    birthTime: row.birth_time,
    isLunarInput: row.is_lunar_input,
    isLeapMonth: row.is_leap_month,
    gender: row.gender,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    saju,
  };
}

// GET /api/profiles — 본인 프로필 목록 (self/primary 먼저, 그다음 지인 created_at)
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ profiles: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "id, display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, created_at"
    )
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ profiles: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    profiles: (data ?? []).map((r) => serializeProfile(r as ProfileRow)),
  });
}

// POST /api/profiles — 프로필 생성 (계정 사주 또는 지인)
export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validated = validateProfile(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const p = validated;

  const supabase = getServiceSupabase();
  const isPrimary = p.relationType === "self";

  // self 생성 시 기존 self/primary가 있으면 409 (UI는 PATCH로 분기 — partial unique index 위반 방어)
  if (isPrimary) {
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "primary_exists", code: "PRIMARY_EXISTS" },
        { status: 409 }
      );
    }
  }

  const { data: row, error } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      display_name: p.displayName,
      relation_type: p.relationType,
      birth_date: p.birthDate,
      birth_time: p.birthTime,
      is_lunar_input: p.isLunarInput,
      is_leap_month: p.isLeapMonth,
      gender: p.gender,
      is_primary: isPrimary,
    })
    .select(
      "id, display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, created_at"
    )
    .single();

  if (error || !row) {
    await logError(error ?? new Error("profile insert null"), {
      route: "/api/profiles",
      userId,
      extra: { stage: "insert" },
    });
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: serializeProfile(row as ProfileRow) });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `/api/profiles` 라우트가 빌드 출력에 포함, 에러 없음.

- [ ] **Step 4: 커밋 (사용자 승인 시)**

```bash
git add app/api/profiles/route.ts
git commit -m "사주 프로필 — /api/profiles GET 목록 + POST 생성 (self 중복 409)"
```

---

## Task 4: /api/profiles/[id] 라우트 (PATCH 수정 / DELETE 삭제)

**배경:** 소유권 확인 후 birth 필드/이름/관계를 수정하거나 삭제한다. 삭제 시 readings는 Task 1의 SET NULL로 보존된다.

**Files:**
- Create: `app/api/profiles/[id]/route.ts`

- [ ] **Step 1: PATCH + DELETE 작성**

```typescript
// 본인 사주 프로필 수정/삭제 (소유권 확인). 삭제 시 readings는 FK SET NULL로 보존.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { calcSaju } from "@/lib/saju/calc";
import {
  validateProfile,
  profileRowToSajuInput,
} from "@/lib/saju/profile-input";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  display_name: string;
  relation_type: string;
  birth_date: string;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
  is_primary: boolean;
  created_at: string;
}

function serializeProfile(row: ProfileRow) {
  const saju = calcSaju(profileRowToSajuInput(row));
  return {
    id: row.id,
    displayName: row.display_name,
    relationType: row.relation_type,
    birthDate: row.birth_date,
    birthTime: row.birth_time,
    isLunarInput: row.is_lunar_input,
    isLeapMonth: row.is_leap_month,
    gender: row.gender,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    saju,
  };
}

// PATCH /api/profiles/[id] — 수정 (소유권 확인)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validated = validateProfile(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const p = validated;

  const supabase = getServiceSupabase();

  // 소유권 확인 (+ self 행의 relation_type/is_primary 불변 유지)
  const { data: owned } = await supabase
    .from("user_profiles")
    .select("id, is_primary, relation_type")
    .eq("id", params.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // self/primary 행은 relation_type을 self로 고정 (지인으로 강등 방지)
  const relationType = owned.is_primary ? "self" : p.relationType;

  const { data: row, error } = await supabase
    .from("user_profiles")
    .update({
      display_name: p.displayName,
      relation_type: relationType,
      birth_date: p.birthDate,
      birth_time: p.birthTime,
      is_lunar_input: p.isLunarInput,
      is_leap_month: p.isLeapMonth,
      gender: p.gender,
    })
    .eq("id", params.id)
    .eq("user_id", userId)
    .select(
      "id, display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, created_at"
    )
    .single();

  if (error || !row) {
    await logError(error ?? new Error("profile update null"), {
      route: "/api/profiles/[id]",
      userId,
      extra: { stage: "update", id: params.id },
    });
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: serializeProfile(row as ProfileRow) });
}

// DELETE /api/profiles/[id] — 삭제 (소유권 확인). readings는 SET NULL 보존.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  const supabase = getServiceSupabase();

  const { data: owned } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("id", params.id)
    .eq("user_id", userId);

  if (error) {
    await logError(error, {
      route: "/api/profiles/[id]",
      userId,
      extra: { stage: "delete", id: params.id },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음.

- [ ] **Step 3: 커밋 (사용자 승인 시)**

```bash
git add app/api/profiles/[id]/route.ts
git commit -m "사주 프로필 — /api/profiles/[id] PATCH 수정 + DELETE 삭제 (소유권 확인)"
```

---

## Task 5: readings POST — profileId 재사용 / 일회성 분기

**배경:** 현재 `/api/readings` POST는 매 상담마다 user_profiles 새 행을 INSERT한다(중복 누적). 저장된 프로필을 재사용(`profileId`)하거나, 일회성(`profile_id=null`)으로 진행하거나, inline+저장 분기를 추가한다.

**Files:**
- Modify: `app/api/readings/route.ts` (POST 본문, 현재 151-328행)

- [ ] **Step 1: POST 본문 타입 + 분기 확장**

`ReadingPostBody`에 `profileId`(저장된 프로필 재사용)와 `save`(inline 저장 여부)를 추가한다.

기존 (92-98행 근처):
```typescript
interface ReadingPostBody {
  profile: ProfileInput;
  sajuData: unknown;
  question: string;
  emotion?: string;
  sajuProduct?: string;
}
```
교체:
```typescript
interface ReadingPostBody {
  profileId?: string; // 저장된 프로필 재사용 (소유권 확인)
  profile?: ProfileInput; // inline 입력 (일회성 또는 save=true 시 신규 저장)
  save?: boolean; // inline 입력을 지인 목록에 저장할지
  sajuData: unknown;
  question: string;
  emotion?: string;
  sajuProduct?: string;
}
```

- [ ] **Step 2: profile_id 결정 로직 재작성**

POST 내부에서 기존 검증(167-171행 `validateProfile`)과 user_profiles INSERT(223-262행)를 다음 분기로 교체한다. `birthYear` 계산(193-194행)은 결정된 birthDate에서 다시 가져온다.

기존 167-171행:
```typescript
  const profileValidated = validateProfile(body.profile);
  if ("error" in profileValidated) {
    return NextResponse.json({ error: profileValidated.error }, { status: 400 });
  }
  const profile = profileValidated;
```
교체 → (sajuData/question 검증은 그대로 둔 뒤) profile_id 결정 블록을 INSERT 직전에 배치:

```typescript
  // sajuData/question 검증은 기존 그대로 유지 (173-187행).
  // profile_id 결정: profileId(재사용) | inline+save(신규) | inline 일회성(null)
  const supabase = getServiceSupabase();
  let resolvedProfileId: string | null = null;
  let birthDateForLuck: string;

  if (typeof body.profileId === "string" && body.profileId.length > 0) {
    // 저장된 프로필 재사용 — 소유권 + birth 로드
    const { data: owned } = await supabase
      .from("user_profiles")
      .select("id, birth_date")
      .eq("id", body.profileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    resolvedProfileId = owned.id;
    birthDateForLuck = owned.birth_date;
  } else {
    // inline 입력 (일회성 또는 저장)
    const profileValidated = validateProfile(body.profile);
    if ("error" in profileValidated) {
      return NextResponse.json({ error: profileValidated.error }, { status: 400 });
    }
    const profile = profileValidated;
    birthDateForLuck = profile.birthDate;

    if (body.save === true) {
      // 지인 목록에 저장 (self primary 결정은 기존 로직 유지)
      let isPrimary = false;
      if (profile.relationType === "self") {
        const { data: existing } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("user_id", userId)
          .eq("is_primary", true)
          .maybeSingle();
        if (!existing) isPrimary = true;
      }
      const { data: profileRow, error: pErr } = await supabase
        .from("user_profiles")
        .insert({
          user_id: userId,
          display_name: profile.displayName,
          relation_type: profile.relationType,
          birth_date: profile.birthDate,
          birth_time: profile.birthTime,
          is_lunar_input: profile.isLunarInput,
          is_leap_month: profile.isLeapMonth,
          gender: profile.gender,
          is_primary: isPrimary,
        })
        .select("id")
        .single();
      if (pErr || !profileRow) {
        await logError(pErr ?? new Error("profile insert null"), {
          route: "/api/readings",
          userId,
          extra: { stage: "profile_insert" },
        });
        return NextResponse.json(
          { error: pErr?.message ?? "profile_insert_failed" },
          { status: 500 }
        );
      }
      resolvedProfileId = profileRow.id;
    }
    // save=false → resolvedProfileId 는 null (일회성)
  }

  const birthYear = Number(birthDateForLuck.slice(0, 4));
```

그리고 readings INSERT(271-284행)의 `profile_id: profileRow.id` → `profile_id: resolvedProfileId`로 변경. **롤백 주의:** readings INSERT 실패 시 기존 코드(288행)는 항상 profile을 삭제했지만, 이제 재사용/일회성에서는 삭제하면 안 된다. 새로 만든 profile만 롤백하도록 가드한다.

기존 286-298행:
```typescript
  if (rErr || !reading) {
    await supabase.from("user_profiles").delete().eq("id", profileRow.id);
    ...
```
교체:
```typescript
  if (rErr || !reading) {
    // 이번 요청에서 새로 만든 프로필만 롤백 (재사용/일회성은 건드리지 않음)
    if (resolvedProfileId && body.save === true && !body.profileId) {
      await supabase.from("user_profiles").delete().eq("id", resolvedProfileId);
    }
    await logError(rErr ?? new Error("reading insert null"), {
      route: "/api/readings",
      userId,
      extra: { stage: "reading_insert" },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }
```

동일하게 spendStars 실패 롤백(305-319행)의 profile 삭제도 같은 가드 적용:
```typescript
  if (!spend.success) {
    await supabase.from("readings").delete().eq("id", reading.id);
    if (resolvedProfileId && body.save === true && !body.profileId) {
      await supabase.from("user_profiles").delete().eq("id", resolvedProfileId);
    }
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        reason: spend.reason,
        balance: spend.balance,
        required: SAJU_READING_COST,
      },
      { status: 402 }
    );
  }
```

> 기존 221행 `const supabase = getServiceSupabase();`는 위에서 앞당겨 선언했으므로 중복 선언을 제거할 것. `calcTemporalLuck`/`sajuDataWithTemporal` 블록(196-205행)은 그대로 유지하되 `birthYear`가 새 위치에서 선언되도록 순서 확인.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음. `supabase` 중복 선언/`birthYear` 미선언 에러가 없어야 함.

- [ ] **Step 4: 커밋 (사용자 승인 시)**

```bash
git add app/api/readings/route.ts
git commit -m "사주 프로필 — readings POST profileId 재사용 + 일회성/저장 분기 (중복 INSERT 제거)"
```

---

## Task 6: fortune/create POST — profileId 수용

**배경:** 별콩 운세 생성도 저장된 프로필을 재사용할 수 있게 `profileId`를 받는다. 주어지면 birth 로드 → `calcSaju`. 없으면 기존 inline `input` 검증. 둘 다 없으면 400.

**Files:**
- Modify: `app/api/fortune/create/route.ts` (96-104행 근처)

- [ ] **Step 1: import 추가**

기존 import 블록(8행 근처)에 추가:
```typescript
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
```
> `getSession`/`getServiceSupabase`는 이미 import되어 있으면 중복 추가하지 말 것. `profileRowToSajuInput`만 신규.

- [ ] **Step 2: saju 계산 분기 교체**

기존 97-104행:
```typescript
  let saju = undefined;
  if (cfg.base === "saju") {
    const validated = validateSajuInput(body.input);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    saju = calcSaju(validated);
  }
```
교체 (body 타입에 profileId 추가 필요 — 83행 `body` 타입을 `{ type?: unknown; input?: unknown; profileId?: unknown }`로 확장):
```typescript
  let saju = undefined;
  if (cfg.base === "saju") {
    if (typeof body.profileId === "string" && body.profileId.length > 0) {
      // 저장된 프로필 재사용 — 소유권 + birth 로드
      const supabase = getServiceSupabase();
      const { data: owned } = await supabase
        .from("user_profiles")
        .select(
          "birth_date, birth_time, is_lunar_input, is_leap_month, gender"
        )
        .eq("id", body.profileId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
      }
      saju = calcSaju(profileRowToSajuInput(owned));
    } else {
      const validated = validateSajuInput(body.input);
      if ("error" in validated) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      saju = calcSaju(validated);
    }
  }
```
> `userId`는 이미 62-69행에서 세션 검증 후 확보돼 있다.

83행 body 타입:
```typescript
  let body: { type?: unknown; input?: unknown; profileId?: unknown };
```

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 커밋 (사용자 승인 시)**

```bash
git add app/api/fortune/create/route.ts
git commit -m "사주 프로필 — fortune/create POST profileId 수용 (저장된 프로필 재사용)"
```

---

## Task 7: SajuBoard / SajuBoardCompact — 시주-left 순서 반전

**배경:** 사용자 요구 "팔자판은 시주가 왼쪽으로 오게 항상". 두 컴포넌트 모두 기둥 배열을 연→월→일→시에서 시→일→월→연으로 뒤집는다. 강조(일주 ★)는 `key`로 판정하므로 순서만 바뀌어도 정상 동작.

**Files:**
- Modify: `components/saju/SajuBoard.tsx:16-21`
- Modify: `components/saju/SajuBoardCompact.tsx:43-48`

- [ ] **Step 1: SajuBoard 배열 반전**

`components/saju/SajuBoard.tsx` 16-21행:
```typescript
const PILLAR_LABELS: { key: "year" | "month" | "day" | "hour"; label: string }[] = [
  { key: "year", label: "연주" },
  { key: "month", label: "월주" },
  { key: "day", label: "일주" },
  { key: "hour", label: "시주" },
];
```
교체:
```typescript
// 시주-left 정렬 (항상). 강조는 key === "day"로 판정하므로 순서만 반전.
const PILLAR_LABELS: { key: "year" | "month" | "day" | "hour"; label: string }[] = [
  { key: "hour", label: "시주" },
  { key: "day", label: "일주" },
  { key: "month", label: "월주" },
  { key: "year", label: "연주" },
];
```

- [ ] **Step 2: SajuBoardCompact 배열 반전**

`components/saju/SajuBoardCompact.tsx` 43-48행:
```typescript
const PILLARS: { key: "year" | "month" | "day" | "hour"; label: string }[] = [
  { key: "year", label: "연" },
  { key: "month", label: "월" },
  { key: "day", label: "일" },
  { key: "hour", label: "시" },
];
```
교체:
```typescript
// 시주-left 정렬 (항상).
const PILLARS: { key: "year" | "month" | "day" | "hour"; label: string }[] = [
  { key: "hour", label: "시" },
  { key: "day", label: "일" },
  { key: "month", label: "월" },
  { key: "year", label: "연" },
];
```

- [ ] **Step 3: 타입 체크 + dev 시각 확인**

Run: `npx tsc --noEmit`
dev 서버에서 `/saju` 사주 결과판이 좌→우 시·일·월·연 순서로, 일주에 ★이 붙는지 확인.
Expected: 시주가 가장 왼쪽, 일주 ★ 정상.

- [ ] **Step 4: 커밋 (사용자 승인 시)**

```bash
git add components/saju/SajuBoard.tsx components/saju/SajuBoardCompact.tsx
git commit -m "사주 프로필 — 팔자판 시주-left 정렬 (전역)"
```

---

## Task 8: SajuInputForm prefill + ProfileForm 래퍼

**배경:** edit 흐름(저장된 프로필 수정)과 지인 추가(이름·관계 필요)를 위해 (1) `SajuInputForm`에 `initial` prefill + `submitLabel`을 추가하고, (2) 이름·관계를 합친 `ProfileForm` 래퍼를 만든다. self 입력에는 이름·관계 입력을 숨긴다.

**Files:**
- Modify: `components/saju/SajuInputForm.tsx`
- Create: `components/saju/ProfileForm.tsx`

- [ ] **Step 1: SajuInputForm에 initial + submitLabel props 추가**

`SajuInputFormProps` (29-32행) 교체:
```typescript
export interface SajuInputFormInitial {
  year: number;
  month: number;
  day: number;
  hour: number | null;
  isLunar: boolean;
  isLeapMonth: boolean;
  gender: SajuGender;
}

export interface SajuInputFormProps {
  onSubmit: (input: SajuInput) => void;
  loading?: boolean;
  initial?: SajuInputFormInitial;
  submitLabel?: string;
}
```

state 초기화(34-42행)를 initial 우선으로 교체:
```typescript
export default function SajuInputForm({
  onSubmit,
  loading,
  initial,
  submitLabel,
}: SajuInputFormProps) {
  const today = new Date();
  const [year, setYear] = useState<number>(initial?.year ?? today.getFullYear() - 30);
  const [month, setMonth] = useState<number>(initial?.month ?? 1);
  const [day, setDay] = useState<number>(initial?.day ?? 1);
  const [hourValue, setHourValue] = useState<string>(
    initial?.hour !== null && initial?.hour !== undefined
      ? String(initial.hour)
      : HOUR_UNKNOWN
  );
  const [calendar, setCalendar] = useState<"solar" | "lunar">(
    initial?.isLunar ? "lunar" : "solar"
  );
  const [isLeapMonth, setIsLeapMonth] = useState<boolean>(initial?.isLeapMonth ?? false);
  const [gender, setGender] = useState<SajuGender>(initial?.gender ?? "male");
```

제출 버튼 라벨(219행) 교체:
```typescript
        {loading ? "별콩이가 펼치는 중…" : (submitLabel ?? "사주 펼쳐보기")}
```
> `initial`의 hour는 HOUR_BRANCHES의 시작값(0,2,4,…22) 중 하나여야 셀렉트와 일치한다. DB birth_time이 "HH:MM"이고 ProfileForm이 시진 시작 hour로 정규화해 전달한다(Step 2 참고).

- [ ] **Step 2: ProfileForm 작성**

```typescript
"use client";

import { useState } from "react";
import SajuInputForm, {
  type SajuInputFormInitial,
} from "@/components/saju/SajuInputForm";
import type { SajuInput } from "@/lib/saju/calc";
import type { RelationType } from "@/lib/saju/profile-input";

// SajuInput → readings/profiles API가 받는 birth 필드 페이로드
export interface ProfilePayload {
  displayName: string;
  relationType: RelationType;
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: SajuInput["gender"];
}

const RELATION_OPTIONS: { value: RelationType; label: string }[] = [
  { value: "friend", label: "친구" },
  { value: "family", label: "가족" },
  { value: "partner", label: "연인" },
  { value: "other", label: "기타" },
];

export interface ProfileFormProps {
  // self면 이름·관계 입력 숨김, display_name은 기본값(닉네임) 사용
  mode: "self" | "acquaintance";
  initial?: SajuInputFormInitial;
  initialName?: string;
  initialRelation?: RelationType;
  defaultSelfName?: string; // self 모드에서 display_name 기본값 (계정 닉네임)
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (payload: ProfilePayload) => void;
}

export default function ProfileForm({
  mode,
  initial,
  initialName,
  initialRelation,
  defaultSelfName,
  submitLabel,
  loading,
  onSubmit,
}: ProfileFormProps) {
  const [name, setName] = useState<string>(initialName ?? "");
  const [relation, setRelation] = useState<RelationType>(initialRelation ?? "friend");

  const handleSajuSubmit = (input: SajuInput) => {
    const displayName =
      mode === "self"
        ? (defaultSelfName?.trim() || "나")
        : name.trim();
    if (mode === "acquaintance" && displayName.length < 1) return;

    onSubmit({
      displayName: displayName.slice(0, 50),
      relationType: mode === "self" ? "self" : relation,
      birthDate: `${input.year}-${String(input.month).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`,
      birthTime:
        input.hour !== null && input.hour !== undefined
          ? `${String(input.hour).padStart(2, "0")}:${String(input.minute ?? 0).padStart(2, "0")}`
          : null,
      isLunarInput: input.isLunar === true,
      isLeapMonth: input.isLeapMonth === true,
      gender: input.gender,
    });
  };

  return (
    <div className="w-full">
      {mode === "acquaintance" && (
        <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-5 mb-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">이름</legend>
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="누구 사주야?"
              className="px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
            />
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">관계</legend>
            <div className="grid grid-cols-4 gap-2">
              {RELATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRelation(opt.value)}
                  className={`py-2.5 rounded-xl text-[13px] font-bold transition ${
                    relation === opt.value
                      ? "bg-lilac-deep text-white"
                      : "bg-cream-warm text-text-light border border-lilac-mid/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <SajuInputForm
        onSubmit={handleSajuSubmit}
        loading={loading}
        initial={initial}
        submitLabel={submitLabel ?? "저장하기"}
      />
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 커밋 (사용자 승인 시)**

```bash
git add components/saju/SajuInputForm.tsx components/saju/ProfileForm.tsx
git commit -m "사주 프로필 — SajuInputForm prefill/submitLabel + ProfileForm 래퍼(이름·관계)"
```

---

## Task 9: 마이페이지 — 프로필 카드 DB 전환 + 지인 목록

**배경:** localStorage(`MY_SAJU_KEY`) 캐시를 DB 기반 `/api/profiles`로 대체한다. 프로필 카드에 계정 사주 팔자판(있으면) + 수정, 없으면 입력 CTA. 그 아래 지인 사주 목록 섹션(추가/수정/삭제).

**Files:**
- Modify: `app/mypage/page.tsx`

- [ ] **Step 1: 프로필 상태 + 로딩으로 교체**

`MY_SAJU_KEY` 및 관련 localStorage 코드(11, 39-88행)를 제거하고 `/api/profiles` 기반 상태로 교체한다.

상단 import에 추가:
```typescript
import SajuBoard from "@/components/saju/SajuBoard";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import type { SajuResult } from "@/lib/saju/calc";
```
> 기존 `SajuInputForm` import는 ProfileForm이 대체하므로 제거. `SajuInput` import도 미사용이면 제거.

프로필 타입 + 상태 추가:
```typescript
interface ProfileItem {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  isPrimary: boolean;
  saju: SajuResult;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

// HH:MM → HOUR_BRANCHES 시작 hour (prefill용). null이면 undefined(시간 모름).
function birthTimeToBranchHour(t: string | null): number | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  // 자시 23-01 → 0, 이후 2시간 단위. 23시는 자시(0)로.
  if (h === 23) return 0;
  return h - (h % 2);
}
```

state (33-41행 영역)에서 `saju`/`sajuLoading`/`sajuError` 제거 후:
```typescript
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingSelf, setEditingSelf] = useState(false);
  const [showAddAcq, setShowAddAcq] = useState(false);
  const [editAcqId, setEditAcqId] = useState<string | null>(null);
  const [deleteAcqId, setDeleteAcqId] = useState<string | null>(null);
```

- [ ] **Step 2: 프로필 fetch + CRUD 핸들러**

초기 로드 useEffect(90-112행)의 `Promise.all`에 `/api/profiles` 추가:
```typescript
      const [r, bal, list, profs] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch("/api/readings", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch("/api/profiles", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
      ]);
      if (!r?.isAuthenticated) {
        router.replace("/login?next=/mypage");
        return;
      }
      setMe(r as Me);
      if (bal) setBalance(bal.balance ?? 0);
      if (list?.readings) setReadings(list.readings);
      if (profs?.profiles) setProfiles(profs.profiles as ProfileItem[]);
      setLoading(false);
```

핸들러 추가 (handleSajuSubmit/handleSajuReset 대체):
```typescript
  const reloadProfiles = async () => {
    const d = await fetch("/api/profiles", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (d?.profiles) setProfiles(d.profiles as ProfileItem[]);
  };

  const self = profiles.find((p) => p.isPrimary) ?? null;
  const acquaintances = profiles.filter((p) => !p.isPrimary);

  const saveSelf = async (payload: ProfilePayload) => {
    setSavingProfile(true);
    try {
      const url = self ? `/api/profiles/${self.id}` : "/api/profiles";
      const method = self ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await reloadProfiles();
        setEditingSelf(false);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const saveAcquaintance = async (payload: ProfilePayload, editId: string | null) => {
    setSavingProfile(true);
    try {
      const url = editId ? `/api/profiles/${editId}` : "/api/profiles";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await reloadProfiles();
        setShowAddAcq(false);
        setEditAcqId(null);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteAcquaintance = async (id: string) => {
    const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    if (res.ok) {
      await reloadProfiles();
      setDeleteAcqId(null);
    }
  };

  const toInitial = (p: ProfileItem) => ({
    year: Number(p.birthDate.slice(0, 4)),
    month: Number(p.birthDate.slice(5, 7)),
    day: Number(p.birthDate.slice(8, 10)),
    hour: birthTimeToBranchHour(p.birthTime),
    isLunar: p.isLunarInput,
    isLeapMonth: p.isLeapMonth,
    gender: p.gender,
  });
```

- [ ] **Step 3: 프로필 카드 — 팔자판/수정/입력 CTA**

기존 프로필 카드(158-187행)는 닉네임/잔액 그대로 두고, 그 아래에 계정 사주 영역을 추가한다. 기존 "나의 사주 정보" 섹션(207-237행)을 다음으로 교체:

```tsx
      {/* 계정 사주 (프로필 카드 영역) */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-bold text-eye-purple">내 사주</div>
          {self && !editingSelf && (
            <button
              onClick={() => setEditingSelf(true)}
              className="text-[11px] text-text-light/60 underline"
            >
              수정
            </button>
          )}
        </div>

        {self && !editingSelf ? (
          <>
            <SajuBoard saju={self.saju} />
            <p className="text-[11px] text-text-light/70 text-center mt-2">
              {self.birthDate.replace(/-/g, ". ")}
              {self.isLunarInput ? " · 음력" : " · 양력"}
              {self.birthTime ? ` · ${self.birthTime}` : " · 시간 모름"}
            </p>
          </>
        ) : editingSelf ? (
          <>
            <ProfileForm
              mode="self"
              initial={self ? toInitial(self) : undefined}
              defaultSelfName={me.user.nickname}
              submitLabel="저장하기"
              loading={savingProfile}
              onSubmit={saveSelf}
            />
            <button
              onClick={() => setEditingSelf(false)}
              className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditingSelf(true)}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
          >
            내 사주 입력하기
          </button>
        )}
      </div>
```

- [ ] **Step 4: 지인 사주 목록 섹션**

계정 사주 영역 아래에 추가:

```tsx
      {/* 지인 사주 목록 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-bold text-eye-purple">지인 사주</div>
          {!showAddAcq && !editAcqId && (
            <button
              onClick={() => setShowAddAcq(true)}
              className="text-[11px] text-lilac-deep font-bold underline"
            >
              + 지인 추가
            </button>
          )}
        </div>

        {(showAddAcq || editAcqId) && (
          <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30 mb-3">
            <ProfileForm
              mode="acquaintance"
              initial={
                editAcqId
                  ? toInitial(acquaintances.find((a) => a.id === editAcqId)!)
                  : undefined
              }
              initialName={
                editAcqId
                  ? acquaintances.find((a) => a.id === editAcqId)?.displayName
                  : undefined
              }
              initialRelation={
                editAcqId
                  ? (acquaintances.find((a) => a.id === editAcqId)
                      ?.relationType as Exclude<ProfileItem["relationType"], "self">)
                  : undefined
              }
              submitLabel={editAcqId ? "수정하기" : "추가하기"}
              loading={savingProfile}
              onSubmit={(payload) => saveAcquaintance(payload, editAcqId)}
            />
            <button
              onClick={() => {
                setShowAddAcq(false);
                setEditAcqId(null);
              }}
              className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
            >
              취소
            </button>
          </div>
        )}

        {acquaintances.length === 0 && !showAddAcq ? (
          <p className="text-[12px] text-text-light/70 text-center py-4">
            아직 등록한 지인 사주가 없어
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {acquaintances.map((a) => (
              <div
                key={a.id}
                className="bg-cream-warm rounded-2xl p-3 border border-lilac-mid/30 flex items-center justify-between"
              >
                <div>
                  <div className="text-[14px] font-bold text-eye-purple">
                    {a.displayName}
                    <span className="ml-2 text-[11px] text-text-light/70 font-normal">
                      {RELATION_LABEL[a.relationType] ?? ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-0.5">
                    {a.birthDate.replace(/-/g, ". ")}
                    {a.isLunarInput ? " · 음력" : " · 양력"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditAcqId(a.id);
                      setShowAddAcq(false);
                    }}
                    className="text-[11px] text-text-light/60 underline"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setDeleteAcqId(a.id)}
                    className="text-[11px] text-rose-400 underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 지인 삭제 확인 모달 */}
      {deleteAcqId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-[14px] font-bold text-eye-purple mb-2">지인 사주 삭제</p>
            <p className="text-[12px] text-text-light leading-relaxed mb-4">
              이 지인 사주를 삭제할까? 과거 풀이 기록은 그대로 남아.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteAcqId(null)}
                className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
              >
                취소
              </button>
              <button
                onClick={() => deleteAcquaintance(deleteAcqId)}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: 타입 체크 + 빌드 + dev 확인**

Run: `npx tsc --noEmit && npm run build`
dev에서 `/mypage`: 계정 사주 없을 때 "내 사주 입력하기" → 입력 → 팔자판(시주-left) + 생년 요약 노출. 지인 추가/수정/삭제 동작, 빈 상태 문구.
Expected: 에러 없음, CRUD 정상.

- [ ] **Step 6: 커밋 (사용자 승인 시)**

```bash
git add app/mypage/page.tsx
git commit -m "사주 프로필 — 마이페이지 프로필 카드 DB 전환 + 지인 사주 목록 CRUD"
```

---

## Task 10: ProfilePicker + 상담/운세 진입 통합

**배경:** 고민톡 사주(`app/(consultations)/saju/page.tsx`)와 별콩운세(`app/fortune/[type]/page.tsx`) 입력 단계 앞에 공용 피커를 노출한다. 저장된 프로필 선택 시 그 birth로 진행(profileId 전달), "새로 입력" 시 ProfileForm + "지인 목록에 저장" 체크박스.

**Files:**
- Create: `components/saju/ProfilePicker.tsx`
- Modify: `app/(consultations)/saju/page.tsx`
- Modify: `app/fortune/[type]/page.tsx`

- [ ] **Step 1: ProfilePicker 작성**

선택 결과를 부모에 전달하는 콜백 컴포넌트. 두 가지 결과: (a) 저장된 프로필 → `{ kind: "saved", profileId, saju }`, (b) inline 입력 → `{ kind: "inline", payload, save, saju }`. saju 미리보기를 위해 calc를 호출한다.

```typescript
"use client";

import { useEffect, useState } from "react";
import SajuBoard from "@/components/saju/SajuBoard";
import SajuBoardCompact from "@/components/saju/SajuBoardCompact";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import type { SajuResult } from "@/lib/saju/calc";

interface PickerProfile {
  id: string;
  displayName: string;
  relationType: string;
  isPrimary: boolean;
  saju: SajuResult;
}

export type PickerResult =
  | { kind: "saved"; profileId: string; saju: SajuResult }
  | { kind: "inline"; payload: ProfilePayload; save: boolean; saju: SajuResult };

export interface ProfilePickerProps {
  // 선택 + 미리보기 확정 시 호출 (부모가 readings/fortune POST 진행)
  onConfirm: (result: PickerResult) => void;
  confirmLabel?: string;
  loading?: boolean;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

export default function ProfilePicker({
  onConfirm,
  confirmLabel,
  loading,
}: ProfilePickerProps) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveNew, setSaveNew] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const d = await fetch("/api/profiles", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      const list = (d?.profiles ?? []) as PickerProfile[];
      setProfiles(list);
      const self = list.find((p) => p.isPrimary);
      if (self) setSelectedId(self.id);
      else if (list.length === 0) setMode("new");
      setReady(true);
    })();
  }, []);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const handleInlineSubmit = async (payload: ProfilePayload) => {
    // 미리보기 + 진행을 위해 서버 calc 호출
    setCalcLoading(true);
    try {
      const hasTime = payload.birthTime !== null;
      const res = await fetch("/api/consultations/saju/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(payload.birthDate.slice(0, 4)),
          month: Number(payload.birthDate.slice(5, 7)),
          day: Number(payload.birthDate.slice(8, 10)),
          hour: hasTime ? Number(payload.birthTime!.slice(0, 2)) : null,
          minute: hasTime ? Number(payload.birthTime!.slice(3, 5)) : null,
          isLunar: payload.isLunarInput,
          isLeapMonth: payload.isLeapMonth,
          gender: payload.gender,
        }),
      });
      if (!res.ok) return;
      const d = await res.json();
      onConfirm({ kind: "inline", payload, save: saveNew, saju: d.saju as SajuResult });
    } finally {
      setCalcLoading(false);
    }
  };

  if (!ready) {
    return <p className="text-center text-[13px] text-text-light py-6">잠시만…</p>;
  }

  if (mode === "new") {
    return (
      <div className="w-full">
        <ProfileForm
          mode="acquaintance"
          submitLabel="이 사주로 보기"
          loading={loading || calcLoading}
          onSubmit={handleInlineSubmit}
        />
        <label className="flex items-center justify-center gap-2 text-[12px] text-text-light mt-3">
          <input
            type="checkbox"
            checked={saveNew}
            onChange={(e) => setSaveNew(e.target.checked)}
            className="w-4 h-4 accent-lilac-deep"
          />
          지인 목록에 저장하기
        </label>
        {profiles.length > 0 && (
          <button
            onClick={() => setMode("list")}
            className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
          >
            저장된 사주에서 고르기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-5">
      <div className="flex flex-col gap-2 mb-4">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`flex items-center justify-between rounded-2xl p-3 border transition ${
              selectedId === p.id
                ? "border-lilac-deep bg-lilac-soft/40"
                : "border-lilac-mid/30 bg-cream-warm"
            }`}
          >
            <div className="text-left">
              <div className="text-[14px] font-bold text-eye-purple">
                {p.isPrimary ? "내 사주" : p.displayName}
                {!p.isPrimary && (
                  <span className="ml-2 text-[11px] text-text-light/70 font-normal">
                    {RELATION_LABEL[p.relationType] ?? ""}
                  </span>
                )}
              </div>
            </div>
            <SajuBoardCompact saju={p.saju} />
          </button>
        ))}
        <button
          onClick={() => setMode("new")}
          className="rounded-2xl p-3 border border-dashed border-lilac-mid text-[13px] text-lilac-deep font-bold"
        >
          + 새로 입력
        </button>
      </div>

      {selected && <SajuBoard saju={selected.saju} />}

      <button
        disabled={!selected || loading}
        onClick={() =>
          selected &&
          onConfirm({ kind: "saved", profileId: selected.id, saju: selected.saju })
        }
        className="w-full mt-5 py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] disabled:opacity-60"
      >
        {confirmLabel ?? "이 사주로 보기"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 고민톡 사주 페이지 통합**

`app/(consultations)/saju/page.tsx`를 피커 우선 흐름으로 바꾼다. 기존 입력폼/결과판 흐름을 ProfilePicker로 대체하되, "별콩이에게 풀이 듣기"의 readings POST 로직(pending 처리)은 유지하고 profile 대신 picker 결과를 사용한다.

핵심 변경: `handleSubmit`(SajuInputForm) 제거, ProfilePicker의 `onConfirm`에서 readings POST. profile/profileId 분기:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ProfilePicker, { type PickerResult } from "@/components/saju/ProfilePicker";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";

export default function SajuPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (result: PickerResult) => {
    setLoading(true);
    setError(null);

    // 로그인 확인
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const data = r.ok ? await r.json() : null;
      if (!data?.isAuthenticated) {
        window.location.href = "/login?next=" + encodeURIComponent("/saju");
        return;
      }
    } catch {
      window.location.href = "/login?next=" + encodeURIComponent("/saju");
      return;
    }

    // pending(고민/감정/상품) 로드
    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    let pending: PendingConsultation | null = null;
    try {
      pending = pendingRaw ? (JSON.parse(pendingRaw) as PendingConsultation) : null;
    } catch {
      pending = null;
    }

    const question = pending?.concern ?? "사주 전반을 봐줘";
    const emotion = pending?.emotion;
    const sajuProduct = pending?.sajuProduct;

    // readings POST 본문: saved → profileId, inline → profile + save
    const base = {
      sajuData: result.saju,
      question,
      emotion,
      sajuProduct,
    };
    const body =
      result.kind === "saved"
        ? { ...base, profileId: result.profileId }
        : { ...base, profile: result.payload, save: result.save };

    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === "INSUFFICIENT_STARS") {
          window.location.href = "/shop";
          return;
        }
        setError("풀이를 시작하지 못했어. 잠시 후 다시 해줄래?");
        setLoading(false);
        return;
      }
      const data = await res.json();
      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem("byeolkong:emotion");
      router.push(`/saju/reading?id=${data.id}`);
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <div className="relative animate-float">
          <Image src="/byeolkong-main.png" alt="별콩이" width={140} height={140} priority />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-eye-purple text-center">
          누구 사주를 볼까?
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          저장된 사주에서 고르거나 새로 입력해줘.
        </p>
      </div>

      <ProfilePicker
        onConfirm={handleConfirm}
        confirmLabel="별콩이에게 풀이 듣기"
        loading={loading}
      />

      {error && (
        <p className="mt-4 text-[12px] text-red-500 text-center px-5 max-w-md">{error}</p>
      )}

      <Link href="/" className="mt-6 text-[12px] text-text-light/70 underline">
        나중에 할래
      </Link>
    </main>
  );
}
```
> 기존 `/saju/concern` 폴백 흐름은 제거된다(피커가 입력을 직접 수집). `byeolkong:current_reading` 세션 저장은 reading 페이지가 `?id=`로 직접 로드하면 불필요 — 기존 reading 페이지가 id로 동작하는지 확인하고, 의존하면 유지할 것. (확인: `app/saju/reading/page.tsx`가 `searchParams.id`로 fetch하면 제거 안전.)

- [ ] **Step 3: 별콩운세 페이지 통합**

`app/fortune/[type]/page.tsx`에서 `SajuInputForm`을 ProfilePicker로 교체. `handleSubmit(input)` → `handleConfirm(result)`. fortune/create POST 본문은 saved면 `{ type, profileId }`, inline이면 `{ type, input }`(기존 validateSajuInput과 호환되는 평면 SajuInput 형태).

inline payload(ProfilePayload, birthDate/birthTime 문자열)를 `input`(year/month/day/hour…)으로 변환해야 한다. ProfilePicker가 inline 결과에 saju만 주므로, fortune은 inline 시 payload→input 변환 후 전달:

```tsx
  const handleConfirm = async (result: PickerResult) => {
    setLoading(true);
    setError(null);
    setNeedCharge(false);

    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const data = me.ok ? await me.json() : null;
      if (!data?.isAuthenticated) {
        window.location.href = "/login?next=" + encodeURIComponent(cfg.href);
        return;
      }
    } catch {
      window.location.href = "/login?next=" + encodeURIComponent(cfg.href);
      return;
    }

    let body: Record<string, unknown>;
    if (result.kind === "saved") {
      body = { type: cfg.type, profileId: result.profileId };
    } else {
      const p = result.payload;
      const hasTime = p.birthTime !== null;
      body = {
        type: cfg.type,
        input: {
          year: Number(p.birthDate.slice(0, 4)),
          month: Number(p.birthDate.slice(5, 7)),
          day: Number(p.birthDate.slice(8, 10)),
          hour: hasTime ? Number(p.birthTime!.slice(0, 2)) : null,
          minute: hasTime ? Number(p.birthTime!.slice(3, 5)) : null,
          isLunar: p.isLunarInput,
          isLeapMonth: p.isLeapMonth,
          gender: p.gender,
        },
      };
    }

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === "INSUFFICIENT_STARS") {
          setError("별이 모자라. 충전소에서 별을 채우고 다시 올래?");
          setNeedCharge(true);
        } else {
          setError(
            data?.error === "rate_limited"
              ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
              : "운세를 못 펼쳤어. 잠시 후 다시 시도해줄래?"
          );
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      router.push(`/fortune/result?id=${data.id}`);
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setLoading(false);
    }
  };
```
그리고 JSX의 `<SajuInputForm onSubmit={handleSubmit} loading={loading} />`를 다음으로 교체:
```tsx
      <ProfilePicker onConfirm={handleConfirm} confirmLabel="이 사주로 운세 보기" loading={loading} />
```
import 교체: `SajuInputForm`/`SajuInput` 제거, `import ProfilePicker, { type PickerResult } from "@/components/saju/ProfilePicker";` 추가.

- [ ] **Step 4: 타입 체크 + 빌드 + dev 확인**

Run: `npx tsc --noEmit && npm run build`
dev 확인:
- `/saju`: 저장된 self 자동 선택 + 팔자판 미리보기 → "별콩이에게 풀이 듣기" → reading 진입. "새로 입력" + 저장 체크 → 지인 추가됨.
- `/fortune/[type]`(예: monthly/nature 등 saju 기반): 동일 피커 → 운세 생성.
Expected: 에러 없음, 양쪽 플로우 정상.

- [ ] **Step 5: 커밋 (사용자 승인 시)**

```bash
git add components/saju/ProfilePicker.tsx app/(consultations)/saju/page.tsx app/fortune/[type]/page.tsx
git commit -m "사주 프로필 — ProfilePicker + 고민톡/별콩운세 진입 통합 (저장된 사주 자동 로드)"
```

---

## Task 11: 최종 검증 + 스펙 커버리지 확인

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 0.

- [ ] **Step 2: dev 푸시 후 dev 브랜치 통합 확인 (사용자 승인 시)**

마이그레이션이 dev Supabase에 적용됐는지, `/api/profiles` 라우트가 dev 배포에서 동작하는지 확인.

- [ ] **Step 3: 스펙 커버리지 체크**

스펙 9개 변경 대상 ↔ 태스크 매핑 확인:
1. FK SET NULL → Task 1 ✓
2. profile-input.ts → Task 2 ✓
3. /api/profiles GET/POST + [id] PATCH/DELETE → Task 3, 4 ✓
4. readings profileId 분기 → Task 5 ✓
5. fortune/create profileId → Task 6 ✓
6. ProfileForm + ProfilePicker → Task 8, 10 ✓
7. 마이페이지 프로필 카드 + 지인 목록 → Task 9 ✓
8. saju/page + fortune/[type] 피커 → Task 10 ✓
9. SajuBoard/Compact 시주-left → Task 7 ✓

- [ ] **Step 4: 문서 커밋 (사용자 승인 시)**

스펙/플랜 문서를 구현과 함께 커밋:
```bash
git add docs/superpowers/specs/2026-06-03-saju-profile-management-design.md docs/superpowers/plans/2026-06-03-saju-profile-management.md
git commit -m "사주 프로필 — 설계/구현 계획 문서"
```

---

## Self-Review

**1. Spec coverage:** Task 11 Step 3의 매핑으로 9개 변경 대상 전부 태스크에 존재 확인.

**2. Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "TBD"/"적절히 처리" 없음.

**3. Type consistency:**
- `ProfilePayload`(ProfileForm) ↔ `validateProfile`가 받는 ProfileInput shape: displayName/relationType/birthDate/birthTime/isLunarInput/isLeapMonth/gender 동일 ✓
- `profileRowToSajuInput`이 받는 snake_case 행 필드 ↔ /api/profiles, /api/readings, /api/fortune/create select 컬럼명 일치 ✓
- `RelationType`은 profile-input.ts에서 export, ProfileForm이 import ✓
- `PickerResult`의 saved/inline 분기 ↔ saju/page·fortune/[type]의 body 구성 일치 ✓
- `SajuInputFormInitial.hour`(시진 시작 hour) ↔ mypage `birthTimeToBranchHour` 정규화 일치 ✓

**주의 항목 (구현자 확인 필요):**
- Task 10 Step 2: `/saju/reading` 페이지가 `?id=`로 reading을 직접 로드하는지 확인 후 `byeolkong:current_reading` 세션 저장 유지/제거 결정. 의존하면 기존 저장 코드를 handleConfirm에 보존할 것.
- Task 5: readings POST에서 `const supabase` 선언 위치를 앞으로 옮기므로 기존 중복 선언 제거 필수.
- Task 6: `getSession`/`getServiceSupabase` 중복 import 주의.
