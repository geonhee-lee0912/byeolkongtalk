# 별콩톡 SEO 기반 세팅 (A안) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "별콩톡" 브랜드 검색 시 네이버/구글에 정확히 노출되고 사이트가 정상 색인되도록, 소유확인 메타·페이지별 메타데이터·JSON-LD·파비콘·robots/sitemap을 정비한다.

**Architecture:** 공개 페이지가 전부 `"use client"`라 페이지별 metadata는 라우트 세그먼트에 서버 `layout.tsx`를 얹어 주입한다. 소유확인 토큰은 기존 `OPTIONAL_ENV` 패턴 + `metadata.verification`으로 관리한다. 파비콘은 Next 16 파일 컨벤션(`app/icon.png`)으로 일원화한다. 색인 허용 집합은 `/`, `/terms`, `/privacy`, `/refund` 4개로 한정한다.

**Tech Stack:** Next.js 16 App Router Metadata API, TypeScript.

**검증 방식 주의:** 정적 메타데이터/설정 변경이라 단위 테스트 대상이 아니며 레포에 테스트 프레임워크도 없다. 검증은 `npm run build`(타입/빌드 오류) + 로컬 prod 서버(`npm run start`) 대상 `curl` 확인으로 한다. 새 테스트 하니스 도입은 YAGNI.

> **로컬 prod 서버 검증 패턴** (여러 태스크에서 재사용):
> ```bash
> npm run build && npm run start &   # 백그라운드, 기본 포트 3000
> # (서버 기동 대기 후 curl)
> # 확인 끝나면: kill %1  또는 해당 프로세스 종료
> ```
> 소유확인 meta(google/naver)는 env가 있을 때만 렌더된다. 로컬 `.env.local`에 토큰이 없으면 해당 meta는 **안 나오는 게 정상**(Task 1 검증 참고).

---

### Task 1: 검색엔진 소유확인 env + 메타태그

**Files:**
- Modify: `lib/env.ts` (OPTIONAL_ENV 배열)
- Modify: `app/layout.tsx` (metadata.verification)
- Modify: `.env.local.template` (placeholder 주석)

- [ ] **Step 1: `lib/env.ts`의 OPTIONAL_ENV에 두 키 추가**

`OPTIONAL_ENV` 배열을 아래로 교체:

```ts
export const OPTIONAL_ENV = [
  "NEXT_PUBLIC_GA_ID",
  "ADMIN_USER_IDS",
  "NAVER_SITE_VERIFICATION",
  "GOOGLE_SITE_VERIFICATION",
] as const;
```

- [ ] **Step 2: `app/layout.tsx`에 verification 객체 구성 + metadata에 연결**

`export const metadata` 선언 **위**에 조건부 verification 객체를 추가(값이 없으면 meta를 아예 안 내보내기 위함):

```ts
const verification: Metadata["verification"] = {};
if (process.env.GOOGLE_SITE_VERIFICATION) {
  verification.google = process.env.GOOGLE_SITE_VERIFICATION;
}
if (process.env.NAVER_SITE_VERIFICATION) {
  verification.other = {
    "naver-site-verification": process.env.NAVER_SITE_VERIFICATION,
  };
}
```

그리고 `metadata` 객체 안(예: `description` 다음 줄)에 추가:

```ts
  verification,
```

> 참고: Task 2에서 같은 `metadata` 객체의 title/icons/canonical도 수정한다. Task 1·2를 연속 수행하면 한 번에 정리된다. 순서가 섞여도 각 키는 독립적이라 충돌 없음.

- [ ] **Step 3: `.env.local.template`에 placeholder 추가**

토스 키 줄(`TOSS_SECRET_KEY=test_sk_`) 아래, 또는 파일 끝에 추가:

```
# SEO 검색엔진 소유확인 (선택). prod 스코프에만 등록 후 재배포 필요.
# 네이버 서치어드바이저 / 구글 서치콘솔의 "HTML 태그" content 값.
NAVER_SITE_VERIFICATION=
GOOGLE_SITE_VERIFICATION=
```

- [ ] **Step 4: 빌드로 타입 검증**

Run: `npm run build`
Expected: 빌드 성공(타입 오류 없음). `verification`이 `Metadata["verification"]` 타입과 일치.

- [ ] **Step 5: 로컬 서버에서 meta 부재 확인(env 없을 때)**

로컬 prod 서버 기동 후:
Run: `curl -s localhost:3000/ | grep -i "site-verification" || echo "NONE (정상)"`
Expected: `NONE (정상)` — 로컬에 토큰 env가 없으므로 meta가 안 나오는 것이 의도된 동작.

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts app/layout.tsx .env.local.template
git commit -m "feat(seo): 네이버·구글 소유확인 메타태그 env 연동"
```

---

### Task 2: 루트 메타데이터 정비 (title 템플릿·canonical·icons 정리) + JSON-LD

**Files:**
- Modify: `app/layout.tsx` (metadata 객체 + body에 JSON-LD)

- [ ] **Step 1: metadata의 title을 템플릿 구조로, description 보강, canonical 추가, 깨진 icons 블록 제거**

현재 `metadata` 객체에서:
- `title: "별콩톡",` → 템플릿 객체로 교체
- `description` → 사주+타로 반영 문구로 교체
- `icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" },` → **삭제**(Task 3의 `app/icon.png` 파일 컨벤션으로 일원화; `/favicon.png` 파일은 존재하지 않음)
- `alternates: { canonical: "/" },` 추가
- openGraph/twitter 문구도 사주+타로 반영

교체 후 `metadata`(Task 1의 `verification` 포함) 최종 형태:

```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://byeolkongtalk.com"),
  title: {
    default: "별콩톡 — 사주·타로로 마음의 흐름을 봐줘",
    template: "%s · 별콩톡",
  },
  description:
    "별의 수호자 별콩이가 너의 사주와 타로로 흐름과 가능성, 선택의 방향을 안내해.",
  alternates: { canonical: "/" },
  verification,
  openGraph: {
    title: "별콩이 — 사주·타로로 흐름을 봐줘",
    description:
      "별의 수호자 별콩이가 너의 사주와 타로로 흐름과 가능성을 안내해.",
    locale: "ko_KR",
    type: "website",
    siteName: "별콩톡",
  },
  twitter: {
    card: "summary_large_image",
    title: "별콩이 — 사주·타로로 흐름을 봐줘",
    description:
      "별의 수호자 별콩이가 너의 사주와 타로로 흐름과 가능성을 안내해.",
  },
};
```

- [ ] **Step 2: `<body>` 최상단에 Organization + WebSite JSON-LD 삽입**

`app/layout.tsx`의 `<body className="min-h-full flex flex-col">` 바로 다음 줄에 추가:

```tsx
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "별콩톡",
                url: "https://byeolkongtalk.com",
                logo: "https://byeolkongtalk.com/byeolkong-main.png",
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "별콩톡",
                url: "https://byeolkongtalk.com",
              },
            ]),
          }}
        />
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 4: 로컬 서버에서 title·JSON-LD 확인**

```bash
curl -s localhost:3000/ | grep -o "<title>[^<]*</title>"
curl -s localhost:3000/ | grep -o "application/ld+json"
```
Expected: `<title>별콩톡 — 사주·타로로 마음의 흐름을 봐줘</title>` + `application/ld+json` 1건.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(seo): title 템플릿·canonical·Organization/WebSite JSON-LD + 깨진 favicon 참조 제거"
```

---

### Task 3: 파비콘/아이콘 자산 (파일 컨벤션)

**Files:**
- Create: `app/icon.png` (byeolkong-main.png 복사)
- Create: `app/apple-icon.png` (byeolkong-main.png 복사)

> 자산 출처 결정: 별도 파비콘 자산이 없으므로 기존 `public/byeolkong-main.png`(별콩이 캐릭터)를 그대로 사용한다. 약 1.1MB로 파비콘치곤 크지만 v1 허용 — 추후 512px 정사각 최적화 PNG로 교체 가능(스펙 4번). Next는 `app/icon.png`를 favicon `<link>`로 자동 노출하며 브라우저가 스케일링한다.

- [ ] **Step 1: 자산 복사**

```bash
cp public/byeolkong-main.png app/icon.png
cp public/byeolkong-main.png app/apple-icon.png
```

- [ ] **Step 2: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 3: 로컬 서버에서 favicon link 확인**

```bash
curl -s localhost:3000/ | grep -o 'rel="icon"[^>]*'
curl -s -o /dev/null -w "%{http_code}" localhost:3000/icon.png
```
Expected: `<link rel="icon" ...>` 존재 + `/icon.png` 200. (더 이상 존재하지 않는 `/favicon.png` 참조가 없어야 함.)

- [ ] **Step 4: Commit**

```bash
git add app/icon.png app/apple-icon.png
git commit -m "feat(seo): app/icon·apple-icon 파비콘 자산 추가(별콩이 기반)"
```

---

### Task 4: 공개 페이지별 메타데이터 layout (약관·개인정보·환불)

**Files:**
- Create: `app/terms/layout.tsx`
- Create: `app/privacy/layout.tsx`
- Create: `app/refund/layout.tsx`

> 세 페이지(`app/terms/page.tsx` 등)는 `"use client"`라 자체적으로 metadata를 export할 수 없다. 같은 세그먼트에 서버 컴포넌트 `layout.tsx`를 두어 metadata만 부여하고 children은 그대로 통과시킨다.

- [ ] **Step 1: `app/terms/layout.tsx` 생성**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
  description: "별콩톡 서비스 이용약관입니다.",
  alternates: { canonical: "/terms" },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

- [ ] **Step 2: `app/privacy/layout.tsx` 생성**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "별콩톡 개인정보처리방침입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

- [ ] **Step 3: `app/refund/layout.tsx` 생성**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "환불정책",
  description: "별콩톡 별(재화) 환불정책입니다.",
  alternates: { canonical: "/refund" },
};

export default function RefundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: 로컬 서버에서 페이지별 title 확인**

```bash
curl -s localhost:3000/terms   | grep -o "<title>[^<]*</title>"
curl -s localhost:3000/privacy | grep -o "<title>[^<]*</title>"
curl -s localhost:3000/refund  | grep -o "<title>[^<]*</title>"
```
Expected: 각각 `이용약관 · 별콩톡`, `개인정보처리방침 · 별콩톡`, `환불정책 · 별콩톡`.

- [ ] **Step 6: Commit**

```bash
git add app/terms/layout.tsx app/privacy/layout.tsx app/refund/layout.tsx
git commit -m "feat(seo): 약관·개인정보·환불 페이지별 메타데이터 layout 추가"
```

---

### Task 5: robots / sitemap 색인 집합 정리

**Files:**
- Modify: `app/robots.ts` (disallow 배열)
- Modify: `app/sitemap.ts` (URL 목록)

> 목표 허용 색인 집합: `/`, `/terms`, `/privacy`, `/refund`. 도구/인증/개인화 페이지는 전부 제외.

- [ ] **Step 1: `app/robots.ts`의 disallow 배열 교체**

기존 `disallow: [...]` 를 아래로 교체:

```ts
        disallow: [
          "/api/",
          "/login",
          "/mypage",
          "/readings",
          "/concern",
          "/select",
          "/shop",
          "/fortune",
          "/saju",
          "/tarot",
        ],
```

> `/saju`·`/tarot`·`/fortune` 접두사가 하위 경로(`/saju/reading` 등)까지 모두 커버하므로 기존 개별 항목은 통합된다. `/mypage` 접두사가 `/mypage/*`를 커버한다.

- [ ] **Step 2: `app/sitemap.ts`에서 비색인 URL 제거**

`return [ ... ]` 배열에서 **`/login` 항목과 `/shop` 항목을 삭제**하고, 홈·terms·privacy·refund만 남긴다. 최종 형태:

```ts
  return [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/refund`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 4: 로컬 서버에서 robots·sitemap 확인**

```bash
curl -s localhost:3000/robots.txt
curl -s localhost:3000/sitemap.xml
```
Expected:
- robots.txt의 Disallow에 `/login /select /shop /fortune /saju /tarot` 포함, Sitemap 줄 존재.
- sitemap.xml에 `/`, `/terms`, `/privacy`, `/refund` 4개 `<loc>`만 존재(`/login`·`/shop` 없음).

- [ ] **Step 5: Commit**

```bash
git add app/robots.ts app/sitemap.ts
git commit -m "feat(seo): 색인 허용 집합을 공개 4페이지로 한정(robots·sitemap 정리)"
```

---

### Task 6: 통합 검증 + dev 배포 핸드오프

**Files:** 없음(검증 + 배포).

- [ ] **Step 1: 전체 빌드 + 로컬 prod 서버 일괄 점검**

```bash
npm run build && npm run start &
```
서버 기동 후:
```bash
echo "--- home title ---";   curl -s localhost:3000/ | grep -o "<title>[^<]*</title>"
echo "--- json-ld ---";      curl -s localhost:3000/ | grep -o "application/ld+json"
echo "--- favicon ---";      curl -s localhost:3000/ | grep -o 'rel="icon"[^>]*'
echo "--- terms title ---";  curl -s localhost:3000/terms | grep -o "<title>[^<]*</title>"
echo "--- robots ---";       curl -s localhost:3000/robots.txt
echo "--- sitemap ---";      curl -s localhost:3000/sitemap.xml
```
Expected: 위 각 태스크의 기대값이 모두 충족. 서버 종료: `kill %1`.

- [ ] **Step 2: dev 브랜치 push → dev.byeolkongtalk.com 확인**

```bash
git push origin dev
```
> dev는 Vercel Deployment Protection(SSO)이 걸려 있어 외부 스크래퍼 검증은 불가하나, 로그인 상태 브라우저 `view-source`로 meta/JSON-LD/title은 확인 가능.

- [ ] **Step 3: prod 반영(main fast-forward) — 사용자 확인 후**

dev에서 확인되면 main으로 머지:
```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```

- [ ] **Step 4: 사용자 콘솔 작업 안내(코드 외)**

prod 배포 후 사용자가 수행 (스펙 "사용자 콘솔 작업" 섹션 참고):
1. **네이버 서치어드바이저**: 사이트 등록 → HTML 태그 content 값 → Vercel prod env `NAVER_SITE_VERIFICATION` 등록 → **prod 재배포** → 소유확인 → 사이트맵(`sitemap.xml`) 제출 + 수집 요청.
2. **구글 서치콘솔**: 속성 추가 → HTML 태그 content 값 → Vercel prod env `GOOGLE_SITE_VERIFICATION` 등록 → 재배포 → 확인 → 사이트맵 제출 → URL 검사 색인 요청.
3. 재배포 후 prod에서 `view-source` 또는 [구글 리치 결과 테스트](https://search.google.com/test/rich-results)로 verification meta + JSON-LD 최종 확인.

> env는 **Production 스코프만**. metadata는 빌드 시 HTML로 구워지므로 토큰 등록 후 **재배포 필수**.

---

## 완료 조건 (스펙 검증 기준 매핑)

- [ ] 빌드 통과 + dev/prod 배포 (Task 6)
- [ ] verification meta·JSON-LD·페이지별 title `view-source` 확인 (Task 1,2,4,6)
- [ ] 구글 리치 결과 테스트 오류 0 (Task 6 Step 4)
- [ ] `/robots.txt`·`/sitemap.xml`가 4페이지 색인 집합과 일치 (Task 5)
- [ ] 탭/검색결과 favicon 노출 (Task 3)
- [ ] (사용자) 네이버·구글 소유확인 + 사이트맵 제출 (Task 6 Step 4)
