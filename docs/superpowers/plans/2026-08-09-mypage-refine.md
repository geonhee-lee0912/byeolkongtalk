# 마이 탭 리파인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마이페이지를 4가지로 다듬는다 — 보관함 한 박스 컴팩트화(시안 3) · 프로필 그라데이션 교체(B) · 내 명식 인라인 노출 + 지인 사주 팝업 분리 · 소제목 3개(보관함/내 사주/계정).

**Architecture:** 순수 프레젠테이션 변경. `StorageSummary`를 가로 4분할로 재작성하고, `SajuProfileModal`(명식+지인 한 몸)을 `SelfSajuEditModal`(명식 편집) + `AcquaintanceListModal`(지인 팝업)로 분해한다. 공유 타입·헬퍼는 `sajuShared.ts`로 추출(3중 복제 방지). `app/mypage/page.tsx`는 블록 재배치 + 명식 SajuBoard 인라인.

**Tech Stack:** Next.js 16 (App Router, React 19, TS strict) · Tailwind v4 `@theme` 토큰 · 클라이언트 컴포넌트.

**검증 방식(중요):** 이 저장소엔 React 컴포넌트 테스트 러너가 없다(vitest/jest/testing-library 미설치, `test` 스크립트 없음). UI 검증 = **`npx tsc --noEmit`(빠른 타입 게이트) + `npm run build`(권위 게이트, exit 0) + 브라우저 렌더 E2E**. 레이아웃 tweak 하나 때문에 컴포넌트 테스트 하네스를 새로 들이지 않는다(YAGNI/surgical). 각 task는 "코드 작성 → tsc → 커밋"으로 진행하고, 마지막 task에서 build + 브라우저로 실증한다.

**커밋 규칙:** 브랜치 `dev`. 커밋 메시지 말미에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. (실제 커밋은 사용자 승인 후 — 실행 핸드오프에서 확인.)

---

## File Structure

- **Create** `components/mypage/sajuShared.ts` — `ProfileItem` 타입 + `RELATION_LABEL`·`birthTimeToBranchHour`·`birthTimeToSijin`·`toInitial` 헬퍼(두 모달 공유).
- **Rewrite** `components/mypage/StorageSummary.tsx` — 2×2 그리드 → 한 박스 가로 4분할(시안 3). props·딥링크 불변.
- **Create** `components/mypage/SelfSajuEditModal.tsx` — 내 명식 편집 모달(`ProfileForm mode="self"`).
- **Create** `components/mypage/AcquaintanceListModal.tsx` — 지인 사주 팝업(목록·추가/수정·케밥·삭제확인·페이지네이션).
- **Modify** `app/mypage/page.tsx` — 그라데이션·소제목 3개·명식 인라인·모달 배선·import/state 교체.
- **Delete** `components/mypage/SajuProfileModal.tsx` — 두 모달로 분해 완료 후 제거.

의존 순서: sajuShared → (StorageSummary ∥ SelfSajuEditModal ∥ AcquaintanceListModal) → page.tsx → delete → verify.

---

## Task 1: 공유 타입·헬퍼 추출 (`sajuShared.ts`)

**Files:**
- Create: `components/mypage/sajuShared.ts`

- [ ] **Step 1: 파일 작성**

```ts
// components/mypage/sajuShared.ts
// 마이 사주 프로필 모달들(SelfSajuEditModal / AcquaintanceListModal)이 공유하는 타입·헬퍼.
// 원래 SajuProfileModal 에 인라인이던 것을 분해하며 3중 복제를 피하려 추출.
import type { SajuResult } from "@/lib/saju/calc";

export interface ProfileItem {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string | null; // P2: 생일 없는 프로필 가능
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  isPrimary: boolean;
  saju: SajuResult | null; // birthDate 없으면 서버가 계산 스킵 (null)
}

export const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

// HH:MM → HOUR_BRANCHES 시작 hour (prefill용). null이면 null(시간 모름).
export function birthTimeToBranchHour(t: string | null): number | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  if (h === 23) return 0; // 자시 23-01 → 0
  return h - (h % 2);
}

// 12시진 (자시 23~01 시작). 인덱스 0 = 자시.
const SIJIN = [
  { name: "자시", range: "23~01" },
  { name: "축시", range: "01~03" },
  { name: "인시", range: "03~05" },
  { name: "묘시", range: "05~07" },
  { name: "진시", range: "07~09" },
  { name: "사시", range: "09~11" },
  { name: "오시", range: "11~13" },
  { name: "미시", range: "13~15" },
  { name: "신시", range: "15~17" },
  { name: "유시", range: "17~19" },
  { name: "술시", range: "19~21" },
  { name: "해시", range: "21~23" },
];

// HH:MM → "미시 (13~15시)". null이면 null(시간 모름).
export function birthTimeToSijin(t: string | null): string | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  const s = SIJIN[idx];
  return `${s.name} (${s.range}시)`;
}

// birthDate 없는 프로필은 미리 채울 값이 없음 — 폼을 빈 상태로 시작(undefined).
export function toInitial(p: ProfileItem) {
  return p.birthDate
    ? {
        year: Number(p.birthDate.slice(0, 4)),
        month: Number(p.birthDate.slice(5, 7)),
        day: Number(p.birthDate.slice(8, 10)),
        hour: birthTimeToBranchHour(p.birthTime),
        isLunar: p.isLunarInput,
        isLeapMonth: p.isLeapMonth,
        gender: p.gender,
      }
    : undefined;
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 새 파일 관련 에러 없음. (기존 저장소 노이즈가 있으면 무시하고 이 파일 경로 에러만 확인.)

- [ ] **Step 3: 커밋**

```bash
git add components/mypage/sajuShared.ts
git commit -m "refactor(mypage): 사주 프로필 공유 타입·헬퍼 sajuShared 추출"
```

---

## Task 2: `StorageSummary` 가로 4분할 재작성 (시안 3)

**Files:**
- Modify (전체 교체): `components/mypage/StorageSummary.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
// components/mypage/StorageSummary.tsx — 마이 "보관함" 종목별 요약을 한 박스 가로 4분할로.
// 각 칸 탭 → /readings?tab=<종목>. 시안 3: [아이콘 + 개수] 한 줄, 라벨 아래.
import Link from "next/link";
import type { ReadingCategory } from "@/lib/readings/category";

export interface StorageSummaryProps {
  counts: Record<ReadingCategory, number>;
}

const ITEMS: { key: ReadingCategory; icon: string; label: string }[] = [
  { key: "tarot", icon: "🔮", label: "타로" },
  { key: "fortune", icon: "📜", label: "사주·운세" },
  { key: "sim", icon: "🎭", label: "시뮬" },
  { key: "relationship", icon: "💬", label: "우리 사이" },
];

export default function StorageSummary({ counts }: StorageSummaryProps) {
  return (
    <div className="flex bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] px-1 py-3">
      {ITEMS.map((item, i) => (
        <Link
          key={item.key}
          href={`/readings?tab=${item.key}`}
          className={`flex-1 flex flex-col items-center text-center px-1 ${
            i > 0 ? "border-l border-lilac-mid/15" : ""
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <span className="text-[15px]" aria-hidden>
              {item.icon}
            </span>
            <span className="text-[18px] font-bold text-eye-purple leading-none">
              {counts[item.key]}
            </span>
          </span>
          <span className="mt-1.5 text-[10.5px] text-text-light font-medium whitespace-nowrap">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (props 시그니처 `counts: Record<ReadingCategory, number>` 불변이라 호출부 page.tsx 영향 없음.)

- [ ] **Step 3: 커밋**

```bash
git add components/mypage/StorageSummary.tsx
git commit -m "feat(mypage): 보관함 요약을 한 박스 가로 4분할로 압축(시안 3)"
```

---

## Task 3: `SelfSajuEditModal` 생성 (내 명식 편집)

**Files:**
- Create: `components/mypage/SelfSajuEditModal.tsx`

- [ ] **Step 1: 파일 작성**

```tsx
"use client";

// 내 명식 편집 모달 — 원래 SajuProfileModal 의 "내 명식 편집" 파트를 분리.
// 명식 표시는 마이페이지 인라인(SajuBoard)이 담당하고, 이 모달은 편집만 담당한다.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import { type ProfileItem, toInitial } from "@/components/mypage/sajuShared";

interface SelfSajuEditModalProps {
  self: ProfileItem | null;
  /** self 프로필 신규 생성 시 이름 기본값(계정 닉네임) — ProfileForm mode="self" 용 */
  selfDisplayName: string;
  onReload: () => Promise<void>;
  onClose: () => void;
}

export default function SelfSajuEditModal({
  self,
  selfDisplayName,
  onReload,
  onClose,
}: SelfSajuEditModalProps) {
  const [saving, setSaving] = useState(false);

  // 배경 스크롤 잠금 — 마운트 동안 유지
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const saveSelf = async (payload: ProfilePayload) => {
    setSaving(true);
    try {
      const url = self ? `/api/profiles/${self.id}` : "/api/profiles";
      const method = self ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await onReload();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-cream z-10">
          <h2 className="text-[15px] font-bold text-eye-purple">
            {self?.saju ? "내 사주 수정" : "내 사주 입력"}
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>
        <div className="pb-5">
          <ProfileForm
            mode="self"
            initial={self ? toInitial(self) : undefined}
            defaultSelfName={selfDisplayName}
            submitLabel="저장하기"
            loading={saving}
            onSubmit={saveSelf}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. ⚠️ `ProfileForm` prop 이름(`mode`/`initial`/`defaultSelfName`/`submitLabel`/`loading`/`onSubmit`)이 안 맞으면 tsc가 잡는다 — `components/saju/ProfileForm.tsx` 시그니처와 대조해 정정.

- [ ] **Step 3: 커밋**

```bash
git add components/mypage/SelfSajuEditModal.tsx
git commit -m "feat(mypage): 내 명식 편집 모달 SelfSajuEditModal 분리"
```

---

## Task 4: `AcquaintanceListModal` 생성 (지인 사주 팝업)

**Files:**
- Create: `components/mypage/AcquaintanceListModal.tsx`

기존 `SajuProfileModal`의 "지인 사주" 섹션 + 케밥 시트 + 삭제 확인을 그대로 이관한다. 모달 제목이 "지인 사주"이므로 내부 섹션 라벨은 `전체 N`으로 바꾼다(중복 제거, 시안 ③과 동일).

- [ ] **Step 1: 파일 작성**

```tsx
"use client";

// 지인 사주 팝업 — 원래 SajuProfileModal 의 "지인 사주" 파트(목록·추가/수정·케밥·삭제확인·
// 페이지네이션)를 분리. 명식(self) 편집은 SelfSajuEditModal 이 담당.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import {
  type ProfileItem,
  RELATION_LABEL,
  birthTimeToSijin,
  toInitial,
} from "@/components/mypage/sajuShared";

interface AcquaintanceListModalProps {
  profiles: ProfileItem[];
  relationshipProfileIds: string[];
  onReload: () => Promise<void>;
  onClose: () => void;
}

export default function AcquaintanceListModal({
  profiles,
  relationshipProfileIds,
  onReload,
  onClose,
}: AcquaintanceListModalProps) {
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddAcq, setShowAddAcq] = useState(false);
  const [editAcqId, setEditAcqId] = useState<string | null>(null);
  const [deleteAcqId, setDeleteAcqId] = useState<string | null>(null);
  const [deleteAck, setDeleteAck] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 배경 스크롤 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const acquaintances = profiles.filter((p) => !p.isPrimary);

  const LIST_PAGE_SIZE = 3;
  const totalListPages = Math.max(1, Math.ceil(acquaintances.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, totalListPages - 1);
  const pagedProfiles = acquaintances.slice(
    safeListPage * LIST_PAGE_SIZE,
    safeListPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE
  );

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
        await onReload();
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
      await onReload();
      setDeleteAcqId(null);
      setDeleteAck(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5"
        onClick={onClose}
      >
        <div
          ref={scrollRef}
          className="bg-cream rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-cream z-10">
            <h2 className="text-[15px] font-bold text-eye-purple">지인 사주</h2>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
            >
              ✕
            </button>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-bold text-eye-purple">
                전체 <span className="text-text-light/60 font-normal">{acquaintances.length}</span>
              </div>
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
              <div className="bg-white rounded-2xl p-4 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] mb-3">
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

            {acquaintances.length === 0 && !showAddAcq && !editAcqId ? (
              <div className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] px-4 py-6">
                <p className="text-[12px] text-text-light/70 text-center mb-3">
                  아직 함께 보는 사주가 없어. 지인 사주를 추가하면 여기에 모아서 함께 풀어볼 수 있어.
                </p>
                <button
                  onClick={() => setShowAddAcq(true)}
                  className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
                >
                  지인 추가하기
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pagedProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] p-3 flex items-center gap-3"
                  >
                    <div
                      className="shrink-0 w-11 h-11 rounded-xl border border-lilac-mid/30 flex items-center justify-center"
                      style={
                        p.saju
                          ? {
                              backgroundColor: ELEMENT_COLORS[p.saju.dayElement].bg,
                              color: ELEMENT_COLORS[p.saju.dayElement].text,
                            }
                          : undefined
                      }
                    >
                      <span className="text-[16px] font-bold leading-none">
                        {p.saju ? p.saju.pillars.day.hanja : "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-eye-purple truncate">
                        {p.displayName}
                        <span className="ml-1.5 text-[10px] font-bold text-text-light/70 bg-lilac-soft/60 rounded-full px-1.5 py-0.5">
                          {RELATION_LABEL[p.relationType] ?? "지인"}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-light/70 mt-0.5 truncate">
                        {p.saju && p.birthDate ? (
                          <>
                            {p.saju.dayStem}
                            {p.saju.dayElement} 일간 · {p.birthDate.replace(/-/g, ". ")}
                            {birthTimeToSijin(p.birthTime)
                              ? ` · ${birthTimeToSijin(p.birthTime)}`
                              : " · 시간 모름"}
                          </>
                        ) : (
                          "생일 미입력"
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSheetId(p.id)}
                      aria-label="더보기"
                      className="shrink-0 p-1.5 rounded-lg text-text-light/60 hover:bg-lilac-soft/50"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="12" cy="19" r="1.6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {totalListPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => setListPage((n) => Math.max(0, n - 1))}
                  disabled={safeListPage === 0}
                  aria-label="이전"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                {Array.from({ length: totalListPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setListPage(i)}
                    aria-label={`${i + 1}페이지`}
                    className={`w-7 h-7 rounded-lg text-[12px] font-bold ${
                      i === safeListPage
                        ? "bg-lilac-deep text-white"
                        : "text-text-light/70 hover:bg-lilac-soft/50"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setListPage((n) => Math.min(totalListPages - 1, n + 1))}
                  disabled={safeListPage === totalListPages - 1}
                  aria-label="다음"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 지인 행 케밥 팝업 */}
      {sheetId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-5"
          onClick={() => setSheetId(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xs p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setEditAcqId(sheetId);
                setShowAddAcq(false);
                setSheetId(null);
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="w-full py-3.5 rounded-xl text-[14px] text-eye-purple font-medium hover:bg-lilac-soft/40"
            >
              수정
            </button>
            <button
              onClick={() => {
                setDeleteAcqId(sheetId);
                setDeleteAck(false);
                setSheetId(null);
              }}
              className="w-full py-3.5 rounded-xl text-[14px] text-rose-500 font-medium hover:bg-rose-50"
            >
              삭제
            </button>
            <button
              onClick={() => setSheetId(null)}
              className="w-full py-3.5 rounded-xl text-[14px] text-text-light/70"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 지인 삭제 확인 모달 (연애 상담 사용 중이면 경고 체크 게이트) */}
      {deleteAcqId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-[14px] font-bold text-eye-purple mb-2">지인 사주 삭제</p>
            <p className="text-[12px] text-text-light leading-relaxed mb-4">
              이 지인 사주를 삭제할까? 과거 풀이 기록은 그대로 남아.
            </p>
            {relationshipProfileIds.includes(deleteAcqId) && (
              <div className="mb-4 rounded-xl bg-gold-soft/20 border border-gold/50 p-3">
                <p className="text-[12px] text-eye-purple leading-relaxed mb-2">
                  이 프로필은 &apos;연애 상담&apos;에서 사용 중이야 — 삭제하면 궁합을
                  다시 보려면 생년월일을 다시 등록해야 해.
                </p>
                <label className="flex items-center gap-2 text-[11.5px] text-text-light">
                  <input
                    type="checkbox"
                    checked={deleteAck}
                    onChange={(e) => setDeleteAck(e.target.checked)}
                    className="w-4 h-4 accent-rose-500"
                  />
                  확인했어, 그래도 삭제할게
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDeleteAcqId(null);
                  setDeleteAck(false);
                }}
                className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
              >
                취소
              </button>
              <button
                onClick={() => deleteAcquaintance(deleteAcqId)}
                disabled={relationshipProfileIds.includes(deleteAcqId) && !deleteAck}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`ELEMENT_COLORS`·`ProfileForm`·`sajuShared` import 경로 확인.)

- [ ] **Step 3: 커밋**

```bash
git add components/mypage/AcquaintanceListModal.tsx
git commit -m "feat(mypage): 지인 사주 팝업 AcquaintanceListModal 분리"
```

---

## Task 5: `app/mypage/page.tsx` 블록 재배치

**Files:**
- Modify: `app/mypage/page.tsx` (imports · state · 그라데이션 · 보관함 소제목 · 내 사주 블록 · 모달 배선)

기존 `self`(line 107)·`acquaintanceCount`(line 108)·`relationshipProfileIds`·`reloadProfiles` 는 그대로 있음. 아래 5개 Edit 을 순서대로 적용.

- [ ] **Step 1: import 교체**

기존:
```tsx
import StorageSummary from "@/components/mypage/StorageSummary";
import SajuProfileModal from "@/components/mypage/SajuProfileModal";
import type { SajuResult } from "@/lib/saju/calc";
import { readingCategory, type ReadingCategory } from "@/lib/readings/category";
```
교체:
```tsx
import StorageSummary from "@/components/mypage/StorageSummary";
import SajuBoard from "@/components/saju/SajuBoard";
import SelfSajuEditModal from "@/components/mypage/SelfSajuEditModal";
import AcquaintanceListModal from "@/components/mypage/AcquaintanceListModal";
import { readingCategory, type ReadingCategory } from "@/lib/readings/category";
import { type ProfileItem } from "@/components/mypage/sajuShared";
```
(`SajuResult` import 은 제거 — 다음 스텝에서 인라인 `ProfileItem` 정의를 지우면 orphan.)

- [ ] **Step 2: 인라인 `ProfileItem` 인터페이스 제거**

기존(주석 포함 블록):
```tsx
interface ProfileItem {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string | null; // P2: 생일 없는 프로필 가능
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  isPrimary: boolean;
  saju: SajuResult | null; // birthDate 없으면 서버가 계산 스킵 (null)
}
```
교체: (삭제 — `sajuShared` 에서 import 한 `ProfileItem` 사용. `ReadingListItem` 인터페이스는 그대로 둔다.)

- [ ] **Step 3: state 교체**

기존:
```tsx
  const [showSajuModal, setShowSajuModal] = useState(false);
```
교체:
```tsx
  const [showSelfEdit, setShowSelfEdit] = useState(false);
  const [showAcqModal, setShowAcqModal] = useState(false);
```

- [ ] **Step 4: 프로필 헤더 그라데이션 교체**

기존:
```tsx
        <div className="bg-gradient-to-br from-eye-purple via-lilac-deep to-eye-purple rounded-2xl p-4 shadow-lg shadow-lilac-deep/30">
```
교체:
```tsx
        <div className="bg-gradient-to-br from-night-deep via-eye-purple to-lilac-deep rounded-2xl p-4 shadow-lg shadow-lilac-deep/30">
```

- [ ] **Step 5: 보관함 소제목 추가**

기존:
```tsx
      {/* 내 보관함 — 종목별 요약 4카드 (별 잔액과 사주판 사이) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <StorageSummary counts={counts} />
      </div>
```
교체:
```tsx
      {/* 보관함 — 종목별 요약 (한 박스 가로 4분할) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="text-[12px] font-bold text-eye-purple mb-3 flex items-center">
          <span className="inline-block w-[7px] h-[7px] rounded-full bg-lilac-deep mr-1.5" aria-hidden />
          보관함
        </div>
        <StorageSummary counts={counts} />
      </div>
```

- [ ] **Step 6: 내 사주 블록 교체 (요약 카드 + 옛 모달 → 인라인 명식 + 새 모달 2개)**

기존(내 사주 요약 카드 블록 + 옛 모달 조건부, 아래 전체):
```tsx
      {/* 내 사주 요약 — 상세 편집·지인 관리는 모달에서 */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/20 shadow-sm shadow-lilac-deep/10 flex items-center justify-between gap-3">
          <div className="text-[12px] text-text-light">
            {self?.saju ? (
              <>
                <span className="font-bold text-eye-purple">
                  {self.saju.pillars.day.stem}
                  {self.saju.pillars.day.branch}
                </span>{" "}
                일주
              </>
            ) : (
              "생일 미입력"
            )}
            <span className="mx-1.5 text-lilac-mid/60">·</span>
            지인 {acquaintanceCount}명
          </div>
          <button
            onClick={() => setShowSajuModal(true)}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-lilac-soft/60 text-eye-purple text-[11px] font-bold"
          >
            관리
          </button>
        </div>
      </div>

      {showSajuModal && (
        <SajuProfileModal
          profiles={profiles}
          relationshipProfileIds={relationshipProfileIds}
          selfDisplayName={me.user.nickname}
          onReload={reloadProfiles}
          onClose={() => setShowSajuModal(false)}
        />
      )}
```
교체:
```tsx
      {/* 내 사주 — 명식 인라인 노출, 편집·지인은 모달 */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="text-[12px] font-bold text-eye-purple mb-3 flex items-center">
          <span className="inline-block w-[7px] h-[7px] rounded-full bg-gold mr-1.5" aria-hidden />
          내 사주
        </div>

        {self?.saju ? (
          <div className="bg-cream-warm rounded-2xl border border-lilac-mid/20 shadow-sm shadow-lilac-deep/10 py-4">
            <SajuBoard saju={self.saju} />
            <button
              onClick={() => setShowSelfEdit(true)}
              className="mx-auto mt-1 block text-[12px] text-lilac-deep font-bold underline"
            >
              수정
            </button>
          </div>
        ) : (
          <div className="bg-cream-warm rounded-2xl border border-lilac-mid/20 shadow-sm shadow-lilac-deep/10 px-4 py-6 text-center">
            <p className="text-[12px] text-text-light/70 mb-3">
              {self
                ? "생일을 알려주면 사주도 보여줄게."
                : "아직 내 사주를 입력하지 않았어. 명식을 보려면 먼저 입력해줘."}
            </p>
            <button
              onClick={() => setShowSelfEdit(true)}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
            >
              {self ? "생일 추가하기" : "내 사주 입력하기"}
            </button>
          </div>
        )}

        {/* 지인 사주 → 팝업 */}
        <button
          onClick={() => setShowAcqModal(true)}
          className="mt-2.5 w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)]"
        >
          <span
            className="shrink-0 w-[30px] h-[30px] rounded-[9px] bg-lilac-soft flex items-center justify-center text-[15px]"
            aria-hidden
          >
            👥
          </span>
          <span className="flex-1 text-left text-[14px] text-eye-purple font-medium">
            지인 사주 <span className="text-text-light">{acquaintanceCount}명</span>
          </span>
          <span className="text-text-light/40">›</span>
        </button>
      </div>

      {showSelfEdit && (
        <SelfSajuEditModal
          self={self}
          selfDisplayName={me.user.nickname}
          onReload={reloadProfiles}
          onClose={() => setShowSelfEdit(false)}
        />
      )}
      {showAcqModal && (
        <AcquaintanceListModal
          profiles={profiles}
          relationshipProfileIds={relationshipProfileIds}
          onReload={reloadProfiles}
          onClose={() => setShowAcqModal(false)}
        />
      )}
```

- [ ] **Step 7: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. `showSajuModal`·`SajuProfileModal`·`SajuResult` 잔여 참조가 없어야 한다. 있으면 위 Edit 누락 — 수정.

- [ ] **Step 8: 커밋**

```bash
git add app/mypage/page.tsx
git commit -m "feat(mypage): 그라데이션 B·소제목 3개·명식 인라인·지인 팝업 배선"
```

---

## Task 6: `SajuProfileModal` 삭제 + 참조 정리

**Files:**
- Delete: `components/mypage/SajuProfileModal.tsx`

- [ ] **Step 1: 잔여 참조 확인**

Run(Grep): `SajuProfileModal` 전체 검색
Expected: `components/mypage/SajuProfileModal.tsx` 자기 자신 외 참조 0. (docs/ 의 스펙·플랜 문서 매치는 무방.) 코드에 참조가 남아 있으면 삭제 전에 정리.

- [ ] **Step 2: 파일 삭제**

```bash
git rm components/mypage/SajuProfileModal.tsx
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git commit -m "chore(mypage): 분해 완료된 SajuProfileModal 제거"
```

---

## Task 7: 빌드 + 브라우저 실증 (최종 게이트)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 프로덕션 빌드**

Run: `npm run build`
Expected: exit 0. (타입·import·린트 최종 게이트. `ƒ /mypage` 라우트가 표에 뜨는지 확인.)

- [ ] **Step 2: dev 서버 + /mypage 렌더**

- `preview_start { name: "byeolkong-dev" }` 로 dev 서버 기동.
- 로그인 세션 필요(마이페이지는 미인증 시 `/login` 리다이렉트). 세션 확보: 메모리 [[browser-e2e-session-injection]] 방식(브라우저에 세션 주입) 또는 preview 브라우저에서 dev 카카오 로그인 1회.
- `navigate` → `http://localhost:3000/mypage`.

- [ ] **Step 3: DOM 단정 (read_page)**

확인 항목:
- 소제목 3개: `보관함` · `내 사주` · `계정` (계정과 동일 점+볼드 스타일).
- 보관함: **한 박스 안**에 타로/사주·운세/시뮬/우리 사이 4칸(각 개수), 세로 구분선. 각 칸 `href="/readings?tab=..."`.
- 내 사주: 명식(SajuBoard 4기둥) 인라인 노출 + `수정` 링크. (self.saju 없으면 CTA 버튼.)
- `지인 사주 N명 ›` 행 존재.
- 프로필 헤더 배경이 어두운 보라(딥 트와일라잇) — 흰 닉네임·금색 별 잔액 대비 정상.

- [ ] **Step 4: 인터랙션 검증 (computer 클릭 → read_page)**

- `수정`(또는 CTA) 클릭 → `SelfSajuEditModal` (제목 "내 사주 수정"/"내 사주 입력" + ProfileForm) 뜸. 닫기.
- `지인 사주 N명 ›` 클릭 → `AcquaintanceListModal` (제목 "지인 사주", `전체 N`, `+ 지인 추가`) 뜸.
- 지인 행 `⋮` → 수정/삭제 시트. **삭제 → 연애 상담 사용 프로필이면 경고+체크 게이트**가 뜨는지(가능하면) 확인.

- [ ] **Step 5: 증거 스크린샷**

- `computer { action: "screenshot" }` 로 /mypage 전체 1장 + 지인 팝업 1장. (인앱 스크린샷이 타임아웃이면 read_page DOM 단정으로 대체 — 메모리 [[browser-e2e-session-injection]].)

- [ ] **Step 6: (해당 시) 회귀 체크**

- 08-08 회귀였던 **"내 명식 재수정 버튼 소멸"** 반복 아님을 명식 있는 계정에서 `수정` 노출로 확인.

---

## Self-Review (플랜↔스펙 대조)

**Spec coverage:**
- 보관함 1박스 컴팩트(시안 3) → Task 2. ✅
- 그라데이션 B → Task 5 Step 4. ✅
- 명식 인라인 + 지인 팝업 분리 → Task 3·4·5. ✅
- 소제목 3개(보관함/내 사주/계정) → Task 5 Step 5·6 (계정은 현행 유지). ✅
- SajuProfileModal 분해 후 삭제 → Task 3·4·6. ✅
- 보존 계약(딥링크·개수·삭제 경고·스크롤 잠금·포털·프로필 헤더 마크업) → Task 2·4 원문 이관 + Task 7 검증. ✅

**Placeholder scan:** 모든 코드 스텝에 전체 코드 포함, TBD/TODO 없음. ✅

**Type consistency:** `ProfileItem`(sajuShared) 을 page·두 모달이 공유. `ProfileForm` prop 이름은 원본 사용부와 동일(`mode`/`initial`/`defaultSelfName`/`initialName`/`initialRelation`/`submitLabel`/`loading`/`onSubmit`). `StorageSummaryProps.counts` 시그니처 불변. `setShowSelfEdit`/`setShowAcqModal` 명명 일관. ✅

**열린 세부(구현 중 확정):**
- 인라인 `SajuBoard` `showDetail` 기본(true) — 축약 원하면 `showDetail={false}`.
- SajuBoard 자체 `px-5` + 카드 → 이중 패딩. Task 7 실렌더로 확인, 과하면 카드 패딩 조정.
- 보관함 `사주·운세` 라벨 1줄 유지(≤10.5px, whitespace-nowrap) 실렌더 확인.
