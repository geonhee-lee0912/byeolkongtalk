# 별자리(무료 서비스) 어드민 + 어트리뷰션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin` 에 "무료 서비스 > 별 인연 별자리" 퍼널 대시보드(생성→초대→가입→결제)를 만들고, 배포 전에 어트리뷰션 인프라(초대 링크 utm · shareId path 정규화 · 초대클릭 계측)를 심는다.

**Architecture:** 어트리뷰션은 B.하이브리드 — 링크 유입은 초대 링크의 `utm_source=byeoljari` 로 기존 `user_acquisition` 파이프에 first-class 기록, 참여자는 `star_map_members.member_anon_id` ↔ `page_views`(anon+user 브리지) SQL join. 집계는 패턴 B(서버 컴포넌트 페이지가 `service_role` 로 RPC 직접 호출, API 라우트 없음 — `admin_sim_summary` 선례). 멤버/맵 테이블 스키마 변경 없음.

**Tech Stack:** Next.js 16(App Router, RSC) · TypeScript strict · Supabase(PostgreSQL, SECURITY DEFINER RPC) · Tailwind v4 · 테스트 `node:test`(`node --import tsx --test`).

**정본 스펙:** `docs/superpowers/specs/2026-08-23-byeoljari-admin-attribution-design.md`

---

## 파일 구조

| 파일 | 역할 | 태스크 |
|---|---|---|
| `lib/byeoljari/invite-link.ts` (신규) | 초대 링크 URL 빌더(순수 함수) | 1 |
| `lib/byeoljari/invite-link.test.ts` (신규) | 빌더 유닛 | 1 |
| `lib/analytics/ui-events.ts` (수정) | allowlist 에 `byeoljari_invite_clicked` | 2 |
| `app/fortune/byeoljari/[shareId]/page.tsx` (수정) | 복사 버튼 = utm 링크 + 클릭 계측 | 2 |
| `lib/analytics/pageview.ts` (수정) | `normalizePath` byeoljari shareId 정규화 | 3 |
| `lib/analytics/pageview.test.ts` (수정) | 정규화 회귀 테스트 | 3 |
| `lib/analytics/route-labels.ts` (수정) | byeoljari 라우트 라벨 2개 | 4 |
| `lib/analytics/route-labels.test.ts` (수정) | 라벨 계약 | 4 |
| `supabase/migrations/20260823000000_admin_byeoljari_aggregates.sql` (신규) | RPC 3개 | 5 |
| `components/admin/AdminNav.tsx` (수정) | "무료 서비스" 그룹 | 6 |
| `app/admin/free/byeoljari/page.tsx` (신규) | 대시보드(패턴 B) | 7 |

**공통 규칙:**
- 테스트 실행: `node --import tsx --test <path>` (package.json 에 test 스크립트 없음).
- 커밋은 각 태스크 끝에 1회.
- BIGINT 는 PostgREST 를 지나며 문자열 → 앱에서 `Number()`.

---

## Task 1: 초대 링크 URL 빌더

**Files:**
- Create: `lib/byeoljari/invite-link.ts`
- Test: `lib/byeoljari/invite-link.test.ts`

**왜:** 복사 버튼이 `window.location.href`(파라미터 없음)를 복사해 방문자 진입 시 utm 이 없어 `user_acquisition` 에 "별자리 유입"이 안 남는다. utm 을 붙인 URL 을 만드는 순수 함수로 분리(테스트 가능).

- [ ] **Step 1: 실패 테스트 작성**

`lib/byeoljari/invite-link.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInviteUrl } from "./invite-link.ts";

test("buildInviteUrl — utm 파라미터를 붙인다", () => {
  const url = buildInviteUrl("https://byeolkongtalk.com", "aB3xK9zQ1p");
  assert.equal(
    url,
    "https://byeolkongtalk.com/fortune/byeoljari/aB3xK9zQ1p?utm_source=byeoljari&utm_medium=invite&utm_content=aB3xK9zQ1p"
  );
});

test("buildInviteUrl — origin 끝 슬래시 중복 없음", () => {
  const url = buildInviteUrl("https://byeolkongtalk.com/", "abc");
  assert.equal(url.startsWith("https://byeolkongtalk.com/fortune/byeoljari/abc?"), true);
  assert.equal(url.includes("//fortune"), false);
});

test("buildInviteUrl — utm_content 는 shareId (맵 귀속)", () => {
  const url = buildInviteUrl("https://x.com", "MAP123");
  assert.match(url, /utm_content=MAP123/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --import tsx --test lib/byeoljari/invite-link.test.ts`
Expected: FAIL — `Cannot find module './invite-link.ts'` 또는 `buildInviteUrl is not a function`.

- [ ] **Step 3: 구현**

`lib/byeoljari/invite-link.ts`:
```ts
// 별자리 초대 링크 빌더 — utm 을 붙여 방문자 가입 시 user_acquisition(utm_source=byeoljari,
// utm_content=shareId)에 "어느 맵이 데려왔나"까지 first-class 로 남게 한다.
// AuthBootstrap → user_acquisition 파이프(components/auth/AuthBootstrap.tsx)에 그대로 올라탄다.

export function buildInviteUrl(origin: string, shareId: string): string {
  const base = origin.replace(/\/+$/, "");
  const params = new URLSearchParams({
    utm_source: "byeoljari",
    utm_medium: "invite",
    utm_content: shareId,
  });
  return `${base}/fortune/byeoljari/${shareId}?${params.toString()}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/byeoljari/invite-link.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/byeoljari/invite-link.ts lib/byeoljari/invite-link.test.ts
git commit -m "feat(byeoljari): 초대 링크 utm 빌더"
```

---

## Task 2: 초대 링크 utm + 클릭 계측 배선

**Files:**
- Modify: `lib/analytics/ui-events.ts` (allowlist)
- Modify: `app/fortune/byeoljari/[shareId]/page.tsx` (복사 버튼)

**왜:** Task 1 빌더를 실제 복사 버튼에 연결하고, 초대 발신 횟수(K-factor 분모)를 `ui_events` 로 계측한다.

- [ ] **Step 1: allowlist 에 이벤트 추가**

`lib/analytics/ui-events.ts` 의 `UI_EVENTS` 배열(현재 마지막 항목 `"banner_clicked"` 뒤)에 추가:
```ts
  /** 홈 히어로 캐러셀 배너 클릭 — meta.slot 에 카드 id(intro|charge|gonghap|sim|survey|pass) */
  "banner_clicked",
  /** 별자리 초대 링크 복사(초대 발신) — meta.shareId */
  "byeoljari_invite_clicked",
] as const;
```
(테이블의 `event` 는 자유 문자열이라 마이그레이션 불필요 — 파일 주석대로 여기만 늘린다.)

- [ ] **Step 2: 복사 버튼을 utm 링크 + 계측으로 교체**

`app/fortune/byeoljari/[shareId]/page.tsx`:

import 2줄 추가(파일 상단 import 블록, `RELATION_TYPE_LABEL` import 아래):
```ts
import { buildInviteUrl } from "@/lib/byeoljari/invite-link";
import { trackUiEvent } from "@/lib/analytics/ui-events";
```

복사 버튼 `onClick`(현재 `await navigator.clipboard.writeText(window.location.href);` 한 줄)을 교체:
```tsx
              onClick={async () => {
                try {
                  const url = buildInviteUrl(window.location.origin, shareId);
                  await navigator.clipboard.writeText(url);
                  trackUiEvent("byeoljari_invite_clicked", { meta: { shareId } });
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard 권한 실패 시 무시 — 사용자가 주소창에서 직접 복사 */
                }
              }}
```
(계측은 복사 성공 뒤에 둔다 — 복사가 실패하면 초대 발신도 아니다. `trackUiEvent` 는 절대 throw 하지 않으므로 catch 를 오염시키지 않는다.)

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add lib/analytics/ui-events.ts "app/fortune/byeoljari/[shareId]/page.tsx"
git commit -m "feat(byeoljari): 초대 링크 utm 부착 + 초대클릭 계측"
```

---

## Task 3: shareId path 정규화

**Files:**
- Modify: `lib/analytics/pageview.ts` (`normalizePath`)
- Modify: `lib/analytics/pageview.test.ts`

**왜:** shareId 는 base62 10자라 기존 UUID/6자리숫자 규칙에 안 걸려 초대 링크마다 고유 path 가 `page_views` 에 쌓이고 `/admin/traffic` 라우트 표를 오염시킨다(ui_events 마이그레이션이 경고한 패턴). `:shareId` 로 접는다. 개별 맵 귀속은 utm_content 로 하므로 손실 없음.

- [ ] **Step 1: 실패 테스트 작성**

`lib/analytics/pageview.test.ts` 끝(마지막 test 뒤)에 추가:
```ts
test("normalizePath — byeoljari 공유 랜딩은 :shareId 로 접힌다", () => {
  assert.equal(normalizePath("/fortune/byeoljari/aB3xK9zQ1p"), "/fortune/byeoljari/:shareId");
  assert.equal(normalizePath("/fortune/byeoljari/MAP123?x=1"), "/fortune/byeoljari/:shareId");
});

test("normalizePath — byeoljari 만들기 경로는 그대로", () => {
  assert.equal(normalizePath("/fortune/byeoljari"), "/fortune/byeoljari");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --import tsx --test lib/analytics/pageview.test.ts`
Expected: FAIL — 첫 케이스가 `/fortune/byeoljari/aB3xK9zQ1p`(원문) 을 반환해 `:shareId` 와 불일치.

- [ ] **Step 3: 구현**

`lib/analytics/pageview.ts` 의 `normalizePath` 를 교체(byeoljari 전용 규칙을 일반 fold 앞에 둔다):
```ts
/** 라우트 단위 집계를 위해 동적 세그먼트를 :id 로 접는다. 실패 시 null. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  const clean = raw.split("?")[0].split("#")[0];
  const segs = clean.split("/");
  // byeoljari 공유 랜딩 /fortune/byeoljari/{shareId} → :shareId.
  // shareId 는 base62 10자라 아래 UUID/숫자 규칙에 안 걸린다(전용 규칙 필요).
  // 개별 맵 귀속은 user_acquisition.utm_content 가 담당 — page_views 는 라우트 트래픽용.
  if (segs[1] === "fortune" && segs[2] === "byeoljari" && segs[3]) {
    segs[3] = ":shareId";
  }
  const folded = segs
    .map((s) => (UUIDISH.test(s) || /^\d{6,}$/.test(s) ? ":id" : s))
    .join("/");
  return (folded || "/").slice(0, 200);
}
```

- [ ] **Step 4: 테스트 통과 확인 (기존 회귀 포함)**

Run: `node --import tsx --test lib/analytics/pageview.test.ts`
Expected: PASS (기존 + 신규 전부).

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/pageview.ts lib/analytics/pageview.test.ts
git commit -m "feat(byeoljari): 공유 랜딩 path :shareId 정규화"
```

---

## Task 4: 라우트 라벨

**Files:**
- Modify: `lib/analytics/route-labels.ts`
- Modify: `lib/analytics/route-labels.test.ts`

**왜:** 정규화된 `/fortune/byeoljari`·`/fortune/byeoljari/:shareId` 가 트래픽 화면에서 raw path 로 보이지 않게 사람이 읽는 라벨을 붙인다. `FORTUNE_CONFIG` 에 없는 라우트(별도 카드)라 `ROUTE_LABEL` 에 직접 넣는다.

- [ ] **Step 1: 실패 테스트 작성**

`lib/analytics/route-labels.test.ts` 끝에 추가:
```ts
test("byeoljari 라우트에 라벨이 붙는다", () => {
  assert.match(routeLabel("/fortune/byeoljari"), /별자리/);
  assert.match(routeLabel("/fortune/byeoljari/:shareId"), /별자리/);
  assert.notEqual(routeLabel("/fortune/byeoljari"), "/fortune/byeoljari");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --import tsx --test lib/analytics/route-labels.test.ts`
Expected: FAIL — path 가 그대로 떨어져 `notEqual` 실패.

- [ ] **Step 3: 구현**

`lib/analytics/route-labels.ts` 의 `ROUTE_LABEL` 객체에서 `"/fortune/result"` 줄 아래에 2줄 추가:
```ts
  "/fortune": "별콩 운세 — 진열대",
  "/fortune/result": "별콩 운세 — 리포트 결과",
  "/fortune/byeoljari": "별 인연 별자리 — 만들기",
  "/fortune/byeoljari/:shareId": "별 인연 별자리 — 초대 조회",
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/analytics/route-labels.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/route-labels.ts lib/analytics/route-labels.test.ts
git commit -m "feat(byeoljari): 트래픽 라우트 라벨"
```

---

## Task 5: 집계 RPC 마이그레이션

**Files:**
- Create: `supabase/migrations/20260823000000_admin_byeoljari_aggregates.sql`

**왜:** 대시보드가 소비할 3 RPC — `admin_byeoljari_summary`(전체 스칼라), `admin_byeoljari_trend`(일별), `admin_byeoljari_member_dist`(멤버 분포·백분위). 전부 KST 자정 · SECURITY DEFINER · REVOKE 3종.

**스키마 참조(확인됨):**
- `star_maps(id, share_id, owner_user_id NULLABLE, creator_anon_id NOT NULL, created_at)`
- `star_map_members(id, map_id, birth_date, relation_type, member_anon_id TEXT NULLABLE, is_host, name_public, created_at)`
- `page_views(anon_id TEXT, user_id UUID NULLABLE, path, is_bot, created_at)`
- `ui_events(anon_id TEXT, user_id UUID NULLABLE, event TEXT, created_at)`
- `user_acquisition(user_id PK, utm_source, utm_content, created_at)`
- `payments(user_id NOT NULL, amount_won INT, status, created_at)`
- `users(id, created_at)`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260823000000_admin_byeoljari_aggregates.sql`:
```sql
-- 별자리(무료 서비스) 어드민 집계 RPC (2026-08-23)
-- 퍼널: 생성 → 초대 → 가입 → 결제. 어트리뷰션 = B.하이브리드
--   · 링크 유입: user_acquisition.utm_source='byeoljari'
--   · 참여자:    star_map_members.member_anon_id ↔ page_views(anon+user 브리지)
--
-- 어드민 제외(p_exclude):
--   page_views/ui_events: (user_id IS NULL OR user_id <> ALL(p_exclude)) + is_bot=false(pv)
--   user_acquisition/payments/users: user_id/id <> ALL(p_exclude)
--   star_maps: (owner_user_id IS NULL OR owner_user_id <> ALL(p_exclude))
--     — 익명 생성 맵(owner NULL)은 어드민 여부를 못 가린다(구조적 한계, 화면 주석).
-- ⚠️ 대리입력 오염: 비호스트 멤버라도 member_anon_id = 그 맵의 creator_anon_id 면
--    creator 가 대신 입력/자기 링크로 join 한 것 → "외부 참여자" 아님 → 브리지에서 제외.
-- ⚠️ 참여자 브리지는 같은 브라우저 로그인만 이어진다(다른 기기 끊김) → 지표는 하한.
-- ⚠️ 날짜식 (created_at AT TIME ZONE 'UTC' + interval '9 hours')::date — 'UTC' 를 빼면
--    캐스트가 세션 TimeZone 에 좌우된다(lib/admin-time.ts kstDate 와 등가).
-- ⚠️ 본문 컬럼 별칭 수식 — RETURNS TABLE OUT 파라미터가 본문 스코프에 겹친다.

-- ── 1. 전체 요약 (스칼라 1행) ──
CREATE OR REPLACE FUNCTION admin_byeoljari_summary(p_exclude UUID[])
RETURNS TABLE (
  total_maps BIGINT, maps_login BIGINT, maps_anon BIGINT,
  entry_uv BIGINT, landing_uv BIGINT,
  total_members BIGINT, name_public_members BIGINT, invite_clicks BIGINT,
  signups_utm BIGINT, member_signups BIGINT, cohort_size BIGINT,
  cohort_payers BIGINT, cohort_revenue BIGINT,
  total_users BIGINT, total_payers BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member_anons AS (
    SELECT DISTINCT m.member_anon_id AS anon_id
    FROM star_map_members m
    JOIN star_maps sm ON sm.id = m.map_id
    WHERE m.is_host = false
      AND m.member_anon_id IS NOT NULL
      AND m.member_anon_id <> sm.creator_anon_id
  ), member_users AS (
    SELECT DISTINCT pv.user_id AS user_id
    FROM page_views pv
    JOIN member_anons ma ON ma.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL
      AND pv.user_id <> ALL(p_exclude)
  ), utm_users AS (
    SELECT DISTINCT ua.user_id AS user_id
    FROM user_acquisition ua
    WHERE ua.utm_source = 'byeoljari'
      AND ua.user_id <> ALL(p_exclude)
  ), cohort AS (
    SELECT user_id FROM member_users
    UNION
    SELECT user_id FROM utm_users
  ), cohort_pay AS (
    SELECT p.user_id AS user_id, p.amount_won AS amount_won
    FROM payments p
    JOIN cohort c ON c.user_id = p.user_id
    WHERE p.status = 'completed'
  )
  SELECT
    (SELECT count(*) FROM star_maps sm
       WHERE sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude))::BIGINT,
    (SELECT count(*) FROM star_maps sm WHERE sm.owner_user_id IS NOT NULL
       AND sm.owner_user_id <> ALL(p_exclude))::BIGINT,
    (SELECT count(*) FROM star_maps sm WHERE sm.owner_user_id IS NULL)::BIGINT,
    (SELECT count(DISTINCT pv.anon_id) FROM page_views pv
       WHERE pv.path = '/fortune/byeoljari' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT pv.anon_id) FROM page_views pv
       WHERE pv.path = '/fortune/byeoljari/:shareId' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM star_map_members m WHERE m.is_host = false)::BIGINT,
    (SELECT count(*) FROM star_map_members m WHERE m.is_host = false AND m.name_public)::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'byeoljari_invite_clicked'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM utm_users)::BIGINT,
    (SELECT count(*) FROM member_users)::BIGINT,
    (SELECT count(*) FROM cohort)::BIGINT,
    (SELECT count(DISTINCT cp.user_id) FROM cohort_pay cp)::BIGINT,
    (SELECT coalesce(sum(cp.amount_won), 0) FROM cohort_pay cp)::BIGINT,
    (SELECT count(*) FROM users u WHERE u.id <> ALL(p_exclude))::BIGINT,
    (SELECT count(DISTINCT p.user_id) FROM payments p
       WHERE p.status = 'completed' AND p.user_id <> ALL(p_exclude))::BIGINT;
$$;

-- ── 2. 일별 추세 (bucket, kind, cnt) — relationship_dist 의 long 포맷 관행 ──
-- 앱에서 bucket×kind 로 피벗. cohort_revenue 의 cnt 는 원화 합(kind 로 구분되니 무해).
CREATE OR REPLACE FUNCTION admin_byeoljari_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, kind TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member_anons AS (
    SELECT DISTINCT m.member_anon_id AS anon_id
    FROM star_map_members m
    JOIN star_maps sm ON sm.id = m.map_id
    WHERE m.is_host = false AND m.member_anon_id IS NOT NULL
      AND m.member_anon_id <> sm.creator_anon_id
  ), member_users AS (
    SELECT DISTINCT pv.user_id AS user_id
    FROM page_views pv JOIN member_anons ma ON ma.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL AND pv.user_id <> ALL(p_exclude)
  ), utm_users AS (
    SELECT DISTINCT ua.user_id AS user_id
    FROM user_acquisition ua
    WHERE ua.utm_source = 'byeoljari' AND ua.user_id <> ALL(p_exclude)
  ), cohort AS (
    SELECT user_id FROM member_users UNION SELECT user_id FROM utm_users
  )
  SELECT (sm.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'maps_created', count(*)
    FROM star_maps sm
    WHERE sm.created_at >= p_since
      AND (sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'entry_uv', count(DISTINCT pv.anon_id)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/fortune/byeoljari' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'landing_uv', count(DISTINCT pv.anon_id)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/fortune/byeoljari/:shareId' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (m.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'member_joins', count(*)
    FROM star_map_members m
    WHERE m.created_at >= p_since AND m.is_host = false
    GROUP BY 1
  UNION ALL
  SELECT (e.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'invite_clicks', count(*)
    FROM ui_events e
    WHERE e.created_at >= p_since AND e.event = 'byeoljari_invite_clicked'
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (ua.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'signups_utm', count(*)
    FROM user_acquisition ua
    WHERE ua.created_at >= p_since AND ua.utm_source = 'byeoljari'
      AND ua.user_id <> ALL(p_exclude)
    GROUP BY 1
  UNION ALL
  SELECT (p.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'cohort_payments', count(*)
    FROM payments p JOIN cohort c ON c.user_id = p.user_id
    WHERE p.created_at >= p_since AND p.status = 'completed'
    GROUP BY 1
  UNION ALL
  SELECT (p.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'cohort_revenue', coalesce(sum(p.amount_won), 0)
    FROM payments p JOIN cohort c ON c.user_id = p.user_id
    WHERE p.created_at >= p_since AND p.status = 'completed'
    GROUP BY 1
  ORDER BY 1;
$$;

-- ── 3. 지도당 멤버 수 분포 (백분위 + 히스토그램, 스칼라 1행) ──
-- 전체 맵 기준(멤버 0 포함) — "만든 사람마다 초대한 지인 수" 분포. 멤버 = 비호스트.
CREATE OR REPLACE FUNCTION admin_byeoljari_member_dist(p_exclude UUID[])
RETURNS TABLE (
  avg_members NUMERIC, p50 DOUBLE PRECISION, p75 DOUBLE PRECISION, p90 DOUBLE PRECISION,
  max_members BIGINT,
  maps_0 BIGINT, maps_1 BIGINT, maps_2_3 BIGINT, maps_4_6 BIGINT, maps_7_10 BIGINT, maps_11plus BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mc AS (
    SELECT sm.id AS map_id,
           count(m.id) FILTER (WHERE m.is_host = false) AS n
    FROM star_maps sm
    LEFT JOIN star_map_members m ON m.map_id = sm.id
    WHERE sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude)
    GROUP BY sm.id
  )
  SELECT
    coalesce(round(avg(mc.n), 1), 0),
    coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY mc.n), 0),
    coalesce(percentile_cont(0.75) WITHIN GROUP (ORDER BY mc.n), 0),
    coalesce(percentile_cont(0.90) WITHIN GROUP (ORDER BY mc.n), 0),
    coalesce(max(mc.n), 0)::BIGINT,
    count(*) FILTER (WHERE mc.n = 0)::BIGINT,
    count(*) FILTER (WHERE mc.n = 1)::BIGINT,
    count(*) FILTER (WHERE mc.n BETWEEN 2 AND 3)::BIGINT,
    count(*) FILTER (WHERE mc.n BETWEEN 4 AND 6)::BIGINT,
    count(*) FILTER (WHERE mc.n BETWEEN 7 AND 10)::BIGINT,
    count(*) FILTER (WHERE mc.n >= 11)::BIGINT
  FROM mc;
$$;

-- ── 권한: service_role 전용 (AGENTS.md — PUBLIC·anon·authenticated 셋 다 명시 회수 + 시그니처 명시) ──
REVOKE EXECUTE ON FUNCTION admin_byeoljari_summary(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeoljari_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeoljari_member_dist(UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_byeoljari_summary(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeoljari_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeoljari_member_dist(UUID[]) TO service_role;
```

- [ ] **Step 2: 세 함수 본문을 dev 에서 인라인 실행 검증 (적용 전)**

🔴 AGENTS.md 규칙: 마이그레이션의 **모든** 함수 본문을 적용 전 실행해 본다(일부만 검증하면 나머지 오류로 파일 전체가 실패). 각 함수의 `SELECT ...` 본문(`p_exclude` 는 `'{}'::uuid[]`, `p_since` 는 `now() - interval '30 days'` 로 치환)을 dev DB(Supabase dev SQL editor 또는 dev 접속 psql)에서 직접 실행해 구문·컬럼 오류가 없는지 확인.
Expected: 3 본문 모두 에러 없이 행 반환(데이터 없으면 0/NULL→coalesce 로 0).

- [ ] **Step 3: 커밋 + dev push**

```bash
git add supabase/migrations/20260823000000_admin_byeoljari_aggregates.sql
git commit -m "feat(byeoljari): 어드민 집계 RPC 3종(요약·일별·멤버분포)"
git push origin dev
```

- [ ] **Step 4: Supabase dev 자동 적용 + 권한 확인**

dev push 후 Supabase Git 연동이 자동 적용한다(Workflow SUCCESS 확인 습관). 적용 후 dev DB 에서 acl 감사(둘 다 0행이어야 함 = anon/PUBLIC 노출 없음):
```sql
select proname, proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname like 'admin_byeoljari_%'
  and (p.proacl::text ~ '(^\{|,)=X/' or p.proacl::text like '%anon=X%');
```
Expected: 0행 (권한이 `{postgres,service_role}` 만).

---

## Task 6: 어드민 nav "무료 서비스" 그룹

**Files:**
- Modify: `components/admin/AdminNav.tsx`

**왜:** 대시보드로 가는 nav 링크. 그룹만 추가하면 인증(proxy+layout)·모바일 nav 자동 상속.

- [ ] **Step 1: GROUPS 에 그룹 추가**

`components/admin/AdminNav.tsx` 의 `GROUPS` 배열에서 `analytics` 그룹 객체 **뒤**(`ops` 그룹 앞)에 추가:
```ts
  { key: "free", label: "무료 서비스", emoji: "🎁", items: [
    { href: "/admin/free/byeoljari", label: "별 인연 별자리", emoji: "✨" },
  ] },
```
(슬러그 `/admin/free` 는 기존 어느 슬러그의 프리픽스도 아니라 `matches()` 오매칭 없음.)

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add components/admin/AdminNav.tsx
git commit -m "feat(admin): nav 무료 서비스 그룹 + 별자리 링크"
```

---

## Task 7: 어드민 대시보드 페이지

**Files:**
- Create: `app/admin/free/byeoljari/page.tsx`

**왜:** 3 RPC 를 패턴 B 로 호출해 4퍼널을 렌더. `admin/relationship/page.tsx` 의 Stat/LoadFailed/failed-플래그 관행을 따른다.

**의존:** Task 5(RPC 가 dev 에 적용돼 있어야 렌더 검증 가능).

- [ ] **Step 1: 페이지 작성**

`app/admin/free/byeoljari/page.tsx`:
```tsx
// app/admin/free/byeoljari/page.tsx — 별 인연 별자리(무료 서비스) 퍼널 대시보드.
// 생성 → 초대 → 가입 → 결제. 어트리뷰션 = 링크 utm(user_acquisition) + 참여자 anon 브리지(page_views).
// 집계는 전부 RPC(admin_byeoljari_*) — 원본 행을 앱으로 끌어오지 않는다(패턴 B, admin/relationship 관행).
import { getServiceSupabase } from "@/lib/supabase";
import LoadFailed from "@/components/admin/LoadFailed";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso, kstDate } from "@/lib/admin-time";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

// 일별 표에 그릴 kind 순서·라벨(단일 원천).
const TREND_COLS: { kind: string; label: string; won?: boolean }[] = [
  { kind: "maps_created", label: "생성" },
  { kind: "entry_uv", label: "만들기UV" },
  { kind: "landing_uv", label: "조회UV" },
  { kind: "member_joins", label: "참여" },
  { kind: "invite_clicks", label: "초대클릭" },
  { kind: "signups_utm", label: "utm가입" },
  { kind: "cohort_payments", label: "결제" },
  { kind: "cohort_revenue", label: "매출(원)", won: true },
];

async function load() {
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const p_since = daysAgoKstIso(29); // 최근 30일(오늘 포함)
  const today = kstDate(new Date().toISOString());

  const [sumRes, trendRes, distRes] = await Promise.all([
    supa.rpc("admin_byeoljari_summary", { p_exclude }),
    supa.rpc("admin_byeoljari_trend", { p_since, p_exclude }),
    supa.rpc("admin_byeoljari_member_dist", { p_exclude }),
  ]);

  const sumFailed = !!sumRes.error;
  const trendFailed = !!trendRes.error;
  const distFailed = !!distRes.error;

  const su = (
    (sumRes.data ?? []) as {
      total_maps: number; maps_login: number; maps_anon: number;
      entry_uv: number; landing_uv: number;
      total_members: number; name_public_members: number; invite_clicks: number;
      signups_utm: number; member_signups: number; cohort_size: number;
      cohort_payers: number; cohort_revenue: number;
      total_users: number; total_payers: number;
    }[]
  )[0];

  const trendRows = (trendRes.data ?? []) as { bucket: string; kind: string; cnt: number }[];
  const byBucket: Record<string, Record<string, number>> = {};
  for (const r of trendRows) (byBucket[r.bucket] ??= {})[r.kind] = Number(r.cnt);
  const buckets = Object.keys(byBucket).sort().reverse(); // 최신 날짜 위로

  const di = (
    (distRes.data ?? []) as {
      avg_members: number; p50: number; p75: number; p90: number; max_members: number;
      maps_0: number; maps_1: number; maps_2_3: number; maps_4_6: number;
      maps_7_10: number; maps_11plus: number;
    }[]
  )[0];

  return {
    sumFailed, trendFailed, distFailed, today,
    su: {
      totalMaps: Number(su?.total_maps ?? 0),
      mapsLogin: Number(su?.maps_login ?? 0),
      mapsAnon: Number(su?.maps_anon ?? 0),
      entryUv: Number(su?.entry_uv ?? 0),
      landingUv: Number(su?.landing_uv ?? 0),
      totalMembers: Number(su?.total_members ?? 0),
      namePublicMembers: Number(su?.name_public_members ?? 0),
      inviteClicks: Number(su?.invite_clicks ?? 0),
      signupsUtm: Number(su?.signups_utm ?? 0),
      memberSignups: Number(su?.member_signups ?? 0),
      cohortSize: Number(su?.cohort_size ?? 0),
      cohortPayers: Number(su?.cohort_payers ?? 0),
      cohortRevenue: Number(su?.cohort_revenue ?? 0),
      totalUsers: Number(su?.total_users ?? 0),
      totalPayers: Number(su?.total_payers ?? 0),
    },
    dist: {
      avg: Number(di?.avg_members ?? 0),
      p50: Number(di?.p50 ?? 0),
      p75: Number(di?.p75 ?? 0),
      p90: Number(di?.p90 ?? 0),
      max: Number(di?.max_members ?? 0),
      hist: [
        { label: "0명", v: Number(di?.maps_0 ?? 0) },
        { label: "1명", v: Number(di?.maps_1 ?? 0) },
        { label: "2–3명", v: Number(di?.maps_2_3 ?? 0) },
        { label: "4–6명", v: Number(di?.maps_4_6 ?? 0) },
        { label: "7–10명", v: Number(di?.maps_7_10 ?? 0) },
        { label: "11명+", v: Number(di?.maps_11plus ?? 0) },
      ],
    },
    buckets,
    byBucket,
  };
}

export default async function AdminByeoljariPage() {
  const s = await load();
  const su = s.su;
  const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);
  const entryToCreate = pct(su.totalMaps, su.entryUv);
  const optInRate = pct(su.namePublicMembers, su.totalMembers);
  const cohortPayRate = pct(su.cohortPayers, su.cohortSize);
  const totalPayRate = pct(su.totalPayers, su.totalUsers);
  const kFactor = su.totalMaps ? Math.round((su.signupsUtm / su.totalMaps) * 100) / 100 : 0;
  const cohortArpu = su.cohortSize ? Math.round(su.cohortRevenue / su.cohortSize) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">별 인연 별자리 <span className="text-white/40 text-sm">(무료 서비스)</span></h1>
        <p className="text-[13px] text-white/50 mt-1">생성 → 초대 → 가입 → 결제 퍼널. 미래분 지표(utm·K-factor)는 배포 후 유입이 쌓여야 값이 남.</p>
      </div>

      <section>
        <h2 className="text-sm text-white/60 mb-3">① 생성</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="총 별자리" value={s.sumFailed ? "—" : su.totalMaps} sub={s.sumFailed ? undefined : `로그인 ${su.mapsLogin} · 익명 ${su.mapsAnon}`} />
          <Stat label="만들기 진입 UV" value={s.sumFailed ? "—" : su.entryUv} />
          <Stat label="진입→생성 전환" value={s.sumFailed ? "—" : `${entryToCreate}%`} />
          <Stat label="별자리 경유 가입(utm)" value={s.sumFailed ? "—" : su.signupsUtm} sub="미래분" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">② 초대 / 바이럴</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="랜딩 조회 UV" value={s.sumFailed ? "—" : su.landingUv} />
          <Stat label="총 참여(멤버)" value={s.sumFailed ? "—" : su.totalMembers} />
          <Stat label="이름공개 옵트인율" value={s.sumFailed ? "—" : `${optInRate}%`} sub={s.sumFailed ? undefined : `${su.namePublicMembers}/${su.totalMembers}`} />
          <Stat label="초대클릭(발신)" value={s.sumFailed ? "—" : su.inviteClicks} />
          <Stat label="K-factor" value={s.sumFailed ? "—" : kFactor} sub="맵당 utm 가입 · 미래분" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">지도당 멤버 수 분포</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="평균" value={s.distFailed ? "—" : s.dist.avg} />
          <Stat label="중앙(P50)" value={s.distFailed ? "—" : s.dist.p50} />
          <Stat label="상위25%(P75)" value={s.distFailed ? "—" : s.dist.p75} />
          <Stat label="상위10%(P90)" value={s.distFailed ? "—" : s.dist.p90} />
          <Stat label="최대" value={s.distFailed ? "—" : s.dist.max} />
        </div>
        {s.distFailed ? (
          <LoadFailed block="admin_byeoljari_member_dist" className="mt-2" />
        ) : (
          <div className="mt-2 text-[12px] text-white/40">
            {s.dist.hist.map((h) => `${h.label} ${h.v}`).join(" · ")}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">③ 가입 <span className="text-white/35">(참여자 브리지는 같은 기기 로그인만 = 하한)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="참여자→가입" value={s.sumFailed ? "—" : su.memberSignups} sub="member_anon 브리지" />
          <Stat label="별자리 경유 가입(utm)" value={s.sumFailed ? "—" : su.signupsUtm} sub="미래분" />
          <Stat label="코호트 규모" value={s.sumFailed ? "—" : su.cohortSize} sub="utm ∪ 참여자" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">④ 결제</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="코호트 결제자" value={s.sumFailed ? "—" : su.cohortPayers} sub={s.sumFailed ? undefined : `${su.cohortSize}명 중`} />
          <Stat label="코호트 결제율" value={s.sumFailed ? "—" : `${cohortPayRate}%`} sub={s.sumFailed ? undefined : `전체 ${totalPayRate}%`} />
          <Stat label="코호트 매출(원)" value={s.sumFailed ? "—" : su.cohortRevenue.toLocaleString()} />
          <Stat label="코호트 ARPU(원)" value={s.sumFailed ? "—" : cohortArpu.toLocaleString()} sub="매출/코호트" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">일별 추세 <span className="text-white/35">(최근 30일 · KST)</span></h2>
        {s.trendFailed ? (
          <LoadFailed block="admin_byeoljari_trend" />
        ) : s.buckets.length === 0 ? (
          <div className="text-[12px] text-white/40">데이터 없음</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-white/40 text-left">
                  <th className="py-1 pr-3">날짜</th>
                  {TREND_COLS.map((c) => (
                    <th key={c.kind} className="py-1 px-2 text-right">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.buckets.map((b) => (
                  <tr key={b} className={`border-t border-white/5 ${b === s.today ? "text-gold" : "text-white/70"}`}>
                    <td className="py-1 pr-3">{b.slice(5)}{b === s.today ? " (오늘)" : ""}</td>
                    {TREND_COLS.map((c) => {
                      const v = s.byBucket[b]?.[c.kind] ?? 0;
                      return (
                        <td key={c.kind} className="py-1 px-2 text-right">
                          {c.won ? v.toLocaleString() : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 0.

Run: `npm run build`
Expected: exit 0, 라우트 표에 `/admin/free/byeoljari` 등장.

- [ ] **Step 3: dev 어드민 육안 검증**

로컬 dev 서버(임시 ADMIN_USER_IDS + HMAC 쿠키 주입, `admin-local-verify-trick` 메모리) 또는 사용자가 dev.byeolkongtalk.com 어드민에서 `/admin/free/byeoljari` 진입:
- nav "무료 서비스 🎁 > 별 인연 별자리 ✨" 노출·클릭 이동
- 4퍼널 섹션 + 멤버 분포(P50/P75/P90) + 일별 표 렌더, 콘솔 에러 0
- RPC 실패 시 `—` + LoadFailed (0 위장 없음)
(dev 테스트 맵 데이터가 있어 숫자가 일부 뜬다. utm/K-factor 는 배포 후라 0 이 정상.)

- [ ] **Step 4: 커밋**

```bash
git add "app/admin/free/byeoljari/page.tsx"
git commit -m "feat(admin): 별 인연 별자리 퍼널 대시보드"
```

---

## Self-Review (플랜 작성자가 실행)

**스펙 커버리지:**
- §2 요구 1(무료 서비스 섹션) → Task 6 ✅
- §2 요구 2(생성자·초대 지인 수) → Task 5 summary + member_dist, Task 7 렌더 ✅
- §2 요구 3(가입 추적) → Task 1·2(utm) + Task 5 브리지 ✅
- §2 요구 4(결제 추적) → Task 5 cohort_payers/revenue ✅
- §4a 링크 utm → Task 1·2 ✅ / §4b path 정규화 → Task 3 ✅ / §4c 초대클릭 계측 → Task 2 ✅ / 라벨 보강 → Task 4 ✅
- §5 지표 일별/전체 → summary(전체)+trend(일별) ✅ / 멤버 백분위 P75·P90 → member_dist ✅
- §6 RPC 패턴 B·REVOKE 3종·KST → Task 5 ✅
- §8 비목표(member user_id 컬럼·기여마진·claim 정밀) → 플랜에 없음(의도적 제외) ✅

**함정 반영:** 대리입력 제외(`member_anon_id <> creator_anon_id`) Task 5 ✅ / 다른기기 하한 주석 Task 7 ✅ / 미래분 0 주석 Task 7 ✅.

**타입 일관성:** RPC 컬럼명 ↔ page.tsx 캐스트 타입 ↔ 렌더 접근자 대조 완료(total_maps·cohort_revenue 등 snake_case 일치, BIGINT→Number).

**Placeholder scan:** 없음(모든 스텝에 실제 코드/명령/예상결과).
