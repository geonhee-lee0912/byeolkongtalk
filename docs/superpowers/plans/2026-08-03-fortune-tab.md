# 사주 운세(2탭) 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/fortune` 탭을 큰 히어로 대신 얇은-풍성 간판 + 카테고리 필터 칩(연애·관계/타이밍/무료)으로 재구성해 상품을 fold 안으로 올리고, 미래 상품 증가를 흡수한다.

**Architecture:** 카테고리 매핑을 `lib/fortune/types.ts`에 순수 데이터로 두고(테스트로 고정), 간판·칩을 각각 독립 프레젠테이션 컴포넌트로 뽑은 뒤, `app/fortune/page.tsx`가 `active` 칩 상태로 상품을 필터링해 렌더한다. 칩 클릭은 기존 `ui_events` 계측을 재사용한다.

**Tech Stack:** Next.js 16 (App Router, Client Component), React 19, Tailwind v4, `node:test`(유닛), 기존 `trackUiEvent` 계측.

---

## File Structure

- `lib/fortune/types.ts` (수정) — `FortuneCategory` 타입 · `FORTUNE_CATEGORY` 매핑 · `FORTUNE_CHIPS` · `DEFAULT_FORTUNE_CHIP` · `fortuneProductsByCategory()`. 카테고리 배치의 단일 원천.
- `lib/fortune/types.test.ts` (생성) — 카테고리 매핑 계약 테스트.
- `lib/analytics/ui-events.ts` (수정) — allowlist에 `fortune_chip_clicked` 추가.
- `components/fortune/FortuneHeader.tsx` (생성) — 간판. `variant="rich"`(B, 기본) / `"slim"`(A 롤백).
- `components/fortune/CategoryChips.tsx` (생성) — 필터 칩 UI (순수 프레젠테이션).
- `app/fortune/page.tsx` (수정) — 히어로·"이렇게 사용해요" 제거, 간판·칩·필터 배선.

주의: `HeroBanner`(`components/common/HeroBanner.tsx`)는 다른 화면(consultations 등)에서 쓰므로 **컴포넌트 자체는 건드리지 않는다** — `/fortune`에서 import만 뗀다.

---

## Task 1: 카테고리 매핑 (types.ts)

**Files:**
- Modify: `lib/fortune/types.ts` (파일 끝에 추가)
- Test: `lib/fortune/types.test.ts` (생성)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `lib/fortune/types.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORTUNE_CATEGORY,
  FORTUNE_CHIPS,
  DEFAULT_FORTUNE_CHIP,
  fortuneProductsByCategory,
} from "./types.ts";

test("진열 상품이 정확한 카테고리에 매핑된다", () => {
  assert.equal(FORTUNE_CATEGORY.compat, "love_relation");
  assert.equal(FORTUNE_CATEGORY.compat_social, "love_relation");
  assert.equal(FORTUNE_CATEGORY.saju_full, "timing");
  assert.equal(FORTUNE_CATEGORY.monthly, "timing");
  assert.equal(FORTUNE_CATEGORY.good_days, "timing");
  assert.equal(FORTUNE_CATEGORY.daily, "free");
});

test("연애·관계 = 궁합 2종 (FORTUNE_LIST 순서 보존)", () => {
  const love = fortuneProductsByCategory("love_relation").map((f) => f.type);
  assert.deepEqual(love, ["compat", "compat_social"]);
});

test("타이밍엔 daily 없음, 2026 사주 포함", () => {
  const timing = fortuneProductsByCategory("timing").map((f) => f.type);
  assert.ok(!timing.includes("daily"));
  assert.ok(timing.includes("saju_full"));
});

test("무료 칩엔 오늘의 운세만", () => {
  const free = fortuneProductsByCategory("free").map((f) => f.type);
  assert.deepEqual(free, ["daily"]);
});

test("칩 3개 · 순서 · 기본은 타이밍", () => {
  assert.deepEqual(
    FORTUNE_CHIPS.map((c) => c.key),
    ["love_relation", "timing", "free"]
  );
  assert.equal(DEFAULT_FORTUNE_CHIP, "timing");
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `node --import tsx --test lib/fortune/types.test.ts`
Expected: FAIL — `FORTUNE_CATEGORY` 등 export 없음 (`SyntaxError` 또는 `undefined`).

- [ ] **Step 3: 매핑 구현**

`lib/fortune/types.ts` 파일 **맨 끝**에 추가:

```ts
// ── 카테고리(필터 칩) ─────────────────────────────────────────────
// 2탭 사주 운세의 필터 칩 배치. 단일 원천 (spec 2026-08-03-fortune-tab-design).
// "나" 칩은 지금 없음 — 기질·정체성 리포트가 쌓이면 부활(2026 사주는 그때 timing→나로 이동).

export type FortuneCategory = "love_relation" | "timing" | "free";

/** 모든 FortuneType → 칩 카테고리. 진열 안 하는 tarot_* 는 null. */
export const FORTUNE_CATEGORY: Record<FortuneType, FortuneCategory | null> = {
  compat: "love_relation",
  compat_social: "love_relation",
  saju_full: "timing",
  monthly: "timing",
  good_days: "timing",
  daily: "free",
  tarot_daily: null,
  tarot_love: null,
  tarot_money: null,
  tarot_career: null,
  tarot_relation: null,
};

/** 칩 노출 순서·라벨. */
export const FORTUNE_CHIPS: { key: FortuneCategory; label: string }[] = [
  { key: "love_relation", label: "연애·관계" },
  { key: "timing", label: "타이밍" },
  { key: "free", label: "무료" },
];

/** 첫 진입 시 활성 칩 (3개라 화면이 풍성 + 60별 대표 노출). */
export const DEFAULT_FORTUNE_CHIP: FortuneCategory = "timing";

/** 칩 카테고리에 속한 진열 상품 (FORTUNE_LIST 순서 보존). */
export function fortuneProductsByCategory(cat: FortuneCategory): FortuneConfig[] {
  return FORTUNE_LIST.filter((f) => FORTUNE_CATEGORY[f.type] === cat);
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `node --import tsx --test lib/fortune/types.test.ts`
Expected: PASS — `# pass 5` / `# fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add lib/fortune/types.ts lib/fortune/types.test.ts
git commit -m "feat(fortune): 카테고리 칩 매핑(연애·관계/타이밍/무료) + 계약 테스트"
```

---

## Task 2: 칩 클릭 계측 이벤트 등록

**Files:**
- Modify: `lib/analytics/ui-events.ts:13-18`

- [ ] **Step 1: allowlist에 이벤트 추가**

`lib/analytics/ui-events.ts`의 `UI_EVENTS` 배열을 아래로 교체:

```ts
export const UI_EVENTS = [
  /** 출구 칩(✨ 결과 카드 보기) 노출 — 리딩당 1회 */
  "exit_chip_shown",
  /** 출구 칩 탭 */
  "exit_chip_clicked",
  /** 사주 운세 탭 카테고리 칩 선택 — meta.category 에 love_relation|timing|free */
  "fortune_chip_clicked",
] as const;
```

- [ ] **Step 2: 타입 체크로 확인**

Run: `npx tsc --noEmit`
Expected: EXIT 0 (allowlist는 문자열 리터럴 유니온이라 `trackUiEvent("fortune_chip_clicked", …)` 호출이 Task 5에서 타입 통과).

- [ ] **Step 3: 커밋**

```bash
git add lib/analytics/ui-events.ts
git commit -m "feat(fortune): 카테고리 칩 클릭 ui_events 이벤트 등록"
```

---

## Task 3: 간판 컴포넌트 FortuneHeader (B / A 롤백)

**Files:**
- Create: `components/fortune/FortuneHeader.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/fortune/FortuneHeader.tsx`:

```tsx
"use client";

// 사주 운세(2탭) 간판. 큰 히어로(HeroBanner) 대체.
// variant="rich"(기본, B안): 별콩이 크게 + 세계관 배경 → 헤더와 분리.
// variant="slim"(A 롤백): 얇은 한 줄. "여차하면 A로" 를 prop 한 개로.
import Image from "next/image";

interface Props {
  variant?: "rich" | "slim";
}

export default function FortuneHeader({ variant = "rich" }: Props) {
  if (variant === "slim") {
    return (
      <section
        className="w-full max-w-md mx-auto flex items-center gap-3 px-5 py-3.5"
        style={{ background: "linear-gradient(135deg,#F6EFFF,#FBEFF4)" }}
      >
        <span className="relative w-9 h-9 rounded-full overflow-hidden bg-lilac-soft shrink-0">
          <Image src="/byeolkong-head.png" alt="별콩이" fill sizes="36px" className="object-contain" />
        </span>
        <div>
          <p className="text-[13px] font-extrabold text-eye-purple leading-tight">사주 운세</p>
          <p className="text-[11.5px] text-text-light">생일만 알려줘, 한 장으로 정리해줄게</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative w-full max-w-md mx-auto overflow-hidden px-5 py-5"
      style={{ background: "linear-gradient(135deg,#EBE1FB,#F7E7F2)" }}
    >
      <span className="absolute top-2.5 right-4 text-[11px] opacity-55 animate-star-twinkle" aria-hidden>✨</span>
      <span className="absolute bottom-3 right-11 text-[8px] opacity-50 animate-star-twinkle" aria-hidden>⭐</span>
      <div className="relative flex items-center gap-3.5">
        <span
          className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-[0_3px_10px_rgba(159,138,208,0.32)]"
          style={{ background: "linear-gradient(135deg,#D4C7EE,#9F8AD0)" }}
        >
          <Image src="/byeolkong-head.png" alt="별콩이" fill sizes="56px" className="object-contain" />
        </span>
        <div>
          <p className="text-[15px] font-extrabold text-eye-purple">사주 운세</p>
          <p className="text-[11.5px] text-text-light mt-0.5 leading-relaxed">
            생일만 알려줘,
            <br />
            별콩이가 한 장으로 정리해줄게
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: 커밋**

```bash
git add components/fortune/FortuneHeader.tsx
git commit -m "feat(fortune): 간판 컴포넌트(B rich / A slim 롤백 prop)"
```

---

## Task 4: 카테고리 칩 컴포넌트 CategoryChips

**Files:**
- Create: `components/fortune/CategoryChips.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/fortune/CategoryChips.tsx`:

```tsx
"use client";

// 사주 운세(2탭) 카테고리 필터 칩. 순수 프레젠테이션 — 상태·계측은 부모(page)가 가진다.
import { FORTUNE_CHIPS, type FortuneCategory } from "@/lib/fortune/types";

interface Props {
  active: FortuneCategory;
  onSelect: (cat: FortuneCategory) => void;
}

export default function CategoryChips({ active, onSelect }: Props) {
  return (
    <div className="w-full max-w-md mx-auto flex gap-2 px-5 py-3 overflow-x-auto">
      {FORTUNE_CHIPS.map((chip) => {
        const on = chip.key === active;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onSelect(chip.key)}
            aria-pressed={on}
            className={
              on
                ? "shrink-0 text-[13px] font-bold px-4 py-1.5 rounded-full bg-lilac-deep text-white transition"
                : "shrink-0 text-[13px] font-bold px-4 py-1.5 rounded-full bg-white border border-lilac-soft text-text-light transition"
            }
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: 커밋**

```bash
git add components/fortune/CategoryChips.tsx
git commit -m "feat(fortune): 카테고리 필터 칩 컴포넌트"
```

---

## Task 5: page.tsx 재구성 (배선)

**Files:**
- Modify: `app/fortune/page.tsx` (전체 교체)

- [ ] **Step 1: page.tsx 전체 교체**

`app/fortune/page.tsx` 전문을 아래로 교체 (히어로·"이렇게 사용해요"·daily-우선 정렬 제거, 간판·칩·필터 배선. 상품 카드 렌더 블록은 기존 그대로 유지):

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FORTUNE_GRADIENTS,
  FORTUNE_HASHTAGS,
  DEFAULT_FORTUNE_CHIP,
  fortuneProductsByCategory,
  type FortuneCategory,
} from "@/lib/fortune/types";
import FortuneGeneratingList from "@/components/fortune/FortuneGeneratingList";
import RedHorseIcon from "@/components/fortune/RedHorseIcon";
import FortuneHeader from "@/components/fortune/FortuneHeader";
import CategoryChips from "@/components/fortune/CategoryChips";
import { trackUiEvent } from "@/lib/analytics/ui-events";

interface DailyStatus {
  used: number;
  limit: number;
  remaining: number;
  nextCost: number;
}

export default function FortunePage() {
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [chip, setChip] = useState<FortuneCategory>(DEFAULT_FORTUNE_CHIP);

  useEffect(() => {
    void fetch("/api/fortune/daily-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDaily(d))
      .catch(() => {});
  }, []);

  const selectChip = (c: FortuneCategory) => {
    setChip(c);
    trackUiEvent("fortune_chip_clicked", { meta: { category: c } });
  };

  const items = fortuneProductsByCategory(chip);

  return (
    <main className="flex flex-1 flex-col items-center pb-8 w-full animate-fade-in">
      <FortuneHeader />

      <FortuneGeneratingList />

      <CategoryChips active={chip} onSelect={selectChip} />

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3">
        {items.map((f) => {
          const freeStatus = f.type === "daily" ? daily : null;
          const inner = (
            <div
              className={[
                "w-full rounded-2xl p-4 border flex items-center gap-3.5 transition",
                f.active
                  ? "bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99]"
                  : "bg-white/40 border-lilac-mid/15 opacity-70",
              ].join(" ")}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
                style={{ background: FORTUNE_GRADIENTS[f.type] }}
              >
                {f.type === "saju_full" ? <RedHorseIcon size={30} /> : f.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">{f.label}</span>
                  {f.cost === 0 ? (
                    freeStatus && freeStatus.remaining <= 0 ? (
                      <span className="text-[10px] font-bold text-text-light/70 bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                        무료 소진 · ⭐ {freeStatus.nextCost}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                        무료{freeStatus ? ` ${freeStatus.remaining}/${freeStatus.limit}회` : ""}
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                      ⭐ {f.cost}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                  {f.tagline}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {FORTUNE_HASHTAGS[f.type].map((h) => (
                    <span
                      key={h}
                      className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
              {!f.active && (
                <span className="text-[10px] text-text-light/50 shrink-0">준비 중</span>
              )}
            </div>
          );

          return f.active ? (
            <Link key={f.type} href={f.href}>
              {inner}
            </Link>
          ) : (
            <div key={f.type}>{inner}</div>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] text-text-light/50 text-center px-8 leading-relaxed">
        운세는 정해진 미래가 아니라 흐름과 가능성을 비춰주는 거야.
        <br />
        결과는 <span className="text-text-light/70">내 고민톡</span>에서 다시 볼 수 있어.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: 타입 체크 + 사용처 사라진 import 확인**

Run: `npx tsc --noEmit`
Expected: EXIT 0. (`HeroBanner`·`FORTUNE_HERO_GRADIENT`·`FORTUNE_LIST`·`useMemo` import가 제거됐고 미사용 참조가 없어야 함 — 위 전문에 이미 반영.)

- [ ] **Step 3: 커밋**

```bash
git add app/fortune/page.tsx
git commit -m "feat(fortune): 히어로 제거·간판/칩 필터 배선(사용법 카드 제거)"
```

---

## Task 6: 브라우저 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: dev 서버 확인 후 /fortune 로드**

`preview_start`(name: `byeolkong-dev`) → `navigate` `http://localhost:3000/fortune`.

- [ ] **Step 2: 구조·필터 동작 확인 (javascript_tool)**

```js
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(400);
  const chips = [...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim());
  const active0 = document.querySelector('button[aria-pressed="true"]')?.textContent.trim();
  const cards0 = document.querySelectorAll('main a[href^="/fortune"]').length;
  // 연애·관계 칩 클릭
  [...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.includes('연애'))?.click();
  await wait(200);
  const active1 = document.querySelector('button[aria-pressed="true"]')?.textContent.trim();
  const cards1 = document.querySelectorAll('main a[href^="/fortune"]').length;
  return JSON.stringify({ chips, active0, cards0, active1, cards1 });
})();
```

Expected: `chips=["연애·관계","타이밍","무료"]`, `active0="타이밍"`, `cards0=3`(이번달·좋은날·2026사주), `active1="연애·관계"`, `cards1=2`(궁합·인간관계궁합).

- [ ] **Step 3: 히어로·사용법 제거 확인 + 간판 렌더**

```js
JSON.stringify({
  noHeroBanner: !document.querySelector('h1'),          // HeroBanner 의 h1 이 사라졌는지
  noHowto: !document.body.textContent.includes('이렇게 사용해요'),
  header: document.querySelector('main section p')?.textContent, // "사주 운세"
});
```

Expected: `noHeroBanner=true`, `noHowto=true`, `header="사주 운세"`.

- [ ] **Step 4: 콘솔 에러 없음 + 스크린샷**

`read_console_messages`(onlyErrors) → 없음. `computer`(screenshot)로 최종 모습 캡처.

- [ ] **Step 5: 계측 발사 확인 (선택)**

칩 클릭 시 `read_network_requests`(urlPattern: `/api/event`)에 `fortune_chip_clicked` POST 204 확인.

---

## Self-Review

- **Spec coverage:** 필터 칩(A) → T1/T5. 칩 3개·타이밍 기본·daily 무료전용·2026사주 timing → T1. 간판 B/A롤백 → T3. 히어로·사용법 제거 → T5. FortuneGeneratingList 유지·위치 → T5. 하단 안내문 유지 → T5. 계측 → T2/T5/T6. ✅ 전 항목 커버.
- **Placeholder scan:** 없음 — 모든 코드 블록 완비.
- **Type consistency:** `FortuneCategory`·`FORTUNE_CHIPS`·`DEFAULT_FORTUNE_CHIP`·`fortuneProductsByCategory`가 T1 정의 ↔ T4/T5 사용 일치. `trackUiEvent("fortune_chip_clicked", { meta })` 시그니처가 기존 `ui-events.ts`와 일치.
- **주의(구현자):** 타이밍 칩 상품 순서는 `FORTUNE_LIST` 보존이라 **2026 사주가 첫 장**이다(목업은 이번달 먼저였음). 순서를 바꾸려면 `FORTUNE_LIST` 배열을 재정렬한다 — 카드 렌더는 그 순서를 그대로 따른다.
