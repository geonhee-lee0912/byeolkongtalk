# 광고 어트리뷰션 + 상품별 집계 + 애널리틱스 대시보드 — 설계

> 어드민 콘솔(Phase 4d, 이미 구축됨) 위에 세 가지를 얹는다:
> ① 유입 출처(first-touch) 캡처, ② 상품별/소재별 집계, ③ 애널리틱스 대시보드.
> 메타 광고 지표는 **선택적 수동 입력**으로 겹쳐 본다. 자체 데이터만으로도 전부 동작한다.

작성일: 2026-07-05
선행 노트: `docs/superpowers/specs/2026-07-05-ad-attribution-analytics-notes.md`

---

## 1. 목표 / 비목표

**목표**
- 신규 유저의 **first-touch 유입 출처**(utm/fbclid/landing)를 가입 시 1회 저장.
- 소재(utm_content)별 **가입→무료체험→첫결제→재결제 퍼널**과 **코호트 LTV/리텐션**을 어드민에서 조회.
- **상품별 집계**(고민톡 고민 분류별 · 운세 리포트 종류별 · 별 구매 상품별) — 현재 전무.
- 메타 지출을 **선택적으로 수동 입력**해 CAC/ROAS를 우리 실매출 기준으로 계산.

**비목표**
- 메타 마케팅 API 자동 수집 — 이번 빌드 제외(스키마는 후속 교체 가능하게 설계).
- 야간 롤업 테이블 / 외부 BI — 조회 시점 집계로 충분(현 규모).
- last-touch / 멀티터치 어트리뷰션 — first-touch 1회 저장만.
- 차트 라이브러리 도입 — 직접 만든 SVG + CSS 그리드로 처리.

---

## 2. 아키텍처 개요

- **접근 A(조회 시점 집계)**: 신규 데이터 테이블 2개(`user_acquisition`, `ad_spend`)만 추가.
  퍼널·코호트·상품별·CAC/ROAS는 API 라우트가 `users`/`readings`/`payments`를 조인해 SQL로 그때그때 계산.
- 인증·레이아웃은 기존 어드민 그대로 재사용(`requireAdmin`, `admin_actions`, DEV/PROD 배너, noindex).
- **메타 지출 비의존성(핵심 요구)**: `ad_spend`가 비어 있어도 모든 화면이 동작. CAC/ROAS 컬럼만 지출이 있을 때 채워지고, 없으면 `—` 표시.

---

## 3. 데이터 모델 (신규 마이그레이션 2개)

### 3.1 `user_acquisition` — first-touch 유입 (users와 1:1, write-once)
```
user_acquisition (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  utm_source     TEXT,
  utm_medium     TEXT,
  utm_campaign   TEXT,
  utm_content    TEXT,      -- 소재 키. ad_spend.creative_key 와 조인
  utm_term       TEXT,
  fbclid         TEXT,
  fbc            TEXT,       -- _fbc 쿠키 값 (분석용 보관)
  landing_variant TEXT,     -- /start variant (counsel|daily|tarot) 등
  referrer       TEXT,
  first_seen_at  TIMESTAMPTZ,   -- 쿠키가 최초 기록된 시각
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
)
```
- RLS: service_role 전용.
- PK가 곧 user_id → 유저당 1행 보장(재삽입 없음 = first-touch 보존).
- ON DELETE CASCADE → 탈퇴 시 자동 정리.

### 3.2 `ad_spend` — 메타 지출 수동 입력 (선택)
```
ad_spend (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date   DATE NOT NULL,
  platform     TEXT NOT NULL DEFAULT 'meta',
  campaign     TEXT,
  adset        TEXT,
  creative_key TEXT,       -- utm_content 과 매핑 (소재별 CAC/ROAS 조인)
  impressions  INTEGER,
  clicks       INTEGER,
  spend_won    INTEGER NOT NULL,
  reach        INTEGER,
  note         TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spend_date, platform, campaign, adset, creative_key)
)
```
- RLS: service_role 전용.
- UNIQUE로 같은 날 같은 소재 중복 방지. 재입력은 upsert.

---

## 4. 어트리뷰션 캡처 흐름

### 4.1 캡처 (클라이언트, 사이트 전역 first-touch)
- 기존 `AuthBootstrap` 컴포넌트에 이펙트 추가:
  - URL에 `utm_*`/`fbclid` 중 하나라도 있고 **`byeolkong_acq` 쿠키가 아직 없으면** 쿠키에 JSON 기록
    (`utm_*`, `fbclid`, `document.referrer`, `first_seen_at`, 그리고 `/start`면 `landing_variant`).
  - 쿠키가 이미 있으면 **덮어쓰지 않음**(first-touch 보존). 만료 예: 30일.
  - UTM/fbclid 없는 오가닉 진입은 아무것도 기록하지 않음.
- `fbc`는 기존 `_fbc` 쿠키에서 읽어 함께 저장(있으면).

### 4.2 저장 (서버, 신규 유저 생성 시)
- `app/api/auth/kakao/route.ts`의 신규 유저 insert 직후(현재 ~104줄):
  - `byeolkong_acq` 쿠키를 읽어 `user_acquisition` 행 insert(신규 유저에 한함).
  - insert 후 `byeolkong_acq` 쿠키 삭제(1회성).
  - 쿠키 없으면(오가닉) 아무것도 안 함.
- 익명→카카오 마이그레이션 경로도 동일 지점에서 처리(신규 users 행이 생기는 곳이면 동일 로직).
- 파싱/유효성: utm 값 길이 cap, 알 수 없는 필드 무시(방어적).

---

## 5. 애널리틱스 대시보드 (`/admin/analytics`)

기존 `/admin` 대시보드(총합 KPI)는 유지. 신규 섹션을 사이드바에 추가.
기간 토글(7 / 30 / 90일) 공유. 차트는 직접 만든 SVG, 코호트는 CSS 그리드 히트맵.

### 5.1 추세 라인차트
- 일별 **가입 / 리딩 / 매출** 라인(선택 기간). 데이터: `users`/`readings`/`payments(completed)` 일자 group-by.

### 5.2 소재별 퍼널 + CAC/ROAS
- `user_acquisition.utm_content` 그룹별 컬럼:
  `소재 | 가입 | 무료체험 | 첫결제 | 재결제 | 가입→첫결제% | 지출 | CAC | 매출 | ROAS`
- 퍼널 정의:
  - **가입**: 해당 소재의 `user_acquisition` 유저 수.
  - **무료체험**: 그 유저 중 `readings` 1건 이상(무료 포함).
  - **첫결제**: 그 유저 중 `payments.status='completed'` 1건 이상.
  - **재결제**: 그 유저 중 completed 결제 2건 이상.
- 메타 조인: `ad_spend.creative_key = utm_content` 합계.
  - **CAC** = 지출 / 가입 (지출 없으면 `—`).
  - **매출** = 그 소재 유저들의 completed 결제 합(누적 실매출).
  - **ROAS** = 매출 / 지출 (지출 없으면 `—`). 메타의 첫구매-only ROAS가 아닌 실매출 기준.
- `utm_content`이 없는 유저(오가닉)는 `(organic)` 행으로 묶어 표시.

### 5.3 코호트 LTV / 리텐션
- **가입 주차** 코호트별:
  - 누적 결제액(유저 평균) 매트릭스: 코호트 × 경과 주차(0~N).
  - 재방문율 D1/D7/D30: `last_login` 또는 `readings.created_at` 기준 재활동.
- CSS 그리드 히트맵(값 클수록 진한 셀). "무료 훅 이후 유료 회수" 판단용.

---

## 6. 상품별 집계 (`/admin/analytics` 내 블록 또는 하위 탭)

현재 전무. 조회 시점 group-by. 라벨은 기존 상수에서 복원.

### 6.1 고민톡 — 고민 분류별
- 대상: `readings`에서 **운세가 아닌** 상담. 판별: `emotion_tag`가 `fortune:`로 **시작 안 함**.
- 그룹: `emotion_tag`(한글 감정 태그, `lib/emotions.ts` `EMOTION_OPTIONS`) × `consultation_type`(saju/tarot).
- 지표: 건수 · 유료 건수(stars_spent>0) · 소진 별 합.

### 6.2 운세 리포트 — 종류별
- 대상: `emotion_tag LIKE 'fortune:%'`. 종류 = `fortuneTypeFromTag()` (10종: daily/monthly/saju_full/tarot_daily/tarot_love/tarot_money/tarot_career/tarot_relation/compat/compat_social).
- 지표: 종류별 건수 · 무료/유료 비중 · 소진 별 합. 라벨은 `lib/fortune/types.ts` `FORTUNE_CONFIG`.
- (참고) 사주 상담은 `saju_product` 4종(today_letters/nature/choice/good_days)별로도 함께 표기.

### 6.3 별 구매 — 상품별
- 대상: `payments.status='completed'`. 그룹: `package_type`(star_10/30/70/150/300).
- 지표: 판매 건수 · 매출 합(amount_won) · 매출 비중. 라벨은 `lib/constants.ts` `STAR_PACKAGES`.

---

## 7. 메타 지출 입력 화면 (`/admin/ads`) — 선택 기능

- 일자별 지출 행 목록 + 인라인 추가/수정 폼(`spend_date`, campaign, adset?, creative_key, impressions, clicks, spend_won, reach?, note).
- 저장은 upsert(UNIQUE 충돌 시 갱신). 모든 write는 `admin_actions`(action='ad_spend_upsert') 기록 + Origin 검증(CSRF).
- creative_key 입력 도우미: 최근 90일 `user_acquisition`에 실재한 `utm_content` 목록을 제안(오타/미스매치 방지).

---

## 8. API 라우트 (신규)

```
app/api/admin/
  analytics/trends/route.ts    GET   ?days=  일별 가입/리딩/매출
  analytics/funnel/route.ts    GET   ?days=  소재별 퍼널 + ad_spend 조인 CAC/ROAS
  analytics/cohorts/route.ts   GET           가입 주차 코호트 LTV/리텐션
  analytics/products/route.ts  GET   ?days=  §6 상품별 집계 3종 묶음
  ads/route.ts                 GET/POST      지출 목록 / upsert
  ads/[id]/route.ts            DELETE        지출 행 삭제
```
- 전부 `requireAdmin` 가드. write는 Origin 검증 + `admin_actions` 기록.
- 조회는 service_role로 집계. 운영 규모 커져 느려지면 해당 쿼리만 SQL view/RPC로 승격(후속).

---

## 9. 사이드바 / 화면

- 신규 nav: `📈 애널리틱스`(§5·§6), `📣 광고 지출`(§7).
- 기존 `/admin` 대시보드는 그대로(빠른 오늘/주간 요약 진입점).

---

## 10. 개인정보 / 약관 (논블로킹 — 출시 전 확인)

- 유입 출처(utm/fbclid/referrer) 수집은 개인정보처리방침에 "서비스 개선·마케팅 분석 목적의 접속/유입 정보 수집" 한 줄 추가가 필요할 수 있음.
- 코드 작업 아님. 출시 전 legal 체크 항목으로만 기록.

---

## 11. 구현 순서

1. 마이그레이션 2개(`user_acquisition`, `ad_spend`).
2. 어트리뷰션 캡처(AuthBootstrap 쿠키) + 저장(kakao 콜백) — **광고 켜기 전에 먼저 배포**해야 초기 유입이 귀속됨.
3. `/api/admin/analytics/products` + 상품별 집계 블록(§6) — 자체 데이터만, 의존성 없음. 즉시 유용.
4. `analytics/trends` + 추세 차트(§5.1).
5. `analytics/funnel` + 소재별 퍼널(§5.2, CAC/ROAS는 지출 없으면 `—`).
6. `analytics/cohorts` + 코호트 히트맵(§5.3).
7. `/admin/ads` 지출 입력(§7) — 마지막(선택 기능).

---

## 12. 검증 기준

- 광고 클릭(utm 포함 URL)으로 진입 → 카카오 신규 가입 → `user_acquisition`에 해당 utm 1행 저장 확인. 오가닉(utm 없음) 가입은 행 미생성 확인.
- 기존 유저 재로그인 시 `user_acquisition` 덮어쓰기 안 됨(first-touch 보존) 확인.
- 상품별 집계 3종의 합이 목록/총합과 일치(고민톡+운세 리딩 합 = 전체 리딩, 별 구매 매출 합 = 대시보드 매출).
- `ad_spend` 비어 있을 때 퍼널/코호트/상품 화면 정상, CAC/ROAS만 `—`. 지출 입력 후 소재별 CAC/ROAS 채워짐.
- dev/prod 각 배포에서 자기 환경 DB만 조회(교차 없음).
