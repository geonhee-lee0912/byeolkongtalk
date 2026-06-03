# 사주 프로필 관리 설계

작성일: 2026-06-03
상태: 설계 합의 완료 (구현 전)

## 배경 / 목표

현재 사주 상담을 받을 때마다 `user_profiles`에 새 행이 매번 INSERT돼서 같은 사람의 사주가 중복으로 쌓인다. 또 계정 사주가 어디에도 영속 저장되지 않아(마이페이지는 localStorage 캐시만) 상담/운세를 시작할 때마다 생년월일을 다시 입력해야 한다.

이번 작업은 `user_profiles`를 **영속 정본 저장소**로 정리해서:
1. 계정 사주를 한 번 입력하면 고민톡/별콩운세 사주 상담에서 **자동 로드**되도록 한다.
2. 마이페이지에 **지인 사주 목록(CRUD)** 을 만들어 본인 외 여러 사람 사주(궁합 등 향후 활용)를 자유롭게 입력/수정/삭제할 수 있게 한다.
3. **계정 사주는 마이페이지 프로필 카드에서** 관리하고, 입력된 상태면 **팔자판**을 보여준다.
4. **팔자판은 항상 시주가 왼쪽**으로 오게 정렬한다.

핵심 원칙:
- `user_profiles`가 정본. 상담/운세는 기존 `profile_id`를 재사용한다 (중복 INSERT 제거).
- 팔자판(사주판)은 프로필에 저장하지 않는다 — `calcSaju()`가 결정적·저비용이므로 표시할 때마다 서버에서 재계산.
- 과거 풀이(`readings`)는 `saju_data` JSONB에 사주를 스냅샷으로 이미 보유하므로, 프로필을 수정/삭제해도 과거 풀이는 영향받지 않아야 한다.

---

## Section A — 데이터 모델

### 정본 구조
- **계정 사주** = `relation_type='self' AND is_primary=true` 인 단일 행. `idx_user_profiles_primary` partial unique index가 user당 primary 1개를 이미 보장한다.
- **지인 사주** = `relation_type IN ('family','friend','partner','other')`, `is_primary=false` 인 행들.
- 한 user는 self/primary 1행 + 지인 N행을 가진다.

### 중복 INSERT 제거
- 현재 `/api/readings` POST는 매 상담마다 `user_profiles`에 새 행을 INSERT한다 → 이 동작을 변경한다.
- 상담/운세 시작 시:
  - **저장된 프로필 선택**: 기존 `profile_id`를 그대로 사용 (새 INSERT 없음).
  - **"새로 입력" + 지인 목록 저장**: 프로필 1행 생성 후 그 `profile_id` 사용.
  - **"새로 입력" + 저장 안 함(일회성)**: 프로필 생성 없이 `readings.profile_id = null` 로 저장. (`profile_id`는 이미 nullable — `20260607000000_tarot_core.sql:25` 에서 `DROP NOT NULL` 됨.)

### 팔자판은 비저장
- `user_profiles`에 사주 계산 결과 컬럼을 추가하지 않는다.
- 표시(마이페이지 팔자판, 피커 항목)가 필요할 때 서버가 birth 필드로 `calcSaju()`를 호출해 결과를 응답에 포함한다.

### 마이그레이션 — readings FK 변경
현재 `readings.profile_id` FK는 `ON DELETE CASCADE` (`20260605000000_saju_core.sql:37`). 이 상태로 지인 프로필을 삭제하면 그 사람의 과거 풀이 + 메시지가 전부 cascade 삭제된다.

→ 새 마이그레이션 파일 `supabase/migrations/<timestamp>_readings_profile_set_null.sql`:
```sql
-- 프로필 삭제 시 과거 readings 보존 (saju_data 스냅샷 이미 보유) — CASCADE → SET NULL
ALTER TABLE readings
  DROP CONSTRAINT readings_profile_id_fkey;

ALTER TABLE readings
  ADD CONSTRAINT readings_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
```
> 제약 이름은 적용 전 `\d readings` 또는 information_schema 로 실제 이름을 확인한다 (Postgres 기본 명명은 `readings_profile_id_fkey`).

### 비범위
- 기존에 쌓인 중복 프로필 행 dedup/정리 마이그레이션은 하지 않는다. 새 행이 더 쌓이지 않게만 한다.

---

## Section B — API 표면

신규 라우트 `app/api/profiles/`:

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/profiles` | 본인 프로필 목록. self/primary 먼저, 그다음 지인(created_at). 각 항목에 표시용 사주(서버 `calcSaju` 계산) 포함. |
| POST | `/api/profiles` | 프로필 생성 (계정 사주 또는 지인). self 생성 시 기존 self/primary가 있으면 409 반환. (마이페이지 UI는 self 존재 시 POST 대신 PATCH로 분기하므로 정상 흐름에선 발생 안 함 — partial unique index 위반 방어용.) |
| PATCH | `/api/profiles/[id]` | 수정 (소유권 확인). birth 필드 변경 가능. |
| DELETE | `/api/profiles/[id]` | 삭제 (소유권 확인). readings는 SET NULL 로 보존. |

- 입력 검증: `/api/readings`의 `validateProfile` 로직을 공용 모듈 `lib/saju/profile-input.ts` 로 추출해 신규 라우트와 `/api/readings` 양쪽에서 재사용 (DRY).
- 응답 사주 shape: `SajuResult` (lib/saju/calc.ts) — pillars/dayStem/dayElement/elementCount/yinYangCount.
- 모든 라우트는 `getSession()` 로그인 검증 + 본인 user_id 소유권 검증.

---

## Section C — 마이페이지 UI

### 프로필 카드 (최상단)
- **계정 사주 있음**: 팔자판(`SajuBoard`, 시주-left) + 생년 요약(예: "1995년 3월 4일 · 양력 · 자시" ) + "수정" 버튼.
  - "수정" → `SajuInputForm` 프리필 → `PATCH /api/profiles/[selfId]`.
- **계정 사주 없음**: "내 사주 입력하기" CTA → `SajuInputForm` → `POST /api/profiles` (`relation_type='self'`, `is_primary=true`).
  - self 프로필의 `display_name`은 입력받지 않고 계정 닉네임으로 기본 설정.
- 현재 localStorage 기반 사주 섹션(`MY_SAJU_KEY`)을 이 DB 기반 카드로 대체.

### 지인 사주 목록 섹션
- 프로필 카드 아래. 지인 프로필 리스트: 이름 · 관계 라벨 · 생년 요약 (선택적으로 미니 요약, 팔자판은 상세에서).
- "지인 추가" 버튼 → 폼(이름 + 관계 선택 + `SajuInputForm` birth/gender) → `POST /api/profiles`.
- 각 항목: "수정"(PATCH) / "삭제"(DELETE, 확인 모달).
- 빈 상태: "아직 등록한 지인 사주가 없어" 안내.

### 폼 확장
- `SajuInputForm`은 birth/gender만 수집한다 (현재). 지인 추가에는 **이름 + 관계** 필드가 추가로 필요.
- 래퍼 컴포넌트 `ProfileForm`을 만들어 `SajuInputForm` + (이름·관계 입력)을 합친다. self 입력에는 이름/관계 입력을 숨기고 self/primary로 고정.

---

## Section D — 상담 진입 피커

### 공용 컴포넌트 `ProfilePicker`
- 고민톡 사주 플로우(`app/(consultations)/saju/page.tsx`)와 별콩운세 플로우(`app/fortune/[type]/page.tsx`) 양쪽, 입력 단계 **앞에** 노출.
- 항목: `[내 사주] [지인1] [지인2] … [+ 새로 입력]`.
  - 저장된 프로필 선택 → 그 프로필의 birth 로드, 팔자판 미리보기 후 진행.
  - "+ 새로 입력" → `ProfileForm` → "지인 목록에 저장" 체크박스. 체크 시 `POST /api/profiles` 후 그 id 사용, 미체크 시 일회성 inline 진행.
- 계정 사주가 아직 없으면 피커는 "내 사주" 자리에 "내 사주 입력" 을 노출한다.

### API 변경 — profile_id 수용
- `/api/readings` POST: 다음 중 하나를 받는다.
  - `profileId` (기존, 소유권 확인) → 그 프로필 birth 로 서버에서 `calcSaju` → readings INSERT (새 프로필 INSERT 없음).
  - inline `profile` input (일회성) → `calcSaju` → readings INSERT with `profile_id=null`.
  - inline `profile` input + `save=true` → 프로필 INSERT 후 그 id 로 readings INSERT.
- `/api/fortune/create` POST: 기존 `input`(inline) 외에 `profileId`(저장된 프로필)도 받는다. `profileId` 주어지면 birth 로드 → `calcSaju`. 둘 다 없으면 400.

---

## Section E — 팔자판 시주-left (전역)

- `components/saju/SajuBoard.tsx`, `components/saju/SajuBoardCompact.tsx` 의 기둥 렌더 순서를 **연→월→일→시** 에서 **시 → 일 → 월 → 연** 으로 뒤집는다.
- 일주(일간) 강조 별표 등 기존 표시 로직은 그대로 유지하되, 위치만 새 순서에 맞춘다.
- 사용처 전체(reading / result / 마이페이지 / 피커)에 일괄 적용 — 사용자 요구 "항상".

---

## Section F — 범위 밖 (별도 기획)

- 궁합처럼 여러 사람 사주를 **동시에** 선택/입력하는 다인 플로우 + compat 상품 활성화.
- 과거 중복 프로필 행 dedup 마이그레이션.

---

## 구현 영향 요약

코드 변경 대상:
1. 신규 마이그레이션 — `readings.profile_id` FK CASCADE → SET NULL.
2. 신규 `lib/saju/profile-input.ts` — `validateProfile` 추출 (DRY).
3. 신규 `app/api/profiles/route.ts` (GET/POST) + `app/api/profiles/[id]/route.ts` (PATCH/DELETE).
4. `app/api/readings/route.ts` — `profileId` 재사용 분기 + 일회성/저장 분기.
5. `app/api/fortune/create/route.ts` — `profileId` 수용.
6. 신규 `components/saju/ProfileForm.tsx` (이름·관계 + SajuInputForm 래퍼), `components/saju/ProfilePicker.tsx`.
7. `app/mypage/page.tsx` — 프로필 카드 DB 기반 전환 + 지인 목록 섹션.
8. `app/(consultations)/saju/page.tsx`, `app/fortune/[type]/page.tsx` — 피커 진입 통합.
9. `components/saju/SajuBoard.tsx`, `SajuBoardCompact.tsx` — 시주-left 순서 반전.
