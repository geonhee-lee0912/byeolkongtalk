# 어드민 개편 구현 플랜 — 별 소모 분석 + 연애 상담 지표 + 메뉴 위계

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans로 task별 실행. 스텝은 `- [ ]` 체크박스.

**Goal:** `star_transactions`를 종목·상품으로 분류하는 엔진을 만들어 대시보드 요약·애널리틱스·신규 연애상담 메뉴에 별 소모/연애상담 지표를 붙이고, 어드민 nav를 접이식 그룹으로 재편한다.

**Architecture:** 순수 집계 함수(`lib/analytics/aggregate.ts`, node:test) + 서버 컴포넌트 조회(기존 대시보드/페이월 패턴). 접이식 nav만 client 컴포넌트. **마이그레이션 없음.**

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트 직접 조회), Supabase service role, node:test.

**Spec:** `docs/superpowers/specs/2026-07-20-admin-star-analytics-relationship-design.md`

**배포:** dev 개발 → prod. 3e 편입 vs 별도는 사용자 결정.

---

## 핵심 데이터 참조 (조사 결과)

- `star_transactions`: `user_id, type('spend'|'charge'|...), amount(양수), source(VARCHAR50), reading_id(nullable FK), created_at`. INSERT는 RPC 3개.
- `readings`: `consultation_type('saju'|'tarot'|'relationship')`, `emotion_tag`, `relationship_id`, `skill_key`, `saju_product`, `stars_spent`, `result_viewed_at`, `created_at`.
- `relationships`: user당 1, `label, status('crush'|'dating'|'breakup'|'onesided'), thread_reading_id, last_visited_at, memo(jsonb), created_at`.
- `relationship_passes`: `kind('day1'|'day3'|'day7')`=종류, `stars_spent`, `started_at`, `expires_at`=활성판정(`> now()`).
- `messages`: `reading_id, role('user'|'assistant'), content, created_at`.
- 상수: `PASS_PLANS`(day1=1일/20별, day3=3일/40별, day7=7일/60별), `RELATIONSHIP_SKILLS`(checkin/deep_feelings/compat/verdict), `fortuneTypeFromTag` (`lib/fortune/types.ts`).
- source→상품(§2 spec): `saju_reading·tarot_reading·clarifier·extend·fortune_<type>·rel_skill_verdict·rel_extend·relationship_pass·pg·welcome_bonus·first_charge_bonus·admin_adjust`.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/analytics/aggregate.ts` | 순수 집계 | ReadingRow 타입 확장 + `buildStarSpendBreakdown` 신설 |
| `lib/analytics/aggregate.test.ts` | 유닛 | 분류 함정 케이스 |
| `app/api/admin/analytics/products/route.ts` | 상품 조회 | star_transactions+readings 조인 |
| `app/admin/page.tsx` | 대시보드 | 별 소모 매출 + 연애상담 KPI |
| `app/admin/analytics/page.tsx` | 애널리틱스 | 별 소모 상품 표 |
| `components/admin/AdminNav.tsx` | nav (신규, client) | 접이식 그룹 |
| `app/admin/layout.tsx` | 레이아웃 | AdminNav로 교체 + 뱃지 전달 |
| `app/admin/relationship/page.tsx` | 신규 화면 | 연애상담 지표 + 대화 흐름 |

---

## Task 1: 별 소모 분류 엔진 (A)

**Files:**
- Modify: `lib/analytics/aggregate.ts`
- Test: `lib/analytics/aggregate.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`lib/analytics/aggregate.test.ts` 에 추가:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStarSpendBreakdown, type StarTxRow, type ReadingInfo } from "./aggregate";

test("buildStarSpendBreakdown: 분류 규칙", () => {
  const reads = new Map<string, ReadingInfo>([
    ["r1", { consultation_type: "saju", emotion_tag: "재회할 수 있을까", relationship_id: null, skill_key: null }],
    ["r2", { consultation_type: "tarot", emotion_tag: null, relationship_id: "rel1", skill_key: "checkin" }], // 연애상담 타로 스킬
    ["r3", { consultation_type: "saju", emotion_tag: "fortune:compat", relationship_id: null, skill_key: null }], // 운세 리포트
  ]);
  const tx: StarTxRow[] = [
    { user_id: "u1", type: "spend", amount: 22, source: "saju_reading", reading_id: "r1", created_at: "" },
    { user_id: "u1", type: "spend", amount: 45, source: "tarot_reading", reading_id: "r2", created_at: "" }, // → relationship
    { user_id: "u2", type: "spend", amount: 40, source: "fortune_compat", reading_id: "r3", created_at: "" }, // → fortune
    { user_id: "u2", type: "spend", amount: 40, source: "fortune_good_days", reading_id: null, created_at: "" }, // reading_id null → source
    { user_id: "u3", type: "spend", amount: 20, source: "relationship_pass", reading_id: null, created_at: "" }, // → relationship
    { user_id: "u3", type: "spend", amount: 30, source: "rel_skill_verdict", reading_id: null, created_at: "" }, // → relationship
    { user_id: "u1", type: "spend", amount: 5, source: "clarifier", reading_id: "r1", created_at: "" }, // → upsell
    { user_id: "u9", type: "charge", amount: 100, source: "pg", reading_id: null, created_at: "" }, // 제외(charge)
    { user_id: "u9", type: "spend", amount: 999, source: "admin_adjust", reading_id: null, created_at: "" }, // 제외(비상품)
  ];
  const out = buildStarSpendBreakdown(tx, reads);
  const byDomain = (d: string) => out.filter((g) => g.domain === d);
  assert.equal(byDomain("saju").length, 1);          // r1 saju 상담
  assert.equal(byDomain("relationship").reduce((s, g) => s + g.count, 0), 3); // 스킬 checkin + 패스 + verdict
  assert.equal(byDomain("fortune").reduce((s, g) => s + g.count, 0), 2);      // compat(조인) + good_days(source)
  assert.equal(byDomain("upsell").length, 1);        // clarifier
  assert.ok(!out.some((g) => g.product === "pg" || g.product === "admin_adjust")); // 비상품 제외
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: FAIL (`buildStarSpendBreakdown` is not exported)

- [ ] **Step 3: 타입 확장 + 함수 구현**

`lib/analytics/aggregate.ts` 상단 `ReadingRow` 타입의 `consultation_type` 을 확장:

```ts
export type ReadingRow = {
  user_id: string;
  consultation_type: "saju" | "tarot" | "relationship";
  emotion_tag: string | null;
  saju_product: string | null;
  stars_spent: number | null;
  created_at: string;
};
```

파일 하단에 추가:

```ts
export type StarTxRow = {
  user_id: string;
  type: string;
  amount: number;
  source: string;
  reading_id: string | null;
  created_at: string;
};

export type ReadingInfo = {
  consultation_type: "saju" | "tarot" | "relationship";
  emotion_tag: string | null;
  relationship_id: string | null;
  skill_key: string | null;
};

export type StarSpendDomain = "saju" | "tarot" | "fortune" | "relationship" | "upsell";
export type StarSpendGroup = {
  domain: StarSpendDomain;
  product: string;
  count: number;
  stars: number;
  users: number;
};

// 충전·보너스·환불·수동조정 = 상품 아님(별 소모 상품 분석에서 제외)
const NON_PRODUCT_SOURCES = new Set(["pg", "welcome_bonus", "first_charge_bonus", "admin_adjust"]);

/**
 * star_transactions 를 (종목, 상품)으로 분류. spec §3 규칙:
 * reading_id 조인 우선(연애상담=relationship_id/skill_key → 운세=fortune tag → 대화상담) →
 * reading 없으면 source 파싱(fortune_* / rel_* / clarifier·extend) → 비상품 제외.
 */
export function buildStarSpendBreakdown(
  starTx: StarTxRow[],
  readingsById: Map<string, ReadingInfo>
): StarSpendGroup[] {
  const groups = new Map<string, { domain: StarSpendDomain; product: string; count: number; stars: number; users: Set<string> }>();
  const add = (domain: StarSpendDomain, product: string, tx: StarTxRow) => {
    const key = `${domain}|${product}`;
    const g = groups.get(key) ?? { domain, product, count: 0, stars: 0, users: new Set<string>() };
    g.count += 1;
    g.stars += tx.amount;
    g.users.add(tx.user_id);
    groups.set(key, g);
  };

  for (const tx of starTx) {
    if (tx.type !== "spend") continue;
    const src = tx.source;
    if (NON_PRODUCT_SOURCES.has(src) || src.startsWith("fortune_refund")) continue;

    const r = tx.reading_id ? readingsById.get(tx.reading_id) : undefined;
    if (r) {
      if (r.relationship_id || r.skill_key) {
        add("relationship", r.skill_key ? `스킬:${r.skill_key}` : "스레드 대화", tx);
      } else {
        const ft = fortuneTypeFromTag(r.emotion_tag);
        if (ft) add("fortune", ft, tx);
        else if (r.consultation_type === "saju" || r.consultation_type === "tarot")
          add(r.consultation_type, r.emotion_tag ?? "(없음)", tx);
        else add("relationship", "스레드 대화", tx); // consultation_type='relationship' 인데 태그 없는 경우
      }
      continue;
    }
    // reading_id 없음 → source 기반
    if (src.startsWith("fortune_")) add("fortune", src.slice("fortune_".length), tx);
    else if (src === "relationship_pass") add("relationship", "패스", tx);
    else if (src === "rel_extend") add("relationship", "스레드 연장", tx);
    else if (src === "rel_skill_verdict") add("relationship", "스킬:verdict", tx);
    else if (src === "clarifier" || src === "extend") add("upsell", src, tx);
    else add("upsell", src, tx); // reading(레거시) 등 미상
  }

  return [...groups.values()]
    .map((g) => ({ domain: g.domain, product: g.product, count: g.count, stars: g.stars, users: g.users.size }))
    .sort((a, b) => b.stars - a.stars);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts
git commit -m "feat(admin): star_transactions 별 소모 분류 엔진 buildStarSpendBreakdown"
```

---

## Task 2: products route 조인 + 애널리틱스 별 소모 표 (C)

**Files:**
- Modify: `app/api/admin/analytics/products/route.ts`
- Modify: `app/admin/analytics/page.tsx`

- [ ] **Step 1: products route에 star_transactions + readings 조인 조회 추가**

`app/api/admin/analytics/products/route.ts` 의 조회에 추가 (기존 readings·payments 병렬 뒤):

```ts
import { buildStarSpendBreakdown, type StarTxRow, type ReadingInfo } from "@/lib/analytics/aggregate";
// ...기존 readings/payments 조회 후:
let txQ = supa
  .from("star_transactions")
  .select("user_id, type, amount, source, reading_id, created_at")
  .eq("type", "spend")
  .gte("created_at", since)
  .limit(100000);
if (excl) txQ = txQ.not("user_id", "in", excl);
const { data: tx } = await txQ;

// tx 의 reading_id 들 → readings 정보 조회
const rids = [...new Set((tx ?? []).map((t) => t.reading_id).filter(Boolean))] as string[];
const readingsById = new Map<string, ReadingInfo>();
if (rids.length) {
  // in() 은 대량이면 청크 — 현 규모 단일 호출 OK
  const { data: rinfo } = await supa
    .from("readings")
    .select("id, consultation_type, emotion_tag, relationship_id, skill_key")
    .in("id", rids);
  for (const r of rinfo ?? [])
    readingsById.set(r.id, { consultation_type: r.consultation_type, emotion_tag: r.emotion_tag, relationship_id: r.relationship_id, skill_key: r.skill_key });
}
const starSpend = buildStarSpendBreakdown((tx ?? []) as StarTxRow[], readingsById);
```

응답에 `starSpend` 추가: `return NextResponse.json({ days, ...buildProductBreakdown(...), starSpend });`

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: EXIT 0

- [ ] **Step 3: 애널리틱스 화면에 별 소모 상품 섹션 추가**

`app/admin/analytics/page.tsx` products 섹션 아래에 추가. 기존 `ProductTable` 패턴 재사용 + 종목별 그룹핑. `products.starSpend` (StarSpendGroup[]) 를 domain별로 묶어 표시:

```tsx
{/* 별 소모 상품 (종목별) */}
<section>
  <h2 className="text-sm text-white/60 mb-3">별 소모 상품 <span className="text-white/40">(종목→상품 · 건수/별/유니크)</span></h2>
  <div className="grid md:grid-cols-2 gap-6">
    {(["saju","tarot","fortune","relationship","upsell"] as const).map((dom) => {
      const rows = (products?.starSpend ?? []).filter((g: {domain:string}) => g.domain === dom);
      if (!rows.length) return null;
      const LABEL: Record<string,string> = { saju:"사주 대화", tarot:"타로 대화", fortune:"운세 리포트", relationship:"연애 상담", upsell:"인챗 업셀" };
      return (
        <div key={dom}>
          <h3 className="text-sm text-white/70 mb-2">{LABEL[dom]}</h3>
          <table className="w-full text-[12px]">
            <thead className="text-white/40 text-left"><tr><th className="py-1">상품</th><th>건수</th><th>별</th><th>유니크</th></tr></thead>
            <tbody>
              {rows.map((g: {product:string;count:number;stars:number;users:number}) => (
                <tr key={g.product} className="border-t border-white/10">
                  <td className="py-1">{g.product}</td><td>{g.count}</td><td>{g.stars.toLocaleString()}</td><td>{g.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    })}
  </div>
</section>
```

- [ ] **Step 4: 빌드 + 브라우저 확인 → 커밋**

Run: `npm run build` (EXIT 0). dev 서버에서 `/admin/analytics` 에 별 소모 상품 섹션이 종목별로 뜨는지.

```bash
git add app/api/admin/analytics/products/route.ts app/admin/analytics/page.tsx
git commit -m "feat(admin): 애널리틱스에 별 소모 상품 분석(종목별) 추가"
```

---

## Task 3: 대시보드 요약 KPI (B)

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: loadStats 확장 — 별 소모 매출(종목별) + 연애상담 KPI**

`app/admin/page.tsx` 의 `loadStats()` 에 병렬 조회 추가:

```ts
// 별 소모(기간 무관 누적 or week 기준 — 여기선 week) : buildStarSpendBreakdown 재사용
import { buildStarSpendBreakdown, type StarTxRow, type ReadingInfo } from "@/lib/analytics/aggregate";
// week 기준 spend tx + readings 조인 (Task 2 route 로직과 동일 패턴)
// 연애상담 KPI:
//  - 활성 패스: relationship_passes where expires_at > now (excl 제외 join user)
//  - 기간 패스 구매: star_transactions source='relationship_pass' since week
//  - 스킬 호출: star_transactions source in ('rel_skill_verdict') + readings.skill_key not null since week
```

구현: week 기간 `star_transactions`(spend) + reading 조인 → `buildStarSpendBreakdown` → domain별 stars 합. 별도로:
```ts
const now = new Date().toISOString();
let passActiveQ = supa.from("relationship_passes").select("user_id", { count: "exact", head: true }).gt("expires_at", now);
if (excl) passActiveQ = passActiveQ.not("user_id", "in", excl);
// 기간 패스 구매 수 = star_transactions source='relationship_pass' since week (count)
// 스킬 호출 수 = readings where skill_key not null and created_at >= week (count)
```

- [ ] **Step 2: 대시보드에 섹션 추가**

기존 `Stat` 컴포넌트 재사용. "별 소모 매출(최근 7일)" 섹션(종목별 별) + "연애 상담" 섹션(활성 패스·기간 패스 구매·스킬 호출):

```tsx
<section>
  <h2 className="text-sm text-white/60 mb-3">별 소모 (최근 7일)</h2>
  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
    <Stat label="사주 대화" value={s.starWeek.saju} />
    <Stat label="타로 대화" value={s.starWeek.tarot} />
    <Stat label="운세 리포트" value={s.starWeek.fortune} />
    <Stat label="연애 상담" value={s.starWeek.relationship} />
    <Stat label="인챗 업셀" value={s.starWeek.upsell} />
  </div>
</section>
<section>
  <h2 className="text-sm text-white/60 mb-3">연애 상담</h2>
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    <Stat label="활성 패스" value={s.rel.activePasses} />
    <Stat label="패스 구매(7일)" value={s.rel.passBuys} />
    <Stat label="스킬 호출(7일)" value={s.rel.skillCalls} />
  </div>
</section>
```

- [ ] **Step 3: 빌드 + 브라우저 → 커밋**

Run: `npm run build` (EXIT 0). `/admin` 대시보드 확인.
```bash
git add app/admin/page.tsx
git commit -m "feat(admin): 대시보드에 별 소모 매출·연애상담 KPI 요약"
```

---

## Task 4: 접이식 메뉴 위계 (E)

**Files:**
- Create: `components/admin/AdminNav.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: AdminNav client 컴포넌트 생성**

`components/admin/AdminNav.tsx` — 홈(대시보드) 단독 + 접이식 그룹 4개. props로 뱃지 맵 받음. `usePathname()` 으로 현재 그룹 초기 펼침. 접힌 그룹 헤더에 소메뉴 뱃지 합계.

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; emoji: string };
type Group = { key: string; label: string; emoji: string; items: Item[] };

const HOME: Item = { href: "/admin", label: "대시보드", emoji: "🏠" };
const GROUPS: Group[] = [
  { key: "analytics", label: "분석·성과", emoji: "📈", items: [
    { href: "/admin/analytics", label: "애널리틱스", emoji: "📊" },
    { href: "/admin/relationship", label: "연애 상담", emoji: "💞" },
    { href: "/admin/paywall", label: "페이월", emoji: "🔒" },
    { href: "/admin/ads", label: "광고 지출", emoji: "📣" },
  ]},
  { key: "ops", label: "운영·고객", emoji: "👥", items: [
    { href: "/admin/users", label: "사용자", emoji: "👤" },
    { href: "/admin/readings", label: "리딩/상담", emoji: "🔮" },
    { href: "/admin/payments", label: "결제/정산", emoji: "💳" },
    { href: "/admin/inquiries", label: "문의/고객센터", emoji: "💬" },
    { href: "/admin/fortune-refunds", label: "운세 환불", emoji: "🎁" },
  ]},
  { key: "monitor", label: "모니터링", emoji: "🚨", items: [
    { href: "/admin/sensitive", label: "민감 알림", emoji: "🚑" },
    { href: "/admin/errors", label: "에러 로그", emoji: "🚨" },
  ]},
  { key: "content", label: "콘텐츠", emoji: "📢", items: [
    { href: "/admin/popups", label: "공지 팝업", emoji: "📢" },
  ]},
];

export function AdminNav({ badges, errBadge }: { badges: Record<string, number>; errBadge?: { err: number; warn: number } }) {
  const pathname = usePathname();
  const activeGroup = GROUPS.find((g) => g.items.some((it) => pathname.startsWith(it.href)))?.key;
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g) => [g.key, g.key === activeGroup]))
  );
  const fmt = (n: number) => (n > 99 ? "99+" : String(n));
  const groupBadge = (g: Group) => g.items.reduce((s, it) => s + (badges[it.href] ?? 0), 0);

  const Badge = ({ href }: { href: string }) => {
    if (href === "/admin/errors" && errBadge) {
      return (errBadge.err > 0 || errBadge.warn > 0) ? (
        <span className="ml-auto flex gap-1">
          {errBadge.err > 0 && <span className="bg-rose-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{fmt(errBadge.err)}</span>}
          {errBadge.warn > 0 && <span className="bg-yellow-400 text-night text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{fmt(errBadge.warn)}</span>}
        </span>
      ) : null;
    }
    return (badges[href] ?? 0) > 0 ? <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{fmt(badges[href])}</span> : null;
  };

  const linkCls = "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-white/80 hover:bg-white/5 hover:text-white transition-colors";

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      <Link href={HOME.href} className={linkCls}><span>{HOME.emoji}</span><span className="flex-1">{HOME.label}</span></Link>
      {GROUPS.map((g) => {
        const gb = groupBadge(g);
        const isOpen = open[g.key];
        return (
          <div key={g.key}>
            <button onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] uppercase tracking-wide text-white/45 hover:text-white/70">
              <span>{g.emoji}</span><span className="flex-1 text-left">{g.label}</span>
              {!isOpen && gb > 0 && <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5">{fmt(gb)}</span>}
              <span className="text-white/30">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="space-y-1 pl-2">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className={linkCls}><span>{it.emoji}</span><span className="flex-1">{it.label}</span><Badge href={it.href} /></Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: layout.tsx가 뱃지 조회 후 AdminNav 렌더**

`app/admin/layout.tsx` 의 인라인 `NAV.map(...)` `<nav>` 블록을 `<AdminNav badges={badges} errBadge={{err: errCount, warn: warnCount}} />` 로 교체. 기존 뱃지 조회 로직(inqRes/sensRes/errRes/warnRes → badges)은 유지. `NAV` 상수와 인라인 렌더 제거. import 추가.

- [ ] **Step 3: 빌드 + 브라우저 → 커밋**

Run: `npm run build` (EXIT 0). `/admin/*` 진입 시 현재 그룹 자동 펼침 + 접힌 그룹 헤더 뱃지 합계 + 토글 동작 확인.
```bash
git add components/admin/AdminNav.tsx app/admin/layout.tsx
git commit -m "feat(admin): 접이식 그룹 nav (홈 + 4그룹)"
```

---

## Task 5: /admin/relationship 신규 메뉴 (D + F)

**Files:**
- Create: `app/admin/relationship/page.tsx`

- [ ] **Step 1: 서버 컴포넌트로 연애상담 지표 조회 + 렌더**

대시보드 page.tsx 패턴(서버 컴포넌트 직접 조회, `Stat` 스타일). 조회:
- `relationships`: 전체(excl 제외) → 등록 수, status 분포, last_visited_at 기반 최근 방문/이탈.
- `relationship_passes`: 활성(expires_at>now) 수, kind별 구매 수, 갱신(유저별 2건 이상), 연장(source='rel_extend' count from star_transactions), 패스 매출(stars_spent 합).
- `readings` where consultation_type='relationship' or relationship_id not null: 스레드/스킬. skill_key별 호출 수.
- `messages`(relationship 스레드 reading_id): 방문당 턴/세션(created_at gap ≥ 6h로 세션 분리), 소프트캡(하루 user 메시지 ≥ 20) 도달.
- memo(jsonb) pending_checkin → 복귀 텀(체크인 생성 후 다음 방문).

지표 섹션(spec D+F):
```
[등록/스레드]  관계 등록 · status 분포 · 활성 스레드
[패스]         활성 패스 · kind별 구매(day1/3/7) · 갱신율 · 연장 · 패스 매출(별)
[스킬]         checkin/deep_feelings/compat/verdict 호출 수
[대화 흐름]    방문당 평균 턴 · 소프트캡 도달률 · 5별 연장 도달률 · 재방문 간격 · 마지막 방문 후 경과(이탈 리스트)
```

⚠️ **세션 정의**: 같은 스레드 messages 를 `created_at` 간격 ≥ 6시간이면 다른 방문으로 분리(간단 규칙, spec §7). 순수 계산은 `lib/analytics/aggregate.ts` 에 헬퍼 추가 가능(유닛 대상) — 방문/세션 분리 로직이 복잡하면 `buildRelationshipFlow(messages)` 순수 함수로 빼고 테스트.

- [ ] **Step 2: 세션/흐름 순수 함수 + 유닛 (복잡 로직만)**

방문 세션 분리·소프트캡·재방문 간격을 `lib/analytics/aggregate.ts` 에 `buildRelationshipFlow(...)` 로 빼고 `aggregate.test.ts` 에 유닛(6h gap 분리, 20턴 도달 케이스). Run: `node --import tsx --test lib/analytics/aggregate.test.ts` PASS.

- [ ] **Step 3: 빌드 + 브라우저 → 커밋**

Run: `npm run build` (EXIT 0). `/admin/relationship` 렌더 확인(데이터 없으면 0/빈 표 우아하게).
```bash
git add app/admin/relationship/page.tsx lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts
git commit -m "feat(admin): /admin/relationship 연애상담 지표 + 대화 흐름"
```

---

## Task 6: 전체 검증 + dev 배포

- [ ] **Step 1: 유닛 전체**

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: 전체 PASS

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: EXIT 0

- [ ] **Step 3: 브라우저 E2E (어드민 각 화면)**

dev 서버(preview_start) → 어드민 로그인 상태로: `/admin`(별 소모·연애상담 KPI), `/admin/analytics`(별 소모 상품 표), `/admin/relationship`(지표), nav 접이식 동작. 콘솔 에러 없음.

- [ ] **Step 4: dev push**

```bash
git push origin dev
```

---

## Self-Review (spec 커버)

- **A** 분류 엔진 → Task 1 (완전 코드 + 유닛). **B** 대시보드 → Task 3. **C** 애널리틱스 → Task 2. **D+F** 연애상담 메뉴+흐름 → Task 5. **E** 접이식 nav → Task 4. 갭 3(relationship 타입) → Task 1 ReadingRow 확장.
- **Placeholder:** Task 1·4 완전 코드. Task 2·3·5 화면은 조회 쿼리+핵심 스니펫+기존 패턴(Stat/ProductTable) 참조 — 화면 전체 코드는 구현 시 패턴대로(방대해 스니펫으로 명시).
- **타입 일관:** `StarTxRow`/`ReadingInfo`/`StarSpendGroup`/`StarSpendDomain` Task 1 정의 → Task 2·3에서 동일 사용. `domain` 5값 = 화면 LABEL 맵과 일치.
- **마이그레이션 없음** 재확인 — 전부 조회/집계.
