# 광고 어트리뷰션 + 상품별 집계 + 애널리틱스 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 유저의 first-touch 유입 출처를 저장하고, 어드민에 상품별 집계 + 소재별 퍼널 + 코호트 LTV + (선택적) 메타 지출 기반 CAC/ROAS 애널리틱스 대시보드를 추가한다.

**Architecture:** 조회 시점 집계(접근 A). 신규 데이터 테이블 2개(`user_acquisition`, `ad_spend`)만 추가. API 라우트가 `users`/`readings`/`payments` 행을 조회해 **순수 집계 함수**(`lib/analytics/aggregate.ts`)에 넘긴다. 순수 함수는 `node:test`로 단위 테스트하고, 얇은 조회/렌더 계층은 `tsc --noEmit`+build+dev 수동 검증한다.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase(service_role), 직접 만든 SVG 차트 + CSS 그리드 히트맵, `node:test`+tsx.

**설계 문서:** `docs/superpowers/specs/2026-07-05-ad-attribution-analytics-design.md`

---

## 공통 규칙

- **테스트 실행**: `node --import tsx --test <파일>` (예: `node --import tsx --test lib/acquisition.test.ts`).
- **타입 체크**: `npx tsc --noEmit`.
- **빌드**: `npm run build`.
- **어드민 API 가드**: GET은 `requireAdmin()`, write는 `requireAdminWrite(req)` + `logAdminAction(...)` (`lib/admin-actions.ts` 기존 패턴).
- **날짜 경계**: `lib/admin-time.ts`의 `startOfTodayKstIso()`, `daysAgoKstIso(n)` 재사용.
- **마이그레이션 컨벤션**: `supabase/migrations/<timestamp>_<name>.sql`. push 시 Supabase가 dev/prod 자동 적용.

---

## File Structure

**생성**
- `supabase/migrations/20260705000000_user_acquisition.sql` — first-touch 유입 테이블
- `supabase/migrations/20260705000001_ad_spend.sql` — 메타 지출 수동입력 테이블
- `lib/acquisition.ts` — utm 키 상수 + 쿠키 직렬화/파싱(순수)
- `lib/acquisition.test.ts`
- `lib/analytics/aggregate.ts` — 순수 집계 함수(products/trends/funnel/cohorts) + 타입
- `lib/analytics/aggregate.test.ts`
- `app/api/admin/analytics/products/route.ts`
- `app/api/admin/analytics/trends/route.ts`
- `app/api/admin/analytics/funnel/route.ts`
- `app/api/admin/analytics/cohorts/route.ts`
- `app/api/admin/ads/route.ts` — 지출 목록 GET / upsert POST
- `app/api/admin/ads/[id]/route.ts` — 지출 삭제 DELETE
- `app/admin/analytics/page.tsx` — 애널리틱스 화면(products+trends+funnel+cohorts)
- `app/admin/ads/page.tsx` — 지출 입력 화면
- `components/admin/LineChart.tsx` — SVG 라인차트
- `components/admin/CohortHeatmap.tsx` — CSS 그리드 히트맵
- `components/admin/AdSpendForm.tsx` — 지출 추가/수정 폼(client)

**수정**
- `components/auth/AuthBootstrap.tsx` — first-touch 캡처 이펙트 추가
- `app/api/auth/kakao/route.ts` — 신규 유저 insert 직후 `user_acquisition` 저장 + 쿠키 삭제
- `lib/admin-actions.ts` — `AdminActionName`에 `ad_spend_upsert`|`ad_spend_delete` 추가
- `app/admin/layout.tsx` — NAV에 애널리틱스/광고 지출 항목 추가

---

## Task 1: 마이그레이션 2개

**Files:**
- Create: `supabase/migrations/20260705000000_user_acquisition.sql`
- Create: `supabase/migrations/20260705000001_ad_spend.sql`

- [ ] **Step 1: `user_acquisition` 마이그레이션 작성**

`supabase/migrations/20260705000000_user_acquisition.sql`:
```sql
-- 20260705000000_user_acquisition.sql — first-touch 유입 출처 (users 와 1:1, write-once)
CREATE TABLE IF NOT EXISTS user_acquisition (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  utm_term        TEXT,
  fbclid          TEXT,
  fbc             TEXT,
  landing_variant TEXT,
  referrer        TEXT,
  first_seen_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 소재별 조회 가속
CREATE INDEX IF NOT EXISTS idx_user_acquisition_utm_content
  ON user_acquisition (utm_content);

-- RLS: service_role 만 R/W (클라 접근 없음)
ALTER TABLE user_acquisition ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: `ad_spend` 마이그레이션 작성**

`supabase/migrations/20260705000001_ad_spend.sql`:
```sql
-- 20260705000001_ad_spend.sql — 메타 광고 지출 수동입력 (선택 기능)
CREATE TABLE IF NOT EXISTS ad_spend (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date   DATE NOT NULL,
  platform     TEXT NOT NULL DEFAULT 'meta',
  campaign     TEXT NOT NULL DEFAULT '',
  adset        TEXT NOT NULL DEFAULT '',
  creative_key TEXT NOT NULL DEFAULT '',
  impressions  INTEGER,
  clicks       INTEGER,
  spend_won    INTEGER NOT NULL,
  reach        INTEGER,
  note         TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spend_date, platform, campaign, adset, creative_key)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_creative_key ON ad_spend (creative_key);

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
```
> 참고: UNIQUE에 NULL이 섞이면 중복 방지가 안 되므로 campaign/adset/creative_key는 `NOT NULL DEFAULT ''`로 둔다(upsert 키 안정).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260705000000_user_acquisition.sql supabase/migrations/20260705000001_ad_spend.sql
git commit -m "feat(admin): user_acquisition + ad_spend 마이그레이션"
```
> dev push 후 Supabase dev 브랜치 Workflow logs에서 Migrations SUCCESS 확인(공통 운영 습관).

---

## Task 2: `lib/acquisition.ts` — 쿠키 직렬화/파싱 (순수, TDD)

**Files:**
- Create: `lib/acquisition.ts`
- Test: `lib/acquisition.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`lib/acquisition.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAcqPayload, parseAcqCookie, ACQ_COOKIE } from "./acquisition.ts";

test("buildAcqPayload — utm 없으면 null", () => {
  assert.equal(buildAcqPayload({}), null);
  assert.equal(buildAcqPayload({ foo: "bar" }), null);
});

test("buildAcqPayload — utm 하나라도 있으면 페이로드", () => {
  const p = buildAcqPayload({ utm_content: "vid_a", utm_source: "meta" });
  assert.equal(p?.utm_content, "vid_a");
  assert.equal(p?.utm_source, "meta");
  assert.equal(p?.utm_medium, undefined);
});

test("buildAcqPayload — fbclid 만 있어도 페이로드", () => {
  const p = buildAcqPayload({ fbclid: "abc" });
  assert.equal(p?.fbclid, "abc");
});

test("buildAcqPayload — 값 길이 200자로 cap", () => {
  const p = buildAcqPayload({ utm_campaign: "x".repeat(500) });
  assert.equal(p?.utm_campaign?.length, 200);
});

test("parseAcqCookie — 유효 JSON 라운드트립", () => {
  const p = buildAcqPayload({ utm_content: "vid_a" })!;
  const raw = encodeURIComponent(JSON.stringify(p));
  const parsed = parseAcqCookie(raw);
  assert.equal(parsed?.utm_content, "vid_a");
});

test("parseAcqCookie — 깨진 값이면 null", () => {
  assert.equal(parseAcqCookie("%%%not-json"), null);
  assert.equal(parseAcqCookie(undefined), null);
});

test("ACQ_COOKIE 이름", () => {
  assert.equal(ACQ_COOKIE, "byeolkong_acq");
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/acquisition.test.ts`
Expected: FAIL — `Cannot find module './acquisition.ts'`

- [ ] **Step 3: 구현**

`lib/acquisition.ts`:
```ts
// lib/acquisition.ts — first-touch 유입 출처 캡처 유틸 (순수).
export const ACQ_COOKIE = "byeolkong_acq";

/** 캡처 대상 파라미터(모두 optional). */
export const ACQ_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

export type AcqPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbc?: string;
  landing_variant?: string;
  referrer?: string;
  first_seen_at?: string;
};

const cap = (v: string) => v.slice(0, 200);

/** URL 파라미터 맵에서 페이로드 구성. 캡처 키가 하나도 없으면 null. */
export function buildAcqPayload(
  params: Record<string, string | undefined>
): AcqPayload | null {
  const out: AcqPayload = {};
  let has = false;
  for (const k of ACQ_KEYS) {
    const v = params[k];
    if (v) {
      out[k] = cap(v);
      has = true;
    }
  }
  return has ? out : null;
}

/** 쿠키 raw(encodeURIComponent(JSON)) → AcqPayload | null (방어적). */
export function parseAcqCookie(raw: string | undefined): AcqPayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!obj || typeof obj !== "object") return null;
    return obj as AcqPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/acquisition.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/acquisition.ts lib/acquisition.test.ts
git commit -m "feat(acq): first-touch 유입 캡처 유틸 + 테스트"
```

---

## Task 3: 캡처(클라) + 저장(서버)

**Files:**
- Modify: `components/auth/AuthBootstrap.tsx`
- Modify: `app/api/auth/kakao/route.ts`

- [ ] **Step 1: AuthBootstrap에 first-touch 캡처 이펙트 추가**

`components/auth/AuthBootstrap.tsx` — 상단 import에 추가:
```tsx
import { ACQ_COOKIE, ACQ_KEYS, buildAcqPayload } from "@/lib/acquisition";
```

컴포넌트 함수 본문(기존 `useEffect` **위**)에 별도 이펙트 추가:
```tsx
  // first-touch 유입 캡처: utm/fbclid 가 있고 아직 acq 쿠키가 없으면 1회 기록.
  // 쿠키가 이미 있으면 덮어쓰지 않음(first-touch 보존). 오가닉(파라미터 없음)은 무시.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.cookie.includes(`${ACQ_COOKIE}=`)) return;

    const params: Record<string, string | undefined> = {};
    for (const k of ACQ_KEYS) params[k] = sp.get(k) ?? undefined;
    const payload = buildAcqPayload(params);
    if (!payload) return;

    // 보조 신호
    payload.first_seen_at = new Date().toISOString();
    if (pathname === "/start") {
      const v = sp.get("utm_content");
      if (v) payload.landing_variant = v;
    }
    try {
      if (document.referrer) payload.referrer = document.referrer.slice(0, 200);
    } catch {}
    const fbc = document.cookie
      .split("; ")
      .find((c) => c.startsWith("_fbc="))
      ?.split("=")[1];
    if (fbc) payload.fbc = decodeURIComponent(fbc);

    const value = encodeURIComponent(JSON.stringify(payload));
    // 30일, 로그인 왕복(same-site 네비게이션)에 실려 서버로 감. httpOnly 아님(클라 기록).
    document.cookie = `${ACQ_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, [sp, pathname]);
```
> `new Date().toISOString()`은 클라이언트 코드라 허용(플랜 스크립트 제약과 무관).

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 카카오 콜백에 저장 로직 추가**

`app/api/auth/kakao/route.ts` — 상단 import에 추가:
```ts
import { ACQ_COOKIE, parseAcqCookie } from "@/lib/acquisition";
```

신규 유저 블록에서 `userId = newUser.id; isNewUser = true;` **직후**, `star_balances` insert 부근에 추가:
```ts
      // first-touch 유입 출처 저장 (신규 유저 1회). 쿠키 없으면(오가닉) 스킵.
      const acq = parseAcqCookie(request.cookies.get(ACQ_COOKIE)?.value);
      if (acq) {
        await supabase.from("user_acquisition").insert({
          user_id: userId,
          utm_source: acq.utm_source ?? null,
          utm_medium: acq.utm_medium ?? null,
          utm_campaign: acq.utm_campaign ?? null,
          utm_content: acq.utm_content ?? null,
          utm_term: acq.utm_term ?? null,
          fbclid: acq.fbclid ?? null,
          fbc: acq.fbc ?? null,
          landing_variant: acq.landing_variant ?? null,
          referrer: acq.referrer ?? null,
          first_seen_at: acq.first_seen_at ?? null,
        });
      }
```

- [ ] **Step 4: 리다이렉트 응답에서 acq 쿠키 삭제**

같은 파일에서 성공 리다이렉트 응답(`res`)에 OAuth state 쿠키 정리하는 곳(`res.cookies.set(STATE_COOKIE, "", …)` 부근)에 추가:
```ts
    // acq 쿠키 1회성 소비 — 저장 후 삭제(신규/기존 무관 정리)
    res.cookies.set(ACQ_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
```

- [ ] **Step 5: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add components/auth/AuthBootstrap.tsx app/api/auth/kakao/route.ts
git commit -m "feat(acq): first-touch 캡처(AuthBootstrap) + 카카오 콜백 저장"
```
> **배포 순서 주의**: 광고 켜기 전에 이 커밋이 prod에 있어야 초기 유입이 귀속됨(spec §11).

---

## Task 4: 상품별 집계 순수 함수 (TDD)

**Files:**
- Create: `lib/analytics/aggregate.ts`
- Test: `lib/analytics/aggregate.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`lib/analytics/aggregate.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProductBreakdown,
  type ReadingRow,
  type PaymentRow,
} from "./aggregate.ts";

const readings: ReadingRow[] = [
  // 고민톡 (fortune: 아님)
  { user_id: "u1", consultation_type: "saju", emotion_tag: "내 앞날의 방향이 궁금해", saju_product: "today_letters", stars_spent: 22, created_at: "2026-07-01T00:00:00Z" },
  { user_id: "u2", consultation_type: "tarot", emotion_tag: "그 사람 마음이 궁금해", saju_product: "today_letters", stars_spent: 0, created_at: "2026-07-01T00:00:00Z" },
  // 운세 리포트 (fortune:)
  { user_id: "u1", consultation_type: "saju", emotion_tag: "fortune:daily", saju_product: "today_letters", stars_spent: 0, created_at: "2026-07-02T00:00:00Z" },
  { user_id: "u3", consultation_type: "tarot", emotion_tag: "fortune:tarot_love", saju_product: "today_letters", stars_spent: 5, created_at: "2026-07-02T00:00:00Z" },
];

const payments: PaymentRow[] = [
  { user_id: "u1", amount_won: 2800, package_type: "star_30", status: "completed", created_at: "2026-07-01T00:00:00Z" },
  { user_id: "u2", amount_won: 1000, package_type: "star_10", status: "completed", created_at: "2026-07-01T00:00:00Z" },
  { user_id: "u3", amount_won: 5900, package_type: "star_30", status: "refunded", created_at: "2026-07-01T00:00:00Z" },
];

test("고민톡 — fortune: 제외, emotion_tag×type 그룹", () => {
  const r = buildProductBreakdown(readings, payments);
  // 고민톡 2건 (u1 saju, u2 tarot)
  assert.equal(r.counsel.reduce((a, b) => a + b.count, 0), 2);
  const sajuCounsel = r.counsel.find((c) => c.consultationType === "saju");
  assert.equal(sajuCounsel?.paidCount, 1);
  assert.equal(sajuCounsel?.starsSpent, 22);
});

test("운세 — fortune: 만, kind 별 집계", () => {
  const r = buildProductBreakdown(readings, payments);
  assert.equal(r.fortune.reduce((a, b) => a + b.count, 0), 2);
  const daily = r.fortune.find((f) => f.kind === "daily");
  assert.equal(daily?.count, 1);
  assert.equal(daily?.paidCount, 0);
});

test("별 구매 — completed 만, package_type 그룹 + 매출", () => {
  const r = buildProductBreakdown(readings, payments);
  const total = r.packages.reduce((a, b) => a + b.revenueWon, 0);
  assert.equal(total, 3800); // refunded 제외
  const p30 = r.packages.find((p) => p.packageType === "star_30");
  assert.equal(p30?.count, 1);
  assert.equal(p30?.revenueWon, 2800);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`lib/analytics/aggregate.ts`:
```ts
// lib/analytics/aggregate.ts — 조회한 행을 받아 집계하는 순수 함수들.
import { fortuneTypeFromTag } from "@/lib/fortune/types";

export type ReadingRow = {
  user_id: string;
  consultation_type: "saju" | "tarot";
  emotion_tag: string | null;
  saju_product: string | null;
  stars_spent: number | null;
  created_at: string;
};

export type PaymentRow = {
  user_id: string;
  amount_won: number | null;
  package_type: string | null;
  status: string | null;
  created_at: string;
};

export type CounselGroup = {
  emotionTag: string;
  consultationType: "saju" | "tarot";
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type FortuneGroup = {
  kind: string;
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type PackageGroup = {
  packageType: string;
  count: number;
  revenueWon: number;
};
export type ProductBreakdown = {
  counsel: CounselGroup[];
  fortune: FortuneGroup[];
  packages: PackageGroup[];
};

export function buildProductBreakdown(
  readings: ReadingRow[],
  payments: PaymentRow[]
): ProductBreakdown {
  const counsel = new Map<string, CounselGroup>();
  const fortune = new Map<string, FortuneGroup>();

  for (const r of readings) {
    const paid = (r.stars_spent ?? 0) > 0;
    const stars = r.stars_spent ?? 0;
    const kind = fortuneTypeFromTag(r.emotion_tag);
    if (kind) {
      const g =
        fortune.get(kind) ?? { kind, count: 0, paidCount: 0, starsSpent: 0 };
      g.count += 1;
      if (paid) g.paidCount += 1;
      g.starsSpent += stars;
      fortune.set(kind, g);
    } else {
      const tag = r.emotion_tag ?? "(없음)";
      const key = `${r.consultation_type}|${tag}`;
      const g =
        counsel.get(key) ?? {
          emotionTag: tag,
          consultationType: r.consultation_type,
          count: 0,
          paidCount: 0,
          starsSpent: 0,
        };
      g.count += 1;
      if (paid) g.paidCount += 1;
      g.starsSpent += stars;
      counsel.set(key, g);
    }
  }

  const packages = new Map<string, PackageGroup>();
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const key = p.package_type ?? "(없음)";
    const g =
      packages.get(key) ?? { packageType: key, count: 0, revenueWon: 0 };
    g.count += 1;
    g.revenueWon += p.amount_won ?? 0;
    packages.set(key, g);
  }

  const byCountDesc = <T extends { count: number }>(a: T, b: T) =>
    b.count - a.count;
  return {
    counsel: [...counsel.values()].sort(byCountDesc),
    fortune: [...fortune.values()].sort(byCountDesc),
    packages: [...packages.values()].sort((a, b) => b.revenueWon - a.revenueWon),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts
git commit -m "feat(analytics): 상품별 집계 순수 함수 + 테스트"
```

---

## Task 5: 상품별 집계 API 라우트

**Files:**
- Create: `app/api/admin/analytics/products/route.ts`

- [ ] **Step 1: 구현**

`app/api/admin/analytics/products/route.ts`:
```ts
// app/api/admin/analytics/products/route.ts — 상품별 집계(고민톡/운세/별구매).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildProductBreakdown } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  const [{ data: readings }, { data: payments }] = await Promise.all([
    supa
      .from("readings")
      .select("user_id, consultation_type, emotion_tag, saju_product, stars_spent, created_at")
      .gte("created_at", since)
      .limit(100000),
    supa
      .from("payments")
      .select("user_id, amount_won, package_type, status, created_at")
      .gte("created_at", since)
      .limit(100000),
  ]);

  return NextResponse.json({
    days,
    ...buildProductBreakdown(readings ?? [], payments ?? []),
  });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/analytics/products/route.ts
git commit -m "feat(analytics): 상품별 집계 API"
```

---

## Task 6: 추세(trends) 집계 함수 + API

**Files:**
- Modify: `lib/analytics/aggregate.ts`
- Modify: `lib/analytics/aggregate.test.ts`
- Create: `app/api/admin/analytics/trends/route.ts`

- [ ] **Step 1: 실패 테스트 추가**

`lib/analytics/aggregate.test.ts` 하단에 추가:
```ts
import { buildTrends } from "./aggregate.ts";

test("buildTrends — 일자별 가입/리딩/매출 (KST 일자 버킷)", () => {
  const t = buildTrends({
    users: [{ created_at: "2026-07-01T02:00:00Z" }, { created_at: "2026-07-01T20:00:00Z" }],
    readings: [{ created_at: "2026-07-01T05:00:00Z" }],
    payments: [{ created_at: "2026-07-01T05:00:00Z", amount_won: 2800, status: "completed" }],
    days: 2,
    todayKst: "2026-07-02",
  });
  const d1 = t.find((x) => x.date === "2026-07-01");
  assert.equal(d1?.newUsers, 2);
  assert.equal(d1?.readings, 1);
  assert.equal(d1?.revenueWon, 2800);
  // 빈 날짜도 0으로 채워짐
  const d2 = t.find((x) => x.date === "2026-07-02");
  assert.equal(d2?.newUsers, 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: FAIL — `buildTrends` 없음

- [ ] **Step 3: 구현 추가**

`lib/analytics/aggregate.ts` 하단에 추가:
```ts
export type TrendPoint = { date: string; newUsers: number; readings: number; revenueWon: number };

/** UTC ISO → KST 날짜(YYYY-MM-DD). */
function kstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildTrends(input: {
  users: { created_at: string }[];
  readings: { created_at: string }[];
  payments: { created_at: string; amount_won: number | null; status: string | null }[];
  days: number;
  todayKst: string; // 'YYYY-MM-DD' (KST 오늘)
}): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  // 날짜 축 미리 채움 (todayKst 부터 과거로 days 개)
  const base = new Date(`${input.todayKst}T00:00:00Z`);
  for (let i = 0; i < input.days; i++) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    map.set(d, { date: d, newUsers: 0, readings: 0, revenueWon: 0 });
  }
  const bump = (iso: string, f: (p: TrendPoint) => void) => {
    const p = map.get(kstDate(iso));
    if (p) f(p);
  };
  for (const u of input.users) bump(u.created_at, (p) => (p.newUsers += 1));
  for (const r of input.readings) bump(r.created_at, (p) => (p.readings += 1));
  for (const pay of input.payments) {
    if (pay.status !== "completed") continue;
    bump(pay.created_at, (p) => (p.revenueWon += pay.amount_won ?? 0));
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: PASS (모든 테스트)

- [ ] **Step 5: trends API 작성**

`app/api/admin/analytics/trends/route.ts`:
```ts
// app/api/admin/analytics/trends/route.ts — 일별 가입/리딩/매출 추세.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { daysAgoKstIso, startOfTodayKstIso } from "@/lib/admin-time";
import { buildTrends } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  // startOfTodayKstIso()는 KST 오늘 0시의 UTC ISO → +9h 후 슬라이스하면 KST 날짜.
  const todayKst = new Date(new Date(startOfTodayKstIso()).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  const supa = getServiceSupabase();

  const [{ data: users }, { data: readings }, { data: payments }] = await Promise.all([
    supa.from("users").select("created_at").gte("created_at", since).limit(100000),
    supa.from("readings").select("created_at").gte("created_at", since).limit(100000),
    supa.from("payments").select("created_at, amount_won, status").eq("status", "completed").gte("created_at", since).limit(100000),
  ]);

  return NextResponse.json({
    days,
    points: buildTrends({
      users: users ?? [],
      readings: readings ?? [],
      payments: payments ?? [],
      days,
      todayKst,
    }),
  });
}
```
> `todayKst`는 KST 오늘 날짜(YYYY-MM-DD). `startOfTodayKstIso()`는 UTC ISO를 주므로 +9h 후 슬라이스.

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts app/api/admin/analytics/trends/route.ts
git commit -m "feat(analytics): 일별 추세 집계 + API"
```

---

## Task 7: 소재별 퍼널 + CAC/ROAS 집계 함수 + API

**Files:**
- Modify: `lib/analytics/aggregate.ts`
- Modify: `lib/analytics/aggregate.test.ts`
- Create: `app/api/admin/analytics/funnel/route.ts`

- [ ] **Step 1: 실패 테스트 추가**

`lib/analytics/aggregate.test.ts` 하단에 추가:
```ts
import { buildFunnel } from "./aggregate.ts";

test("buildFunnel — 소재별 퍼널 + ad_spend 조인 CAC/ROAS", () => {
  const rows = buildFunnel({
    acquisitions: [
      { user_id: "u1", utm_content: "vid_a" },
      { user_id: "u2", utm_content: "vid_a" },
      { user_id: "u3", utm_content: null }, // organic
    ],
    readings: [
      { user_id: "u1" }, { user_id: "u3" },
    ],
    payments: [
      { user_id: "u1", status: "completed", amount_won: 2800 },
      { user_id: "u1", status: "completed", amount_won: 1000 }, // 재결제
    ],
    spend: [{ creative_key: "vid_a", spend_won: 10000 }],
  });
  const a = rows.find((r) => r.creative === "vid_a")!;
  assert.equal(a.signups, 2);
  assert.equal(a.tried, 1);       // u1 만 리딩
  assert.equal(a.firstPaid, 1);   // u1
  assert.equal(a.repaid, 1);      // u1 2건
  assert.equal(a.revenueWon, 3800);
  assert.equal(a.spendWon, 10000);
  assert.equal(a.cac, 5000);      // 10000 / 2
  assert.equal(a.roas, 0.38);     // 3800 / 10000
  const org = rows.find((r) => r.creative === "(organic)")!;
  assert.equal(org.signups, 1);
  assert.equal(org.spendWon, null);
  assert.equal(org.cac, null);
  assert.equal(org.roas, null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: FAIL — `buildFunnel` 없음

- [ ] **Step 3: 구현 추가**

`lib/analytics/aggregate.ts` 하단에 추가:
```ts
export type FunnelRow = {
  creative: string; // utm_content 또는 '(organic)'
  signups: number;
  tried: number;
  firstPaid: number;
  repaid: number;
  signupToPaidPct: number; // 0~100, 소수 1자리
  revenueWon: number;
  spendWon: number | null;
  cac: number | null;
  roas: number | null;
};

const ORGANIC = "(organic)";

export function buildFunnel(input: {
  acquisitions: { user_id: string; utm_content: string | null }[];
  readings: { user_id: string }[];
  payments: { user_id: string; status: string | null; amount_won: number | null }[];
  spend: { creative_key: string; spend_won: number }[];
}): FunnelRow[] {
  const creativeOf = new Map<string, string>();
  const groups = new Map<string, { users: Set<string> }>();
  for (const a of input.acquisitions) {
    const c = a.utm_content || ORGANIC;
    creativeOf.set(a.user_id, c);
    (groups.get(c) ?? groups.set(c, { users: new Set() }).get(c)!).users.add(a.user_id);
  }

  const triedUsers = new Set(input.readings.map((r) => r.user_id));
  const paidCount = new Map<string, number>(); // completed 결제 수
  const revByUser = new Map<string, number>();
  for (const p of input.payments) {
    if (p.status !== "completed") continue;
    paidCount.set(p.user_id, (paidCount.get(p.user_id) ?? 0) + 1);
    revByUser.set(p.user_id, (revByUser.get(p.user_id) ?? 0) + (p.amount_won ?? 0));
  }

  const spendByCreative = new Map<string, number>();
  for (const s of input.spend) {
    spendByCreative.set(s.creative_key, (spendByCreative.get(s.creative_key) ?? 0) + s.spend_won);
  }

  const rows: FunnelRow[] = [];
  for (const [creative, g] of groups) {
    let tried = 0, firstPaid = 0, repaid = 0, revenueWon = 0;
    for (const u of g.users) {
      if (triedUsers.has(u)) tried += 1;
      const pc = paidCount.get(u) ?? 0;
      if (pc >= 1) firstPaid += 1;
      if (pc >= 2) repaid += 1;
      revenueWon += revByUser.get(u) ?? 0;
    }
    const signups = g.users.size;
    const spendWon = creative === ORGANIC ? null : spendByCreative.get(creative) ?? null;
    rows.push({
      creative,
      signups,
      tried,
      firstPaid,
      repaid,
      signupToPaidPct: signups ? Math.round((firstPaid / signups) * 1000) / 10 : 0,
      revenueWon,
      spendWon,
      cac: spendWon && signups ? Math.round(spendWon / signups) : null,
      roas: spendWon ? Math.round((revenueWon / spendWon) * 100) / 100 : null,
    });
  }
  // organic 은 맨 아래, 나머지는 가입 내림차순
  return rows.sort((a, b) => {
    if (a.creative === ORGANIC) return 1;
    if (b.creative === ORGANIC) return -1;
    return b.signups - a.signups;
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: PASS

- [ ] **Step 5: funnel API 작성**

`app/api/admin/analytics/funnel/route.ts`:
```ts
// app/api/admin/analytics/funnel/route.ts — 소재별 퍼널 + ad_spend 조인 CAC/ROAS.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildFunnel } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  // 선택 기간에 '가입'한 유저를 코호트로 (user_acquisition 은 users 와 1:1, created_at 동일 시점)
  const { data: acqs } = await supa
    .from("user_acquisition")
    .select("user_id, utm_content, created_at")
    .gte("created_at", since)
    .limit(100000);

  const userIds = (acqs ?? []).map((a) => a.user_id);
  const [{ data: readings }, { data: payments }, { data: spend }] = await Promise.all([
    userIds.length
      ? supa.from("readings").select("user_id").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    userIds.length
      ? supa.from("payments").select("user_id, status, amount_won").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; status: string | null; amount_won: number | null }[] }),
    supa.from("ad_spend").select("creative_key, spend_won").gte("spend_date", since.slice(0, 10)).limit(100000),
  ]);

  return NextResponse.json({
    days,
    rows: buildFunnel({
      acquisitions: (acqs ?? []).map((a) => ({ user_id: a.user_id, utm_content: a.utm_content })),
      readings: readings ?? [],
      payments: payments ?? [],
      spend: spend ?? [],
    }),
  });
}
```
> 주: `.in("user_id", userIds)`는 userIds가 매우 커지면(수만) 쿼리 길이 한계에 걸릴 수 있음 — 현 규모 OK, 초과 시 RPC/뷰로 승격(spec §8 후속).

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts app/api/admin/analytics/funnel/route.ts
git commit -m "feat(analytics): 소재별 퍼널 + CAC/ROAS 집계 + API"
```

---

## Task 8: 코호트 LTV/리텐션 집계 함수 + API

**Files:**
- Modify: `lib/analytics/aggregate.ts`
- Modify: `lib/analytics/aggregate.test.ts`
- Create: `app/api/admin/analytics/cohorts/route.ts`

- [ ] **Step 1: 실패 테스트 추가**

`lib/analytics/aggregate.test.ts` 하단에 추가:
```ts
import { buildCohorts } from "./aggregate.ts";

test("buildCohorts — 가입 주차별 누적 LTV(유저 평균) + 리텐션", () => {
  const c = buildCohorts({
    users: [
      { id: "u1", created_at: "2026-06-01T00:00:00Z" }, // 월요일 주차
      { id: "u2", created_at: "2026-06-02T00:00:00Z" },
    ],
    payments: [
      { user_id: "u1", amount_won: 3000, status: "completed", created_at: "2026-06-03T00:00:00Z" }, // week 0
      { user_id: "u1", amount_won: 2000, status: "completed", created_at: "2026-06-10T00:00:00Z" }, // week 1
    ],
    activity: [
      { user_id: "u1", created_at: "2026-06-10T00:00:00Z" }, // D7 재활동
    ],
    weeks: 3,
  });
  assert.equal(c.length, 1); // 같은 주차 코호트 1개
  const wk = c[0];
  assert.equal(wk.cohortSize, 2);
  // week0 누적 3000, week1 누적 5000 → 유저 평균 (2명 기준)
  assert.equal(wk.cumRevenuePerUser[0], 1500); // 3000/2
  assert.equal(wk.cumRevenuePerUser[1], 2500); // 5000/2
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: FAIL — `buildCohorts` 없음

- [ ] **Step 3: 구현 추가**

`lib/analytics/aggregate.ts` 하단에 추가:
```ts
export type CohortRow = {
  weekStart: string;             // 코호트 주차 시작(YYYY-MM-DD, KST 월요일)
  cohortSize: number;
  cumRevenuePerUser: number[];   // index = 경과 주차, 누적 결제액/코호트크기
  retention: { d1: number; d7: number; d30: number }; // 재활동 유저 비율 0~100
};

/** iso → KST 기준 그 주 월요일(YYYY-MM-DD). */
function kstWeekStart(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  const day = kst.getUTCDay(); // 0=일
  const diff = (day === 0 ? -6 : 1) - day; // 월요일로
  kst.setUTCDate(kst.getUTCDate() + diff);
  return kst.toISOString().slice(0, 10);
}
function daysBetween(aIso: string, bIso: string): number {
  return Math.floor((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000);
}

export function buildCohorts(input: {
  users: { id: string; created_at: string }[];
  payments: { user_id: string; amount_won: number | null; status: string | null; created_at: string }[];
  activity: { user_id: string; created_at: string }[]; // 재활동 신호(리딩 등)
  weeks: number;
}): CohortRow[] {
  const signup = new Map<string, string>(); // userId → created_at
  const cohortOf = new Map<string, string>(); // userId → weekStart
  const cohorts = new Map<string, Set<string>>();
  for (const u of input.users) {
    signup.set(u.id, u.created_at);
    const w = kstWeekStart(u.created_at);
    cohortOf.set(u.id, w);
    (cohorts.get(w) ?? cohorts.set(w, new Set()).get(w)!).add(u.id);
  }

  // 누적 결제(주차별)
  const rev = new Map<string, number[]>(); // weekStart → 주차별 결제 합
  for (const p of input.payments) {
    if (p.status !== "completed") continue;
    const su = signup.get(p.user_id);
    const w = cohortOf.get(p.user_id);
    if (!su || !w) continue;
    const wi = Math.max(0, Math.floor(daysBetween(su, p.created_at) / 7));
    if (wi >= input.weeks) continue;
    const arr = rev.get(w) ?? new Array(input.weeks).fill(0);
    arr[wi] += p.amount_won ?? 0;
    rev.set(w, arr);
  }

  // 리텐션(재활동 D1/D7/D30 — 가입 이후 해당 시점 이후 활동한 유저 수)
  const ret = new Map<string, { d1: Set<string>; d7: Set<string>; d30: Set<string> }>();
  for (const a of input.activity) {
    const su = signup.get(a.user_id);
    const w = cohortOf.get(a.user_id);
    if (!su || !w) continue;
    const d = daysBetween(su, a.created_at);
    const r = ret.get(w) ?? { d1: new Set(), d7: new Set(), d30: new Set() };
    if (d >= 1) r.d1.add(a.user_id);
    if (d >= 7) r.d7.add(a.user_id);
    if (d >= 30) r.d30.add(a.user_id);
    ret.set(w, r);
  }

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const out: CohortRow[] = [];
  for (const [weekStart, users] of cohorts) {
    const size = users.size;
    const revArr = rev.get(weekStart) ?? new Array(input.weeks).fill(0);
    // 누적화
    const cum: number[] = [];
    let running = 0;
    for (let i = 0; i < input.weeks; i++) {
      running += revArr[i];
      cum.push(size ? Math.round(running / size) : 0);
    }
    const r = ret.get(weekStart) ?? { d1: new Set(), d7: new Set(), d30: new Set() };
    out.push({
      weekStart,
      cohortSize: size,
      cumRevenuePerUser: cum,
      retention: { d1: pct(r.d1.size, size), d7: pct(r.d7.size, size), d30: pct(r.d30.size, size) },
    });
  }
  return out.sort((a, b) => b.weekStart.localeCompare(a.weekStart)); // 최신 주차 먼저
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: PASS

- [ ] **Step 5: cohorts API 작성**

`app/api/admin/analytics/cohorts/route.ts`:
```ts
// app/api/admin/analytics/cohorts/route.ts — 가입 주차 코호트 LTV/리텐션 (최근 12주).
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildCohorts } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKS = 12;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const since = daysAgoKstIso(WEEKS * 7 - 1);
  const supa = getServiceSupabase();

  const { data: users } = await supa
    .from("users").select("id, created_at").gte("created_at", since).limit(100000);
  const userIds = (users ?? []).map((u) => u.id);

  const [{ data: payments }, { data: activity }] = await Promise.all([
    userIds.length
      ? supa.from("payments").select("user_id, amount_won, status, created_at").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; amount_won: number | null; status: string | null; created_at: string }[] }),
    userIds.length
      ? supa.from("readings").select("user_id, created_at").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; created_at: string }[] }),
  ]);

  return NextResponse.json({
    weeks: WEEKS,
    cohorts: buildCohorts({
      users: users ?? [],
      payments: payments ?? [],
      activity: activity ?? [],
      weeks: WEEKS,
    }),
  });
}
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts app/api/admin/analytics/cohorts/route.ts
git commit -m "feat(analytics): 코호트 LTV/리텐션 집계 + API"
```

---

## Task 9: 애널리틱스 화면 + 차트/히트맵 컴포넌트 + nav

**Files:**
- Create: `components/admin/LineChart.tsx`
- Create: `components/admin/CohortHeatmap.tsx`
- Create: `app/admin/analytics/page.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: SVG 라인차트 컴포넌트**

`components/admin/LineChart.tsx`:
```tsx
// components/admin/LineChart.tsx — 의존성 없는 SVG 라인차트.
type Series = { label: string; color: string; values: number[] };

export function LineChart({
  labels,
  series,
  height = 160,
}: {
  labels: string[];
  series: Series[];
  height?: number;
}) {
  const W = 640, H = height, pad = 24;
  const n = labels.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, n - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="rgba(255,255,255,0.15)" />
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        />
      ))}
      {series.map((s, si) => (
        <text key={s.label} x={pad} y={12 + si * 14} fill={s.color} fontSize={11}>
          ● {s.label} (max {max.toLocaleString()})
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: 코호트 히트맵 컴포넌트**

`components/admin/CohortHeatmap.tsx`:
```tsx
// components/admin/CohortHeatmap.tsx — CSS 그리드 히트맵(누적 LTV).
type CohortRow = {
  weekStart: string;
  cohortSize: number;
  cumRevenuePerUser: number[];
  retention: { d1: number; d7: number; d30: number };
};

export function CohortHeatmap({ cohorts, weeks }: { cohorts: CohortRow[]; weeks: number }) {
  const max = Math.max(1, ...cohorts.flatMap((c) => c.cumRevenuePerUser));
  const cell = (v: number) => `rgba(159,138,208,${Math.min(0.9, v / max)})`; // lilac-deep 톤
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] border-separate border-spacing-1">
        <thead>
          <tr className="text-white/50">
            <th className="text-left px-2">가입주차</th>
            <th className="px-2">인원</th>
            <th className="px-2">D1</th>
            <th className="px-2">D7</th>
            <th className="px-2">D30</th>
            {Array.from({ length: weeks }, (_, i) => (
              <th key={i} className="px-2">W{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.weekStart}>
              <td className="px-2 text-white/80">{c.weekStart}</td>
              <td className="px-2 text-center text-white/70">{c.cohortSize}</td>
              <td className="px-2 text-center text-white/60">{c.retention.d1}%</td>
              <td className="px-2 text-center text-white/60">{c.retention.d7}%</td>
              <td className="px-2 text-center text-white/60">{c.retention.d30}%</td>
              {c.cumRevenuePerUser.map((v, i) => (
                <td key={i} className="px-2 text-center rounded" style={{ background: cell(v) }}>
                  {v ? v.toLocaleString() : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 애널리틱스 페이지(server component, API fetch)**

`app/admin/analytics/page.tsx`:
```tsx
// app/admin/analytics/page.tsx — 추세 + 소재 퍼널 + 상품별 + 코호트.
import { headers } from "next/headers";
import { LineChart } from "@/components/admin/LineChart";
import { CohortHeatmap } from "@/components/admin/CohortHeatmap";

export const dynamic = "force-dynamic";

async function api(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cookie = h.get("cookie") ?? "";
  const res = await fetch(`${proto}://${host}${path}`, {
    headers: { cookie },
    cache: "no-store",
  });
  return res.ok ? res.json() : null;
}

export default async function AnalyticsPage() {
  const days = 30;
  const [trends, funnel, products, cohorts] = await Promise.all([
    api(`/api/admin/analytics/trends?days=${days}`),
    api(`/api/admin/analytics/funnel?days=${days}`),
    api(`/api/admin/analytics/products?days=${days}`),
    api(`/api/admin/analytics/cohorts`),
  ]);
  const pts: { date: string; newUsers: number; readings: number; revenueWon: number }[] =
    trends?.points ?? [];

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-bold">애널리틱스 <span className="text-white/40 text-sm">(최근 {days}일)</span></h1>

      <section>
        <h2 className="text-sm text-white/60 mb-3">추세</h2>
        <LineChart
          labels={pts.map((p) => p.date)}
          series={[
            { label: "가입", color: "#E8C26A", values: pts.map((p) => p.newUsers) },
            { label: "리딩", color: "#B8A8D8", values: pts.map((p) => p.readings) },
            { label: "매출(원)", color: "#9F8AD0", values: pts.map((p) => p.revenueWon) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">소재별 퍼널 · CAC · ROAS</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-1">소재</th><th>가입</th><th>체험</th><th>첫결제</th><th>재결제</th>
                <th>가입→결제%</th><th>지출</th><th>CAC</th><th>매출</th><th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {(funnel?.rows ?? []).map((r: Record<string, number | string | null>) => (
                <tr key={String(r.creative)} className="border-t border-white/10">
                  <td className="py-1.5">{r.creative}</td>
                  <td>{r.signups}</td><td>{r.tried}</td><td>{r.firstPaid}</td><td>{r.repaid}</td>
                  <td>{r.signupToPaidPct}%</td>
                  <td>{r.spendWon == null ? "—" : Number(r.spendWon).toLocaleString()}</td>
                  <td>{r.cac == null ? "—" : Number(r.cac).toLocaleString()}</td>
                  <td>{Number(r.revenueWon).toLocaleString()}</td>
                  <td>{r.roas == null ? "—" : r.roas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <ProductTable title="고민톡 — 고민 분류별" rows={(products?.counsel ?? []).map((c: { emotionTag: string; consultationType: string; count: number; paidCount: number }) => ({ k: `${c.consultationType}·${c.emotionTag}`, a: c.count, b: c.paidCount }))} colB="유료" />
        <ProductTable title="운세 리포트 — 종류별" rows={(products?.fortune ?? []).map((f: { kind: string; count: number; paidCount: number }) => ({ k: f.kind, a: f.count, b: f.paidCount }))} colB="유료" />
        <ProductTable title="별 구매 — 상품별" rows={(products?.packages ?? []).map((p: { packageType: string; count: number; revenueWon: number }) => ({ k: p.packageType, a: p.count, b: p.revenueWon }))} colB="매출(원)" />
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">코호트 LTV / 리텐션 (누적 결제액/인, 최근 {cohorts?.weeks ?? 12}주)</h2>
        <CohortHeatmap cohorts={cohorts?.cohorts ?? []} weeks={cohorts?.weeks ?? 12} />
      </section>
    </div>
  );
}

function ProductTable({ title, rows, colB }: { title: string; rows: { k: string; a: number; b: number }[]; colB: string }) {
  return (
    <div>
      <h3 className="text-sm text-white/70 mb-2">{title}</h3>
      <table className="w-full text-[12px]">
        <thead className="text-white/40 text-left"><tr><th className="py-1">항목</th><th>건수</th><th>{colB}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-t border-white/10">
              <td className="py-1">{r.k}</td><td>{r.a}</td><td>{r.b.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="py-2 text-white/30">데이터 없음</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```
> 페이지→API fetch 시 서버가 자기 자신을 호출하므로 `cookie` 헤더를 전달해 `requireAdmin` 세션이 유지되도록 함(어드민 layout이 이미 가드하므로 노출 없음).

- [ ] **Step 4: nav에 항목 추가**

`app/admin/layout.tsx`의 `NAV` 배열에서 대시보드 다음 줄에 추가:
```ts
  { href: "/admin/analytics", label: "애널리틱스", emoji: "📈" },
```

- [ ] **Step 5: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add components/admin/LineChart.tsx components/admin/CohortHeatmap.tsx app/admin/analytics/page.tsx app/admin/layout.tsx
git commit -m "feat(admin): 애널리틱스 화면(추세/퍼널/상품/코호트) + nav"
```

---

## Task 10: `ad_spend` write 액션 타입 + ads API

**Files:**
- Modify: `lib/admin-actions.ts`
- Create: `app/api/admin/ads/route.ts`
- Create: `app/api/admin/ads/[id]/route.ts`

- [ ] **Step 1: AdminActionName 확장**

`lib/admin-actions.ts`의 `AdminActionName` 유니온에 추가:
```ts
  | "ad_spend_upsert"
  | "ad_spend_delete"
```

- [ ] **Step 2: ads 목록/upsert 라우트**

`app/api/admin/ads/route.ts`:
```ts
// app/api/admin/ads/route.ts — 광고 지출 목록(GET) / upsert(POST).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin, requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { data } = await getServiceSupabase()
    .from("ad_spend")
    .select("*")
    .order("spend_date", { ascending: false })
    .limit(500);
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const b = await req.json().catch(() => null);
  if (!b || !b.spend_date || b.spend_won == null) {
    return NextResponse.json({ error: "spend_date, spend_won 필수" }, { status: 400 });
  }
  const row = {
    spend_date: String(b.spend_date),
    platform: String(b.platform ?? "meta"),
    campaign: String(b.campaign ?? ""),
    adset: String(b.adset ?? ""),
    creative_key: String(b.creative_key ?? ""),
    impressions: b.impressions == null ? null : Number(b.impressions),
    clicks: b.clicks == null ? null : Number(b.clicks),
    spend_won: Number(b.spend_won),
    reach: b.reach == null ? null : Number(b.reach),
    note: b.note ? String(b.note) : null,
    created_by: gate.userId,
    updated_at: new Date().toISOString(),
  };
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from("ad_spend")
    .upsert(row, { onConflict: "spend_date,platform,campaign,adset,creative_key" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    adminId: gate.userId,
    action: "ad_spend_upsert",
    targetType: "ad_spend",
    targetId: data?.id ?? null,
    payload: { spend_date: row.spend_date, creative_key: row.creative_key, spend_won: row.spend_won },
  });
  return NextResponse.json({ ok: true, id: data?.id });
}
```

- [ ] **Step 3: ads 삭제 라우트**

`app/api/admin/ads/[id]/route.ts`:
```ts
// app/api/admin/ads/[id]/route.ts — 광고 지출 행 삭제.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const { error } = await getServiceSupabase().from("ad_spend").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    adminId: gate.userId,
    action: "ad_spend_delete",
    targetType: "ad_spend",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
```
> Next 16: 동적 라우트의 `params`는 `Promise` — `await ctx.params` 필수.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/admin-actions.ts app/api/admin/ads/route.ts app/api/admin/ads/[id]/route.ts
git commit -m "feat(admin): 광고 지출 upsert/삭제 API + 감사 액션"
```

---

## Task 11: 광고 지출 입력 화면 + nav

**Files:**
- Create: `components/admin/AdSpendForm.tsx`
- Create: `app/admin/ads/page.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: 입력 폼(client)**

`components/admin/AdSpendForm.tsx`:
```tsx
"use client";

// components/admin/AdSpendForm.tsx — 광고 지출 1행 추가/수정 폼.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdSpendForm({ creativeSuggestions }: { creativeSuggestions: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    spend_date: "", campaign: "", adset: "", creative_key: "",
    impressions: "", clicks: "", spend_won: "", reach: "", note: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.spend_date || !form.spend_won) {
      alert("날짜와 지출(원)은 필수예요.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/ads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("저장 실패: " + (await res.text()));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
      <label className="flex flex-col gap-1">날짜<input type="date" value={form.spend_date} onChange={(e) => set("spend_date", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">캠페인<input value={form.campaign} onChange={(e) => set("campaign", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">광고세트<input value={form.adset} onChange={(e) => set("adset", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">소재(utm_content)
        <input list="creatives" value={form.creative_key} onChange={(e) => set("creative_key", e.target.value)} className="bg-night rounded px-2 py-1" />
        <datalist id="creatives">{creativeSuggestions.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1">노출<input type="number" value={form.impressions} onChange={(e) => set("impressions", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">클릭<input type="number" value={form.clicks} onChange={(e) => set("clicks", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">지출(원)<input type="number" value={form.spend_won} onChange={(e) => set("spend_won", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">도달<input type="number" value={form.reach} onChange={(e) => set("reach", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <button onClick={submit} disabled={busy} className="col-span-2 md:col-span-4 bg-lilac-deep rounded py-2 font-medium disabled:opacity-50">
        {busy ? "저장 중…" : "저장 (같은 날·소재는 덮어씀)"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 지출 페이지(server)**

`app/admin/ads/page.tsx`:
```tsx
// app/admin/ads/page.tsx — 광고 지출 입력/목록.
import { getServiceSupabase } from "@/lib/supabase";
import { daysAgoKstIso } from "@/lib/admin-time";
import { AdSpendForm } from "@/components/admin/AdSpendForm";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const supa = getServiceSupabase();
  const [{ data: rows }, { data: acqs }] = await Promise.all([
    supa.from("ad_spend").select("*").order("spend_date", { ascending: false }).limit(500),
    supa.from("user_acquisition").select("utm_content").gte("created_at", daysAgoKstIso(89)).limit(100000),
  ]);
  const suggestions = [...new Set((acqs ?? []).map((a) => a.utm_content).filter(Boolean) as string[])];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">광고 지출 <span className="text-white/40 text-sm">(수동 입력 · 선택)</span></h1>
      <p className="text-[13px] text-white/50">메타 Ads Manager 숫자를 일자·소재별로 입력하면 애널리틱스의 CAC·ROAS가 채워집니다. 입력 안 해도 다른 지표는 모두 동작합니다.</p>
      <AdSpendForm creativeSuggestions={suggestions} />

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-white/50 text-left"><tr>
            <th className="py-1">날짜</th><th>캠페인</th><th>소재</th><th>노출</th><th>클릭</th><th>지출(원)</th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r: Record<string, unknown>) => (
              <tr key={String(r.id)} className="border-t border-white/10">
                <td className="py-1.5">{String(r.spend_date)}</td>
                <td>{String(r.campaign ?? "")}</td>
                <td>{String(r.creative_key ?? "")}</td>
                <td>{r.impressions == null ? "—" : Number(r.impressions).toLocaleString()}</td>
                <td>{r.clicks == null ? "—" : Number(r.clicks).toLocaleString()}</td>
                <td>{Number(r.spend_won).toLocaleString()}</td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={6} className="py-3 text-white/30">아직 입력된 지출이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: nav에 항목 추가**

`app/admin/layout.tsx`의 `NAV` 배열 하단(에러 로그 앞)에 추가:
```ts
  { href: "/admin/ads", label: "광고 지출", emoji: "📣" },
```

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 5: 커밋**

```bash
git add components/admin/AdSpendForm.tsx app/admin/ads/page.tsx app/admin/layout.tsx
git commit -m "feat(admin): 광고 지출 입력 화면 + nav"
```

---

## Task 12: 통합 검증 (dev)

**Files:** 없음 (수동 검증 + 문서화)

- [ ] **Step 1: 전체 테스트 + 빌드**

Run:
```bash
node --import tsx --test lib/acquisition.test.ts lib/analytics/aggregate.test.ts
npx tsc --noEmit && npm run build
```
Expected: 테스트 전부 PASS, 빌드 성공

- [ ] **Step 2: dev push + 마이그레이션 확인**

```bash
git push origin dev
```
Supabase dev 브랜치 Workflow logs에서 `user_acquisition`/`ad_spend` Migrations SUCCESS 확인.

- [ ] **Step 3: 어트리뷰션 캡처 수동 검증(dev)**

- `https://dev.byeolkongtalk.com/start?utm_content=vid_test&utm_source=meta&utm_medium=cpc` 진입 → 카카오 **신규** 계정으로 로그인.
- Supabase dev SQL: `SELECT * FROM user_acquisition ORDER BY created_at DESC LIMIT 3;` → 방금 utm 1행 확인.
- utm 없이 `https://dev.byeolkongtalk.com/`로 신규 가입 → `user_acquisition` 행 **미생성** 확인.
- 기존 유저 재로그인 → 행 개수 변화 없음(first-touch 보존) 확인.

- [ ] **Step 4: 어드민 화면 검증(dev)**

- `/admin/analytics`: 추세 차트 렌더, 소재별 퍼널 테이블에 `vid_test` 행 + `(organic)` 행, CAC/ROAS는 `—`, 상품별 3표 값이 목록과 대략 일치, 코호트 히트맵 렌더.
- `/admin/ads`: 지출 폼에서 `vid_test` 소재 · 임의 지출 저장 → 목록에 나타남 → `/admin/analytics` 새로고침 시 해당 소재 CAC/ROAS가 숫자로 채워짐.
- 상품별 집계 합 검증: 고민톡+운세 리딩 건수 합이 같은 기간 `readings` 총건수와 일치, 별 구매 매출 합이 대시보드 매출과 일치.

- [ ] **Step 5: main fast-forward (사용자 확인 후)**

```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```
> **광고 켜기 전에** Task 3(캡처) 커밋이 prod에 있어야 초기 유입 귀속됨.

---

## Self-Review 결과

**Spec 커버리지**
- §3 데이터 모델 → Task 1. §4 캡처/저장 → Task 2·3. §5.1 추세 → Task 6·9. §5.2 퍼널/CAC/ROAS → Task 7·9. §5.3 코호트 → Task 8·9. §6 상품별 → Task 4·5·9. §7 지출 입력 → Task 10·11. §8 API → Task 5·6·7·8·10. §9 nav → Task 9·11. §10 개인정보 → 논블로킹(spec에만 기록, 코드 없음). §11 구현 순서 → Task 순서 일치. §12 검증 → Task 12.
- **갭 없음.** §10은 legal 체크로 코드 태스크 없음이 의도된 것.

**Placeholder 스캔**: TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함.

**타입 일관성**: `ReadingRow`/`PaymentRow`(Task 4)를 products/funnel/cohort에서 재사용, `buildProductBreakdown`/`buildTrends`/`buildFunnel`/`buildCohorts` 시그니처가 각 API 라우트 호출과 일치. `AdminActionName`에 `ad_spend_upsert`/`ad_spend_delete` 추가 후 Task 10에서 사용. `ACQ_COOKIE`/`buildAcqPayload`/`parseAcqCookie`가 Task 2 정의 → Task 3에서 동일 이름으로 소비.
