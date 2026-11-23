# 앱 결제 — 앱 안 별 충전을 애플·구글 결제로(소모성 5종 · 서버 검증 · 환불은 남은 만큼만 회수 · 앱 안 토스 숨김). 스토어 제출의 선행 조건. 스펙 `docs/superpowers/specs/2026-11-23-앱-결제-design.md`

- 마지막 갱신: 2026-11-23 · 자리: 로컬(Claude, 워크트리 `.claude/worktrees/zen-hellman-6b8f50`)

## 목표
앱(웹뷰) 안의 별 충전을 스토어 결제로 바꿔 애플·구글 제출을 막는 결제 문제를 없앤다. 웹 브라우저는 토스 그대로.

## 지금 상태
- 운영자 결정 끝: 직접 구현 · 가격 웹과 같게 · 환불 회수는 남은 만큼만
- 계획 `docs/superpowers/plans/2026-11-23-앱-결제.md`(Task 1~8) 실행 중 — 태스크마다 새 구현 에이전트 + 별도 리뷰(운영자 선택)
- **PR 나누는 법**: 이 브랜치(`claude/app-iap`)가 작업·인계용이고 `HANDOFF.md` 를 가진다. PR 은 CI `handoff-guard` 때문에 `origin/dev` 에서 따로 딴 브랜치(`claude/app-iap-db`·`-server`·`-web`·`-app`)에 그 PR 의 코드만 옮겨 연다. PR 이 머지되면 `origin/dev` 를 이 브랜치에 merge(rebase 금지)
- Task 1(마이그레이션) 끝 → PR #81(`claude/app-iap-db`, base dev) — `@codex review` 요청함, Claude 리뷰는 막는 결함 0(사소한 6건). **운영자 머지 대기**
- Task 2~ 는 이 브랜치에서 진행(서버 PR 은 #81 머지·Supabase dev 체크 success·카나리아 뒤에 연다)
- 운영자 콘솔 준비(애플 유료 앱 계약·Small Business Program·앱 결제 키 / 구글 결제 프로필·15% 구간·서비스 계정·테스터 모집)는 운영자가 진행 중

## 다음 할 일
1. [어디서든] #81 머지 뒤 Supabase dev 체크 success 확인 → 카나리아: anon 키로 `rpc/clawback_stars`·`rpc/admin_store_revenue` POST(정확한 인자) → 401 / 서비스 키 임시 스크립트로 QA봇 잔액 5 → `clawback_stars(…, 8, 'clawback:canary-1')` → `{clawed 5, shortfall 3, balance_after 0}` → 다시 → `idempotent true`. (dev Management API 키는 읽기 전용이라 트랜잭션 안 시험은 안 된다 — 카나리아가 함수 본문 첫 실행)
2. [어디서든] Task 2~5 서버 PR → Task 6 웹 PR
3. [로컬에서] Task 7 앱(첫 단계가 expo-iap SDK 58 관문) → Task 8 실기기 샌드박스
- 리뷰에서 넘겨받은 것(Task 4 에서 처리): 별 내역 화면이 `refund` 를 +N 으로 보인다(`app/api/stars/transactions/route.ts`·`lib/wallet-history.ts`) — 회수는 음수로, 0 짜리 표시 행은 숨김 / 멱등 재호출의 shortfall 은 덮어쓰지 않기

## 확인 못 한 것
- `clawback_stars` 본문 실행(카나리아 전) · 애플 원화 가격 단계에 ₩2,800·₩11,000 이 있는지 · 한국 구글 수수료 15% 체계 · `expo-iap` 의 Expo SDK 58 호환

## 건드리면 안 되는 것
- 웹 브라우저의 토스 결제 흐름·별 패키지 상수 값 · 웹 어드민 토스 환불의 별 처리(범위 밖)
- 별 잔액은 `lib/stars` 래퍼로만, RPC 직접 호출 금지
