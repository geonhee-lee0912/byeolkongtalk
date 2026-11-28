# 어드민 총 개선 — 이번 조각: 앱/웹 구분 + 실제 결제자 줄

- 마지막 갱신: 2026-11-28 · 자리: 로컬(Claude, 워크트리 tarot-share-notice)

## 목표
앱 출시 날부터 어드민에서 앱과 웹의 방문·가입·결제를 나눠 본다. 대시보드 결제율(신규 48시간 안 첫 결제만 셈) 아래에 그 기간 실제 결제자 전체를 붙인다. 설계 `docs/superpowers/specs/2026-11-28-어드민-앱웹-구분-design.md`.

## 지금 상태
- 설계 승인(운영자 11-28). 계획 `docs/superpowers/plans/2026-11-28-어드민-앱웹-구분.md` Task 1~4 코드 완료.
- 마이그레이션(새 RPC 3개)만 PR #98(브랜치 `claude/admin-app-web-rpc`) — 운영 인라인 대조 통과, Codex 깨끗, Claude 리뷰 nit 1(머지 뒤 dev 적용 확인). 머지 대기(운영자).
- 이 브랜치: 변환 함수·대시보드·트래픽 화면. 전체 테스트·tsc·build 통과. 화면 캡처는 #98 이 dev 에 적용된 뒤.

## 다음 할 일
1. [어디서든] #98 머지 뒤 dev Supabase 워크플로 성공 + 세 함수 존재 확인 → anon 키로 정확한 인자 호출 401(카나리아)
2. [로컬에서] dev 서버로 `/admin`·`/admin/traffic` 폰·PC 캡처 → 이 브랜치 PR(base dev) → `@codex review`

## 확인 못 한 것
- 앱 실사용 데이터는 출시 전이라 시험 기기뿐이다.

## 건드리면 안 되는 것
- 로그인·가입 코드, `users` 표 구조, 기존 `admin_pay_rate`·`admin_traffic_*` RPC.
- 워크트리의 추적 안 되는 `docs/app-store/` 는 다른 작업 것 — 커밋하지 않는다.
