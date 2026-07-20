# 어드민 모바일 반응형 — 설계 (2026-07-20)

## 배경 / 문제

운영자는 크롬 "홈 화면에 추가"(PWA)로 사용자 앱과 어드민을 폰에 설치해 쓰는데, 어드민은
**크롬 데스크톱 모드를 강제해야만 사용 가능**했다. 원인 진단:

- **네비게이션 부재가 근본 원인.** `app/admin/layout.tsx`의 사이드바가 `hidden md:flex`라
  모바일(md 미만)에선 메뉴가 통째로 사라진다. 모바일 헤더엔 "별콩 어드민" 텍스트만 있어
  대시보드 외 12개 화면으로 이동 자체가 불가능.
- **테이블 절반이 반응형 미처리.** analytics/ads/payments/users/paywall 은 `overflow-x-auto`
  래퍼가 있으나 errors·errors상세·readings·inquiries·sensitive·fortune-refunds 는 래퍼가
  없어 좁은 화면에서 페이지가 가로로 밀리거나 셀이 뭉개짐.
- viewport/manifest 는 앱 공통이라 추가 작업 불필요. 데스크톱 모드 강제는 메뉴 부재 때문.

## 결정 (사용자 확정)

1. **모바일 네비 = 햄버거 드로어.** 모바일 헤더에 ☰ 버튼 → 왼쪽 슬라이드 드로어.
   기존 `AdminNav`(그룹 접이식 + 미처리 뱃지)를 그대로 재사용. 링크 이동 시 자동 닫힘.
   데스크톱(md+) 사이드바는 변경 없음.
2. **테이블 = 전부 가로 스크롤.** 래퍼 없는 6곳에 기존 패턴과 동일한 `overflow-x-auto`
   래퍼 추가. 페이지 자체는 절대 가로로 안 밀리고 테이블 안에서만 스와이프.
   카드화는 이번 스코프 아님(불편한 화면이 생기면 다음 사이클).
3. **대시보드 = 모바일 최적화.** 오늘/전체/별 소모/연애 상담 섹션을 모바일 1열로
   (카드 전폭 → `값 (무료 N) +x.x% (어제 N)` 이 한 줄에 들어옴). 처리 대기(숫자 2개)는
   2열 유지. md 이상은 현행 유지(별 소모 5열 포함).

## 컴포넌트 설계

### `components/admin/AdminMobileNav.tsx` (신설, client)

- 책임: ☰ 버튼 + 드로어 open 상태 + 백드롭/패널 렌더. 메뉴 내용은 `AdminNav` 재사용.
- Props: `badges: Record<string, number>`, `errBadge: { err: number; warn: number }`
  — layout(서버)이 이미 조회하는 값을 그대로 전달, 추가 쿼리 없음.
- 동작: 백드롭 탭·✕ 버튼·pathname 변경(usePathname + useEffect) 시 닫힘.
  `fixed inset-0 z-50 md:hidden` — 어드민 레이아웃엔 transform 조상이 없어 포털 불필요.
- 드로어 패널: `w-72 bg-night-deep`, 상단 타이틀+✕, 중간 `AdminNav`(자체 overflow-y-auto),
  하단 "← 사용자 화면으로" — 데스크톱 사이드바 구성 미러.

### `app/admin/layout.tsx` (수정)

- 모바일 헤더(`md:hidden`)에 `AdminMobileNav` 추가 (☰ + 타이틀 + EnvBanner).
- 데스크톱 aside·뱃지 조회 로직 변경 없음.

### 테이블 래퍼 (6개 파일 수정)

`<div className="overflow-x-auto"><table …>…</table></div>` 로 감싸고, 날짜 셀 등
줄바꿈되면 어색한 셀에 `whitespace-nowrap` 보강 (payments 페이지의 기존 패턴 미러):

- `app/admin/errors/page.tsx`
- `app/admin/errors/[key]/page.tsx` (최근 발생 목록)
- `app/admin/readings/page.tsx`
- `app/admin/inquiries/page.tsx`
- `app/admin/sensitive/page.tsx`
- `app/admin/fortune-refunds/page.tsx`

### 대시보드 그리드 (`app/admin/page.tsx` 수정)

- 오늘/전체/연애 상담: `grid-cols-2 md:grid-cols-3` → `grid-cols-1 md:grid-cols-3`
- 별 소모: `grid-cols-2 md:grid-cols-5` → `grid-cols-1 md:grid-cols-5`
- 처리 대기: `grid-cols-2` 유지

### 필터 탭 줄

`readings`(4칩)·`inquiries`(3칩) 의 `flex gap-2` 에 `flex-wrap` 보강 — 좁은 화면 줄바꿈 허용.

## 스코프 밖

- 테이블 카드화(이중 렌더), 모바일 헤더 sticky 고정, PWA manifest/아이콘 분리,
  admin 전용 뷰포트 튜닝. 필요해지면 다음 사이클.

## 검증 기준

1. `npm run build` 그린 (로직 변경 없음, 유닛 영향 없음).
2. 로컬 dev + 어드민 토큰 쿠키 + **375px 뷰포트**에서:
   - 드로어 열기 → 그룹 펼침 → 링크 이동 → 자동 닫힘 동작.
   - 13개 어드민 페이지 순회하며 `document.documentElement.scrollWidth <= innerWidth`
     (페이지 가로 오버플로 0) 확인. 테이블은 래퍼 안에서만 스크롤.
   - md 이상(1280px)에서 기존 데스크톱 레이아웃 회귀 없음.
3. dev push → 운영자 폰(설치 PWA)에서 실사용 검증 → 승인 시 prod fast-forward.

## 동반 변경 (같은 세션, 별도 커밋 — 이 스펙 스코프 아님)

대시보드 별 소모 지표 개편: 사주 대화 카드 완전 삭제, 순서 = 타로 대화 / 운세 리포트 /
인챗 업셀 / 연애 상담 / **연애 스킬 소환**(신설). 연애 상담 카드는 스킬 몫(`스킬:*` 상품)을
분리해 패스·연장·스레드만 집계 — 두 카드 합 = relationship 도메인 총액 (중복 없음).
