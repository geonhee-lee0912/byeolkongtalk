# P2 — 우리 사이 파일 허브 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **UI plan note:** 시각 정본은 **스펙 §"P2 파일 허브 화면 상세"** (`docs/superpowers/specs/2026-08-03-우리사이-시뮬레이션-design.md`)와 브레인스토밍 목업(`.superpowers/brainstorm/117-1785753946/content/p2-*.html`, gitignore). 각 태스크는 **인터페이스·데이터 흐름·API 계약**을 완전 명시하고, 픽셀/JSX 세부는 스펙 §P2 + 앱의 기존 Tailwind 토큰(`app/globals.css`)을 따른다. 검증은 tsc + dev preview(브라우저).

**Goal:** 우리 사이 탭을 "프로필 + 상품 목록" 허브로 재구성한다 — 상단 상대 스위처(나 앵커 + 상대 인형, 1:N), 인형 아바타, 중앙 모달 편집(생일·MBTI·성격), 새 사람 슬롯 플로우. P1 백엔드 위 프론트이며 시뮬은 P3 대기(자리만).

**Architecture:** `user_profiles`를 확장(`mbti`·`personality` nullable + `birth_date` nullable화)해 사람 속성을 한 곳에 둔다. `GET /api/relationship`을 단수→**목록+선택 상대+나** 반환으로 확장(1:N). 허브 `page.tsx`는 `Switcher`+`ProfileCard`+`ProductList` 컴포넌트를 조합. 편집은 `ProfileForm` 확장을 중앙 모달로. 슬롯은 P1 `getSlotInfo`/`create_relationship`/`POST /slot` 배선.

**Tech Stack:** Next.js 16 (App Router, Client Components) · React 19 · Tailwind v4 · Supabase · node:test + tsx

**Spec:** `docs/superpowers/specs/2026-08-03-우리사이-시뮬레이션-design.md` §"P2 파일 허브 화면 상세" (+ §3 입력, §4 대상 관리)

---

## File Structure

- **Create** `supabase/migrations/20260803010000_profile_mbti_personality.sql` — user_profiles 확장
- **Modify** `lib/saju/profile-input.ts` — validateProfile: birthDate 옵션화 + mbti/personality 검증
- **Modify** `lib/saju/calc.ts` (호출부) — birth_date 없는 프로필 사주 스킵 가드
- **Modify** `lib/relationship/types.ts` — `MBTI_OPTIONS`(16)·`DOLL_COLORS`(관계별)·타입
- **Create** `components/relationship/DollAvatar.tsx` — 관계별 색 인형 + 나 프사/이니셜 폴백
- **Modify** `components/saju/ProfileForm.tsx` — MBTI 드롭다운·성격 textarea·생일 "몰라요" 옵션화
- **Create** `components/relationship/ProfileEditModal.tsx` — 나·상대 공통 편집 모달(RelationshipEditModal 대체/일반화)
- **Create** `components/relationship/HubSwitcher.tsx` — 나 앵커 + 상대 인형 + [＋]
- **Create** `components/relationship/ProfileCard.tsx` + `ProductList.tsx` — 선택 대상 프로필 + 상품 목록
- **Create** `components/relationship/AddPersonSheet.tsx` — 슬롯 시트(무료/구매/상점)
- **Modify** `app/api/relationship/route.ts` — GET 목록화(relationships[]+self), self 프로필 PATCH 분기
- **Modify** `app/relationship/page.tsx` — 허브 재구성(컴포넌트 조합, 상대 선택 상태)

---

### Task 1: DB — user_profiles 확장 (mbti·personality + birth_date nullable)

**Files:** Create `supabase/migrations/20260803010000_profile_mbti_personality.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 20260803010000_profile_mbti_personality.sql — 프로필에 MBTI·성격 + 생일 옵션화
-- P2: 사람 속성(생일·MBTI·성격)이 다 독립 옵션 → 생일 없이도 프로필 존재 가능.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mbti VARCHAR(4);        -- NULL=모름
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS personality TEXT;       -- NULL=미입력, 자유서술
ALTER TABLE user_profiles ALTER COLUMN birth_date DROP NOT NULL;           -- 생일 옵션화
```

- [ ] **Step 2: dev에서 ALTER 실행 검증** — 세 문장을 dev DB에서 실행해 에러 없는지(컬럼 존재/기존 데이터 무영향). `birth_date DROP NOT NULL`은 기존 값 있는 행에 무영향(신규만 null 허용).

- [ ] **Step 3: 커밋**
```bash
git add supabase/migrations/20260803010000_profile_mbti_personality.sql
git commit -m "feat(profile): user_profiles에 mbti·personality + birth_date nullable"
```

---

### Task 2: 사주 null 가드 — birth_date 없는 프로필은 사주 스킵

**Files:** Modify `lib/saju/calc.ts` 호출부 및/또는 `lib/saju/profile-input.ts`

- [ ] **Step 1: calcSaju 호출 경로 조사** — `lib/saju/calc.ts`의 `calcSaju(input)`이 birth_date(year/month/day) 필수 가정인지 확인(Read). 궁합/시뮬/사주 리포트가 partner/self 프로필의 birth_date를 calcSaju에 넘기는 지점을 grep(`calcSaju(`).

- [ ] **Step 2: 가드 추가** — birth_date가 null인 프로필을 calcSaju에 넘기기 전에 걸러 "사주 없음"으로 처리. 정확한 지점은 조사 결과에 따르되, 원칙: **birth_date null → calcSaju 호출 안 함**, 궁합/시뮬은 "생일 알려주면 궁합까지" 안내로 폴백(스펙 §P2 프로필 카드 문구와 일치). 이 태스크는 P2가 만든 "생일 없는 프로필"이 기존 사주 경로를 깨지 않게 하는 방어.

- [ ] **Step 3: 타입체크 + 커밋**
```bash
npx tsc --noEmit
git add lib/saju/
git commit -m "fix(saju): birth_date 없는 프로필은 사주 계산 스킵(가드)"
```

⚠️ 이 태스크는 조사 의존 — calcSaju 호출부가 예상과 다르면 DONE_WITH_CONCERNS로 보고하고 어디에 가드가 필요한지 명시.

---

### Task 3: types.ts — MBTI 상수·인형 색·페이로드 확장

**Files:** Modify `lib/relationship/types.ts`

- [ ] **Step 1: 추가**
```ts
/** MBTI 16 + 건너뛰기. 드롭다운 옵션(서버는 4글자 문자열 저장). */
export const MBTI_OPTIONS = [
  "ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP",
  "ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ",
] as const;
export type Mbti = (typeof MBTI_OPTIONS)[number];

/** 관계 상태별 인형 아바타 색(스펙 §P2). CSS 그라데이션용 [밝은, 진한]. */
export const DOLL_COLORS: Record<RelationshipStatus, [string, string]> = {
  crush:    ["#F7C6D9", "#EFA9C2"], // 썸 분홍
  dating:   ["#F4A6A6", "#E87C7C"], // 연인 빨강
  onesided: ["#D9C6F7", "#B8A9EF"], // 짝사랑 보라
  breakup:  ["#D4D0DB", "#B3AEC0"], // 이별 회색
};
```

- [ ] **Step 2: 유닛 테스트** — `lib/relationship/dolls.test.ts` (node:test): `MBTI_OPTIONS.length === 16`, 모든 `RelationshipStatus` 키가 `DOLL_COLORS`에 존재(누락 시 렌더 크래시 방지 — recurring-crash-class 교훈).
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MBTI_OPTIONS, DOLL_COLORS } from "./types.ts";
test("MBTI 16개", () => assert.equal(MBTI_OPTIONS.length, 16));
test("모든 관계 상태에 인형 색", () => {
  for (const s of ["crush","dating","breakup","onesided"] as const)
    assert.ok(DOLL_COLORS[s], `누락: ${s}`);
});
```
- [ ] **Step 3:** `node --import tsx --test lib/relationship/dolls.test.ts` → pass 2. 커밋.

---

### Task 4: DollAvatar 컴포넌트

**Files:** Create `components/relationship/DollAvatar.tsx`

- [ ] **Step 1: 컴포넌트 작성** — 인터페이스:
```ts
interface DollAvatarProps {
  kind: "partner" | "me";
  status?: RelationshipStatus;   // partner일 때 색 결정
  imageUrl?: string | null;      // me일 때 카톡 프사(없으면 이니셜/기본)
  name?: string;                 // me 이니셜 폴백용
  size?: number;                 // px, 기본 44
}
```
동작: `kind==="partner"` → `DOLL_COLORS[status]` 그라데이션 원 + 🧸. `kind==="me"` → `imageUrl` 있으면 `next/image`, 없으면 금색 원 + 이름 첫 글자(또는 🙂). 스펙 §P2 아바타 규칙.

- [ ] **Step 2:** tsc → 0. 커밋. (시각 검증은 Task 8 허브 조합 후 브라우저에서)

---

### Task 5: ProfileForm 확장 — MBTI·성격·생일 옵션화

**Files:** Modify `components/saju/ProfileForm.tsx` (+ `ProfilePayload`)

- [ ] **Step 1: ProfilePayload 확장** — `mbti: string | null`, `personality: string | null` 추가. `birthDate: string | null`(옵션화).
- [ ] **Step 2: 폼 UI 추가** — SajuInputForm 아래(또는 통합)에 MBTI 드롭다운(`MBTI_OPTIONS` + "모름"), 성격 `<textarea>`(멀티라인, maxLength 예 500). 생일에 "시간 몰라요"는 기존 SajuInputForm에 있는지 확인, **생일 자체 "몰라요"**(birthDate null 제출) 경로 추가. "더 정확하게" 섹션은 **기본 펼침**(스펙 §P2).
- [ ] **Step 3:** onSubmit 페이로드에 mbti·personality·(nullable)birthDate 포함. tsc → 0. 커밋.

⚠️ SajuInputForm이 birthDate를 필수로 강제하면(제출 막음) 그 가드를 "생일 몰라요" 시 우회하도록 최소 수정. SajuInputForm 구조는 구현 시 Read.

---

### Task 6: ProfileEditModal — 나·상대 공통 편집 모달

**Files:** Create `components/relationship/ProfileEditModal.tsx` (기존 `RelationshipEditModal` 일반화; page.tsx의 사용처 교체)

- [ ] **Step 1: 인터페이스**
```ts
interface ProfileEditModalProps {
  target: "me" | { relationshipId: string; label: string; status: RelationshipStatus };
  initial?: Partial<ProfilePayload> & { label?: string; status?: RelationshipStatus };
  onClose: () => void;
  onSaved: () => void;
}
```
- [ ] **Step 2:** 기존 `RelationshipEditModal`(호칭·관계칩 + ProfileForm) 구조 재사용하되 target 분기:
  - `target !== "me"`(상대): 호칭·관계칩 + 확장 ProfileForm → `PATCH /api/relationship`(label·status·partnerProfile{birth·mbti·personality})
  - `target === "me"`(나): 호칭·관계칩 숨김, 확장 ProfileForm(self) → **self 프로필 저장 경로**(Task 7의 self PATCH). 중앙 모달, "더 정확하게" 기본 펼침.
- [ ] **Step 3:** tsc → 0. 커밋. (기존 RelationshipEditModal import처는 Task 8에서 교체)

---

### Task 7: API — GET 목록화 + self 프로필 PATCH

**Files:** Modify `app/api/relationship/route.ts`

- [ ] **Step 1: GET 확장** — 현재 "최근 1개"에서 **목록 + 선택 상대 + 나**로:
```
{ relationships: [{id,label,status,partnerProfileId,partner:{mbti,personality,birthDate...}}...],
  selectedId, // last_visited 최신
  self: { id, mbti, personality, birthDate, ... } | null,  // self_profile
  pass, daily, messages(선택 상대), activeSkill }
```
기존 단수 소비처(P2 이전 page.tsx)는 Task 8에서 교체되므로 형태 변경 OK. self는 `user_profiles where user_id AND is_primary`(또는 relation_type='self').
- [ ] **Step 2: PATCH self 분기** — body에 `target:"me"`(또는 self 표식)면 self_profile(is_primary) upsert(mbti·personality·birth). 기존 상대 PATCH는 유지(단 partnerProfile에 mbti·personality 추가 반영 — `profile-input`/insert에 컬럼 추가).
- [ ] **Step 3:** tsc → 0. dev에서 GET/PATCH 실호출(카나리아: 세션 주입) 형태 확인. 커밋.

---

### Task 8: 허브 컴포넌트 조합 — Switcher·ProfileCard·ProductList + page.tsx 재구성

**Files:** Create `HubSwitcher.tsx`·`ProfileCard.tsx`·`ProductList.tsx`; Modify `app/relationship/page.tsx`

- [ ] **Step 1: 컴포넌트 3개** (스펙 §P2 + 목업 `p2-me-switcher.html`):
  - `HubSwitcher`: props `{ me, relationships[], selectedId, onSelect, onAddPerson }` → 나 앵커(DollAvatar me) │ 디바이더 │ 상대 인형들(DollAvatar partner) │ [＋]
  - `ProfileCard`: props `{ target: "me" | relationship, onEdit }` → 나=프사+궁합재료 / 상대=인형+이름·관계·기록칩. [수정]→모달
  - `ProductList`: props `{ relationshipId, onOpenThread }` → 💬 연애 상담(활성) · 🎭 시뮬(disabled "곧") · ┈미래 자리. 스킬은 상품 아님(스레드 내)
- [ ] **Step 2: page.tsx 재구성** — GET(목록) fetch → 상태: `selectedId`(나 or 상대). 미등록(relationships 빈): 나 앵커 + [＋첫 사람] + 등록 유도. 선택=나: ProfileCard(me)+"편집은 여기"(모달). 선택=상대: ProfileCard(상대)+ProductList. [별콩이랑 얘기]→기존 ThreadChat 진입(현행 스레드 로직 유지). RelationshipEditModal import를 ProfileEditModal로 교체.
- [ ] **Step 3: dev preview 브라우저 검증** — `preview_start` → 세션 주입(browser-e2e-session-injection) → 미등록/1명/여러명/나 선택 각 렌더 + 스위처 전환 + 편집 모달. 콘솔 에러 0. 스크린샷.
- [ ] **Step 4:** tsc → 0. 커밋.

---

### Task 9: 새 사람 추가 — AddPersonSheet(슬롯 플로우)

**Files:** Create `components/relationship/AddPersonSheet.tsx`; wire in page.tsx

- [ ] **Step 1: 플로우** (스펙 §P2 + 목업 `p2-slot-flow.html`): `[＋]` → `GET /api/relationship`의 slot 정보(또는 별도 `getSlotInfo` 노출) 판정:
  - 허용량 남음(첫 사람 무료 포함) → 등록 모달(ProfileEditModal target=신규, 이름·관계 게이트 + 옵션 펼침) → `POST /api/relationship`
  - 슬롯 필요 → 슬롯 시트(⭐`SLOT_COST` + 내 별) → [슬롯 열고 추가] → `POST /api/relationship/slot` → 성공 시 등록 모달 / 별 부족(402 insufficient) → 상점(`/shop`) 유도
- [ ] **Step 2:** `POST /api/relationship`가 402 `SLOT_REQUIRED`면 슬롯 시트로 전환(방어적 이중). 별 잔액은 `/api/stars/balance`.
- [ ] **Step 3: dev preview 검증** — 무료 등록 / (수동으로 관계 1개 만든 뒤) 2번째=슬롯 시트 / 잔액 낮춰 상점 유도. tsc → 0. 커밋.

---

## Self-Review

**1. Spec §P2 coverage:** 스위처(T8)·프로필 카드(T8)·상품 목록(T8)·인형 아바타(T4)·중앙 모달 편집 나+상대(T6)·생일 피커/MBTI/성격(T5)·`user_profiles` 원천(T1·T7)·새 사람 슬롯 플로우(T9)·MBTI·성격 DB(T1). 카톡 프사 = T4 폴백(이니셜) + 잔여(OAuth scope 배선은 후속, 아래 명시). ✅

**2. Placeholder scan:** UI 태스크는 인터페이스·데이터 흐름·API 계약을 명시하고 시각은 스펙§P2/목업/globals.css 참조(의도된 UI-plan 레벨). Task 2·5는 조사 의존을 DONE_WITH_CONCERNS 경로로 명시. 빈 TBD 없음.

**3. 타입 일관성:** `ProfilePayload`(mbti·personality·nullable birthDate, T5) ↔ ProfileEditModal(T6)·API PATCH(T7)·POST partnerProfile. `DollAvatar` props(T4) ↔ Switcher·ProfileCard(T8). `MBTI_OPTIONS`/`DOLL_COLORS`(T3) ↔ ProfileForm(T5)·DollAvatar(T4).

**의존 순서:** T1(DB)→T2(가드)·T3(types) → T4·T5 → T6·T7 → T8(조합) → T9. T8이 통합점(브라우저 검증 여기).

---

## 잔여 / 후속 (실행 전 인지)

- **카톡 프사 배선** = 후속. 현재 카카오 OAuth가 프사를 안 받아옴(lib grep 0). T4는 **이니셜/기본 폴백**으로 MVP. 실제 프사는 OAuth scope(`profile_image`) 추가 + `users` 프사 컬럼 + 콜백 저장 + **카카오 콘솔 설정(사용자 손)** = 별도 작업. P2는 폴백으로 완결하고 프사는 나중.
- **인형 아바타** = 관계별 색 프리셋(T4). 정교한 인형 일러스트 에셋은 나중(힉스필드 크레딧 0).
- **prod 금지** — dev까지만(사용자 지시). P3 시뮬까지 된 뒤 prod.
- **어드민** = P3 후 "어드민 구성 한번에"(1:N 여파 포함, 메모리 기록).
