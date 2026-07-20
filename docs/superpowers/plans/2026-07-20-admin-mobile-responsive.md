# 어드민 모바일 반응형 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일(md 미만)에서 어드민 콘솔을 데스크톱 모드 강제 없이 쓸 수 있게 — 햄버거 드로어 네비 + 테이블 가로 스크롤 일관화 + 대시보드 1열.

**Architecture:** 신설 client 컴포넌트 `AdminMobileNav`(☰ + 드로어, 기존 `AdminNav` 재사용)를 서버 layout 의 모바일 헤더에 삽입. 테이블 6곳에 `overflow-x-auto` 래퍼. 대시보드 그리드 모바일 1열. 스펙: `docs/superpowers/specs/2026-07-20-admin-mobile-responsive-design.md`

**Tech Stack:** Next.js 16 App Router, Tailwind v4. 신규 의존성 없음. 유닛 테스트 대상 로직 없음(순수 마크업) — 검증은 빌드 + 브라우저 실렌더(375px).

---

### Task 1: AdminMobileNav 드로어 컴포넌트

**Files:**
- Create: `components/admin/AdminMobileNav.tsx`
- Modify: `app/admin/layout.tsx:57-61` (모바일 헤더)

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

// 모바일 어드민 네비 — ☰ 버튼 + 왼쪽 슬라이드 드로어. 메뉴는 AdminNav 재사용.
// 어드민 레이아웃엔 transform 조상이 없어 포털 없이 fixed 로 충분.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";

export function AdminMobileNav({ badges, errBadge }: { badges: Record<string, number>; errBadge: { err: number; warn: number } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]); // 링크 이동 시 자동 닫힘

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="p-1.5 -ml-1.5 rounded-lg text-white/80 hover:bg-white/10"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-night-deep border-r border-white/10 flex flex-col animate-fade-in">
            <div className="px-5 py-5 border-b border-white/10 flex items-center">
              <span className="font-display text-[20px] tracking-wide">별콩 어드민</span>
              <button onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="ml-auto p-1 text-white/60 hover:text-white">✕</button>
            </div>
            <AdminNav badges={badges} errBadge={errBadge} />
            <div className="p-3 border-t border-white/10">
              <Link href="/" className="px-3 py-2 text-[12px] text-white/60 hover:text-white">← 사용자 화면으로</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: layout 모바일 헤더에 삽입**

`app/admin/layout.tsx` — import 추가 후 모바일 헤더 div 교체:

```tsx
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
```

```tsx
        <div className="md:hidden mb-4 flex items-center gap-2">
          <AdminMobileNav badges={badges} errBadge={{ err: errCount, warn: warnCount }} />
          <span className="font-display text-lg">별콩 어드민</span>
          <EnvBanner />
        </div>
```

- [ ] **Step 3: 커밋**

```bash
git add components/admin/AdminMobileNav.tsx app/admin/layout.tsx
git commit -m "feat(admin): 모바일 햄버거 드로어 네비 — AdminNav 재사용, 이동 시 자동 닫힘"
```

### Task 2: 테이블 overflow-x-auto 래퍼 6곳

**Files:**
- Modify: `app/admin/errors/page.tsx:80` / `app/admin/errors/[key]/page.tsx:140` / `app/admin/readings/page.tsx:56` / `app/admin/inquiries/page.tsx:68` / `app/admin/sensitive/page.tsx:19` / `app/admin/fortune-refunds/page.tsx:17`

- [ ] **Step 1: 각 `<table className="w-full …">` 를 래퍼로 감싼다**

패턴 (payments 페이지 미러):

```tsx
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          …기존 그대로…
        </table>
      </div>
```

날짜 셀(`toLocaleString`/`toLocaleDateString` 출력)에 `whitespace-nowrap` 이 없으면 추가:
readings(일시 td) · inquiries(일시 td) · sensitive(일시 td) · fortune-refunds(일시 td).
errors/errors상세는 이미 nowrap 있음.

- [ ] **Step 2: 필터 탭 줄 flex-wrap 보강**

`app/admin/readings/page.tsx:50` 과 `app/admin/inquiries/page.tsx:63` 의
`<div className="flex gap-2">` → `<div className="flex flex-wrap gap-2">`

- [ ] **Step 3: 커밋**

```bash
git add app/admin/errors/page.tsx "app/admin/errors/[key]/page.tsx" app/admin/readings/page.tsx app/admin/inquiries/page.tsx app/admin/sensitive/page.tsx app/admin/fortune-refunds/page.tsx
git commit -m "fix(admin): 테이블 6곳 overflow-x-auto 래퍼 — 모바일 페이지 가로 밀림 제거"
```

### Task 3: 대시보드 모바일 1열

**Files:**
- Modify: `app/admin/page.tsx` (섹션 그리드 4곳)

- [ ] **Step 1: 그리드 클래스 변경**

- 오늘: `grid grid-cols-2 md:grid-cols-3 gap-3` → `grid grid-cols-1 md:grid-cols-3 gap-3`
- 전체: 동일 변경
- 별 소모: `grid grid-cols-2 md:grid-cols-5 gap-3` → `grid grid-cols-1 md:grid-cols-5 gap-3`
- 연애 상담: `grid grid-cols-2 md:grid-cols-3 gap-3` → `grid grid-cols-1 md:grid-cols-3 gap-3`
- 처리 대기: `grid-cols-2` 그대로

- [ ] **Step 2: 커밋**

```bash
git add app/admin/page.tsx
git commit -m "style(admin): 대시보드 KPI 섹션 모바일 1열 — 값·무료·증감 한 줄 보장"
```

### Task 4: 검증 + dev push

- [ ] **Step 1: 빌드**

Run: `npm run build`
Expected: `✓ Compiled successfully`, `ƒ /admin` 라우트 존재.

- [ ] **Step 2: 로컬 실렌더 (375px)**

`.env.local` 에 임시 `ADMIN_USER_IDS=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` 추가 →
`node --env-file=.env.local <scratchpad>/mint-admin-token.mjs` 로 HMAC 토큰 발급 →
dev 서버 기동 → 브라우저 쿠키 `byeolkong_user_id`/`byeolkong_admin_token` 주입 →
뷰포트 375×812 에서:

- `/admin` 대시보드 1열 + 드로어 열기/이동/자동닫힘.
- 13개 페이지 순회: `document.documentElement.scrollWidth <= window.innerWidth` 전부 true.
- 1280px 로 되돌려 데스크톱 사이드바·5열 회귀 없음 확인.
- **검증 후 임시 ADMIN_USER_IDS 줄 제거 + dev 서버 종료.**

- [ ] **Step 3: dev push**

```bash
git push origin dev
```

사용자 폰(설치 PWA)에서 dev.byeolkongtalk.com/admin 검증 → 승인 시 main fast-forward.
