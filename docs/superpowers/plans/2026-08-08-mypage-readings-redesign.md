# 마이 탭 + 보관함 재설계 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마이를 "내 것들 허브"(프로필헤더 + 종목별 보관함 요약 + 사주 요약·모달 + 계정)로 재구성하고, 보관함(`/readings`)을 종목 칩 4개 + 상태 배지로 세분화해 시뮬·우리 사이 기록까지 노출한다.

**Architecture:** 종목 분류는 순수 헬퍼(TDD)로 단일화한다. `/api/readings` GET은 이미 시뮬(`relationship_sim`)을 반환하므로 페이지 분류만 확장하고, 우리 사이 스레드는 기존 `/api/relationship` GET(P2 shape)에서 가져온다. 마이의 사주 프로필 인라인 관리는 모달로 옮겨 `page.tsx`를 축소한다.

**Tech Stack:** Next.js 16 App Router(client components), Supabase, Vitest/node:test(순수 헬퍼), 기존 별콩톡 Tailwind 토큰.

**Spec:** `docs/superpowers/specs/2026-08-08-mypage-readings-redesign-design.md`

---

## File Structure

- `lib/readings/category.ts` — (신규) 종목 분류 순수 헬퍼 `readingCategory()` + 상태 `readingStatus()`
- `lib/readings/category.test.ts` — (신규) 헬퍼 테스트
- `app/api/readings/route.ts` — (수정) GET: 시뮬(`relationship_sim`)이 consult로 오분류되지 않게 분류 근거 필드 보강(현재 반환값 유지 + 확인)
- `app/readings/page.tsx` — (수정) 2탭 → 종목 칩 4개 + 상태 배지 + `?tab=` 딥링크 + 시뮬/우리 사이 렌더
- `app/mypage/page.tsx` — (수정) 재구성: 프로필헤더 + 종목 요약 4카드 + 사주 요약 + 계정
- `components/mypage/StorageSummary.tsx` — (신규) 종목별 요약 4카드(그리드)
- `components/mypage/SajuProfileModal.tsx` — (신규) 내 명식 + 지인 사주 편집 모달(기존 인라인 로직 이관)

---

## Task 1: 종목 분류 순수 헬퍼 (TDD)

**Files:**
- Create: `lib/readings/category.ts`
- Test: `lib/readings/category.test.ts`

보관함 항목 하나를 받아 종목(`tarot`/`fortune`/`sim`/`relationship`)과 상태(`done`/`resume`/`ongoing`)를 결정하는 순수 함수. 보관함 페이지·마이 카운트가 이 하나를 공유한다(DRY).

- [ ] **Step 1: 실패 테스트 작성**

`lib/readings/category.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readingCategory } from "./category.ts";

const base = { consultationType: undefined, emotionTag: null, sajuData: null } as const;

test("타로 상담 → tarot", () => {
  assert.equal(readingCategory({ ...base, consultationType: "tarot" }), "tarot");
});
test("시뮬 → sim", () => {
  assert.equal(readingCategory({ ...base, consultationType: "relationship_sim" }), "sim");
});
test("운세(emotion_tag=fortune_*) → fortune", () => {
  assert.equal(readingCategory({ ...base, emotionTag: "fortune_today" }), "fortune");
});
test("사주 상담(fortune 태그 아님) → fortune", () => {
  assert.equal(readingCategory({ ...base, consultationType: "saju" }), "fortune");
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `node --import tsx --test lib/readings/category.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 최소 구현**

`lib/readings/category.ts` (⚠️ `fortuneTypeFromTag` 는 `@/lib/fortune/types` — 운세 판별 단일 원천, 재구현 금지):

```ts
import { fortuneTypeFromTag } from "@/lib/fortune/types";

export type ReadingCategory = "tarot" | "fortune" | "sim" | "relationship";

/** 보관함 종목 분류. 타로/시뮬은 consultationType, 운세는 emotion_tag(fortuneTypeFromTag), 나머지 사주는 fortune 로. */
export function readingCategory(r: {
  consultationType?: string | null;
  emotionTag?: string | null;
}): ReadingCategory {
  if (r.consultationType === "tarot") return "tarot";
  if (r.consultationType === "relationship_sim") return "sim";
  if (r.consultationType === "relationship") return "relationship";
  if (fortuneTypeFromTag(r.emotionTag ?? null)) return "fortune";
  return "fortune"; // 사주 상담·리포트
}
```

- [ ] **Step 4: 테스트 통과 확인** — Run: `node --import tsx --test lib/readings/category.test.ts` → PASS.

- [ ] **Step 5: 커밋** — `git add lib/readings/category.ts lib/readings/category.test.ts && git commit -m "feat(readings): 보관함 종목 분류 순수 헬퍼(TDD)"`

---

## Task 2: /api/readings GET — 시뮬 포함 확인 + 상태 필드

**Files:**
- Modify: `app/api/readings/route.ts` (GET, 62~153행)

GET은 `.neq("consultation_type","relationship")` 라 시뮬(`relationship_sim`)은 이미 포함된다. 시뮬 상태(진행/완료)를 페이지가 쓸 수 있게 `saju_data.phase` 가 반환에 실려오는지 확인하고(현재 `sajuData: r.saju_data` 로 실림 — OK), 시뮬 판이 consult 미리보기 조회에서 불필요하게 섞이지 않는지만 점검한다.

- [ ] **Step 1: 현재 동작 확인 (읽기)** — GET 반환의 `sajuData` 에 시뮬 판 `phase`(`stage`/`debriefed`)가 포함됨을 코드로 확인. `consultationType: "relationship_sim"` 도 그대로 실림. **추가 변경 없이 페이지(Task 3)가 분류 가능**하면 이 태스크는 확인만 하고 다음으로.

- [ ] **Step 2: (필요 시) 시뮬 미리보기 안전** — 시뮬 판은 `messages` 에 인형 대사가 있어 `buildPreview` 가 대사를 미리보기로 뽑을 수 있다. consult(타로) 전용 로직(`endedSet`/`resultReady`)에 `relationship_sim` 이 섞이지 않게 `consultIdSet` 이 `fortuneTypeFromTag` 로만 나뉘는 현 로직을 `readingCategory` 기준으로 교체(sim/relationship 제외). Task 1 헬퍼 import.

- [ ] **Step 3: 타입 체크** — Run: `npx tsc --noEmit` → 에러 없음.

- [ ] **Step 4: 커밋** — `git add app/api/readings/route.ts && git commit -m "feat(readings): GET 시뮬 분류 정합(readingCategory 기준)"`

---

## Task 3: 보관함 페이지 재구성 — 종목 칩 + 상태 + 시뮬/우리 사이

**Files:**
- Modify: `app/readings/page.tsx`

2탭(consult/fortune) → 종목 칩 4개(타로/사주·운세/시뮬/우리 사이). `?tab=` URL 파라미터로 마이 카드 딥링크. 각 항목 상태 배지. 우리 사이는 `/api/relationship` GET(P2 shape)에서, 나머지는 `/api/readings` 에서.

- [ ] **Step 1: 종목 칩 + `?tab=` 배선** — `READINGS_TABS` 를 4종목으로 교체: `tarot`/`fortune`/`sim`/`relationship`. `useSearchParams().get("tab")` 로 초기 칩 결정(없으면 `tarot`). `readingCategory`(Task 1)로 `readings` 를 4버킷 분류.

- [ ] **Step 2: 시뮬 항목 렌더** — `sim` 버킷: `sajuData.phase === "debriefed"` → 완료 배지 + 탭 시 디브리핑(`/relationship/sim` 재열람 경로는 구현 시 확인; 판 id 로 디브리핑 표시). `phase === "stage"` → "이어하기" 배지 + `/relationship/sim?rel=<relationshipId>` 로. (relationshipId 소스: reading.relationship_id — GET 반환에 없으면 `select` 에 추가.)

- [ ] **Step 3: 우리 사이 항목 렌더** — `/api/relationship` GET(P2 shape: `relationships[]`)을 페이지 로드 시 함께 fetch. 관계별 1항목, `last_visited_at` 내림차순(GET 반환에 없으면 relationships select 에 추가). 탭 → 우리 사이 스레드(`/relationship?rel=<id>` 또는 현행 진입 경로 확인).

- [ ] **Step 4: 상태 배지 공통화** — 완료/이어하기/진행중 배지를 종목 공통 스타일로. 타로·사주는 현행 유지.

- [ ] **Step 5: 브라우저 검증** — dev 프리뷰 + 세션 쿠키 주입([[browser-e2e-session-injection]] 패턴). `?tab=sim`·`?tab=relationship` 딥링크, 각 종목 목록·배지·콘솔 0 확인.

- [ ] **Step 6: 커밋** — `git add app/readings/page.tsx && git commit -m "feat(readings): 종목 칩 4종 + 상태 배지 + 시뮬·우리사이 노출"`

---

## Task 4: 마이 종목 요약 4카드

**Files:**
- Create: `components/mypage/StorageSummary.tsx`
- Modify: `app/mypage/page.tsx` (보관함 단일 링크 → 이 컴포넌트로 교체)

종목별 개수 2×2 그리드. 탭 → `/readings?tab=<종목>`. 개수는 `/api/readings`(타로·사주·시뮬) + `/api/relationship`(우리 사이) 에서 `readingCategory` 로 집계.

- [ ] **Step 1: 컴포넌트 작성** — `StorageSummary({ counts }: { counts: { tarot: number; fortune: number; sim: number; relationship: number } })`. 4카드(🔮 타로 / 📜 사주·운세 / 🎭 시뮬 / 💬 우리 사이) + `Link href={/readings?tab=...}`. 별콩톡 토큰(흰 카드·lilac 보더).

- [ ] **Step 2: 마이에서 집계 전달** — `mypage/page.tsx` 의 기존 `/api/readings`·`/api/relationship` fetch 결과에서 `readingCategory` 로 count 산출해 `StorageSummary` 에 전달. 기존 "내 고민톡 보관함" 단일 링크(284~300행) 제거.

- [ ] **Step 3: 타입 체크 + 브라우저 검증** — `npx tsc --noEmit` → 0. 프리뷰에서 4카드·개수·딥링크 확인.

- [ ] **Step 4: 커밋** — `git add components/mypage/StorageSummary.tsx app/mypage/page.tsx && git commit -m "feat(mypage): 종목별 보관함 요약 4카드"`

---

## Task 5: 사주 프로필 편집 모달

**Files:**
- Create: `components/mypage/SajuProfileModal.tsx`
- Modify: `app/mypage/page.tsx` (인라인 사주 관리 → 요약 카드 + 모달)

내 명식(`ProfileForm mode="self"`) + 지인 사주(추가/수정/삭제·페이지네이션)를 모달로 이관. 마이엔 요약 카드(내 명식 일주 or "생일 미입력" + 지인 N명)만 남기고 "관리" 버튼이 모달을 연다.

- [ ] **Step 1: 모달 컴포넌트** — 기존 `mypage/page.tsx` 의 사주 관리 로직(self `ProfileForm`, 지인 목록·`ProfileForm mode="acquaintance"`·케밥·삭제확인·페이지네이션)을 `SajuProfileModal` 로 이동. props: `profiles`, `onReload`, `onClose`. `ProfileForm`·`SajuBoard` 재사용. ⚠️ 지인 삭제 시 `relationshipProfileIds`(연애 상담 사용 중) 경고 유지.

- [ ] **Step 2: 마이 요약 카드 + 모달 토글** — `mypage/page.tsx` 프로필 카드(302~404행)·지인 섹션(406~569행)을 요약 카드 + "관리"(→모달)로 축소.

- [ ] **Step 3: 타입 체크 + 브라우저 검증** — 명식 표시·모달 열림·지인 추가/수정/삭제·연애상담 사용중 경고 동작 확인.

- [ ] **Step 4: 커밋** — `git add components/mypage/SajuProfileModal.tsx app/mypage/page.tsx && git commit -m "feat(mypage): 사주 프로필 요약 + 편집 모달"`

---

## Task 6: 마이 프로필 헤더 통합 + 최종 정리

**Files:**
- Modify: `app/mypage/page.tsx`

별 잔액 카드 + 프로필 정보를 프로필 헤더 카드 하나로 통합하고, 블록 순서를 스펙대로(헤더 → 보관함 요약 → 사주 요약 → 계정) 정리.

- [ ] **Step 1: 프로필 헤더** — 프사·닉네임·별 잔액·충전 버튼 통합 카드. 기존 별잔액 카드(256~281행)와 프로필 헤더를 합침. 결제·별 내역 링크는 계정 블록으로.
- [ ] **Step 2: 블록 순서 정리** — 헤더 → `StorageSummary` → 사주 요약 → 계정(결제내역·고객센터·로그아웃·탈퇴) → Footer. 죽은 import·state 제거.
- [ ] **Step 3: 타입 체크 + 브라우저 검증** — 전체 마이 렌더·스크롤·모달·콘솔 0.
- [ ] **Step 4: 커밋** — `git add app/mypage/page.tsx && git commit -m "feat(mypage): 프로필 헤더 통합 + 블록 재정렬"`

---

## Task 7: E2E 검증 + 마감

- [ ] **Step 1: 전체 흐름** — 마이 4카드 → 각 `?tab=` 딥링크 → 보관함 종목별 목록·배지. 시뮬 완료/진행 항목, 우리 사이 시간순. 사주 모달 편집.
- [ ] **Step 2: 회귀** — 타로·사주 보관함 기존 동작(이어하기·후속 상담·생성중 폴링) 유지 확인.
- [ ] **Step 3: `npx tsc --noEmit` + 유닛(`category.test`) + 콘솔 0.**
- [ ] **Step 4: 마감** — `superpowers:finishing-a-development-branch` 로 dev 반영(사용자 확인 후 push).

---

## Self-Review 체크

- **Spec 커버리지:** 마이 프로필헤더(T6)·종목 요약 4카드(T4)·사주 요약+모달(T5)·계정(T6) / 보관함 종목 칩+상태(T3)·`?tab=`(T3)·시뮬(T3)·우리사이(T3) / 데이터 확장(T2·T3) / 종목 분류 단일화(T1) — 전부 커버.
- **열린 세부(구현 시 확인):** 시뮬 디브리핑 재열람 경로 · 우리 사이 스레드 진입 경로 · `relationship_id`/`last_visited_at` 가 각 GET select 에 있는지 → 없으면 select 에 추가.
- **타입 일관성:** `readingCategory` 반환 `"tarot"|"fortune"|"sim"|"relationship"` ↔ 보관함 칩·`StorageSummary.counts` 키 일치.
