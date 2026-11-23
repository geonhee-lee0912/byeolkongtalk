# 앱 결제 — 앱 안 별 충전을 애플·구글 결제로(소모성 5종 · 서버 검증 · 환불은 남은 만큼만 회수 · 앱 안 토스 숨김). 스토어 제출의 선행 조건. 스펙 `docs/superpowers/specs/2026-11-23-앱-결제-design.md`

- 마지막 갱신: 2026-11-23 · 자리: 로컬(Claude, 워크트리 `.claude/worktrees/zen-hellman-6b8f50`)

## 목표
앱(웹뷰) 안의 별 충전을 스토어 결제로 바꿔 애플·구글 제출을 막는 결제 문제를 없앤다. 웹 브라우저는 토스 그대로.

## 지금 상태
- 계획 `docs/superpowers/plans/2026-11-23-앱-결제.md` Task 1~7 코드 끝(태스크마다 구현 + 별도 리뷰). Task 8(실기기) 남음
- **PR 나누는 법**: 이 브랜치(`claude/app-iap`)가 작업·인계용이고 `HANDOFF.md` 를 가진다. PR 은 CI `handoff-guard` 때문에 `origin/dev` 에서 딴 브랜치에 그 PR 코드만 옮겨 연다. 머지되면 `origin/dev` 를 이 브랜치에 merge(rebase 금지)
- PR 현황
  - #81 DB(회수 함수·결제 칸·매출 집계) — 머지 · dev 적용 · 카나리아 통과(anon 401 · 남은 만큼만 회수 · 멱등 · 형식 틀린 id 거절)
  - #83 서버(공용 지급 · `GET/POST /api/payment/iap` · 애플·구글 환불 알림 · 어드민 스토어 매출) — 머지
  - #86 #83 후속(환불은 실제로 준 별만 회수 · 환불된 결제엔 재충전 안 함) — 머지
  - #87 서버 후속(앱 ID 를 env `IAP_APP_ID` 로 — 비우면 운영 번들 · 결제창 전에 스토어 설정 확인) — 머지 대기
  - #84 웹(앱 안 상점·충전 시트 → 스토어 결제, 브라우저는 토스 그대로) — 머지 대기
  - #85 앱(expo-iap · 구매 흐름 · 미완료 거래 재전송 · 앞으로 돌아올 때 재전송) — #84 위에 쌓음(base `claude/app-iap-web`), 머지 대기
  - **머지 순서: #87 → #84 → #85**
- 전체 브랜치 최종 리뷰 끝(돈 흐름 중복 지급·과회수 없음) → 지적 수정 묶음까지 재리뷰 승인. 남은 사소한 것: 재전송이 구매 확인과 겹치면 웹에 첫충전 보너스가 0 으로 보일 수 있음 · 이미 가진 상품 재전송이 ok 가 아니면 늘 '실패' 문구 · 로그인 직후 재전송이 로그인 전 회원 기준 작업에 묶여 다음 앞으로 돌아올 때로 밀림(전부 돈 영향 없음)

## 다음 할 일
1. [어디서든] #87 → #84 → #85 머지(운영자) · 각 PR 의 Codex 리뷰 지적 처리 · 머지되면 `origin/dev` 를 이 브랜치에 merge
2. [로컬에서] Task 8 실기기 — 운영자: 두 스토어에 소모성 상품 5개(ID = 패키지 id, 가격 웹과 같게) · 애플 샌드박스 테스터 · 구글 라이선스 테스터 · 애플 서버 알림 v2 URL · 구글 RTDN Pub/Sub 푸시 구독(인증 켬) · Vercel env 7개(`APPLE_IAP_KEY_ID`·`APPLE_IAP_ISSUER_ID`·`APPLE_IAP_PRIVATE_KEY`·`APPLE_APP_ID`·`GOOGLE_PLAY_SERVICE_ACCOUNT`·`GOOGLE_PUBSUB_PUSH_EMAIL`·`GOOGLE_PUBSUB_AUDIENCE`) · EAS 개발용 빌드 1회. 확인표는 #85 본문 8줄(첫 줄 = 가격 5개가 뜨는지 = expo-iap SDK 58 관문)
3. 끝나면 HANDOFF 삭제 · ROADMAP '끝남'

## 운영자가 정할 것 (작업은 안 막음)
- **TestFlight·라이선스 테스터 무료 별**: "샌드박스도 별 지급"(심사자 구매용) 때문에 운영 앱으로 시험하는 사람은 운영 계정에 별을 무료로 얻는다(₩0 행). 외부 테스터 안 쓰기 / 운영 계정 샌드박스 지급 상한·허용 목록 / 어드민 감시 중 하나 — 운영 비밀값을 넣기 전에(#83 Codex 보안 P2 와 같은 건)
- **실기기 시험 자리**(#87 본문): (a) dev — Vercel Preview `IAP_APP_ID=com.byeolkongtalk.app.dev` + `.dev` 용 애플 앱 레코드·구글 앱(내부 테스트 트랙)·상품 5개·그 앱의 숫자 `APPLE_APP_ID`. dev 는 Vercel 접근 보호 뒤라 애플·구글 알림 주소에 보호 우회값 쿼리를 붙이고 Pub/Sub audience 를 명시해 `GOOGLE_PUBSUB_AUDIENCE` 와 같게 / (b) 운영 배포 뒤 운영 앱으로(env 불필요, 샌드박스 알림 주소도 운영). 시험은 Xcode StoreKit 설정 파일 말고 샌드박스 계정으로(로컬 거래는 서버 API 에 없다)
- 샌드박스·라이선스 테스터의 ₩0 결제가 어드민 '결제자' 지표에 섞일 수 있다(의심) — 위 TestFlight 결정과 같이
- 플레이 콘솔에서 한 번에 여러 개 구매가 꺼져 있는지 · `GOOGLE_PUBSUB_AUDIENCE` 는 푸시 구독 값과 정확히 같게
- 손으로 별을 메울 때(`CRITICAL_PAYMENT_RECONCILE`) 먼저 `PAYMENT_RECONCILE_SELF_HEALED` 가 있는지 볼 것
- 운영 배포 순서: 웹(#84)이 운영에 나가면 `iap` 를 가진 앱 빌드 전까지 앱 안 충전이 막힌다(지금 출시 앱 없음 — 앱 결제 빌드와 같이)
- `npx expo-doctor` 가 다른 패키지 15개 버전 뒤처짐을 알린다(원래 있던 것) — 빌드 전에 맞출지

## 확인 못 한 것
- 진짜 애플·구글 응답으로 한 번도 안 돌렸다(비밀값·상품 없음) · expo-iap 의 SDK 58 실빌드 · 애플 원화 가격 단계(₩2,800·₩11,000) · 구글 라이선스 테스터 구매에 orderId 가 늘 있는지 · iOS 취소 알림이 1.5초 안에 오는지 · iOS 미완료 소모성 거래가 `getPendingTransactionsIOS` 로 오는지

## 건드리면 안 되는 것
- 웹 브라우저의 토스 결제 흐름·별 패키지 상수 값 · 웹 어드민 토스 환불의 별 처리(범위 밖)
- 별 잔액은 `lib/stars` 래퍼로만, RPC 직접 호출 금지
