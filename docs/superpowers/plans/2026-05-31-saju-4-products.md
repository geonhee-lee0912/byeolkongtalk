# 사주 4종 상품 + 시간 기둥 엔진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/select`의 단일 사주 상품을 4종 별도 상품(균일 20별)으로 확장하고, 모든 상품이 오늘 일운(일진)·세운·월운을 활용하도록 시간 기둥 엔진을 추가한다.

**Architecture:** `manseryeok`의 `calculateFourPillars`에 오늘 날짜를 넣어 세운/월운/일운을 결정적으로 계산하는 엔진을 `lib/saju/calc.ts`에 추가한다. 타로가 `spreadType`으로 프롬프트를 분기하듯, 사주는 `sajuProduct` 디스크리미네이터로 분기한다. `readings.saju_product` 컬럼 + `saju_data.temporal`로 상태를 저장하고, `/select → /saju → /api/readings → chat route`로 product를 스레딩한다.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase(Postgres) · manseryeok · Claude SSE. **테스트 프레임워크 없음** — 검증은 `npx tsc --noEmit` + `next build` + 일회성 node 스크립트(결정적 엔진) + dev 서버 수동 확인.

**검증 공통 메모:** Bash 도구는 매 호출 후 cwd가 `tarot-friend`로 리셋된다. 모든 명령 앞에 `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" &&` 를 붙인다. 커밋은 `dev` 브랜치, 요청 관련 파일만 add (`.gitignore`/`.serena/` 제외). push 는 사용자가 "푸시" 라고 할 때만.

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `lib/saju/calc.ts` | 원국 + 시간 기둥 계산 | Modify — `TemporalLuck`/`PillarLite` 타입, `calcTemporalLuck()`, `SajuResult.temporal?` |
| `lib/saju/products.ts` | 사주 상품 카탈로그 + 게이팅 | Create |
| `lib/saju/constants.ts` | 비용/임계치 | Modify — `SAJU_READING_COST` 22→20 |
| `lib/emotions.ts` | sessionStorage 계약 | Modify — `PendingConsultation.sajuProduct?` |
| `lib/claude.ts` | system message 빌드 | Modify — `formatTemporalBlock`, 상품별 첫턴 가이드, `SajuReadingContext.sajuProduct` |
| `supabase/migrations/20260609000000_saju_products.sql` | `readings.saju_product` | Create |
| `app/api/readings/route.ts` | reading 생성 | Modify — `sajuProduct` 검증 + temporal 계산/저장 + 비용 20 |
| `app/api/consultations/saju/chat/route.ts` | 풀이 채팅 | Modify — `saju_product` select + ctx 주입 |
| `app/(consultations)/saju/page.tsx` | 생년 입력 → reading 생성 | Modify — PENDING의 `sajuProduct` 전달 |
| `app/(consultations)/saju/concern/page.tsx` | legacy 고민 입력 폴백 | Modify — `sajuProduct` 전달 (없으면 기본) |
| `app/select/page.tsx` | 상품 선택 UI | Modify — 사주 카드 1→4개 + choice 게이팅 |

---

## Task 1: 시간 기둥 엔진 (`calcTemporalLuck`)

**Files:**
- Modify: `lib/saju/calc.ts`
- Verify(throwaway): `scripts/_verify_temporal.mjs`

- [ ] **Step 1: `lib/saju/calc.ts`에 타입 추가**

`SajuResult` 인터페이스 바로 위(라인 26 `/** readings.saju_data ... */` 직전)에 아래 타입을 추가:

```ts
/** 시간 기둥(대운 제외) — 오늘 기준 세운/월운/일운. */
export interface PillarLite {
  stem: string;
  branch: string;
  hanja: string;
  element: FiveElement;
}

export interface DailyLuck {
  date: string; // "2026-05-31"
  stem: string;
  branch: string;
  element: FiveElement;
}

export interface TemporalLuck {
  /** 계산 기준일 "YYYY-MM-DD" */
  date: string;
  /** 만 나이 (근사 — 대운 큰 흐름 참고용. 연도 차이만 사용) */
  age: number;
  /** 세운 (오늘의 연주) */
  year: PillarLite;
  /** 월운 (오늘의 월주) */
  month: PillarLite;
  /** 일운 = 오늘 들어온 두 글자 (오늘의 일주) */
  day: PillarLite;
  /** good_days 상품 전용 — 오늘부터 30일 일진 */
  dailyLuck?: DailyLuck[];
}
```

- [ ] **Step 2: `SajuResult`에 `temporal?` 필드 추가**

`SajuResult` 인터페이스 안 `input: {...}` 블록 **뒤**(라인 52 `};` 직전, `input` 닫는 중괄호 다음)에 추가:

```ts
  /** 오늘 기준 시간 기둥 — reading 생성 시 서버가 주입 (legacy reading 은 없음) */
  temporal?: TemporalLuck;
```

- [ ] **Step 3: `calcTemporalLuck` 구현**

파일 맨 끝(`calcSaju` 함수 닫는 `}` 뒤)에 추가:

```ts
function toPillarLite(
  pillar: { heavenlyStem: string; earthlyBranch: string },
  hanja: string,
  element: FiveElement
): PillarLite {
  return {
    stem: pillar.heavenlyStem,
    branch: pillar.earthlyBranch,
    hanja,
    element,
  };
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 오늘(baseDate) 기준 세운/월운/일운 계산. manseryeok 에 양력 날짜를 그대로 넣는다.
 * @param includeMonth true 면 오늘부터 30일 일진(dailyLuck) 도 채운다 (good_days 전용).
 */
export function calcTemporalLuck(
  baseDate: Date,
  birthYear: number,
  opts?: { includeMonth?: boolean }
): TemporalLuck {
  const base: BirthInfo = {
    year: baseDate.getFullYear(),
    month: baseDate.getMonth() + 1,
    day: baseDate.getDate(),
    hour: 0,
    minute: 0,
    isLunar: false,
    isLeapMonth: false,
  };
  const d = calculateFourPillars(base);

  let dailyLuck: DailyLuck[] | undefined;
  if (opts?.includeMonth) {
    dailyLuck = [];
    for (let i = 0; i < 30; i++) {
      const cur = new Date(baseDate);
      cur.setDate(cur.getDate() + i);
      const dd = calculateFourPillars({
        year: cur.getFullYear(),
        month: cur.getMonth() + 1,
        day: cur.getDate(),
        hour: 0,
        minute: 0,
        isLunar: false,
        isLeapMonth: false,
      });
      dailyLuck.push({
        date: fmtDate(cur),
        stem: dd.day.heavenlyStem,
        branch: dd.day.earthlyBranch,
        element: dd.dayElement.stem,
      });
    }
  }

  return {
    date: fmtDate(baseDate),
    age: baseDate.getFullYear() - birthYear,
    year: toPillarLite(d.year, d.yearHanja, d.yearElement.stem),
    month: toPillarLite(d.month, d.monthHanja, d.monthElement.stem),
    day: toPillarLite(d.day, d.dayHanja, d.dayElement.stem),
    dailyLuck,
  };
}
```

- [ ] **Step 4: 일회성 검증 스크립트 작성**

`scripts/_verify_temporal.mjs` 생성 (manseryeok 직접 호출과 wrapper 결과 일치 확인):

```js
import { calculateFourPillars } from "manseryeok";

// 고정 날짜로 결정성 확인
const base = { year: 2026, month: 5, day: 31, hour: 0, minute: 0, isLunar: false, isLeapMonth: false };
const d = calculateFourPillars(base);
console.log("세운(연주):", d.year.heavenlyStem + d.year.earthlyBranch, "/ 오행:", d.yearElement.stem);
console.log("월운(월주):", d.month.heavenlyStem + d.month.earthlyBranch, "/ 오행:", d.monthElement.stem);
console.log("일운(일주):", d.day.heavenlyStem + d.day.earthlyBranch, "/ 오행:", d.dayElement.stem);

// 30일 일진 길이 + 마지막 날 확인
const days = [];
for (let i = 0; i < 30; i++) {
  const cur = new Date(2026, 4, 31);
  cur.setDate(cur.getDate() + i);
  const dd = calculateFourPillars({ year: cur.getFullYear(), month: cur.getMonth() + 1, day: cur.getDate(), hour: 0, minute: 0, isLunar: false, isLeapMonth: false });
  days.push(dd.day.heavenlyStem + dd.day.earthlyBranch);
}
console.log("30일 일진 개수:", days.length, "| 첫날:", days[0], "| 30일째:", days[29]);
if (days.length !== 30) { console.error("FAIL: 30일 아님"); process.exit(1); }
console.log("PASS");
```

- [ ] **Step 5: 검증 스크립트 실행 → PASS 확인**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && node scripts/_verify_temporal.mjs`
Expected: 세운/월운/일운 간지가 출력되고 `30일 일진 개수: 30` + 마지막 줄 `PASS`. (수치는 manseryeok 계산값 — 비어있지 않고 오류 없이 나오면 통과.)

- [ ] **Step 6: 검증 스크립트 삭제 + 타입체크**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && rm scripts/_verify_temporal.mjs && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 (에러 없음). `scripts/` 디렉토리가 비면 무시 (git 추적 안 됨).

- [ ] **Step 7: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add lib/saju/calc.ts && git commit -m "사주 — 시간 기둥 엔진(calcTemporalLuck) 추가: 세운/월운/일운 + 30일 일진"
```

---

## Task 2: 사주 상품 카탈로그 + 게이팅 (`lib/saju/products.ts`)

**Files:**
- Create: `lib/saju/products.ts`

- [ ] **Step 1: 상품 메타 파일 생성**

```ts
// 사주 4종 상품 정의 — /select UI + 프롬프트 분기 + readings 검증이 공유하는 단일 소스.

import type { EmotionTag } from "@/lib/emotions";

export type SajuProduct = "today_letters" | "nature" | "choice" | "good_days";

export const SAJU_PRODUCTS: SajuProduct[] = [
  "today_letters",
  "nature",
  "choice",
  "good_days",
];

export interface SajuProductInfo {
  id: SajuProduct;
  /** 카드 타이틀 pill */
  label: string;
  /** 카드 설명글 한 줄 */
  description: string;
  /** 카드 하단 대표 흐름 라벨 (accent 컬러) */
  flow: string;
}

export const SAJU_PRODUCT_INFO: Record<SajuProduct, SajuProductInfo> = {
  today_letters: {
    id: "today_letters",
    label: "오늘 들어온 글자",
    description: "오늘 너에게 들어온 일운 두 글자로 고민을 짚어줄게",
    flow: "오늘 일운 · 고민 연결 · 금기 포인트",
  },
  nature: {
    id: "nature",
    label: "타고난 성향 기반 상담",
    description: "타고난 팔자에서 출발해 지금 흐름으로 고민을 풀어줄게",
    flow: "타고난 기질 · 지금 흐름 · 고민 적용",
  },
  choice: {
    id: "choice",
    label: "선택지 비교",
    description: "고민 속 선택지를 일운·오행 흐름으로 나란히 비교해줄게",
    flow: "선택지 A · 선택지 B · 기우는 쪽",
  },
  good_days: {
    id: "good_days",
    label: "좋은 날 추천",
    description: "앞으로 한 달, 너에게 좋은 날과 피할 날을 짚어줄게",
    flow: "팔자 해석 · 좋은 날 · 피할 날",
  },
};

/** 선택지 비교 노출 대상 감정 분류 (선택/진로/새출발). */
const CHOICE_ELIGIBLE_EMOTIONS: EmotionTag[] = [
  "어떤 선택이 맞을지 모르겠어",
  "내 앞날의 방향이 궁금해",
  "새로운 시작이 기대돼",
];

export function isChoiceEligible(emotion: EmotionTag | string | null | undefined): boolean {
  return !!emotion && (CHOICE_ELIGIBLE_EMOTIONS as string[]).includes(emotion);
}

/** 주어진 감정에서 노출할 상품 목록 (choice 게이팅 적용). */
export function getSajuProducts(emotion: EmotionTag | string | null | undefined): SajuProduct[] {
  return SAJU_PRODUCTS.filter((p) => p !== "choice" || isChoiceEligible(emotion));
}

export function isSajuProduct(v: unknown): v is SajuProduct {
  return typeof v === "string" && (SAJU_PRODUCTS as string[]).includes(v);
}
```

- [ ] **Step 2: `EmotionTag` 값 확인 (타입 일치 검증)**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && grep -n '어떤 선택이 맞을지 모르겠어\|내 앞날의 방향이 궁금해\|새로운 시작이 기대돼' lib/emotions.ts`
Expected: 세 문자열 모두 `EmotionTag` 유니온에 존재(라인 출력). 없으면 오타 — 출력된 정확한 문자열로 `CHOICE_ELIGIBLE_EMOTIONS` 수정.

- [ ] **Step 3: 타입체크**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0

- [ ] **Step 4: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add lib/saju/products.ts && git commit -m "사주 — 4종 상품 카탈로그 + choice 게이팅 헬퍼(lib/saju/products.ts)"
```

---

## Task 3: 비용 20 + PendingConsultation 확장

**Files:**
- Modify: `lib/saju/constants.ts:4`
- Modify: `lib/emotions.ts` (`PendingConsultation` 인터페이스)

- [ ] **Step 1: 비용 22 → 20**

`lib/saju/constants.ts` 라인 4를 변경:

```ts
export const SAJU_READING_COST = 20;
```

- [ ] **Step 2: `PendingConsultation`에 `sajuProduct` 추가**

`lib/emotions.ts`의 `PendingConsultation` 인터페이스(현재 `{ emotion; concern; type? }`)에 import + 필드 추가. 파일 상단 import 구역에:

```ts
import type { SajuProduct } from "@/lib/saju/products";
```

> 주의: `lib/saju/products.ts`가 `lib/emotions.ts`의 `EmotionTag`를 import 하므로 순환 참조가 생긴다. TypeScript의 `import type`은 타입 전용이라 런타임 순환은 없지만, 안전하게 하려면 `SajuProduct`를 인라인 유니온으로 재정의하지 말고 `import type`만 사용한다 (타입 소거됨). tsc 통과로 확인.

`PendingConsultation` 인터페이스에 필드 추가:

```ts
  /** 사주 선택 시 어떤 상품인지 (type === "saju" 일 때만 의미) */
  sajuProduct?: SajuProduct;
```

- [ ] **Step 3: 타입체크 (순환 참조 확인)**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0. 만약 순환 참조 에러가 나면, `lib/saju/products.ts`의 `import type { EmotionTag }`도 `import type`인지 확인 (이미 그렇게 작성됨).

- [ ] **Step 4: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add lib/saju/constants.ts lib/emotions.ts && git commit -m "사주 — 비용 균일 20별 + PendingConsultation.sajuProduct 추가"
```

---

## Task 4: 마이그레이션 `readings.saju_product`

**Files:**
- Create: `supabase/migrations/20260609000000_saju_products.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 20260609000000_saju_products.sql — 사주 4종 상품
-- readings.saju_product: 어떤 사주 상품으로 시작된 풀이인지. 기존 행은 today_letters(기존 별콩이 사주 대체)로 백필.

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS saju_product TEXT NOT NULL DEFAULT 'today_letters'
  CHECK (saju_product IN ('today_letters', 'nature', 'choice', 'good_days'));
```

- [ ] **Step 2: 적용 방법 확인 (수동 — 사용자 환경)**

이 프로젝트는 Supabase 마이그레이션을 사용자가 적용한다. 자동 push 금지. 커밋만 하고, 실행 단계에서 사용자에게 안내:
> "마이그레이션 `20260609000000_saju_products.sql` 추가했어. Supabase에 적용해줘 (CLI `supabase db push` 또는 Dashboard SQL Editor에 붙여넣기)."

- [ ] **Step 3: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add supabase/migrations/20260609000000_saju_products.sql && git commit -m "사주 — readings.saju_product 컬럼 마이그레이션"
```

---

## Task 5: `lib/claude.ts` — 시간 기둥 블록 + 상품별 가이드

**Files:**
- Modify: `lib/claude.ts` (import, `SajuReadingContext`, `formatTemporalBlock`, `buildSystemMessage`)

- [ ] **Step 1: import 추가**

라인 7 (`import type { SajuResult } from "@/lib/saju/calc";`)을 아래로 교체:

```ts
import type { SajuResult, TemporalLuck } from "@/lib/saju/calc";
import type { SajuProduct } from "@/lib/saju/products";
```

- [ ] **Step 2: `SajuReadingContext`에 `sajuProduct` 추가**

`SajuReadingContext` 인터페이스(라인 44~53)의 `saju: SajuResult;` 바로 아래에 추가:

```ts
  /** 어떤 사주 상품인지 — 첫 턴 출력 구조 분기 */
  sajuProduct: SajuProduct;
```

- [ ] **Step 3: `formatTemporalBlock` 추가**

`formatSajuBlock` 함수(라인 55~71) 바로 **뒤**에 추가:

```ts
function formatTemporalBlock(
  temporal: TemporalLuck | undefined,
  product: SajuProduct
): string {
  if (!temporal) return "";
  const lines = [
    `[오늘의 기운] (기준일 ${temporal.date}, 만 ${temporal.age}세)`,
    `  - 세운(올해): ${temporal.year.stem}${temporal.year.branch} (${temporal.year.hanja}) / ${temporal.year.element}`,
    `  - 월운(이달): ${temporal.month.stem}${temporal.month.branch} (${temporal.month.hanja}) / ${temporal.month.element}`,
    `  - ★ 일운(오늘 들어온 두 글자): ${temporal.day.stem}${temporal.day.branch} (${temporal.day.hanja}) / ${temporal.day.element}`,
    `  - 대운: 정밀 간지 없음 — 만 나이를 참고해 '인생의 큰 흐름' 정도로만 가볍게 언급할 것 (간지 단정 금지)`,
  ];
  if (product === "good_days" && temporal.dailyLuck?.length) {
    lines.push(`  - [향후 30일 일진] (이 목록에서만 날짜를 골라 추천. 목록 밖 날짜·간지 지어내기 금지)`);
    for (const d of temporal.dailyLuck) {
      lines.push(`      ${d.date}: ${d.stem}${d.branch} / ${d.element}`);
    }
  }
  return "\n\n" + lines.join("\n");
}
```

- [ ] **Step 4: 상품별 첫 턴 가이드 맵 추가**

Step 3에서 추가한 `formatTemporalBlock` 바로 뒤에 추가:

```ts
const SAJU_PRODUCT_FIRST_TURN_GUIDE: Record<SajuProduct, string> = {
  today_letters: `\n\n## 첫 턴 가이드 — "오늘 들어온 글자"\n\n이번 턴 흐름: (1) 여는 한 줄 → (2) **오늘 일운 두 글자**(위 [오늘의 기운]의 ★ 일운)를 사용자에게 또렷이 강조하며 풀이 — "오늘 너에게 들어온 글자는 OO이야" 식 → (3) 이 글자가 사용자 고민과 어떻게 연결되는지 중심으로 → (4) **오늘의 금기/주의 포인트** 한두 가지 → (5) 짧은 응원. 원국 일간·오행은 거들 뿐, 오늘 일운이 주인공. 400~700자, 단정 X.`,
  nature: `\n\n## 첫 턴 가이드 — "타고난 성향 기반 상담"\n\n이번 턴 흐름: (1) 여는 한 줄 → (2) 일간·오행 분포로 본 **타고난 기질** 풀이 → (3) 지금 세운/월운(+대운 큰 흐름)이 그 기질을 어떻게 건드리는지 → (4) 그 본질에서 출발해 사용자 고민에 적용 → (5) 응원. 오늘 일운은 보조 근거로만. 400~700자, 단정 X.`,
  choice: `\n\n## 첫 턴 가이드 — "선택지 비교"\n\n이번 턴 흐름: (1) 여는 한 줄 + 고민 속 선택지를 A/B로 정리(사용자 고민에서 추출, 불명확하면 가볍게 되물어도 됨) → (2) 선택지 A의 기운 → (3) 선택지 B의 기운 → (4) 일운·오행 관점에서 두 선택지 비교 → (5) 지금 결대로면 어느 쪽이 더 순한지(흐름·가능성 톤, 단정·강요 X). 400~700자.`,
  good_days: `\n\n## 첫 턴 가이드 — "좋은 날 추천"\n\n이번 턴 흐름: (1) 여는 한 줄 + 고민 맥락을 팔자/세운/월운으로 짧게 해석 → (2) 위 [향후 30일 일진] **목록에서만** 골라 고민에 좋은 날 2~4개(날짜 + 왜 좋은지 일운 글자 근거) → (3) 피하면 좋을 날 1~3개(이유) → (4) 응원. 목록 밖 날짜를 지어내지 말 것. 400~800자.`,
};
```

- [ ] **Step 5: `buildSystemMessage`에서 분기 사용**

`buildSystemMessage` 안의 `firstTurnGuide` 정의(라인 111~113)를 아래로 교체:

```ts
  const firstTurnGuide = isFirstTurn
    ? SAJU_PRODUCT_FIRST_TURN_GUIDE[ctx.sajuProduct]
    : "";
```

- [ ] **Step 6: `dynamicPart`에 시간 기둥 블록 삽입**

`buildSystemMessage`의 `dynamicPart` 템플릿(라인 136~148)에서 `${formatSajuBlock(ctx.saju)}` 줄 바로 뒤에 시간 기둥 블록을 추가. 해당 부분을 아래로 교체:

```ts
  const dynamicPart = `---

## 이번 세션 정보

[고민 내용: ${ctx.concernText}]
[사주 상품: ${ctx.sajuProduct}]
[지금까지 별콩이 턴 수: ${ctx.assistantTurnsSoFar}]

### 사주 데이터

${formatSajuBlock(ctx.saju)}${formatTemporalBlock(ctx.saju.temporal, ctx.sajuProduct)}

---
${emotionBlock}${firstTurnGuide}${wrapGuide}`;
```

- [ ] **Step 7: 타입체크**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0. (`SajuReadingContext`에 `sajuProduct`가 필수가 되어, 이를 호출하는 chat route가 아직 안 고쳐졌으면 여기서 에러 — Task 7에서 고친다. 이 시점에는 chat route 에러가 예상되므로, Task 5는 Task 7과 함께 타입체크 통과해야 한다. 아래 Step 8 참고.)

- [ ] **Step 8: 커밋 (Task 7과 함께 통과)**

이 Task의 타입체크는 Task 7 완료 후 함께 EXIT 0이 된다. 우선 커밋:

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add lib/claude.ts && git commit -m "사주 — buildSystemMessage 상품별 첫턴 가이드 + 시간 기둥 블록(formatTemporalBlock)"
```

---

## Task 6: `/api/readings` — sajuProduct 검증 + temporal 계산/저장

**Files:**
- Modify: `app/api/readings/route.ts`

- [ ] **Step 1: import 추가**

파일 상단 import 구역(라인 8~14 사이)에 추가:

```ts
import { calcTemporalLuck } from "@/lib/saju/calc";
import { isSajuProduct, type SajuProduct } from "@/lib/saju/products";
```

- [ ] **Step 2: `ReadingPostBody`에 `sajuProduct` 추가**

`ReadingPostBody` 인터페이스(라인 70~75)에 필드 추가:

```ts
  sajuProduct?: string; // 사주 상품 — 화이트리스트 검증, 없으면 today_letters
```

- [ ] **Step 3: 상품 검증 + temporal 계산**

POST 함수 안, `question` 검증(라인 158~164) **뒤**, `잔액 사전 확인`(라인 166) **앞**에 추가:

```ts
  const sajuProduct: SajuProduct = isSajuProduct(body.sajuProduct)
    ? body.sajuProduct
    : "today_letters";

  // 출생 연도 (대운 참고 나이용) — birthDate "YYYY-MM-DD"
  const birthYear = Number(profile.birthDate.slice(0, 4));

  // 오늘 기준 시간 기둥 — good_days 면 30일 일진 포함
  const temporal = calcTemporalLuck(new Date(), birthYear, {
    includeMonth: sajuProduct === "good_days",
  });

  // saju_data 에 temporal 병합 (legacy 호출이면 sajuData 그대로 + temporal)
  const sajuDataWithTemporal = {
    ...(body.sajuData as Record<string, unknown>),
    temporal,
  };
```

- [ ] **Step 4: readings INSERT 에 컬럼 반영**

readings INSERT(라인 230~242)의 `.insert({...})` 객체에서 `saju_data: body.sajuData,` 를 `saju_data: sajuDataWithTemporal,` 로 바꾸고, `stars_spent: SAJU_READING_COST,` 줄 뒤에 `saju_product: sajuProduct,` 추가:

```ts
    .insert({
      user_id: userId,
      profile_id: profileRow.id,
      question: body.question,
      saju_data: sajuDataWithTemporal,
      emotion_tag: emotionTag,
      stars_spent: SAJU_READING_COST,
      saju_product: sajuProduct,
      has_sensitive: false,
    })
```

- [ ] **Step 5: 타입체크**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 (단, Task 7 미완이면 chat route 에러만 남음).

- [ ] **Step 6: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add app/api/readings/route.ts && git commit -m "사주 — /api/readings: sajuProduct 검증 + 시간 기둥 계산/저장 + 비용 20"
```

---

## Task 7: `/api/consultations/saju/chat` — saju_product 주입

**Files:**
- Modify: `app/api/consultations/saju/chat/route.ts`

- [ ] **Step 1: import 추가**

파일 상단(`import type { SajuResult } from "@/lib/saju/calc";` 라인 29) 아래에 추가:

```ts
import { isSajuProduct } from "@/lib/saju/products";
```

- [ ] **Step 2: reading select 에 saju_product 추가**

readings 조회(라인 109~113)의 `.select(...)` 문자열을 변경:

```ts
    .select("id, user_id, question, saju_data, emotion_tag, saju_product")
```

- [ ] **Step 3: ctx 에 sajuProduct 주입**

`buildSystemMessage` 호출(라인 143~149)을 변경 — `concernText` 줄 다음에 `sajuProduct` 추가:

```ts
  const systemMessage = buildSystemMessage({
    saju: reading.saju_data as SajuResult,
    sajuProduct: isSajuProduct(reading.saju_product)
      ? reading.saju_product
      : "today_letters",
    concernText: reading.question ?? "",
    emotionTag: reading.emotion_tag as string | null,
    assistantTurnsSoFar,
    cumulativeAssistantChars,
  });
```

- [ ] **Step 4: 타입체크 (Task 5·6·7 합산 통과)**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 (이제 `SajuReadingContext.sajuProduct` 필수 충족).

- [ ] **Step 5: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add app/api/consultations/saju/chat/route.ts && git commit -m "사주 — chat route: reading.saju_product 로드 + buildSystemMessage 주입"
```

---

## Task 8: 클라이언트 스레딩 (`/saju`, `/saju/concern`)

**Files:**
- Modify: `app/(consultations)/saju/page.tsx`
- Modify: `app/(consultations)/saju/concern/page.tsx`

- [ ] **Step 1: `/saju` page — readings POST 에 sajuProduct 전달**

`app/(consultations)/saju/page.tsx`의 `/api/readings` fetch body(라인 122~127)에 `sajuProduct` 추가. `pending` 객체에서 읽는다(`PendingConsultation.sajuProduct`):

```ts
                    body: JSON.stringify({
                      profile,
                      sajuData: saju,
                      question: pending.concern,
                      emotion: pending.emotion,
                      sajuProduct: pending.sajuProduct,
                    }),
```

- [ ] **Step 2: `/saju` page — legacy concern 폴백에 sajuProduct 전수**

같은 파일에서, readings 실패 시 `byeolkong:pending_saju` 저장하는 두 곳(라인 136~139, 158~161)의 객체에 `sajuProduct` 추가. 두 곳 모두 `{ saju, profile, emotion: pending.emotion }` → `{ saju, profile, emotion: pending.emotion, sajuProduct: pending.sajuProduct }` 로 변경:

```ts
                    sessionStorage.setItem(
                      "byeolkong:pending_saju",
                      JSON.stringify({ saju, profile, emotion: pending.emotion, sajuProduct: pending.sajuProduct })
                    );
```

(두 곳 동일하게 수정.)

- [ ] **Step 3: `/saju/concern` page — PendingSaju 타입 + POST 반영**

`app/(consultations)/saju/concern/page.tsx`:
(a) `PendingSaju` 인터페이스(라인 21~25)에 필드 추가:

```ts
interface PendingSaju {
  saju: SajuResult;
  profile: PendingProfile;
  emotion?: string;
  sajuProduct?: string;
}
```

(b) `/api/readings` fetch body(라인 86~91)에 추가:

```ts
        body: JSON.stringify({
          profile: pending.profile,
          sajuData: pending.saju,
          question: concern,
          emotion: pending.emotion,
          sajuProduct: pending.sajuProduct,
        }),
```

- [ ] **Step 4: 비용 표기 자동 반영 확인**

`/saju/concern`는 `SAJU_READING_COST` 상수를 import 해 표기하므로(라인 9, 189~210) Task 3에서 20으로 바뀐 값이 자동 반영된다. 별도 수정 없음.

- [ ] **Step 5: 타입체크**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0

- [ ] **Step 6: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add "app/(consultations)/saju/page.tsx" "app/(consultations)/saju/concern/page.tsx" && git commit -m "사주 — 클라이언트: sajuProduct 를 PENDING→readings 로 스레딩"
```

---

## Task 9: `/select` UI — 사주 카드 4종 + choice 게이팅

**Files:**
- Modify: `app/select/page.tsx`

이 Task는 단일 "saju" 선택을 product별 선택으로 바꾼다. `Selection` 타입을 `SajuProduct | SpreadType`로 넓히고, 사주 섹션을 1카드 → N카드 맵으로 바꾼다.

- [ ] **Step 1: import 추가**

`app/select/page.tsx` 상단 import 구역(라인 23 `import { TAROT_SPREAD_KEY ... }` 다음)에 추가:

```ts
import {
  getSajuProducts,
  isSajuProduct,
  SAJU_PRODUCT_INFO,
  type SajuProduct,
} from "@/lib/saju/products";
```

- [ ] **Step 2: `Selection` 타입 + 상수 정리**

라인 29 `type Selection = "saju" | SpreadType;` 를 변경:

```ts
type Selection = SajuProduct | SpreadType;
```

`SAJU_COST` (라인 27) 값을 20으로:

```ts
const SAJU_COST = 20;
```

- [ ] **Step 3: 추천 selection 을 today_letters 로**

`getRecommendation` 안 saju 분기(라인 165~174)에서 `selection: "saju"` → `selection: "today_letters"`, `label: "별콩이 사주"` → `label: SAJU_PRODUCT_INFO.today_letters.label` 로 변경:

```ts
  if (SAJU_EMOTIONS.includes(emotion)) {
    const c = SAJU_REC_COPY[emotion] ?? SAJU_REC_COPY.default;
    return {
      kind: "saju",
      selection: "today_letters",
      headline: c.headline,
      reason: c.reason,
      label: SAJU_PRODUCT_INFO.today_letters.label,
      accent: SAJU_ACCENT,
    };
  }
```

- [ ] **Step 4: sajuProducts 목록 + handleStart 분기 수정**

컴포넌트 안 `spreadOptions` useMemo(라인 199) 아래에 추가:

```ts
  const sajuProducts = useMemo(
    () => (pending ? getSajuProducts(pending.emotion) : []),
    [pending]
  );
```

`handleStart`(라인 243~263)의 saju 분기를 product 기반으로 교체. `if (selected === "saju")` → `if (isSajuProduct(selected))`:

```ts
  const handleStart = () => {
    if (!selected) return;
    if (isSajuProduct(selected)) {
      const payload: PendingConsultation = {
        emotion: pending.emotion,
        concern: pending.concern,
        type: "saju",
        sajuProduct: selected,
      };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
      router.push("/saju");
      return;
    }
    const payload: TarotSpreadSelection = {
      spreadType: selected,
      spreadCategory: category,
      emotion: pending.emotion,
      concern: pending.concern,
    };
    sessionStorage.setItem(TAROT_SPREAD_KEY, JSON.stringify(payload));
    router.push("/tarot/draw");
  };
```

- [ ] **Step 5: startLabel 수정**

`startLabel`(라인 265~270)을 변경:

```ts
  const startLabel = isSajuProduct(selected)
    ? `${SAJU_PRODUCT_INFO[selected].label} 보러 가기`
    : selected
    ? `${SPREAD_INFO[selected].label}로 카드 뽑으러 가기`
    : "방식을 골라줘";
```

- [ ] **Step 6: 사주 카드 섹션을 N개 맵으로 교체**

기존 사주 단일 카드 블록(라인 372~426, `<div className="w-full max-w-md mx-auto px-5">` ~ 닫는 `</div>`)을 아래로 교체. 타로 카드 디자인(번호 카드 대신 사주는 `/saju.png` 아이콘 유지)과 같은 카드 셸을 사용:

```tsx
      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        {sajuProducts.map((p) => {
          const info = SAJU_PRODUCT_INFO[p];
          const isSelected = selected === p;
          const isRecommended = rec.kind === "saju" && rec.selection === p;
          return (
            <button
              key={p}
              onClick={() => setSelected(p)}
              aria-pressed={isSelected}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/90 text-left transition-all"
              style={{
                border: isSelected
                  ? `2px solid ${SAJU_ACCENT}`
                  : "1px solid #E8DEF5",
                boxShadow: isSelected ? `0 0 0 3px ${SAJU_ACCENT}1f` : "none",
              }}
            >
              <div className="flex flex-shrink-0 items-center justify-center w-[44px]">
                <Image
                  src="/saju.png"
                  alt=""
                  width={40}
                  height={40}
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[12.5px] font-black px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: SAJU_ACCENT }}
                  >
                    {info.label}
                  </span>
                  <span className="text-[11px] font-bold text-text-light">
                    ⭐ {SAJU_COST}별
                  </span>
                  {isRecommended && (
                    <span
                      className="text-[10px] font-black ml-auto px-1.5 py-0.5 rounded-full text-white"
                      style={{ background: "#E5484D" }}
                    >
                      추천 ✨
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-text-light leading-snug mb-1.5">
                  {info.description}
                </p>
                <p
                  className="text-[11px] font-bold leading-snug truncate"
                  style={{ color: SAJU_ACCENT }}
                >
                  {info.flow}
                </p>
              </div>
            </button>
          );
        })}
      </div>
```

- [ ] **Step 7: 타입체크 + 빌드**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0. (`sajuRecommended` 변수가 더 이상 안 쓰이면 tsc 가 unused 로 경고하지 않지만, lint 정리 차 라인 272 `const sajuRecommended = rec.kind === "saju";` 가 미사용이면 삭제.)

- [ ] **Step 8: 커밋**

```bash
cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && git add app/select/page.tsx && git commit -m "사주 — /select: 사주 4종 카드 + choice 게이팅(선택/진로/새출발)"
```

---

## Task 10: 통합 검증 (build + dev 수동 확인)

**Files:** (없음 — 검증만)

- [ ] **Step 1: 프로덕션 빌드**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npx next build`
Expected: 빌드 성공 (사주/타로/select 라우트 컴파일 에러 없음).

- [ ] **Step 2: 마이그레이션 적용 안내 (사용자)**

사용자에게: "`20260609000000_saju_products.sql` 을 Supabase에 적용해줘 (`supabase db push` 또는 Dashboard). 적용 전엔 readings INSERT 가 `saju_product` 컬럼 부재로 실패해."

- [ ] **Step 3: dev 서버 수동 시나리오 (마이그레이션 적용 후)**

Run: `cd "C:\Users\c\Desktop\vibe\project\byeolkong_talk" && npm run dev` (백그라운드)
preview 툴로 확인:
1. 홈 → 감정 "어떤 선택이 맞을지 모르겠어" 선택 → /concern 고민 입력 → /select
   - 사주 섹션에 **4개 카드**(오늘 들어온 글자/타고난 성향/선택지 비교/좋은 날 추천) 노출 확인
2. 감정 "그 사람 마음이 궁금해"(선택 비대상) → /select
   - 사주 섹션에 **3개 카드**(선택지 비교 제외) 노출 확인
3. "오늘 들어온 글자" 선택 → 생년 입력 → 풀이 진입 → 첫 응답에 **오늘 일운 두 글자 강조** + 금기 포인트 포함 확인
4. "좋은 날 추천" 선택 → 풀이 첫 응답에 **구체 날짜 추천**(향후 한 달 내) + 피할 날 포함 확인

- [ ] **Step 4: 사용자에게 푸시 여부 확인**

모든 검증 통과 후: "사주 4종 상품 구현 완료. dev 브랜치에 커밋했어. 푸시할까?"

---

## Self-Review

**Spec coverage:**
- 시간 기둥 엔진(일운/세운/월운, 30일 일진) → Task 1 ✓
- 대운 가벼운 참고(만 나이) → Task 1(age) + Task 5(formatTemporalBlock 대운 줄) ✓
- 4종 상품 카탈로그 + 균일 20별 → Task 2 + Task 3 ✓
- choice 게이팅(선택/진로/새출발) → Task 2(isChoiceEligible) + Task 9 ✓
- 상품별 프롬프트 출력 구조 → Task 5(SAJU_PRODUCT_FIRST_TURN_GUIDE) ✓
- DB saju_product 컬럼 → Task 4 ✓
- saju_data.temporal 저장 → Task 6 ✓
- 경로 스레딩(/select→/saju→readings→chat) → Task 6·7·8·9 ✓
- 좋은 날 = 한 달, 목록 기반 → Task 1(includeMonth) + Task 5(good_days 가이드) ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TBD/TODO 없음.

**Type consistency:** `SajuProduct`(products.ts) — 4종 유니온 일관. `calcTemporalLuck(baseDate, birthYear, {includeMonth})` 시그니처가 Task 1 정의 ↔ Task 6 호출 일치. `isSajuProduct`/`getSajuProducts`/`SAJU_PRODUCT_INFO` 명칭이 Task 2 정의 ↔ Task 6·7·9 사용 일치. `TemporalLuck.dailyLuck` 옵셔널 ↔ formatTemporalBlock 가드 일치. `SajuReadingContext.sajuProduct` 필수 ↔ chat route 주입(Task 7) 일치.

**주의(실행자):** Task 5 단독 타입체크는 chat route(Task 7) 미수정 상태면 실패한다. Task 5→6→7 을 연속 실행하고 Task 7 Step 4에서 합산 EXIT 0 을 확인할 것.
