# 별콩톡 SEO 기반 세팅 (A안) — 설계

> 작성일: 2026-06-29
> 범위: 런칭용 기술 SEO 풀세팅 (브랜드 검색 노출 + 네이버/구글 색인 기반).
> 카테고리 검색 유입을 위한 **콘텐츠 허브(C안)는 별도 스펙으로 분리** — 본 스펙에 포함하지 않음.

## 목표

- "별콩톡" 브랜드 검색 시 네이버/구글에 정확히 노출 + 풍부한 미리보기(title·description·favicon·OG).
- 네이버/구글이 `byeolkongtalk.com`을 정상 색인하도록 소유확인·사이트맵 제출 기반 마련.
- 개인화/도구 페이지는 색인에서 제외해 검색 품질·평판 보호.

## 현재 상태 (기준선)

이미 존재:
- `app/layout.tsx` — `metadataBase`(https://byeolkongtalk.com) + title/description + OpenGraph + Twitter 카드.
- `app/robots.ts` — `/api/`, `/mypage`, `/readings`, `/concern`, 사주·타로 reading/result/draw 차단.
- `app/sitemap.ts` — 홈/login/shop/terms/privacy/refund 등록.
- `app/opengraph-image.tsx` — 동적 OG 이미지.
- `lib/env.ts` — `REQUIRED_ENV`/`OPTIONAL_ENV` 화이트리스트 패턴.

발견한 제약/문제:
1. **공개 페이지가 전부 `"use client"`** (홈/약관/개인정보/환불/select/shop/tarot/fortune). 클라이언트 컴포넌트는 `export const metadata` 불가 → 페이지별 메타데이터는 라우트 세그먼트에 서버 `layout.tsx`를 얹어 해결.
2. **`/favicon.png` 자산 없음.** `app/layout.tsx`가 참조하지만 `public/`에 파일이 없어 탭/검색결과 아이콘 깨짐.

## 작업 항목

### 1. 검색엔진 소유확인 (코드)

- `lib/env.ts` `OPTIONAL_ENV`에 추가:
  - `NAVER_SITE_VERIFICATION`
  - `GOOGLE_SITE_VERIFICATION`
- `app/layout.tsx` `metadata`에 `verification` 블록 추가:
  - `verification.google = process.env.GOOGLE_SITE_VERIFICATION`
  - `verification.other = { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION }`
  - 값이 없으면(`undefined`) Next가 해당 meta를 생성하지 않음 → dev/미설정 환경에서 안전.
- `.env.local.template`에 두 키 placeholder 주석 추가.

검증: prod 배포 후 `view-source`에 `<meta name="google-site-verification">`·`<meta name="naver-site-verification">` 노출.

### 2. 페이지별 메타데이터 (코드)

- 루트 `app/layout.tsx` title을 템플릿 구조로:
  - `title: { default: "별콩톡 — 사주·타로로 마음의 흐름을 봐줘", template: "%s · 별콩톡" }`
- 색인 대상 공개 페이지에 **서버 `layout.tsx`** 추가(metadata만 export, children 그대로 렌더):
  - `app/terms/layout.tsx` — title "이용약관", canonical `/terms`
  - `app/privacy/layout.tsx` — title "개인정보처리방침", canonical `/privacy`
  - `app/refund/layout.tsx` — title "환불정책", canonical `/refund`
  - 각 페이지에 맞는 한 줄 description.
- 홈(`/`)은 루트 metadata가 커버. `alternates.canonical = "/"` 명시.
- `/fortune`은 색인 대상이 아님(5번 결정) → 별도 메타데이터 불필요.

검증: 각 페이지 `view-source`의 `<title>`이 `"이용약관 · 별콩톡"` 형태로 다르게 나옴.

### 3. 구조화 데이터 JSON-LD (코드)

- 루트 `app/layout.tsx` `<body>` 내에 JSON-LD `<script type="application/ld+json">` 삽입. 2개 타입만:
  - `Organization` — name "별콩톡", url, logo(절대 URL).
  - `WebSite` — name "별콩톡", url.
- `SearchAction`/사이트 검색 박스 등 사이트에 없는 기능 타입은 넣지 않음(YAGNI).

검증: 구글 [리치 결과 테스트](https://search.google.com/test/rich-results)에서 Organization/WebSite 인식, 오류 0.

### 4. 파비콘/아이콘 자산 (코드 + 자산)

- Next 16 파일 컨벤션 사용:
  - `app/icon.png` — 자동 favicon(여러 크기 파생).
  - `app/apple-icon.png` — iOS 홈 추가용.
- 자산 출처: **기존 `public/byeolkong-main.png`에서 정사각 크롭/리사이즈로 파생** (별도 제공 자산 없음). 추후 전용 파비콘으로 교체 가능.
- `app/layout.tsx`의 기존 `icons` 블록(`/favicon.png` 참조)은 파일 컨벤션과 충돌하지 않도록 정리 — 파일 컨벤션으로 일원화하거나 실제 경로로 수정.

검증: 배포 후 브라우저 탭 + 검색결과 미리보기에 별콩이 아이콘 노출.

### 5. sitemap / robots 정리 (코드)

- `app/sitemap.ts`:
  - `/login` 제거(색인 가치 없음, 인증 페이지).
  - 공개 색인 대상만 유지: 홈 + 약관/개인정보/환불.
- `app/robots.ts`:
  - **결정**: 얇은 도구/인터랙션 진입 페이지는 색인 가치가 낮고 품질 평판에 마이너스 → `/login`, `/select`, `/tarot`, `/fortune`을 `disallow`에 추가(기존 차단 목록 유지).
  - 최종 허용 색인 집합: `/`, `/terms`, `/privacy`, `/refund`.

검증: prod `/robots.txt`·`/sitemap.xml`가 의도한 집합과 일치.

## 비범위 (이번 스펙 제외)

- 카테고리 검색 유입용 콘텐츠 아티클/허브(C안) — 별도 스펙.
- GA4(`NEXT_PUBLIC_GA_ID`) 연동 — 선택 사항, 별개.
- 다국어/hreflang — 한국어 단일.

## 사용자 콘솔 작업 (코드 외 — 가이드 제공)

코드 배포 후 사용자가 직접 수행 (값 발급 → Vercel prod env 등록 → 재배포 → 확인):

1. **네이버 서치어드바이저** (searchadvisor.naver.com)
   - 사이트 등록 → "HTML 태그" 소유확인 방식의 content 값 복사
   - Vercel prod env `NAVER_SITE_VERIFICATION`에 등록 → prod 재배포
   - 소유확인 → "요청 > 사이트맵 제출"에 `sitemap.xml` → "웹페이지 수집" 요청
2. **구글 서치콘솔** (search.google.com/search-console)
   - 도메인 또는 URL 접두어 속성 추가 → "HTML 태그" content 값 복사
   - Vercel prod env `GOOGLE_SITE_VERIFICATION` 등록 → 재배포 → 확인
   - 사이트맵에 `sitemap.xml` 제출 → URL 검사로 색인 요청

> env는 **Production 스코프만** 등록. `NEXT_PUBLIC_` 접두사 없음(소유확인 메타는 서버 렌더이므로 빌드 인라인 불필요)이나, Next metadata가 빌드 시점에 HTML로 굽기 때문에 **등록 후 재배포 필수**.

## 검증 기준 (완료 조건)

- [ ] 빌드 통과 + prod 배포.
- [ ] `view-source`: google/naver verification meta, Organization/WebSite JSON-LD, 페이지별 고유 `<title>` 확인.
- [ ] 구글 리치 결과 테스트 오류 0.
- [ ] `/robots.txt`·`/sitemap.xml`가 의도한 색인 집합과 일치.
- [ ] 탭/검색결과 favicon 노출.
- [ ] (사용자) 네이버·구글 소유확인 성공 + 사이트맵 제출 완료.
