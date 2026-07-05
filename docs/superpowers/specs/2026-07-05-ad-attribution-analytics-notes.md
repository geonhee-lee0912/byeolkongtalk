# 광고 어트리뷰션 & 자체 어드민 분석 — 설계 노트 (2026-07-05)

> 상태: **브레인스토밍 초기 정리만.** 다음 세션에서 이어서 clarifying → spec → plan 진행 예정. 구현 착수 X.

## 배경 / 현재 상태 (코드 확인 결과)

- **획득 출처를 아무 데도 저장하지 않음.** `utm_content`는 `app/start/page.tsx`에서 랜딩 variant 분기용으로만 읽고 버려짐. `users` 테이블에 유입 출처 컬럼 없음 (`id, kakao_id, nickname, profile_img, created_at, last_login`).
- `payments`: `user_id`만 연결, 소재/캠페인 연결 없음 (`pg_provider, pg_tid, amount_won, stars_given, package_type, status`).
- 메타 CAPI는 전환 이벤트(CompleteRegistration/StartTrial/Purchase)를 external_id(해시 userId)로 보내지만, **우리 DB엔 그 유저가 어느 소재로 왔는지 기록이 없음.**
- 자체 어드민 분석 화면 없음. Phase 4(d) 어드민 콘솔은 미착수 부채.

## 메타 광고 어드민이 보여주는 것 vs 갭

**Ads Manager (집계)**: 노출/도달/빈도, CTR/CPC/CPM/지출, 전환 건수+CPA+ROAS, 소재·지면·연령/성별/지역 브레이크다운, Purchase 금액.
**Events Manager**: 이벤트 수신·매칭품질·중복제거·진단.

**메타가 못 보는 것 (= 우리 갭)**:
1. 개인 단위 "소재→가입→결제→재결제" 추적 (개인정보라 집계만 제공)
2. 어트리뷰션 윈도우(기본 7d click/1d view) 밖 지연 전환
3. LTV·리텐션·코호트·재구매 (메타는 "첫 전환"까지만)
4. 무료 훅(웰컴 30별) 이후 유료 전환 퍼널 — 우리 LTV 회수 모델의 핵심

## 우리가 수집하면 좋은 것 (우선순위)

- **A. 획득 출처 캡처 (전제조건, 지금 0)** — 가입 시 `utm_source/medium/campaign/content` + `fbclid` + landing variant를 users(또는 `user_acquisition` 별도 테이블)에 1회 저장. A 없이는 B·C·D를 소재별로 못 쪼갬.
- **B. 소재별 퍼널 전환율** — utm_content별 가입→무료리딩→첫결제→재결제 전환율·소요시간.
- **C. 코호트 LTV / 리텐션** — 가입 주차 코호트 D1/D7/D30 재방문 + 누적 결제액 → 실 CAC 회수 판단.
- **D. 재화·상담 행동** — 별 소진 패턴, 무료→유료 트리거, 첫 결제까지 리딩 수.

## 권장 접근 (2단계)

1. **A 먼저 (작은 작업)** — 광고 켜기 전에 캡처부터 있어야 유입 데이터가 쌓임. 안 그러면 초기 유입은 영영 소재 귀속 불가.
2. **B/C/D 대시보드** — Phase 4(d) 어드민 콘솔과 통합해 소재별 퍼널·코호트 조회 화면.

## 다음 세션에서 풀 열린 질문 (clarifying)

1. **저장 위치**: `users`에 컬럼 추가 vs `user_acquisition` 1:1 테이블 (후자가 깔끔 — 재가입/탈퇴 원장과의 관계도 고려).
2. **로그인 왕복 문제 (핵심 구현 seam)**: utm은 `/start`에서 비로그인 상태에 잡히고, 유저 row 생성은 카카오 콜백(`app/api/auth/kakao/route.ts`)에서 일어남. → utm을 쿠키/sessionStorage로 실어 로그인 왕복을 넘긴 뒤 콜백에서 신규 유저 생성 시 저장해야 함. 익명→카카오 마이그레이션 경로도 확인.
3. **어트리뷰션 모델**: last-touch 단순 저장 vs first-touch 보존. MVP는 first-touch(가입 시점) 1회 저장 권장.
4. **fbclid 활용**: 저장만 할지, CAPI fbc로도 쓸지(이미 capiSignalsFromRequest가 _fbc 쿠키 읽음 — 중복 확인).
5. **개인정보/약관**: 유입 데이터 수집이 개인정보처리방침 범위 내인지.
6. **대시보드 범위**: 별도 지표 페이지 vs Phase 4(d) 어드민 콘솔 통합.

## 연관
- Phase 4(d) 어드민 콘솔(미착수)과 통합 대상.
- 기존 트래킹: `lib/meta-capi.ts`, `components/analytics/MetaPixel.tsx`, 전환 발화처 = `api/auth/kakao`(가입), `api/fortune/create`·`api/consultations/{saju,tarot}/chat`(체험), `api/payment/confirm`(구매).
